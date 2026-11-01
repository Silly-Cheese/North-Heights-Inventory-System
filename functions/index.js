import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

initializeApp();
const db = getFirestore();
const bootstrapSecret = defineSecret('NH_BOOTSTRAP_SECRET');
const REGION = 'us-central1';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const approvedRoles = new Set(['inventory', 'member']);
const ALLOWED_SPACES = new Set(['test', 'official']);

function requiredUser(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in before continuing.');
  return request.auth.uid;
}
async function ownerUser(request) {
  const uid = requiredUser(request);
  const snap = await db.doc('authorizedUsers/' + uid).get();
  if (!snap.exists || snap.data().active === false || snap.data().role !== 'owner') {
    throw new HttpsError('permission-denied','Only the owner may manage invitations and accounts.');
  }
  return uid;
}
function normalizedCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
}
function inviteHash(raw) {
  return createHash('sha256').update(normalizedCode(raw)).digest('hex');
}
function makeCode() {
  const bytes = randomBytes(20);
  const chars = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).slice(0,20).join('');
  return chars.match(/.{1,5}/g).join('-');
}
function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x,y);
}
function cleanName(value) {
  const name = String(value||'').trim().slice(0,80);
  if(name.length<2) throw new HttpsError('invalid-argument','Please enter your name.');
  return name;
}

export const getSetupStatus = onCall({ region:REGION, enforceAppCheck:false }, async () => {
  const snap = await db.doc('system/bootstrap').get();
  return { ownerCreated: snap.exists };
});

export const bootstrapOwner = onCall({ region:REGION, secrets:[bootstrapSecret], maxInstances:4 }, async request => {
  const uid = requiredUser(request);
  const token = String(request.data?.bootstrapCode || '');
  const expected = bootstrapSecret.value();
  if(!expected || token.length < 20 || !safeEqual(token,expected)) {
    throw new HttpsError('permission-denied','Incorrect owner bootstrap code.');
  }
  const user = await getAuth().getUser(uid);
  if (!user.email) throw new HttpsError('failed-precondition','An email address is required.');
  const name=cleanName(request.data?.displayName);
  const status=db.doc('system/bootstrap');
  const member=db.doc('authorizedUsers/'+uid);
  await db.runTransaction(async t => {
    if((await t.get(status)).exists) throw new HttpsError('already-exists','The owner has already been initialized.');
    t.create(status,{ownerUid:uid,initializedAt:FieldValue.serverTimestamp()});
    t.set(member,{uid,email:user.email.toLowerCase(),displayName:name,role:'owner',active:true,createdAt:FieldValue.serverTimestamp()});
  });
  return {ok:true};
});

export const createInvite = onCall({ region:REGION, maxInstances:6 }, async request => {
  const uid=await ownerUser(request);
  const role=String(request.data?.role||'');
  if(!approvedRoles.has(role)) throw new HttpsError('invalid-argument','Choose inventory collaborator or read-only member.');
  const email=String(request.data?.email||'').trim().toLowerCase();
  if(email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254)) throw new HttpsError('invalid-argument','Enter a valid email address.');
  const code=makeCode();
  const ref=db.collection('invites').doc(inviteHash(code));
  await ref.create({role,email:email||null,createdBy:uid,createdAt:FieldValue.serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+7*24*60*60*1000),redeemedBy:null,redeemedAt:null,revoked:false});
  return {code,role,email,expiresInDays:7};
});

export const redeemInvite = onCall({ region:REGION, maxInstances:20 }, async request => {
  const uid=requiredUser(request);
  const code=normalizedCode(request.data?.code);
  if(code.length!==20) throw new HttpsError('invalid-argument','Enter the complete 20-character authorization code.');
  const user=await getAuth().getUser(uid);
  if(!user.email) throw new HttpsError('failed-precondition','An email address is required.');
  const name=cleanName(request.data?.displayName);
  const invite=db.doc('invites/'+inviteHash(code));
  const member=db.doc('authorizedUsers/'+uid);
  await db.runTransaction(async t => {
    const [entry,existing]=await Promise.all([t.get(invite),t.get(member)]);
    if(existing.exists) throw new HttpsError('already-exists','This account already has authorization.');
    if(!entry.exists) throw new HttpsError('permission-denied','Invalid authorization code.');
    const data=entry.data();
    if(data.revoked || data.redeemedBy || !data.expiresAt || data.expiresAt.toMillis()<Date.now()) {
      throw new HttpsError('permission-denied','This code has been used, revoked, or expired.');
    }
    if(data.email && data.email !== user.email.toLowerCase()) {
      throw new HttpsError('permission-denied','This authorization code belongs to another email address.');
    }
    if(!approvedRoles.has(data.role)) throw new HttpsError('permission-denied','Invalid invitation role.');
    t.create(member,{uid,email:user.email.toLowerCase(),displayName:name,role:data.role,active:true,createdAt:FieldValue.serverTimestamp(),invitedBy:data.createdBy});
    t.update(invite,{redeemedBy:uid,redeemedAt:FieldValue.serverTimestamp()});
  });
  return {ok:true};
});

export const revokeInvite = onCall({region:REGION},async request=>{
  await ownerUser(request);
  const id=String(request.data?.inviteId||'');
  if(!/^[a-f0-9]{64}$/.test(id)) throw new HttpsError('invalid-argument','Invalid invitation identifier.');
  await db.doc('invites/'+id).update({revoked:true});
  return {ok:true};
});

export const disableMember = onCall({region:REGION},async request=>{
  const owner=await ownerUser(request);
  const uid=String(request.data?.uid||'');
  if(!uid || uid===owner) throw new HttpsError('invalid-argument','You cannot disable your own owner account.');
  const ref=db.doc('authorizedUsers/'+uid);
  const snap=await ref.get();
  if(!snap.exists || snap.data().role==='owner') throw new HttpsError('failed-precondition','Cannot disable this account.');
  await ref.update({active:false,disabledAt:FieldValue.serverTimestamp(),disabledBy:owner});
  await getAuth().revokeRefreshTokens(uid);
  return {ok:true};
});

async function processInventoryChange(event,kind){
  const {space,recordId}=event.params;
  if(!ALLOWED_SPACES.has(space) || !['rooms','items'].includes(kind)) return;
  const before=event.data.before.exists ? event.data.before.data():null;
  const after=event.data.after.exists ? event.data.after.data():null;
  if(!before && !after) return;
  // Test data is disposable. Do not recreate activity entries during bulk test resets.
  if(space==='test' && !after) return;
  const operation=!before?'created':!after?'deleted':'updated';
  if(before && after) {
    const clean=(value)=>{if(!value) return null;const copy={...value};delete copy.updatedAt;return JSON.stringify(copy);};
    if(clean(before)===clean(after)) return;
  }
  const changedKeys=[];
  if(before && after) {
    for(const key of new Set([...Object.keys(before),...Object.keys(after)])) {
      if(key==='updatedAt') continue;
      const a=before[key], b=after[key];
      if(JSON.stringify(a)!==JSON.stringify(b)) changedKeys.push(key);
    }
  }
  const author=(after?.updatedBy || after?.createdBy || before?.updatedBy || before?.createdBy || null);
  const eventData={recordType:kind==='items'?'item':'room',recordId,operation,recordName:after?.name || before?.name || '',
    actorUid:operation==='deleted'?null:author,
    changedKeys:changedKeys.slice(0,40),beforeQuantity:before?.quantity??null,afterQuantity:after?.quantity??null,roomId:after?.roomId||before?.roomId||null,
    createdAt:FieldValue.serverTimestamp()};
  await db.collection('workspaces').doc(space).collection('activity').add(eventData);
  if(kind==='items' && before && after &&
      (before.quantity!==after.quantity || before.roomId!==after.roomId || before.name!==after.name || before.condition!==after.condition || Boolean(before.deletedAt)!==Boolean(after.deletedAt))) {
    const decisionRef=db.doc('workspaces/'+space+'/dispositions/'+recordId);
    await db.runTransaction(async tx=>{
      const decision=await tx.get(decisionRef);
      if(decision.exists && decision.data().status==='approved'){
        tx.update(decisionRef,{status:'needs-review',updatedAt:FieldValue.serverTimestamp(),
          reviewNote:'Item quantity, room, or deletion status changed after approval. Re-proposal required.'});
        tx.create(db.collection('workspaces').doc(space).collection('dispositionEvents').doc(),{
          itemId:recordId,itemName:after.name||before.name||'',
          action:'needs-review',version:decision.data().version,actorUid:null,
          createdAt:FieldValue.serverTimestamp()
        });
      }
    });
  }
  // An edited item invalidates a previously verified room. This preserves the review workflow.
  if(kind==='items') {
    const related=new Set([before?.roomId,after?.roomId].filter(Boolean));
    for(const id of related) {
      const room=db.doc('workspaces/'+space+'/rooms/'+id);
      await db.runTransaction(async tx=>{
        const roomSnap=await tx.get(room);
        if(!roomSnap.exists) return;
        const data=roomSnap.data();
        if(!data.deletedAt && data.status==='verified') {
          tx.update(room,{status:'in-progress',verifiedAt:null,verifiedBy:null,
            reviewNote:'Inventory changed after verification; recheck required.',
            updatedAt:FieldValue.serverTimestamp(),updatedBy:'system'});
        }
      });
    }
  }
}
export const onRoomChange = onDocumentWritten({
  region:REGION,document:'workspaces/{space}/rooms/{recordId}',maxInstances:10
},event=>processInventoryChange(event,'rooms'));
export const onItemChange = onDocumentWritten({
  region:REGION,document:'workspaces/{space}/items/{recordId}',maxInstances:10
},event=>processInventoryChange(event,'items'));


// Phase 3: server-controlled property decisions and immutable inventory snapshots.
// A disposition approval documents authorization in this app; it does not itself
// transfer title, alter a purchase agreement, or physically dispose of property.
const DISPOSITION_TYPES = [
  'retain','include-with-property','donate','sell-separately','dispose'
];
function validatedSpace(value) {
  if(!ALLOWED_SPACES.has(value)) throw new HttpsError('invalid-argument','Choose the test or official workspace.');
  return value;
}
async function editorUser(request) {
  const uid=requiredUser(request);
  const snap=await db.doc('authorizedUsers/'+uid).get();
  const record=snap.data();
  if(!snap.exists || record?.active!==true || !['owner','inventory'].includes(record.role)){
    throw new HttpsError('permission-denied','Inventory editing access required.');
  }
  return {uid,role:record.role};
}
function validatedItemId(value){
  const itemId=String(value||'');
  if(!/^[A-Za-z0-9_-]{8,150}$/.test(itemId))throw new HttpsError('invalid-argument','Invalid item identifier.');
  return itemId;
}
function allocationList(raw){
  if(!Array.isArray(raw)||raw.length!==DISPOSITION_TYPES.length)throw new HttpsError('invalid-argument','Provide quantities for all five disposition categories.');
  const values=DISPOSITION_TYPES.map((type,i)=>{
    const entry=raw[i];
    if(entry?.type!==type || !Number.isSafeInteger(entry.quantity) || entry.quantity<0 || entry.quantity>1000000){
      throw new HttpsError('invalid-argument','Enter valid whole-number quantities for each category.');
    }
    return {type,quantity:entry.quantity};
  });
  if(values.reduce((n,a)=>n+a.quantity,0)===0)throw new HttpsError('invalid-argument','Assign at least one unit.');
  return values;
}
const decisionEvent = (space,docId,fields)=>({
  ref:db.doc('workspaces/'+space+'/dispositionEvents/'+docId),
  fields:{...fields,createdAt:FieldValue.serverTimestamp()}
});
export const proposeDisposition = onCall({region:REGION,maxInstances:20},async request=>{
  const {uid}=await editorUser(request), space=validatedSpace(request.data?.space);
  const id=validatedItemId(request.data?.itemId);
  const allocations=allocationList(request.data?.allocations);
  const notes=String(request.data?.notes||'').trim();
  if(notes.length>2000)throw new HttpsError('invalid-argument','Notes must be 2,000 characters or fewer.');
  const itemRef=db.doc('workspaces/'+space+'/items/'+id);
  const proposalRef=db.doc('workspaces/'+space+'/dispositions/'+id);
  const eventRef=db.collection('workspaces').doc(space).collection('dispositionEvents').doc();
  await db.runTransaction(async tx=>{
    const [itemSnap,existing]=await Promise.all([tx.get(itemRef),tx.get(proposalRef)]);
    if(!itemSnap.exists||itemSnap.data().deletedAt)throw new HttpsError('not-found','This item is not active.');
    const item=itemSnap.data();
    const allocated=allocations.reduce((n,x)=>n+x.quantity,0);
    if(allocated>item.quantity)throw new HttpsError('failed-precondition','Allocated quantity exceeds the current item count.');
    const previous=existing.exists?existing.data():null;
    const version=(previous?.version||0)+1;
    const next={
      itemId:id,roomId:item.roomId,itemName:item.name,itemQuantity:item.quantity,
      allocations,unallocated:item.quantity-allocated,notes,status:'proposed',
      version,createdBy:previous?.createdBy||uid,createdAt:previous?.createdAt||FieldValue.serverTimestamp(),
      submittedBy:uid,updatedBy:uid,updatedAt:FieldValue.serverTimestamp(),
      reviewedBy:null,reviewedAt:null,reviewNote:''
    };
    tx.set(proposalRef,next);
    tx.create(eventRef,{
      itemId:id,itemName:item.name,action:'proposed',version,actorUid:uid,
      previousStatus:previous?.status||null,allocations,notes,createdAt:FieldValue.serverTimestamp()
    });
  });
  return {ok:true};
});
export const reviewDisposition = onCall({region:REGION,maxInstances:15},async request=>{
  const uid=await ownerUser(request),space=validatedSpace(request.data?.space);
  const id=validatedItemId(request.data?.itemId);
  const decision=String(request.data?.decision||'');
  if(!['approved','rejected'].includes(decision))throw new HttpsError('invalid-argument','Select approve or reject.');
  const reviewNote=String(request.data?.reviewNote||'').trim();
  if(reviewNote.length>2000 || (decision==='rejected' && !reviewNote)){
    throw new HttpsError('invalid-argument','A rejection reason is required (maximum 2,000 characters).');
  }
  const itemRef=db.doc('workspaces/'+space+'/items/'+id);
  const proposalRef=db.doc('workspaces/'+space+'/dispositions/'+id);
  const eventRef=db.collection('workspaces').doc(space).collection('dispositionEvents').doc();
  await db.runTransaction(async tx=>{
    const [proposalSnap,itemSnap]=await Promise.all([tx.get(proposalRef),tx.get(itemRef)]);
    if(!proposalSnap.exists || proposalSnap.data().status!=='proposed'){
      throw new HttpsError('failed-precondition','Only pending proposals may be reviewed.');
    }
    if(!itemSnap.exists||itemSnap.data().deletedAt)throw new HttpsError('failed-precondition','This item is no longer active.');
    const proposal=proposalSnap.data(),item=itemSnap.data();
    if(proposal.itemQuantity!==item.quantity||proposal.roomId!==item.roomId||proposal.itemName!==item.name){
      throw new HttpsError('failed-precondition','Item quantities or location changed. Resubmit this proposal.');
    }
    if(decision==='approved' && space==='official'){
      const roomSnap=await tx.get(db.doc('workspaces/'+space+'/rooms/'+item.roomId));
      if(!roomSnap.exists||roomSnap.data().deletedAt||roomSnap.data().status!=='verified'){
        throw new HttpsError('failed-precondition','Verify the item’s room before approving an official disposition.');
      }
    }
    tx.update(proposalRef,{
      status:decision,reviewedBy:uid,reviewedAt:FieldValue.serverTimestamp(),
      reviewNote,updatedBy:uid,updatedAt:FieldValue.serverTimestamp()
    });
    tx.create(eventRef,{
      itemId:id,itemName:item.name,action:decision,version:proposal.version,
      actorUid:uid,allocations:proposal.allocations,reviewNote,
      createdAt:FieldValue.serverTimestamp()
    });
  });
  return {ok:true};
});
export const createInventorySnapshot = onCall({region:REGION,timeoutSeconds:120,maxInstances:3,memory:'512MiB'},async request=>{
  const user=await editorUser(request),space=validatedSpace(request.data?.space);
  const type=String(request.data?.type||'draft');
  if(!['draft','final'].includes(type))throw new HttpsError('invalid-argument','Select a draft or final snapshot.');
  if(space==='official' && user.role!=='owner')throw new HttpsError('permission-denied','Only the owner may save official snapshots.');
  const label=String(request.data?.label||'').trim();
  if(label.length<3||label.length>100)throw new HttpsError('invalid-argument','Snapshot name must be 3–100 characters.');
  const base=db.collection('workspaces').doc(space);
  const rows=await db.runTransaction(async tx=>{
    const [r,i,d]=await Promise.all([
      tx.get(base.collection('rooms').limit(251)),
      tx.get(base.collection('items').limit(2001)),
      tx.get(base.collection('dispositions').limit(2001))
    ]);
    if(r.size>250||i.size>2000||d.size>2000){
      throw new HttpsError('resource-exhausted','Snapshot exceeds limits of 250 rooms or 2,000 items/decisions. Contact the project administrator.');
    }
    return {
      rooms:r.docs.filter(x=>!x.data().deletedAt).map(x=>({id:x.id,...x.data()})),
      items:i.docs.filter(x=>!x.data().deletedAt).map(x=>({id:x.id,...x.data()})),
      dispositions:d.docs.map(x=>({id:x.id,...x.data()}))
    };
  });
  const roomIds=new Set(rows.rooms.map(r=>r.id));
  rows.items=rows.items.filter(i=>roomIds.has(i.roomId));
  if(type==='final' && space==='official'){
    if(!rows.rooms.length||rows.rooms.some(r=>r.status!=='verified')){
      throw new HttpsError('failed-precondition','Every active room must be verified before a final official snapshot.');
    }
    if(rows.dispositions.some(d=>roomIds.has(d.roomId)&&['proposed','needs-review'].includes(d.status))){
      throw new HttpsError('failed-precondition','Resolve pending or stale property disposition decisions before a final snapshot.');
    }
  }
  const snapRef=base.collection('snapshots').doc();
  const entries=[
    ...rows.rooms.map(r=>({id:'room_'+r.id,kind:'room',record:r})),
    ...rows.items.map(i=>({id:'item_'+i.id,kind:'item',record:i})),
    ...rows.dispositions.filter(d=>rows.items.some(i=>i.id===d.itemId)).map(d=>({id:'disposition_'+d.id,kind:'disposition',record:d}))
  ];
  await snapRef.create({label,type,status:'building',createdAt:FieldValue.serverTimestamp(),
    createdBy:user.uid,roomCount:rows.rooms.length,itemTypes:rows.items.length,
    totalUnits:rows.items.reduce((n,i)=>n+i.quantity,0),entryCount:entries.length});
  try {
    for(let offset=0;offset<entries.length;offset+=350){
      const batch=db.batch();
      for(const entry of entries.slice(offset,offset+350)){
        batch.create(snapRef.collection('entries').doc(entry.id),{
          kind:entry.kind,record:entry.record
        });
      }
      await batch.commit();
    }
    await snapRef.update({status:'complete',completedAt:FieldValue.serverTimestamp()});
  }catch(error){
    await snapRef.update({status:'failed',failedAt:FieldValue.serverTimestamp()}).catch(()=>{});
    throw new HttpsError('internal','Snapshot could not be completed. An incomplete record was retained for diagnosis.');
  }
  return {ok:true,snapshotId:snapRef.id,entryCount:entries.length};
});
export const deleteTestSnapshot = onCall({region:REGION,timeoutSeconds:120,maxInstances:3},async request=>{
  await editorUser(request);
  const space=validatedSpace(request.data?.space);
  if(space!=='test')throw new HttpsError('permission-denied','Official snapshots cannot be deleted.');
  const id=String(request.data?.snapshotId||'');
  if(!/^[A-Za-z0-9_-]{8,150}$/.test(id))throw new HttpsError('invalid-argument','Invalid snapshot identifier.');
  const snap=db.doc('workspaces/test/snapshots/'+id);
  if(!(await snap.get()).exists)throw new HttpsError('not-found','Snapshot not found.');
  // Recursive deletion only applies to test data.
  await db.recursiveDelete(snap);
  return {ok:true};
});

export const resetTestWorkspace = onCall({region:REGION,timeoutSeconds:120,maxInstances:2},async request=>{
  await editorUser(request);
  if(request.data?.confirm!=='RESET TEST')throw new HttpsError('invalid-argument','Type RESET TEST to confirm.');
  const ref=db.doc('workspaces/test');
  // Test deletion is intentionally server-side because audit/decision/snapshot rules prohibit client writes.
  await db.recursiveDelete(ref);
  let photoCleanupWarning=false;
  try{await getStorage().bucket().deleteFiles({prefix:'inventory/test/'});}
  catch(error){photoCleanupWarning=true;console.error('Test photo cleanup failed:',error);}
  return {ok:true,photoCleanupWarning};
});

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
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

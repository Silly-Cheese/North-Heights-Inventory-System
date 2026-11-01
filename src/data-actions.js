import {
  doc, collection, setDoc, updateDoc, deleteDoc, getDoc, getDocs, writeBatch,
  runTransaction, serverTimestamp, Timestamp, query, limit
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

// No Cloud Functions. Every write is checked by Firestore Security Rules.
export function initDataActions({db,auth,storage,storageRef,deleteObject,state}){
 const uid=()=>{if(!auth.currentUser)throw Error('Sign in first.');return auth.currentUser.uid;};
 const base=space=>doc(db,'workspaces',space);
 const resource=(space,kind,id)=>doc(db,'workspaces',space,kind,id);
 const memberRef=()=>doc(db,'authorizedUsers',uid());
 const cleanName=value=>{const x=String(value||'').trim();if(x.length<2||x.length>80)throw Error('Name must be 2–80 characters.');return x;};
 const requireEditor=()=>{if(!['owner','inventory'].includes(state.member?.role))throw Error('Inventory editor access required.');};
 const requireOwner=()=>{if(state.member?.role!=='owner')throw Error('Owner access required.');};
 const randomCode=()=>{
   const bytes=new Uint8Array(20);crypto.getRandomValues(bytes);
   const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
   return Array.from(bytes,b=>alphabet[b%alphabet.length]).join('').match(/.{1,5}/g).join('-');
 };
 const hashCode=async raw=>{
   const normalized=String(raw||'').toUpperCase().replace(/[^A-Z2-9]/g,'');
   if(normalized.length!==20)throw Error('Enter the 20-character authorization code.');
   const buffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));
   return Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');
 };
 const identity=(name,role,invitedBy='',inviteId='')=>({
   uid:uid(),email:auth.currentUser.email,displayName:cleanName(name),role,active:true,
   createdAt:serverTimestamp(),invitedBy,inviteId
 });
 async function bootstrapOwner({displayName}){
   const batch=writeBatch(db);
   batch.set(memberRef(),identity(displayName,'owner'));
   batch.set(doc(db,'system','bootstrap'),{ownerUid:uid(),createdAt:serverTimestamp()});
   await batch.commit();return {ok:true};
 }
 async function createInvite({role,email}){
   requireOwner();
   if(!['inventory','member'].includes(role))throw Error('Invalid invitation role.');
   const address=String(email||'').trim().toLowerCase();
   if(address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw Error('Enter a valid email.');
   const code=randomCode(),key=await hashCode(code);
   await setDoc(doc(db,'invites',key),{role,email:address,createdBy:uid(),createdAt:serverTimestamp(),
     expiresAt:Timestamp.fromMillis(Date.now()+6*24*60*60*1000+23*60*60*1000),redeemedBy:'',redeemedAt:null,revoked:false});
   return {code,role,email:address,expiresInDays:7};
 }
 async function redeemInvite({code,displayName}){
   const key=await hashCode(code);
   // No invite read necessary: the Security Rules validate the old and final
   // invite state against the member record in one atomic write batch.
   const batch=writeBatch(db);
   // The role and issuer are not trusted from the browser. Retrieve only the
   // exact secret-selected invitation; the known hash cannot be enumerated.
   const snap=await getDoc(doc(db,'invites',key));
   if(!snap.exists())throw Error('Invalid or expired invitation code.');
   const invite=snap.data();
   if(invite.revoked||invite.redeemedBy||invite.expiresAt.toMillis()<Date.now())throw Error('This invitation expired or was already used.');
   if(invite.email && invite.email!==auth.currentUser.email?.toLowerCase())throw Error('This code is restricted to another email.');
   batch.set(memberRef(),identity(displayName,invite.role,invite.createdBy,key));
   batch.update(doc(db,'invites',key),{redeemedBy:uid(),redeemedAt:serverTimestamp()});
   await batch.commit();return {ok:true};
 }
 async function revokeInvite({inviteId}){requireOwner();await updateDoc(doc(db,'invites',inviteId),{revoked:true});return {ok:true};}
 async function disableMember({uid:target}){
   requireOwner();if(target===uid())throw Error('You cannot disable yourself.');
   await updateDoc(doc(db,'authorizedUsers',target),{active:false,disabledBy:uid(),disabledAt:serverTimestamp()});return {ok:true};
 }
 const types=['retain','include-with-property','donate','sell-separately','dispose'];
 const checkAlloc=arr=>{
   if(!Array.isArray(arr)||arr.length!==5)throw Error('Five allocation categories required.');
   return arr.map((x,i)=>{
     if(x.type!==types[i]||!Number.isSafeInteger(x.quantity)||x.quantity<0)throw Error('Enter valid whole-number allocations.');
     return {type:x.type,quantity:x.quantity};
   });
 };
 async function proposeDisposition({space,itemId,allocations,notes}){
   requireEditor();
   const values=checkAlloc(allocations),memo=String(notes||'').trim();
   if(memo.length>2000)throw Error('Notes must be under 2,000 characters.');
   const itemDoc=resource(space,'items',itemId),decisionDoc=resource(space,'dispositions',itemId);
   const eventDoc=doc(collection(db,'workspaces',space,'dispositionEvents'));
   await runTransaction(db,async tx=>{
     const [itemSnap,oldSnap]=await Promise.all([tx.get(itemDoc),tx.get(decisionDoc)]);
     if(!itemSnap.exists()||itemSnap.data().deletedAt)throw Error('Item missing.');
     const item=itemSnap.data(),total=values.reduce((n,x)=>n+x.quantity,0);
     if(total>item.quantity||total===0)throw Error('Allocate between 1 and '+item.quantity+' units.');
     const previous=oldSnap.exists()?oldSnap.data():null;
     const data={itemId,roomId:item.roomId,itemName:item.name,itemQuantity:item.quantity,
       allocations:values,unallocated:item.quantity-total,notes:memo,status:'proposed',
       version:(previous?.version||0)+1,createdBy:previous?.createdBy||uid(),
       createdAt:previous?.createdAt||serverTimestamp(),submittedBy:uid(),
       updatedBy:uid(),updatedAt:serverTimestamp(),reviewedBy:null,reviewedAt:null,reviewNote:''};
     tx.set(decisionDoc,data);
     tx.set(eventDoc,{itemId,itemName:item.name,action:'proposed',actorUid:uid(),
       version:data.version,allocations:values,notes:memo,createdAt:serverTimestamp()});
   });
   return {ok:true};
 }
 async function reviewDisposition({space,itemId,decision,reviewNote}){
   requireOwner();if(!['approved','rejected'].includes(decision))throw Error('Invalid decision.');
   const note=String(reviewNote||'').trim();
   if(note.length>2000||(decision==='rejected'&&!note))throw Error('A rejection reason is required.');
   const itemDoc=resource(space,'items',itemId),proposalDoc=resource(space,'dispositions',itemId);
   const eventDoc=doc(collection(db,'workspaces',space,'dispositionEvents'));
   await runTransaction(db,async tx=>{
     const [proposalSnap,itemSnap]=await Promise.all([tx.get(proposalDoc),tx.get(itemDoc)]);
     if(!proposalSnap.exists()||proposalSnap.data().status!=='proposed')throw Error('Proposal is not pending.');
     if(!itemSnap.exists()||itemSnap.data().deletedAt)throw Error('Item missing.');
     const proposal=proposalSnap.data(),item=itemSnap.data();
     if(proposal.itemQuantity!==item.quantity||proposal.roomId!==item.roomId||proposal.itemName!==item.name)throw Error('Item changed. Submit a fresh proposal.');
     if(space==='official' && decision==='approved'){
       const room=await tx.get(resource(space,'rooms',item.roomId));
       if(!room.exists()||room.data().deletedAt||room.data().status!=='verified')throw Error('Verify this room first.');
     }
     tx.update(proposalDoc,{status:decision,reviewedBy:uid(),reviewedAt:serverTimestamp(),
       reviewNote:note,updatedBy:uid(),updatedAt:serverTimestamp()});
     tx.set(eventDoc,{itemId,itemName:item.name,action:decision,version:proposal.version,
       actorUid:uid(),reviewNote:note,createdAt:serverTimestamp()});
   });
   return {ok:true};
 }
 async function createInventorySnapshot({space,label,type}){
   requireEditor();if(space==='official')requireOwner();
   if(!['draft','final'].includes(type))throw Error('Invalid snapshot type.');
   const name=String(label||'').trim();
   if(name.length<3||name.length>100)throw Error('Snapshot name must be 3–100 characters.');
   const [roomsSnap,itemsSnap,decisionsSnap]=await Promise.all([
     getDocs(collection(db,'workspaces',space,'rooms')),
     getDocs(collection(db,'workspaces',space,'items')),
     getDocs(collection(db,'workspaces',space,'dispositions'))
   ]);
   if(roomsSnap.size>250||itemsSnap.size>2000||decisionsSnap.size>2000)throw Error('Snapshot too large; split inventory into smaller batches.');
   const rooms=roomsSnap.docs.filter(d=>!d.data().deletedAt).map(d=>({id:d.id,...d.data()}));
   const roomIDs=new Set(rooms.map(r=>r.id));
   const items=itemsSnap.docs.filter(d=>!d.data().deletedAt && roomIDs.has(d.data().roomId)).map(d=>({id:d.id,...d.data()}));
   const decisions=decisionsSnap.docs.filter(d=>items.some(i=>i.id===d.id)).map(d=>({id:d.id,...d.data()}));
   if(space==='official' && type==='final'){
     if(!rooms.length||rooms.some(r=>r.status!=='verified'))throw Error('All rooms must be verified first.');
     if(decisions.some(d=>['proposed','needs-review'].includes(d.status)))throw Error('Resolve outstanding disposition reviews first.');
   }
   const entryRows=[
     ...rooms.map(r=>({id:'room_'+r.id,kind:'room',record:r})),
     ...items.map(i=>({id:'item_'+i.id,kind:'item',record:i})),
     ...decisions.map(d=>({id:'disposition_'+d.id,kind:'disposition',record:d}))
   ];
   const snapRef=doc(collection(db,'workspaces',space,'snapshots'));
   await setDoc(snapRef,{label:name,type,status:'building',createdAt:serverTimestamp(),createdBy:uid(),
     roomCount:rooms.length,itemTypes:items.length,totalUnits:items.reduce((n,i)=>n+i.quantity,0),
     entryCount:entryRows.length,source:'browser-captured'});
   try{
     for(let k=0;k<entryRows.length;k+=300){
       const batch=writeBatch(db);
       for(const row of entryRows.slice(k,k+300)){
         batch.set(doc(db,'workspaces',space,'snapshots',snapRef.id,'entries',row.id),{kind:row.kind,record:row.record});
       }
       await batch.commit();
     }
     await updateDoc(snapRef,{status:'complete',completedAt:serverTimestamp()});
   }catch(error){
     await updateDoc(snapRef,{status:'failed',failedAt:serverTimestamp()}).catch(()=>{});
     throw error;
   }
   return {ok:true,snapshotId:snapRef.id,entryCount:entryRows.length};
 }
 async function deleteTestSnapshot({space,snapshotId}){
   requireEditor();if(space!=='test')throw Error('Only test snapshots may be deleted.');
   const col=collection(db,'workspaces','test','snapshots',snapshotId,'entries');
   for(;;){
     const snap=await getDocs(query(col,limit(300)));
     if(snap.empty)break;
     const batch=writeBatch(db);snap.docs.forEach(d=>batch.delete(d.ref));await batch.commit();
   }
   await deleteDoc(resource('test','snapshots',snapshotId));
   return {ok:true};
 }
 async function resetTestWorkspace({confirm}){
   requireEditor();if(confirm!=='RESET TEST')throw Error('Confirm RESET TEST.');
   const items=await getDocs(collection(db,'workspaces','test','items'));
   let photoCleanupWarning=false;
   for(const item of items.docs){
     const path=item.data().photoPath;
     if(path)try{await deleteObject(storageRef(storage,path));}catch{photoCleanupWarning=true;}
   }
   const snapshots=await getDocs(collection(db,'workspaces','test','snapshots'));
   for(const snapshot of snapshots.docs)await deleteTestSnapshot({space:'test',snapshotId:snapshot.id});
   for(const name of ['items','rooms','dispositions','dispositionEvents','activity','countOperations']){
     const col=collection(db,'workspaces','test',name);
     for(;;){
       const docs=await getDocs(query(col,limit(300)));
       if(docs.empty)break;
       const batch=writeBatch(db);docs.docs.forEach(d=>batch.delete(d.ref));await batch.commit();
     }
   }
   return {ok:true,photoCleanupWarning};
 }
 async function reconcileCount({space,itemId,operationId,delta,baseline,mode='normal',reviewedQuantity}){
   requireEditor();
   if(!['test','official'].includes(space))throw Error('Invalid workspace.');
   if(!/^[0-9a-f-]{36}$/.test(operationId))throw Error('Invalid adjustment ID.');
   if(!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>1000000)throw Error('Invalid quantity adjustment.');
   const itemDoc=resource(space,'items',itemId);
   const opDoc=resource(space,'countOperations',operationId);
   const decisionDoc=resource(space,'dispositions',itemId);
   return runTransaction(db,async tx=>{
     const [old,itemSnap,decisionSnap]=await Promise.all([tx.get(opDoc),tx.get(itemDoc),tx.get(decisionDoc)]);
     if(old.exists()){
       if(old.data().uid!==uid()||old.data().itemId!==itemId||old.data().delta!==delta)throw Error('Adjustment ID already used.');
       return {status:'applied',quantity:old.data().resultQuantity,replayed:true};
     }
     if(!itemSnap.exists()||itemSnap.data().deletedAt)return {status:'missing'};
     const item=itemSnap.data(),expected=mode==='reviewed'?reviewedQuantity:baseline;
     if(!Number.isSafeInteger(expected)||item.quantity!==expected)return {status:'conflict',currentQuantity:item.quantity,itemName:item.name};
     const next=item.quantity+delta;
     if(next<0||next>1000000)return {status:'conflict',currentQuantity:item.quantity,message:'Quantity would be invalid.'};
     const roomRef=resource(space,'rooms',item.roomId);
     const room=await tx.get(roomRef);
     if(!room.exists()||room.data().deletedAt)return {status:'missing'};
     tx.update(itemDoc,{quantity:next,updatedAt:serverTimestamp(),updatedBy:uid()});
     if(room.data().status==='verified'){
       tx.update(roomRef,{status:'in-progress',reviewNote:'Quantity changed after review.',verifiedAt:null,
         verifiedBy:'',updatedAt:serverTimestamp(),updatedBy:uid()});
     }
     if(decisionSnap.exists()&&decisionSnap.data().status==='approved'){
       tx.update(decisionDoc,{status:'needs-review',reviewNote:'Count changed. Review disposition again.',
         updatedAt:serverTimestamp(),updatedBy:uid()});
     }
     tx.set(opDoc,{uid:uid(),space,itemId,delta,baseline,resultQuantity:next,createdAt:serverTimestamp()});
     tx.set(doc(collection(db,'workspaces',space,'activity')),{recordType:'item',
       recordId:itemId,operation:'quantity-adjusted',recordName:item.name,actorUid:uid(),
       changedKeys:['quantity'],roomId:item.roomId,beforeQuantity:item.quantity,
       afterQuantity:next,createdAt:serverTimestamp()});
     return {status:'applied',quantity:next,replayed:false};
   });
 }
 async function writeInventoryItem(space,old,values) {
   requireEditor();
   if(!['test','official'].includes(space))throw Error('Invalid workspace.');
   const reference=old?resource(space,'items',old.id):doc(collection(db,'workspaces',space,'items'));
   // New items use a straightforward Firestore write. Previously ALL items used
   // a multi-document transaction even when no related data needed updating.
   // Keeping ordinary creates simple also makes failures easier to identify.
   if(!old){
     const roomRef=resource(space,'rooms',values.roomId);
     const roomSnapshot=await getDoc(roomRef);
     if(!roomSnapshot.exists() || roomSnapshot.data().deletedAt)
       throw Error('The selected room is unavailable. Refresh Rooms and try again.');
     const record={...values,createdAt:serverTimestamp(),createdBy:uid(),
       deletedAt:null,deletedWithRoom:false};
     if(roomSnapshot.data().status==='verified'){
       // Changes to a verified room must reopen its review. Commit together so
       // Firestore rules can validate the post-write room status with getAfter().
       const batch=writeBatch(db);
       batch.update(roomRef,{status:'in-progress',verifiedBy:'',verifiedAt:null,
         reviewNote:'Inventory item added after verification; recheck required.',
         updatedAt:serverTimestamp(),updatedBy:uid()});
       batch.set(reference,record);
       await batch.commit();
     }else{
       await setDoc(reference,record);
     }
     return reference;
   }
   const previousRoomId=old?.roomId;
   const targetRoomId=values.roomId;
   await runTransaction(db,async tx=>{
     const [current,newRoom,oldRoom,decision]=await Promise.all([
       old?tx.get(reference):Promise.resolve(null),
       tx.get(resource(space,'rooms',targetRoomId)),
       previousRoomId&&previousRoomId!==targetRoomId?tx.get(resource(space,'rooms',previousRoomId)):Promise.resolve(null),
       old?tx.get(resource(space,'dispositions',old.id)):Promise.resolve(null)
     ]);
     if(old && !current?.exists())throw Error('Item no longer exists.');
     if(!newRoom.exists()||newRoom.data().deletedAt)throw Error('Destination room unavailable.');
     if(oldRoom&&!oldRoom.exists())throw Error('Previous room unavailable.');
     if(old)tx.update(reference,values);
     else tx.set(reference,{...values,createdAt:serverTimestamp(),createdBy:uid(),deletedAt:null,deletedWithRoom:false});
     for(const [roomId,snap] of [[targetRoomId,newRoom],...(oldRoom?[[previousRoomId,oldRoom]]:[])]){
       if(snap.data().status==='verified'){
         tx.update(resource(space,'rooms',roomId),{status:'in-progress',verifiedBy:'',verifiedAt:null,
           reviewNote:'Item inventory changed after verification.',updatedAt:serverTimestamp(),updatedBy:uid()});
       }
     }
     if(decision?.exists()&&decision.data().status==='approved'){
       const oldItem=current.data();
       if(oldItem.quantity!==values.quantity||oldItem.roomId!==values.roomId||oldItem.name!==values.name||
          oldItem.condition!==values.condition||values.deletedAt){
         tx.update(resource(space,'dispositions',old.id),{status:'needs-review',
           reviewNote:'Item changed. Re-approval required.',updatedAt:serverTimestamp(),updatedBy:uid()});
       }
     }
   });
   return reference;
 }
 async function logActivity(space,event){
   await setDoc(doc(collection(db,'workspaces',space,'activity')),{recordType:event.recordType||'item',
     recordId:event.recordId||'',operation:event.operation||'updated',
     recordName:event.recordName||'',actorUid:uid(),changedKeys:event.changedKeys||[],
     roomId:event.roomId||null,beforeQuantity:event.beforeQuantity??null,
     afterQuantity:event.afterQuantity??null,createdAt:serverTimestamp()});
 }
 const handlers={bootstrapOwner,createInvite,redeemInvite,revokeInvite,disableMember,
   proposeDisposition,reviewDisposition,createInventorySnapshot,deleteTestSnapshot,
   resetTestWorkspace,reconcileCount};
 return {invoke:async(name,data={})=>{
   if(!handlers[name])throw Error('Unsupported local operation: '+name);
   return {data:await handlers[name](data)};
 },bootstrapOwner,writeInventoryItem,reconcileCount,logActivity};
}

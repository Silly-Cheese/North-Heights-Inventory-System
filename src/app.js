import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { initPhase3 } from './phase3.js?v=20261101-forms3';
import { bindRoomSaveForm } from './room-save.js?v=20261101-roomsave1';
import { initPhase4 } from './phase4.js?v=20261101-forms3';
import { query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendEmailVerification, reload, getIdToken } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, increment, runTransaction } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA5rlmsSfE09vfnhrZkg2DGtV1kOMHWZRw',
  authDomain: 'nh-inventory-6f359.firebaseapp.com',
  projectId: 'nh-inventory-6f359',
  storageBucket: 'nh-inventory-6f359.firebasestorage.app',
  messagingSenderId: '417386366102',
  appId: '1:417386366102:web:afe95a46e22670ea852eb7'
};
import { initDataActions } from './data-actions.js?v=20261101-forms3';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-storage.js';
const firebase = initializeApp(firebaseConfig);
const auth = getAuth(firebase);
const db = getFirestore(firebase);
const storage = getStorage(firebase);
let actions;
const call=(name,data={})=>actions.invoke(name,data);
const $ = id => document.getElementById(id);
const launchParams=new URLSearchParams(window.location.search);
const state = { user: null, member: null, space: 'test', page: 'dashboard', roomId: null, rooms: [], items: [], members: [], activity: [], invites: [], search: '', unsub: [], ready: false, confirm: null, enrolling: false, setupChecked: false, ownerCreated: false, latestInvite: null, deepLinkRoom:launchParams.get('room'),deepLinkConsumed:false,
  itemLimit:80,roomStats:new Map() };
if(['test','official'].includes(launchParams.get('space')))state.space=launchParams.get('space');
actions=initDataActions({db,auth,storage,storageRef,deleteObject,state});
const STATUS = { 'not-started': 'Not started', 'in-progress': 'In progress', 'ready-for-review': 'Ready for review', verified: 'Verified' };
const CATEGORIES = ['Furniture','Worship Supplies','Audio & Video','Books & Literature','Kitchen','Office Supplies','Electronics','Cleaning','Decorations','Other'];
const CONDITIONS = ['Not assessed','Excellent','Good','Fair','Poor','Broken'];
const NAV = [ ['dashboard','▦','Dashboard'], ['rooms','▤','Rooms'], ['items','▣','All Inventory'], ['trash','♻','Trash'], ['activity','◷','Activity'], ['dispositions','⇄','Dispositions'], ['reports','▧','Reports'], ['sync','⇡','Sync Center'], ['settings','⚙','Settings'] ];

function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const E = escapeHTML;
const roomsPath = () => collection(db, 'workspaces', state.space, 'rooms');
const itemsPath = () => collection(db, 'workspaces', state.space, 'items');
const roomRef = id => doc(db, 'workspaces', state.space, 'rooms', id);
const itemRef = id => doc(db, 'workspaces', state.space, 'items', id);
const canEdit = () => ['owner','inventory'].includes(state.member?.role);
const isOwner = () => state.member?.role === 'owner';
const canVerifyRoom = room => canEdit() && room.status === 'ready-for-review' && (state.space === 'test' || room.submittedBy !== state.user?.uid);
const getPerson = uid => state.members.find(u=>u.id===uid)?.displayName || (uid==='system'?'System':uid ? uid.slice(0,8):'Unassigned');
const activeRooms = () => state.rooms.filter(r => !r.deletedAt).sort((a,b) => a.name.localeCompare(b.name));
const activeItems = () => { const ids = new Set(activeRooms().map(r => r.id)); return state.items.filter(i => !i.deletedAt && ids.has(i.roomId)); };
const findRoom = id => state.rooms.find(r => r.id === id);
const roomName = id => findRoom(id)?.name ?? 'Unknown room';
const number = n => Number(n || 0).toLocaleString();
const statusBadge = status => '<span class="badge ' + (status === 'verified' ? '' : status === 'in-progress' ? 'blue' : 'slate') + '">' + E(STATUS[status] || 'Not started') + '</span>';
function toast(message, error = false) {
  const el = $('toast'); el.textContent = message; el.className = 'toast' + (error ? ' error' : ''); el.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, 3900);
}
function errMessage(error) {
  const code = error?.code || '';
  if (code.includes('permission-denied')) return 'Access denied. Check your verified email, account role, and deployed Firestore rules.';
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) return 'Incorrect email or password.';
  if (code.includes('auth/too-many-requests')) return 'Too many attempts. Try again later.';
  return error?.message || 'Something went wrong. Please try again.';
}
function catchError(error) { console.error(error); toast(errMessage(error), true); }
async function getMembership(user) {
  if (!user?.uid) throw new Error('Sign in to access the inventory.');
  await reload(user);
  if (!user.emailVerified) throw new Error('Verify your email address before accessing inventory.');
  const snapshot = await getDoc(doc(db,'authorizedUsers',user.uid));
  if (!snapshot.exists() || snapshot.data().active !== true) {
    throw new Error('Account authorization has not been completed.');
  }
  return snapshot.data();
}

const phase3=initPhase3({state,db,call,E,header,modeBanner,canEdit,isOwner,roomName,activeRooms,
  activeItems,getPerson,toast,catchError,openModal,modalHeading,closeModal,confirmDialog,renderMain});
const phase4=initPhase4({state,call,toast,catchError,canEdit,isOwner,E,openModal,modalHeading,closeModal,
  confirmDialog,renderMain,activeRooms,activeItems,roomName,showPage});
let renderScheduled=false;
function scheduleRender(){
  if(renderScheduled)return;renderScheduled=true;
  window.requestAnimationFrame(()=>{renderScheduled=false;renderMain();});
}
function showPage(page,roomId=null) {
  state.page=page;state.roomId=roomId;state.search='';state.itemLimit=80;
  const url=new URL(window.location.href);
  if(page==='room' && roomId){url.searchParams.set('room',roomId);url.searchParams.set('space',state.space);}
  else{url.searchParams.delete('room');url.searchParams.set('space',state.space);}
  url.searchParams.forEach((value,key)=>{if(!['space','room'].includes(key))url.searchParams.delete(key);});
  window.history.replaceState(null,'',url);
  render();
  window.scrollTo({ top:0, behavior:'instant' });
}
function stopListeners() { state.unsub.forEach(fn => fn()); state.unsub = []; }
function subscribe() {
  stopListeners(); state.ready = false; state.rooms = []; state.items = [];state.roomStats=new Map();
  state.members = []; state.activity = []; state.invites = [];
  phase3.subscribe(fn=>state.unsub.push(fn));
  render();
  let gotRooms = false, gotItems = false;
  const received=()=>{
    if(gotRooms&&gotItems){
      state.ready=true;const map=new Map();
      for(const item of state.items){
        if(item.deletedAt)continue;
        const v=map.get(item.roomId)||{types:0,units:0};
        v.types++;v.units+=Number(item.quantity||0);map.set(item.roomId,v);
      }
      state.roomStats=map;
      if(state.deepLinkRoom && !state.deepLinkConsumed){
        state.deepLinkConsumed=true;
        if(state.rooms.some(r=>r.id===state.deepLinkRoom&&!r.deletedAt)){
          showPage('room',state.deepLinkRoom);return;
        }
        toast('This room link is no longer available.',true);
      }
    }
    scheduleRender();
  };
  state.unsub.push(onSnapshot(roomsPath(), snap => {
    state.rooms = snap.docs.map(x => ({ id:x.id, ...x.data() })); gotRooms = true; received();
  }, catchError));
  state.unsub.push(onSnapshot(itemsPath(), snap => {
    state.items = snap.docs.map(x => ({ id:x.id, ...x.data() })); gotItems = true; received();
  }, catchError));
  state.unsub.push(onSnapshot(doc(db,'authorizedUsers',state.user.uid),snap=>{
    if(!snap.exists() || snap.data().active===false){
      toast('Your access to this inventory has been removed.',true);
      signOut(auth).catch(console.error);
    }
  },()=>{signOut(auth).catch(console.error);}));
  if(canEdit()) state.unsub.push(onSnapshot(collection(db,'authorizedUsers'), snap=>{
    state.members=snap.docs.map(d=>({id:d.id,...d.data()})).filter(u=>u.active!==false);render();
  },catchError));
  state.unsub.push(onSnapshot(query(collection(db,'workspaces',state.space,'activity'),
    orderBy('createdAt','desc'),limit(120)),snap=>{
    state.activity=snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,120);
    render();
  },catchError));
  if(isOwner()) state.unsub.push(onSnapshot(query(collection(db,'invites'),
    orderBy('createdAt','desc'),limit(100)),snap=>{
    state.invites=snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,100);
    render();
  },catchError));
}
async function refreshSetupStatus() {
  try {
    const snap=await getDoc(doc(db,'system','bootstrap'));
    state.setupChecked=true;state.ownerCreated=snap.exists();
    $('bootstrapNav').hidden=state.ownerCreated;
  }catch(error){
    console.warn('Setup status not yet available:',error);
    $('bootstrapNav').hidden=false;
  }
}
function authMode(mode) {
  for(const m of ['login','register','bootstrap']) {
    const form=$(m==='login'?'loginForm':m==='register'?'registerForm':'bootstrapForm');
    if(form) form.hidden=m!==mode;
  }
  document.querySelectorAll('[data-auth-mode]').forEach(b=>b.classList.toggle('active',b.dataset.authMode===mode));
  $('loginError').textContent='';
}
async function finishEnrollment(form,owner){
  const fd=new FormData(form),email=String(fd.get('email')||'').trim().toLowerCase();
  const pass=String(fd.get('password')||''),displayName=String(fd.get('displayName')||'').trim();
  const errorEl=$(owner?'bootstrapError':'registerError'),submit=form.querySelector('[type=submit]');
  state.enrolling=true;submit.disabled=true;errorEl.textContent='';
  try{
    if(!auth.currentUser){
      await createUserWithEmailAndPassword(auth,email,pass);
    } else if(auth.currentUser.email?.toLowerCase()!==email){
      throw Error('You are signed in with a different email. Sign out first before creating another account.');
    }
    await reload(auth.currentUser);
    await getIdToken(auth.currentUser,true);
    if(!auth.currentUser.emailVerified){
      await sendEmailVerification(auth.currentUser);
      errorEl.textContent='We sent you an email verification link. Open it, then return here and submit this form again using the same email. Your new Authentication account already exists.';
      return;
    }
    if(owner)await call('bootstrapOwner',{displayName});
    else await call('redeemInvite',{code:String(fd.get('code')||''),displayName});
    const member=await getMembership(auth.currentUser);
    state.user=auth.currentUser;state.member=member;
    $('auth').hidden=true;$('app').hidden=false;
    phase4.start(state.user.uid).catch(catchError);
    form.reset();state.ownerCreated=true;subscribe();
    toast(owner?'Owner account initialized.':'Account authorized.');
  }catch(error){
    console.error(error);errorEl.textContent=errMessage(error);
  }finally{state.enrolling=false;submit.disabled=false;}
}
onAuthStateChanged(auth,async user=>{
  if(state.enrolling)return;
  stopListeners();state.user=null;state.member=null;state.ready=false;$('splash').hidden=true;
  phase4.start(null).catch(console.error);
  if(!user){
    $('app').hidden=true;$('auth').hidden=false;authMode('login');refreshSetupStatus();return;
  }
  try{
    const member=await getMembership(user);
    if(auth.currentUser?.uid!==user.uid||state.enrolling)return;
    state.user=user;state.member=member;$('auth').hidden=true;$('app').hidden=false;
    phase4.start(user.uid).catch(catchError);subscribe();
  }catch(error){
    $('app').hidden=true;$('auth').hidden=false;
    $('loginError').textContent=user.emailVerified?
      'This account is not authorized yet. Use Have a code? or Owner setup to finish registration.':
      'Your email is not verified yet. Select Have a code? or Owner setup and resubmit to receive a verification link.';
    refreshSetupStatus();
  }
});
$('loginForm').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;
  const submit=form.querySelector('button[type=submit]');$('loginError').textContent='';
  submit.disabled=true;submit.textContent='Signing in...';
  try{
    await signInWithEmailAndPassword(auth,form.email.value.trim(),form.password.value);
    form.reset();
  }catch(error){$('loginError').textContent=errMessage(error);}
  finally{submit.disabled=false;submit.textContent='Sign in securely';}
});
$('registerForm').addEventListener('submit',event=>{event.preventDefault();finishEnrollment(event.currentTarget,false);});
$('bootstrapForm').addEventListener('submit',event=>{event.preventDefault();finishEnrollment(event.currentTarget,true);});
document.querySelectorAll('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>authMode(button.dataset.authMode)));
$('switchAccount')?.addEventListener('click',async()=>{await signOut(auth);authMode('login');});
function header(title, description, actions='') {
  return '<div class="page-head"><div><h1>' + E(title) + '</h1><p>' + E(description) + '</p></div><div class="btn-row">' + actions + '</div></div>';
}
function modeBanner() {
  return state.space === 'test'
    ? '<div class="alert"><strong>Testing workspace.</strong> Practice freely: test data is separate from official records. Deletion here is permanent, and you can reset everything from Settings.</div>'
    : '<div class="alert official"><strong>Official North Heights inventory.</strong> These are the congregation\'s working records. Deleted items can be recovered from Trash.</div>';
}
function actionBtn(action,label,id='',cls='btn sm') { return '<button class="'+cls+'" data-action="'+E(action)+'"'+(id?' data-id="'+E(id)+'"':'')+'>'+E(label)+'</button>'; }
function photoThumbnail(item) { return item.photoUrl?'<img class="item-photo" alt="Item photo" src="'+E(item.photoUrl)+'" loading="lazy">':'<div class="photo-placeholder">▣</div>'; }
function roomCard(room) {
  const entry=state.roomStats.get(room.id)||{types:0,units:0};
  const count=entry.units;
  const percent = room.status === 'verified' ? 100 : room.status === 'ready-for-review' ? 85 : room.status === 'in-progress' ? 55 : 0;
  return '<button class="room-card" data-action="openRoom" data-id="' + E(room.id) + '"><div class="room-icon">⌂</div><div class="room-title">' + E(room.name) + '</div><div class="room-desc">' + E(room.description || 'Open this room to review its contents') + '</div><div class="room-assignee">' + E(room.assignedTo?'Assigned: '+getPerson(room.assignedTo):'Unassigned') + '</div><div class="room-bottom"><span class="small muted">' + number(entry.types) + ' types · ' + number(count) + ' units</span>' + statusBadge(room.status) + '</div><div class="progress"><span style="width:' + percent + '%"></span></div></button>';
}
function metrics() {
  const rooms = activeRooms(), items = activeItems();
  const verified = rooms.filter(r => r.status === 'verified').length;
  const count = items.reduce((s,i) => s + (i.quantity || 0), 0);
  return '<div class="metrics">' + [
    ['Rooms',rooms.length,'Areas created'],
    ['Item types',items.length,'Distinct inventory entries'],
    ['Total units',number(count),'Individual items counted'],
    ['Verified',rooms.length ? Math.round(verified/rooms.length*100) + '%' : '0%',verified + ' of ' + rooms.length + ' rooms']
  ].map(m => '<div class="metric"><div class="metric-label">' + E(m[0]) + '</div><div class="metric-number">' + E(m[1]) + '</div><div class="metric-foot">' + E(m[2]) + '</div></div>').join('') + '</div>';
}
function empty(symbol,title,description,action='') {
  return '<div class="empty"><div class="empty-symbol">' + symbol + '</div><h3>' + E(title) + '</h3><p>' + E(description) + '</p>' + action + '</div>';
}
function dashboard() {
  const rooms = activeRooms();
  let html = header('Inventory overview','Track the rooms, inventory, and counting progress at North Heights Church of Christ.',
    (canEdit()?'<button class="btn primary" data-action="newItem">+ Add item</button><button class="btn" data-action="newRoom">+ New room</button>':''));
  html += modeBanner() + metrics();
  html += '<div class="overview"><div class="panel panel-pad"><div class="section-head"><h2>Rooms & spaces</h2><button class="btn sm" data-action="go" data-page="rooms">View all</button></div>';
  html += rooms.length ? '<div class="room-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">' + rooms.slice(0,6).map(roomCard).join('') + '</div>'
    : empty('⌂','No rooms created','Start by adding an auditorium, classroom, office, or another space.',(canEdit()?'<button class="btn primary" data-action="newRoom">Create first room</button>':''));
  html += '</div><div class="panel panel-pad"><div class="section-head"><h2>Room status</h2></div>';
  const groups = [['verified','Verified'],['ready-for-review','Ready for review'],['in-progress','In progress'],['not-started','Not started']];
  html += groups.map(([status,label]) => {
    const count = rooms.filter(r => (r.status || 'not-started') === status).length;
    const percent = rooms.length ? Math.round(100*count/rooms.length) : 0;
    return '<div style="margin-bottom:19px"><div class="room-bottom"><strong class="small">' + label + '</strong><span class="small muted">' + count + ' rooms</span></div><div class="progress"><span style="width:' + percent + '%"></span></div></div>';
  }).join('');
  html += '<p class="small muted">Mark rooms Verified after you and your inventory partner have finished reviewing them.</p></div></div>';
  return html;
}
function roomsPage() {
  const rooms = activeRooms();
  return header('Rooms & spaces','Organize every area of the church building.',(canEdit()?'<button class="btn primary" data-action="newRoom">+ Create room</button>':'')+
    '<button class="btn" data-p4="allLabels">Print QR labels</button>') +
    modeBanner() + (rooms.length ? '<div class="room-grid">' + rooms.map(roomCard).join('') + '</div>' :
    empty('⌂','No rooms yet','Create your first room to begin counting.',(canEdit()?'<button class="btn primary" data-action="newRoom">+ Create room</button>':'')));
}
function searchBar() { return '<input id="inventorySearch" class="search" aria-label="Search inventory" placeholder="Search items, categories or notes..." value="' + E(state.search) + '">'; }
function itemRows(items, showRoom) {
  const search=state.search.trim().toLowerCase();
  items=items.filter(i=>!search||[i.name,i.category,i.notes,roomName(i.roomId)].some(v=>String(v||'').toLowerCase().includes(search)));
  if(!items.length)return empty('▣',search?'Nothing matches your search':'No items recorded',search?'Try another search term.':'Add the first item to this inventory.');
  const totalMatches=items.length;items=items.slice(0,state.itemLimit);
  return '<div class="panel table-scroll"><table class="item-table"><thead><tr><th>Item</th>'+(showRoom?'<th>Room</th>':'')+
    '<th class="hide-mobile">Category</th><th>Quantity</th><th class="hide-mobile">Condition</th><th>Actions</th></tr></thead><tbody>'+
    items.sort((a,b)=>a.name.localeCompare(b.name)).map(i=>'<tr><td><div class="item-with-photo">'+photoThumbnail(i)+
    '<div><div class="item-name">'+E(i.name)+'</div><div class="item-sub">'+E((i.notes||'').slice(0,85))+'</div>'+
    (phase4.queuedFor(i.id)?'<div class="p4-pending-note">Pending local '+(phase4.queuedFor(i.id)>0?'+':'')+phase4.queuedFor(i.id)+' (not synced)</div>':'')+
    '</div></div></td>'+
    (showRoom?'<td class="small">'+E(roomName(i.roomId))+'</td>':'')+
    '<td class="hide-mobile small">'+E(i.category||'Other')+'</td>'+
    '<td><div class="count">'+(canEdit()?'<button title="Remove one" aria-label="Remove one '+E(i.name)+'" class="count-btn" data-action="count" data-id="'+E(i.id)+'" data-delta="-1" '+(i.quantity<=0?'disabled':'')+'>−</button>':'')+
    '<strong>'+number(i.quantity)+'</strong>'+(canEdit()?'<button title="Add one" aria-label="Add one '+E(i.name)+'" class="count-btn" data-action="count" data-id="'+E(i.id)+'" data-delta="1">+</button>':'')+'</div></td>'+
    '<td class="hide-mobile"><span class="small muted">'+E(i.condition||'Not assessed')+'</span></td>'+
    '<td><div class="inline-actions">'+(canEdit()?
    actionBtn('quick','Quick count',i.id)+actionBtn('editItem','Edit',i.id)+actionBtn('deleteItem','Delete',i.id,'btn sm danger')
    :'<span class="small muted">View only</span>')+'</div></td></tr>').join('')+'</tbody></table></div>'+
    (totalMatches>state.itemLimit?'<div class="panel-pad p4-loadmore">Showing '+items.length+' of '+totalMatches+' items <button class="btn" data-action="loadMore">Show more</button></div>':'');
}
function itemsPage() {
  return header('All inventory','Everything currently recorded throughout the church building.',
    (canEdit()?'<button class="btn primary" data-action="newItem">+ Add item</button>':'')+
    '<button class="btn" data-action="export">↓ Export CSV</button><button class="btn" data-action="print">Print</button>')+
    modeBanner()+'<div class="toolbar">'+searchBar()+'<span class="small muted">'+number(activeItems().length)+' item types</span></div>'+itemRows(activeItems(),true);
}
function roomPage() {
  const room=findRoom(state.roomId);if(!room||room.deletedAt)return roomsPage();
  const entries=activeItems().filter(i=>i.roomId===room.id);
  const buttons=canEdit()?
    '<button class="btn primary" data-action="newItem" data-id="'+E(room.id)+'">+ Add item</button>'+
    '<button class="btn" data-action="editRoom" data-id="'+E(room.id)+'">Edit room</button>'+
    '<button class="btn danger" data-action="deleteRoom" data-id="'+E(room.id)+'">Delete room</button>':'';
  let review='';
  if(canEdit()) {
    if(room.status==='ready-for-review') review=canVerifyRoom(room)?'<button class="btn primary" data-action="verifyRoom" data-id="'+E(room.id)+'">✓ Verify this room</button>':'<span class="small muted">Awaiting another inventory collaborator to verify.</span>';
    else if(room.status!=='verified') review='<button class="btn primary" data-action="submitRoom" data-id="'+E(room.id)+'">Submit for review</button>';
    else review='<span class="small muted">Verified by '+E(getPerson(room.verifiedBy))+'</span>';
  }
  return '<button class="back-link" data-action="go" data-page="rooms">← All rooms</button>'+
    header(room.name,room.description||'Inventory items in this room.',buttons+
    '<button class="btn" data-p4="label" data-id="'+E(room.id)+'">QR label</button>')+modeBanner()+
    '<div class="room-detail-bar"><span class="small muted">Inventory status</span>'+statusBadge(room.status)+
    '<span class="small muted">'+number(entries.reduce((n,i)=>n+i.quantity,0))+' total units</span></div>'+
    '<div class="review-bar"><div><strong>Room verification</strong><p class="small muted">'+
    (room.status==='ready-for-review'?'Submitted by '+E(getPerson(room.submittedBy))+'. Another person should confirm the count.':
     room.status==='verified'?'This room has been verified. Item edits automatically flag it for rechecking.':
     'Count and check the contents, then submit the room for a second-person review.')+
    '</p><span class="small muted">Assigned to: '+E(getPerson(room.assignedTo))+'</span></div>'+review+'</div>'+
    '<div class="toolbar">'+searchBar()+'</div>'+itemRows(entries,false);
}
function activityPage() {
  const events=state.activity;
  return header('Activity history','Recent recorded changes to rooms and items.')+modeBanner()+
    '<div class="panel panel-pad"><div class="section-head"><h2>Latest activity</h2><span class="small muted">Up to 120 recent events</span></div>'+
    (events.length?events.map(event=>{
      const date=event.createdAt?.toDate?.()?.toLocaleString()||'Just now';
      const qty=event.changedKeys?.includes('quantity')?' · Quantity: '+number(event.beforeQuantity??0)+' → '+number(event.afterQuantity??0):'';
      return '<div class="list-row"><div><strong>'+E(event.recordName||'Unknown record')+'</strong><p>'+E(event.recordType)+' '+E(event.operation)+' · '+E(getPerson(event.actorUid))+E(qty)+'</p></div><span class="small muted">'+E(date)+'</span></div>';
    }).join(''):empty('◷','No activity recorded','Changes appear here after Cloud Functions deployment.'))+
    '<p class="small muted" style="margin-top:12px">Test deletions may not identify the deleting person. This is an operational history, not an immutable legal audit trail.</p></div>';
}
function trashPage() {
  if (state.space === 'test') return header('Trash','Test records are deleted permanently.') + empty('♻','Trash is for official records','In testing, deletes are permanent and a complete reset is available in Settings.');
  const rooms = state.rooms.filter(r=>r.deletedAt), items = state.items.filter(i=>i.deletedAt);
  const row = (label,kind,id,detail) => '<div class="list-row"><div><strong>' + E(label) + '</strong><p>' + E(detail) + '</p></div><button class="btn sm" data-action="' + (kind==='room'?'restoreRoom':'restoreItem') + '" data-id="' + E(id) + '">Restore</button></div>';
  return header('Trash','Restore rooms and items removed from the official inventory.') + modeBanner() +
    '<div class="panel panel-pad"><h2>Deleted rooms (' + rooms.length + ')</h2>' +
    (rooms.length ? rooms.map(r=>row(r.name,'room',r.id,'Room and items deleted with it can be restored together.')).join('') : '<p class="muted small">No deleted rooms.</p>') +
    '<hr style="border:0;border-top:1px solid var(--line);margin:22px 0"><h2>Deleted items (' + items.length + ')</h2>' +
    (items.length ? items.map(i=>row(i.name,'item',i.id,roomName(i.roomId) + (i.deletedWithRoom ? ' · removed with room' : ''))).join('') : '<p class="muted small">No deleted items.</p>') + '</div>';
}
function settingsPage() {
  const users=state.members.filter(m=>m.active!==false);
  const pending=state.invites.filter(i=>!i.revoked&&!i.redeemedBy&&(i.expiresAt?.toMillis?.()||0)>Date.now());
  const memberRow=u=>'<div class="setting-row"><div><strong>'+E(u.displayName||u.email)+'</strong><p>'+E(u.email||'')+' · '+E(u.role)+'</p></div>'+
    (isOwner()&&u.id!==state.user.uid?'<button class="btn sm danger" data-action="disableMember" data-id="'+E(u.id)+'">Revoke access</button>':'')+'</div>';
  const invites=pending.map(i=>'<div class="setting-row"><div><strong>'+E(i.role)+'</strong><p>'+E(i.email||'Any email')+' · Expires '+E(i.expiresAt?.toDate?.()?.toLocaleDateString()||'in 7 days')+'</p></div>'+
    '<button class="btn sm danger" data-action="revokeInvite" data-id="'+E(i.id)+'">Revoke code</button></div>').join('');
  const ownerSection=isOwner()?'<div class="panel panel-pad" style="margin-top:18px"><h2>Authorization codes</h2>'+
    '<p class="small muted">Issue a single-use invitation that expires after seven days. The code appears only once, so copy it before leaving this page.</p>'+
    '<form id="inviteForm" class="form-grid"><div class="field"><label>Permission level</label><select name="role"><option value="inventory">Inventory collaborator (edit/count/verify)</option><option value="member">Congregation member (read-only)</option></select></div>'+
    '<div class="field"><label>Restrict to email (recommended)</label><input type="email" name="email" placeholder="member@example.com"></div>'+
    '<div class="field full-span"><button type="submit" class="btn primary">Generate authorization code</button></div></form>'+
    (state.latestInvite?'<div class="issued-code"><strong>New one-time code</strong><p class="auth-code">'+E(state.latestInvite)+'</p><button class="btn sm" data-action="copyInvite">Copy code</button><p class="small">Send this code privately. It will not be shown again after a refresh.</p></div>':'')+
    '<h3 style="margin-top:25px">Unredeemed invitations ('+pending.length+')</h3>'+(invites||'<p class="small muted">No pending codes.</p>')+
    '<h3 style="margin-top:24px">Authorized users ('+users.length+')</h3>'+(users.map(memberRow).join('')||'<p class="small muted">Loading users...</p>')+
    '</div>':'';
  return header('Settings','Manage your workspace, account, and access permissions.')+modeBanner()+
    '<div class="panel panel-pad"><h2>Account & workspace</h2>'+
    '<div class="setting-row"><div><strong>Signed-in account</strong><p>'+E(state.user?.email||'')+'</p></div><span class="badge slate">'+E(state.member?.role||'member')+'</span></div>'+
    '<div class="setting-row"><div><strong>Current workspace</strong><p>Switch between testing and official records using the top selector.</p></div><span class="badge '+(state.space==='test'?'test':'official')+'">'+(state.space==='test'?'TEST':'OFFICIAL')+'</span></div>'+
    '<div class="setting-row"><div><strong>Reports and archives</strong><p>Open Phase 3 PDF/CSV reports, condition summaries, and inventory snapshots.</p></div><button class="btn" data-action="go" data-page="reports">Open reports</button></div>'+
    '<div class="setting-row"><div><strong>Activity history</strong><p>Review recent modifications across the inventory.</p></div><button class="btn" data-action="go" data-page="activity">View history</button></div>'+
    (state.space==='official'?'<div class="setting-row"><div><strong>Recoverable Trash</strong><p>Restore official rooms and items removed from inventory.</p></div><button class="btn" data-action="go" data-page="trash">Open Trash</button></div>':'')+
    '<div class="setting-row"><div><strong>Export active inventory</strong><p>Download a CSV containing rooms and item quantities.</p></div><button class="btn" data-action="export">Export CSV</button></div>'+
    (state.space==='test'&&canEdit()?
      '<div class="setting-row"><div><strong>Generate sample data</strong><p>Add four sample rooms and several items for testing.</p></div><button class="btn" data-action="seed">Generate examples</button></div>'+
      '<div class="setting-row"><div><strong>Reset test workspace</strong><p style="color:#a33">Permanently remove test rooms and items. Official data is unaffected.</p></div><button class="btn danger" data-action="reset">Reset test data</button></div>':
      '<div class="setting-row"><div><strong>Official record protection</strong><p>Official deletes enter Trash for recovery.</p></div><span class="badge">Enabled</span></div>')+
    '<div class="setting-row"><div><strong>Sign out</strong><p>End the current session.</p></div><button class="btn" data-action="logout">Sign out</button></div></div>'+
    '<div class="panel panel-pad" style="margin-top:18px"><h2>Inventory tools</h2>'+
    '<div class="btn-row"><button class="btn" data-action="go" data-page="dispositions">Dispositions</button>'+
    '<button class="btn" data-action="go" data-page="reports">Reports</button>'+
    '<button class="btn" data-action="go" data-page="activity">Activity</button>'+
    (state.space==='official'?'<button class="btn" data-action="go" data-page="trash">Trash</button>':'')+'</div></div>'+
    ownerSection+phase4.settingPanel()+'<p class="small muted" style="margin-top:16px">North Heights Inventory · Phase 2 · GitHub Pages + Firebase</p>';
}
function mainHTML() {
  if (!state.ready) return '<div class="empty"><h3>Loading inventory...</h3><p>Synchronizing your rooms and items securely.</p></div>';
  if (state.page === 'dashboard') return dashboard();
  if (state.page === 'rooms') return roomsPage();
  if (state.page === 'room') return roomPage();
  if (state.page === 'items') return itemsPage();
  if (state.page === 'trash') return trashPage();
  if (state.page === 'activity') return activityPage();
  if (state.page === 'dispositions') return phase3.dispositionPage();
  if (state.page === 'reports') return phase3.reportPage();
  if (state.page === 'sync') return phase4.syncPage();
  return settingsPage();
}
function render() {
  if (!state.user)return;
  const syncSummary=phase4.summary();
  const currentNav = state.page === 'room' ? 'rooms' : state.page;
  const nav = NAV.filter(n=>n[0] !== 'trash' || state.space === 'official');
  $('app').innerHTML = '<div class="app-shell"><aside class="sidebar"><div class="sidebar-brand"><div class="brand-mark">NH</div><div><div class="brand-title">North Heights</div><div class="brand-sub">INVENTORY SYSTEM</div></div></div><div><div class="sidebar-label">WORKSPACE</div><nav class="nav">' +
    nav.map(([id,icon,title])=>'<button class="nav-link ' + (currentNav===id?'active':'') + '" data-action="go" data-page="' + id + '"><span class="nav-symbol">' + icon + '</span>' + title + '</button>').join('') +
    '</nav></div><div class="sidebar-spacer"></div><div class="sidebar-user"><div class="avatar">' + E((state.member?.displayName || state.user.email || 'N').charAt(0).toUpperCase()) + '</div><div style="min-width:0"><div class="user-name">' + E(state.member?.displayName || state.user.email) + '</div><div class="user-role">' + E(state.member?.role || 'member') + ' · North Heights</div></div></div></aside>' +
    '<main class="main"><div class="topbar"><div><div class="topbar-sub">North Heights Church of Christ</div><div class="topbar-heading">Inventory Management</div></div><div class="view-mode"><button id="p4Status" class="btn sm" data-p4="openSync">'+
    (syncSummary.online?'● Online':'● Offline')+(syncSummary.count?' · '+syncSummary.count+' pending':'')+
    '</button><span class="hide-mobile">Workspace</span><select class="mode-select" id="spaceSelector" aria-label="Select workspace"><option value="test" ' + (state.space==='test'?'selected':'') + '>◆ TEST MODE</option><option value="official" ' + (state.space==='official'?'selected':'') + '>● OFFICIAL</option></select></div></div><div class="content" id="mainContent">' + mainHTML() + '</div></main>' +
    '<nav class="mobile-nav">' + [['dashboard','▦','Home'],['rooms','▤','Rooms'],['items','▣','Items'],['sync','⇡','Sync'],['settings','⚙','More']].map(([id,icon,label])=>'<button class="mobile-tab ' + (currentNav===id?'active':'') + '" data-action="go" data-page="' + id + '"><span>' + icon + '</span>' + label + '</button>').join('') + '</nav></div>';
}
function renderMain() { const target = $('mainContent'); if (target) target.innerHTML = mainHTML(); }
function openModal(html) { const modal = $('modal'); modal.innerHTML = '<div class="modal-inner">' + html + '</div>'; if (!modal.open) modal.showModal(); }
function closeModal() { $('modal').close(); $('modal').innerHTML = ''; }
function modalHeading(title) { return '<div class="modal-head"><h2>' + E(title) + '</h2><button class="modal-close" type="button" data-action="closeModal" aria-label="Close">×</button></div>'; }
function roomEditor(room=null) {
  if(!canEdit())return toast('Your account has read-only access.',true);
  const users=state.members.filter(u=>['owner','inventory'].includes(u.role));
  openModal(modalHeading(room?'Edit room':'Create room')+
    '<form id="roomForm" method="dialog" class="form-stack"><input type="hidden" name="id" value="'+E(room?.id||'')+'">'+
    '<div class="field"><label>Room name *</label><input name="name" maxlength="120" required autofocus placeholder="e.g. Auditorium" value="'+E(room?.name||'')+'"></div>'+
    '<div class="field"><label>Description (optional)</label><textarea name="description" maxlength="3000">'+E(room?.description||'')+'</textarea></div>'+
    '<div class="field"><label>Assigned inventory worker</label><select name="assignedTo"><option value="">Unassigned</option>'+
    users.map(u=>'<option value="'+E(u.id)+'" '+(room?.assignedTo===u.id?'selected':'')+'>'+E(u.displayName||u.email)+'</option>').join('')+
    '</select></div>'+
    '<div class="field"><label>Progress</label><select name="status">'+
    Object.entries(STATUS).filter(([k])=>['not-started','in-progress'].includes(k)).map(([k,v])=>'<option value="'+E(k)+'" '+((room?.status||'not-started')===k?'selected':'')+'>'+E(v)+'</option>').join('')+
    '</select><span class="small muted">Use Submit for Review and Verify in the room to complete a review.</span></div>'+
    '<p class="form-error" id="roomFormError" role="alert" aria-live="assertive"></p><div class="modal-foot"><button type="button" class="btn" data-action="closeModal">Cancel</button><button class="btn primary" type="button" data-room-save>Save room</button></div></form>');
  const form=$('roomForm');
  bindRoomSaveForm(form,{
    performSave: async fd=>{
      if(!canEdit() || !state.user)throw new Error('Your account does not have editing access.');
      const space=state.space;
      const id=String(fd.get('id')||''),name=String(fd.get('name')||'').trim();
      if(!name || name.length>120)throw new Error('Enter a room name up to 120 characters.');
      const original=id?findRoom(id):null;
      if(id && !original)throw new Error('This room is no longer available. Refresh and try again.');
      const status=String(fd.get('status')||'not-started');
      if(!['not-started','in-progress'].includes(status))throw new Error('Invalid room status.');
      const values={
        name,description:String(fd.get('description')||'').trim(),status,
        assignedTo:String(fd.get('assignedTo')||''),
        reviewNote:original?.reviewNote||'',
        submittedBy:original?.submittedBy||'',
        submittedAt:original?.submittedAt||null,
        verifiedBy:original?.verifiedBy||'',
        verifiedAt:original?.verifiedAt||null,
        updatedAt:serverTimestamp(),updatedBy:state.user.uid
      };
      if(original?.status==='verified'){
        values.verifiedAt=null;values.verifiedBy='';
        values.reviewNote='Room changed after verification; recheck required.';
      }
      let reference;
      if(id){
        reference=roomRef(id);
        await updateDoc(reference,values);
      }else{
        reference=await addDoc(roomsPath(),{
          ...values,createdAt:serverTimestamp(),createdBy:state.user.uid,deletedAt:null
        });
      }
      return {id:reference.id,name,space,created:!id};
    },
    onSuccess: async result=>{
      closeModal();
      toast((result.created?'Room created: ':'Room updated: ')+result.name);
      if(state.space===result.space)showPage('rooms');
    },
    onFailure: error=>{
      if(error?.code==='permission-denied')
        toast('Firestore rejected the room save. Review the message in the editor.',true);
    }
  });
}
function itemEditor(item=null, defaultRoom=null) {
  if(!canEdit())return toast('Your account has read-only access.',true);
  const rooms=activeRooms();
  if(!rooms.length){toast('Create a room first, then add items.',true);return roomEditor();}
  const selected=item?.roomId||defaultRoom||rooms[0].id;
  const categories=[...new Set([...CATEGORIES,...state.items.map(i=>i.category).filter(Boolean)])].sort();
  openModal(modalHeading(item?'Edit item':'Add inventory item')+
    '<form id="itemForm" method="dialog" class="form-grid"><input type="hidden" name="id" value="'+E(item?.id||'')+'">'+
    '<div class="field full-span"><label>Item name *</label><input name="name" maxlength="160" required autofocus placeholder="e.g. Folding Chairs" value="'+E(item?.name||'')+'"></div>'+
    '<div class="field"><label>Room *</label><select name="roomId" required>'+rooms.map(r=>'<option value="'+E(r.id)+'" '+(r.id===selected?'selected':'')+'>'+E(r.name)+'</option>').join('')+'</select></div>'+
    '<div class="field"><label>Quantity *</label><input name="quantity" type="number" required min="0" max="1000000" step="1" value="'+E(item?.quantity??1)+'"></div>'+
    '<div class="field"><label>Category</label><input name="category" maxlength="100" list="categoryOptions" value="'+E(item?.category||'Furniture')+'"><datalist id="categoryOptions">'+categories.map(c=>'<option value="'+E(c)+'"></option>').join('')+'</datalist></div>'+
    '<div class="field"><label>Condition</label><select name="condition">'+CONDITIONS.map(c=>'<option value="'+E(c)+'" '+((item?.condition||'Not assessed')===c?'selected':'')+'>'+E(c)+'</option>').join('')+'</select></div>'+
    '<div class="field full-span"><label>Notes (optional)</label><textarea name="notes" maxlength="5000">'+E(item?.notes||'')+'</textarea></div>'+
    (item?.photoUrl?'<div class="field full-span"><img src="'+E(item.photoUrl)+'" alt="Current item photo" class="photo-preview">'+
    actionBtn('removePhoto','Remove photo',item.id,'btn sm danger')+'</div>':'')+
    '<div class="field full-span"><label>Photograph (optional)</label><input type="file" name="photo" accept="image/*" capture="environment">'+
    '<span class="small muted">Maximum 8 MB. A new photo replaces the previous one.</span></div>'+
    '<p id="itemFormError" class="form-error full-span"></p><div class="modal-foot full-span"><button type="button" class="btn" data-action="closeModal">Cancel</button><button type="submit" class="btn primary">Save item</button></div></form>');
}
function quickCount(item) {
  if(!canEdit())return;
  openModal(modalHeading('Quick count · '+item.name)+
    '<p class="muted small">Current quantity: <strong>'+number(item.quantity)+'</strong></p>'+
    '<div class="quick-grid">'+[-10,-5,-1,1,5,10].map(n=>'<button class="btn '+(n>0?'primary':'')+'" data-action="quickAdjust" data-id="'+E(item.id)+'" data-delta="'+n+'">'+(n>0?'+':'')+n+'</button>').join('')+'</div>'+
    '<div class="modal-foot"><button class="btn" data-action="closeModal">Done</button></div>');
}
async function adjustCount(item,delta){return phase4.adjust(item,delta);}
async function removePhoto(item) {
  if(!item?.photoPath)return;
  await deleteObject(storageRef(storage,item.photoPath));
  await updateDoc(itemRef(item.id),{photoPath:'',photoUrl:'',updatedBy:state.user.uid,updatedAt:serverTimestamp()});
  closeModal();toast('Photograph removed.');
}
function confirmDialog(title,description,accept,callback,danger=true) {
  state.confirm = callback;
  openModal(modalHeading(title) + '<p class="muted small" style="line-height:1.6">' + E(description) + '</p><div class="modal-foot"><button class="btn" data-action="closeModal">Cancel</button><button class="btn ' + (danger?'danger':'primary') + '" data-action="confirm">' + E(accept) + '</button></div>');
}
async function writeChunks(ops) {
  for (let i=0; i<ops.length; i+=350) {
    const batch = writeBatch(db);
    for (const action of ops.slice(i,i+350)) {
      if (action.type==='delete') batch.delete(action.ref);
      else if (action.type==='set') batch.set(action.ref,action.data);
      else batch.update(action.ref,action.data);
    }
    await batch.commit();
  }
}
async function deleteItem(item){
  if(state.space==='test'){
    await deleteDoc(itemRef(item.id));
    if(item.photoPath)deleteObject(storageRef(storage,item.photoPath)).catch(console.warn);
  }else{
    await actions.writeInventoryItem(state.space,item,{
      deletedAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:state.user.uid,
      roomId:item.roomId,quantity:item.quantity,name:item.name,condition:item.condition
    });
  }
  actions.logActivity(state.space,{recordType:'item',recordId:item.id,recordName:item.name,
    roomId:item.roomId,operation:'deleted',changedKeys:['deletedAt']}).catch(console.warn);
  toast('Item '+(state.space==='test'?'deleted.':'moved to Trash.'));
}
async function deleteRoom(room){
  if(state.space==='test'){
    const contents=state.items.filter(i=>i.roomId===room.id);
    await writeChunks([...contents.map(i=>({type:'delete',ref:itemRef(i.id)})),{type:'delete',ref:roomRef(room.id)}]);
    await Promise.all(contents.filter(i=>i.photoPath).map(i=>deleteObject(storageRef(storage,i.photoPath)).catch(console.warn)));
  }else{
    // Archive only the parent room; existing items stay attached and are hidden
    // until the room is restored. This prevents dangling or inconsistent child updates.
    await updateDoc(roomRef(room.id),{
      deletedAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:state.user.uid,
      ...(room.status==='verified'?{status:'in-progress',verifiedAt:null,verifiedBy:'',reviewNote:'Room archived after verification.'}:{})
    });
  }
  actions.logActivity(state.space,{recordType:'room',recordId:room.id,recordName:room.name,
    operation:'deleted',changedKeys:['deletedAt']}).catch(console.warn);
  toast('Room '+(state.space==='test'?'deleted.':'moved to Trash.'));
  showPage('rooms');
}
async function restoreRoom(room){
  await updateDoc(roomRef(room.id),{deletedAt:null,updatedAt:serverTimestamp(),updatedBy:state.user.uid});
  // Backward compatibility with Phase 2 records where room deletion archived children.
  for(const item of state.items.filter(i=>i.roomId===room.id && i.deletedAt && i.deletedWithRoom)){
    await actions.writeInventoryItem(state.space,item,{deletedAt:null,deletedWithRoom:false,
      updatedAt:serverTimestamp(),updatedBy:state.user.uid,roomId:item.roomId,
      quantity:item.quantity,name:item.name,condition:item.condition});
  }
  toast('Room restored.');
}
async function restoreItem(item){
  const room=findRoom(item.roomId);
  if(!room||room.deletedAt){toast('Restore the parent room first.',true);return;}
  await actions.writeInventoryItem(state.space,item,{deletedAt:null,deletedWithRoom:false,
    updatedAt:serverTimestamp(),updatedBy:state.user.uid,roomId:item.roomId,
    quantity:item.quantity,name:item.name,condition:item.condition});
  toast('Item restored.');
}
function exportCSV() {
  const rows = [['Room','Room status','Item name','Category','Quantity','Condition','Notes']];
  const items = activeItems().sort((a,b)=>roomName(a.roomId).localeCompare(roomName(b.roomId))||a.name.localeCompare(b.name));
  for (const i of items) rows.push([roomName(i.roomId),STATUS[findRoom(i.roomId)?.status] || '',i.name,i.category,i.quantity,i.condition,i.notes]);
  // Include rooms with no inventory so the room list is preserved.
  for (const r of activeRooms().filter(r=>!items.some(i=>i.roomId===r.id))) rows.push([r.name,STATUS[r.status] || '', '', '', '', '', '']);
  const csv = '\uFEFF' + rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = 'north-heights-' + state.space + '-inventory-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500);
  toast('CSV downloaded.');
}
async function seedTest() {
  if (state.space !== 'test') return;
  const samples = [
    {name:'Auditorium',description:'Main worship area',status:'in-progress',items:[['Padded Pews',24,'Furniture'],['Communion Table',1,'Worship Supplies'],['Songbooks',70,'Books & Literature'],['Podium',1,'Furniture']]},
    {name:'Fellowship Hall',description:'Shared meals and events',status:'not-started',items:[['Folding Chairs',48,'Furniture'],['Folding Tables',8,'Furniture']]},
    {name:'Classroom 1',description:'Teaching room',status:'not-started',items:[['Student Chairs',16,'Furniture'],['Whiteboard',1,'Office Supplies']]},
    {name:'Kitchen',description:'Kitchen and storage area',status:'not-started',items:[['Refrigerator',1,'Kitchen'],['Coffee Makers',2,'Kitchen']]}
  ];
  const actions=[];
  for(const sample of samples) {
    const ref = doc(roomsPath());
    actions.push({type:'set',ref,data:{name:sample.name,description:sample.description,status:sample.status,assignedTo:'',reviewNote:'',submittedBy:'',submittedAt:null,verifiedBy:'',verifiedAt:null,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:state.user.uid,updatedBy:state.user.uid,deletedAt:null}});
    for(const [name,quantity,category] of sample.items) {
      actions.push({type:'set',ref:doc(itemsPath()),data:{name,quantity,category,roomId:ref.id,condition:'Not assessed',notes:'Sample data — replace or delete before official use.',photoPath:'',photoUrl:'',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:state.user.uid,updatedBy:state.user.uid,deletedAt:null,deletedWithRoom:false}});
    }
  }
  await writeChunks(actions); toast('Sample inventory added to Test workspace.');
}
async function resetTest() {
  if(state.space!=='test'||!canEdit())return;
  const response=prompt('Type RESET TEST to permanently delete ALL TEST rooms, items, photographs, disposition proposals, snapshots, and activity. Official records are not affected.');
  if(response!=='RESET TEST'){toast('Reset cancelled.');return;}
  const result=await call('resetTestWorkspace',{confirm:'RESET TEST'});
  toast(result?.data?.photoCleanupWarning?'Test records reset; some test photos may need manual cleanup.':'Testing workspace fully reset.');
  showPage('dashboard');
}
function switchSpace(space) {
  if (!['test','official'].includes(space) || space===state.space) return;
  state.space=space;state.page='dashboard';state.roomId=null;state.search='';state.itemLimit=80;subscribe();
}
document.addEventListener('change', async event => {
  if(phase3.handleChange(event))return;
  const target = event.target;
  if (target.id==='spaceSelector') { switchSpace(target.value); return; }

});
document.addEventListener('input', event => {
  if(phase3.handleInput(event)) return;
  if(event.target.id !== 'inventorySearch') return;
  state.search = event.target.value;state.itemLimit=80;
  const start = event.target.selectionStart;
  renderMain();
  const input=$('inventorySearch');
  if(input) { input.focus(); input.setSelectionRange(start,start); }
});
document.addEventListener('click', async event => {
  const phase4Button=event.target.closest('[data-p4]');
  if(phase4Button){phase4.handleClick(phase4Button);return;}
  const phaseButton=event.target.closest('[data-p3]');
  if(phaseButton){await phase3.handleClick(phaseButton);return;}
  const button = event.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action, id = button.dataset.id;
  try {
    if(action==='go') return showPage(button.dataset.page);
    if(action==='openRoom')return showPage('room',id);
    if(action==='loadMore'){state.itemLimit+=80;renderMain();return;}
    if(['newRoom','editRoom','newItem','editItem','count','quick','quickAdjust','deleteItem','deleteRoom','restoreRoom','restoreItem','submitRoom','verifyRoom','removePhoto','seed','reset'].includes(action) && !canEdit()) throw new Error('This account has read-only access.');
    if(['createInvite','revokeInvite','disableMember'].includes(action) && !isOwner()) throw new Error('Only the owner can manage accounts.');
    if(action==='newRoom') return roomEditor();
    if(action==='editRoom') return roomEditor(findRoom(id));
    if(action==='newItem') return itemEditor(null,id);
    if(action==='editItem') return itemEditor(state.items.find(i=>i.id===id));
    if(action==='closeModal') return closeModal();
    if(action==='quick')return quickCount(state.items.find(i=>i.id===id));
    if(action==='removePhoto'){
      const item=state.items.find(i=>i.id===id);
      return confirmDialog('Remove item photo?','The current photo will be deleted.','Remove photo',()=>removePhoto(item));
    }
    if(action==='quickAdjust'){
      const item=state.items.find(i=>i.id===id);await adjustCount(item,Number(button.dataset.delta));
      closeModal();return;
    }
    if(action==='submitRoom') {
      const room=findRoom(id);
      return confirmDialog('Submit '+room.name+' for review?','Another inventory collaborator will need to check and verify this room.','Submit room',async()=>{
        await updateDoc(roomRef(id),{status:'ready-for-review',submittedBy:state.user.uid,submittedAt:serverTimestamp(),verifiedBy:'',verifiedAt:null,reviewNote:'',updatedBy:state.user.uid,updatedAt:serverTimestamp(),assignedTo:room.assignedTo||''});
        toast('Room submitted for independent verification.');
      },false);
    }
    if(action==='verifyRoom'){
      const room=findRoom(id);if(!canVerifyRoom(room))throw new Error('A different collaborator must verify official rooms.');
      return confirmDialog('Verify '+room.name+'?','Confirm that you personally reviewed the room and its counts.','Verify inventory',async()=>{
        await updateDoc(roomRef(id),{status:'verified',verifiedBy:state.user.uid,verifiedAt:serverTimestamp(),updatedBy:state.user.uid,updatedAt:serverTimestamp()});
        toast('Room verified.');
      },false);
    }
    if(action==='copyInvite'){
      if(state.latestInvite){await navigator.clipboard.writeText(state.latestInvite);toast('Authorization code copied.');}return;
    }
    if(action==='revokeInvite'){
      return confirmDialog('Revoke invitation?','The authorization code will no longer allow registration.','Revoke code',async()=>{
        await call('revokeInvite',{inviteId:id});toast('Invitation revoked.');
      });
    }
    if(action==='disableMember'){
      const person=state.members.find(u=>u.id===id);
      return confirmDialog('Remove member access?','This will prevent '+(person?.displayName||'this person')+' from opening North Heights records. Their Authentication user will remain in Firebase.','Remove access',async()=>{
        await call('disableMember',{uid:id});toast('Member access revoked.');
      });
    }
    if(action==='count') {
      const item=state.items.find(i=>i.id===id),delta=Number(button.dataset.delta);
      if(!item||item.deletedAt)return;
      await adjustCount(item,delta);return;
    }
    if(action==='deleteItem') {
      const item=state.items.find(i=>i.id===id); if(!item) return;
      return confirmDialog('Delete ' + item.name + '?',state.space==='test'?'This permanently deletes the test item.':'The item will be placed in Trash and can be restored.','Delete item',()=>deleteItem(item));
    }
    if(action==='deleteRoom') {
      const room=findRoom(id); if(!room) return;
      const count=state.items.filter(i=>i.roomId===id && !i.deletedAt).length;
      return confirmDialog('Delete ' + room.name + '?','This will ' + (state.space==='test'?'permanently delete':'archive') + ' the room and its ' + count + ' active inventory entries.','Delete room',()=>deleteRoom(room));
    }
    if(action==='restoreRoom') return await restoreRoom(findRoom(id));
    if(action==='restoreItem') return await restoreItem(state.items.find(i=>i.id===id));
    if(action==='export') return exportCSV();
    if(action==='print') { window.print(); return; }
    if(action==='seed') return confirmDialog('Generate sample inventory?','Adds four sample rooms and several items to the TEST workspace. Existing test records stay as they are.','Generate examples',seedTest,false);
    if(action==='reset') return await resetTest();
    if(action==='logout') return await signOut(auth);
    if(action==='confirm') {
      const callback=state.confirm; state.confirm=null; closeModal(); if(callback) await callback();
    }
  } catch(error) { catchError(error); }
});
document.addEventListener('submit', async event => {
  // Prevent browser GET navigation synchronously, before any await.
  // Previously the first await let the form submit to ?id=&name=... and reset the SPA.
  if(['roomForm','itemForm','inviteForm','p3ProposalForm','p3ReviewForm','p3SnapshotForm'].includes(event.target?.id)){
    event.preventDefault();
  }
  if(await phase3.handleSubmit(event))return;
  if(event.target.id==='inviteForm') {
    event.preventDefault();const form=event.target;
    const btn=form.querySelector('[type=submit]');btn.disabled=true;
    try {
      if(!isOwner())throw new Error('Only owner can issue codes.');
      const fd=new FormData(form);const result=await call('createInvite',{role:fd.get('role'),email:fd.get('email')});
      state.latestInvite=result.data.code;render();toast('One-time authorization code created.');
    }catch(error){catchError(error);}finally{btn.disabled=false;}return;
  }
  if (event.target.id !== 'itemForm') return;
  event.preventDefault();
  if(!canEdit()){toast('Read-only account.',true);return;}
  const form=event.target; const fd=new FormData(form);
  const button=form.querySelector('[type="submit"]'); button.disabled=true;
  try {
    if(form.id==='itemForm') {
      const id=String(fd.get('id')||''), quantity=Number(fd.get('quantity')), name=String(fd.get('name')||'').trim(), roomId=String(fd.get('roomId')||'');
      if(!name || !roomId || !Number.isInteger(quantity) || quantity<0 || quantity>1000000) throw new Error('Enter an item name, valid room, and whole-number quantity (0 to 1,000,000).');
      if(!activeRooms().some(r=>r.id===roomId)) throw new Error('Select an existing active room.');
      const old=id?state.items.find(i=>i.id===id):null;
      const values={name,roomId,quantity,category:String(fd.get('category')||'Other').trim()||'Other',
        condition:String(fd.get('condition')||'Not assessed'),notes:String(fd.get('notes')||'').trim(),
        photoPath:old?.photoPath||'',photoUrl:old?.photoUrl||'',updatedAt:serverTimestamp(),updatedBy:state.user.uid};
      let ref;
      ref=await actions.writeInventoryItem(state.space,old,values);
      const photo=fd.get('photo');
      if(photo instanceof File && photo.size){
        if(photo.size>=8*1024*1024 || !['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(photo.type))throw new Error('Choose a JPEG, PNG, WebP or HEIC image smaller than 8 MB.');
        const path='inventory/'+state.space+'/'+ref.id+'/'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.'+(photo.type.split('/')[1]||'jpg').replace(/[^a-z0-9]/gi,'');
        const photoRef=storageRef(storage,path);
        await uploadBytes(photoRef,photo,{contentType:photo.type});
        const url=await getDownloadURL(photoRef);
        await updateDoc(ref,{photoPath:path,photoUrl:url,updatedBy:state.user.uid,updatedAt:serverTimestamp()});
        if(old?.photoPath)deleteObject(storageRef(storage,old.photoPath)).catch(err=>console.warn('Previous photo cleanup:',err));
      }
      actions.logActivity(state.space,{recordType:'item',recordId:ref.id,recordName:name,roomId,operation:old?'updated':'created',changedKeys:['name','quantity']}).catch(console.warn);
      closeModal();toast('Item saved.');
    }
  } catch(error) {
    console.error('Inventory item save failed:',error);
    const err=$('itemFormError'); if(err) err.textContent=errMessage(error);
  } finally { button.disabled=false; }
});

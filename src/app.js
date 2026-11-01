import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, increment } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA5rlmsSfE09vfnhrZkg2DGtV1kOMHWZRw',
  authDomain: 'nh-inventory-6f359.firebaseapp.com',
  projectId: 'nh-inventory-6f359',
  storageBucket: 'nh-inventory-6f359.firebasestorage.app',
  messagingSenderId: '417386366102',
  appId: '1:417386366102:web:afe95a46e22670ea852eb7'
};
const firebase = initializeApp(firebaseConfig);
const auth = getAuth(firebase);
const db = getFirestore(firebase);
const $ = id => document.getElementById(id);
const state = { user: null, member: null, space: 'test', page: 'dashboard', roomId: null, rooms: [], items: [], search: '', unsub: [], ready: false, confirm: null };
const STATUS = { 'not-started': 'Not started', 'in-progress': 'In progress', verified: 'Verified' };
const CATEGORIES = ['Furniture','Worship Supplies','Audio & Video','Books & Literature','Kitchen','Office Supplies','Electronics','Cleaning','Decorations','Other'];
const CONDITIONS = ['Not assessed','Excellent','Good','Fair','Poor','Broken'];
const NAV = [ ['dashboard','▦','Dashboard'], ['rooms','▤','Rooms'], ['items','▣','All Inventory'], ['trash','♻','Trash'], ['settings','⚙','Settings'] ];

function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const E = escapeHTML;
const roomsPath = () => collection(db, 'workspaces', state.space, 'rooms');
const itemsPath = () => collection(db, 'workspaces', state.space, 'items');
const roomRef = id => doc(db, 'workspaces', state.space, 'rooms', id);
const itemRef = id => doc(db, 'workspaces', state.space, 'items', id);
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
  if (code.includes('permission-denied')) return 'Permission denied. Confirm your UID is in authorizedUsers and publish firestore.rules.';
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) return 'Incorrect email or password.';
  if (code.includes('auth/too-many-requests')) return 'Too many attempts. Try again later.';
  return error?.message || 'Something went wrong. Please try again.';
}
function catchError(error) { console.error(error); toast(errMessage(error), true); }
function showPage(page, roomId = null) {
  state.page = page; state.roomId = roomId; state.search = ''; render();
  window.scrollTo({ top:0, behavior:'instant' });
}
function stopListeners() { state.unsub.forEach(fn => fn()); state.unsub = []; }
function subscribe() {
  stopListeners(); state.ready = false; state.rooms = []; state.items = []; render();
  let gotRooms = false, gotItems = false;
  const received = () => { if (gotRooms && gotItems) state.ready = true; render(); };
  state.unsub.push(onSnapshot(roomsPath(), snap => {
    state.rooms = snap.docs.map(x => ({ id:x.id, ...x.data() })); gotRooms = true; received();
  }, catchError));
  state.unsub.push(onSnapshot(itemsPath(), snap => {
    state.items = snap.docs.map(x => ({ id:x.id, ...x.data() })); gotItems = true; received();
  }, catchError));
}
async function getMembership(user) {
  const snap = await getDoc(doc(db,'authorizedUsers',user.uid));
  if (!snap.exists()) throw new Error('This account is not yet approved. Add its Firebase Authentication UID to the authorizedUsers collection.');
  return snap.data();
}
onAuthStateChanged(auth, async user => {
  stopListeners(); state.user = null; state.member = null; state.ready = false; $('splash').hidden = true;
  if (!user) { $('app').hidden = true; $('auth').hidden = false; return; }
  try {
    const member = await getMembership(user);
    if (auth.currentUser?.uid !== user.uid) return;
    state.user = user; state.member = member; $('auth').hidden = true; $('app').hidden = false; subscribe();
  } catch (error) {
    $('app').hidden = true; $('auth').hidden = false; $('loginError').textContent = errMessage(error);
    await signOut(auth).catch(() => {});
  }
});
$('loginForm').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; const submit = form.querySelector('button[type="submit"]');
  $('loginError').textContent = ''; submit.disabled = true; submit.textContent = 'Signing in...';
  try {
    await signInWithEmailAndPassword(auth, form.email.value.trim(), form.password.value);
    form.reset();
  } catch (error) { $('loginError').textContent = errMessage(error); }
  finally { submit.disabled = false; submit.textContent = 'Sign in securely'; }
});

function header(title, description, actions='') {
  return '<div class="page-head"><div><h1>' + E(title) + '</h1><p>' + E(description) + '</p></div><div class="btn-row">' + actions + '</div></div>';
}
function modeBanner() {
  return state.space === 'test'
    ? '<div class="alert"><strong>Testing workspace.</strong> Practice freely: test data is separate from official records. Deletion here is permanent, and you can reset everything from Settings.</div>'
    : '<div class="alert official"><strong>Official North Heights inventory.</strong> These are the congregation\'s working records. Deleted items can be recovered from Trash.</div>';
}
function roomCard(room) {
  const entries = activeItems().filter(i => i.roomId === room.id);
  const count = entries.reduce((sum,i) => sum + (i.quantity || 0), 0);
  const percent = room.status === 'verified' ? 100 : room.status === 'in-progress' ? 55 : 0;
  return '<button class="room-card" data-action="openRoom" data-id="' + E(room.id) + '"><div class="room-icon">⌂</div><div class="room-title">' + E(room.name) + '</div><div class="room-desc">' + E(room.description || 'Open this room to review its contents') + '</div><div class="room-bottom"><span class="small muted">' + number(entries.length) + ' types · ' + number(count) + ' units</span>' + statusBadge(room.status) + '</div><div class="progress"><span style="width:' + percent + '%"></span></div></button>';
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
    '<button class="btn primary" data-action="newItem">+ Add item</button><button class="btn" data-action="newRoom">+ New room</button>');
  html += modeBanner() + metrics();
  html += '<div class="overview"><div class="panel panel-pad"><div class="section-head"><h2>Rooms & spaces</h2><button class="btn sm" data-action="go" data-page="rooms">View all</button></div>';
  html += rooms.length ? '<div class="room-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">' + rooms.slice(0,6).map(roomCard).join('') + '</div>'
    : empty('⌂','No rooms created','Start by adding an auditorium, classroom, office, or another space.','<button class="btn primary" data-action="newRoom">Create first room</button>');
  html += '</div><div class="panel panel-pad"><div class="section-head"><h2>Room status</h2></div>';
  const groups = [['verified','Verified'],['in-progress','In progress'],['not-started','Not started']];
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
  return header('Rooms & spaces','Organize every area of the church building.','<button class="btn primary" data-action="newRoom">+ Create room</button>') +
    modeBanner() + (rooms.length ? '<div class="room-grid">' + rooms.map(roomCard).join('') + '</div>' :
    empty('⌂','No rooms yet','Create your first room to begin counting.','<button class="btn primary" data-action="newRoom">+ Create room</button>'));
}
function searchBar() { return '<input id="inventorySearch" class="search" aria-label="Search inventory" placeholder="Search items, categories or notes..." value="' + E(state.search) + '">'; }
function itemRows(items, showRoom) {
  const search = state.search.trim().toLowerCase();
  items = items.filter(i => !search || [i.name,i.category,i.notes,roomName(i.roomId)].some(v => String(v||'').toLowerCase().includes(search)));
  if (!items.length) return empty('▣',search ? 'Nothing matches your search' : 'No items recorded',search ? 'Try another search term.' : 'Add the first item to this inventory.');
  return '<div class="panel table-scroll"><table class="item-table"><thead><tr><th>Item</th>' + (showRoom ? '<th>Room</th>' : '') + '<th class="hide-mobile">Category</th><th>Quantity</th><th class="hide-mobile">Condition</th><th>Actions</th></tr></thead><tbody>' +
    items.sort((a,b)=>a.name.localeCompare(b.name)).map(i => '<tr><td><div class="item-name">' + E(i.name) + '</div><div class="item-sub">' + E((i.notes || '').slice(0,85)) + '</div></td>' +
      (showRoom ? '<td class="small">' + E(roomName(i.roomId)) + '</td>' : '') +
      '<td class="hide-mobile small">' + E(i.category || 'Other') + '</td>' +
      '<td><div class="count"><button title="Remove one" aria-label="Remove one ' + E(i.name) + '" class="count-btn" data-action="count" data-id="' + E(i.id) + '" data-delta="-1" ' + (i.quantity<=0?'disabled':'') + '>−</button><strong>' + number(i.quantity) + '</strong><button title="Add one" aria-label="Add one ' + E(i.name) + '" class="count-btn" data-action="count" data-id="' + E(i.id) + '" data-delta="1">+</button></div></td>' +
      '<td class="hide-mobile"><span class="small muted">' + E(i.condition || 'Not assessed') + '</span></td>' +
      '<td><div class="inline-actions"><button class="btn sm" data-action="editItem" data-id="' + E(i.id) + '">Edit</button><button class="btn sm danger" data-action="deleteItem" data-id="' + E(i.id) + '">Delete</button></div></td></tr>').join('') + '</tbody></table></div>';
}
function itemsPage() {
  return header('All inventory','Everything currently recorded throughout the church building.',
    '<button class="btn primary" data-action="newItem">+ Add item</button><button class="btn" data-action="export">↓ Export CSV</button><button class="btn" data-action="print">Print</button>') +
    modeBanner() + '<div class="toolbar">' + searchBar() + '<span class="small muted">' + number(activeItems().length) + ' item types</span></div>' + itemRows(activeItems(),true);
}
function roomPage() {
  const room = findRoom(state.roomId);
  if (!room || room.deletedAt) return roomsPage();
  const entries = activeItems().filter(i=>i.roomId===room.id);
  return '<button class="back-link" data-action="go" data-page="rooms">← All rooms</button>' +
    header(room.name,room.description || 'Inventory items in this room.',
      '<button class="btn primary" data-action="newItem" data-id="' + E(room.id) + '">+ Add item</button><button class="btn" data-action="editRoom" data-id="' + E(room.id) + '">Edit room</button><button class="btn danger" data-action="deleteRoom" data-id="' + E(room.id) + '">Delete room</button>') +
    modeBanner() + '<div class="room-detail-bar"><span class="small muted">Inventory status</span>' + statusBadge(room.status) +
    '<select class="mode-select" id="roomStatus" data-room-id="' + E(room.id) + '" aria-label="Set room status">' +
    Object.entries(STATUS).map(([id,label])=>'<option value="' + E(id) + '" ' + (room.status===id?'selected':'') + '>' + E(label) + '</option>').join('') +
    '</select><span class="small muted">' + number(entries.reduce((n,i)=>n+i.quantity,0)) + ' total units</span></div>' +
    '<div class="toolbar">' + searchBar() + '</div>' + itemRows(entries,false);
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
  return header('Settings','Manage your inventory workspace and personal account.') + modeBanner() +
    '<div class="panel panel-pad"><h2>Account & workspace</h2>' +
    '<div class="setting-row"><div><strong>Signed-in account</strong><p>' + E(state.user?.email || '') + '</p></div><span class="badge slate">' + E(state.member?.role || 'member') + '</span></div>' +
    '<div class="setting-row"><div><strong>Current workspace</strong><p>Switch between test and official records using the workspace selector.</p></div><span class="badge ' + (state.space==='test'?'test':'official') + '">' + (state.space==='test'?'TEST':'OFFICIAL') + '</span></div>' +
    '<div class="setting-row"><div><strong>Export all active inventory</strong><p>Download a spreadsheet-friendly CSV with all rooms and item quantities.</p></div><button class="btn" data-action="export">Export CSV</button></div>' +
    (state.space==='test' ?
      '<div class="setting-row"><div><strong>Generate sample data</strong><p>Add sample rooms and inventory for interface testing. Does not change official data.</p></div><button class="btn" data-action="seed">Generate examples</button></div>' +
      '<div class="setting-row"><div><strong>Reset testing workspace</strong><p style="color:#a33">Permanently delete all test rooms and items. Official inventory is never affected.</p></div><button class="btn danger" data-action="reset">Reset test data</button></div>'
      : '<div class="setting-row"><div><strong>Official record protection</strong><p>Deleted records are retained in Trash and can be restored. Back up your inventory regularly using CSV export.</p></div><span class="badge">Enabled</span></div>') +
    '<div class="setting-row"><div><strong>Sign out</strong><p>End your session on this device.</p></div><button class="btn" data-action="logout">Sign out</button></div></div>' +
    '<p class="small muted" style="margin-top:16px">North Heights Inventory · Phase 1 · GitHub Pages + Firebase</p>';
}
function mainHTML() {
  if (!state.ready) return '<div class="empty"><h3>Loading inventory...</h3><p>Synchronizing your rooms and items securely.</p></div>';
  if (state.page === 'dashboard') return dashboard();
  if (state.page === 'rooms') return roomsPage();
  if (state.page === 'room') return roomPage();
  if (state.page === 'items') return itemsPage();
  if (state.page === 'trash') return trashPage();
  return settingsPage();
}
function render() {
  if (!state.user) return;
  const currentNav = state.page === 'room' ? 'rooms' : state.page;
  const nav = NAV.filter(n=>n[0] !== 'trash' || state.space === 'official');
  $('app').innerHTML = '<div class="app-shell"><aside class="sidebar"><div class="sidebar-brand"><div class="brand-mark">NH</div><div><div class="brand-title">North Heights</div><div class="brand-sub">INVENTORY SYSTEM</div></div></div><div><div class="sidebar-label">WORKSPACE</div><nav class="nav">' +
    nav.map(([id,icon,title])=>'<button class="nav-link ' + (currentNav===id?'active':'') + '" data-action="go" data-page="' + id + '"><span class="nav-symbol">' + icon + '</span>' + title + '</button>').join('') +
    '</nav></div><div class="sidebar-spacer"></div><div class="sidebar-user"><div class="avatar">' + E((state.member?.displayName || state.user.email || 'N').charAt(0).toUpperCase()) + '</div><div style="min-width:0"><div class="user-name">' + E(state.member?.displayName || state.user.email) + '</div><div class="user-role">' + E(state.member?.role || 'member') + ' · North Heights</div></div></div></aside>' +
    '<main class="main"><div class="topbar"><div><div class="topbar-sub">North Heights Church of Christ</div><div class="topbar-heading">Inventory Management</div></div><div class="view-mode"><span class="hide-mobile">Workspace</span><select class="mode-select" id="spaceSelector" aria-label="Select workspace"><option value="test" ' + (state.space==='test'?'selected':'') + '>◆ TEST MODE</option><option value="official" ' + (state.space==='official'?'selected':'') + '>● OFFICIAL</option></select></div></div><div class="content" id="mainContent">' + mainHTML() + '</div></main>' +
    '<nav class="mobile-nav">' + [['dashboard','▦','Home'],['rooms','▤','Rooms'],['items','▣','Items'],['settings','⚙','More']].map(([id,icon,label])=>'<button class="mobile-tab ' + (currentNav===id?'active':'') + '" data-action="go" data-page="' + id + '"><span>' + icon + '</span>' + label + '</button>').join('') + '</nav></div>';
}
function renderMain() { const target = $('mainContent'); if (target) target.innerHTML = mainHTML(); }
function openModal(html) { const modal = $('modal'); modal.innerHTML = '<div class="modal-inner">' + html + '</div>'; if (!modal.open) modal.showModal(); }
function closeModal() { $('modal').close(); $('modal').innerHTML = ''; }
function modalHeading(title) { return '<div class="modal-head"><h2>' + E(title) + '</h2><button class="modal-close" type="button" data-action="closeModal" aria-label="Close">×</button></div>'; }
function roomEditor(room=null) {
  openModal(modalHeading(room?'Edit room':'Create room') + '<form id="roomForm" class="form-stack"><input type="hidden" name="id" value="' + E(room?.id || '') + '">' +
    '<div class="field"><label>Room name *</label><input name="name" maxlength="120" required autofocus placeholder="e.g. Auditorium" value="' + E(room?.name || '') + '"></div>' +
    '<div class="field"><label>Description (optional)</label><textarea name="description" maxlength="3000" placeholder="Location, notes, or other details">' + E(room?.description || '') + '</textarea></div>' +
    '<div class="field"><label>Inventory progress</label><select name="status">' + Object.entries(STATUS).map(([k,v])=>'<option value="' + k + '" ' + ((room?.status||'not-started')===k?'selected':'') + '>' + E(v) + '</option>').join('') + '</select></div>' +
    '<p class="form-error" id="roomFormError"></p><div class="modal-foot"><button type="button" class="btn" data-action="closeModal">Cancel</button><button class="btn primary" type="submit">Save room</button></div></form>');
}
function itemEditor(item=null, defaultRoom=null) {
  const rooms = activeRooms();
  if (!rooms.length) { toast('Create a room first, then add inventory items.',true); return roomEditor(); }
  const selected = item?.roomId || defaultRoom || rooms[0].id;
  const categories = [...new Set([...CATEGORIES,...state.items.map(i=>i.category).filter(Boolean)])].sort();
  openModal(modalHeading(item?'Edit item':'Add inventory item') +
    '<form id="itemForm" class="form-grid"><input type="hidden" name="id" value="' + E(item?.id || '') + '">' +
    '<div class="field full-span"><label>Item name *</label><input name="name" maxlength="160" required autofocus placeholder="e.g. Folding Chairs" value="' + E(item?.name || '') + '"></div>' +
    '<div class="field"><label>Room *</label><select name="roomId" required>' + rooms.map(r=>'<option value="' + E(r.id) + '" ' + (r.id===selected?'selected':'') + '>' + E(r.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Quantity *</label><input name="quantity" type="number" required min="0" max="1000000" step="1" value="' + E(item?.quantity ?? 1) + '"></div>' +
    '<div class="field"><label>Category</label><input name="category" maxlength="100" list="categoryOptions" placeholder="Select or type a category" value="' + E(item?.category || 'Furniture') + '"><datalist id="categoryOptions">' + categories.map(c=>'<option value="' + E(c) + '"></option>').join('') + '</datalist></div>' +
    '<div class="field"><label>Condition</label><select name="condition">' + CONDITIONS.map(c=>'<option value="' + E(c) + '" ' + ((item?.condition || 'Not assessed')===c?'selected':'') + '>' + E(c) + '</option>').join('') + '</select></div>' +
    '<div class="field full-span"><label>Notes (optional)</label><textarea name="notes" maxlength="5000" placeholder="Color, size, location details, etc.">' + E(item?.notes || '') + '</textarea></div>' +
    '<p id="itemFormError" class="form-error full-span"></p><div class="modal-foot full-span"><button type="button" class="btn" data-action="closeModal">Cancel</button><button type="submit" class="btn primary">Save item</button></div></form>');
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
async function deleteItem(item) {
  if (state.space === 'test') await deleteDoc(itemRef(item.id));
  else await updateDoc(itemRef(item.id), {deletedAt: serverTimestamp(),deletedWithRoom:false,updatedAt:serverTimestamp(),updatedBy:state.user.uid});
  toast('Item ' + (state.space === 'test'?'deleted.':'moved to Trash.'));
}
async function deleteRoom(room) {
  const contents = state.items.filter(i=>i.roomId===room.id);
  if (state.space === 'test') {
    await writeChunks([...contents.map(i=>({type:'delete',ref:itemRef(i.id)})),{type:'delete',ref:roomRef(room.id)}]);
  } else {
    const actions = contents.filter(i=>!i.deletedAt).map(i=>({
      type:'update',ref:itemRef(i.id),
      data:{deletedAt:serverTimestamp(),deletedWithRoom:true,updatedAt:serverTimestamp(),updatedBy:state.user.uid}
    }));
    await writeChunks(actions);
    await updateDoc(roomRef(room.id),{deletedAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:state.user.uid});
  }
  toast('Room ' + (state.space==='test'?'deleted.':'moved to Trash.'));
  showPage('rooms');
}
async function restoreRoom(room) {
  await updateDoc(roomRef(room.id),{deletedAt:null,updatedAt:serverTimestamp(),updatedBy:state.user.uid});
  await writeChunks(state.items.filter(i=>i.roomId===room.id && i.deletedAt && i.deletedWithRoom).map(i=>({
    type:'update',ref:itemRef(i.id),data:{deletedAt:null,deletedWithRoom:false,updatedAt:serverTimestamp(),updatedBy:state.user.uid}
  })));
  toast('Room restored along with its associated items.');
}
async function restoreItem(item) {
  const room = findRoom(item.roomId);
  if (!room || room.deletedAt) { toast('Restore the parent room first.',true); return; }
  await updateDoc(itemRef(item.id),{deletedAt:null,deletedWithRoom:false,updatedAt:serverTimestamp(),updatedBy:state.user.uid});
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
    actions.push({type:'set',ref,data:{name:sample.name,description:sample.description,status:sample.status,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:state.user.uid,updatedBy:state.user.uid,deletedAt:null}});
    for(const [name,quantity,category] of sample.items) {
      actions.push({type:'set',ref:doc(itemsPath()),data:{name,quantity,category,roomId:ref.id,condition:'Not assessed',notes:'Sample data — replace or delete before official use.',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),createdBy:state.user.uid,updatedBy:state.user.uid,deletedAt:null,deletedWithRoom:false}});
    }
  }
  await writeChunks(actions); toast('Sample inventory added to Test workspace.');
}
async function resetTest() {
  if (state.space !== 'test') return;
  const response = prompt('Type RESET TEST to permanently delete ALL test rooms and items. Official data will be untouched.');
  if (response !== 'RESET TEST') { toast('Reset cancelled.'); return; }
  await writeChunks([...state.items.map(i=>({type:'delete',ref:itemRef(i.id)})),...state.rooms.map(r=>({type:'delete',ref:roomRef(r.id)}))]);
  toast('Testing workspace reset.'); showPage('dashboard');
}
function switchSpace(space) {
  if (!['test','official'].includes(space) || space===state.space) return;
  state.space=space; state.page='dashboard'; state.roomId=null; state.search=''; subscribe();
}
document.addEventListener('change', async event => {
  const target = event.target;
  if (target.id==='spaceSelector') { switchSpace(target.value); return; }
  if (target.id==='roomStatus') {
    try { await updateDoc(roomRef(target.dataset.roomId),{status:target.value,updatedAt:serverTimestamp(),updatedBy:state.user.uid}); toast('Room progress saved.'); }
    catch(error) { catchError(error); }
  }
});
document.addEventListener('input', event => {
  if(event.target.id !== 'inventorySearch') return;
  state.search = event.target.value;
  const start = event.target.selectionStart;
  renderMain();
  const input=$('inventorySearch');
  if(input) { input.focus(); input.setSelectionRange(start,start); }
});
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action, id = button.dataset.id;
  try {
    if(action==='go') return showPage(button.dataset.page);
    if(action==='openRoom') return showPage('room',id);
    if(action==='newRoom') return roomEditor();
    if(action==='editRoom') return roomEditor(findRoom(id));
    if(action==='newItem') return itemEditor(null,id);
    if(action==='editItem') return itemEditor(state.items.find(i=>i.id===id));
    if(action==='closeModal') return closeModal();
    if(action==='count') {
      const item=state.items.find(i=>i.id===id), delta=Number(button.dataset.delta);
      if (!item || item.deletedAt || item.quantity+delta<0) return;
      await updateDoc(itemRef(id),{quantity:increment(delta),updatedAt:serverTimestamp(),updatedBy:state.user.uid});
      return;
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
  if (!['roomForm','itemForm'].includes(event.target.id)) return;
  event.preventDefault();
  const form=event.target; const fd=new FormData(form);
  const button=form.querySelector('[type="submit"]'); button.disabled=true;
  try {
    if(form.id==='roomForm') {
      const id=String(fd.get('id')||''), name=String(fd.get('name')||'').trim();
      if(!name) throw new Error('Room name is required.');
      const values={name,description:String(fd.get('description')||'').trim(),status:String(fd.get('status')),updatedAt:serverTimestamp(),updatedBy:state.user.uid};
      if(id) await updateDoc(roomRef(id),values);
      else await addDoc(roomsPath(),{...values,createdAt:serverTimestamp(),createdBy:state.user.uid,deletedAt:null});
      closeModal();toast('Room saved.');
    }
    if(form.id==='itemForm') {
      const id=String(fd.get('id')||''), quantity=Number(fd.get('quantity')), name=String(fd.get('name')||'').trim(), roomId=String(fd.get('roomId')||'');
      if(!name || !roomId || !Number.isInteger(quantity) || quantity<0 || quantity>1000000) throw new Error('Enter an item name, valid room, and whole-number quantity (0 to 1,000,000).');
      if(!activeRooms().some(r=>r.id===roomId)) throw new Error('Select an existing active room.');
      const values={name,roomId,quantity,category:String(fd.get('category')||'Other').trim()||'Other',condition:String(fd.get('condition')||'Not assessed'),notes:String(fd.get('notes')||'').trim(),updatedAt:serverTimestamp(),updatedBy:state.user.uid};
      if(id) await updateDoc(itemRef(id),values);
      else await addDoc(itemsPath(),{...values,createdAt:serverTimestamp(),createdBy:state.user.uid,deletedAt:null,deletedWithRoom:false});
      closeModal();toast('Item saved.');
    }
  } catch(error) {
    const err=$(form.id==='roomForm'?'roomFormError':'itemFormError'); if(err) err.textContent=errMessage(error);
  } finally { button.disabled=false; }
});

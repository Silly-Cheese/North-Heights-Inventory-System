// Phase 4 — durable, explicitly reconciled count queue and printable room QR labels.
// Pending counts are private to one Firebase UID and one workspace.
// An IndexedDB queue is enabled only when the user opts in on a trusted device.
export function initPhase4(env) {
  const {state,call,toast,catchError,canEdit,isOwner,E,openModal,modalHeading,closeModal,
    confirmDialog,renderMain,activeRooms,activeItems,roomName,showPage}=env;
  const DB_NAME='north-heights-count-queue-v1', STORE='counts', TRUST_KEY='nh-trusted-device-v1';
  let records=[],activeUID=null,busy=false,dbPromise=null,session=0,qrModule=null;
  const trusted=()=>localStorage.getItem(TRUST_KEY)==='yes';
  const current=()=>records.filter(r=>r.uid===activeUID && r.space===state.space)
    .sort((a,b)=>a.createdAt-b.createdAt);
  const online=()=>navigator.onLine;
  function isTransient(error){
    return ['unavailable','deadline-exceeded','network-request-failed'].some(code=>String(error?.code||'').includes(code));
  }
  function now(){return Date.now();}
  function id(){
    if(!globalThis.crypto?.randomUUID)throw Error('Secure browser context is required for offline count operations.');
    return globalThis.crypto.randomUUID();
  }
  function requestDone(req){return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });}
  async function database(){
    if(!('indexedDB' in window))throw Error('This browser does not support secure local queue storage.');
    if(!dbPromise){
      dbPromise=new Promise((resolve,reject)=>{
        const request=indexedDB.open(DB_NAME,1);
        request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id'});
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
        request.onblocked=()=>reject(Error('Offline database is blocked by another tab.'));
      }).catch(err=>{dbPromise=null;throw err;});
    }
    return dbPromise;
  }
  async function readAll(){
    const db=await database(),tx=db.transaction(STORE,'readonly');
    return requestDone(tx.objectStore(STORE).getAll());
  }
  async function store(record){
    const idx=records.findIndex(r=>r.id===record.id);
    if(idx===-1)records.push(record);else records[idx]=record;
    if(trusted()){
      const db=await database(),tx=db.transaction(STORE,'readwrite');
      await requestDone(tx.objectStore(STORE).put(record));
    }
    refresh();
  }
  async function drop(record){
    records=records.filter(r=>r.id!==record.id);
    if(trusted()){
      const db=await database(),tx=db.transaction(STORE,'readwrite');
      await requestDone(tx.objectStore(STORE).delete(record.id));
    }
    refresh();
  }
  function refresh(){
    const badge=document.getElementById('p4Status'),status=summary();
    if(badge)badge.textContent=(status.online?'● Online':'● Offline')+(status.count?' · '+status.count+' pending':'');
    renderMain();
  }
  async function start(uid){
    session++;const currentSession=session;activeUID=uid;records=[];
    if(!uid){refresh();return;}
    if(trusted()){
      try{
        const all=await readAll();
        if(session!==currentSession)return;
        records=all.filter(r=>r.uid===uid);
      }catch(error){
        toast('Offline counts will stay in memory only on this device: '+error.message,true);
      }
    }
    refresh();
    if(online())sync().catch(catchError);
  }
  function queuedFor(itemId,space=state.space){
    return records.filter(r=>r.uid===activeUID&&r.space===space&&r.itemId===itemId)
      .reduce((n,r)=>n+r.delta,0);
  }
  function summary(){
    const entries=current();
    return {count:entries.length,conflicts:entries.filter(r=>r.status==='conflict').length,
      delta:entries.reduce((n,r)=>n+r.delta,0),trusted:trusted(),online:online(),busy};
  }
  function newEntry(item,delta,attempted=false){
    return {id:id(),uid:activeUID,space:state.space,itemId:item.id,delta,
      baseline:item.quantity,createdAt:now(),status:'pending',attempted,
      message:'',currentQuantity:null};
  }
  async function queue(entry){
    const merge=current().find(r=>r.itemId===entry.itemId&&r.status==='pending'&&!r.attempted);
    if(merge){
      const next=merge.delta+entry.delta;
      if(next===0)await drop(merge);
      else await store({...merge,delta:next});
    }else await store(entry);
    toast('Count saved locally. It has NOT been applied to the official inventory.');
  }
  async function adjust(item,delta){
    if(!canEdit())throw Error('This account is read-only.');
    if(!activeUID)throw Error('Sign in before adjusting inventory.');
    if(!Number.isSafeInteger(delta)||delta===0)throw Error('Invalid count adjustment.');
    if(item.quantity+delta<0 && !current().some(r=>r.itemId===item.id))throw Error('Quantity cannot be negative.');
    if(!online() || current().some(r=>r.itemId===item.id)){
      await queue(newEntry(item,delta));return;
    }
    const op=newEntry(item,delta,true);
    try{
      const {data}=await call('reconcileCount',{space:op.space,itemId:op.itemId,
        operationId:op.id,delta:op.delta,baseline:op.baseline,mode:'normal'});
      if(data?.status==='applied'){toast('Quantity updated.');return;}
      const record={...op,status:'conflict',message:data?.message||'Another change may have occurred.',
        currentQuantity:Number.isSafeInteger(data?.currentQuantity)?data.currentQuantity:null};
      await store(record);
      toast('Count conflict detected. Review it in Sync Center.',true);
    }catch(error){
      if(isTransient(error)){
        await store(op);toast('Connection interrupted. Count saved as pending; do not count it again.');
      }else throw error;
    }
  }
  async function sync(){
    if(busy || !online() || !activeUID || !canEdit())return;
    busy=true;refresh();const uid=activeUID;
    try{
      for(const record of current().filter(r=>r.status==='pending')){
        if(uid!==activeUID || !online())break;
        try{
          const {data}=await call('reconcileCount',{
            space:record.space,itemId:record.itemId,operationId:record.id,
            delta:record.delta,baseline:record.baseline,mode:'normal'
          });
          if(data?.status==='applied') await drop(record);
          else await store({...record,status:'conflict',attempted:true,
            currentQuantity:Number.isSafeInteger(data?.currentQuantity)?data.currentQuantity:null,
            message:data?.message||'Quantity changed or item missing. Review before applying.'});
        }catch(error){
          if(isTransient(error))break;
          await store({...record,status:'conflict',attempted:true,
            currentQuantity:null,message:'Sync error: '+String(error?.message||error)});
        }
      }
    }finally{busy=false;refresh();}
  }
  async function resolve(recordId,mode){
    const entry=current().find(r=>r.id===recordId);
    if(!entry)return;
    if(mode==='discard'){
      await drop(entry);toast('Local count discarded; server inventory unchanged.');return;
    }
    if(mode!=='apply'||entry.status!=='conflict')throw Error('Only reviewed conflicts can be applied.');
    if(!Number.isSafeInteger(entry.currentQuantity))throw Error('No current server quantity is available. Try syncing again.');
    if(!confirm('Server count is '+entry.currentQuantity+' and local adjustment is '+(entry.delta>0?'+':'')+entry.delta+
      '. Apply that adjustment to the currently reviewed count? Check the actual items first.'))return;
    const {data}=await call('reconcileCount',{space:entry.space,itemId:entry.itemId,
      operationId:entry.id,delta:entry.delta,baseline:entry.baseline,
      mode:'reviewed',reviewedQuantity:entry.currentQuantity});
    if(data?.status==='applied'){
      await drop(entry);toast('Reviewed adjustment applied.');
    }else{
      await store({...entry,currentQuantity:Number.isSafeInteger(data?.currentQuantity)?data.currentQuantity:null,
        message:data?.message||'Server count changed again. Recheck before applying.'});
      toast('Count changed again; review the new number.',true);
    }
  }
  function labelFor(record){
    const item=activeItems().find(i=>i.id===record.itemId);
    return item?.name||'Item '+record.itemId.slice(0,8);
  }
  function syncPage(){
    const items=current(),sum=summary();
    let html='<div class="page-head"><div><h1>Sync Center</h1><p>Review unsent and conflicting offline count adjustments.</p></div></div>'+
      '<div class="alert '+(sum.online?'official':'')+'"><strong>'+(sum.online?'Connection detected':'Offline')+'.</strong> '+
      'Pending counts are not official until the server confirms them. Never recount the same adjustment while it is pending.</div>';
    html+='<div class="metrics"><div class="metric"><div class="metric-label">Unsent adjustments</div><div class="metric-number">'+sum.count+'</div></div>'+
      '<div class="metric"><div class="metric-label">Conflicts to review</div><div class="metric-number">'+sum.conflicts+'</div></div>'+
      '<div class="metric"><div class="metric-label">Total pending change</div><div class="metric-number">'+(sum.delta>0?'+':'')+sum.delta+'</div></div>'+
      '<div class="metric"><div class="metric-label">This device</div><div class="metric-number small" style="font-size:1.1rem">'+(sum.trusted?'Trusted':'Session only')+'</div></div></div>';
    html+='<div class="btn-row" style="margin-bottom:19px">'+
      '<button class="btn primary" data-p4="syncNow" '+(!sum.online||sum.busy||!canEdit()?'disabled':'')+'>'+(sum.busy?'Synchronizing...':'Retry pending counts')+'</button>'+
      '<button class="btn" data-p4="settings">Offline settings</button></div>';
    html+='<div class="panel panel-pad">';
    html+=items.length?items.map(r=>'<div class="list-row p4-sync-row"><div><strong>'+E(labelFor(r))+'</strong><p>'+
      E(roomName(activeItems().find(i=>i.id===r.itemId)?.roomId))+' · '+E(r.space.toUpperCase())+
      ' · Base '+r.baseline+' · Local '+(r.delta>0?'+':'')+r.delta+'</p>'+
      '<p>'+E(r.status==='conflict'?'CONFLICT: server count '+(r.currentQuantity??'unknown')+' · '+r.message:'Pending upload; not yet in server inventory')+'</p></div>'+
      '<div class="inline-actions">'+(r.status==='conflict'&&Number.isSafeInteger(r.currentQuantity)?
        '<button class="btn sm primary" data-p4="apply" data-id="'+E(r.id)+'">Apply after review</button>':'')+
      '<button class="btn sm danger" data-p4="discard" data-id="'+E(r.id)+'">Discard local</button></div></div>').join(''):
      '<div class="empty"><h3>All counts synchronized</h3><p>No pending local adjustments for this workspace.</p></div>';
    html+='</div><p class="small muted" style="margin-top:16px">Offline adjustments are stored locally only on trusted devices. Signing out does not automatically erase pending adjustments; use the settings control to clear local data on shared devices.</p>';
    return html;
  }
  function settingPanel(){
    const sum=summary();
    return '<div class="panel panel-pad" style="margin-top:18px"><h2>Offline counting</h2>'+
      '<p class="small muted">You can queue count adjustments if the connection is lost while this application is open. Server-side conflict checks prevent silent overwrites.</p>'+
      '<div class="setting-row"><div><strong>Trusted device storage</strong><p>'+
      (sum.trusted?'Local pending adjustments survive a browser restart. Avoid this option on shared computers.':
        'Local pending counts are memory-only and may be lost if this tab closes or refreshes.')+
      '</p></div><button class="btn" data-p4="toggleTrusted">'+(sum.trusted?'Disable storage':'Trust this device')+'</button></div>'+
      '<div class="setting-row"><div><strong>Sync Center</strong><p>'+sum.count+' local adjustments ('+sum.conflicts+' conflicts)</p></div>'+
      '<button class="btn" data-p4="openSync">Open Sync Center</button></div>'+
      '<div class="setting-row"><div><strong>Clear local queue</strong><p>Discard stored adjustments for all accounts on this browser. Does not change official server records.</p></div>'+
      '<button class="btn danger" data-p4="clearLocal">Clear local data</button></div></div>';
  }
  async function toggleTrusted(){
    if(trusted()){
      if(current().length && !confirm('Disable persistent queue storage? Your pending counts may be lost after closing this tab.'))return;
      if(!confirm('Disable trusted-device storage and erase ALL previously stored counts for every account on this browser? Counts currently in this open tab remain in memory.'))return;
      try{
        const db=await database(),tx=db.transaction(STORE,'readwrite');
        await requestDone(tx.objectStore(STORE).clear());
      }catch(error){throw Error('Could not erase offline storage: '+error.message);}
      localStorage.removeItem(TRUST_KEY);
      toast('Persistent local queue disabled and stored counts erased. Current session counts remain until tab closes.');
    }else{
      if(!confirm('Only enable persistent storage on a trusted personal device. Pending item IDs and counts may remain on this browser after sign-out. Continue?'))return;
      localStorage.setItem(TRUST_KEY,'yes');
      try{
        await database();
        for(const record of records)await store(record);
        toast('Trusted-device count storage enabled.');
      }catch(error){localStorage.removeItem(TRUST_KEY);throw error;}
    }
    refresh();
  }
  async function clearLocal(){
    if(!confirm('DISCARD ALL local pending count adjustments for every user on this browser? This cannot be undone.'))return;
    records=[];
    if('indexedDB' in window){
      try{const db=await database();const tx=db.transaction(STORE,'readwrite');
        await requestDone(tx.objectStore(STORE).clear());}
      catch(error){toast('Could not clear local database: '+error.message,true);return;}
    }
    localStorage.removeItem(TRUST_KEY);
    toast('All locally queued count adjustments cleared.');
    refresh();
  }
  function roomLink(room){
    const url=new URL(window.location.href);
    url.search='';url.hash='';
    url.searchParams.set('space',state.space);
    url.searchParams.set('room',room.id);
    return url.toString();
  }
  async function qr(){
    if(!qrModule){
      const mod=await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
      qrModule=mod.default||mod;
    }
    return qrModule;
  }
  async function roomLabel(room){
    const url=roomLink(room);
    openModal(modalHeading('Room label · '+room.name)+
      '<div class="p4-label"><strong>North Heights Church of Christ</strong><h2>'+E(room.name)+'</h2>'+
      '<div id="p4QrHolder" class="p4-qr"><span>Generating QR code...</span></div>'+
      '<p class="small muted">Scan to open this room after signing in. The code contains no inventory details.</p>'+
      '<p class="p4-shortlink">'+E(url)+'</p></div>'+
      '<div class="modal-foot"><button class="btn" data-p4="printQR">Print label</button>'+
      '<button class="btn" data-p4="copyURL">Copy link</button></div>');
    try{
      const QR=await qr();const data=await QR.toDataURL(url,{width:300,margin:2,errorCorrectionLevel:'M'});
      const holder=document.getElementById('p4QrHolder');
      if(holder){holder.innerHTML='<img alt="QR code for '+E(room.name)+'" width="240" height="240" src="'+E(data)+'">';holder.dataset.url=url;}
    }catch(error){
      const holder=document.getElementById('p4QrHolder');
      if(holder)holder.textContent='QR generation needs an internet connection. Use the room link instead.';
      toast('Could not load QR generator.',true);
    }
  }
  async function allRoomLabels(){
    const rooms=activeRooms();
    if(!rooms.length)throw Error('Create some rooms first.');
    if(rooms.length>80)throw Error('Print a maximum of 80 room labels at once.');
    const QR=await qr();
    const labels=[];
    for(const room of rooms){
      const url=roomLink(room);
      const image=await QR.toDataURL(url,{width:230,margin:2,errorCorrectionLevel:'M'});
      labels.push('<section class="p4-print-label"><strong>North Heights Church of Christ</strong><h2>'+
        E(room.name)+'</h2><img width="190" height="190" alt="Room QR code" src="'+E(image)+'">'+
        '<p>Scan to open inventory</p><small>'+E(url)+'</small></section>');
    }
    const root=document.createElement('div');root.id='p4PrintRoot';root.innerHTML=labels.join('');
    document.body.append(root);
    const cleanup=()=>{root.remove();window.removeEventListener('afterprint',cleanup);};
    window.addEventListener('afterprint',cleanup,{once:true});window.print();
    setTimeout(cleanup,60000);
  }
  function handleClick(button){
    const action=button.dataset.p4;if(!action)return false;
    const perform=async()=>{
      if(action==='syncNow')await sync();
      else if(action==='apply')await resolve(button.dataset.id,'apply');
      else if(action==='discard')await resolve(button.dataset.id,'discard');
      else if(action==='openSync')showPage('sync');
      else if(action==='settings')showPage('settings');
      else if(action==='toggleTrusted')await toggleTrusted();
      else if(action==='clearLocal')await clearLocal();
      else if(action==='label'){
        const room=activeRooms().find(r=>r.id===button.dataset.id);
        if(!room)throw Error('Room no longer available.');await roomLabel(room);
      }else if(action==='allLabels')await allRoomLabels();
      else if(action==='printQR')window.print();
      else if(action==='copyURL'){
        const link=document.querySelector('#p4QrHolder')?.dataset.url;
        if(!link)throw Error('The room URL is not ready.');
        await navigator.clipboard.writeText(link);toast('Room link copied.');
      }
    };
    perform().catch(catchError);return true;
  }
  window.addEventListener('online',()=>{refresh();sync().catch(catchError);});
  window.addEventListener('offline',refresh);
  return {start,adjust,sync,summary,queuedFor,syncPage,settingPanel,handleClick,roomLink,allRoomLabels};
}

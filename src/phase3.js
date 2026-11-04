import { collection, getDocs, onSnapshot } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { buildInventoryPdf } from './report-pdf.js?v=20261103-report1';

// The report/disposition UI is deliberately isolated from the Phase 1/2 editor.
// Authorization and property decisions are enforced by Firestore Security Rules.
export function initPhase3(env) {
  const {state,db,call,E,header,modeBanner,canEdit,isOwner,roomName,activeRooms,
    activeItems,getPerson,toast,catchError,openModal,modalHeading,closeModal,confirmDialog,renderMain}=env;
  const LABELS={
    retain:'Retain / relocate',
    'include-with-property':'Include with property',
    donate:'Donate',
    'sell-separately':'Sell separately',
    dispose:'Dispose'
  };
  const TYPES=Object.keys(LABELS);
  const STATUS={proposed:'Awaiting owner approval',approved:'Approved',rejected:'Rejected','needs-review':'Review required'};
  const p={reportType:'full',roomId:'all',source:'live',loadedSnapshot:null,loading:false,space:null};
  const workspace=()=>collection(db,'workspaces',state.space,'dispositions');
  const snapshots=()=>collection(db,'workspaces',state.space,'snapshots');
  const events=()=>collection(db,'workspaces',state.space,'dispositionEvents');
  const btn=(action,label,id='',css='btn sm')=>'<button class="'+css+'" data-p3="'+action+'"'+(id?' data-id="'+E(id)+'"':'')+'>'+E(label)+'</button>';
  const badge=(status)=>{
    const cls=status==='approved'?'':status==='proposed'?'blue':status==='needs-review'?'warn':'slate';
    return '<span class="badge '+cls+'">'+E(STATUS[status]||'Not proposed')+'</span>';
  };
  const totalAllocation=d=>Array.isArray(d?.allocations)?d.allocations.reduce((n,x)=>n+(Number(x.quantity)||0),0):0;
  const summaryAlloc=d=>d?.allocations?.filter(x=>x.quantity>0).map(x=>E(LABELS[x.type])+': '+Number(x.quantity).toLocaleString()).join(' · ')||'No allocations';
  function subscribe(push){
    p.space=state.space;p.source='live';p.loadedSnapshot=null;p.roomId='all';
    state.dispositions=[];state.snapshots=[];state.dispositionEvents=[];
    push(onSnapshot(workspace(),snapshot=>{
      if(p.space!==state.space)return;
      state.dispositions=snapshot.docs.map(d=>({id:d.id,...d.data()}));renderMain();
    },catchError));
    push(onSnapshot(snapshots(),snapshot=>{
      if(p.space!==state.space)return;
      state.snapshots=snapshot.docs.map(d=>({id:d.id,...d.data()}))
        .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));renderMain();
    },catchError));
    push(onSnapshot(events(),snapshot=>{
      if(p.space!==state.space)return;
      state.dispositionEvents=snapshot.docs.map(d=>({id:d.id,...d.data()}))
        .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).slice(0,150);
      renderMain();
    },catchError));
  }
  function dispositionPage(){
    const items=activeItems().slice().sort((a,b)=>roomName(a.roomId).localeCompare(roomName(b.roomId))||a.name.localeCompare(b.name));
    const decisions=new Map((state.dispositions||[]).map(d=>[d.itemId,d]));
    const proposed=items.filter(i=>decisions.get(i.id)?.status==='proposed').length;
    const approved=items.filter(i=>decisions.get(i.id)?.status==='approved').length;
    const stale=items.filter(i=>decisions.get(i.id)?.status==='needs-review').length;
    let html=header('Property dispositions','Record proposed plans for congregation property and obtain explicit owner approval.')+modeBanner();
    html+='<div class="alert official"><strong>Authorization is not execution.</strong> Approval in this application documents an internal decision; it does not transfer ownership or override a property sale contract. Check with congregation leadership before any item is moved, given away, or sold.</div>';
    html+='<div class="metrics p3-metrics">'+[
      ['Awaiting approval',proposed],['Approved',approved],['Needs rechecking',stale],['Not proposed',items.length-approved-proposed-stale]
    ].map(([name,count])=>'<div class="metric"><div class="metric-label">'+E(name)+'</div><div class="metric-number">'+count+'</div></div>').join('')+'</div>';
    if(!items.length)return html+'<div class="empty"><h3>No inventory items yet</h3><p>Create items in Rooms or All Inventory first.</p></div>';
    html+='<div class="panel table-scroll"><table class="item-table"><thead><tr><th>Item</th><th>Qty</th><th>Allocation</th><th>Review</th><th>Actions</th></tr></thead><tbody>'+
      items.map(item=>{
        const d=decisions.get(item.id);
        return '<tr><td><div class="item-name">'+E(item.name)+'</div><span class="item-sub">'+E(roomName(item.roomId))+'</span></td>'+
          '<td>'+item.quantity+'</td><td class="small">'+(d?summaryAlloc(d):'<span class="muted">Not proposed</span>')+
          (d?'<div class="item-sub">'+(item.quantity-totalAllocation(d))+' unallocated</div>':'')+'</td>'+
          '<td>'+(d?badge(d.status):'<span class="badge slate">Undecided</span>')+'</td>'+
          '<td><div class="inline-actions">'+(canEdit()?btn('propose',d?'Revise':'Propose',item.id):'')+
          (isOwner()&&d?.status==='proposed'?
            btn('approve','Approve',item.id,'btn sm primary')+btn('reject','Reject',item.id,'btn sm danger'):'')+
          '</div></td></tr>';
      }).join('')+'</tbody></table></div>';
    const events=(state.dispositionEvents||[]).slice(0,25);
    html+='<div class="panel panel-pad" style="margin-top:18px"><div class="section-head"><h2>Decision history</h2><span class="small muted">Recent 25 events</span></div>'+
      (events.length?events.map(x=>'<div class="list-row"><div><strong>'+E(x.itemName||'Item')+'</strong><p>'+
        E(x.action||'changed')+' · '+E(getPerson(x.actorUid))+' · Version '+E(x.version||1)+'</p></div>'+
        '<span class="small muted">'+E(x.createdAt?.toDate?.()?.toLocaleString()||'Recently')+'</span></div>').join(''):
        '<p class="muted small">New submissions and decisions will appear here.</p>')+'</div>';
    return html;
  }
  function openProposal(itemId){
    if(!canEdit())throw Error('Only authorized inventory workers can propose property dispositions.');
    const item=activeItems().find(i=>i.id===itemId);
    if(!item)throw Error('Item no longer exists.');
    const prev=(state.dispositions||[]).find(d=>d.itemId===itemId);
    const quantities=Object.fromEntries((prev?.allocations||[]).map(x=>[x.type,x.quantity]));
    const allocations=TYPES.map(t=>'<div class="p3-allocation"><label for="allocation-'+t+'">'+E(LABELS[t])+'</label>'+
      '<input id="allocation-'+t+'" name="'+t+'" type="number" step="1" min="0" max="'+item.quantity+'" value="'+Number(quantities[t]||0)+'" required></div>').join('');
    openModal(modalHeading('Disposition proposal · '+item.name)+
      '<p class="small muted">Available: '+item.quantity+' units. Leave any quantities not yet decided unallocated.</p>'+
      (prev?.status==='approved'?'<div class="alert">Revising an approved decision withdraws that approval and requires a new review. Previous decisions remain in the history.</div>':'')+
      '<form id="p3ProposalForm" class="form-stack"><input name="itemId" type="hidden" value="'+E(itemId)+'">'+
      '<div class="p3-allocations">'+allocations+'</div>'+
      '<label for="p3ProposalNotes">Reason / instructions (optional)</label>'+
      '<textarea id="p3ProposalNotes" name="notes" maxlength="2000" rows="4" placeholder="Explain the proposed handling of these items.">'+E(prev?.notes||'')+'</textarea>'+
      '<p class="small muted" id="p3AllocationTotal"></p>'+
      '<p class="form-error" id="p3ProposalError"></p><div class="modal-foot">'+
      '<button type="button" class="btn" data-action="closeModal">Cancel</button>'+
      '<button type="submit" class="btn primary">Submit proposal</button></div></form>');
    updateTotal();
  }
  function updateTotal(){
    const form=document.getElementById('p3ProposalForm');
    if(!form)return;
    const item=activeItems().find(i=>i.id===form.elements.itemId.value);
    const count=TYPES.reduce((sum,t)=>sum+Number(form.elements[t]?.value||0),0);
    const el=document.getElementById('p3AllocationTotal');
    if(el)el.textContent=count+' allocated · '+(item?.quantity??0)+' available · '+((item?.quantity??0)-count)+' unallocated';
  }
  function openReview(id,decision){
    if(!isOwner())throw Error('Only the owner can approve or reject property dispositions.');
    const item=activeItems().find(i=>i.id===id);
    const proposal=(state.dispositions||[]).find(d=>d.itemId===id);
    if(!item || proposal?.status!=='proposed')throw Error('No pending proposal was found.');
    openModal(modalHeading((decision==='approved'?'Approve':'Reject')+' · '+item.name)+
      '<div class="p3-review-details"><strong>'+E(summaryAlloc(proposal).replace(/&amp;/g,'&'))+'</strong><p class="small muted">'+E(proposal.notes||'No explanation provided.')+'</p></div>'+
      '<form id="p3ReviewForm" class="form-stack"><input type="hidden" name="itemId" value="'+E(id)+'"><input type="hidden" name="decision" value="'+E(decision)+'">'+
      '<label>Review note '+(decision==='rejected'?'(required)':'(optional)')+'</label>'+
      '<textarea name="reviewNote" maxlength="2000" rows="4" '+(decision==='rejected'?'required':'')+' placeholder="Decision rationale"></textarea>'+
      '<p id="p3ReviewError" class="form-error"></p><div class="modal-foot"><button type="button" class="btn" data-action="closeModal">Cancel</button>'+
      '<button type="submit" class="btn '+(decision==='approved'?'primary':'danger')+'">'+(decision==='approved'?'Approve proposal':'Reject proposal')+'</button></div></form>');
  }
  function reportData(data) {
    const rooms=(data.rooms||[]).slice().sort((a,b)=>a.name.localeCompare(b.name));
    const ids=new Set(rooms.map(r=>r.id));
    const items=(data.items||[]).filter(i=>ids.has(i.roomId)).slice().sort((a,b)=>(rooms.find(r=>r.id===a.roomId)?.name||'').localeCompare(rooms.find(r=>r.id===b.roomId)?.name||'')||a.name.localeCompare(b.name));
    const proposals=new Map((data.dispositions||[]).map(d=>[d.itemId,d]));
    let filtered=items;
    if(p.roomId!=='all')filtered=filtered.filter(i=>i.roomId===p.roomId);
    const lookup=id=>rooms.find(r=>r.id===id)?.name||'Unknown room';
    const titles={full:'Full inventory',room:'Room inventory',condition:'Condition summary',disposition:'Property disposition register'};
    const rows=[];
    if(p.reportType==='full'||p.reportType==='room'){
      rows.push(['Room','Item','Category','Quantity','Condition','Notes','Status']);
      filtered.forEach(i=>rows.push([lookup(i.roomId),i.name,i.category||'Other',i.quantity,i.condition||'Not assessed',i.notes||'',rooms.find(r=>r.id===i.roomId)?.status||'']));
    } else if(p.reportType==='condition'){
      rows.push(['Condition','Item types','Total units']);
      const map=new Map();
      filtered.forEach(i=>{
        const condition=i.condition||'Not assessed';
        const o=map.get(condition)||{kinds:0,units:0};
        o.kinds++;o.units+=i.quantity;map.set(condition,o);
      });
      for(const [condition,v] of [...map.entries()].sort())rows.push([condition,v.kinds,v.units]);
    } else {
      rows.push(['Room','Item','Total qty','Decision status','Retain','With property','Donate','Sell','Dispose','Unallocated','Notes','Reviewed by']);
      filtered.forEach(i=>{
        const d=proposals.get(i.id), quantities=Object.fromEntries((d?.allocations||[]).map(x=>[x.type,x.quantity]));
        rows.push([lookup(i.roomId),i.name,i.quantity,d?.status||'Undecided',
          ...TYPES.map(k=>quantities[k]||0),d?.unallocated??i.quantity,d?.notes||'',d?.reviewedBy||'']);
      });
    }
    return {title:titles[p.reportType],reportType:p.reportType,roomFilter:p.roomId,rows,
      roomCount:p.roomId==='all'?rooms.length:rooms.some(r=>r.id===p.roomId)?1:0,itemTypes:filtered.length,
      units:filtered.reduce((n,i)=>n+i.quantity,0),
      source:data.label||'Current working inventory',
      createdAt:data.createdAt||new Date().toLocaleString(),
      warning:'Inventory record only. Proposed property dispositions are not authorization to remove or transfer property.'};
  }
  function liveDataset(){
    return {rooms:activeRooms(),items:activeItems(),dispositions:state.dispositions||[],label:state.space.toUpperCase()+' · Live inventory',createdAt:new Date().toLocaleString()};
  }
  async function loadSnapshot(id){
    const meta=(state.snapshots||[]).find(x=>x.id===id);
    if(!meta || meta.status!=='complete')throw Error('Snapshot unavailable or incomplete.');
    const currentSpace=state.space;
    p.loading=true;renderMain();
    try{
      const snap=await getDocs(collection(db,'workspaces',currentSpace,'snapshots',id,'entries'));
      if(currentSpace!==state.space)return;
      const entries=snap.docs.map(d=>d.data());
      p.loadedSnapshot={
        id,label:meta.label+' ('+meta.type+')',createdAt:meta.createdAt?.toDate?.()?.toLocaleString()||'',
        rooms:entries.filter(x=>x.kind==='room').map(x=>x.record),
        items:entries.filter(x=>x.kind==='item').map(x=>x.record),
        dispositions:entries.filter(x=>x.kind==='disposition').map(x=>x.record)
      };
      p.source=id;toast('Frozen snapshot loaded.');
    }finally{p.loading=false;renderMain();}
  }
  async function currentDataset(){
    if(p.source==='live')return liveDataset();
    if(p.loadedSnapshot?.id===p.source)return p.loadedSnapshot;
    await loadSnapshot(p.source);
    if(!p.loadedSnapshot)throw Error('Snapshot was not loaded.');
    return p.loadedSnapshot;
  }
  const csvCell=value=>{
    let str=String(value??'');
    if(/^\s*[-=+@]/.test(str))str="'"+str;
    return '"'+str.replace(/"/g,'""')+'"';
  };
  function download(text,mime,name){
    const blob=new Blob([text],{type:mime});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function filename(ext){return 'north-heights-'+state.space+'-'+p.reportType+'-'+new Date().toISOString().slice(0,10)+'.'+ext;}
  async function exportCSV(){
    const report=reportData(await currentDataset());
    download('\uFEFF'+report.rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8',filename('csv'));
    toast('CSV report downloaded.');
  }
  async function exportPDF(){
    const report=reportData(await currentDataset());
    const {jsPDF}=await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm');
    const pdf=new jsPDF({
      orientation:report.reportType==='full'||report.reportType==='disposition'?'landscape':
        report.reportType==='room'&&report.roomFilter==='all'?'landscape':'portrait',
      unit:'mm',format:'a4',compress:true
    });
    buildInventoryPdf(pdf,report,{workspace:state.space});
    pdf.save(filename('pdf'));
    toast('Designed PDF report downloaded.');
  }
  async function printReport(){
    const report=reportData(await currentDataset());
    const root=document.createElement('div');
    root.id='phase3PrintRoot';
    const heading='<div class="rpt-print-brand"><div class="rpt-print-mark">NH</div>'+
      '<div><span>NORTH HEIGHTS CHURCH OF CHRIST</span><small>CONGREGATIONAL PROPERTY INVENTORY</small></div>'+
      '<strong>'+E(state.space.toUpperCase())+' RECORD</strong></div>';
    root.innerHTML=heading+'<div class="rpt-print-heading"><h1>'+E(report.title)+'</h1>'+
      '<p>'+E(report.source)+' · '+E(report.createdAt)+'</p></div>'+
      '<div class="rpt-print-metrics"><div>ROOMS <strong>'+report.roomCount+'</strong></div>'+
      '<div>ITEM TYPES <strong>'+report.itemTypes+'</strong></div>'+
      '<div>TOTAL UNITS <strong>'+report.units.toLocaleString()+'</strong></div></div>'+
      '<table><thead><tr>'+report.rows[0].map(col=>'<th>'+E(col)+'</th>').join('')+'</tr></thead><tbody>'+
      report.rows.slice(1).map(row=>'<tr>'+row.map(v=>'<td>'+E(v)+'</td>').join('')+'</tr>').join('')+
      '</tbody></table>'+
      '<div class="rpt-print-review"><h3>Record review</h3>'+
      '<div>Prepared by: __________________________ &nbsp; Date: ____________</div>'+
      '<div>Reviewed by: __________________________ &nbsp; Date: ____________</div>'+
      '<p>'+E(report.warning)+'</p></div>';
    document.body.append(root);
    const cleanup=()=>{root.remove();window.removeEventListener('afterprint',cleanup);};
    window.addEventListener('afterprint',cleanup,{once:true});
    window.print();
    setTimeout(cleanup,60000);
  }
  function reportPage(){
    const rooms=p.loadedSnapshot?.rooms || activeRooms();
    const sourceMeta=(state.snapshots||[]).find(s=>s.id===p.source);
    const liveReport=reportData(liveDataset());
    const reportDescriptions={
      full:'A comprehensive register of belongings organized by room, with quantities, conditions and notes.',
      room:'A focused room-by-room record that is easy to print, verify and share with leadership.',
      condition:'A concise summary of the condition of the congregation\'s inventoried property.',
      disposition:'An approval-aware register of proposed retention, property transfer, donation, sale or disposal.'
    };
    const options=[['full','Full inventory'],['room','Room inventory'],['condition','Condition summary'],['disposition','Disposition register']];
    const sourceType=p.source==='live'?'Live working data':'Dated archived snapshot';
    const displayRooms=sourceMeta?.roomCount ?? liveReport.roomCount;
    const displayTypes=sourceMeta?.itemTypes ?? liveReport.itemTypes;
    const displayUnits=sourceMeta?.totalUnits ?? liveReport.units;
    let html=header('Inventory reports','Produce clear, professional records for reviewing church property and preparing for the building transition.')+modeBanner();
    html+='<div class="rpt-hero">'+
      '<div class="rpt-hero-heading"><div><span class="rpt-kicker">NORTH HEIGHTS · RECORDS OFFICE</span>'+
      '<h2>Every item accounted for.</h2>'+
      '<p>Create an inventory register, review conditions, document planned dispositions, or preserve a dated snapshot.</p></div>'+
      '<span class="rpt-hero-icon" aria-hidden="true">▤</span></div>'+
      '<div class="rpt-summary-strip">'+
      [['Rooms',displayRooms],['Item types',displayTypes],['Total units',displayUnits]].map(([name,value])=>
        '<div><span>'+E(name)+'</span><strong>'+Number(value||0).toLocaleString()+'</strong></div>').join('')+
      '</div></div>';
    html+='<div class="rpt-layout">'+
      '<section class="panel rpt-builder"><div class="rpt-section-heading"><span class="rpt-step">01</span><div>'+
      '<h2>Build a report</h2><p>Choose the details you need, then download your finished record.</p></div></div>'+
      '<div class="rpt-form-grid">'+
      '<div class="field"><label for="p3ReportType">Record format</label><select id="p3ReportType">'+
      options.map(([k,v])=>'<option value="'+k+'" '+(p.reportType===k?'selected':'')+'>'+E(v)+'</option>').join('')+
      '</select></div>'+
      '<div class="field"><label for="p3RoomFilter">Room</label><select id="p3RoomFilter">'+
      '<option value="all">All rooms</option>'+rooms.map(r=>'<option value="'+E(r.id)+'" '+(p.roomId===r.id?'selected':'')+'>'+E(r.name)+'</option>').join('')+
      '</select></div>'+
      '<div class="field rpt-source-field"><label for="p3Source">Record source</label><select id="p3Source">'+
      '<option value="live" '+(p.source==='live'?'selected':'')+'>Current working inventory</option>'+
      (state.snapshots||[]).filter(s=>s.status==='complete').map(s=>
        '<option value="'+E(s.id)+'" '+(p.source===s.id?'selected':'')+'>'+E(s.label)+' · '+E(s.type)+'</option>').join('')+
      '</select></div></div>'+
      '<div class="rpt-format-note"><span class="rpt-note-dot"></span><p><strong>'+E(options.find(o=>o[0]===p.reportType)?.[1]||'Inventory report')+'</strong> — '+
      E(reportDescriptions[p.reportType]||'Select a report type to preview it.')+'</p></div>'+
      '<div class="rpt-export-actions">'+
      btn('pdf','Download designed PDF','','btn primary')+
      btn('csv','Export spreadsheet CSV')+
      btn('print','Print record')+'</div>'+
      '<p class="rpt-helper">PDFs include a North Heights letterhead, organized tables, page numbers, and a review section. CSV files retain the full underlying columns.</p></section>'+
      '<aside class="panel rpt-report-info"><div class="rpt-section-heading"><span class="rpt-step">02</span>'+
      '<div><h2>Report details</h2><p>Confirm your source before sharing.</p></div></div>'+
      '<div class="rpt-detail-line"><span>Workspace</span><strong>'+E(state.space.toUpperCase())+'</strong></div>'+
      '<div class="rpt-detail-line"><span>Source</span><strong>'+E(sourceType)+'</strong></div>'+
      '<div class="rpt-detail-line"><span>Selected rooms</span><strong>'+E(p.roomId==='all'?'All rooms':rooms.find(r=>r.id===p.roomId)?.name||'Room not found')+'</strong></div>'+
      (sourceMeta?'<div class="rpt-detail-line"><span>Snapshot</span><strong>'+E(sourceMeta.label)+'</strong></div>':'')+
      '<div class="rpt-info-foot">This report reflects '+E(p.source==='live'?'current working records':'the selected saved snapshot')+
      '. It is an inventory record, not authorization to transfer congregation property.</div></aside></div>';
    const snaps=state.snapshots||[];
    html+='<section class="panel rpt-snapshots"><div class="rpt-snapshots-top"><div><span class="rpt-kicker">DOCUMENT ARCHIVE</span>'+
      '<h2>Saved inventory snapshots</h2><p>Preserve a dated copy for reference even after working quantities change.</p></div>'+
      ((state.space==='test'?canEdit():isOwner())?btn('createSnapshot','+ Save snapshot','','btn primary'):'')+'</div>'+
      (snaps.length?
        '<div class="rpt-snapshot-list">'+snaps.map(s=>
        '<div class="rpt-snapshot-entry"><div class="rpt-snapshot-icon" aria-hidden="true">▣</div>'+
        '<div class="rpt-snapshot-body"><strong>'+E(s.label)+'</strong><p>'+
        E(s.type||'draft')+' · '+Number(s.roomCount||0)+' rooms · '+Number(s.totalUnits||0).toLocaleString()+
        ' units · '+E(s.createdAt?.toDate?.()?.toLocaleDateString()||'Date unavailable')+'</p></div>'+
        '<span class="badge '+(s.status==='complete'?'':'slate')+'">'+E(s.status||'pending')+'</span>'+
        '<div class="rpt-snapshot-actions">'+
        (s.status==='complete'?btn('loadSnapshot','Use',''+s.id):'')+
        (state.space==='test'&&canEdit()?btn('deleteSnapshot','Delete',s.id,'btn sm danger'):'')+
        '</div></div>').join('')+'</div>':
        '<div class="rpt-empty-archive"><div aria-hidden="true">▢</div><h3>No snapshots yet</h3>'+
        '<p>Your dated records will appear here after you save your first snapshot.</p></div>')+
      '</section>';
    return html;
  }
  function snapshotEditor(){
    if(state.space==='official'&&!isOwner())throw Error('Only the owner may save official snapshots.');
    if(!canEdit())throw Error('Inventory access required.');
    openModal(modalHeading('Save inventory snapshot')+
      '<form id="p3SnapshotForm" class="form-stack"><label>Snapshot name</label>'+
      '<input name="label" required minlength="3" maxlength="100" value="'+E('Inventory '+new Date().toLocaleDateString())+'">'+
      '<label>Snapshot type</label><select name="type"><option value="draft">Draft / working copy</option>'+
      '<option value="final">Final verified record</option></select>'+
      '<div class="alert"><strong>Final official snapshots</strong> require every active room to be verified and no pending or outdated disposition decisions. Frozen snapshots cannot be edited after saving.</div>'+
      '<p class="form-error" id="p3SnapshotError"></p><div class="modal-foot"><button type="button" class="btn" data-action="closeModal">Cancel</button>'+
      '<button class="btn primary" type="submit">Save dated snapshot</button></div></form>');
  }
  async function handleClick(button){
    const action=button.dataset.p3;if(!action)return false;
    try{
      if(action==='propose')openProposal(button.dataset.id);
      else if(action==='approve')openReview(button.dataset.id,'approved');
      else if(action==='reject')openReview(button.dataset.id,'rejected');
      else if(action==='createSnapshot')snapshotEditor();
      else if(action==='loadSnapshot'){await loadSnapshot(button.dataset.id);showReport();}
      else if(action==='deleteSnapshot'){
        const id=button.dataset.id;
        if(state.space!=='test'||!canEdit())throw Error('Only test snapshots may be deleted.');
        confirmDialog('Delete test snapshot?','This permanently deletes this frozen TEST snapshot and all of its entries.','Delete snapshot',async()=>{
          await call('deleteTestSnapshot',{space:'test',snapshotId:id});
          if(p.source===id){p.source='live';p.loadedSnapshot=null;}
          toast('Test snapshot deleted.');
        });
      } else if(action==='pdf')await exportPDF();
      else if(action==='csv')await exportCSV();
      else if(action==='print')await printReport();
    }catch(error){catchError(error);}
    return true;
  }
  function showReport(){state.page='reports';renderMain();}
  async function handleSubmit(event){
    const form=event.target;
    if(!['p3ProposalForm','p3ReviewForm','p3SnapshotForm'].includes(form.id))return false;
    event.preventDefault();
    const button=form.querySelector('[type=submit]');button.disabled=true;
    const fd=new FormData(form);
    try{
      if(form.id==='p3ProposalForm'){
        if(!canEdit())throw Error('Permission denied.');
        const itemId=String(fd.get('itemId')||'');
        const item=activeItems().find(i=>i.id===itemId);
        if(!item)throw Error('This item is no longer active.');
        const allocations=TYPES.map(type=>({type,quantity:Number(fd.get(type))}));
        if(allocations.some(x=>!Number.isSafeInteger(x.quantity)||x.quantity<0)||allocations.reduce((n,x)=>n+x.quantity,0)>item.quantity){
          throw Error('Enter nonnegative whole-number allocations that do not exceed the item quantity.');
        }
        await call('proposeDisposition',{space:state.space,itemId,allocations,notes:String(fd.get('notes')||'')});
        closeModal();toast('Property disposition proposal submitted.');
      } else if(form.id==='p3ReviewForm'){
        if(!isOwner())throw Error('Only the owner may review disposition proposals.');
        await call('reviewDisposition',{space:state.space,itemId:String(fd.get('itemId')||''),decision:String(fd.get('decision')),reviewNote:String(fd.get('reviewNote')||'')});
        closeModal();toast('Review recorded.');
      } else {
        await call('createInventorySnapshot',{space:state.space,label:String(fd.get('label')||''),type:String(fd.get('type')||'draft')});
        closeModal();toast('Dated inventory snapshot saved.');
      }
    }catch(error){
      catchError(error);
      const id=form.id==='p3ProposalForm'?'p3ProposalError':form.id==='p3ReviewForm'?'p3ReviewError':'p3SnapshotError';
      const el=document.getElementById(id);if(el)el.textContent=error?.message||'Unable to save.';
    }finally{button.disabled=false;}
    return true;
  }
  function handleChange(event){
    const {id,value}=event.target;
    if(id==='p3ReportType'){p.reportType=value;renderMain();return true;}
    if(id==='p3RoomFilter'){p.roomId=value;renderMain();return true;}
    if(id==='p3Source'){p.source=value;p.loadedSnapshot=null;renderMain();return true;}
    return false;
  }
  function handleInput(event){if(event.target.closest('#p3ProposalForm')){updateTotal();return true;}return false;}
  return {subscribe,dispositionPage,reportPage,handleClick,handleSubmit,handleChange,handleInput};
}

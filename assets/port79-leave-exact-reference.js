/* PORT79 reference-matched leave management. Read-only UI, layout, local
 * pagination and search. NEVER changes leave records, annual balances,
 * employee master, permissions, approval or cloud writes. */
(function(){
'use strict';
// UI-only: hide application-number labels, never record.id in authorized requests.
function hideApplicationNumber(root){
 if(!root)return;
 for(const node of root.querySelectorAll('th,dt,label,small,span')){
  if(node.children.length||String(node.textContent||'').trim()!=='申請單號')continue;
  if(node.tagName==='TH'){
   const table=node.closest('table'),col=node.cellIndex;
   if(table&&col>=0){
    for(const tr of table.querySelectorAll('tr')){
     const cell=tr.cells?.[col];
     if(cell)cell.hidden=true;
    }
   }
   continue;
  }
  (node.closest('.p79-detail-cell,.field,.form-field,.form-group')||node).hidden=true;
 }
}
function init(){
 const admin=document.getElementById('adminMode');
 const balanceMode=document.getElementById('adminBalanceMode');
 const card=admin?.querySelector(':scope > .card');
 const tabs=document.getElementById('leaveStickyTabs');
 const heading=document.getElementById('p79LeaveVisualHeading');
 const side=document.getElementById('p79LeaveVisualSide');
 const body=document.getElementById('adminLeaveBody');
 const table=body?.closest('table');
 if(!admin||!card||!tabs||!heading||!side||!body||!table||
    document.getElementById('p79PixelFilterBar'))return;
 const make=(tag,cls,text)=>{
  const x=document.createElement(tag);if(cls)x.className=cls;
  if(text!==undefined)x.textContent=text;return x;
 };
 const active=()=>!admin.classList.contains('hidden')||!!balanceMode&&!balanceMode.classList.contains('hidden');
 const monthSelect=document.getElementById('filterMonth');
 const title=heading.querySelector('.p79-leave-visual-heading-title strong');
 if(title)title.textContent='請假管理';
 const subtitle=heading.querySelector('.p79-leave-visual-heading-title small');
 if(subtitle)subtitle.textContent='';

 // The real admin/employee/balance tabs are re-used. The new "紀錄查詢"
 // merely switches to the same original records table with no writes.
 const employeeTab=document.getElementById('tabEmployee');
 const adminTab=document.getElementById('tabAdmin');
 const balanceTab=document.getElementById('tabLeaveBalances');
 let queryView=false;
 const recordsTab=make('button','tab hidden','請假紀錄查詢');
 recordsTab.id='p79PixelHistoryTab';recordsTab.type='button';
 if(adminTab)tabs.insertBefore(recordsTab,adminTab.nextSibling);
 if(balanceTab&&adminTab){
  tabs.insertBefore(balanceTab,recordsTab.nextSibling);
  tabs.insertBefore(employeeTab,balanceTab.nextSibling);
 }
 if(adminTab)adminTab.textContent='請假申請與審核';
 if(balanceTab)balanceTab.textContent='員工年假剩餘天數';
 if(employeeTab)employeeTab.textContent='員工請假';
 recordsTab.addEventListener('click',()=>{
  if(adminTab?.classList.contains('hidden'))return;
  // The existing annual tab is controlled by its own CSS state. Clear it
  // before opening the read-only history view, otherwise the records card
  // stays hidden even though the admin page is active.
  document.documentElement.classList.remove('p79-leave-balance-only');
  if(typeof switchMode==='function')switchMode('admin');
  queryView=true;
  document.documentElement.classList.add('p79-pixel-history-view');
  adminTab?.classList.remove('active');
  balanceTab?.classList.remove('active');
  recordsTab.classList.add('active');
 });
 const closeHistory=()=>{
  queryView=false;document.documentElement.classList.remove('p79-pixel-history-view');
  recordsTab.classList.remove('active');
 };
 adminTab?.addEventListener('click',closeHistory);
 employeeTab?.addEventListener('click',closeHistory);
 balanceTab?.addEventListener('click',closeHistory);
 const permissionObserver=new MutationObserver(()=>{
  const allowed=!adminTab?.classList.contains('hidden');
  recordsTab.classList.toggle('hidden',!allowed);
  if(!allowed)closeHistory();
 });
 if(adminTab){
  permissionObserver.observe(adminTab,{attributes:true,attributeFilter:['class']});
  recordsTab.classList.toggle('hidden',adminTab.classList.contains('hidden'));
 }

 // Remove only the duplicate presentation row (company/unit/group/bell/user).
 // The original top toolbar and account remain intact. The real department,
 // job and status selectors below still use their authorized live handlers.
 const headingRight=heading.querySelector('.p79-leave-visual-heading-right');
 if(headingRight){headingRight.replaceChildren();headingRight.hidden=true;}

 // Reuse every live original button and select. Moves are structural only,
 // preserving inline onclick, permission attributes and value listeners.
 const toolbar=card.querySelector(':scope > .toolbar');
 const actions=card.querySelector(':scope > div:first-child .actions');
 const filter=make('div','p79-pixel-filter');
 filter.id='p79PixelFilterBar';
 const createButton=document.getElementById('adminCreateLeaveBtn');
 if(createButton)filter.append(createButton);
 const fields=toolbar?[...toolbar.children]:[];
 for(const field of fields)filter.append(field);
 const search=make('input','p79-pixel-search');
 search.id='p79PixelLeaveSearch';search.type='search';
 search.placeholder='⌕  姓名／工號';search.setAttribute('aria-label','依姓名或工號搜尋顯示中的請假紀錄');
 const searchButton=make('button','p79-pixel-search-btn','查詢');
 searchButton.type='button';
 filter.append(search,searchButton);
 const extra=make('details','p79-pixel-extra');
 const extraSummary=make('summary','','其他操作');
 extra.append(extraSummary);
 if(actions)extra.append(actions);
 const cleanup=document.getElementById('p79CleanupDeletedLeaveButton');
 if(cleanup)extra.append(cleanup);
 filter.append(extra);
 const originalHeading=card.querySelector(':scope > div:first-child');
 const tableWrap=card.querySelector('.table-wrap');
 card.insertBefore(filter,tableWrap);
 const footer=make('div','p79-pixel-table-footer');
 footer.id='p79PixelTableFooter';
 const pagination=make('div','p79-pixel-pages');
 pagination.id='p79PixelPages';
 const text=make('span','p79-pixel-page-count');
 text.id='p79PixelPageCount';
 const summary=document.getElementById('adminLeaveSummary');
 if(summary)footer.append(summary);
 footer.append(text,pagination);
 if(tableWrap)tableWrap.insertAdjacentElement('afterend',footer);
 if(originalHeading)originalHeading.setAttribute('data-p79-pixel-original-heading','true');
 if(toolbar)toolbar.setAttribute('data-p79-pixel-original-toolbar','true');

 // Local pagination: display-only 7 rows/page. The original DOM cells,
 // onclick handlers, cloud approval/cover buttons and export remain intact.
 let currentPage=1;
 const pageSize=7;
 const selectedStatus=()=>document.getElementById('filterStatus')?.value||'';
 function updateTable(){
  if(!active())return;
  const all=[...body.querySelectorAll(':scope > tr')];
  const keyword=search.value.trim().toLocaleLowerCase('zh-TW');
  // Display-only search. All department/job/status filtering remains
  // delegated to the original official leave table controller.
  const matches=all.filter(tr=>!keyword||tr.textContent.toLocaleLowerCase('zh-TW').includes(keyword));
  const maxPage=Math.max(1,Math.ceil(matches.length/pageSize));
  currentPage=Math.min(currentPage,maxPage);
  const keep=new Set(matches.slice((currentPage-1)*pageSize,currentPage*pageSize));
  for(const tr of all)tr.hidden=!keep.has(tr);
  if(text)text.textContent='顯示 '+(matches.length?((currentPage-1)*pageSize+1):0)+
    '–'+Math.min(currentPage*pageSize,matches.length)+' 筆，共 '+matches.length+' 筆';
  pagination.replaceChildren();
  if(matches.length<=pageSize)return;
  const build=(label,page,disabled,selected=false)=>{
   const btn=make('button',selected?'active':'',label);btn.type='button';btn.disabled=disabled;
   btn.addEventListener('click',()=>{currentPage=page;updateTable()});pagination.append(btn);
  };
  build('‹',Math.max(1,currentPage-1),currentPage===1);
  const start=Math.max(1,Math.min(currentPage-2,maxPage-4));
  for(let p=start;p<=Math.min(maxPage,start+4);p++)build(String(p),p,false,p===currentPage);
  build('›',Math.min(maxPage,currentPage+1),currentPage===maxPage);
 }
 let queued=false;
 function queueTableUpdate(reset=false){
  if(reset)currentPage=1;
  if(queued)return;queued=true;
  Promise.resolve().then(()=>{queued=false;updateTable()});
 }
 search.addEventListener('input',()=>queueTableUpdate(true));
 searchButton.addEventListener('click',()=>queueTableUpdate(true));
 for(const id of ['filterMonth','filterDept','filterJob','filterStatus']){
  document.getElementById(id)?.addEventListener('change',()=>queueTableUpdate(true));
 }
 new MutationObserver(()=>queueTableUpdate()).observe(body,{childList:true});
 const scopeObserver=new MutationObserver(()=>{
  const open=active();
  document.documentElement.classList.toggle('p79-leave-pixel-admin',open);
  if(open)queueTableUpdate();
 });
 scopeObserver.observe(admin,{attributes:true,attributeFilter:['class']});
 if(balanceMode)scopeObserver.observe(balanceMode,{attributes:true,attributeFilter:['class']});

 // Right: show the actual imported ANNUAL balance, and read-only approved
 // usage for other leave types. No fabricated category entitlements.
 const quota=side.querySelector('.p79-leave-visual-quota');
 const person=document.getElementById('p79LeaveVisualPerson');
 if(quota){
  const quotaHead=quota.querySelector('.p79-leave-visual-panel-head');
  if(quotaHead){
    const title=quotaHead.querySelector('strong');
    if(title)title.textContent='請假額度';
    const oldSmall=quotaHead.querySelector('small');if(oldSmall)oldSmall.textContent='原有年假基準';
  }
  const tableBox=make('div','p79-pixel-quota-table');
  tableBox.id='p79PixelQuotaTable';
  const t=make('table');
  t.innerHTML='<thead><tr><th>請假類別</th><th>年度額度</th><th>已使用</th><th>剩餘</th></tr></thead><tbody></tbody>';
  tableBox.append(t);
  quota.append(tableBox);
  const quotaBody=t.querySelector('tbody');
  const rows=[
    ['特休','annual'],['事假','personal'],['病假','sick'],
    ['婚假','marriage'],['喪假','bereavement']
  ];
  function updateQuota(){
   const unit=String(document.getElementById('p79LeaveVisualUnit')?.value||document.getElementById('filterDept')?.value||'').trim();
   const job=String(document.getElementById('p79LeaveVisualJob')?.value||'').trim();
   // Do not show a previous employee's balance after unit or job changes.
   const emp=unit&&job&&typeof employees!=='undefined'&&Array.isArray(employees)?
     employees.find(e=>String(e.empId)===person?.value&&
       typeof p79LeaveUnitOfPerson==='function'&&p79LeaveUnitOfPerson(e)===unit&&
       String(e.jobTitle||e.deptDetail||e.position||'未設定職稱').trim()===job&&
       typeof leaveEmployeeIsActive==='function'&&leaveEmployeeIsActive(e)&&
       window.Port79JobTitleVisibility?.isVisible?.(job)===true&&
       (!window.p79OrgScope||window.p79OrgScope.matches(e))):null;
   let info=null;try{if(emp&&typeof leaveBalanceInfo==='function')info=leaveBalanceInfo(emp);}catch(_){}
   const entries=typeof leaveRecords!=='undefined'&&Array.isArray(leaveRecords)?leaveRecords:[];
   quotaBody.replaceChildren();
   for(const [label,kind] of rows){
    const tr=make('tr');
    const typ=make('td');const tag=make('span','p79-pixel-type '+kind,label);typ.append(tag);
    const entitled=make('td'),used=make('td'),remaining=make('td');
    const value=x=>x===null||x===undefined||!Number.isFinite(Number(x))?'—':
      Number(x).toLocaleString('zh-TW',{maximumFractionDigits:1})+' 天';
    if(kind==='annual'){
      entitled.textContent=value(info?.entitled);used.textContent=value(info?.used);
      remaining.textContent=value(info?.effectiveRemaining);
    }else{
      // Category quotas are not stored in leaveBalance. Display unknown,
      // but derive approved usage from actual official requests.
      entitled.textContent='—';remaining.textContent='—';
      const approved=entries.filter(l=>String(l.status)==='已核准'&&
       emp&&String(l.empId||'').trim().toUpperCase()===String(emp.empId).trim().toUpperCase()&&
       (kind==='personal'?/事假/.test(l.leaveType):kind==='sick'?/病假|傷病/.test(l.leaveType):
        kind==='marriage'?/婚假/.test(l.leaveType):/喪假/.test(l.leaveType)));
      const days=approved.reduce((sum,l)=>sum+(Number(l.days??l.hours??0)||0),0);
      const cloudConfirmed=typeof p79LeaveCloudDataReady!=='undefined'&&p79LeaveCloudDataReady===true;
      used.textContent=emp&&cloudConfirmed?value(days):'—';
    }
    tr.append(typ,entitled,used,remaining);quotaBody.append(tr);
   }
  }
  person?.addEventListener('change',updateQuota);
  document.getElementById('p79LeaveVisualJob')?.addEventListener('change',updateQuota);
  document.getElementById('p79LeaveVisualUnit')?.addEventListener('change',updateQuota);
  document.getElementById('filterDept')?.addEventListener('change',updateQuota);
  const recordsBody=document.getElementById('adminLeaveBody');
  if(recordsBody)new MutationObserver(updateQuota).observe(recordsBody,{childList:true});
  updateQuota();
 }

 // Richer calendar cells are still produced by the original read-only
 // calendar visualizer, which uses real leaveRecords and not sample data.
 const calendar=side.querySelector('.p79-leave-visual-calendar');
 const monthLabel=document.getElementById('p79LeaveVisualMonth');
 if(calendar&&monthLabel){
   const head=calendar.querySelector('.p79-leave-visual-panel-head');
   const label=head?.querySelector('strong');if(label)label.textContent='本月請假日曆';
   const nav=make('span','p79-pixel-calendar-nav');
   const prev=make('button','','‹');prev.type='button';prev.setAttribute('aria-label','前一個月份');
   const next=make('button','','›');next.type='button';next.setAttribute('aria-label','下一個月份');
   nav.append(prev,next);head?.append(nav);
   const go=dir=>{
    if(!monthSelect)return;
    const values=[...monthSelect.options].map(x=>x.value).filter(x=>/^\d{4}-\d{2}$/.test(x)).sort();
    if(!values.length)return;
    const current=monthSelect.value||values.at(-1);
    const index=values.indexOf(current);
    const candidate=values[Math.max(0,Math.min(values.length-1,(index<0?values.length-1:index)+dir))];
    if(candidate&&candidate!==current){
      monthSelect.value=candidate;
      monthSelect.dispatchEvent(new Event('change',{bubbles:true}));
    }
   };
   prev.addEventListener('click',()=>go(-1));next.addEventListener('click',()=>go(1));
 }

 // Cloud data/ID remain untouched; suppress only the unnecessary visual field.
 hideApplicationNumber(admin);
 new MutationObserver(()=>hideApplicationNumber(admin)).observe(admin,{childList:true,subtree:true});
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-p79-detail-id]')){
   queueMicrotask(()=>hideApplicationNumber(document.getElementById('p79LeaveDetailDialog')));
  }
 });
 document.documentElement.classList.toggle('p79-leave-pixel-admin',active());
 queueTableUpdate();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
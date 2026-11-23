/* Approved overtime workspace: presentation and tab navigation only.
   Preserves all existing forms, filters, data rows, cloud calls and permissions.
   New tabs delegate to original application buttons; no business-data writes. */
(function(){
'use strict';
const d=document;
const KEY='p79-overtime-approved-tabs';
const selectors={
  monthly:'.p79-ot-btn-monthly',
  history:'.p79-ot-btn-history',
  detail:'.p79-ot-btn-detail',
  report:'.p79-ot-btn-report',
  rules:'.p79-ot-btn-options',
  planned:'#p79OvertimePlannedToggle',
  reset:'.p79-ot-btn-reset'
};
const entries=[
  ['home','▤ 工時與加班總覽'],
  ['overview','▥ 加班總覽（人員統計）'],
  ['monthly','▦ 每月未休假加班'],
  ['history','▤ 申報／異動紀錄'],
  ['detail','☷ 加班明細'],
  ['report','＋ 申報加班'],
  ['rules','⚙ 加班選項管理'],
  ['planned','✓ 預排／待核對'],
  ['reset','↻ 清除篩選']
];
let root=null;
function setActive(view){
 if(!root)return;
 for(const button of root.querySelectorAll('[data-p79-overtime-tab]')){
  const active=button.dataset.p79OvertimeTab===view;
  button.classList.toggle('is-active',active);
  button.setAttribute('aria-selected',active?'true':'false');
 }
}
function original(view){return d.querySelector('#adminContentOvertime '+(selectors[view]||'#no-such-action'));}
function showOvertimePanel(){
 const panel=d.getElementById('adminContentOvertime');
 const admin=d.getElementById('viewAdmin');
 if(!panel||!admin)return false;
 // The approved work-hours overview uses p79-ref-active to hide every
 // legacy content panel with !important. The old logic only removed the
 // panel's .hidden class, so the entire navigation remained unreachable.
 if(typeof window==='undefined'||typeof window.switchAdminTab!=='function')return false;
 if(typeof window.canOpenAdminTab==='function'&&!window.canOpenAdminTab('overtime'))return false;
 admin.classList.remove('p79-ref-active');
 if(!panel.classList.contains('hidden'))return true;
 window.switchAdminTab('overtime');
 return !panel.classList.contains('hidden');
}
function openExisting(view){
 const button=original(view);
 if(button){button.click();return true;}
 return false;
}
function closeMonthly(){
 const dialog=d.getElementById('p79MonthlyRest');
 if(!dialog)return;
 // The existing close button owns cleanup and any pending async readers.
 const close=dialog.querySelector('[data-close]');
 if(close)close.click();
 else if(typeof dialog.close==='function')dialog.close();
}
function activate(view){
 if(view==='home'){
  if(!window.P79WorkhoursReferenceNav?.show?.())return;
  closeMonthly();
  setActive('home');
  return;
 }
 if(view==='overview'){
  if(!showOvertimePanel())return;
  closeMonthly();
  setActive('overview');
  const heading=root?.querySelector('.p79-ot-ux-heading');
  if(heading&&typeof heading.scrollIntoView==='function'&&d.getElementById('adminContentOvertime')?.classList.contains('hidden')===false){
   heading.scrollIntoView({block:'nearest'});
  }
  return;
 }
 if(!showOvertimePanel())return;
 const result=openExisting(view);
 if(!result)return;
 if(view==='monthly'){
  // The existing monthly-rest application remains the only authoritative
  // renderer and its permissions, reconciliations and buttons are untouched.
  queueMicrotask(()=>{decorateMonthlyDialog();if(d.getElementById('p79MonthlyRest')?.open)setActive('monthly');});
 }else{
  // Other existing dialogs are actions, not new data sources.
  setActive('overview');
 }
}
function makeButton(view,label){
 const b=d.createElement('button');
 b.type='button';b.textContent=label;b.dataset.p79OvertimeTab=view;
 b.className='p79-ot-ux-tab'+(view==='home'?' is-active':view==='report'?' is-primary':view==='planned'?' is-alert':view==='reset'?' is-secondary':'');
 b.setAttribute('role','tab');b.setAttribute('aria-selected',view==='home'?'true':'false');
 b.addEventListener('click',()=>activate(view));
 return b;
}
function decorateMonthlyDialog(){
 const modal=d.getElementById('p79MonthlyRest');
 if(!modal||modal.dataset.p79OvertimeApproved==='1')return;
 const header=modal.querySelector('header');
 if(!header)return;
 modal.dataset.p79OvertimeApproved='1';
 const tabs=d.createElement('nav');
 tabs.className='p79-ot-ux-dialog-tabs';
 tabs.setAttribute('aria-label','加班管理分頁切換');
 const back=d.createElement('button');back.type='button';back.textContent='▥ 加班總覽（人員統計）';
 back.addEventListener('click',()=>activate('overview'));
 const current=d.createElement('button');current.type='button';current.textContent='▦ 每月未休假加班';
 current.className='is-active';current.disabled=true;current.setAttribute('aria-current','page');
 tabs.append(back,current);
 header.append(tabs);
 modal.addEventListener('close',()=>setActive('overview'),{once:true});
 // Reused existing live status, no fabricated count or computed status.
 setActive('monthly');
}
function init(){
 const host=d.getElementById('adminContentOvertime');
 const workspace=host?.parentElement;
 if(!host||!workspace||d.getElementById(KEY))return;
 const header=d.createElement('div');
 header.id=KEY;header.className='p79-ot-ux';
 const title=d.createElement('section');title.className='p79-ot-ux-heading';
 title.innerHTML='<span class="p79-ot-ux-symbol" aria-hidden="true">◷</span><div><h2>加班管理</h2><p>加班申報、未休假加班及加班統計</p></div>';
 const tabs=d.createElement('nav');tabs.className='p79-ot-ux-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','加班管理分頁與功能');
 for(const [view,label] of entries)tabs.append(makeButton(view,label));
 header.append(title,tabs);
 // The landing-page navigation must NOT be a child of the hidden overtime
 // content. The work-hours homepage can initially show the stats pane.
 // Keep the original overtime cards/forms exactly where they already are.
 workspace.insertBefore(header,d.getElementById('p79WorkhoursReference')||host);
 // Mark ready only after the replacement controls exist. Original actions
 // remain available if JS fails before this point.
 host.dataset.p79UxReady='1';
 root=header;
 // The real landing page is the reference work-hours dashboard; make its
 // navigation active immediately instead of waiting for an申報加班 click.
 if(d.getElementById('viewAdmin')?.classList.contains('p79-ref-active'))setActive('home');
 window.P79OvertimeTabs={syncTo:setActive};
 const observer=new MutationObserver(()=>{
  const modal=d.getElementById('p79MonthlyRest');
  if(modal&&modal.open)decorateMonthlyDialog();
  else if(root?.querySelector('[data-p79-overtime-tab="monthly"].is-active'))setActive('overview');
 });
 observer.observe(d.body,{childList:true,subtree:false});
 // Do not scan source rows or trigger background fetches / automatic reports.
 d.addEventListener('visibilitychange',()=>{if(!d.hidden&&d.getElementById('p79MonthlyRest')?.open)decorateMonthlyDialog();});
}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();

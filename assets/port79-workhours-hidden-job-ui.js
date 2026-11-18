/* Work-hours/Overtime read-only title selector policy, 2026-11-17.
 * HR org settings remain the ONLY source of hidden job titles.
 * Never change attendance, overtime, employee, leave or exported records. */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.Port79WorkhoursHiddenJobUI=api;
})(typeof window==='undefined'?null:window,function(root){
 'use strict';
 const FILTERS={
  recordJobTitleFilter:'recordNameFilter',
  liveJobTitleFilter:'liveEmpFilter',
  overtimeJobTitleFilter:'overtimeEmployeeFilter',
  attendanceStatsJobTitle:'attendanceStatsEmployee',
  leaveBalanceJobTitleFilter:null,
  leaveJobTitleFilter:'leaveEmpFilter',
  manualLeaveJobTitle:'manualLeaveEmployee'
 };
 const ROLES=Object.keys(FILTERS);
 const last=new WeakMap();
 const subscribed=new WeakSet();
 let booted=false,lastRead=0,poll=null;
 const title=e=>String(e?.jobTitle||e?.deptDetail||'').trim();
 const val=x=>String(x??'').trim();
 const key=x=>val(x).toUpperCase();
 const policy=()=>root?.Port79JobTitleVisibility;
 const ready=()=>policy()?.ready?.()===true;
 const visible=role=>ready()&&policy().isVisible(val(role));
 const capture=el=>Array.from(el.options).map(o=>({value:val(o.value),label:o.textContent||'',disabled:!!o.disabled}));
 const signature=data=>JSON.stringify(data);
 const roster=()=>{
  try{const list=root?.p79WorkhoursRosterForVisibility?.();return Array.isArray(list)?list:[]}
  catch(ignore){return[]}
 };
 function eligiblePersonOption(opt,people){
  if(opt.value===''||opt.value==='ALL')return true;
  const id=key(opt.value);
  const person=people.find(e=>key(e.empId)===id);
  // Other select values may be names rather than IDs. Never guess a person's
  // title from a coincidentally matching name; only verified HR identities.
  return !person||visible(title(person));
 }
 function desiredOptions(role,raw,people){
  if(!ready())return [{value:'ALL',label:'人資隱藏職稱設定待核對',disabled:false}];
  return raw.filter(o=>role==='job'
   ?(o.value==='ALL'||o.value===''||visible(o.value))
   :eligiblePersonOption(o,people));
 }
 function reconcile(el,role,people){
  if(!el)return false;
  const current=capture(el),signatureNow=signature(current);
  let state=last.get(el);
  if(!state){state={raw:current,rendered:'',originalDisabled:el.disabled};last.set(el,state)}
  // An original application redraw always becomes the fresh option source;
  // a mutation made by this presentation adapter must not overwrite it.
  if(signatureNow!==state.rendered){state.raw=current;state.rendered=''}
  const desired=desiredOptions(role,state.raw,people);
  const nextSignature=signature(desired);
  const previous=el.value;
  const target=desired.some(o=>o.value===previous)?previous:(desired[0]?.value||'ALL');
  const lost=previous&&previous!=='ALL'&&previous!==target;
  if(signatureNow!==nextSignature){
   const fragment=document.createDocumentFragment();
   desired.forEach(item=>{
    const option=document.createElement('option');
    option.value=item.value;option.textContent=item.label;option.disabled=item.disabled;
    fragment.appendChild(option);
   });
   el.replaceChildren(fragment);
  }
  el.value=target;
  el.disabled=!ready()||state.originalDisabled;
  state.rendered=nextSignature;
  if(lost)el.dispatchEvent(new Event('change',{bubbles:true}));
  return lost||signatureNow!==nextSignature;
 }
 function apply(){
  if(typeof document==='undefined')return;
  const people=roster();
  for(const [jobId,nameId]of Object.entries(FILTERS)){
   const job=document.getElementById(jobId),name=nameId&&document.getElementById(nameId);
   if(job)reconcile(job,'job',people);
   if(name)reconcile(name,'person',people);
  }
  const status=document.getElementById('p79HiddenTitleReadStatus');
  if(status){
   const p=policy();
   if(ready()){
    status.textContent='已套用人資管理的隱藏職稱設定';
    status.dataset.state='ready';
   }else{
    status.textContent=p?.status?.()==='error'
     ?'無法核對人資隱藏職稱（雲端／權限），職稱選單暫停。請確認人資查看權限或重新整理。'
     :'正在核對人資隱藏職稱設定，職稱與姓名選單暫停。';
    status.dataset.state='waiting';
   }
  }
 }
 let queued=false;
 function queue(){
  if(queued)return;queued=true;
  Promise.resolve().then(()=>{queued=false;apply()});
 }
 function watch(){
  for(const [jobId,nameId] of Object.entries(FILTERS)){
   for(const id of [jobId,nameId]){
    if(!id)continue;
    const el=document.getElementById(id);
    if(!el||subscribed.has(el))continue;
    subscribed.add(el);
    new MutationObserver(queue).observe(el,{childList:true,subtree:true});
   }
  }
 }
 function updateIndicator(){
  const overtime=document.getElementById('adminContentOvertime');
  if(!overtime||document.getElementById('p79HiddenTitleReadStatus'))return;
  const note=document.createElement('p');
  note.id='p79HiddenTitleReadStatus';note.setAttribute('role','status');
  note.style.cssText='font-size:11px;color:#526d91;margin:2px 0 6px;padding:3px 8px;';
  const host=overtime.querySelector('.p79-overtime-compact-filters')||overtime;
  host.insertAdjacentElement('afterend',note);
 }
 function credentials(){
  const gas=typeof getActiveGasUrl==='function'?getActiveGasUrl():root?.GAS_URL;
  const token=typeof currentPort79SsoToken==='function'?currentPort79SsoToken():null;
  return{gasUrl:val(gas),token:val(token)};
 }
 async function load(force=false){
  const p=policy();if(!p?.load)return false;
  const creds=credentials();
  if(!creds.gasUrl||!creds.token)return false;
  const now=Date.now();
  if(!force&&now-lastRead<45000)return p.ready();
  lastRead=now;
  apply();
  try{return await p.load({...creds,force})}
  catch(error){return false}
  finally{queue()}
 }
 function init(){
  if(booted||typeof document==='undefined')return;
  booted=true;watch();updateIndicator();apply();void load();
  // SSO and roster may become available after the page first paints.
  let attempts=0;
  poll=setInterval(()=>{
   watch();queue();attempts++;
   if(ready()||attempts>=40){clearInterval(poll);poll=null}
   else void load();
  },1500);
  // Background visibility/focus checks must respect the 45-second read budget.
  root?.addEventListener?.('focus',()=>{void load()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void load()});
 }
 if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
 }
 return{ROLES,ready,visible,eligiblePersonOption,desiredOptions,apply,init,load};
});

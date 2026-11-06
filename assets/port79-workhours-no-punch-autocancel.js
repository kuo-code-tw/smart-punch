/* Auto-reconcile past cloud-saved, unworked planned overtime through the existing
 * authorized GAS attendance confirmation endpoint. Never delete from a local
 * attendance preview, never modify approved or leave-cover-linked declarations.
 * POST is idempotent and the server re-reads cross-day official punches under lock. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.P79WorkhoursNoPunchAutoCancel=api;})(typeof window==='undefined'?null:window,function(){
'use strict';
const text=v=>String(v??'').trim(),id=v=>text(v).toUpperCase(),day=v=>text(v).replaceAll('/','-').slice(0,10);
const dateOk=d=>/^20\d\d-(0[1-9]|1[0-2])-[0-3]\d$/.test(d);
const reportApproved=r=>['approvedAt','approvedBy','reviewedAt','reviewedBy','approvalStatus'].some(k=>r?.[k]!=null&&text(r[k])!=='')||/^(已核准|已審核|approved|reviewed)$/i.test(text(r?.status));
function candidates(rows,{token='',today='',stateFor=()=>null,isVerified=()=>false,canManage=false,reconcile=null}={}){
 if(!token||!canManage||!reconcile?.originalCategory||!reconcile?.approved||!dateOk(today))return [];
 const result=new Map();
 for(const row of rows||[]){
  const date=day(row?.rosterDate||row?.dateKey),emp=id(row?.empId),month=date.slice(0,7),r=row?.overtimeReport;
  if(!dateOk(date)||date>=today||!emp||!r||r.planned!==true||!text(r.id)||
   row.reportVerified!==true||r.attendanceState!=='rest'||row.clockIn||row.clockOut)continue;
  const state=stateFor(month);
  if(!isVerified(month)||!state||state.token!==token||state.pending||state.restEvidencePending||
   state.restEvidenceError||state.attendanceEvidence?.complete!==true||
   state.attendanceEvidence.days?.[emp+'|'+date]?.state!=='rest')continue;
  const rosterRow=(state.rows||[]).find(x=>id(x.empId)===emp);
  const schedule=rosterRow?.schedule||{},meta=schedule.__meta?.[date]||{},official=meta.overtimeReport;
  if(!official||text(official.id)!==text(r.id)||official.planned!==true||
   meta.overtimeExcluded===true||reportApproved(official)||reconcile.approved(meta)||
   meta.forEmpId||meta.coverAssignmentId||official.leaveId||official.leaveHandoffId||
   (meta.overtimeReports||[]).some(x=>x&&text(x.id)&&text(x.id)!==text(official.id))||
   !reconcile.originalCategory(schedule,date,meta))continue;
  if((state.covers||[]).some(c=>date>=day(c.startDate)&&date<=day(c.endDate)&&
    (id(c.leaveEmpId)===emp||(c.workerIds||[]).some(w=>id(w)===emp))))continue;
  if((state.leaveRecords||[]).some(l=>['已核准','已核準'].includes(text(l.status))&&
     id(l.empId||l.employeeId)===emp&&date>=day(l.startDate||l.startTime)&&
     date<=day(l.endDate||l.endTime||l.startDate||l.startTime)))continue;
  const record=result.get(date)||{date,month,reportIds:new Map()};
  record.reportIds.set(emp,text(official.id));result.set(date,record);
 }
 return [...result.values()].sort((a,b)=>b.date.localeCompare(a.date)).map(r=>({
  date:r.date,month:r.month,targets:[...r.reportIds].map(([empId,reportId])=>({empId,reportId})),
  signature:r.date+'|'+[...r.reportIds].map(([e,r])=>e+':'+r).sort().join(',')
 }));
}
function create(options){
 const fetcher=options.fetch,now=options.now||(()=>new Date()),attempted=new Set(),queue=new Map();
 let running=false,lastError='',lastMessage='',account='';
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(now());
 function snapshot(){return{running,queued:queue.size,lastError,lastMessage};}
 function offer(rows){
  const token=options.token();
  if(token!==account){account=token;attempted.clear();queue.clear();lastError='';}
  if(!token||!options.canManage()||options.isEditing())return 0;
  const list=candidates(rows,{token,today:today(),stateFor:options.stateFor,
    isVerified:options.isVerified,canManage:true,reconcile:options.reconcile});
  for(const candidate of list.slice(0,31)){
   const key=token+'|'+candidate.signature;
   if(!attempted.has(key)&&!queue.has(key)&&queue.size<31)queue.set(key,candidate);
  }
  if(queue.size&&!running)void flush();
  return queue.size;
 }
 async function read(month,token){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
  try{
   const url=options.gasUrl()+'?action=getScheduleDataSecure&gcToken='+encodeURIComponent(token)+'&month='+encodeURIComponent(month)+'&_='+Date.now();
   const response=await fetcher(url,{cache:'no-store',signal:ctl.signal});
   const data=await response.json();
   if(response.ok===false||data?.ok!==true||!Array.isArray(data.schedules)||!data.revision)
    throw Error(data?.error||'正式班表讀取失敗');
   return data;
  }finally{clearTimeout(timer);}
 }
 async function confirm(date,token,revision){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),60000);
  try{
   const response=await fetcher(options.gasUrl(),{method:'POST',
    headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify({action:'confirmAttendanceDayAndReconcile',gcToken:token,date,
      expectedRevision:revision,requestId:'ATTCONF-'+(options.requestId?.()||'AUTO-'+Date.now()+'-'+Math.random().toString(36).slice(2,14))}),
    signal:ctl.signal});
   const data=await response.json();
   if(response.ok===false||data?.ok!==true||data.plannedRestAttendanceVersion!==1||
    data.date!==date||!Array.isArray(data.schedules))throw Error(data?.error||'正式考勤確認失敗');
   return data;
  }finally{clearTimeout(timer);}
 }
 async function flush(){
  if(running)return;running=true;
  try{
   while(queue.size){
    const [key,item]=queue.entries().next().value;queue.delete(key);
    if(attempted.has(key))continue;
    const token=options.token();
    if(token!==account||!options.canManage()||options.isEditing())break;
    const oldState=options.stateFor(item.month);
    if(oldState?.token!==token||oldState.attendanceEvidence?.complete!==true)continue;
    // A retry requires new page data or a fresh session. Do not spam a backend
    // that rejected the action or manufacture success from a timeout.
    attempted.add(key);
    try{
     const fresh=await read(item.month,token);
     if(options.token()!==token||options.isEditing())continue;
     if(fresh.plannedRestAttendanceVersion!==1||fresh.plannedRestAttendanceCanConfirm!==true)
      throw Error('雲端尚未啟用正式考勤自動取消預排，需先確認部署及管理權限');
     const matching=item.targets.filter(t=>{
      const meta=fresh.schedules.find(r=>id(r.empId)===t.empId)?.schedule?.__meta?.[item.date];
      return meta?.overtimeReport?.planned===true&&text(meta.overtimeReport.id)===t.reportId;
     });
     if(!matching.length)continue; // already revoked/replaced by a different action
     const receipt=await confirm(item.date,token,fresh.revision);
     if(options.token()!==token)continue;
     if(Number(receipt.cancelled)>0){
      const readback=await read(item.month,token);
      const confirmed=matching.some(t=>{
       const meta=readback.schedules.find(r=>id(r.empId)===t.empId)?.schedule?.__meta?.[item.date];
       return meta?.plannedRestResolution?.state==='cancelled'&&
        text(meta.plannedRestResolution.reportId)===t.reportId&&
        text(meta.overtimeReport?.id)!==t.reportId;
      });
      if(!confirmed)throw Error('雲端回傳取消結果，但尚未讀到該預排已移除；不更新畫面');
      await options.onCommitted(item,receipt,readback,token);
      lastMessage=item.date+' 已依正式考勤取消無出勤預排 '+receipt.cancelled+' 筆';
      lastError='';
     }else{
      lastMessage=item.date+' 已核對，但部分報單受已核准／請假代班連動保護，需要人工處理';
     }
    }catch(error){
     lastError=item.date+' 自動取消未完成：'+String(error?.message||error);
     options.onFailure?.(lastError);
    }
   }
  }finally{running=false;options.onStatus?.(snapshot());}
 }
 return {offer,flush,status:snapshot};
}
return{candidates,create};
});

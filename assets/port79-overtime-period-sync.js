/* Reconcile an existing report ID after a complete, unambiguous attendance pair.
 * A single clock-in is DISPLAY ONLY and must never reach this writer. */
(function(g){
 'use strict';
 const attempted=new Map();
 let serial=Promise.resolve();
 const id=x=>String(x||'').trim().toUpperCase();
 const minutes=x=>{const m=String(x??'').match(/^(\d{1,2})(?::(\d{2}))?$/);return m?Number(m[1])*60+Number(m[2]||0):NaN;};
 const sameNumber=(a,b)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<0.00001;
 function plan(input){
  const r=input?.report,v=input?.review;
  if(!r?.id||!v?.confirmed||v.state!=='completed'||!v.mismatch||!v.suggested)return null;
  if(!['休','例','國'].includes(String(r.category))||r.attendanceState==='rest'||r.attendanceReview===true)return null;
  if(r.leaveId||input?.pairingIssue||!input?.inId||!input?.outId)return null;
  // Existing approvals cannot be guaranteed to survive the legacy save API.
  // Never touch one without an explicit backend field-level amendment route.
  if(['approvalStatus','approvedBy','approvedAt','reviewedBy','reviewedAt'].some(k=>r[k]!=null&&r[k]!==''))return null;
  if(!sameNumber(r.declaredHours,v.suggested.declaredHours)||!sameNumber(r.convertedHours,v.suggested.convertedHours))return null;
  const row=(input.rules||[]).find(row=>row?.[0]===r.category&&String(row[1])===String(v.suggested.code)&&
   minutes(row[6])===minutes(v.suggested.overtimeStart)&&minutes(row[7])===minutes(v.suggested.overtimeEnd)&&
   sameNumber(row[2],r.declaredHours)&&sameNumber(row[3],r.convertedHours)&&
   (!r.typeName||!row[9]||String(r.typeName)===String(row[9])));
  if(!row)return null;
  const rule=g.P79Overtime?.report?.(row);
  if(!rule||!sameNumber(rule.declaredHours,r.declaredHours)||!sameNumber(rule.convertedHours,r.convertedHours))return null;
  const date=String(input.date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!id(input.empId))return null;
  return {empId:id(input.empId),date,report:r,rule,inId:String(input.inId),outId:String(input.outId)};
 }
 function endpoint(base){
  const url=String(typeof base==='function'?base():base||'').trim();
  if(!/^https:\/\//.test(url))throw Error('缺少安全的加班雲端服務網址');
  return url;
 }
 async function jsonFetch(url,options,description){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),45000);
  try{
   const res=await fetch(url,{...options,signal:ctl.signal});
   const result=await res.json();
   if(!res.ok||result?.ok!==true)throw Error(description+'：'+(result?.error||'雲端尚未確認'));
   return result;
  }finally{clearTimeout(timer);}
 }
 async function context(base,token,info){
  const query='?action=getOvertimeReportContext&month='+encodeURIComponent(info.date.slice(0,7))+
    '&empId='+encodeURIComponent(info.empId)+'&date='+encodeURIComponent(info.date)+
    '&gcToken='+encodeURIComponent(token)+'&token='+encodeURIComponent(token)+'&_='+Date.now();
  return jsonFetch(base+query,{cache:'no-store'},'加班時段核對');
 }
 function latest(data,info){
  const schedule=(data.schedules||[]).find(x=>id(x.empId)===info.empId)?.schedule||{};
  const meta=schedule.__meta?.[info.date]||{};
  return {report:meta.overtimeReport||null,meta};
 }
 function reportMatches(r,info){
  return r?.id===info.report.id&&r?.category===info.report.category&&r?.code===info.report.code;
 }
 function unchangedMetadata(before,after){
  const fields=['createdAt','createdBy','approvedAt','approvedBy','approvalStatus','reviewedAt','reviewedBy','leaveId'];
  return fields.every(k=>before[k]===undefined||JSON.stringify(before[k])===JSON.stringify(after?.[k]));
 }
 async function write(input,info){
  const base=endpoint(input.url),token=String(input.token||'').trim();
  if(!token)throw Error('缺少已驗證的管理員登入資訊');
  const cloud=await context(base,token,info);
  if(cloud.revision==null)throw Error('雲端未回傳版次，為避免覆蓋其他管理員修改，未更新');
  const current=latest(cloud,info);
  if(current.report?.id===info.report.id&&current.report.code===info.rule.code&&current.report.category===info.rule.category){
   return {ok:true,already:true,report:current.report};
  }
  if(!reportMatches(current.report,info))throw Error('原申報已被其他人修改，停止更新');
  if((current.meta.overtimeRevocations||[]).some(x=>x.confirmed===true&&x.reportId===info.report.id))throw Error('原申報已撤銷');
  if(!sameNumber(current.report.declaredHours,info.rule.declaredHours)||
     !sameNumber(current.report.convertedHours,info.rule.convertedHours))throw Error('原申報時數已變更，停止更新');
  const payload={action:'saveOvertimeReportDirect',token,gcToken:token,
    id:info.report.id,replaceReportId:info.report.id,empId:info.empId,date:info.date,
    category:info.rule.category,code:info.rule.code,typeName:info.report.typeName||info.rule.typeName||'',
    note:String(current.report.note??current.meta.note??''),forEmpId:current.meta.forEmpId||'',
    leaveHandoffId:'',planned:false,attendanceInId:info.inId,attendanceOutId:info.outId,
    expectedRevision:cloud.revision};
  const saved=await jsonFetch(base,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
    body:JSON.stringify(payload)},'原申報時段修正');
  if(saved.directOvertimeSaved!==true||saved.id!==info.report.id)throw Error('雲端未確認保留原申報 ID');
  const reread=await context(base,token,info);
  const actual=latest(reread,info);
  if(actual.report?.id!==info.report.id||actual.report.category!==info.rule.category||
     actual.report.code!==info.rule.code||!sameNumber(actual.report.declaredHours,info.report.declaredHours)||
     !sameNumber(actual.report.convertedHours,info.report.convertedHours)||
     !unchangedMetadata(current.report,actual.report))throw Error('雲端讀回與原申報身分、時數或審核資料不一致，請人工核對');
  return {ok:true,report:actual.report};
 }
 function sync(input){
  const info=plan(input);
  if(!info)return Promise.resolve({ok:false,skipped:true});
  const token=String(input.token||'').trim();
  if(!token)return Promise.resolve({ok:false,skipped:true});
  const key=token+'|'+info.empId+'|'+info.date+'|'+info.report.id+'|'+info.rule.code;
  const existing=attempted.get(key),now=Date.now();
  if(existing&&(existing.state==='running'||existing.until>now))return existing.promise||Promise.resolve({ok:existing.state==='done',skipped:true});
  const current={state:'running',until:Infinity,promise:null};
  attempted.set(key,current);
  const run=async()=>{
   try{
    const result=await write(input,info);
    current.state='done';current.until=Date.now()+3600000;
    if(typeof input.onSynced==='function')input.onSynced(result);
    try{g.localStorage?.setItem('p79_schedule_overtime_changed_v1',JSON.stringify({
       month:info.date.slice(0,7),empId:info.empId,date:info.date,at:Date.now()}));}catch(_){}
    try{g.dispatchEvent?.(new CustomEvent('p79:schedule-overtime-changed',{detail:{month:info.date.slice(0,7)}}));}catch(_){}
    return result;
   }catch(error){
    current.state='failed';current.until=Date.now()+120000;
    g.console?.warn?.('原申報時段同步尚未完成：'+error.message);
    if(typeof input.onError==='function')input.onError(error);
    return {ok:false,error:String(error.message||error)};
   }
  };
  const promise=serial.then(run,run);
  serial=promise.then(()=>{},()=>{});
  current.promise=promise;
  return promise;
 }
 g.P79OvertimePeriodSync={plan,sync};
})(typeof window==='undefined'?globalThis:window);

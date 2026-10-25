(function(g){
'use strict';
const id=x=>String(x||'').trim().toUpperCase();
let opening=false;
function context(){
 return {config:()=>sysConfig,gasUrl:()=>getActiveGasUrl(),token:()=>getAttendanceEmployeeMasterToken(),employees:()=>getAdminVisibleEmployees(),canReport:()=>p79CanReportOvertime(),canEditRules:()=>p79CanManageOvertime(),persistConfig:()=>saveConfig(),saveReport:save};
}
async function request(action,payload=null){
 const token=getAttendanceEmployeeMasterToken();if(!token||!p79CanReportOvertime())throw Error('沒有加班申報權限，請重新登入核對');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 try{
  const url=getActiveGasUrl();
  const response=await fetch(url,payload?{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,token,gcToken:token,...payload}),signal:controller.signal}:{cache:'no-store',signal:controller.signal});
  const result=await response.json();
  if(!response.ok||result.ok!==true)throw Error(result.error||'雲端核對未完成');
  if(getAttendanceEmployeeMasterToken()!==token)throw Error('登入狀態已變更，請重新開啟申報');
  return result;
 }finally{clearTimeout(timer)}
}
async function readContext(empId,date){
 // Each request has its own parameters; overlapping dialog operations cannot share mutable state.
 return requestContext({month:date.slice(0,7),empId,date});
}
async function requestContext(params){
 const token=getAttendanceEmployeeMasterToken();if(!token||!p79CanReportOvertime())throw Error('沒有加班申報權限');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 try{
  const response=await fetch(getActiveGasUrl()+'?'+new URLSearchParams({action:'getOvertimeReportContext',token,gcToken:token,...params,_:String(Date.now())}),{cache:'no-store',signal:controller.signal});
  const data=await response.json();if(!response.ok||data.ok!==true)throw Error(data.error||'出勤與班表核對失敗');
  if(token!==getAttendanceEmployeeMasterToken())throw Error('登入狀態已變更');return data;
 }finally{clearTimeout(timer)}
}
function ruleRow(r){return [r.category,r.code,r.declaredHours,r.convertedHours??'',r.normalStart||'',r.normalEnd||'',r.overtimeStart,r.overtimeEnd,r.position||'full',r.typeName||''];}
async function save(draft){
 if(!p79CanReportOvertime()||!getAdminVisibleEmployees().some(e=>id(e.empId)===id(draft.empId)))throw Error('沒有此人員的加班申報權限');
 const cloud=await readContext(draft.empId,draft.date);if(cloud.revision==null)throw Error('班表版本尚未確認，未送出申報');
 const roster=cloud.schedules?.find(r=>id(r.empId)===id(draft.empId))?.schedule||{};
 const previous=roster.__meta?.[draft.date]?.overtimeReport;
 if(previous?.id===draft.id&&previous.category===draft.rule.category&&previous.code===draft.rule.code)return {ok:true,directOvertimeSaved:true,id:draft.id,report:previous};
 const pairs=buildDailyAttendanceRows((cloud.records||[]).filter(r=>id(r.empId)===id(draft.empId))).filter(r=>r.clockIn&&r.clockOut).map(row=>({row,start:getAttendanceTimestamp(row.clockIn),end:getAttendanceTimestamp(row.clockOut)})).filter(p=>P79Overtime.overtimeMinutes(p.start,p.end,draft.date,{overtimeReport:draft.rule})>0);
 if(pairs.length!==1)throw Error(pairs.length?'有多組出勤配對，請先核對考勤':'尚無包含所選時段的完整出勤，請先核對考勤');
 const pair=pairs[0];if(pair.row.pairingIssue||pair.end-pair.start>18*3600000)throw Error('出勤配對待核對，未送出申報');
 const issue=P79Overtime.ruleAttendanceIssue(pair.start,pair.end,draft.date,ruleRow(draft.rule),roster);if(issue)throw Error(issue);
 const result=await request('saveOvertimeReportDirect',{id:draft.id,empId:draft.empId,date:draft.date,category:draft.rule.category,code:draft.rule.code,typeName:draft.rule.typeName,forEmpId:draft.forEmpId||'',leaveHandoffId:draft.leaveHandoffId||'',note:draft.note||'',expectedRevision:cloud.revision,replaceReportId:previous?.id||'',planned:false,attendanceInId:pair.row.clockIn.id||'',attendanceOutId:pair.row.clockOut.id||''});
 if(result.directOvertimeSaved!==true||result.id!==draft.id||!result.report)throw Error('加班儲存尚未確認，請重新讀取核對');
 const prior=p79AttendanceOvertimeMonths.get(draft.date.slice(0,7)),merged=new Map((prior?.token===getAttendanceEmployeeMasterToken()?prior.rows||[]:[]).map(r=>[id(r.empId),r]));
 for(const row of cloud.schedules||[])merged.set(id(row.empId),row);
 const rows=JSON.parse(JSON.stringify([...merged.values()])),savedRow=rows.find(r=>id(r.empId)===id(draft.empId));
 if(savedRow){savedRow.schedule=savedRow.schedule||{};savedRow.schedule.__meta=savedRow.schedule.__meta||{};savedRow.schedule.__meta[draft.date]={...(savedRow.schedule.__meta[draft.date]||{}),overtimeReport:result.report,forEmpId:draft.forEmpId||''};}
 p79AttendanceOvertimeMonths.set(draft.date.slice(0,7),{token:getAttendanceEmployeeMasterToken(),at:Date.now(),ready:true,pending:false,rows,people:cloud.employees||[],covers:cloud.leaveCoverAssignments||[]});
 try{localStorage.setItem('p79_schedule_overtime_changed_v1',JSON.stringify({month:draft.date.slice(0,7),empId:draft.empId,date:draft.date,at:Date.now()}));}catch(_){}
 const table=document.getElementById('adminRecordsTableContainer'),scrollTop=table?.scrollTop,scrollLeft=table?.scrollLeft;
 renderAdminRecordsTable();if(table){table.scrollTop=scrollTop;table.scrollLeft=scrollLeft;}return result;
}
async function open({row,employee,date}){
 if(opening)return;opening=true;
 try{
  if(!p79CanReportOvertime())throw Error('沒有加班申報權限');
  g.p79OvertimeContext=context();
  const loading=P79Overtime.showReportLoading();
  let cloud,options;
  try{[cloud,options]=await Promise.all([readContext(employee.empId,date),P79Overtime.loadRules()]);}
  finally{loading.close?.();loading.remove?.();}
  Object.assign(sysConfig,options.config);
  const roster=cloud.schedules?.find(r=>id(r.empId)===id(employee.empId))?.schedule||{},saved=roster.__meta?.[date]?.overtimeReport;
  const start=getAttendanceTimestamp(row.clockIn),end=getAttendanceTimestamp(row.clockOut),parts=P79SpecialOvertime.forShift(start,end,row.clockIn.timeStr),kinds=parts.flatMap(p=>p.kinds);
  const inferred=saved?null:P79Overtime.suggestRule(start,end,date,roster,options.rows,kinds);
  await P79Overtime.openReport({empId:String(employee.empId),date,roster,savedReport:!!saved,attendance:{start,end},code:saved?.code||inferred?.[1]||'',category:saved?.category||inferred?.[0]||(parts.length?'國':'延'),preferredType:saved?.typeName||(inferred?P79Overtime.ruleType(inferred):''),requirePeriodSelection:!saved&&!inferred,periodHint:'依排定班別起算，下班分鐘超過45分才進位。尚無相符時段，請新增或核對出勤時段。'});
 }catch(error){showToast('申報未開啟：'+String(error.message||error),'warning');}
 finally{opening=false;}
}

/**
 * Attendance daily date-strip cloud reporting indicators.
 * "Printed" is intentionally NOT inferred from a declaration or file export:
 * a print/dialog action is not an accounting receipt.
 */
function auditChanged(report,meta){
 const history=Array.isArray(meta.overtimeAmendments)?meta.overtimeAmendments:
  Array.isArray(meta.overtimeRevisions)?meta.overtimeRevisions:
  Array.isArray(report?.amendments)?report.amendments:[];
 const verified=history.some(a=>a?.confirmed===true&&String(a.at||'').trim()&&String(a.actor||'').trim());
 const modified=String(report?.modifiedAt||report?.updatedAt||'').trim();
 const created=String(report?.reportedAt||report?.createdAt||'').trim();
 return verified||!!String(report?.replacesReportId||'').trim()||!!(modified&&created&&modified!==created);
}
function p79MailCanonical(x){
 if(Array.isArray(x))return '['+x.map(p79MailCanonical).join(',')+']';
 if(x&&typeof x==='object')return '{'+Object.keys(x).filter(k=>x[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+p79MailCanonical(x[k])).join(',')+'}';
 return JSON.stringify(x===undefined?null:x);
}
const p79AttendanceMailMonths=new Map();
function p79LoadAttendanceMailMonth(month){
 if(!/^\d{4}-\d{2}$/.test(month))return;
 if(typeof p79CanManageOvertime!=='function'||!p79CanManageOvertime())return;
 const token=typeof getAttendanceEmployeeMasterToken==='function'?getAttendanceEmployeeMasterToken():'';
 if(!token)return;
 const prior=p79AttendanceMailMonths.get(month);
 if(prior?.token===token&&(prior.pending||Date.now()-prior.at<60000))return;
 const state={token,at:Date.now(),pending:true,receipts:[],ready:false};
 p79AttendanceMailMonths.set(month,state);
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
 fetch(getActiveGasUrl(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
   body:JSON.stringify({action:'getOvertimeMailOptions',token,gcToken:token,month}),signal:ctl.signal,cache:'no-store'})
 .then(r=>r.json()).then(data=>{
  if(data?.ok!==true||data.overtimeMailVersion!==1||!Array.isArray(data.receipts))return;
  if(p79AttendanceMailMonths.get(month)!==state||getAttendanceEmployeeMasterToken()!==token)return;
  state.receipts=data.receipts.filter(r=>r.status==='sent'||r.status==='sending');
  state.ready=true;
 }).catch(()=>{}).finally(()=>{
  clearTimeout(timer);state.pending=false;
  if(p79AttendanceMailMonths.get(month)!==state)return;
  try{
   if(typeof recordsDatePageKeys!=='undefined'&&Array.isArray(recordsDatePageKeys))
    decorateOvertimeDateStrip(recordsDatePageKeys,typeof recordsSelectedDateKey==='undefined'?'':recordsSelectedDateKey);
  }catch(_){}
 });
}
function p79MailState(report,empId,date,receipts){
 const entries=(receipts||[]).filter(r=>id(r.empId)===id(empId)&&r.date===date);
 const same=r=>{
  if(r.reportId!==String(report.id)||!r.reportJson)return false;
  try{return p79MailCanonical(JSON.parse(r.reportJson))===p79MailCanonical(report);}catch(_){return false;}
 };
 const accepted=entries.filter(r=>r.status==='sent');
 const current=accepted.filter(same);
 if(current.length)return {kind:'mailed',detail:'已寄出目前申報版本：'+current.map(r=>
   (r.recipientName||r.recipientId||'會計')+' '+(r.sentAt||'')).join('／')+'（郵件服務已接受；不代表已閱讀）'};
 const pending=entries.some(r=>r.status==='sending'&&same(r));
 if(pending)return {kind:'pending',detail:'寄送結果尚未確認，請勿重複寄送'};
 if(accepted.length)return {kind:'outdated',detail:'之前版本已寄送會計，現在申報內容不同，須重新寄送；舊信仍保留'};
 return null;
}
function overtimeDayIndicator(date,monthState,mailReceipts=null){
 if(monthState?.ready!==true)return null;
 const people=new Map((monthState.people||[]).map(p=>[id(p.empId),p.name||p.empId]));
 const entries=[],seen=new Set();
 for(const item of monthState.rows||[]){
  const empId=id(item.empId),name=people.get(empId)||String(item.name||empId);
  const meta=item.schedule?.__meta?.[date];
  if(!meta)continue;
  for(const audit of meta.overtimeRevocations||[]){
   const report=audit?.report;
   if(audit?.confirmed!==true||!String(audit.reportId||'').trim()||
      String(audit.reportId)!==String(report?.id)||id(audit.empId)!==empId||
      audit.date!==date||!audit.at||!audit.actor)continue;
   const key=empId+'|'+date+'|'+report.id+'|revoked';
   if(seen.has(key))continue;seen.add(key);
   entries.push({kind:'revoked',name,code:String(report.code||''),hours:report.declaredHours||'',
     detail:'已取消；原因：'+(audit.reason||'未填')+'；時間：'+audit.at});
  }
  const reports=[meta.overtimeReport,...(Array.isArray(meta.overtimeReports)?meta.overtimeReports:[])].filter(Boolean);
  for(const report of reports){
   if(!report?.id||meta.overtimeExcluded===true||
      (meta.overtimeRevocations||[]).some(a=>a?.confirmed===true&&String(a.reportId)===String(report.id)))continue;
   const mail=p79MailState(report,empId,date,mailReceipts);
   const kind=mail?.kind|| (auditChanged(report,meta)?'amended':'reported');
   const key=empId+'|'+date+'|'+report.id+'|'+kind;
   if(seen.has(key))continue;seen.add(key);
   entries.push({kind,name,code:String(report.code||''),hours:report.declaredHours||'',
     detail:mail?.detail||(kind==='amended'?'申報已修改，舊版可能已交會計；請重新核對':'已申報，尚無可核實的寄送紀錄')});
  }
 }
 if(!entries.length)return null;
 const counts={reported:0,mailed:0,amended:0,outdated:0,pending:0,revoked:0};
 for(const row of entries)counts[row.kind]++;
 const kind=counts.revoked?'revoked':counts.outdated?'outdated':counts.pending?'pending':counts.amended?'amended':counts.mailed?'mailed':'reported';
 const summary=['已申報 '+counts.reported,'已修改 '+counts.amended,'已取消 '+counts.revoked].join('｜')+
  (counts.mailed||counts.outdated||counts.pending?'｜已寄 '+counts.mailed+'｜舊版待重寄 '+counts.outdated+'｜寄送待核 '+counts.pending:'');
 const names={revoked:'已取消',outdated:'舊版已寄／須重寄',pending:'寄送待核對',amended:'已修改',mailed:'已寄送會計',reported:'已申報'};
 const lines=entries.slice(0,24).map(row=>row.name+'：'+names[row.kind]+
  (row.code?'｜'+row.code:'')+(row.hours?'｜'+row.hours+'小時':'')+'｜'+row.detail);
 if(entries.length>24)lines.push('其餘 '+(entries.length-24)+' 筆請開啟申報明細核對');
 return {kind,count:entries.length,title:date+'\n'+summary+'\n'+lines.join('\n')+
  '\n注意：此畫面不會把已申報或已匯出直接認定為已列印／已交會計。'};
}
function decorateOvertimeDateStrip(keys,selectedDate=''){
 const host=g.document?.getElementById?.('p79AttendanceDateStrip');
 if(!host||!Array.isArray(keys))return;
 let months;
 try{months=typeof p79AttendanceOvertimeMonths!=='undefined'?p79AttendanceOvertimeMonths:null;}catch(_){return;}
 if(!months)return;
 const buttons=[...host.querySelectorAll('button[onclick^="goToRecordsPage("]')];
 for(let i=0;i<buttons.length;i++){
  const date=String(keys[i]||'').replaceAll('/','-'),state=months.get(date.slice(0,7));
  const month=date.slice(0,7);
  if(state?.ready)p79LoadAttendanceMailMonth(month);
  const mail=p79AttendanceMailMonths.get(month);
  const info=overtimeDayIndicator(date,state,mail?.ready&&mail?.token===getAttendanceEmployeeMasterToken()?mail.receipts:null),button=buttons[i];
  button.removeAttribute('data-p79-overtime-audit');
  button.style.removeProperty('background-color');
  button.style.removeProperty('color');
  button.style.removeProperty('border-color');
  button.style.removeProperty('box-shadow');
  button.removeAttribute('title');
  if(!info)continue;
  const palette=info.kind==='revoked'?['#fee2e2','#991b1b','#f87171']:
   info.kind==='outdated'?['#ffedd5','#9a3412','#fb923c']:
   info.kind==='pending'?['#fae8ff','#86198f','#d946ef']:
   info.kind==='amended'?['#fef3c7','#92400e','#f59e0b']:
   info.kind==='mailed'?['#dbeafe','#1e40af','#60a5fa']:
   ['#dcfce7','#166534','#4ade80'];
  button.style.setProperty('background-color',palette[0],'important');
  button.style.setProperty('color',palette[1],'important');
  button.style.setProperty('border-color',palette[2],'important');
  if(date===selectedDate)button.style.setProperty('box-shadow','inset 0 0 0 2px '+palette[1],'important');
  button.dataset.p79OvertimeAudit=info.kind;
  button.title=info.title;
  button.setAttribute('aria-label',date+'｜'+info.title.replaceAll('\n','；'));
 }
 if(!host.querySelector('#p79OvertimeDateLegend')){
  const legend=g.document.createElement('span');
  legend.id='p79OvertimeDateLegend';
  legend.style.cssText='flex-shrink:0;white-space:nowrap;margin-left:6px;font-size:11px;color:#64748b';
  legend.textContent='綠：已申報｜藍：已寄會計｜黃：已修改｜橘：舊版須重寄｜紅：已取消';
  host.appendChild(legend);
 }
}
function installOvertimeDateIndicators(){
 const original=g.renderRecordsPagination;
 if(typeof original!=='function'||original.p79OvertimeDecorated)return;
 const wrapped=function(...args){
  const result=original.apply(this,args);
  decorateOvertimeDateStrip(args[0],args[1]);
  return result;
 };
 wrapped.p79OvertimeDecorated=true;
 g.renderRecordsPagination=wrapped;
 try{
  if(typeof recordsDatePageKeys!=='undefined'&&Array.isArray(recordsDatePageKeys))
   decorateOvertimeDateStrip(recordsDatePageKeys,typeof recordsSelectedDateKey==='undefined'?'':recordsSelectedDateKey);
 }catch(_){}
}
if(g.document?.readyState==='loading')g.document.addEventListener('DOMContentLoaded',installOvertimeDateIndicators);
else installOvertimeDateIndicators();
g.addEventListener?.('load',installOvertimeDateIndicators);
g.addEventListener?.('storage',event=>{
 if(event.key==='p79_overtime_mail_updated_v1'){
  try{const change=JSON.parse(event.newValue||'{}');if(change.month)p79AttendanceMailMonths.delete(change.month);}catch(_){p79AttendanceMailMonths.clear();}
  p79QueueAttendanceOvertimeRepaint();
 }
});
g.addEventListener?.('focus',()=>{
 const now=Date.now();
 for(const [month,state] of p79AttendanceMailMonths)if(now-state.at>60000)p79AttendanceMailMonths.delete(month);
 try{if(typeof recordsDatePageKeys!=='undefined'&&Array.isArray(recordsDatePageKeys))decorateOvertimeDateStrip(recordsDatePageKeys,typeof recordsSelectedDateKey==='undefined'?'':recordsSelectedDateKey);}catch(_){}
});
g.P79AttendanceOvertimeDayStatus={auditChanged,overtimeDayIndicator,decorateOvertimeDateStrip,p79MailState,p79MailCanonical,p79LoadAttendanceMailMonth};

g.P79AttendanceOvertime={open,save};
})(window);

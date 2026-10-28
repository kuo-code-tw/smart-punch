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
  await P79Overtime.openReport({empId:String(employee.empId),date,roster,savedReport:!!saved,attendance:{start,end},code:saved?.code||inferred?.[1]||'',category:saved?.category||inferred?.[0]||(parts.length?'國':'延'),preferredType:saved?.typeName||(inferred?P79Overtime.ruleType(inferred):''),requirePeriodSelection:!saved&&!inferred,periodHint:'依排定班別起算，下班分鐘達45分（含）即進位。尚無相符時段，請新增或核對出勤時段。'});
 }catch(error){showToast('申報未開啟：'+String(error.message||error),'warning');}
 finally{opening=false;}
}

/** Attendance date-strip indicators based on saved cloud overtime reports. */
function auditChanged(report,meta){
 const history=Array.isArray(meta.overtimeAmendments)?meta.overtimeAmendments:
  Array.isArray(meta.overtimeRevisions)?meta.overtimeRevisions:
  Array.isArray(report?.amendments)?report.amendments:[];
 const verified=history.some(a=>a?.confirmed===true&&String(a.at||'').trim()&&String(a.actor||'').trim());
 const modified=String(report?.modifiedAt||report?.updatedAt||'').trim();
 const created=String(report?.reportedAt||report?.createdAt||'').trim();
 return verified||!!String(report?.replacesReportId||'').trim()||!!(modified&&created&&modified!==created);
}
function overtimeDayIndicator(date,monthState){
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
   const kind=auditChanged(report,meta)?'amended':'reported';
   const key=empId+'|'+date+'|'+report.id+'|'+kind;
   if(seen.has(key))continue;seen.add(key);
   entries.push({kind,name,code:String(report.code||''),hours:report.declaredHours||'',
     detail:kind==='amended'?'申報已修改，請重新核對':'加班申報已登錄'});
  }
 }
 if(!entries.length)return null;
 const counts={reported:0,amended:0,revoked:0};
 for(const row of entries)counts[row.kind]++;
 const kind=counts.revoked?'revoked':counts.amended?'amended':'reported';
 const summary=['已申報 '+counts.reported,'已修改 '+counts.amended,'已取消 '+counts.revoked].join('｜');
 const names={revoked:'已取消',amended:'已修改',reported:'已申報'};
 const lines=entries.slice(0,24).map(row=>row.name+'：'+names[row.kind]+
  (row.code?'｜'+row.code:'')+(row.hours?'｜'+row.hours+'小時':'')+'｜'+row.detail);
 if(entries.length>24)lines.push('其餘 '+(entries.length-24)+' 筆請開啟申報明細核對');
 return {kind,count:entries.length,title:date+'\n'+summary+'\n'+lines.join('\n')};
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
  const info=overtimeDayIndicator(date,state),button=buttons[i];
  button.removeAttribute('data-p79-overtime-audit');
  button.style.removeProperty('background-color');
  button.style.removeProperty('color');
  button.style.removeProperty('border-color');
  button.style.removeProperty('box-shadow');
  button.removeAttribute('title');
  // 白色只代表「正式雲端月份已讀取、當日沒有申報或撤銷紀錄」。
  // 尚未讀到完整月份時不可誤當作無申報；查核標記不參與顏色判斷。
  const ready=state?.ready===true;
  const palette=!ready?['#f1f5f9','#64748b','#94a3b8']:
   !info?['#ffffff','#334155','#cbd5e1']:
   info.kind==='revoked'?['#fee2e2','#991b1b','#f87171']:
   info.kind==='amended'?['#fef3c7','#92400e','#f59e0b']:
   ['#dcfce7','#166534','#4ade80'];
  button.style.setProperty('background-color',palette[0],'important');
  button.style.setProperty('color',palette[1],'important');
  button.style.setProperty('border-color',palette[2],'important');
  if(date===selectedDate)button.style.setProperty('box-shadow','inset 0 0 0 2px #4f46e5','important');
  button.dataset.p79OvertimeAudit=info?.kind||(ready?'none':'unknown');
  button.title=info?.title||(date+(ready?'｜沒有正式加班申報':'｜正式申報資料尚未確認'));
  button.setAttribute('aria-label',date+'｜'+button.title.replaceAll('\n','；'));
 }
 if(!host.querySelector('#p79OvertimeDateLegend')){
  const legend=g.document.createElement('span');
  legend.id='p79OvertimeDateLegend';
  legend.style.cssText='flex-shrink:0;white-space:nowrap;margin-left:6px;font-size:11px;color:#64748b';
  legend.textContent='白：無申報｜綠：已申報｜黃：已修改｜紅：已取消｜灰：未確認';
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
g.addEventListener?.('focus',()=>{
 try{if(typeof recordsDatePageKeys!=='undefined'&&Array.isArray(recordsDatePageKeys))decorateOvertimeDateStrip(recordsDatePageKeys,typeof recordsSelectedDateKey==='undefined'?'':recordsSelectedDateKey);}catch(_){}
});
g.P79AttendanceOvertimeDayStatus={auditChanged,overtimeDayIndicator,decorateOvertimeDateStrip};

g.P79AttendanceOvertime={open,save};
})(window);

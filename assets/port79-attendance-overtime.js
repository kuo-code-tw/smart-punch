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
  await P79Overtime.openReport({empId:String(employee.empId),date,attendance:{start,end},code:saved?.code||inferred?.[1]||'',category:saved?.category||inferred?.[0]||(parts.length?'國':'延'),preferredType:saved?.typeName||(inferred?P79Overtime.ruleType(inferred):''),requirePeriodSelection:!saved&&!inferred,periodHint:'依排定班別起算，下班分鐘超過45分才進位。尚無相符時段，請新增或核對出勤時段。'});
 }catch(error){showToast('申報未開啟：'+String(error.message||error),'warning');}
 finally{opening=false;}
}
g.P79AttendanceOvertime={open,save};
})(window);

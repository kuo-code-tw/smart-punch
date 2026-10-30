/* Pure plan: no writes, no permission assumptions, no ordinary-workday conversion. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.P79PlannedRestReconciliation=api;})(typeof window==='undefined'?null:window,function(){
'use strict';
const text=v=>String(v??'').trim(),id=v=>text(v).toUpperCase(),rest=v=>['例','休','國','颱'].includes(text(v))?text(v):'';
function originalCategory(schedule,date,meta){
 const explicit=rest(meta.plannedRestOriginalCategory);if(explicit)return explicit;
 const savedOriginal=meta.reportOriginalShift??meta.overtimeOriginalShift;
 const original=rest(savedOriginal);
 // A report's category alone cannot prove an originally scheduled holiday.
 return original?(rest(meta.restCategory)||original):savedOriginal!=null?'':rest(schedule[date]);
}
function approved(report){return ['approvalStatus','approvedBy','approvedAt','reviewedBy','reviewedAt'].some(k=>report[k]!=null&&text(report[k])!=='')||/^(已核准|已審核|approved|reviewed)$/i.test(text(report.status));}
function plan({rows=[],date,today,evidence,confirmed=false,actor='',now=''}={}){
 const next=JSON.parse(JSON.stringify(rows)),results=[];
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw Error('考勤確認日期無效');
 for(const row of next){
  const schedule=row.schedule||{},meta=schedule.__meta?.[date];if(!meta)continue;
  const revoked=new Set((meta.overtimeRevocations||[]).filter(a=>a.confirmed===true).map(a=>text(a.reportId)));
  const all=[meta.overtimeReport,...(Array.isArray(meta.overtimeReports)?meta.overtimeReports:[])].filter(r=>r&&text(r.id)&&!revoked.has(text(r.id)));
  const reports=[...new Map(all.map(r=>[text(r.id),r])).values()];
  if(!reports.some(r=>r.planned===true))continue;
  const result={empId:id(row.empId),date,reportId:text(reports[0]?.id),state:'pending',category:originalCategory(schedule,date,meta)};results.push(result);
  if(date>=today){result.state='future';continue;}
  if(!result.category){result.state='ordinary-workday';continue;}
  if(!confirmed||evidence?.complete!==true){result.state='unconfirmed';continue;}
  if(reports.length!==1||all.some(r=>JSON.stringify(r)!==JSON.stringify(reports[0]))||meta.forEmpId||reports[0].leaveId||reports[0].leaveHandoffId){result.state='linked-review';continue;}
  const report=reports[0];if(approved(report)||approved(meta)){result.state='approved-review';continue;}
  const proof=evidence.days?.[result.empId+'|'+date];
  if(proof?.state==='worked'){result.state='worked';result.actualMinutes=evidence.actualWorkedMinutes?.[result.empId+'|'+date]??null;if(meta.plannedRestAttendanceReview?.state!=='worked'||meta.plannedRestAttendanceReview.actualMinutes!==result.actualMinutes)meta.plannedRestAttendanceReview={state:'worked',actualMinutes:result.actualMinutes,date,actor,at:now};if(Number.isFinite(result.actualMinutes))report.actualMinutes=result.actualMinutes;if(report.attendanceReview==='打卡待核')delete report.attendanceReview;continue;}
  if(proof?.state==='missing'){result.state='punch-review';if(meta.plannedRestAttendanceReview?.state!=='punch-review')meta.plannedRestAttendanceReview={state:'punch-review',date,actor,at:now};report.attendanceReview='打卡待核';continue;}
  if(proof?.state!=='rest'||!Number.isFinite(proof.shiftEnd)||Date.parse(now)<proof.shiftEnd){result.state='unconfirmed';continue;}
  result.state='cancelled';
  meta.plannedRestResolution={version:1,state:'cancelled',reason:'正式考勤確認完成，整班無上下班紀錄',date,reportId:report.id,actor,at:now,originalCategory:result.category,report:JSON.parse(JSON.stringify(report))};
  // Keep the entire report in the resolution and the durable server audit journal.
  delete meta.overtimeReport;
  if(Array.isArray(meta.overtimeReports))meta.overtimeReports=meta.overtimeReports.filter(r=>text(r.id)!==text(report.id));
  for(const k of ['overtime','overtimeType','overtimeAssignedShift','overtimeStart','overtimeEnd','restQuotaOvertime'])delete meta[k];
  if(meta.type==='overtime')delete meta.type;
  schedule[date]=result.category;
  if(meta.manualRosterShift)meta.manualRosterShift=result.category;
  if(result.category==='颱'){delete meta.restCategory;delete meta.restAllocationSource;delete meta.restSourceDate;}
  else {meta.restCategory=result.category;meta.restAllocationSource='manual';meta.restQuotaOvertime=false;}
 }
 return{rows:next,results,cancelled:results.filter(r=>r.state==='cancelled').length};
}
return{plan,originalCategory,approved};
});

/* Called inside the existing authenticated, scope-checked overtime delete route.
 * The caller holds ScriptLock and the schedule edit lock. */
function p79OvertimeRevocationAudit_(rows,empId,date,reportId,session){
  const row=rows.find(function(r){return normalizeEmpId_(r.empId)===empId;}),meta=row&&row.schedule&&row.schedule.__meta&&row.schedule.__meta[date]||{};
  if(!String(reportId||'').trim())throw Error('缺少原申報識別碼，未撤銷');
  const previous=(meta.overtimeRevocations||[]).find(function(a){return a.reportId===reportId&&a.reason==='休假超額'&&a.confirmed===true;});
  if(previous)return {audit:previous,duplicate:true};
  const report=meta.overtimeReport;
  if(!report||report.id!==reportId)throw Error('原申報已被修改或撤銷，請重新讀取');
  if(!['例','休','國'].includes(report.category)||meta.forEmpId||report.leaveId)throw Error('此申報不是可獨立撤銷的例／休／國加班');
  return {duplicate:false,audit:{version:1,confirmed:true,reportId:report.id,empId:empId,date:date,reason:'休假超額',actor:String(session.name||session.empId||''),actorEmpId:String(session.empId||''),at:new Date().toISOString(),note:String(meta.note||''),originalShift:meta.reportOriginalShift??meta.overtimeOriginalShift??row.schedule[date]??'',assignedShift:String(meta.overtimeAssignedShift||row.schedule[date]||''),report:JSON.parse(JSON.stringify(report))}};
}
function p79VerifyOvertimeRevocation_(ss,month,audit){
  const rows=readScheduleMonthOnly_(ss,month)||[],row=rows.find(function(r){return normalizeEmpId_(r.empId)===audit.empId;}),meta=row&&row.schedule&&row.schedule.__meta&&row.schedule.__meta[audit.date]||{};
  const saved=(meta.overtimeRevocations||[]).find(function(a){return a.reportId===audit.reportId;});
  if(meta.overtimeReport&&meta.overtimeReport.id===audit.reportId||JSON.stringify(saved)!==JSON.stringify(audit))throw Error('撤銷讀回核對失敗，未確認完成');
  return saved;
}
function p79AssertOvertimeReportNotRevoked_(rows,reportId){
  if((rows||[]).some(function(row){return Object.values(row.schedule&&row.schedule.__meta||{}).some(function(m){return (m.overtimeRevocations||[]).some(function(a){return a.confirmed===true&&a.reportId===reportId;});});}))throw Error('此申報已撤銷，不能重送舊申報；請重新建立申報');
}

/* Repair only an orphaned timed rest shift with an unambiguous, confirmed
 * historical monthly-rest preplan revocation. Never replay the delete route. */
function p79RestoreRevokedPreplanPlan_(rows,empId,date,request){
 const row=rows.find(r=>normalizeEmpId_(r.empId)===empId),schedule=row?.schedule||{},meta=schedule.__meta?.[date]||{};
 const shift=String(schedule[date]||'').trim(),archives=Array.isArray(meta.overtimeRevocations)?meta.overtimeRevocations:[];
 const last=archives[archives.length-1],report=last?.report,original=String(last?.originalShift||'').trim();
 const timed=s=>/^[例休國]\s*\d/.test(String(s||''));
 const rawReports=[meta.overtimeReport,...(Array.isArray(meta.overtimeReports)?meta.overtimeReports:[])].filter(r=>r?.id);
 const active=rawReports.some(r=>!archives.some(a=>a?.confirmed===true&&String(a.reportId)===String(r.id)));
 if(!last||last.confirmed!==true||last.reason!=='休假超額'||String(last.reportId)!==String(request.expectedReportId)||String(last.reportId)!==String(report?.id)||normalizeEmpId_(last.empId)!==empId||last.date!==date||
 report?.planned!==true||!['例','休','國'].includes(report.category)||!/每月未休假加班/.test(String(report.note||'')+' '+String(last.note||''))||/^[選颱]/.test(String(report.code||''))||
 active||meta.forEmpId||meta.coverAssignmentId||meta.type==='substitute'||report.forEmpId||report.leaveId||!original||original==='待排班'||timed(original)||
 !timed(shift)||shift===original||shift!==String(last.assignedShift||report.code||'').trim()||
 shift!==String(request.expectedCurrentShift||'')||original!==String(request.expectedOriginalShift||'')||
 (meta.reportOriginalShift!=null&&String(meta.reportOriginalShift).trim()!==original)||
 (meta.overtimeOriginalShift!=null&&String(meta.overtimeOriginalShift).trim()!==original))
 throw Error('撤銷紀錄或原班別不符、仍有有效申報或代班，未還原');
 const next=JSON.parse(JSON.stringify(rows)),target=next.find(r=>normalizeEmpId_(r.empId)===empId);
 target.schedule[date]=original;
 const kept=target.schedule.__meta[date];
 ['overtime','overtimeType','overtimeAssignedShift','overtimeOriginalShift','reportOriginalShift','restQuotaOvertime','restCategory','restAllocationSource','overtimeStart','overtimeEnd'].forEach(k=>delete kept[k]);
 kept.overtimeExcluded=true;
 return {rows:next,original,archive:last};
}

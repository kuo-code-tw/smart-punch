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
  return {duplicate:false,audit:{version:1,confirmed:true,reportId:report.id,empId:empId,date:date,reason:'休假超額',actor:String(session.name||session.empId||''),actorEmpId:String(session.empId||''),at:new Date().toISOString(),note:String(meta.note||''),originalShift:meta.reportOriginalShift??meta.overtimeOriginalShift??row.schedule[date]??'',report:JSON.parse(JSON.stringify(report))}};
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

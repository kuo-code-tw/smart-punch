function p79DeleteOvertimeAssignment_(ss,data){
  const token=data.gcToken||data.token||'';
  const session=gcRequireSystemPermission_(ss,token,'schedule','manage');
  gcRequireSystemPermission_(ss,token,'workhours','manage');
  const empId=normalizeEmpId_(data.empId),date=p79DateOnly_(data.date),month=date.slice(0,7);
  if(!empId||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('缺少有效的加班人員或日期');
  const revision=[getScheduleSyncRevision_(),getLeaveSyncRevision_(),getEmployeeAuthRevision_(),month].join(':');
  if(!data.expectedRevision||data.expectedRevision!==revision)throw new Error('班表或代班資料已更新，請重新整理後再刪除');
  const rows=readScheduleMonthOnly_(ss,month)||[];
  if(!rows.some(function(row){return normalizeEmpId_(row.empId)===empId;}))throw new Error('找不到該人員的正式班表');
  const sheet=ss.getSheetByName(P79_LEAVE_COVER_SHEET);
  const covers=sheet&&sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,P79_LEAVE_COVER_HEADERS.length).getValues():[];
  if(p79ReadLeaveCoverAssignments_(ss).some(function(c){return date>=c.startDate&&date<=c.endDate&&(normalizeEmpId_(c.leaveEmpId)===empId||(c.workerIds||[]).some(function(id){return normalizeEmpId_(id)===empId;}));}))throw Error('此日期仍連結請假與代班，請先到請假管理完成連動刪除，再修改排班或刪除加班');
 const plan=p79OvertimeDeletionPlan_(rows,covers,empId,date);
  const master=p79GetEmployeeMasterCached_(ss);
  plan.affected.forEach(function(id){const employee=master.find(function(e){return normalizeEmpId_(e.empId)===id;});if(!employee||!p79CanReadScopedEmployee_(session,'schedule',employee)||!p79CanReadScopedEmployee_(session,'workhours',employee))throw new Error('對應代班人員不在此帳號可管理範圍');});
  if(data.reason==='restore_revoked_preplan'){
    const leaveSheet=ss.getSheetByName(SHEET_LEAVE);
    if(leaveSheet&&leaveSheet.getLastRow()>1&&readLeaveRecords_(leaveSheet).some(l=>['已核准','已核準'].includes(l.status)&&normalizeEmpId_(l.empId)===empId&&date>=p79DateOnly_(l.startDate||l.startTime)&&date<=p79DateOnly_(l.endDate||l.endTime||l.startDate||l.startTime)))throw Error('仍有核准請假，未還原班別');
    const restore=p79RestoreRevokedPreplanPlan_(rows,empId,date,data);
    try{
      syncSchedules_(ss,{month:month,schedules:restore.rows,expectedEmployeeCount:restore.rows.length});
      touchScheduleSyncRevision_();
      const fresh=readScheduleMonthOnly_(ss,month)||[],target=fresh.find(r=>normalizeEmpId_(r.empId)===empId);
      const meta=target?.schedule?.__meta?.[date]||{};
      if(target?.schedule?.[date]!==restore.original||JSON.stringify((meta.overtimeRevocations||[]).find(a=>a.reportId===restore.archive.reportId))!==JSON.stringify(restore.archive))throw Error('原班別與撤銷紀錄讀回核對失敗');
    }catch(error){
      try{syncSchedules_(ss,{month:month,schedules:rows,expectedEmployeeCount:rows.length});touchScheduleSyncRevision_();}catch(rollback){throw Error('還原未完成且回復未確認：'+error.message);}
      throw error;
    }
    return {ok:true,revocationVerified:true,restorationVerified:true,empId,date,originalShift:restore.original};
  }
  const revocation=data.reason==='rest_quota_excess'?p79OvertimeRevocationAudit_(rows,empId,date,data.expectedReportId,session):null;
  if(revocation){
    if(revocation.duplicate)return {ok:true,date:date,empId:empId,affectedEmployeeIds:[empId],revocationVerified:true,revocation:revocation.audit,duplicate:true};
    const target=plan.rows.find(function(r){return normalizeEmpId_(r.empId)===empId;});
    const meta=target.schedule.__meta[date];meta.overtimeRevocations=(meta.overtimeRevocations||[]).concat([revocation.audit]);
    delete meta.restQuotaOvertime;delete meta.restCategory;delete meta.restAllocationSource;
  }
  try{
    syncSchedules_(ss,{month:month,schedules:plan.rows,expectedEmployeeCount:plan.rows.length});
    if(sheet)p79WriteLeaveCoverRows_(sheet,plan.covers);
    touchLeaveSyncRevision_();touchScheduleSyncRevision_();
    if(revocation){
      p79VerifyOvertimeRevocation_(ss,month,revocation.audit);
      const expected=String(revocation.audit.originalShift||'').trim();
      if(expected&&revocation.audit.assignedShift!==expected){
        const persisted=(readScheduleMonthOnly_(ss,month)||[]).find(r=>normalizeEmpId_(r.empId)===empId);
        if(String(persisted?.schedule?.[date]||'').trim()!==expected)throw Error('撤銷後原班別讀回核對失敗');
      }
    }
  }catch(error){
    try{syncSchedules_(ss,{month:month,schedules:rows,expectedEmployeeCount:rows.length});if(sheet)p79WriteLeaveCoverRows_(sheet,covers);}catch(rollback){throw new Error('刪除未完成且回復未確認，請重新載入核對：'+error.message);}
    throw error;
  }
  return {ok:true,date:date,empId:empId,affectedEmployeeIds:plan.affected,revocationVerified:!!revocation,revocation:revocation?revocation.audit:null,message:'當日加班及對應代班安排已取消，可重新申報'};
}


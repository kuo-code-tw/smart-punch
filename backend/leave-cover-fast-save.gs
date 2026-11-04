// Replace the matching function in the verified production source; do not append duplicates.
function p79SaveLeaveCoverAssignment_(ss,data){
  if(Object.prototype.hasOwnProperty.call(data,"dailyAssignments"))return p79SaveDailyLeaveCoverAssignments_(ss,data);
  const session=gcRequireSystemPermission_(ss,data.token||data.gcToken||'','leave','manage');
  const leaveId=String(data.leaveId||'').trim();
  const mode=String(data.mode||'').trim();
  const ids=Array.isArray(data.workerIds)?data.workerIds.map(normalizeEmpId_):[];
  const count=mode==='two'?2:(mode==='rest'||mode==='one')?1:0;
  if(!leaveId||!count||ids.length!==count||new Set(ids).size!==count||ids.some(function(x){return !x;}))throw new Error('代班人數或安排模式不正確');
  const leaves=readLeaveRecords_(getSheetFast_(ss,SHEET_LEAVE,LEAVE_HEADERS));
  const leave=leaves.find(function(x){return String(x.id)===leaveId;});
  if(!leave||String(leave.status)!=='已核准')throw new Error('請假尚未核准或請假紀錄不存在');
  const start=p79DateOnly_(leave.startTime),end=p79DateOnly_(leave.endTime);
  if(!start||!end||start>end)throw new Error('請假日期無效');
  const master=p79GetEmployeeMasterCached_(ss);
  const target=master.find(function(x){return normalizeEmpId_(x.empId)===normalizeEmpId_(leave.empId);});
  if(!target)throw new Error('找不到請假人員的員工主檔');
  const role=String(target.jobTitle||target.role||'').trim();
  const assigned=ids.map(function(id){return master.find(function(x){return normalizeEmpId_(x.empId)===id;});});
  if(assigned.some(function(x){return !x;}))throw new Error('代班人員不在人資主檔');
  if(ids.includes(normalizeEmpId_(leave.empId)))throw new Error('請假人員不能代班自己');
  const department=normalizeText_(target.dept);
  if(!department||assigned.some(function(x){return normalizeText_(x.dept)!==department;}))throw new Error('只能安排與請假人員相同部門的人員代班');
  if(assigned.some(function(x){return !isEmployeeActive_(x);}))throw new Error('代班人員已離職或不在職');
  const dates=[];for(let day=new Date(start+'T12:00:00Z'),last=new Date(end+'T12:00:00Z');day<=last;day.setUTCDate(day.getUTCDate()+1)){
    dates.push(Utilities.formatDate(day,'GMT','yyyy-MM-dd'));if(dates.length>62)throw new Error('一次代班安排最多 62 天');
  }
  leaves.filter(function(x){return x.status==='已核准';}).forEach(function(x){
    const a=p79DateOnly_(x.startTime),b=p79DateOnly_(x.endTime);
    if(ids.includes(normalizeEmpId_(x.empId))&&a&&b&&dates.some(function(d){return a<=d&&d<=b;}))throw new Error('代班人員 '+(x.name||x.empId)+' 當日已有已核准請假');
  });
  // Saving one cover must not clean unrelated historical records under the write lock.
  const previous=p79ReadLeaveCoverAssignments_(ss).filter(function(x){return x.leaveId!==leaveId;});
  previous.forEach(function(x){
    if(x.workerIds.some(function(id){return ids.includes(normalizeEmpId_(id));})&&dates.some(function(d){return x.startDate<=d&&d<=x.endDate;}))throw new Error('代班人員已安排其他請假代班，不能重複排班');
  });
  if(mode==='rest'){
    const months=Array.from(new Set(dates.map(function(d){return d.slice(0,7);})))
    months.forEach(function(month){
      const schedules=readScheduleMonthOnly_(ss,month)||[];
      const row=schedules.find(function(x){return normalizeEmpId_(x.empId)===ids[0];});
      if(!row)throw new Error('找不到 '+ids[0]+' 在 '+month+' 的排班，無法確認是否排休');
      dates.filter(function(d){return d.slice(0,7)===month;}).forEach(function(d){
        const day=d.slice(-2),shift=String((row.schedule||{})[d]||(row.schedule||{})[day]||(row.schedule||{})[Number(day)]||'').trim();
        if(!['休','例','例休','排休','休假'].includes(shift))throw new Error(ids[0]+' 在 '+d+' 並非排休（班別：'+(shift||'未排')+'）');
      });
    });
  }
  const sheet=ensureSheet_(ss,P79_LEAVE_COVER_SHEET,P79_LEAVE_COVER_HEADERS);
  const values=[leaveId,normalizeEmpId_(leave.empId),start,end,mode,JSON.stringify(ids),String(session.name||session.empId||''),new Date()];
  const existing=sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,P79_LEAVE_COVER_HEADERS.length).getValues():[];
  const matches=[];existing.forEach(function(row,index){if(String(row[0])===leaveId)matches.push(index);});
  const same=function(row){
    let workers;try{workers=JSON.parse(String(row[5]||'[]'));}catch(ignore){return false;}
    return String(row[0])===leaveId&&normalizeEmpId_(row[1])===normalizeEmpId_(leave.empId)&&
      p79DateOnly_(row[2])===start&&p79DateOnly_(row[3])===end&&String(row[4])===mode&&
      Array.isArray(workers)&&JSON.stringify(workers.map(normalizeEmpId_))===JSON.stringify(ids);
  };
  const duplicate=matches.length===1&&same(existing[matches[0]]);
  let writeRow=0;
  if(!duplicate){
    if(!matches.length){sheet.appendRow(values);writeRow=sheet.getLastRow();}
    else if(matches.length===1){writeRow=matches[0]+2;sheet.getRange(writeRow,1,1,P79_LEAVE_COVER_HEADERS.length).setValues([values]);}
    else{
      const kept=existing.filter(function(row){return String(row[0])!==leaveId;});
      p79WriteLeaveCoverRows_(sheet,kept.concat([values]));writeRow=kept.length+2;
    }
    if(!same(sheet.getRange(writeRow,1,1,P79_LEAVE_COVER_HEADERS.length).getValues()[0]))throw new Error('代班寫入未通過雲端讀回確認，請保留請假單識別碼重新核對');
    touchLeaveSyncRevision_();touchScheduleSyncRevision_();
  }
  // Attendance is fetched when the user actually opens a filing, outside this write.
  return {ok:true,leaveId:leaveId,mode:mode,workerIds:ids,dates:dates.length,duplicate:duplicate,
    handoffContext:null,handoffDeferred:true,backendSavePipeline:'20261104-leave-overtime-fast-v1',
    message:'請假代班已保存並同步到排班管理'};
}

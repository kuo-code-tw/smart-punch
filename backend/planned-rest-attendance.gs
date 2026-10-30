/* V67 adapter. Route only under the existing POST ScriptLock. Shared pure modules
 * (V6 engine, RestAttendance, PlannedRestReconciliation) are bundled by the build. */
function p79ConfirmAttendanceDayAndReconcile_(ss,data){
 const token=data.gcToken||data.token||'';
 const session=gcRequireSystemPermission_(ss,token,'attendance','manage');
 gcRequireSystemPermission_(ss,token,'schedule','manage');
 gcRequireSystemPermission_(ss,token,'workhours','manage');
 const date=p79DateOnly_(data.date),month=date.slice(0,7),today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>today)throw Error('未來日期不可確認考勤或取消預排');
 if(scheduleReadEditLock_())throw Error('班表正在編輯，請待儲存完成再確認考勤');
 const revision=[getScheduleSyncRevision_(),getLeaveSyncRevision_(),getEmployeeAuthRevision_(),month].join(':');
 if(!data.expectedRevision||data.expectedRevision!==revision)throw Error('班表或人資資料已變更，請重新查核');
 const people=(p79GetEmployeeMasterCached_(ss)||[]).filter(function(e){return ['attendance','schedule','workhours'].every(function(system){return p79CanReadScopedEmployee_(session,system,e);});});
 const allowed=new Set(people.map(function(e){return normalizeEmpId_(e.empId);}));
 if(!allowed.size)throw Error('沒有可確認考勤的人員範圍');
 const attendanceStartRevision=String(getSyncRevision_()),attendanceStartDelta=String(getAttendanceDeltaSeq_()),employeeStartRevision=String(getEmployeeAuthRevision_());
 const rows=readScheduleMonthOnly_(ss,month)||[],scoped=rows.filter(function(r){return allowed.has(normalizeEmpId_(r.empId));});
 const months=new Set([month]),base=Date.parse(date+'T00:00:00Z');
 [-1,1].forEach(function(n){months.add(new Date(base+n*86400000).toISOString().slice(0,7));});
 const raw=[],deleted=getDeletedRecordIds_(ss);
 months.forEach(function(m){
  // Fresh official sources, including pending accepted punches. Never infer absence
  // from an empty client cache, a failed network response or just the main sheet.
  raw.push.apply(raw,readAttendanceMonthRecords_(ss,m,false));
  raw.push.apply(raw,p79ReadAttendanceMainDirect_(ss,m).records||[]);
 });
 raw.push.apply(raw,p79ListPendingPunchRecords_());
 const records=raw.filter(function(r){return r&&!r.deleted&&!r.isDeleted&&!r.deletedAt&&!r.tombstone&&!deleted[normalizeId_(r.id)];});
 const byAtt=new Map();people.forEach(function(e){const key=String(e.attNo||e.attendanceNo||'').trim().replace(/^0+/,'');if(key){const a=byAtt.get(key)||[];a.push(normalizeEmpId_(e.empId));byAtt.set(key,a);}});
 const normalized=[];
 records.forEach(function(r){
  const claimed=normalizeEmpId_(r.empId),att=String(r.attNo||r.attendanceNo||'').trim().replace(/^0+/,''),matches=byAtt.get(att)||[];
  if(!allowed.has(claimed)&&!matches.some(function(e){return allowed.has(e);}))return;
  if(matches.length>1||claimed&&matches.length===1&&claimed!==matches[0])throw Error('考勤工號與考勤號不一致，停止自動取消');
  const empId=claimed||matches[0];if(!allowed.has(empId))return;
  const time=P79_PLANNED_REST_SHARED_.P79AttendanceV6.normalizeTime(r.timeStr||r['出勤時間']);
  if(!/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(time))throw Error('存在不完整打卡時間，停止自動取消');
  normalized.push(Object.assign({},r,{empId:empId,timeStr:time}));
 });
 const timestamp=function(r){return Date.parse(r.timeStr.replaceAll('/','-').replace(' ','T')+'+08:00');};
 const pairs=P79_PLANNED_REST_SHARED_.P79AttendanceV6.buildShifts(normalized);
 const sessions=pairs.map(function(r){return{empId:r.empId,start:r.clockIn?timestamp(r.clockIn):null,end:r.clockOut&&!r.timePrecisionIssue?timestamp(r.clockOut):null,time:timestamp(r.clockIn||r.clockOut||r.records[0])};});
 const evidence=P79_PLANNED_REST_SHARED_.P79RestAttendance.build({complete:true,month:month,now:Date.now(),schedules:scoped,sessions:sessions});
 evidence.actualWorkedMinutes={};
 pairs.forEach(function(r,i){if(r.clockIn&&r.clockOut&&!r.timePrecisionIssue){const key=normalizeEmpId_(r.empId)+'|'+evidence.sessionDates[i];const row=scoped.find(function(x){return normalizeEmpId_(x.empId)===normalizeEmpId_(r.empId);}),period=P79_PLANNED_REST_SHARED_.P79RestAttendance.period(evidence.sessionDates[i],{__meta:{[evidence.sessionDates[i]]:{overtimeReport:row.schedule.__meta?.[evidence.sessionDates[i]]?.overtimeReport}}});evidence.actualWorkedMinutes[key]=(evidence.actualWorkedMinutes[key]||0)+Math.max(0,Math.min(timestamp(r.clockOut),period.end)-Math.max(timestamp(r.clockIn),period.start))/60000;}});
 const plan=P79_PLANNED_REST_SHARED_.P79PlannedRestReconciliation.plan({rows:scoped,date:date,today:today,evidence:evidence,confirmed:true,actor:normalizeEmpId_(session.empId),now:new Date().toISOString()});
 // Preserve linked approved leave and covers; the generic schedule writer checks
 // these independently too, without using a leave-deletion permit.
 const cover=p79ReadLeaveCoverAssignments_(ss)||[];
 const leaveSheet=ss.getSheetByName(SHEET_LEAVE),leaves=leaveSheet&&leaveSheet.getLastRow()>1?readLeaveRecords_(leaveSheet):[];
 const protectedIds=new Set();
 leaves.filter(function(l){return l.status==='已核准'&&date>=p79DateOnly_(l.startDate||l.startTime)&&date<=p79DateOnly_(l.endDate||l.endTime||l.startDate||l.startTime);}).forEach(function(l){protectedIds.add(normalizeEmpId_(l.empId));});
 cover.filter(function(c){return date>=c.startDate&&date<=c.endDate;}).forEach(function(c){[c.leaveEmpId].concat(c.workerIds||[]).forEach(function(e){protectedIds.add(normalizeEmpId_(e));});});
 plan.results.forEach(function(r){if(protectedIds.has(r.empId)&&['cancelled','worked','punch-review'].includes(r.state)){const original=scoped.find(function(row){return normalizeEmpId_(row.empId)===r.empId;});plan.rows[plan.rows.findIndex(function(row){return normalizeEmpId_(row.empId)===r.empId;})]=original;r.state='linked-review';}});
 if(String(getSyncRevision_())!==attendanceStartRevision||String(getAttendanceDeltaSeq_())!==attendanceStartDelta||String(getEmployeeAuthRevision_())!==employeeStartRevision)throw Error('考勤或人資在確認期間已更新，請重新查核；未取消預排');
 const changed=plan.results.filter(function(r){return r.state==='cancelled';});
 const scope=people.map(function(e){return normalizeEmpId_(e.empId);}).sort();
 const record={version:1,date:date,actor:normalizeEmpId_(session.empId),at:new Date().toISOString(),scope:scope,attendanceRevision:String(getSyncRevision_()),attendanceDeltaSeq:String(getAttendanceDeltaSeq_()),results:plan.results};
 const sheet=ensureSheet_(ss,'P79_考勤確認_'+month,['確認編號','日期','操作者','時間','階段','確認內容']);
 const requestId=String(data.requestId||'');if(!/^ATTCONF-[A-Za-z0-9-]{10,100}$/.test(requestId))throw Error('缺少有效考勤確認編號');
 const auditJson=JSON.stringify(record);if(auditJson.length>45000)throw Error('考勤確認範圍過大，未截斷資料');
 sheet.appendRow([requestId,date,record.actor,record.at,'PREPARED',auditJson]);
 const auditRow=sheet.getLastRow();SpreadsheetApp.flush();
 if(String(sheet.getRange(auditRow,6).getValue())!==auditJson)throw Error('考勤確認紀錄未通過讀回，未取消預排');
 if(JSON.stringify(plan.rows)!==JSON.stringify(scoped)){
  const byId=new Map(plan.rows.map(function(r){return [normalizeEmpId_(r.empId),r];}));
  P79_OT_HISTORY_ACTOR_={empId:session.empId,name:session.name};
  syncSchedules_(ss,{month:month,schedules:rows.map(function(r){return byId.get(normalizeEmpId_(r.empId))||r;}),expectedEmployeeCount:rows.length});
  touchScheduleSyncRevision_();
 }
 const latest=readScheduleMonthOnly_(ss,month)||[];
 changed.forEach(function(r){const row=latest.find(function(x){return normalizeEmpId_(x.empId)===r.empId;}),m=row&&row.schedule&&row.schedule.__meta&&row.schedule.__meta[date];if(!row||row.schedule[date]!==r.category||m.overtimeReport&&m.overtimeReport.id===r.reportId||m.plannedRestResolution?.reportId!==r.reportId)throw Error('取消預排與原休假未通過讀回確認');});
 sheet.getRange(auditRow,5).setValue('COMMITTED');SpreadsheetApp.flush();
 if(sheet.getRange(auditRow,5).getValue()!=='COMMITTED')throw Error('考勤確認尚未完成');
 return{ok:true,plannedRestAttendanceVersion:1,attendanceConfirmed:date<today,date:date,cancelled:changed.length,punchReview:plan.results.filter(function(r){return r.state==='punch-review';}).length,approvedReview:plan.results.filter(function(r){return r.state==='approved-review';}).length,results:plan.results,schedules:latest.filter(function(r){return allowed.has(normalizeEmpId_(r.empId));}),employees:people.map(function(e){return{empId:e.empId,attNo:e.attNo,name:e.name,jobTitle:e.jobTitle,dept:e.dept};}),leaveCoverAssignments:cover.filter(function(c){return allowed.has(normalizeEmpId_(c.leaveEmpId))&&(c.workerIds||[]).every(function(e){return allowed.has(normalizeEmpId_(e));});})};
}

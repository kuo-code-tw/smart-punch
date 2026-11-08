/** V108 replacement functions for the existing authenticated PORT79 GAS. Preserve all other functions and deployment URL. */
var P79_OT_ADJACENT_V108_={};
function p79DirectMinute_(value){
 const match=String(value??'').match(/^(\d{2})(?::(\d{2}))?$/);
 if(!match)throw Error('無效時段');const hour=Number(match[1]),minute=Number(match[2]||0);
 if(hour>24||minute>59||hour===24&&minute!==0)throw Error('無效時段');return hour*60+minute;
}

function p79DirectInterval_(date,start,end){
 const base=Date.parse(date+'T00:00:00+08:00'),a=p79DirectMinute_(start),b=p79DirectMinute_(end);
 const duration=(b-a+1440)%1440;if(!Number.isFinite(base)||!duration)throw Error('無效日期或時段');
 return [base+a*60000,base+(a+duration)*60000];
}

function p79DirectRuleEnvelope_(date,row){
 const overtime=p79DirectInterval_(date,row[6],row[7]);
 if(row[0]!=='延')return {start:overtime[0],end:overtime[1],overtime};
 const normal=p79DirectInterval_(date,row[4],row[5]);
 if(normal[1]-normal[0]!==480*60000)throw Error('正常班必須為8小時');
 if(row[8]==='after'){
  const offset=normal[1]-overtime[0];if(offset%(86400000)!==0)throw Error('正常班與加班沒有相接');
  return {start:normal[0],end:overtime[1]+offset,overtime:overtime.map(t=>t+offset)};
 }
 if(row[8]==='before'){
  const offset=normal[0]-overtime[1];if(offset%86400000!==0)throw Error('正常班與加班沒有相接');
  return {start:overtime[0]+offset,end:normal[1],overtime:overtime.map(t=>t+offset)};
 }
 throw Error('延長加班須選班前或班後');
}

function p79DirectResolvedRule_(row){
  var r=row.slice(),value=r[3];
  if(value===null||value===undefined||String(value).trim()===''){
    r[3]='';
    var time=function(x){return String(x==null?'':x).trim().replace(/:00$/,'').padStart(2,'0');};
    if(r[0]==='延'&&r[8]==='after'&&Number(r[2])===4&&
       time(r[4])==='08'&&time(r[5])==='16'&&time(r[6])==='16'&&time(r[7])==='20'&&
       /^(?:代|延)?(?:08-20|16-20)$/.test(String(r[1]||'').trim()))r[3]=6.02;
  }
  return r;
}

function p79DirectConversionReceipt_(saved,id,rule){
  var r=p79DirectResolvedRule_(rule),empty=function(v){return v===null||v===undefined||String(v).trim()==='';};
  if(!saved||saved.id!==id||saved.category!==r[0]||saved.code!==r[1]||Number(saved.declaredHours)!==Number(r[2]))return false;
  if(empty(saved.convertedHours)!==empty(r[3])||!empty(r[3])&&Number(saved.convertedHours)!==Number(r[3]))return false;
  return [4,5,6,7,8].every(function(i){return String(saved[['normalStart','normalEnd','overtimeStart','overtimeEnd','position'][i-4]]||'')===String(r[i]||'');});
}

function p79DirectReportSameRequest_(meta,request,rule){
 rule=p79DirectResolvedRule_(rule);
 var r=meta.overtimeReport;if(!r)return false;
 return r.id===request.id&&String(r.workDate||request.date)===String(request.workDate||request.date)&&(!request.overtimeDate||String(r.overtimeDate||request.date)===String(request.overtimeDate))&&r.category===rule[0]&&r.code===rule[1]&&String(r.typeName||'')===String(rule[9]||'')&&Number(r.declaredHours)===Number(rule[2])&&String(r.convertedHours==null?'':r.convertedHours)===String(rule[3])&&[4,5,6,7,8].every(function(i){return String(r[['normalStart','normalEnd','overtimeStart','overtimeEnd','position'][i-4]]||'')===String(rule[i]||'');})&&String(meta.forEmpId||'')===String(request.forEmpId||'')&&String(r.leaveId||'')===String(request.leaveHandoffId||'')&&(!request.leaveHandoffId||String(r.coverDate||request.date)===String(request.coverDate||r.coverDate||request.date))&&String(meta.note||r.note||'')===String(request.note||'')&&r.planned===(request.planned===true)&&(request.planned===true||(String(r.attendanceInId||'')===String(request.attendanceInId||'')&&String(r.attendanceOutId||'')===String(request.attendanceOutId||'')));
}

function p79PlanDirectReport_(rows,request,rule,attendance,leaveCovers,leaveRecords,coverRows){
 rule=p79DirectResolvedRule_(rule);
 const next=JSON.parse(JSON.stringify(rows||[]));
 const row=next.find(r=>String(r.empId).toUpperCase()===String(request.empId).toUpperCase());
 if(!row)throw Error('該人員尚無正式班表');
 const date=String(request.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,7)!==request.month)throw Error('加班日期不符');
 if(!request.id||String(request.id).length>80)throw Error('缺少有效申報識別碼');
 p79AssertOvertimeReportNotRevoked_(next,request.id);
 const schedule=row.schedule||{},meta=schedule.__meta||{},old=meta[date]||{};
 const coverDate=p79DirectCoverDateV107_(request,old);
 if(next.some(r=>Object.entries(r.schedule?.__meta||{}).some(([d,m])=>m?.overtimeReport?.id===request.id&&(d!==date||String(r.empId).toUpperCase()!==String(request.empId).toUpperCase()))))throw Error('此申報識別碼已用於其他人員或日期');
 // Editing an existing linked declaration preserves its verified leave coverage.
 // Do not infer from employee names or unrelated leave on the same date.
 if(old.forEmpId&&rule[0]!=='代'&&!request.leaveHandoffId){
  if(!old.overtimeReport||!(request.replaceReportId===old.overtimeReport.id||request.id===old.overtimeReport.id))throw Error('當日已有請假代班連結，請先選取原申報修改');
  const links=(leaveCovers||[]).filter(c=>String(c.leaveEmpId)===String(old.forEmpId)&&(c.workerIds||[]).map(String).includes(String(request.empId))&&coverDate>=c.startDate&&coverDate<=c.endDate&&(!old.overtimeReport.leaveId||String(c.leaveId)===String(old.overtimeReport.leaveId)));
  if(links.length!==1)throw Error('原申報的請假代班連結無法唯一確認，請重新讀取核對');
  if(request.forEmpId&&String(request.forEmpId)!==String(old.forEmpId))throw Error('修改類型不可同時變更請假代班對象');
  request=Object.assign({},request,{forEmpId:old.forEmpId,leaveHandoffId:links[0].leaveId});
 }
 const accounting=p79DirectDatesV108_(next.concat(coverRows||[]),request,rule,leaveCovers,leaveRecords,coverDate);
 if(old.overtimeReport?.id===request.id&&p79DirectReportSameRequest_(old,request,rule))return {rows:next,duplicate:true,report:old.overtimeReport};
 if(old.overtimeReport?.id===request.id&&request.replaceReportId!==request.id)throw Error('修改原申報須提供原申報識別碼與最新版本');
 if(old.overtimeReport&&['approvalStatus','approvedBy','approvedAt','reviewedBy','reviewedAt'].some(function(k){return old.overtimeReport[k]!=null&&old.overtimeReport[k]!=='';}))throw Error('原申報已有審核紀錄，請先完成正式審核變更程序');
 if(old.overtimeReport&&!request.replaceReportId)throw Error('當日已有申報，請先選取原申報修改');
 if(request.replaceReportId&&old.overtimeReport?.id!==request.replaceReportId)throw Error('原申報已變更，請重新讀取');

 const planned=request.planned===true;
 if(!planned&&(!attendance||!(attendance.end>attendance.start)))throw Error('當日尚無完整出勤紀錄，未生成加班');
 if(leaveRecords.some(l=>String(l.empId).toUpperCase()===String(request.empId).toUpperCase()&&l.status==='已核准'&&date>=String(l.startDate||l.startTime).slice(0,10).replace(/\//g,'-')&&date<=String(l.endDate||l.endTime||l.startDate||l.startTime).slice(0,10).replace(/\//g,'-')))throw Error('加班人員當日有核准請假');
 const original=old.reportOriginalShift??old.overtimeOriginalShift??schedule[date]??'';
 let assigned=original;
 if(rule[0]==='代'||request.leaveHandoffId){
  const cover=leaveCovers.find(c=>String(c.leaveId)===String(request.leaveHandoffId)&&String(c.leaveEmpId)===String(request.forEmpId)&&(c.workerIds||[]).map(String).includes(String(request.empId))&&coverDate>=c.startDate&&coverDate<=c.endDate);
  p79DirectCoverCheckV107_(next.concat(coverRows||[]),request,rule,cover,leaveRecords,coverDate);
 }
 const envelope=p79DirectRuleEnvelope_(date,rule),actualMinutes=planned?null:Math.max(0,Math.floor((Math.min(attendance.end,envelope.overtime[1])-Math.max(attendance.start,envelope.overtime[0]))/60000));
 if(!planned&&!actualMinutes)throw Error('出勤時間沒有包含所選加班時段');
 const isRest=['休','國','例','颱','選'].includes(rule[0])||rule[0]==='代'&&!['早','中','晚'].includes(original);
 if(isRest){const hour=(p79DirectMinute_(rule[6])%1440)/60;assigned=hour<8?'晚':hour<16?'早':'中';}
 /* 手動申報不受原班別限制。 */
 /* 加班時段依管理員手動選取，不與原班別比對。 */
 const report={version:1,id:request.id,category:rule[0],typeName:rule[9]||'',code:rule[1],declaredHours:Number(rule[2]),convertedHours:rule[3]===''?null:Number(rule[3]),normalStart:rule[4],normalEnd:rule[5],overtimeStart:rule[6],overtimeEnd:rule[7],position:rule[8],note:String(request.note||''),leaveId:request.leaveHandoffId||'',coverDate:request.leaveHandoffId?coverDate:'',workDate:date,overtimeDate:accounting.overtimeDate,actualMinutes,planned,status:planned?'預排待出勤':'已核對出勤',attendanceInId:attendance?.inId||'',attendanceOutId:attendance?.outId||''};
 const canonical=t=>p79DirectMinute_(t)===1440?'00:00':String(t).includes(':')?t:t+':00';
 const value={...old,overtimeDate:accounting.overtimeDate,type:rule[0]==='代'?'substitute':'overtime',overtime:true,overtimeType:isRest?'rest':'extended',overtimeOriginalShift:isRest?'休':original,reportOriginalShift:original,overtimeAssignedShift:assigned,overtimeStart:canonical(rule[6]),overtimeEnd:canonical(rule[7]),overtimeReport:report,note:String(request.note||''),forEmpId:rule[0]==='代'||request.leaveHandoffId?request.forEmpId||'':''};
 delete value.overtimeExcluded;delete value.overtimeDeletedAt;
 if(['休','國','例','颱','選'].includes(rule[0])){value.restCategory=rule[0];value.restQuotaOvertime=true;value.restAllocationSource='manual';}
 schedule[date]=assigned;meta[date]=value;schedule.__meta=meta;row.schedule=schedule;
 return {rows:next,duplicate:false,report};
}

function p79SaveDirectOvertimeReport_(ss,data){
 const session=gcRequireActionPermission_(ss,data.gcToken||data.token||'','workhours','overtime.report');
 const empId=normalizeEmpId_(data.empId),date=p79DateOnly_(data.date),month=date.slice(0,7);
 if(!empId||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('缺少有效人員或日期');
 const employee=p79GetEmployeeMasterCached_(ss).find(function(e){return normalizeEmpId_(e.empId)===empId;});
 if(!employee||!p79CanReadScopedEmployee_(session,'workhours',employee))throw Error('該人員不在加班管理範圍');
 const rows=readScheduleMonthOnly_(ss,month)||[];
 const old=rows.find(function(r){return normalizeEmpId_(r.empId)===empId;});
 const meta=old&&old.schedule&&old.schedule.__meta&&old.schedule.__meta[date];
 // Retries of the exact committed request succeed even after the revision changed.
 let retry=false;
 const revision=[getScheduleSyncRevision_(),getLeaveSyncRevision_(),getEmployeeAuthRevision_(),month].join(':');
 const lease=scheduleReadEditLock_();
 const config=getSystemConfig_(),rules=config.overtimeConversionRowsV1;
 if(!Array.isArray(rules))throw Error('請先儲存雲端加班選項');
 const matches=rules.filter(function(r){return Array.isArray(r)&&r[0]===data.category&&r[1]===data.code&&(!data.typeName||!r[9]||r[9]===data.typeName);});
 if(matches.length!==1)throw Error('加班選項不存在或有重複，請重新選擇');
 const rule=p79DirectResolvedRule_(matches[0]);p79DirectRuleEnvelope_(date,rule);
 retry=!!(meta&&meta.overtimeReport&&meta.overtimeReport.id===data.id&&p79DirectReportSameRequest_(meta,data,rule));
 if(!retry&&(!data.expectedRevision||data.expectedRevision!==revision))throw Error('班表或請假資料已更新，請重新讀取再申報');
 if(!retry&&lease&&(normalizeEmpId_(lease.ownerEmpId)!==normalizeEmpId_(session.empId)||String(lease.clientId)!==String(data.scheduleClientId||'')))throw Error('班表正在編輯，請待儲存完成後再申報');
 if(!(Number(rule[2])>0&&Number(rule[2])<=24)||rule[3]!==''&&!(Number.isFinite(Number(rule[3]))&&Number(rule[3])>=0&&Number(rule[3])<=100))throw Error('雲端換算選項時數無效');
 const today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
 const planned=data.planned===true&&(date>=today||retry&&meta.overtimeReport.planned===true);
 if(data.planned===true&&!planned)throw Error('過去日期須核對實際完整出勤，不可改為預排');
 let attendance=null;
 if(!retry&&!planned){
  const nextMonth=p79NextMonthV108_(month);
  const raw=p79MergeAttendanceV108_((getAttendanceMonthData_(month).records||[]).concat(Number(date.slice(-2))===new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate()?(getAttendanceMonthData_(nextMonth).records||[]):[])).filter(function(r){return normalizeEmpId_(r.empId)===empId;});
  const starts=raw.filter(function(r){return String(r.id)===String(data.attendanceInId)&&attendanceRecordTypeCode_(r)==='IN';});
  const ends=raw.filter(function(r){return String(r.id)===String(data.attendanceOutId)&&attendanceRecordTypeCode_(r)==='OUT';});
  if(starts.length!==1||ends.length!==1)throw Error('無法確認指定簽到簽退，請重新讀取出勤');
  const start=attendanceCanonicalEpoch_(starts[0]),end=attendanceCanonicalEpoch_(ends[0]);
  if(!(end>start&&end-start<=24*3600000))throw Error('出勤配對時數無效');
  const linked=String(starts[0].v5PairTargetId||starts[0].manualPairClockOutId||'')===String(ends[0].id)||String(ends[0].v5PairTargetId||ends[0].manualPairClockInId||'')===String(starts[0].id);
  const conflicting=raw.some(function(r){const t=attendanceCanonicalEpoch_(r);return t>start&&t<end&&['IN','OUT'].includes(attendanceRecordTypeCode_(r));});
  if(!linked&&conflicting)throw Error('出勤配對存在多筆紀錄，請先在出勤表核對');
  const base=Date.parse(date+'T00:00:00+08:00');if(start<base-45*60000||start>=base+2*86400000)throw Error('出勤日期與申報日不符');
  attendance={start:start,end:end,inId:starts[0].id,outId:ends[0].id};
 }
 const covers=p79ReadLeaveCoverAssignments_(ss)||[];
 const leaveSheet=ss.getSheetByName(SHEET_LEAVE);
 const leaves=leaveSheet&&leaveSheet.getLastRow()>1?readLeaveRecords_(leaveSheet):[];
 const request={...data,empId:empId,date:date,month:month,planned:planned};
 const coverDate=p79DirectCoverDateV107_(request,meta),coverMonth=coverDate.slice(0,7);
 const coverRows=request.leaveHandoffId&&coverMonth!==month?readScheduleMonthOnly_(ss,coverMonth)||[]:[];
 const plan=p79PlanDirectReport_(rows,request,rule,attendance,covers,leaves,coverRows);
 {
  P79_OT_HISTORY_ACTOR_={empId:session.empId,name:session.name};
  syncSchedules_(ss,{month:month,schedules:plan.rows,expectedEmployeeCount:plan.rows.length},P79_LEAVE_DELETE_PERMIT_);
  const verify=readScheduleMonthOnly_(ss,month).find(function(r){return normalizeEmpId_(r.empId)===empId;});
  const saved=verify&&verify.schedule&&verify.schedule.__meta&&verify.schedule.__meta[date]&&verify.schedule.__meta[date].overtimeReport;
  if(!saved||saved.workDate!==date||saved.overtimeDate!==plan.report.overtimeDate)throw Error('雙日期加班讀回不符，請保留原申報ID核對');
  if(!p79DirectConversionReceipt_(saved,data.id,rule))throw Error('加班寫入的時數、換算或時段未通過讀回確認，請保留申報識別碼再試');
  plan.report=saved;
 }
 return {ok:true,id:data.id,empId:empId,date:date,workDate:date,overtimeDate:plan.report.overtimeDate,report:plan.report,duplicate:plan.duplicate,directOvertimeSaved:true};
}

function p79GetOvertimeReportContext_(p){
 const ss=getSpreadsheet_(true),session=gcRequireActionPermission_(ss,p.gcToken||p.token||'','workhours','overtime.report');
 const empId=normalizeEmpId_(p.empId),date=p79DateOnly_(p.date);
 const base=Date.parse(date+'T00:00:00+08:00');
 if(!empId||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(base))throw Error('缺少有效人員或申報日期');
 const employee=p79GetEmployeeMasterCached_(ss).find(function(e){return normalizeEmpId_(e.empId)===empId;});
 if(!employee||!p79CanReadScopedEmployee_(session,'workhours',employee))throw Error('該人員不在加班管理範圍');
 const month=date.slice(0,7),today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd'),data=date>today?{ok:true,records:[]}:getAttendanceMonthData_(month);
 if(date<=today&&Number(date.slice(-2))===new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate()){var adjacent=getAttendanceMonthData_(p79NextMonthV108_(month));if(!adjacent||adjacent.ok!==true)throw Error('相鄰月份出勤未讀齊，停止核對');data.records=p79MergeAttendanceV108_((data.records||[]).concat(adjacent.records||[]));}
 if(!data||data.ok!==true||!Array.isArray(data.records))throw Error('出勤來源未完成核對');
 const fields=['id','empId','attNo','name','dept','jobTitle','timeStr','status','type','recordType','source','manualPairClockInId','manualPairClockOutId','v5PairTargetId'];
 const records=data.records.filter(function(r){const t=attendanceCanonicalEpoch_(r);return normalizeEmpId_(r.empId)===empId&&Number.isFinite(t)&&t>=base-86400000&&t<base+3*86400000;}).map(function(r){const safe={};fields.forEach(function(k){if(r[k]!==undefined)safe[k]=r[k];});return safe;});
 const covers=(p79ReadLeaveCoverAssignments_(ss)||[]).filter(function(r){return (r.workerIds||[]).some(function(id){return normalizeEmpId_(id)===empId;});});
 const allowed=new Set([empId]);covers.filter(function(c){return String(c.leaveId)===String(p.leaveHandoffId||'');}).forEach(function(c){allowed.add(normalizeEmpId_(c.leaveEmpId));(c.workerIds||[]).forEach(function(id){const employee=p79GetEmployeeMasterCached_(ss).find(function(e){return normalizeEmpId_(e.empId)===normalizeEmpId_(id);});if(employee&&p79CanReadScopedEmployee_(session,'workhours',employee))allowed.add(normalizeEmpId_(id));});});
 const schedules=(readScheduleMonthOnly_(ss,month)||[]).filter(function(r){return allowed.has(normalizeEmpId_(r.empId));});
 const coverDate=p79DateOnly_(p.coverDate||date),coverMonth=coverDate.slice(0,7);
 if(/^\d{4}-\d{2}-\d{2}$/.test(coverDate)&&coverMonth!==month)(readScheduleMonthOnly_(ss,coverMonth)||[]).filter(function(r){return allowed.has(normalizeEmpId_(r.empId));}).forEach(function(r){var existing=schedules.find(function(x){return normalizeEmpId_(x.empId)===normalizeEmpId_(r.empId);});if(existing){existing.schedule=Object.assign({},r.schedule||{},existing.schedule||{},{__meta:Object.assign({},r.schedule&&r.schedule.__meta||{},existing.schedule&&existing.schedule.__meta||{})});}else schedules.push(r);});
 const config=getSystemConfig_(),options={overtimeConversionRowsV1:config.overtimeConversionRowsV1,overtimeReportTypesV1:config.overtimeReportTypesV1};
 return {ok:true,action:'getOvertimeReportContext',empId:empId,date:date,month:month,records:records,config:options,schedules:schedules,capabilities:{nightCoverOvertimeAccountingV1:true},report:(schedules.find(function(r){return normalizeEmpId_(r.empId)===empId;})||{}).schedule?.__meta?.[date]?.overtimeReport||null,leaveCoverAssignments:covers,revision:[getScheduleSyncRevision_(),getLeaveSyncRevision_(),getEmployeeAuthRevision_(),month].join(':'),apiVersion:API_VERSION};
}

function p79DirectCoverDateV107_(request,old){return String(request.coverDate||old&&old.overtimeReport&&old.overtimeReport.coverDate||request.date||'');}

function p79DirectCoverShiftV107_(row,date){var s=row&&row.schedule||{},m=s.__meta&&s.__meta[date]||{};return [s[date],s[date.slice(-2)],s[String(Number(date.slice(-2)))],m.leaveOriginalShift,m.reportOriginalShift,m.overtimeOriginalShift].map(function(v){return String(v||'').trim();}).find(function(v){return ['早','中','晚'].includes(v);})||'';}

function p79DirectCoverCheckV107_(rows,request,rule,cover,leaves,coverDate){
 var date=String(request.date),valid=function(d){return /^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;};
 if(!valid(coverDate))throw Error('原請假日期無效');
 var leave=(leaves||[]).find(function(l){return String(l.id)===String(request.leaveHandoffId)&&String(l.empId).toUpperCase()===String(request.forEmpId).toUpperCase()&&l.status==='已核准'&&coverDate>=String(l.startDate||l.startTime).slice(0,10).replace(/\//g,'-')&&coverDate<=String(l.endDate||l.endTime||l.startDate||l.startTime).slice(0,10).replace(/\//g,'-');});
 if(!cover||!leave)throw Error('對應請假或代班安排已變更，未生成加班');
 if(date===coverDate&&rule[0]!=='延')return;
 if(cover.mode!=='two'){if(date!==coverDate)throw Error('此代班模式不支援跨日工作日期');return;}
 var target=rows.find(function(r){return String(r.empId).toUpperCase()===String(request.forEmpId).toUpperCase()&&p79DirectCoverShiftV107_(r,coverDate);});
 var shift=p79DirectCoverShiftV107_(target,coverDate),index=(cover.workerIds||[]).findIndex(function(id){return String(id).toUpperCase()===String(request.empId).toUpperCase();}),p=null;
 var add=function(d,n){return new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);};
 if(shift==='晚')p=index===0?[coverDate,'中','16','24','24','04','after']:[add(coverDate,1),'早','08','16','04','08','before'];
 if(shift==='早')p=index===0?[add(coverDate,-1),'晚','24','08','08','12','after']:[coverDate,'中','16','24','12','16','before'];
 if(!p){if(date!==coverDate)throw Error('原請假班別無法確認跨日代班');return;}
 var own=rows.find(function(r){return String(r.empId).toUpperCase()===String(request.empId).toUpperCase()&&p79DirectCoverShiftV107_(r,date);});
 if(date!==p[0]||p79DirectCoverShiftV107_(own,date)!==p[1])throw Error('代班工作日期或本人正常班已變更，請重新核對');
 if(rule[0]!=='延'||Number(rule[2])!==4||rule[8]!==p[6]||![4,5,6,7].every(function(i){return p79DirectMinute_(rule[i])===p79DirectMinute_(p[i-2]);}))throw Error('代班加班時段與原請假班別不符，請重新核對');
}

function p79OtEntriesFromRowsV108_(date,people,rows){
 var map={};rows.forEach(function(row){var id=normalizeEmpId_(row.empId);if(!people[id])return;
 Object.entries(row.schedule&&row.schedule.__meta||{}).forEach(function(pair){var workDate=pair[0],m=pair[1]||{};if(m.overtimeExcluded===true)return;
 var revoked={};(m.overtimeRevocations||[]).forEach(function(r){if(r&&r.confirmed)revoked[String(r.reportId)]=true;});
 (Array.isArray(m.overtimeReports)?m.overtimeReports:[]).concat(m.overtimeReport||[]).forEach(function(r){if(!r||!r.id||revoked[String(r.id)]||String(r.overtimeDate||workDate)!==date)return;
 var key=id+'|'+String(r.id);if(map[key])throw Error('正式加班申報ID重複，停止彙總');
 map[key]={date:date,workDate:workDate,empId:id,reportId:String(r.id),report:r,person:people[id]};});});});return map;
}

function p79DirectDatesV108_(rows,request,rule,covers,leaves,coverDate){
 var date=String(request.date||''),expected=date;
 if(request.workDate&&String(request.workDate)!==date)throw Error('實際出勤日與班表日期不符');
 if(request.leaveHandoffId){
  var cover=(covers||[]).find(function(c){return String(c.leaveId)===String(request.leaveHandoffId)&&normalizeEmpId_(c.leaveEmpId)===normalizeEmpId_(request.forEmpId)&&c.workerIds.map(normalizeEmpId_).includes(normalizeEmpId_(request.empId))&&c.startDate<=coverDate&&c.endDate>=coverDate;});
  p79DirectCoverCheckV107_(rows,request,rule,cover,leaves,coverDate);
  var target=rows.find(function(r){return normalizeEmpId_(r.empId)===normalizeEmpId_(request.forEmpId)&&p79DirectCoverShiftV107_(r,coverDate);});
  if(cover.mode==='two'&&p79DirectCoverShiftV107_(target,coverDate)==='晚'&&cover.workerIds.map(normalizeEmpId_).indexOf(normalizeEmpId_(request.empId))===1)expected=coverDate;
  // Do not create a second report while a legacy same-cover report exists elsewhere.
  rows.filter(function(r){return normalizeEmpId_(r.empId)===normalizeEmpId_(request.empId);}).forEach(function(row){Object.entries(row.schedule&&row.schedule.__meta||{}).forEach(function(pair){var day=pair[0],m=pair[1]||{},r=m.overtimeReport;if(day===date||!r||!r.id||m.overtimeExcluded)return;if(String(r.leaveId)===String(request.leaveHandoffId)&&String(r.coverDate||day)===coverDate&&String(m.forEmpId)===String(request.forEmpId))throw Error('原代班已有申報 '+r.id+'，須沿用原ID核對雙日期，未新增重複申報');});});
 }
 if(request.overtimeDate&&String(request.overtimeDate)!==expected)throw Error('加班歸屬日應為 '+expected+'，未寫入錯日申報');
 return {workDate:date,overtimeDate:expected,coverDate:coverDate};
}

function p79NextMonthV108_(month){return new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1)).toISOString().slice(0,7);}

function p79MergeAttendanceV108_(rows){var seen={},out=[];rows.forEach(function(r){var id=String(r.id||'');if(!seen[id]){seen[id]=true;out.push(r);}});return out;}

function p79OtReportEntries_(ss,date,people,monthRows){
 var month=date.slice(0,7),rows=Array.isArray(monthRows)?monthRows:(readScheduleMonthOnly_(ss,month)||[]);
 var next=p79NextMonthV108_(month),key=ss.getId()+'|'+next;
 if(!Object.prototype.hasOwnProperty.call(P79_OT_ADJACENT_V108_,key))P79_OT_ADJACENT_V108_[key]=readScheduleMonthOnly_(ss,next)||[];
 return p79OtEntriesFromRowsV108_(date,people,rows.concat(P79_OT_ADJACENT_V108_[key]));
}

function p79OtHistoryFilingContent_(snapshot){
 if(!snapshot)return null;
 var report=snapshot.report||{},fields=['version','id','category','typeName','code',
  'declaredHours','convertedHours','normalStart','normalEnd','overtimeStart',
  'overtimeEnd','position','note','leaveId','leaveHandoffId','forEmpId','coverDate','workDate','overtimeDate'];
 var declared={};fields.forEach(function(k){if(report[k]!==undefined)declared[k]=report[k];});
 return {report:declared,forEmpId:String(snapshot.forEmpId||''),excluded:snapshot.excluded===true};
}

function p79RemoveLeaveCoverLinks_(ss,leaveIds,finalize,deletedLeaves,activeLeaves){
  const sheet=ss.getSheetByName(P79_LEAVE_COVER_SHEET);
  const covers=sheet&&sheet.getLastRow()>1?sheet.getRange(2,1,sheet.getLastRow()-1,P79_LEAVE_COVER_HEADERS.length).getValues():[];
  const ids=new Set(leaveIds.map(String)),removed=covers.filter(function(c){return ids.has(String(c[0]));});
  const months=new Set();
  const includeDates=function(startValue,endValue){
    const start=p79DateOnly_(startValue),end=p79DateOnly_(endValue||startValue);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)
      throw new Error('請假／代班日期無效，未刪除任何資料');
    let days=0;
    for(let day=new Date(start+'T12:00:00Z'),last=new Date(end+'T12:00:00Z');day<=last;day.setUTCDate(day.getUTCDate()+1)){
      months.add(day.toISOString().slice(0,7));
      if(++days>731||months.size>24)throw new Error('請假／代班範圍異常，請先核對');
    }
  };
  removed.forEach(function(c){includeDates(c[2],c[3]);});
  (deletedLeaves||[]).forEach(function(leave){includeDates(leave.startTime||leave.startDate,leave.endTime||leave.endDate);});
  Array.from(months).forEach(function(month){months.add(p79NextMonthV108_(month));});
  const restored=[],pending=[];
  const changes=[];months.forEach(function(month){
    const rows=readScheduleMonthOnly_(ss,month)||[];
    const plan=p79LeaveRemovalPlan_(rows,covers,leaveIds);
    const reconciled=p79LeaveRestoreRosterPlan_(plan.rows,deletedLeaves,activeLeaves,month);
    if(plan.affected.length||reconciled.changed.length){
      changes.push({month:month,before:rows,after:reconciled.rows});
      restored.push.apply(restored,reconciled.changed);
      pending.push.apply(pending,reconciled.pending);
    }
  });
  const committed=[];
  try{
    changes.forEach(function(c){committed.push(c);syncSchedules_(ss,{month:c.month,schedules:c.after,expectedEmployeeCount:c.after.length},P79_LEAVE_DELETE_PERMIT_);});
    if(sheet&&removed.length)p79WriteLeaveCoverRows_(sheet,covers.filter(function(c){return !ids.has(String(c[0]));}));
    if(finalize)finalize();
  }catch(error){
    try{committed.reverse().forEach(function(c){p79RestoreSchedulesAfterFailedWrite_(ss,{month:c.month,schedules:c.before,expectedEmployeeCount:c.before.length},P79_LEAVE_DELETE_PERMIT_);});if(sheet&&removed.length)p79WriteLeaveCoverRows_(sheet,covers);}catch(rollback){throw new Error('連動刪除未完成且回復未確認，請重新載入核對：'+error.message);}
    throw error;
  }
  if(removed.length||finalize){touchLeaveSyncRevision_();touchScheduleSyncRevision_();}
  return {removedCoverAssignments:removed.length,
    restoredScheduleDays:restored,restorePendingDays:pending,
    updatedMonths:changes.map(function(c){return c.month;})};
}

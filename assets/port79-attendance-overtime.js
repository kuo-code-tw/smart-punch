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
// A cached table cell may retain the old clock-out after manual correction.
// Always prefll from the authoritative complete pair returned by cloud context.
function p79OfficialOvertimePair(cloud,empId,date,visible,roster,saved){
 const records=(cloud?.records||[]).filter(r=>id(r.empId)===id(empId));
 const base=Date.parse(date+'T00:00:00+08:00');
 if(!Number.isFinite(base))throw Error('加班工作日期無效，已停止申報');
 const next=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 const sessions=buildDailyAttendanceRows(records)
  .filter(p=>p.clockIn&&p.clockOut&&!p.pairingIssue)
  .map(row=>({row,start:getAttendanceTimestamp(row.clockIn),end:getAttendanceTimestamp(row.clockOut)}))
  .filter(p=>{
   if(!Number.isFinite(p.start)||!Number.isFinite(p.end)||p.end<=p.start||p.end-p.start>18*3600000)return false;
   const local=new Date(p.start+8*3600000),day=local.toISOString().slice(0,10);
   return day===date||(day===next&&local.getUTCHours()<8);
  });
 const inId=String(visible?.clockIn?.id||'').trim(),outId=String(visible?.clockOut?.id||'').trim();
 const same=sessions.filter(p=>(inId&&String(p.row.clockIn.id||'').trim()===inId)||
                              (outId&&String(p.row.clockOut.id||'').trim()===outId));
 if(same.length===1)return same[0];
 if(same.length>1)throw Error('正式上下班打卡配對與目前顯示不同，請先核對原始打卡 ID');
 // Replaced IDs must be resolved against a known shift, never against just a name or date.
 let slot=null;
 try{
  if(saved?.overtimeStart&&saved?.overtimeEnd){
   const [start,end]=P79Overtime.interval(date,saved.overtimeStart,saved.overtimeEnd);
   slot={start,end};
  }else{
   const scheduled=g.P79RestAttendance?.period(date,roster||{});
   if(scheduled?.known)slot=scheduled;
  }
 }catch(_){}
 const choices=slot?sessions.filter(p=>p.start<slot.end&&p.end>slot.start):[];
 if(choices.length!==1)throw Error(choices.length?'正式考勤有多組可能的上下班配對，請先核對原始打卡':'找不到這個工作日唯一、完整的正式上下班打卡；請先重新讀取考勤');
 return choices[0];
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
  const official=p79OfficialOvertimePair(cloud,employee.empId,date,row,roster,saved);
  const start=official.start,end=official.end;
  const parts=P79SpecialOvertime.forShift(start,end,official.row.clockIn.timeStr),kinds=parts.flatMap(p=>p.kinds);
  const inferred=saved?null:P79Overtime.suggestRule(start,end,date,roster,options.rows,kinds);
  // The official roster's day category applies to EVERY employee, including
  // ordinary 國/休/例 shifts that are not typhoon or election special days.
  const dayCategory=String(roster?.[date]||'').trim();
  const rosterCategory=['國','休','例'].includes(dayCategory)?dayCategory:'';
  await P79Overtime.openReport({empId:String(employee.empId),date,roster,savedReport:!!saved,attendance:{start,end},code:saved?.code||inferred?.[1]||'',category:saved?.category||inferred?.[0]||rosterCategory||(parts.length?'國':'延'),preferredType:saved?.typeName||(inferred?P79Overtime.ruleType(inferred):''),requirePeriodSelection:!saved&&!inferred,periodHint:'依排定班別起算，下班分鐘達45分（含）即進位。尚無相符時段，請新增或核對出勤時段。'});
 }catch(error){showToast('申報未開啟：'+String(error.message||error),'warning');}
 finally{opening=false;}
}

/** Attendance date-strip indicators based on saved cloud overtime reports. */
function auditChanged(report,meta){
 const history=Array.isArray(meta.overtimeAmendments)?meta.overtimeAmendments:
  Array.isArray(meta.overtimeRevisions)?meta.overtimeRevisions:
  Array.isArray(report?.amendments)?report.amendments:[];
 const verified=history.some(a=>a?.confirmed===true&&String(a.at||'').trim()&&String(a.actor||'').trim()&&(!a.reportId||String(a.reportId)===String(report?.id||'')));
 const modified=String(report?.modifiedAt||'').trim();
 const created=String(report?.reportedAt||report?.createdAt||'').trim();
 return verified||!!(String(report?.replacesReportId||'').trim()&&String(report.replacesReportId).trim()!==String(report?.id||'').trim())||!!(modified&&created&&modified!==created);
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
 // 日期顏色以「目前有效」申報為主：歷史撤銷不能蓋掉同日重新申報。
 // 有效申報仍有待核的修改才呈黃；只有不存在有效申報時，歷史取消才呈紅。
 const activeCount=counts.reported+counts.amended;
 const kind=activeCount>0?(counts.amended?'amended':'reported'):'revoked';
 const summary=['已申報 '+counts.reported,'已修改 '+counts.amended,'已取消 '+counts.revoked].join('｜');
 const names={revoked:'已取消',amended:'已修改',reported:'已申報'};
 const lines=entries.slice(0,24).map(row=>row.name+'：'+names[row.kind]+
  (row.code?'｜'+row.code:'')+(row.hours?'｜'+row.hours+'小時':'')+'｜'+row.detail);
 if(entries.length>24)lines.push('其餘 '+(entries.length-24)+' 筆請開啟申報明細核對');
 return {kind,count:entries.length,activeCount,amendedCount:counts.amended,revokedCount:counts.revoked,title:date+'\n'+summary+'\n'+lines.join('\n')};
}
// 查核只確認「當下讀到的正式申報版本」，不會修改 GAS 申報或歷史稽核。
// 只存 hash，避免舊日期一旦查核就永遠把後續新修改誤標為綠色。
const reviewVersionKey='p79.attendance.date.reviewed.confirmed.v2';
function cloudMonth(date){
 try{
  return typeof p79AttendanceOvertimeMonths!=='undefined'
   ?p79AttendanceOvertimeMonths.get(String(date).slice(0,7)):null;
 }catch(_){return null;}
}
// A date review tracks the actual overtime audit payload, not incidental
// schedule day metadata. Opening the monthly-rest dialog is read-only and may
// cause a fresh cloud snapshot with different row/property ordering.
function p79ReviewStableObject(value){
 if(Array.isArray(value))return value.map(p79ReviewStableObject);
 if(value&&typeof value==='object'){
  const out={};
  for(const key of Object.keys(value).sort())out[key]=p79ReviewStableObject(value[key]);
  return out;
 }
 return value;
}
function p79ReviewStableAuditRows(date,state){
 const list=[];
 for(const row of state.rows||[]){
  const meta=row.schedule?.__meta?.[date];
  if(!meta)continue;
  const report=meta.overtimeReport||null;
  const reports=Array.isArray(meta.overtimeReports)?meta.overtimeReports.filter(Boolean):[];
  const amendments=Array.isArray(meta.overtimeAmendments)?meta.overtimeAmendments.filter(Boolean):[];
  const revisions=Array.isArray(meta.overtimeRevisions)?meta.overtimeRevisions.filter(Boolean):[];
  const revocations=Array.isArray(meta.overtimeRevocations)?meta.overtimeRevocations.filter(Boolean):[];
  // Rest-day evidence, scheduling notes and newly present empty __meta entries
  // must never invalidate a previously confirmed overtime review.
  if(!report&&!reports.length&&!amendments.length&&!revisions.length&&!revocations.length&&meta.overtimeExcluded!==true)continue;
  const normalized=collections=>collections.map(p79ReviewStableObject)
   .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  list.push([id(row.empId),p79ReviewStableObject(report),
    normalized(reports),normalized(amendments),normalized(revisions),
    normalized(revocations),meta.overtimeExcluded===true]);
 }
 return list.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function p79ReviewHash(value){
 const json=JSON.stringify(value);
 let hash=2166136261;
 for(let i=0;i<json.length;i++)hash=Math.imul(hash^json.charCodeAt(i),16777619);
 return (hash>>>0).toString(36);
}
function p79ReviewSemanticAudit(value){
 if(Array.isArray(value))return value.map(p79ReviewSemanticAudit);
 if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value).sort())if(!['updatedAt','lastSyncedAt','syncedAt','lastReadAt'].includes(key))out[key]=p79ReviewSemanticAudit(value[key]);return out;}
 return value;
}
function p79ReviewV4ViewerScope(state){
 try{const session=JSON.parse(g.sessionStorage?.getItem('port79_user_session')||'null');if(session?.empId)return p79ReviewStableObject({empId:id(session.empId),role:session.adminRole||session.role||'',scope:session.dataScope||{},permissions:session.systemPermissions||{},fine:session.finePermissions||{}});}catch(_){}
 return String(state.token||'');
}
function p79ReviewViewerScope(state){
 // Permission refreshes on another module do not alter an overtime filing.
 // Authorization is enforced by the cloud read; the actual visible filing set
 // below still changes when the caller's accessible employee set changes.
 try{const session=JSON.parse(g.sessionStorage?.getItem('port79_user_session')||'null');if(session?.empId)return id(session.empId);}catch(_){}
 return String(state.token||'');
}
function p79ReviewReportContent(report,owner='',date=''){
 if(!report||!String(report.id||'').trim())return null;
 const text=key=>String(report[key]??(key==='empId'?owner:key==='date'?date:'')).trim();
 const fields=['id','empId','date','category','code','typeName','forEmpId','leaveHandoffId','leaveId','note','overtimeStart','overtimeEnd','normalStart','normalEnd','position'];
 const result=Object.fromEntries(fields.map(key=>[key,text(key)]));
 for(const key of ['declaredHours','convertedHours'])result[key]=text(key)===''?null:Number.isFinite(Number(report[key]))?Number(report[key]):text(key);
 result.planned=report.planned===true||report.planned==='true';
 return result;
}
function p79ReviewContentRows(date,state){
 const list=[];
 for(const row of state.rows||[]){
  const meta=row.schedule?.__meta?.[date];if(!meta)continue;
  // Primary and plural report slots are alternative representations of the
  // same reports. Property additions, order and repeated copies are not edits.
  const reports=[meta.overtimeReport,...(Array.isArray(meta.overtimeReports)?meta.overtimeReports:[])]
   .map(report=>p79ReviewReportContent(report,id(row.empId),date)).filter(Boolean);
  const unique=values=>[...new Set(values.map(value=>JSON.stringify(p79ReviewStableObject(value))))].sort();
  const revocations=(Array.isArray(meta.overtimeRevocations)?meta.overtimeRevocations:[])
   .filter(a=>a?.confirmed===true&&String(a.reportId||'').trim())
   .map(a=>({reportId:String(a.reportId).trim(),report:p79ReviewReportContent(a.report,id(row.empId),date),reason:String(a.reason||'').trim()}));
  if(!reports.length&&!revocations.length&&meta.overtimeExcluded!==true)continue;
  list.push([id(row.empId),unique(reports),unique(revocations),meta.overtimeExcluded===true]);
 }
 return [...new Set(list.map(value=>JSON.stringify(value)))].sort();
}
function reviewFingerprint(date,state){
 if(state?.ready!==true)return '';
 const list=p79ReviewContentRows(date,state);
 return 'v5-'+list.length+'-'+p79ReviewHash([p79ReviewViewerScope(state),list]);
}
function p79V4ReviewFingerprint(date,state){
 if(state?.ready!==true)return '';
 const list=p79ReviewSemanticAudit(p79ReviewStableAuditRows(date,state));
 return 'v4-'+list.length+'-'+p79ReviewHash([p79ReviewV4ViewerScope(state),list]);
}

function p79PriorStableReviewFingerprint(date,state){
 if(state?.ready!==true)return '';
 const list=p79ReviewStableAuditRows(date,state);
 return 'v3-'+list.length+'-'+p79ReviewHash([String(state.token||''),list]);
}
// Keep existing users' verified marks if the saved legacy hash still exactly
// matches the official cloud snapshot. A mismatched legacy mark is not trusted.
// Read-only rest-quota inspection must never silently promote an unmatched old hash.
function p79LegacyReviewFingerprint(date,state){
 if(state?.ready!==true)return '';
 const list=(state.rows||[]).map(row=>{
  const meta=row.schedule?.__meta?.[date];
  return meta?[id(row.empId),meta.overtimeReport||null,meta.overtimeReports||null,
   meta.overtimeAmendments||null,meta.overtimeRevisions||null,
   meta.overtimeRevocations||null,meta.overtimeExcluded===true]:null;
 }).filter(Boolean).sort((a,b)=>a[0].localeCompare(b[0]));
 return list.length+'-'+p79ReviewHash([String(state.token||''),list]);
}

function reviewMarks(){
 try{
  const data=JSON.parse(g.localStorage?.getItem(reviewVersionKey)||'{}');
  return data&&typeof data==='object'&&!Array.isArray(data)?data:{};
 }catch(_){return {};}
}
function isReviewed(date){
 const state=cloudMonth(date);
 const signature=reviewFingerprint(date,state);
 if(!signature)return false;
 const marks=reviewMarks();
 if(marks[date]===signature)return true;
 if(marks[date]&&(marks[date]===p79V4ReviewFingerprint(date,state)||marks[date]===p79PriorStableReviewFingerprint(date,state)||marks[date]===p79LegacyReviewFingerprint(date,state))){
  // One-time conservative migration: the legacy hash must match exactly.
  marks[date]=signature;
  try{g.localStorage?.setItem(reviewVersionKey,JSON.stringify(marks));}catch(_){}
  return true;
 }
 return false;
}
function refreshCurrentStrip(){
 const host=g.document?.getElementById?.('p79AttendanceDateStrip');
 if(!host)return;
 const dates=[...host.querySelectorAll('button[onclick^="goToRecordsPage("]')]
  .map(button=>button.getAttribute?.('data-p79-attendance-date')||button.dataset?.p79AttendanceDate).filter(Boolean);
 const selected=typeof recordsSelectedDateKey==='undefined'?'':recordsSelectedDateKey;
 decorateOvertimeDateStrip(dates,selected);
}
function markReviewed(date,checked){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return false;
 const current=cloudMonth(date);
 const signature=reviewFingerprint(date,current);
 if(!signature)return false; // 不可在正式資料未確認時假稱已查核。
 if(checked&&!overtimeDayIndicator(date,current)?.activeCount)return false; // 無有效申報不得偽裝成綠色。
 const marks=reviewMarks();
 if(checked)marks[date]=signature;
 else delete marks[date];
 try{
  if(typeof g.localStorage?.setItem!=='function')return false;
  g.localStorage.setItem(reviewVersionKey,JSON.stringify(marks));
 }catch(_){return false;}
 refreshCurrentStrip();
 return true;
}
g.addEventListener?.('storage',event=>{
 if(event.key===reviewVersionKey)refreshCurrentStrip();
});
// List what the attendance schedule snapshot actually contained. This is NOT
// an authoritative check that the user never filed a report in work-hours.
function attendanceReviewEvidence(date,state){
 const found=new Set();
 const counts={candidate:0,revoked:0,matchedCancelId:0,excluded:0,missingId:0,staff:0};
 for(const row of state?.rows||[]){
  const meta=row?.schedule?.__meta?.[date];
  if(!meta)continue;
  counts.staff++;
  const person=id(row.empId);
  const cancellations=Array.isArray(meta.overtimeRevocations)?meta.overtimeRevocations:[];
  const revokedIds=new Set(cancellations.filter(a=>a?.confirmed===true).map(a=>String(a.reportId||'').trim()));
  for(const audit of cancellations){
   if(audit?.confirmed!==true||!audit?.reportId)continue;
   const key=person+'|'+String(audit.reportId)+'|'+String(audit.at||'');
   if(found.has('revoked|'+key))continue;
   found.add('revoked|'+key);counts.revoked++;
  }
  const reports=[meta.overtimeReport,...(Array.isArray(meta.overtimeReports)?meta.overtimeReports:[])].filter(Boolean);
  for(const report of reports){
   const reportId=String(report?.id||'').trim();
   const key=person+'|'+(reportId||'unknown');
   if(found.has('candidate|'+key))continue;
   found.add('candidate|'+key);counts.candidate++;
   if(!reportId)counts.missingId++;
   else if(meta.overtimeExcluded===true)counts.excluded++;
   else if(revokedIds.has(reportId))counts.matchedCancelId++;
  }
 }
 return counts;
}

// Right-click review always performs a fresh authorized GAS read, rather than trusting
// a 60-second month cache or a previous revocation state.
const activeReviewRequests=new Map();
async function recheckAndMarkReviewed(date,checked=true){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))
  return {ok:false,message:'日期格式不正確，無法核對申報'};
 if(!checked){
  const changed=markReviewed(date,false);
  return {ok:changed,message:changed?date+' 已取消查核；目前有效的修改申報恢復黃色':date+' 取消查核失敗：請確認雲端資料與瀏覽器儲存權限'};
 }
 const month=date.slice(0,7);
 if(activeReviewRequests.has(month))return activeReviewRequests.get(month);
 const run=(async()=>{
  const token=typeof getAttendanceEmployeeMasterToken==='function'
   ?String(getAttendanceEmployeeMasterToken()||'').trim():'';
  const base=typeof getActiveGasUrl==='function'?String(getActiveGasUrl()||'').trim():'';
  if(!token||!base)return {ok:false,message:date+' 雲端登入或連線資訊不足，請重新登入後核對'};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),30000);
  try{
   const url=new URL(base,g.location?.href||location.href);
   url.searchParams.set('action','getScheduleDataSecure');
   url.searchParams.set('gcToken',token);
   url.searchParams.set('month',month);
   url.searchParams.set('_',String(Date.now()));
   const response=await g.fetch(url.toString(),{cache:'no-store',signal:controller.signal});
   const data=await response.json();
   if(!response.ok||data?.ok!==true)throw Error(data?.error||'雲端未完成正式資料核對');
   if(!Array.isArray(data.schedules))throw Error('雲端未提供可查核的正式班表');
   if(String(getAttendanceEmployeeMasterToken()||'').trim()!==token)
    throw Error('登入狀態已變更，請重新操作');
   const state={
    token,at:Date.now(),ready:true,pending:false,rows:data.schedules,
    people:Array.isArray(data.employees)?data.employees:[],
    covers:Array.isArray(data.leaveCoverAssignments)?data.leaveCoverAssignments:[]
   };
   // Old asynchronous month fetches check identity before writing; replacing this
   // cache state prevents a stale in-flight response from reverting the audit view.
   const months=typeof p79AttendanceOvertimeMonths!=='undefined'?p79AttendanceOvertimeMonths:null;
   if(!months)throw Error('考勤月份資料尚未初始化，請重新開啟考勤頁');
   months.set(month,state);
   refreshCurrentStrip();
   const info=overtimeDayIndicator(date,state);
   if(!info?.activeCount){
    const evidence=attendanceReviewEvidence(date,state);
    const details=[
     '本次班表回傳 '+evidence.candidate+' 筆申報候選資料',
     evidence.revoked+' 筆已確認取消歷史',
     ...(evidence.matchedCancelId?['其中 '+evidence.matchedCancelId+' 筆申報編號與取消紀錄相同']:[]),
     ...(evidence.excluded?['有 '+evidence.excluded+' 筆標記為排除']:[]),
     ...(evidence.missingId?['有 '+evidence.missingId+' 筆缺少申報編號']:[])
    ].join('、');
    // A schedule snapshot is only one source. It cannot prove that a filing
    // wasn't saved elsewhere or that cloud schedule replication has completed.
    return {ok:false,kind:'unverified',evidence,
     message:date+' 目前無法從考勤班表快照確認有效申報（'+details+'）。'
      +'這不代表你沒有正式申報，也不能只因取消歷史就否定後續申報。'
      +'如果加班管理已顯示「正常已申報」，代表兩邊資料需要核對；目前不會自行改動正式申報或強制標綠。'};
   }
   if(!markReviewed(date,true))
    return {ok:false,message:date+' 雲端確認 '+info.activeCount+' 筆有效申報，但查核狀態未能儲存在此瀏覽器，請確認網站儲存權限'};
   return {ok:true,kind:'reported',message:date+' 雲端已確認 '+info.activeCount+' 筆有效申報，查核完成並顯示綠色；修改／取消歷史仍保留'};
  }catch(error){
   const reason=error?.name==='AbortError'?'雲端讀取逾時':String(error?.message||error||'未知錯誤');
   return {ok:false,message:date+' 查核失敗：'+reason+'。不會修改正式申報或強制變綠。'};
  }finally{clearTimeout(timer);}
 })();
 activeReviewRequests.set(month,run);
 try{return await run;}finally{if(activeReviewRequests.get(month)===run)activeReviewRequests.delete(month);}
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
  // 修改經人工核對且申報版本未再變動，恢復綠色；新的修改仍須重新核對。
  const reviewed=ready&&isReviewed(date);
  const effectiveKind=info?.kind==='amended'&&reviewed?'reported':info?.kind;
  const palette=!ready?['#f1f5f9','#64748b','#94a3b8']:
   !info?['#ffffff','#334155','#cbd5e1']:
   effectiveKind==='revoked'?['#fee2e2','#991b1b','#f87171']:
   effectiveKind==='amended'?['#fef3c7','#92400e','#f59e0b']:
   ['#dcfce7','#166534','#4ade80'];
  button.style.setProperty('background-color',palette[0],'important');
  button.style.setProperty('color',palette[1],'important');
  button.style.setProperty('border-color',palette[2],'important');
  if(date===selectedDate)button.style.setProperty('box-shadow','inset 0 0 0 2px #4f46e5','important');
  button.dataset.p79OvertimeAudit=effectiveKind||(ready?'none':'unknown');
  button.dataset.p79OvertimeReview=reviewed?'reviewed':'not-reviewed';
  button.dataset.p79OvertimeContentVersion=ready?reviewFingerprint(date,cloudMonth(date)):'';
  button.title=(info?.title||(date+(ready?'｜沒有正式加班申報':'｜正式申報資料尚未確認')))
   +(reviewed&&info?.activeCount?'\n此版本已人工查核；修改歷史保留':'');
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
g.P79AttendanceOvertimeDayStatus={auditChanged,overtimeDayIndicator,decorateOvertimeDateStrip,isReviewed,markReviewed,recheckAndMarkReviewed,reviewFingerprint};

g.P79AttendanceOvertime={open,save};
})(window);

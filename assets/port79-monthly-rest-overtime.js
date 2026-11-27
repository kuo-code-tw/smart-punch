(function(g){
'use strict';
const KEY='port79_monthly_rest_overtime_v1',cats=['國','休','例'],esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// balance() receives the official cloud roster; idless annotations are not saved declarations.
const storedReport=r=>!!String(r?.id??'').trim();
const confirmedReport=(meta,report)=>{
 if(!storedReport(report)||meta?.overtimeExcluded===true)return false;
 return !(meta?.overtimeRevocations||[]).some(x=>
   x?.confirmed===true&&String(x.reportId)===String(report.id));
};
const hasActiveExtraReport=meta=>(Array.isArray(meta?.overtimeReports)?meta.overtimeReports:[]).some(r=>confirmedReport(meta,r));
const id=x=>String(x||'').trim().toUpperCase(),today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
// V2026-11-17: Current-month overtime preplanning uses employment status,
// rather than just permission scope. Never delete saved historical reports.
function monthlyPlanPeople(staff,snapshot,month){
 const master=new Map((snapshot?.employees||[]).map(e=>[id(e?.empId||e?.id),e]));
 const rosters=new Map((snapshot?.schedules||[]).map(r=>[id(r?.empId),r?.schedule||{}]));
 const current=today(),currentMonth=current.slice(0,7),target=String(month||currentMonth);
 const dateKey=x=>{
  const m=String(x||'').match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):'';
 };
 return (staff||[]).map(raw=>{
  const actual=master.get(id(raw?.empId||raw?.id))||{};
  return {...raw,empId:raw?.empId||raw?.id,
   employmentStatus:actual.employmentStatus??raw?.employmentStatus??raw?.employeeStatus??raw?.status??'',
   terminationDate:actual.terminationDate??raw?.terminationDate??'',
   lastWorkDate:actual.lastWorkDate??raw?.lastWorkDate??''};
 }).filter(emp=>{
  const status=String(emp.employmentStatus||'').trim().toLowerCase();
  const resigned=['resigned','terminated','inactive','離職','已離職'].includes(status);
  const onLeave=['leave','loa','留停','留職停薪'].includes(status);
  const last=dateKey(emp.lastWorkDate||emp.terminationDate);
  // Past-month historical review may include staff employed during that month.
  // Current preplanning excludes people who already left, or on unpaid leave.
  if(target<currentMonth)return !resigned||!last||target<=last.slice(0,7);
  if(resigned||onLeave||(last&&last<current))return false;
  const roster=rosters.get(id(emp.empId))||{};
  return !Object.keys(roster).some(d=>
   /^\d{4}-\d{2}-\d{2}$/.test(d)&&d<=current&&['離','離職'].includes(String(roster[d]||'').trim()));
 }).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'zh-Hant-u-co-stroke'));
}
function previousMonth(month){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return '';
 const year=Number(month.slice(0,4)),m=Number(month.slice(5,7));
 return (m===1?year-1:year)+'-'+String(m===1?12:m-1).padStart(2,'0');
}
function backfillContext(sourceMonth,asOf=today()){
 const handlingMonth=String(asOf).slice(0,7),historical=/^20\d{2}-(0[1-9]|1[0-2])$/.test(sourceMonth)&&sourceMonth<handlingMonth;
 return {sourceMonth,handlingMonth,historical,
  note:historical?'跨月補報（'+handlingMonth+'補報，原加班歸屬'+sourceMonth+'）':'每月未休假加班 '+sourceMonth};
}
// 有正式申報的本人「休」加班，即使有請假代班連結也必須算入休息日額度。
function ownRestCoverReport(meta,roster,date){
 const report=meta?.overtimeReport;
 return report?.category==='休'&&confirmedReport(meta,report)&&
   (meta?.restCategory==='休'||meta?.overtimeOriginalShift==='休'||
    meta?.restQuotaOvertime===true||String(roster?.[date]||'').trim()==='休');
}
// Shared by the schedule allocator and monthly ledger. A historical report's
// stored category does not override its verified typhoon/cover classification.
function restQuotaExemptDates(emp,roster,dates,snapshot=null){
 const R=g.P79OvertimeReason;
 return dates.filter(date=>{
  const meta=roster.__meta?.[date],report=meta?.overtimeReport;
  if(!confirmedReport(meta,report))return false;
  if(g.P79RestAttendance?.verifiedNoWork?.(snapshot,emp.empId,date)===true)return false;
  const reason=R?.classify?.({empId:emp.empId,date,meta,report,roster,snapshot});
  return reason?.exempt===true&&(reason.kind==='typhoon'||!ownRestCoverReport(meta,roster,date));
 });
}
// Election-day work follows the special-overtime workflow, not monthly
// unused-rest allocation. Use the same calendar as the schedule view.
function monthlyRestElectionDay(date){
 const special=g.P79SpecialOvertime;
 return special?.kindsForDate?.(date)?.some(x=>x.kind==='election')===true||
  special?.electionDates?.().includes(date)===true||
  /選舉|投票/.test(String(g.P79OfficialCalendar?.get?.(date)?.name||''));
}
// Only unequivocal, standalone monthly-rest preplans on special dates can
// be batch revoked. Never infer invalidity from attendance or quota alone.
function abnormalMonthlyRestPlans(snapshot,staff,month){
 const people=new Map((staff||[]).map(e=>[id(e.empId||e.id),e])),repair=[],review=[];
 for(const row of snapshot?.schedules||[]){
  const empId=id(row.empId),emp=people.get(empId);if(!emp||!row.schedule)continue;
  for(const [date,meta] of Object.entries(row.schedule.__meta||{})){
   const report=meta?.overtimeReport;
   if(!date.startsWith(month+'-')||!confirmedReport(meta,report)||!cats.includes(report?.category))continue;
   const reason=monthlyRestElectionDay(date)?'選舉日':g.P79SpecialOvertime?.kindsForDate?.(date)?.some(x=>x.kind==='typhoon')||String(row.schedule[date]||'').trim()==='颱'?'颱風日':'';
   if(!reason||! /每月未休假加班/.test(String(report.note||'')+' '+String(meta.note||''))||/^[選颱]/.test(String(report.code||'')))continue;
   const assigned=meta.overtimeAssignedShift&&row.schedule[date]===meta.overtimeAssignedShift;
   const original=String(meta.reportOriginalShift??meta.overtimeOriginalShift??(assigned?'':row.schedule[date])??'').trim();
   const linked=!!(meta.forEmpId||meta.coverAssignmentId||meta.type==='substitute'||report.forEmpId||report.leaveId||
     (snapshot.leaveCoverAssignments||[]).some(c=>date>=c.startDate&&date<=c.endDate&&(id(c.leaveEmpId)===empId||(c.workerIds||[]).some(w=>id(w)===empId))));
   const extra=Array.isArray(meta.overtimeReports)&&meta.overtimeReports.some(r=>r?.id!==report.id&&confirmedReport(meta,r));
   const item={empId,name:emp.name||row.name||empId,date,id:report.id,report,reason,original};
   if(report.planned!==true||linked||extra||!original||original==='待排班')review.push({...item,issue:report.planned!==true?'已正式申報':linked||extra?'有其他加班或代班連結':'原班別無法確認'});
   else repair.push(item);
  }
 }
 return {repair:repair.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'zh-Hant')),review};
}
function balance(emp,roster,month,snapshot=null,employmentStart=null){
 const quota=g.p79RestQuota(month),start=employmentStart??g.p79MonthlyRestContext.employmentStart(emp),end=Object.keys(roster).filter(d=>/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d)&&['離','離職'].includes(roster[d])).sort()[0]||'',dates=Array.from({length:quota.days},(_,i)=>month+'-'+String(i+1).padStart(2,'0')).filter(d=>(!start||d>=start)&&(!end||d<end));
 const counts={'例':0,'休':0,'國':0},off={...counts},reported={...counts},reserved={...counts},conflicts=[];
 quota.slots.filter(s=>(!start||s.sourceDate>=start)&&(!end||s.sourceDate<end)).forEach(s=>counts[s.category]++);
 if(dates.some(d=>!roster[d]))throw Error(emp.name+' 本月班表未排完整，請先補齊');
 // Typhoon is an independent schedule status, never a quota rest day or a
 // suggested 例／休／國 overtime day. Keep raw roster and saved reports intact.
 const declaredTyphoon=typeof g.p79TyphoonDates==='function'?g.p79TyphoonDates():(()=>{
   // Work-hours loads this shared module without the schedule page's helper.
   // Read the same browser-local typhoon markers so both pages exclude 颱 equally.
   try{const dates=JSON.parse(g.localStorage?.getItem('p79-manual-typhoon-days-v1')||'[]');
     return Array.isArray(dates)?dates.filter(x=>/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(x)):[];
   }catch(_){return [];}
 })();
 const typhoonProtected=new Set(dates.filter(d=>
   (Array.isArray(declaredTyphoon)&&declaredTyphoon.includes(d))||
   String(roster[d]||'').trim()==='颱'));
 const exemptReportDates=new Set(restQuotaExemptDates(emp,roster,dates,snapshot));
 const nonQuotaDates=new Set([...typhoonProtected,...exemptReportDates]);
 // Any 休/例/國 roster day with one complete IN/OUT pair is an actual attended day.
 // A short pair counts as attendance without inventing a full shift or approved overtime.
 // 只改統計歸屬，不將打卡直接視為已核准的加班；正式申報仍須人工確認。
 const partialNightDates=dates.filter(d=>
   snapshot?.attendanceEvidence?.nightSplitRestConfirmed?.[id(emp.empId)+'|'+d]);
 const partialNightSet=new Set(partialNightDates);
 const workedRestEvidence=new Set(dates.filter(d=>{
   if(partialNightSet.has(d)||!cats.includes(String(roster[d]||'').trim())||
      roster.__meta?.[d]?.overtimeReport)return false;
   const pairs=(snapshot?.pairs||[]).filter(p=>id(p.empId)===id(emp.empId)&&p.date===d&&p.start&&p.end);
   return pairs.length===1&&g.P79RestAttendance?.state(snapshot,emp.empId,d)==='worked';
 }));
 const excluded=dates.filter(d=>{
   if(workedRestEvidence.has(d))return true;
   if(partialNightSet.has(d))return false;
   if(nonQuotaDates.has(d)||g.P79RestAttendance?.isLeaveDay(snapshot,emp.empId,d,roster)||(snapshot?.leaveDates||[]).includes(id(emp.empId)+'|'+d))return true;
   // 代別人的班不等於自己請假；有正式本人休加不可從額度中剔除。
   return (snapshot?.leaveCoverAssignments||[]).some(a=>d>=a.startDate&&d<=a.endDate&&
      (id(a.leaveEmpId)===id(emp.empId)||
       (a.workerIds||[]).some(x=>id(x)===id(emp.empId))&&!ownRestCoverReport(roster.__meta?.[d],roster,d)));
 });
 // Only scheduled rest belongs in the holiday ledger; absence is not rest.
 const observedOffDates=partialNightDates;
 const allocated=g.p79AllocateRestMonth(roster,roster.__meta||{},month,excluded,start,end,
   [...nonQuotaDates],[...nonQuotaDates],observedOffDates,[...exemptReportDates],weeklyCycleAnchor(emp)).meta;
 const ledger=[],extraRestDates=[];
 for(const d of dates){const m=roster.__meta?.[d]||{},r=m.overtimeReport,allocation=allocated[d];
  const actual=g.P79RestAttendance?.state(snapshot,emp.empId,d)||'unknown';
  if(typhoonProtected.has(d)){ledger.push({date:d,kind:'typhoon',category:'',actual});continue;}
  if(exemptReportDates.has(d)){
   ledger.push({date:d,kind:'exemptOvertime',category:'',actual,reportId:r?.id});
   continue;
  }
  if(workedRestEvidence.has(d)){
   const restKind=cats.includes(m.restCategory)?m.restCategory:String(roster[d]||'').trim();
   ledger.push({date:d,kind:'workedRestUnreported',category:restKind,actual,
     statusNote:'排休日有完整打卡，未有正式申報；不得誤列已休或已報'});
   conflicts.push({date:d,reason:'排休日（原排'+restKind+'）有完整上下班打卡，已計出勤但尚未正式申報；需核對原排假別及加班性質'});
   continue;
  }
  const verified=cats.includes(r?.category)&&confirmedReport(m,r);
  const confirmedNoWork=confirmedReport(m,r)&&g.P79RestAttendance?.verifiedNoWork?.(snapshot,emp.empId,d)===true;
  const hasUnverifiedReport=cats.includes(r?.category)&&!verified&&r&&!storedReport(r);
  const scheduledRest=cats.includes(allocation?.restCategory)&&!allocation.restQuotaOvertime&&(!['早','中','晚'].includes(String(roster[d]||'').trim())||partialNightSet.has(d));
  const leave=g.P79RestAttendance?.isLeaveDay(snapshot,emp.empId,d,roster)||false;
  if(leave){
   ledger.push({date:d,kind:'leave',category:'',actual});
   if(verified&&!confirmedNoWork){reported[r.category]++;ledger.push({date:d,kind:'reported',category:r.category,actual,reportId:r.id});conflicts.push({date:d,reportId:r.id,reason:'請假日期與正式加班申報重疊，保留原申報供核對'});}
   if(confirmedNoWork)conflicts.push({date:d,reportId:r.id,reason:'已核實請假日沒有實際出勤，不計加班；原申報待管理員正式取消'});
   continue;
  }
  // A confirmed, cross-source absence audit overrides even an old cloud report.
  // Account as a rest day and exclude this report's quota/time WITHOUT erasing
  // the historical report. Formal cancellation remains an authorized action.
  if(confirmedNoWork){
   const original=String(roster[d]||'').trim();
   // Match the actual calendar: only an originally saved bare 例/休/國
   // retains that category; a night/overtime code without work shows 休.
   const designated=g.P79PlannedRestReconciliation?.originalCategory?.(roster,d,m);
   const restKind=r.planned===true&&cats.includes(designated)?designated:cats.includes(original)?original:'休';
   off[restKind]++;
   ledger.push({date:d,kind:'off',category:restKind,actual:'rest',reportId:r.id,
     statusNote:'已核實整班無卡；加班不計，原申報待正式取消'});
   conflicts.push({date:d,reportId:r.id,reason:'已核實整班無卡，當日按休息計算；原正式加班申報待取消'});
   continue;
  }
  // Cloud-confirmed preplans reserve one official quota day without treating
  // future or incomplete attendance as earned overtime.
  if(verified&&r.planned===true){
   if(monthlyRestElectionDay(d)&&/每月未休假加班/.test(String(r.note||'')+' '+String(m.note||''))&&!/^選/.test(String(r.code||'')))conflicts.push({date:d,reportId:r.id,reason:'選舉日已有一般未休假加班預排，請核對並改由選舉日加班流程處理；保留原紀錄待確認'});
   reserved[r.category]++;
   ledger.push({date:d,kind:'reportedPendingAttendance',category:r.category,actual,reportId:r.id,
     statusNote:actual==='worked'?'預排已有出勤，待正式申報':'正式預排已占額度，待考勤核對'});
   if(actual==='missing')conflicts.push({date:d,reportId:r.id,reason:'正式預排已有額度，單邊缺卡待核'});
   continue;
  }
  // Only a non-revoked cloud report ID proves a formal overtime report.
  // Legacy overtime/restQuotaOvertime flags do not prove a pending report or reserve quota.
  // 有報單但仍缺完整出勤，先保留唯一額度為待核對，絕不能重報同一天。
  if(verified&&r.category==='休'&&actual==='rest'){
   reserved.休++;
   ledger.push({date:d,kind:'reportedPendingAttendance',category:r.category,actual,reportId:r.id,
     statusNote:'已申報但未核對到完整出勤；保留原申報、待核對'});
   conflicts.push({date:d,reportId:r.id,reason:'已有正式申報編號但尚無完整打卡；不得重報，請核對打卡與班表'});
   continue;
  }
  if(verified&&actual!=='rest'){
   reported[r.category]++;
   const stalePlanned=r.planned===true&&d<today();
   ledger.push({date:d,kind:'reported',category:r.category,actual,reportId:r.id,
     statusNote:stalePlanned&&actual!=='worked'?'已申報；原預排旗標待核對出勤':''});
   if(actual==='missing')conflicts.push({date:d,reportId:r.id,reason:'單邊缺卡，已申報但出勤待核對'});
   if(stalePlanned&&actual!=='worked')conflicts.push({date:d,reportId:r.id,reason:'已有正式申報但尚未核對完整出勤；原預排旗標待核，不得重報'});
  }else{
   if(hasUnverifiedReport&&actual!=='rest'){
    ledger.push({date:d,kind:'unconfirmed',category:r.category,actual});
    conflicts.push({date:d,reason:'加班註記缺少正式申報編號，未列入已申報或待確認額度；請核對雲端紀錄'});
   }
   // A complete explicit time assignment without a report ID is only a roster
   // note, not evidence of an approved or queued leave-overtime declaration.
   const datedAssignment=m.overtime===true&&m.overtimeType==='rest'&&
     /^([01]\d|2[0-3]):[0-5]\d$/.test(String(m.overtimeStart||''))&&
     /^([01]\d|2[0-3]):[0-5]\d$/.test(String(m.overtimeEnd||''));
   if(!verified&&!storedReport(r)&&!hasUnverifiedReport&&datedAssignment&&actual!=='rest'){
    ledger.push({date:d,kind:'unconfirmedAssignment',category:'',actual});
    conflicts.push({date:d,reason:'班表有人工加班時段但無正式申報編號；未當成已申報或預留額度，請核對'});
   }
   // Keep the shared roster allocation authoritative. Attendance alone cannot
   // turn an allocated rest day into an extra, unreported overtime entitlement;
   // a confirmed report above replaces that allocation exactly once.
   if(scheduledRest){
    const kind=d>today()||actual==='open'||actual==='missing'||actual==='unknown'&&snapshot?.attendanceEvidence?.complete===true?'reserved':'off';
    (kind==='reserved'?reserved:off)[allocation.restCategory]++;
    ledger.push({date:d,kind,category:allocation.restCategory,actual});
   }else if(actual==='rest'&&!storedReport(r)&&['早','中','晚'].includes(String(roster[d]||'').trim())){
    ledger.push({date:d,kind:'absencePending',category:'',actual,statusNote:'正常工作日無上下班紀錄，缺勤／待核，不作休假'});
   }
   if(verified&&actual==='rest')conflicts.push({date:d,reportId:r.id,reason:'整班無卡暫按休假分類，原申報待核對，不可直接認定實際出勤'});
  }
 }
 // Supplement the shared schedule allocation with actual, non-leave no-card days.
 for(const c of ['例','休','國']){const n=Math.min(extraRestDates.length,Math.max(0,counts[c]-off[c]-reserved[c]-reported[c]));for(const date of extraRestDates.splice(0,n)){off[c]++;ledger.push({date,kind:'off',category:c,actual:'rest'});}}
 for(const date of extraRestDates)ledger.push({date,kind:'excessRest',category:'',actual:'rest'});
 for(const c of cats){const excess=off[c]+reported[c]+reserved[c]-counts[c];if(excess>0)conflicts.push({date:'',reason:c+'已休、預排休與已申報合計超出額度'+excess+'天，請核對既有申報或排休'});}
 const remaining=Object.fromEntries(cats.map(c=>[c,Math.max(0,counts[c]-off[c]-reported[c]-reserved[c])]));
 const unused=Object.fromEntries(cats.map(c=>[c,Math.max(0,counts[c]-off[c]-reserved[c])]));
 // Distinguish saved plans and pending evidence from verified formal filings.
 const formalReported=Object.fromEntries(cats.map(c=>[c,ledger.filter(x=>x.category===c&&x.kind==='reported'&&roster.__meta?.[x.date]?.overtimeReport?.planned!==true).length]));
 return {quota:counts,off,reported,formalReported,reserved,unused,remaining,dates,typhoonDates:[...typhoonProtected],conflicts,ledger:ledger.sort((a,b)=>a.date.localeCompare(b.date))};
}

 // 未休假加班只接受申報時數與時段均為 8 小時的正式規則。
function fullDayRule(r){
 if(!r||Number(r[2])!==8)return false;
 const minute=x=>{const m=String(x??'').match(/^(\d{1,2})(?::(\d{2}))?$/);if(!m)return NaN;const h=Number(m[1]),n=Number(m[2]||0);return h<=24&&n<60&&(h!==24||n===0)?h*60+n:NaN;};
 const a=minute(r[6]),b=minute(r[7]);return Number.isFinite(a)&&Number.isFinite(b)&&(b-a+1440)%1440===480;
}
function fullDayEvidence(snapshot,empId,date,pair){
 if(snapshot?.attendanceEvidence?.complete!==true||
  g.P79RestAttendance?.state(snapshot,empId,date)!=='worked'||
  !pair||pair.pairingIssue||pair.start==null||pair.end==null)return false;
 const at=x=>typeof x==='number'?x:Date.parse(x),start=at(pair.start),end=at(pair.end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end-start<8*3600000||end-start>18*3600000)return false;
 const net=[pair.workedMinutes,pair.actualWorkMinutes,pair.netWorkMinutes].find(x=>x!==undefined&&x!==null&&x!=='');
 return net===undefined||(Number.isFinite(Number(net))&&Number(net)>=480);
}
// 已經有正式申報後，只允許該員工後續的新日期，不能月末往前補。
function latestReportedDate(roster,month){
 let last='';
 for(const [date,meta] of Object.entries(roster?.__meta||{})){
  const report=meta?.overtimeReport;
  if(date.startsWith(month+'-')&&cats.includes(report?.category)&&confirmedReport(meta,report)&&
   report.planned!==true&&!/取消|撤銷|作廢/.test(String(report.status||''))&&
   !/^颱/.test(String(report.code||''))&&date>last)last=date;
 }
 return last;
}
// Continue current-month filing after the last active formal rest-overtime
// report. Explicit prior-month audit remains a separate workflow.
// Only an explicit operator cutoff establishes batch progress.
function validReportCutoff(month,cutoff,asOf=today()){
 const value=String(cutoff||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!value.startsWith(month+'-')||value>asOf)return '';
 const ms=Date.parse(value+'T00:00:00Z');
 return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value?value:'';
}
function forwardReportStart(month,cutoff='',asOf=today()){
 const date=validReportCutoff(month,cutoff,asOf);
 return date?new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10):month+'-01';
}
// Future suggestions begin today; actual worked dates retain their original week/date.
function monthEndWindowDate(month,asOf=today()){
 const date=String(asOf||today()).slice(0,10);
 return month===date.slice(0,7)?date:month+'-01';
}
// 只提供參考預警；法定七日週期必須採勞雇已約定的起點，不能擅自以每月一日重算。

/* A legal seven-day cycle is continuous across months and must be explicitly agreed.
   Unknown anchors are a reference-only Sunday week, never permission to auto-plan. */
function weeklyCycleAnchor(emp){
 const context=g.p79MonthlyRestContext;
 const source=context?.weeklyCycleStart;
 const configured=typeof source==='function'?source(emp):source;
 // Preserve explicitly agreed employee cycles; the company-wide default
 // is supplied by the host only after the administrator confirms it.
 const raw=String(emp?.weeklyCycleStart||emp?.restCycleStart||emp?.workWeekStart||configured||context?.defaultWeeklyCycleStart||'').slice(0,10);
 return /^\d{4}-\d{2}-\d{2}$/.test(raw)&&Number.isFinite(Date.parse(raw+'T00:00:00Z'))?raw:'';
}
function weeklyCycleWindow(date,anchor=''){
 const day=Date.parse(String(date)+'T00:00:00Z');
 if(!Number.isFinite(day))return null;
 const base=anchor?Date.parse(anchor+'T00:00:00Z'):day-new Date(day).getUTCDay()*86400000;
 const shared=typeof g.p79RestWeekStart==='function'?g.p79RestWeekStart(date,anchor):'';
 const start=shared?Date.parse(shared+'T00:00:00Z'):base+Math.floor((day-base)/604800000)*604800000;
 const iso=ms=>new Date(ms).toISOString().slice(0,10);
 return {start:iso(start),end:iso(start+6*86400000),confirmed:!!anchor};
}
function weeklyReviewSummary(snapshot,people,month,plannedRows=[]){
 const rosters=new Map((snapshot?.schedules||[]).map(x=>[id(x.empId),x.schedule]));
 const picked=new Set(people.map(x=>id(x.empId))),groups=new Map();
 for(const emp of people){
  const currentRoster=rosters.get(id(emp.empId));
  if(!currentRoster)continue;
  const roster=weeklyRoster(snapshot,emp.empId,currentRoster);
  const anchor=weeklyCycleAnchor(emp),seen=new Set();
  for(const date of Object.keys(currentRoster).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&d.startsWith(month+'-')).sort()){
   const week=weeklyCycleWindow(date,anchor);
   if(!week||seen.has(week.start))continue;
   seen.add(week.start);
   const key=week.start+'|'+(anchor?'confirmed':'reference');
   if(!groups.has(key))groups.set(key,{start:week.start,end:week.end,confirmed:week.confirmed,people:new Set(),regular:0,rest:0,holiday:0,planned:0,missing:0,uncertain:0});
   const group=groups.get(key);
   group.people.add(id(emp.empId));
   for(let i=0;i<7;i++){
    const day=new Date(Date.parse(week.start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10);
    const category=originalRestDesignation(roster,day);
    if(protectedRegularRest(roster,day,snapshot,emp.empId))group.regular++;
    if(category==='休')group.rest++;
    if(category==='國')group.holiday++;
    if(!String(roster[day]||'').trim())group.uncertain++;
   }
   if(!anchor||weeklyPlanIssue(roster,week.start,anchor,snapshot,emp.empId))group.missing++;
  }
 }
 for(const row of plannedRows||[]){
  if(!picked.has(id(row.empId)))continue;
  const emp=people.find(e=>id(e.empId)===id(row.empId));
  const w=weeklyCycleWindow(row.date,weeklyCycleAnchor(emp));if(!w)continue;
  const group=groups.get(w.start+'|'+(w.confirmed?'confirmed':'reference'));
  if(group)group.planned++;
 }
 return [...groups.values()].sort((a,b)=>a.start.localeCompare(b.start)||Number(b.confirmed)-Number(a.confirmed));
}
// An officially saved allocation can designate an existing off-day as 例.
// A display-only allocation or a working shift cannot establish that designation.
function originalRestDesignation(roster,date){
 const code=String(roster?.[date]||'').trim(),m=roster?.__meta?.[date]||{};
 const manual=String(m.manualRosterShift||'').trim();
 const marked=m.restCategoryLocked===true||m.restAllocationLocked===true||m.restAllocationSource==='manual'||m.restQuotaOvertime===true;
 if(code==='休'&&['例','國'].includes(manual))return manual;
 if(m.restAllocationSource==='auto-v1'&&m.restQuotaOvertime===false&&
    m.restSegmentSource!=='night-split-v1'&&['例','休'].includes(m.restCategory)&&
    (code==='休'||code==='國'&&!g.p79RestQuota(date.slice(0,7)).slots.some(slot=>slot.category==='國')))return m.restCategory;
 if(code==='休'&&manual==='休')return manual;
 if(code==='休'&&marked&&['例','休','國'].includes(m.restCategory))return m.restCategory;
 return /^(例|休|國)(?=$|[0-9])/.exec(code)?.[1]||'';
}
function automaticRestCategory(roster,date,month){
 const original=String(roster?.[date]||'').trim(),meta=roster?.__meta?.[date]||{};
 const marked=cats.includes(meta.restCategory)?meta.restCategory:'';
 const category=originalRestDesignation(roster,date)||marked;
 if(!category)return '';
 if(category==='國'){
  const sources=new Set(g.p79RestQuota(month).slots.filter(x=>x.category==='國').map(x=>x.sourceDate));
  if(!sources.has(date)&&!(meta.restSourceDate&&sources.has(meta.restSourceDate)&&meta.restCategoryLocked===true))return '';
 }
 return category;
}
// A documented rest category is sufficient to propose a new plan. Requiring
// restQuotaOvertime before creating that very plan makes the workflow circular.
// A plain working shift is still NOT a holiday, nor is an auto-allocation hint.
function documentedFutureRestCategory(roster,date,month,category){
 if(!['休','國'].includes(category)||automaticRestCategory(roster,date,month)!==category)return false;
 const code=String(roster?.[date]||'').trim(),m=roster?.__meta?.[date]||{};
 return originalRestDesignation(roster,date)===category||(['早','中','晚'].includes(code)&&m.restCategory===category&&
  (m.restQuotaOvertime===true||m.restCategoryLocked===true||m.restAllocationLocked===true||m.restAllocationSource==='manual'));
}
// Adjacent months are used only for weekly validation and shift inference;
// monthly quota and write payloads remain scoped to the selected month.
function weeklyRoster(snapshot,empId,roster){
 const merged={...roster,__meta:{...roster?.__meta}};
 for(const row of snapshot?.adjacentSchedules||[]){
  if(id(row.empId)!==id(empId))continue;
  for(const [d,code] of Object.entries(row.schedule||{})){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||Object.prototype.hasOwnProperty.call(merged,d))continue;
   merged[d]=code;
   if(row.schedule.__meta?.[d])merged.__meta[d]=row.schedule.__meta[d];
  }
 }
 return merged;
}
// Rest-day overtime retains its scheduled rest-day designation. Requiring
// a SECOND rest day after overtime wrongly prohibits the first rest-day plan.
// An actual protected regular holiday is still required; incomplete weeks
// are never silently assumed to be complete.
function protectedRegularRest(roster,date,snapshot,empId){
 const m=roster.__meta?.[date]||{},code=String(roster[date]||'').trim();
 if(originalRestDesignation(roster,date)!=='例'||/\d/.test(code)||m.overtimeReport||
    m.overtimeReports?.length||m.overtime||m.restQuotaOvertime||m.forEmpId||
    m.coverAssignmentId||m.type==='substitute')return false;
 if(!snapshot)return true;
 const attendance=g.P79RestAttendance?.state(snapshot,empId,date);
 if(attendance==='worked'||attendance==='missing'||
    g.P79RestAttendance?.isLeaveDay(snapshot,empId,date,roster))return false;
 return !(snapshot?.leaveCoverAssignments||[]).some(a=>date>=a.startDate&&date<=a.endDate&&
   (a.workerIds||[]).some(worker=>id(worker)===id(empId)));
}
function weeklyPlanIssue(roster,date,anchor,snapshot,empId){
 const week=weeklyCycleWindow(date,anchor);
 if(!week)return '無法計算七日週期';
 const label='（'+week.start+'～'+week.end+'）';
 let regular=0,rest=0;
 for(let i=0;i<7;i++){
  const d=new Date(Date.parse(week.start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10);
  if(!roster[d])return '缺少正式班表 '+d+label;
  const m=roster.__meta?.[d]||{},report=m.overtimeReport;
  const original=String(m.overtimeOriginalShift||'').trim();
  const marked=m.restCategoryLocked===true||m.restAllocationLocked===true||m.restAllocationSource==='manual'||m.restQuotaOvertime===true;
  const designation=originalRestDesignation(roster,d);
  if(protectedRegularRest(roster,d,snapshot,empId))regular++;
  if(designation!=='例'&&(designation==='休'||original==='休'||report?.category==='休'||marked&&m.restCategory==='休'))rest++;
 }
 if(!regular)return '七日週期無受保護的例假'+label;
 if(!rest)return '七日週期無原排休息日'+label;
 return '';
}
// A future ordinary shift can be explicitly designated as a rest-day plan
// on cloud save, without requiring the designation to exist beforehand.
function canDesignateFutureRest(roster,date,month,category){
 if(monthlyRestElectionDay(date))return false;
 if(documentedFutureRestCategory(roster,date,month,category))return true;
 return category==='休'&&['早','中','晚'].includes(String(roster?.[date]||'').trim())&&!automaticRestCategory(roster,date,month)&&!originalRestDesignation(roster,date);
}
// Weekly roster audit is separate from eligibility to reserve a future plan.
function futureRestEligibilityIssue(roster,date,month,emp,category,snapshot){
 if(monthlyRestElectionDay(date))return '選舉日須走特殊加班流程，不得預排一般未休假加班';
 const m=roster?.__meta?.[date]||{};
 if(!['休','國'].includes(category))return '例假不得自動預排加班';
 if(!canDesignateFutureRest(roster,date,month,category))return '既有假別不符或無可配對班別，不能覆蓋原假別';
 if(emp?.flexibleWorkHours===true||emp?.workTimeSystem&& !['standard','normal','一般','一般工時','固定'].includes(String(emp.workTimeSystem).trim()))return '特殊工時制度須另行核對';
 if(m.forEmpId||m.coverAssignmentId||m.overtimeReport||m.overtime||m.overtimeExcluded)return '已有申報、代班或排除紀錄';
 return '';
}
function futureRestPlanIssue(roster,date,month,emp,category,snapshot){
 const issue=futureRestEligibilityIssue(roster,date,month,emp,category,snapshot);
 if(issue)return issue;
 const m=roster?.__meta?.[date]||{},anchor=weeklyCycleAnchor(emp);
 if(!anchor)return '未設定約定七日週期';
 const proposed=category==='休'&&!documentedFutureRestCategory(roster,date,month,category)?
  {...roster,__meta:{...roster.__meta,[date]:{...m,restCategory:'休',restCategoryLocked:true}}}:roster;
 return weeklyPlanIssue(proposed,date,anchor,snapshot,emp.empId);
}
function canAutoSuggestFuture(roster,date,month,emp,category,snapshot){
 if(futureRestEligibilityIssue(roster,date,month,emp,category,snapshot))return false;
 return !!rosterRestPeriod(roster,date,true);
}

function weeklyRestReview(roster,month,cycleStart='',snapshot,empId){
 const anchor=/^\d{4}-\d{2}-\d{2}$/.test(String(cycleStart))?cycleStart:'';
 const days=Object.keys(roster||{}).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort(),groups=new Map();
 const ms=d=>Date.parse(d+'T00:00:00+08:00');
 for(const date of days){
  if(!date.startsWith(month+'-'))continue;
  // 無週期起點時，只按週日至週六提供非法律結論的參考預警。
  const base=anchor?ms(anchor):ms(date)-new Date(ms(date)+8*3600000).getUTCDay()*86400000;
  const cycle=Math.floor((ms(date)-base)/604800000),key=new Date(base+cycle*604800000+8*3600000).toISOString().slice(0,10);
  if(!groups.has(key))groups.set(key,{start:key,days:[],regular:0,rest:0});
  const week=groups.get(key);
  week.days.push(date);
  if(protectedRegularRest(roster,date,snapshot,empId))week.regular++;
  if(originalRestDesignation(roster,date)==='休')week.rest++;
 }
 return [...groups.values()].filter(w=>w.days.length===7&&(!w.regular||!w.rest))
  .map(w=>({start:w.start,regular:w.regular,rest:w.rest,confirmedCycle:!!anchor}));
}
// 未來加班預排不能佔用仍缺「一例一休」的完整排班週期。
// 未設定約定週期時，以週日至週六做保守預排參考，不作法定合規結論。
function futureWeekRestProtected(roster,date,cycleStart=''){
 const ms=d=>Date.parse(d+'T00:00:00+08:00'),start=ms(date);
 if(!Number.isFinite(start))return false;
 const anchor=/^\d{4}-\d{2}-\d{2}$/.test(String(cycleStart))?ms(cycleStart):
  start-new Date(start+8*3600000).getUTCDay()*86400000;
 const weekStart=anchor+Math.floor((start-anchor)/604800000)*604800000;
 let regular=0,rest=0;
 for(let i=0;i<7;i++){
  const d=new Date(weekStart+i*86400000+8*3600000).toISOString().slice(0,10);
  if(!Object.prototype.hasOwnProperty.call(roster,d))return false;
  const code=String(roster[d]||'').trim();
  if(code==='例')regular++;if(code==='休')rest++;
 }
 return regular>=1&&rest>=1;
}
// One official shift resolver shared by reference, planning and rule matching.
function restPeriodMinute(value){
 const m=String(value??'').trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
 if(!m)return NaN;
 const h=Number(m[1]),n=Number(m[2]||0);
 return h<=24&&n<60&&(h!==24||n===0)?(h*60+n)%1440:NaN;
}
function restPeriodMatches(a,b){
 return !!a&&!!b&&a.length===2&&b.length===2&&a.every((x,i)=>Number.isFinite(restPeriodMinute(x))&&restPeriodMinute(x)===restPeriodMinute(b[i]));
}
function rosterRestPeriod(roster,date,allowNeighbors=false){
 const code=String(roster?.[date]||'').trim(),m=roster?.__meta?.[date]||{};
 const ranges={早:['08','16'],中:['16','24'],晚:['24','08']};
 const valid=p=>p&&Number.isFinite(restPeriodMinute(p[0]))&&Number.isFinite(restPeriodMinute(p[1]))&&(restPeriodMinute(p[1])-restPeriodMinute(p[0])+1440)%1440===480;
 if(ranges[code])return {period:ranges[code],source:'原班表'+code+'班'};
 const timed=code.match(/^[休國例]\s*(\d{1,2}(?::\d{2})?)\s*[-–—～]\s*(\d{1,2}(?::\d{2})?)$/);
 if(timed&&valid(timed.slice(1)))return {period:timed.slice(1),source:'原班表已保存加班時段'};
 if(valid([m.overtimeStart,m.overtimeEnd]))return {period:[m.overtimeStart,m.overtimeEnd],source:'原班表註記時段'};
 const saved=[m.overtimeAssignedShift,m.reportOriginalShift,m.overtimeOriginalShift,m.leaveOriginalShift].map(x=>String(x||'').trim()).filter(x=>ranges[x]);
 const unique=[...new Set(saved)];
 if(unique.length===1)return {period:ranges[unique[0]],source:'已保存原班別'+unique[0]+'班'};
 if(unique.length>1)return null; // conflicting same-day records are not inferred
 if(allowNeighbors&&['休','國'].includes(code)){
  const days=Object.keys(roster||{}).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&ranges[roster[d]]).sort();
  const prior=days.filter(d=>d<date).at(-1),next=days.find(d=>d>date);
  if(prior&&next&&roster[prior]===roster[next])return {period:ranges[roster[prior]],source:'前後班表同為'+roster[prior]+'班（推估）'};
 }
 return null;
}
function ruleFor(date,roster,pair,category,rules){
 const allowed=rules.filter(r=>r[0]===category&&fullDayRule(r));
 if(pair){const found=g.P79Overtime.inferRule(pair.start,pair.end,date,allowed,category);return found||null;}
 const resolved=rosterRestPeriod(roster,date,true);
 return resolved?allowed.find(r=>restPeriodMatches(resolved.period,[r[6],r[7]]))||null:null;
}
const filingPriority=typeof g.p79RestCategoryPriority==='function'?g.p79RestCategoryPriority():['例','休','國'];
function sortRows(rows){
 const rank=r=>r.saved?2:(!r.planned&&r.status==='可申報'?0:1);
 return rows.sort((a,b)=>rank(a)-rank(b)||String(a.date).localeCompare(String(b.date))||filingPriority.indexOf(a.category)-filingPriority.indexOf(b.category)||String(a.name).localeCompare(String(b.name),'zh-Hant-u-co-stroke')||id(a.empId).localeCompare(id(b.empId)));
}
// 例／休／國只採用既有排班與雲端申報規則；不自造時數或申報紀錄。
function workflowStage(month,asOf=today()){
 const current=String(asOf||'').slice(0,7);
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month>current)return {key:'audit',label:'每日盤點',canSubmit:false,canSuggest:false,tip:'尚未到該月份，只核對班表及已存資料。'};
 if(month<current)return {key:'closing',label:'原日期出勤複核',canSubmit:true,canSuggest:true,tip:'僅核實原日期已發生的8小時工作，不得捏造補班或移動加班日期。'};
 return {key:'submit',label:'實際出勤核對申報',canSubmit:true,canSuggest:true,tip:'已核實8小時出勤可依原日期申報；未來日期只可預排。'};
}
function workflowAudit(model){
 const result={shortage:{例:0,休:0,國:0},people:[],blocked:[],checked:0,complete:0,verified:model.rows.filter(r=>!r.planned&&r.status==='可申報').length,planned:(model.plannedRows||[]).length};
 for(const b of model.balances){
  const progress=reportProgress(model,b.emp.empId),parts=[];
  for(const cat of ['例','休','國'])if(progress[cat].remaining>0){result.shortage[cat]+=progress[cat].remaining;parts.push(cat+progress[cat].remaining);}
  result.checked++;
  if(!parts.length)result.complete++;
  // Completed employees remain in aggregate counts, but the actionable
  // audit list only shows unresolved quotas. Conflicts are listed separately.
  if(parts.length)result.people.push(b.emp.name+'：待核對 '+parts.join('／')+
   '｜已休 例'+b.off.例+'／休'+b.off.休+'／國'+b.off.國+
   '｜正式加班 例'+b.reported.例+'／休'+b.reported.休+'／國'+b.reported.國+
   '｜出勤待核 例'+b.reserved.例+'／休'+b.reserved.休+'／國'+b.reserved.國);
  for(const item of b.conflicts||[])result.blocked.push(b.emp.name+' '+(item.date||'')+'：'+item.reason);
 }
 return result;
}
function plan(snapshot,people,month,rules,options={}){
 const workflow=workflowStage(month),rows=[],plannedRows=[],balances=[],issues=[],unavailable=[],states=[],reviewNotes=Object.create(null),rosters=new Map((snapshot.schedules||[]).map(r=>[id(r.empId),r.schedule])),pairsByKey=new Map();
 for(const pair of snapshot.pairs||[]){const key=id(pair.empId)+'|'+pair.date;if(!pairsByKey.has(key))pairsByKey.set(key,[]);pairsByKey.get(key).push(pair);}
 const leaveDates=new Set(snapshot.leaveDates||[]),currentDate=today(),historical=backfillContext(month,currentDate).historical;
 for(const emp of monthlyPlanPeople(people,snapshot,month)){
  const roster=rosters.get(id(emp.empId));
  if(!roster){
   const start=String(g.p79MonthlyRestContext?.employmentStart?.(emp)||'').slice(0,10);
   const monthEnd=month+'-'+String(g.p79RestQuota(month).days).padStart(2,'0');
   if(start&&start>monthEnd)continue; // 尚未到職不應列「缺本月班表」。
   issues.push(emp.name+' 沒有本月班表');unavailable.push({emp,reason:'沒有本月班表'});continue;
  }
  let b;try{b=balance(emp,roster,month,snapshot)}catch(e){issues.push(e.message);unavailable.push({emp,reason:String(e.message||'班表不完整')});continue;}
  const lastReported=latestReportedDate(roster,month),nextReportDate=forwardReportStart(month,options.cutoff,currentDate);
  balances.push({emp,...b,lastReported,nextReportDate});
  b.conflicts.forEach(x=>issues.push(emp.name+' '+x.date+'：'+x.reason));
  const cycleStart=weeklyCycleAnchor(emp),weekRoster=weeklyRoster(snapshot,emp.empId,roster);
  const restIssues=weeklyRestReview(weekRoster,month,cycleStart,snapshot,emp.empId);
  for(const week of restIssues)issues.push(emp.name+' 週期起點 '+week.start+'：'+
   (week.confirmedCycle?'約定週期':'暫以週日為起點預覽')+
   ' 例假'+week.regular+'日、休息日'+week.rest+'日；請先核對原排班，勿用加班申報補足休假');
  const candidates=[],notes=[];
  const manualRefs=!historical?rosterPeriodReferences(snapshot,emp,{...b,nextReportDate},month,rules,currentDate).filter(r=>r.eligible):[];
  const manualRuleByDate=new Map(manualRefs.map(ref=>[ref.date,rules.find(r=>r[0]===ref.category&&fullDayRule(r)&&restPeriodMatches([r[6],r[7]],ref.period.split(' – ')))]));
  reviewNotes[id(emp.empId)]=notes;
  const blocked=(date,category,reason)=>{if(b.remaining[category]>0)notes.push({date,category,reason});};
  if(!workflow.canSuggest){states.push({emp,b,candidates,used:new Set(),weeklyPlanned:new Set(),remaining:{...b.remaining}});continue;}
  for(const date of b.dates){
   const m=roster.__meta?.[date]||{};
   if(date<nextReportDate)continue; // Earlier unresolved attendance stays in the audit ledger.
   if(monthlyRestElectionDay(date))continue; // Special election-day overtime is not a monthly rest candidate.
   if((b.typhoonDates||[]).includes(date)||!(['早','中','晚','國','休','例'].includes(roster[date])||/^[休國例]\s*\d/.test(String(roster[date]||'')))||m.overtimeReport||hasActiveExtraReport(m)||m.overtime||m.forEmpId||m.coverAssignmentId||m.overtimeExcluded||leaveDates.has(id(emp.empId)+'|'+date)||g.P79RestAttendance?.isLeaveDay(snapshot,emp.empId,date,roster))continue;
   const originalCategory=automaticRestCategory(roster,date,month)||
    (!historical&&date>currentDate&&canDesignateFutureRest(roster,date,month,'休')?'休':'');
   if(!originalCategory){
    if(date>=currentDate&&['早','中','晚'].includes(roster[date]))for(const category of ['休','國'])blocked(date,category,'原排'+roster[date]+'班，沒有已確認的'+category+'假別');
    continue;
   }
   const pairs=pairsByKey.get(id(emp.empId)+'|'+date)||[];
   const verified=date<=currentDate&&pairs.length===1&&fullDayEvidence(snapshot,emp.empId,date,pairs[0]);
   // 預排從今天一路看到月底；今天尚在班內可列預排建議，已結束且沒有打卡不可假裝出勤。
   // 未來日期不要求先有打卡，否則全員只能看到「今天」而漏掉月底預排。
   const todayState=g.P79RestAttendance?.state(snapshot,emp.empId,date);
   const todayPending=!historical&&date===currentDate&&!verified&&
     ['open','missing'].includes(todayState)&&canAutoSuggestFuture(weekRoster,date,month,emp,originalCategory,snapshot);
   const upcoming=!historical&&date>currentDate&&!pairs.length&&
     (canAutoSuggestFuture(weekRoster,date,month,emp,originalCategory,snapshot)||!!manualRuleByDate.get(date));
   if(!verified&&!todayPending&&!upcoming){
    if(date<currentDate||historical)blocked(date,originalCategory,pairs.length>1?'出勤配對重複':pairs.length?'出勤未核實完整8小時':'無完整出勤配對');
    else if(date===currentDate&&!['open','missing'].includes(todayState))blocked(date,originalCategory,'當日出勤狀態未符合預排');
    else blocked(date,originalCategory,futureRestPlanIssue(weekRoster,date,month,emp,originalCategory,snapshot)||'未找到原班表的8小時時段，且前後班別不一致或不足以推估');
    continue;
   }
   // Earlier weeks are eligible only with genuine completed attendance, never synthetic backfill.
   if(!verified&&date<currentDate)continue;
   const pair=verified?pairs[0]:null,byCategory=new Map();
   // 有正式班表的例／休／國只能保留原假別；未來預排不擅自把休假日轉成上班。
   const categoryOptions=[originalCategory];
   for(const category of categoryOptions){const manualRule=manualRuleByDate.get(date);
    const rule=ruleFor(date,pair?roster:weekRoster,pair,category,rules)||(!pair&&manualRule?.[0]===category?manualRule:null);if(rule)byCategory.set(category,rule);}
   if(!byCategory.size)blocked(date,originalCategory,'無相符的正式8小時加班時段');
   if(byCategory.size){
    const restProtected=!!pair||!futureRestPlanIssue(weekRoster,date,month,emp,originalCategory,snapshot);
    if(!pair&&futureRestEligibilityIssue(weekRoster,date,month,emp,originalCategory,snapshot))continue;
    candidates.push({date,pair,byCategory,restProtected,week:weeklyCycleWindow(date,cycleStart)?.start||''});
   }
  }
  states.push({emp,b,candidates,used:new Set(),weeklyPlanned:new Set(),remaining:{...b.remaining}});
 }
 // Spend monthly quota only after the complete balance has reserved existing
 // and future roster rest. Prefer verified original dates over all drafts.
 // Within each employee's agreed seven-day cycle, first spread each category
 // over different weeks, then fill remaining capacity from genuine dates.
 // An unknown cycle is only a Sunday-based ordering reference, not legal approval.
 for(const planned of (historical||options.manualOnly===true?[false]:[false,true])){
  for(const category of filingPriority){
   for(const spread of [true,false]){
    // Prefer spreading across weeks; the second pass can allocate the remaining quota.
    while(true){
     const byDate=new Map();
     for(const state of states){
      if(!state.remaining[category])continue;
      const anchor=weeklyCycleAnchor(state.emp);
      const occupied=new Set((state.b.ledger||[]).filter(x=>x.category===category&&['off','reserved','reported','reportedPendingAttendance'].includes(x.kind)).map(x=>weeklyCycleWindow(x.date,anchor)?.start).filter(Boolean));
      const available=state.candidates.filter(c=>!state.used.has(c.date)&&(!c.pair)===planned&&c.byCategory.has(category)&&
       (!spread||(!occupied.has(c.week)||planned&&category==='休')&&!state.weeklyPlanned.has(c.week+'|'+category)));
      for(const candidate of available){
       if(!byDate.has(candidate.date))byDate.set(candidate.date,[]);
       byDate.get(candidate.date).push({state,candidate});
      }
     }
     if(!byDate.size)break;
     const [date,group]=[...byDate].sort((a,b)=>a[0].localeCompare(b[0])||b[1].length-a[1].length)[0];
     for(const {state,candidate} of group){
      const rule=candidate.byCategory.get(category);
      (planned?plannedRows:rows).push({id:crypto.randomUUID(),empId:state.emp.empId,name:state.emp.name,date,category,rule:rule.slice(),checked:false,
       status:planned?(candidate.restProtected?'預排建議（未申報）':'預排建議｜例休週期待核（未申報）'):'可申報',
       needsWeeklyReview:planned&&!candidate.restProtected,planned});
      if(planned&&!candidate.restProtected)issues.push(state.emp.name+' '+date+'：預排建議有原排例休週期待核，僅預留額度，不代表已核准出勤或正式加班');
      state.used.add(date);state.weeklyPlanned.add(candidate.week+'|'+category);state.remaining[category]--;
     }
    }
   }
  }
 }
 if(workflow.canSuggest)for(const state of states)for(const category of cats)for(let n=0;n<state.remaining[category];n++)issues.push(state.emp.name+'「'+category+'」仍有1天尚未確認休假或實際8小時工作；只接受原日期出勤證據，不補造加班');
 const unfilled=states.map(state=>({empId:state.emp.empId,name:state.emp.name,remaining:{...state.remaining}}));
 // Manual mode is still read-only: offer the same guarded future candidates
 // without selecting, saving, decrementing quota, or changing the formal model.
 const rosterReferences=Object.create(null);
 for(const state of states)if(cats.some(k=>state.b.remaining[k]>0))rosterReferences[id(state.emp.empId)]=rosterPeriodReferences(snapshot,state.emp,{...state.b,nextReportDate:forwardReportStart(month,options.cutoff,currentDate)},month,rules,currentDate);
 const previewRows=[];
 if(options.manualOnly===true&&!historical&&snapshot?.attendanceEvidence?.complete===true){
  for(const state of states){
   const used=new Set(state.used),weeks=new Set(state.weeklyPlanned||[]),remaining={...state.remaining};
   for(const category of cats){
    const available=state.candidates.filter(c=>!c.pair&&c.byCategory.has(category)).sort((a,b)=>a.date.localeCompare(b.date));
    for(const candidate of available){
     if(!(remaining[category]>0))break;
     if(used.has(candidate.date))continue;
     previewRows.push({empId:state.emp.empId,date:candidate.date,category,rule:candidate.byCategory.get(category).slice(),planned:true,previewOnly:true});
     used.add(candidate.date);weeks.add(candidate.week+'|'+category);remaining[category]--;
    }
   }
  }
 }
 return {rows:sortRows(rows),plannedRows:sortRows(plannedRows),balances,issues,unavailable,unfilled,workflow,previewRows,reviewNotes,rosterReferences};
}
// Read-only view of records with a real saved report ID. Already filed dates
// are excluded from the new-candidate model but MUST remain visible here.
function existingRestOvertimeRows(snapshot,staff,month){
 const people=new Map((staff||[]).map(emp=>[id(emp.empId||emp.id),emp]));
 const result=[],seen=new Set();
 for(const row of snapshot?.schedules||[]){
  const empId=id(row?.empId);
  if(!empId||!row?.schedule||row.month&&String(row.month)!==month)continue;
  const emp=people.get(empId)||{},personnel=row.schedule.__personnel||{};
  const role=String(personnel.role||row.role||emp.jobTitle||emp.deptDetail||emp.role||'未設定');
  const name=String(emp.name||row.name||row.employeeName||empId);
  for(const [date,meta] of Object.entries(row.schedule.__meta||{})){
   if(!date.startsWith(month+'-')||!meta||typeof meta!=='object')continue;
   const current=meta.overtimeReport;
   for(const report of [current,...(Array.isArray(meta.overtimeReports)?meta.overtimeReports:[])]){
    const reportId=String(report?.id??'').trim();
    if(!reportId||!cats.includes(report?.category))continue;
    const key=empId+'|'+date+'|'+reportId;
    if(seen.has(key))continue;seen.add(key);
    const cancelled=meta.overtimeExcluded===true||
     (meta.overtimeRevocations||[]).some(x=>x?.confirmed===true&&String(x.reportId)===reportId);
    const historical=!!current?.id&&String(current.id)!==reportId;
    const source=String(meta.note||report.note||'');
    const typhoon=/^颱/.test(String(report.code||''))||/颱風/.test(source);
    const status=cancelled?'已取消':historical?'歷史版本（非目前有效申報）':
     report.planned===true?(date<today()?'預排出勤待核':'預排待出勤'):String(report.status||'申報狀態待核對');
    result.push({empId,name,role,date,category:report.category,
     code:String(report.code||''),reportId,status,cancelled,historical,
     typhoon,source,monthlyRest:/每月未休假加班/.test(source)});
   }
  }
 }
 return result.sort((a,b)=>a.date.localeCompare(b.date)||
  a.role.localeCompare(b.role,'zh-Hant')||a.name.localeCompare(b.name,'zh-Hant')||
  a.reportId.localeCompare(b.reportId));
}
// Automatic, full-roster reconciliation of the PREVIOUSLY SAVED month's rest
// allocation, overtime flags and declarations. It never creates a report.
function automaticSupplementReviewRows(snapshot,staff,month,model){
 const rosters=new Map((snapshot?.schedules||[])
  .filter(r=>r?.schedule&&(!r.month||String(r.month)===month))
  .map(r=>[id(r.empId),r]));
 const balances=new Map((model?.balances||[]).map(b=>[id(b.emp.empId),b]));
 const unavailable=new Map((model?.unavailable||[]).map(x=>[id(x.emp.empId),x.reason]));
 const ready=new Map();
 for(const r of model?.rows||[]){
  if(r.planned||r.saved)continue;
  const k=id(r.empId);ready.set(k,(ready.get(k)||0)+1);
 }
 return (staff||[]).filter(e=>e?.empId||e?.id).map(emp=>{
  const empId=id(emp.empId||emp.id),row=rosters.get(empId),b=balances.get(empId);
  const person=row?.schedule?.__personnel||{};
  const role=String(person.role||row?.role||emp.jobTitle||emp.deptDetail||emp.role||'未設定');
  const stats={autoRest:0,tagged:0,confirmed:0,pending:0,noReport:0,revoked:0};
  if(row){
   for(const [date,meta] of Object.entries(row.schedule.__meta||{})){
    if(!date.startsWith(month+'-')||!meta||typeof meta!=='object')continue;
    if(meta.restAllocationSource==='auto-v1'&&meta.restQuotaOvertime!==true)stats.autoRest++;
    const r=meta.overtimeReport,reportId=String(r?.id||'').trim();
    const revoked=meta.overtimeExcluded===true||
      (meta.overtimeRevocations||[]).some(x=>x?.confirmed===true&&String(x.reportId)===reportId);
    if(meta.restQuotaOvertime===true){
     stats.tagged++;
     if(!reportId||revoked)stats.noReport++;
    }
    if(!reportId||!cats.includes(r?.category))continue;
    if(revoked){stats.revoked++;continue;}
    // A saved ID is not evidence of completed attendance. Planned/unverified
    // declarations are tracked separately from verified declarations.
    if(r.planned===true||r.status!=='已核對出勤')stats.pending++;
    else stats.confirmed++;
   }
  }
  const remaining=b?.remaining||{};
  const gap=cats.reduce((sum,c)=>sum+(Number(remaining[c])||0),0);
  const suggestions=ready.get(empId)||0;
  const missing=!row||!b;
  const blocked=unavailable.get(empId)||(!row?'歷史月份沒有班表':'班表／額度無法完整核對');
  const unverified=snapshot?.provisional===true||
    snapshot?.readOnlyDueAttendance===true||
    snapshot?.attendanceEvidence?.complete!==true;
  let state;
  if(missing)state='資料未齊：'+blocked;
  else if(stats.noReport)state='有未休加班註記但缺正式申報編號';
  else if(unverified)state='既有記錄可查，考勤／歷史來源仍待核對';
  else if(stats.pending)state='既有申報尚待核實出勤';
  else if(suggestions)state='已自動比對到可申報日期（尚未正式申報）';
  else if(gap>0)state='尚有未休缺額，未取得可申報的完整8小時證據';
  else state='已配休／已報額度目前無缺額';
  return {empId,name:String(emp.name||row?.name||empId),role,
    company:String(emp.companyName||emp.company||''),dept:String(emp.dept||emp.department||''),
    group:String(person.group||emp.groupName||emp.group||''),...stats,
    remaining:gap,ready:suggestions,state,missing,unverified};
 }).sort((a,b)=>a.company.localeCompare(b.company,'zh-Hant')||
  a.dept.localeCompare(b.dept,'zh-Hant')||a.group.localeCompare(b.group,'zh-Hant')||
  a.role.localeCompare(b.role,'zh-Hant')||a.name.localeCompare(b.name,'zh-Hant'));
}
// 與正式申報候選分開：未休假盤點必須保留全員、所有職稱及排班缺漏，
 // 不因當天沒有8小時打卡或已過月末候選窗口就把 F/L 等職稱隱藏。
// Explicit operator-selected future rest overtime, with fresh source guards.
function manualRestPlanIssue(snapshot,emp,month,date,rule,asOf=today(),cutoff=''){
 if(monthlyRestElectionDay(date))return '選舉日請使用特殊加班申報，不得建立每月未休假加班預排';
 if(!emp||snapshot?.provisional===true||snapshot?.readOnlyDueAttendance===true||snapshot?.attendanceEvidence?.complete!==true)return '正式班表或考勤尚未完整核對，不能儲存預排';
 if(month!==asOf.slice(0,7)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!date.startsWith(month+'-')||date<asOf)return '預排限本月今天至月底，不得補造過去出勤';
 if(!['休','國'].includes(rule?.[0])||!fullDayRule(rule))return '預排僅接受有缺額的休息日／國定假日正式8小時規則；例假須另循例外程序';
 const person=monthlyPlanPeople([emp],snapshot,month)[0];
 if(!person)return '人員已離職、留停或非本月適用人員';
 const roster=snapshot.schedules?.find(r=>id(r.empId)===id(emp.empId))?.schedule;
 if(!roster)return '缺少正式班表';
 const category=rule[0],meta=roster.__meta?.[date]||{};
 if(date<forwardReportStart(month,cutoff,asOf))return '早於你設定的本次申報起日';
 if(!canDesignateFutureRest(roster,date,month,category)||date===asOf&&!documentedFutureRestCategory(roster,date,month,category))return '既有假別不符或不是可配休的未來班別';
 if(meta.overtimeReport||hasActiveExtraReport(meta)||meta.overtime||meta.forEmpId||meta.coverAssignmentId||meta.overtimeExcluded)return '已有加班、代班或排除紀錄，不得重複預排';
 if((snapshot.leaveDates||[]).includes(id(emp.empId)+'|'+date)||g.P79RestAttendance?.isLeaveDay(snapshot,emp.empId,date,roster))return '該日已有請假，不得重複預排';
 if((snapshot.pairs||[]).some(p=>id(p.empId)===id(emp.empId)&&p.date===date))return '該日已有打卡，請由實際出勤核對流程處理';
 if(date===asOf&&!['open','missing'].includes(g.P79RestAttendance?.state(snapshot,emp.empId,date)))return '當日出勤狀態不適合新增預排';
 // Missing weekly-cycle data remains an audit warning, not a reservation gate.
 if(person.flexibleWorkHours===true||person.workTimeSystem&&!['standard','normal','一般','一般工時','固定'].includes(String(person.workTimeSystem).trim()))return '特殊工時制度須另行核對';
 const eligibilityIssue=futureRestEligibilityIssue(weeklyRoster(snapshot,emp.empId,roster),date,month,person,category,snapshot);
 if(eligibilityIssue)return eligibilityIssue;
 let b;try{b=balance(person,roster,month,snapshot);}catch(e){return String(e.message||e);}
 if(!b.dates.includes(date)||b.typhoonDates.includes(date)||!(b.remaining[category]>0))return '該日不在可用額度或本月已無此假別缺額';
 return '';
}
// Read-only roster references are deliberately separate from formal candidates.
 // Missing overtime metadata must not hide the employee's known working shift.
function rosterPeriodReferences(snapshot,emp,b,month,rules,asOf=today()){
 if(month!==asOf.slice(0,7)||snapshot?.provisional===true||snapshot?.readOnlyDueAttendance===true||snapshot?.attendanceEvidence?.complete!==true)return [];
 const roster=snapshot.schedules?.find(r=>id(r.empId)===id(emp.empId))?.schedule;
 if(!roster||!b)return [];
 const shifts={早:['08:00','16:00'],中:['16:00','24:00'],晚:['24:00','08:00']};
 const minute=x=>{const m=String(x||'').match(/^(\d{1,2})(?::(\d{2}))?$/);return m?Number(m[1])*60+Number(m[2]||0):NaN;};
 const days=(b.dates||[]).slice().sort(),out=[],weekRoster=weeklyRoster(snapshot,emp.empId,roster);
 const shiftDays=Object.keys(weekRoster).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
 const employee=id(emp.empId),blocked=new Set(snapshot.leaveDates||[]);
 const pairsByDate=new Map();
 for(const p of snapshot.pairs||[])if(id(p.empId)===employee){
  if(!pairsByDate.has(p.date))pairsByDate.set(p.date,[]);
  pairsByDate.get(p.date).push(p);
 }
 const from=b.nextReportDate||month+'-01';
 // When an operator chooses a cutoff, consider actual completed work from
 // the following day, not only shifts after today's date.
 const explicitRange=from>month+'-01';
 const permitted=day=>{const m=roster.__meta?.[day]||{},pairs=pairsByDate.get(day)||[];
  const actual=day<=asOf&&explicitRange&&pairs.length===1&&fullDayEvidence(snapshot,emp.empId,day,pairs[0]);
  return day>=from&&(actual||day>asOf&&!pairs.length)&&day.startsWith(month+'-')&&
  !monthlyRestElectionDay(day)&&!(b.typhoonDates||[]).includes(day)&&!m.overtimeReport&&!hasActiveExtraReport(m)&&!m.overtime&&!m.forEmpId&&!m.coverAssignmentId&&!m.overtimeExcluded&&
  !blocked.has(employee+'|'+day)&&!g.P79RestAttendance?.isLeaveDay(snapshot,emp.empId,day,roster);};
 for(const date of days.filter(permitted)){
  const original=String(roster[date]||'').trim(),m=roster.__meta?.[date]||{};
  const originalCategory=automaticRestCategory(roster,date,month);
  if(date<=asOf){
   const pair=pairsByDate.get(date)[0];
   // Reference only: a complete ordinary workday is not proof of rest-day
   // overtime. The formal model still requires original category and quota.
   if(!shifts[original]&&!originalCategory)continue;
   for(const category of ['休','國']){
    if(!(b.remaining[category]>0)||originalCategory&&originalCategory!==category)continue;
    const rule=ruleFor(date,roster,pair,category,rules);
    if(!rule||!fullDayRule(rule))continue;
    if(g.P79Overtime.ruleAttendanceIssue?.(pair.start,pair.end,date,rule,roster))continue;
    out.push({date,category,period:String(rule[1]),note:originalCategory?'已核對完整出勤；正式申報資格仍待核對':'已核對完整出勤；原排正常班，須核對假別後才能正式申報',referenceOnly:true,eligible:false,actualReference:true,rank:originalCategory?1:2});
   }
   continue;
  }
  const resolved=rosterRestPeriod(weekRoster,date,true),period=resolved?.period,source=resolved?.source||'';
  if(!period)continue;
  for(const category of ['休','國']){
   if(!(b.remaining[category]>0)||originalCategory&&originalCategory!==category)continue;
   const rule=rules.find(r=>r[0]===category&&fullDayRule(r)&&restPeriodMatches([r[6],r[7]],period));
   const documented=canDesignateFutureRest(roster,date,month,category);
   const issue=!documented?'既有假別不符或無可配對班別':!rule?'沒有對應的正式8小時規則':manualRestPlanIssue(snapshot,emp,month,date,rule,asOf);
   // A consistent neighboring shift is a suggested future period only. The
    // operator's batch confirmation may select it; fresh quota/weekly guards
    // above still apply, and it must never be treated as actual attendance.
    const eligible=!!rule&&documented&&!issue;
   const note=eligible?source+'；可勾選批次預排（未正式申報）':source+'；'+(issue||'班別尚需確認')+'，不可直接申報';
   out.push({date,category,period:period.map(v=>String(v).includes(':')?String(v):String(v).padStart(2,'0')+':00').join(' – '),note,referenceOnly:true,eligible,issue,rank:eligible?0:originalCategory===category?1:2});
  }
 }
 return out.sort((a,b)=>Number(!!b.actualReference)-Number(!!a.actualReference)||a.rank-b.rank||a.date.localeCompare(b.date));
}
// Exact date/person/category/period matching: display references cannot
// manufacture a payable candidate or silently move the selected date.
function selectedRestCandidateKey(r){
 const raw=String(r?.rule?.[1]||r?.period||'').trim();
 const match=raw.match(/(\d{1,2})(?::(\d{2}))?\s*[-–—～]\s*(\d{1,2})(?::(\d{2}))?\s*$/);
 if(!match)return '';
 const period=[restPeriodMinute(match[1]+':'+(match[2]||'00')),restPeriodMinute(match[3]+':'+(match[4]||'00'))];
 if(!period.every(Number.isFinite))return '';
 const canonical=period.join(':');
 return [id(r.empId),r.date,r.category,canonical].join('|');
}
function matchSelectedRestCandidates(requested,candidates){
 const keys=new Set(requested.map(selectedRestCandidateKey).filter(Boolean));
 const matched=candidates.filter(r=>!r.saved&&keys.has(selectedRestCandidateKey(r)));
 const found=new Set(matched.map(selectedRestCandidateKey));
 return {matched,unmatched:requested.filter(r=>!found.has(selectedRestCandidateKey(r)))};
}
// Re-plan unmatched unsaved requests against the freshly calculated month's
// eligible candidates. Exact matches win; alternatives never change employee
// or leave category, never reuse a date, and never move an uncertain write.
function rematchSelectedRestCandidates(requested,candidates,blocked=()=>false){
 const pool=candidates.filter(r=>!r.saved&&selectedRestCandidateKey(r));
 const identity=r=>id(r.empId)+'|'+r.date;
 const used=new Set(),matched=[],unmatched=[],reassigned=[],deferred=[];
 for(const request of requested){
  if(blocked(request)){unmatched.push(request);continue;}
  const exact=pool.find(r=>!used.has(identity(r))&&selectedRestCandidateKey(r)===selectedRestCandidateKey(request));
  if(exact){used.add(identity(exact));matched.push(exact);}
  else deferred.push(request);
 }
 for(const request of deferred){
  if(request.attempted||request.acknowledged){unmatched.push(request);continue;}
  const alternatives=pool.filter(r=>!used.has(identity(r))&&id(r.empId)===id(request.empId)&&r.category===request.category)
   .sort((a,b)=>a.date.localeCompare(b.date));
  const replacement=alternatives[0];
  if(!replacement){unmatched.push(request);continue;}
  used.add(identity(replacement));matched.push(replacement);
  reassigned.push({from:request,to:replacement});
 }
 return {matched,unmatched,reassigned};
}
function personPeriodSuggestions(model,empId,asOf=today()){
 const key=id(empId),balanceRow=model?.balances?.find(b=>id(b.emp.empId)===key);
 if(!balanceRow)return {suggestions:[],reason:'缺少正式班表，無法建議日期'};
 const progress=reportProgress(model,empId);
 const remaining=Object.fromEntries(cats.map(c=>[c,progress[c].remaining]));
 const used=new Set((model.rows||[]).filter(r=>id(r.empId)===key&&r.saved).map(r=>r.date)),suggestions=[];
 const add=(r,planned)=>{
  if(id(r.empId)!==key||r.saved||r.date<(balanceRow.nextReportDate||'')||!(remaining[r.category]>0)||used.has(r.date)||!r.rule||!fullDayRule(r.rule))return;
  if(!planned&&r.status!=='可申報')return;
  suggestions.push({date:r.date,category:r.category,period:r.rule[1],planned,
   note:planned?'預排建議，尚未出勤':model.workflow?.canSubmit?'已核實出勤，待申報':'已核實出勤，尚未開放申報'});
  remaining[r.category]--;used.add(r.date);
 };
 for(const r of model.rows||[])add(r,false);
 for(const r of model.plannedRows||[])add(r,true);
 for(const r of model.previewRows||[])add(r,true);
 const references=[],referenceCounts={};
 for(const ref of model.rosterReferences?.[key]||[]){
  if(ref.date<(balanceRow.nextReportDate||'')||!(remaining[ref.category]>0)||used.has(ref.date))continue;
  if(ref.eligible!==true){
   if((referenceCounts[ref.category]||0)>=remaining[ref.category])continue;
   referenceCounts[ref.category]=(referenceCounts[ref.category]||0)+1;
  }else remaining[ref.category]--;
  references.push(ref);used.add(ref.date);
 }
 const left=cats.filter(c=>remaining[c]>0);
 const notes=(model.reviewNotes?.[key]||[]).filter(n=>left.includes(n.category));
 const unique=[...new Map(notes.map(n=>[n.category+'|'+n.reason,n])).values()].sort((a,b)=>Number(b.date>=asOf)-Number(a.date>=asOf)||b.date.localeCompare(a.date));
 const reason=left.length?'仍缺 '+left.map(c=>c+remaining[c]+'天').join('／')+'；'+(unique.length?unique.slice(0,3).map(n=>n.date.slice(5)+' '+n.category+'：'+n.reason).join('；'):'未找到符合原假別及正式8小時條件的日期，請核對原班表與考勤'):'';
 return {suggestions:[...suggestions,...references],lastReported:balanceRow.lastReported||'',nextReportDate:balanceRow.nextReportDate||'',reason:[references.some(r=>!r.eligible)?'班表參考時段尚未取得申報資格，不能直接儲存為正式加班。':'',reason].filter(Boolean).join('；')};
}
function rosterReviewRows(model,staff){
 const balances=new Map((model?.balances||[]).map(b=>[id(b.emp.empId),b]));
 const unavailable=new Map((model?.unavailable||[]).map(b=>[id(b.emp.empId),b.reason]));
 return (staff||[]).map(emp=>{
  const key=id(emp.empId),b=balances.get(key),role=String(emp.jobTitle||emp.deptDetail||'未設定'),isFL=/F\s*[\/／]\s*L/i.test(role);
  if(!b)return unavailable.has(key)?{emp,role,isFL,missing:true,reason:unavailable.get(key),remaining:{例:0,休:0,國:0},eligible:0,unreported:0,pending:0}:null;
  const progress=reportProgress(model,emp.empId);
  const remaining=Object.fromEntries(cats.map(c=>[c,progress[c].remaining]));
  const due=cats.reduce((n,c)=>n+remaining[c],0);
  const unreported=(b.ledger||[]).filter(x=>x.kind==='workedRestUnreported').length;
  const pending=(b.ledger||[]).filter(x=>x.kind==='reportedPendingAttendance').length;
  if(!due&&!unreported&&!pending)return null;
  const eligible=(model.rows||[]).filter(r=>id(r.empId)===key&&!r.saved&&!r.planned).length;
  const planned=(model.plannedRows||[]).filter(r=>id(r.empId)===key).length;
  return {emp,role,isFL,missing:false,remaining,eligible,planned,unreported,pending};
 }).filter(Boolean).sort((a,b)=>
   String(a.emp.companyName||a.emp.company||a.emp.companyId||'').localeCompare(String(b.emp.companyName||b.emp.company||b.emp.companyId||''),'zh-Hant')||
   String(a.emp.dept||a.emp.department||'').localeCompare(String(b.emp.dept||b.emp.department||''),'zh-Hant')||
   String(a.emp.groupName||a.emp.group||a.emp.teamName||'').localeCompare(String(b.emp.groupName||b.emp.group||b.emp.teamName||''),'zh-Hant')||
   String(a.role).localeCompare(String(b.role),'zh-Hant')||
   String(a.emp.name).localeCompare(String(b.emp.name),'zh-Hant'));
}
function reviewAllUnits(model,staff){
 const balances=new Map((model?.balances||[]).map(b=>[id(b.emp.empId),b]));
 const unavailable=new Map((model?.unavailable||[]).map(x=>[id(x.emp.empId),x.reason]));
 const open=rosterReviewRows(model,staff),openById=new Map(open.map(x=>[id(x.emp.empId),x]));
 const eligibleById=new Map();
 for(const r of model?.rows||[]){
  if(r.saved||r.planned)continue;
  const key=id(r.empId);eligibleById.set(key,(eligibleById.get(key)||0)+1);
 }
 const plannedById=new Map();
 for(const r of model?.plannedRows||[]){
  const key=id(r.empId);plannedById.set(key,(plannedById.get(key)||0)+1);
 }
 const units=new Map(),seen=new Set(),duplicateIds=[];
 let counted=0;
 for(const emp of staff||[]){
  const empId=id(emp.empId);
  if(!empId){duplicateIds.push('缺少員工編號：'+String(emp.name||''));continue;}
  if(seen.has(empId)){duplicateIds.push('重複員工編號：'+empId);continue;}
  seen.add(empId);
  // Exclude employees not yet employed during the audited month, as plan() does.
  if(!balances.has(empId)&&!unavailable.has(empId))continue;
  counted++;
  const company=String(emp.companyName||emp.company||emp.companyId||'未標示公司').trim();
  const dept=String(emp.dept||emp.department||'未標示單位').trim();
  const group=String(emp.groupName||emp.group||emp.teamName||'未標示組別').trim();
  const role=String(emp.jobTitle||emp.deptDetail||'未設定職稱').trim();
  const key=JSON.stringify([company,dept,group,role]);
  if(!units.has(key))units.set(key,{company,dept,group,role,staff:0,reviewed:0,missing:0,completed:0,outstanding:0,ready:0,planned:0,pending:0});
  const unit=units.get(key),item=openById.get(empId);
  unit.staff++;unit.reviewed++;
  if(unavailable.has(empId))unit.missing++;
  else if(item)unit.outstanding++;
  else unit.completed++;
  unit.ready+=eligibleById.get(empId)||0;
  unit.planned+=plannedById.get(empId)||0;
  if(item)unit.pending+=item.unreported+item.pending;
 }
 const groups=[...units.values()].sort((a,b)=>[a.company,a.dept,a.group,a.role].join('|').localeCompare([b.company,b.dept,b.group,b.role].join('|'),'zh-Hant'));
 return {staffCount:counted,groupCount:groups.length,missing:groups.reduce((n,u)=>n+u.missing,0),
  outstanding:groups.reduce((n,u)=>n+u.outstanding,0),ready:groups.reduce((n,u)=>n+u.ready,0),
  planned:groups.reduce((n,u)=>n+u.planned,0),completed:groups.reduce((n,u)=>n+u.completed,0),groups,duplicateIds};
}
// A checked employee is only a hand-picked candidate; the existing report
// form still requires an explicit date/shift and cloud-confirmed save.
function manualPlanSelectable(x,month,asOf=today()){
 const remaining=x?.remaining||{},last=month+'-'+String(g.p79RestQuota(month).days).padStart(2,'0');
 return !!x&&!x.missing&&month===String(asOf).slice(0,7)&&last>=asOf&&
   cats.some(c=>Number(remaining[c])>0);
}
function reportProgress(model,empId=null){
 const result=Object.fromEntries(cats.map(c=>[c,{remaining:0,selected:0,saved:0,savedPlans:0,after:0,over:0}]));
 for(const b of model.balances.filter(b=>empId==null||id(b.emp.empId)===id(empId)))for(const c of cats){
  const rows=(model.rows||[]).filter(r=>id(r.empId)===id(b.emp.empId)&&r.category===c&&!r.planned),saved=rows.filter(r=>r.saved).length,selected=rows.filter(r=>r.checked&&!r.saved).length;
  // A read-back-confirmed plan consumes quota immediately, even before the
  // refreshed snapshot contains it. Once the ledger contains its ID, do not count it twice.
  const ledgerIds=new Set((b.ledger||[]).map(x=>String(x.reportId||'')).filter(Boolean));
  const savedPlans=new Set((model.plannedRows||[]).filter(r=>id(r.empId)===id(b.emp.empId)&&r.category===c&&r.saved===true&&r.id&&!ledgerIds.has(String(r.id))).map(r=>String(r.id))).size;
  const remaining=Math.max(0,(Number(b.remaining?.[c])||0)-saved-savedPlans),t=result[c];
  t.remaining+=remaining;t.selected+=selected;t.saved+=saved;t.savedPlans+=savedPlans;t.after+=Math.max(0,remaining-selected);t.over+=Math.max(0,selected-remaining);
 }
 return result;
}
// Display the complete quota already occupied by the official roster/ledger,
// not just overtime declarations. Existing reserved dates are already included
// in remaining; only a confirmed new save can consume an additional day.
function personQuotaProgress(model,empId){
 const b=model?.balances?.find(b=>id(b.emp.empId)===id(empId));
 if(!b)return null;
 const p=reportProgress(model,empId);
 return Object.fromEntries(['例','休','國'].map(c=>{
  const count=value=>Math.max(0,Number(value)||0);
  const confirmed=count((b.formalReported||b.reported)?.[c])+p[c].saved;
  const used=count(b.off?.[c])+count(b.reported?.[c])+count(b.reserved?.[c])+p[c].saved+p[c].savedPlans;
  const selected=Math.min(p[c].remaining,p[c].selected);
  return [c,{used,confirmed,remaining:p[c].remaining,selected,afterUsed:used+selected,afterConfirmed:confirmed+selected,afterRemaining:p[c].after,previewAllowed:!model.quotaPreviewSuppressed}];
 }));
}
function quotaProgressText(progress){
 if(!progress)return '尚無法計算';
 return ['例','休','國'].map(c=>c+progress[c].used+'/'+progress[c].remaining).join('／');
}
function personSummary(model,empId){
 const b=model.balances.find(b=>id(b.emp.empId)===id(empId));if(!b)return '';
 const p=reportProgress(model,empId);
 return ['例','休','國'].map(c=>c+p[c].remaining).join('／');
}
function auditText(model,empId){
 const b=model.balances.find(b=>id(b.emp.empId)===id(empId));if(!b)return '';
 const p=reportProgress(model,empId),label={off:'已休',reserved:'預排休',reservedOvertime:'未確認安排（不扣額度）',reported:'正式申報',exemptOvertime:'颱風／純代班加班（不計例休國額度）',reportedPendingAttendance:'已申報／出勤待核對（預留額度）',workedRestUnreported:'休息日有出勤但尚未申報（需核對）',unconfirmed:'缺少申報編號（不扣額度）',unconfirmedAssignment:'人工加班時段待核（不扣額度）',typhoon:'颱風日（不計額度）',leave:'請假（不扣例／休／國）',absencePending:'工作日無卡・缺勤／待核（不扣休假）',excessRest:'額度以外無卡休息'};
 const lines=[b.emp.name+'｜逐日額度核對',personSummary(model,empId)];
 for(const c of ['例','休','國'])lines.push(c+'：應休 '+b.quota[c]+'－已休 '+b.off[c]+'－預排休 '+b.reserved[c]+'－既有申報 '+b.reported[c]+'－本次已成功 '+p[c].saved+'＝未報 '+p[c].remaining+'；勾選 '+p[c].selected+'，報後 '+p[c].after);
 lines.push('',...(b.ledger||[]).map(x=>x.date+' '+(x.category||'')+' '+label[x.kind]+
   (x.actual==='rest'&&x.kind==='off'?'（整班無卡）':'')+
   (x.statusNote?'（'+x.statusNote+'）':'')));
 lines.push(...model.rows.filter(r=>id(r.empId)===id(empId)&&(r.saved||r.checked)).map(r=>r.date+' '+r.category+' '+(r.saved?'本次已核對成功':'本次勾選，尚未申報')));
 if(b.conflicts.length)lines.push('','需核對：',...b.conflicts.map(x=>(x.date?x.date+' ':'')+x.reason));
 return lines.join('\n');
}
function styles(){if(document.getElementById('p79MonthlyRestStyle'))return;const el=document.createElement('style');el.id='p79MonthlyRestStyle';el.textContent=`#p79MonthlyRest{width:min(1080px,calc(100vw - 24px));max-height:90dvh;padding:0;border:0;border-radius:14px;color:#0f172a;background:#fff;box-shadow:0 20px 80px #0005;font:14px sans-serif}#p79MonthlyRest::backdrop{background:#0f172a88}#p79MonthlyRest header,#p79MonthlyRest footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;background:#f1f5f9}#p79MonthlyRest footer{flex-wrap:wrap}#p79MonthlyRest #mrResult{flex:1;min-width:150px;font-weight:700;color:#0369a1}#p79MonthlyRest .body{padding:12px 16px;overflow:auto;max-height:calc(90dvh - 120px)}#p79MonthlyRest .filters{display:flex;gap:8px;flex-wrap:wrap;align-items:end}#p79MonthlyRest label{display:flex;flex-direction:column;gap:4px;font-size:12px}#p79MonthlyRest input,#p79MonthlyRest select{border:1px solid #cbd5e1;padding:6px;border-radius:7px;background:white;color:#0f172a;max-width:100%}#p79MonthlyRest button{padding:7px 12px;border:0;border-radius:8px;background:#e2e8f0;color:#0f172a;cursor:pointer}#p79MonthlyRest button.primary{background:#0369a1;color:white}#p79MonthlyRest button:disabled{opacity:.5;cursor:wait}#p79MonthlyRest table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:12px}#p79MonthlyRest th,#p79MonthlyRest td{padding:7px 5px;border-bottom:1px solid #e2e8f0;text-align:center}#p79MonthlyRest .scroll{overflow:auto;margin-top:10px}#p79MonthlyRest .國{background:#fef3c7;color:#92400e}#p79MonthlyRest .休{background:#dbeafe;color:#1e40af}#p79MonthlyRest .例{background:#fee2e2;color:#991b1b}#p79MonthlyRest td.person{white-space:nowrap;min-width:170px}#p79MonthlyRest .person-progress{display:inline-block;padding:0;background:transparent;font-size:12px;color:#0369a1;white-space:nowrap}#p79MonthlyRest #mrPlanningModes{position:sticky;top:0;z-index:3;background:#eef2ff!important}#p79MonthlyRest #mrPlanningModes label{flex-direction:row;align-items:center;font-weight:700;cursor:pointer}#p79MonthlyRest input[type=checkbox]{appearance:auto!important;pointer-events:auto!important;width:24px!important;height:24px!important;min-height:24px!important;cursor:pointer;accent-color:#0369a1}#p79MonthlyRest #mrStatus{white-space:pre-line;line-height:1.6;margin:10px 0;color:#475569}#p79MonthlyRest .mr-compact-stats{margin:10px 0;padding:11px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;color:#334155;font-size:13px;font-weight:700;line-height:1.7}#p79MonthlyRest .filters{gap:10px}#p79MonthlyRest #mrPlanningModes{gap:14px!important;flex-wrap:wrap}#p79MonthlyRest #mrPlannedSection>.scroll{margin-top:4px}`;document.head.appendChild(el);}
// Visual-only simplification. Preserve every existing ID, input, source,
// handler, approval restriction and save guard. This is NOT auto-submission.
// Presentation-only layout: all existing source IDs, handlers, formal
// verification gates and cloud readback are retained verbatim.
function simplifyMonthlyRestLayout(el,settings={}){
 const body=el.querySelector('.body'),filters=el.querySelector('.filters');
 if(!body||!filters||el.querySelector('#mrSimpleOverview'))return;
 const mk=(tag,id,summary)=>{
  const node=document.createElement(tag);
  node.id=id;node.className='mr-simple-panel';
  if(summary)node.innerHTML='<summary>'+summary+'</summary>';
  return node;
 };
 const intro=mk('div','mrSimpleIntro');
 intro.textContent='選月份及人員 → 查詢 → 勾選已核實出勤 → 確認申報';
 body.insertBefore(intro,filters);
 // Keep every filter visible; changing department/job/person remains a local
 // filter, and the official secure month query is still the original #mrLoad.
 const load=el.querySelector('#mrLoad');
 if(load)load.textContent='查詢未休假加班';
 const prior=el.querySelector('#mrPrior');
 const month=el.querySelector('#mrMonth');
 if(month)month.closest('label')?.classList.add('mr-month-filter');
 filters.classList.add('mr-simple-filters');
 const status=el.querySelector('#mrStatus');
 if(status)filters.after(status);
 const summary=mk('section','mrSimpleOverview');
 summary.innerHTML='<div><span id="mrSimpleReadyLabel">本月可申報</span><strong id="mrSimpleReadyCount">—</strong></div>'+
  '<div><span>申報出勤待核</span><strong id="mrSimplePendingCount">—</strong></div>'+
  '<small id="mrSimpleGateHint" role="status">正在讀取正式班表與出勤來源</small>';
 if(status)status.after(summary);else filters.after(summary);
 const ready=mk('section','mrReadySection');
 const readyTable=el.querySelector('#mrRows')?.closest('.scroll');
 const readyTitle=readyTable?.previousElementSibling;
 if(readyTitle?.tagName==='B'){
  readyTitle.textContent='已完成出勤・尚未申報';
  ready.appendChild(readyTitle);
 }
 if(readyTable)ready.appendChild(readyTable);
 const empty=mk('p','mrSimpleEmpty');
 empty.textContent='查詢完成後，這裡會列出可核對的加班申報項目。';
 ready.appendChild(empty);
 summary.after(ready);

 const pending=mk('details','mrPendingDetails','查看待核對人員與原因');
 const need=el.querySelector('#mrNeedSection');
 if(need)pending.appendChild(need);
 ready.after(pending);

 const all=mk('details','mrSummaryDetails','查看全員未休假統計');
 const auto=el.querySelector('#mrAutomaticSupplement');
 if(auto){
  const title=auto.querySelector('b');
  if(title)title.textContent='全員核對統計（非正式申報）';
  all.appendChild(auto);
  const grid=mk('details','mrAutoDetails','查看逐人九欄明細');
  for(const item of [...auto.querySelectorAll(':scope > .scroll, :scope > small')])grid.appendChild(item);
  auto.appendChild(grid);
 }
 pending.after(all);

 const previous=mk('details','mrExistingDetails','查看本月已申報紀錄');
 const existing=el.querySelector('#mrExistingSection');
 if(existing)previous.appendChild(existing);
 all.after(previous);

 const advanced=mk('details','mrAdvancedPlanning','進階：新增預排與逐週核對');
 const planning=el.querySelector('#mrPlanningModes');
 if(planning)advanced.appendChild(planning);
 if(prior){
  const priorWrap=mk('div','mrPriorWrap');
  priorWrap.classList.add('filters');
  priorWrap.appendChild(prior);
  advanced.appendChild(priorWrap);
 }
 for(const selector of ['#mrPlannedSection','#mrWeeklyDetails']){
  const part=el.querySelector(selector);
  if(part)advanced.appendChild(part);
 }
 const weekly=el.querySelector('#mrWeeklyDetails');
 if(weekly)weekly.open=false;
 advanced.open=settings.autoPlan===true;
 pending.open=settings.autoPlan===true;
 previous.after(advanced);

 const diagnostics=mk('details','mrSourceDetails','核對依據與資料來源說明');
 for(const selector of ['#mrBackfill','#mrPhase','#mrAuditSummary','#mrCompactStats']){
  const node=el.querySelector(selector);
  if(node){diagnostics.appendChild(node);node.hidden=false;}
 }
 const audit=el.querySelector('#mrAuditDetails')?.closest('details');
 if(audit){diagnostics.appendChild(audit);audit.hidden=false;}
 advanced.after(diagnostics);

 // Keep the original single official #mrSave button in the footer.
 // No local writes, no synthetic rows, no simulated approvals or submissions.
 const style=document.createElement('style');
 style.id='mrSimpleOfficialStyle';
 style.textContent=`#p79MonthlyRest{width:min(1130px,calc(100vw - 18px));border-radius:14px}
 #p79MonthlyRest .body{padding:16px;display:flex;flex-direction:column;gap:11px;overflow:auto}
 #p79MonthlyRest #mrSimpleIntro{background:#eff6ff;border-left:4px solid #3b82f6;border-radius:8px;padding:10px 13px;color:#1e40af;font-weight:700;font-size:13px}
 #p79MonthlyRest .mr-simple-filters{display:flex;flex-wrap:wrap;align-items:end;gap:9px;padding:0;margin:0!important}
 #p79MonthlyRest .mr-simple-filters>label{flex:1 1 140px;min-width:140px;font-size:12px}
 #p79MonthlyRest .mr-simple-filters>.mr-month-filter{flex:0 1 166px}
 #p79MonthlyRest #mrLoad{background:#2563eb;color:white;min-height:37px;padding:7px 16px;border-radius:9px;white-space:nowrap}
 #p79MonthlyRest #mrStatus{margin:0;background:#f8fafc;border-radius:8px;color:#475569;font-size:12px;padding:8px 11px;line-height:1.5}
 #p79MonthlyRest #mrSimpleOverview{background:#f1f7ff;border:1px solid #d9e8f8;border-radius:11px;padding:12px 14px;display:flex;flex-wrap:wrap;align-items:center;gap:12px 28px}
 #p79MonthlyRest #mrSimpleOverview>div{display:flex;gap:10px;align-items:center;white-space:nowrap}
 #p79MonthlyRest #mrSimpleOverview span{font-weight:700;color:#334155;font-size:13px}
 #p79MonthlyRest #mrSimpleOverview strong{font-size:22px;color:#1456a3;line-height:1}
 #p79MonthlyRest #mrSimpleOverview small{flex-basis:100%;font-size:11px;color:#64748b}
 #p79MonthlyRest #mrReadySection{border:1px solid #d9e3ef;border-radius:12px;padding:13px;background:white;min-height:120px}
 #p79MonthlyRest #mrReadySection>b{display:block;margin-bottom:11px;font-size:15px;color:#183b67}
 #p79MonthlyRest #mrReadySection>.scroll{max-height:48vh;overflow:auto}
 #p79MonthlyRest #mrReadySection .scroll table{min-width:710px}
 #p79MonthlyRest #mrReadySection table thead{background:#eaf3fd}
 #p79MonthlyRest #mrReadySection table td,#p79MonthlyRest #mrReadySection table th{padding:9px 7px}
 #p79MonthlyRest #mrSimpleEmpty{font-size:12px;color:#64748b;margin:9px 0 0}
 #p79MonthlyRest .mr-simple-panel{min-width:0}
 #p79MonthlyRest details.mr-simple-panel{background:#fff;border:1px solid #dce5f0;border-radius:10px;overflow:hidden}
 #p79MonthlyRest details.mr-simple-panel>summary{cursor:pointer;font-weight:700;color:#234b75;padding:11px 14px;font-size:13px}
 #p79MonthlyRest details.mr-simple-panel[open]>summary{background:#edf5fd;border-bottom:1px solid #dce5f0}
 #p79MonthlyRest details.mr-simple-panel>:not(summary){margin:10px}
 #p79MonthlyRest #mrAutoDetails{border:1px solid #dbe4ee;border-radius:8px}
 #p79MonthlyRest #mrAutoDetails>summary{padding:9px 10px}
 #p79MonthlyRest #mrAutoDetails>.scroll{max-height:300px;overflow:auto}
 #p79MonthlyRest #mrAdvancedPlanning>#mrPlanningModes{padding:9px!important;margin:10px!important}
 #p79MonthlyRest #mrAdvancedPlanning>#mrPriorWrap{display:flex}
 #p79MonthlyRest #mrExistingDetails #mrExistingSection{border:0!important;padding:0!important}
 #p79MonthlyRest .p79-ot-ux-dialog-tabs{display:none!important}
 #p79MonthlyRest footer{position:sticky;bottom:0;z-index:2;gap:10px}
 #p79MonthlyRest footer #mrResult{flex:1;white-space:normal;font-size:12px;line-height:1.4}
 #p79MonthlyRest footer #mrSave{min-width:160px}
 @media(max-width:800px){#p79MonthlyRest .body{padding:10px}
 #p79MonthlyRest .mr-simple-filters>label{flex:1 1 44%}
 #p79MonthlyRest #mrLoad{flex:1 1 100%}
 #p79MonthlyRest #mrSimpleOverview>div{flex:1 1 100%}
 #p79MonthlyRest footer #mrResult{flex-basis:100%}}`;
 el.appendChild(style);
}
function isExplicitScheduleEditRefusal(error){
 const message=String(error?.message||error||'').trim();
 return /^班表正在編輯[，,。\s]*請待儲存完成後再申報[。\s]*$/.test(message);
}
function showSubmissionResult(parent,selected,failure){
 const confirmed=selected.filter(row=>row.saved).length;
 const remaining=selected.length-confirmed;
 const result=document.createElement('dialog');
 result.id='p79MonthlyRestSubmissionResult';
 result.setAttribute('aria-labelledby','mrSubmissionResultTitle');
 result.setAttribute('aria-describedby','mrSubmissionResultSummary');
 result.style.cssText='width:min(440px,calc(100% - 32px));box-sizing:border-box;padding:24px;border:1px solid #cbd5e1;border-radius:14px;color:#123451;background:#fff;box-shadow:0 18px 55px #23395055';
 result.innerHTML='<h2 id="mrSubmissionResultTitle" style="margin:0 0 8px;font-size:20px"></h2><p id="mrSubmissionResultSummary" style="margin:0 0 16px"></p><p data-reason hidden></p><form method="dialog" style="display:flex;justify-content:flex-end"><button autofocus style="padding:8px 18px;border:0;border-radius:8px;background:#0864c8;color:#fff;cursor:pointer">確定</button></form>';
 result.querySelector('h2').textContent=remaining===0?'申報完成':confirmed?'部分申報完成':'申報尚未確認完成';
 result.querySelector('#mrSubmissionResultSummary').textContent='本次雲端已確認 '+confirmed+' 筆。'+(remaining?'另有 '+remaining+' 筆尚未確認完成。':'');
 const reason=result.querySelector('[data-reason]');
 if(remaining&&failure){reason.textContent=failure;reason.hidden=false;}
 result.addEventListener('close',()=>result.remove(),{once:true});
 parent.appendChild(result);
 result.showModal();
}
async function open(settings={}){
 const a=g.p79MonthlyRestContext;if(!a?.canReport())return alert('沒有申報加班權限');
 if(document.getElementById('p79MonthlyRest'))return;styles();
 // Only load the UI during an actual monthly rest dialog. Top-level code stays
 // DOM-free so official calculation modules also run safely in Node tests.
 if(!g.P79MonthlyRestDashboard&&!document.getElementById('mrUxLoader')){
  const script=document.createElement('script');script.id='mrUxLoader';
  script.src='../assets/port79-monthly-rest-dashboard.js?v=20261125-cloud-preplan-v44&reasonHelp=20261125-v2&localPreplan=20261125-v1&compactReason=20261126-v1&cutoffPicker=20261127-v1&savedPreplan=20261127-v1&jobFilter=20261127-v1&preplanReadback=20261127-v2&cutoffPersist=20261127-v1&singlePending=20261127-v1&sequentialPreplan=20261127-v1&electionGuard=20261127-v1&repairPreplan=20261127-v1';
  script.onload=()=>{const active=document.getElementById('p79MonthlyRest');if(active)g.P79MonthlyRestDashboard?.mount(active);};
  script.onerror=()=>console.warn('未休假簡化介面未載入，保留原本正式申報視窗');
  document.head.appendChild(script);
 }
 const el=document.createElement('dialog');el.id='p79MonthlyRest';
 el.innerHTML=`<header><b>每月未休假加班</b><button data-close>關閉</button></header><div class="body"><div class="filters"><label>加班歸屬月份<input id="mrMonth" type="month" value="${esc(a.month()||today().slice(0,7))}" max="${today().slice(0,7)}"></label><label>已申報截止日（自行設定）<input id="mrCutoff" type="date" title="留空核對整月"></label><button type="button" id="mrPrior">補報上月</button><label>部門<select id="mrDept"></select></label><label>職稱<select id="mrJob"></select></label><label>人員<select id="mrEmp"></select></label><button class="primary" id="mrLoad">讀取未休額度</button></div><div class="filters" id="mrPlanningModes" style="padding:12px;background:#eef2ff;border-radius:10px;margin:10px 0"><b>建立未休假預排</b><label><input id="mrManualMode" type="checkbox">手動預排</label><label><input id="mrAutoMode" type="checkbox">自動預排（今天至月底）</label><button id="mrNewPlan" type="button" class="primary">＋ 新增預排</button></div><div id="mrBackfill" hidden role="status" style="font-weight:800;color:#7c3aed;margin:6px 0"></div><div id="mrPhase" hidden role="status" style="font-weight:800;color:#0369a1;margin:8px 0"></div><div id="mrAuditSummary" hidden role="status" style="font-size:12px;font-weight:700;color:#334155"></div><details hidden style="margin-top:6px"><summary style="cursor:pointer;font-size:12px">逐人缺額及待核對原因</summary><pre id="mrAuditDetails" style="white-space:pre-wrap;font:12px/1.6 sans-serif"></pre></details><div id="mrCompactStats" role="status" aria-live="polite" class="mr-compact-stats">讀取資料後顯示核對摘要</div><section id="mrAutomaticSupplement" style="margin:10px 0;padding:10px;border:1px solid #cbd5e1;border-radius:10px"><b>全員未休假自動補算結果（不須逐人對表）</b><div id="mrAutoSupplementSummary" role="status" style="margin:7px 0;color:#334155;font-size:12px">正在核對全員來源…</div><div class="scroll" style="max-height:300px"><table><thead><tr><th>職稱</th><th>姓名</th><th>已自動配休</th><th>未休加班註記</th><th>已核對申報</th><th>申報出勤待核</th><th>註記缺申報</th><th>未休缺額</th><th>狀態</th></tr></thead><tbody id="mrAutoSupplementRows"></tbody></table></div><small style="display:block;margin-top:5px;color:#64748b">自動配休與加班註記不等於正式申報。只有正式申報編號及出勤核實完成才會列為已核對申報；資料來源未完成時不判定申報成功。</small></section><details id="mrWeeklyDetails" style="margin:8px 0 12px;border:1px solid #dbe4ee;border-radius:10px;padding:10px" open><summary style="cursor:pointer;font-weight:800">逐週例／休／國核對（依原班表）</summary><div class="scroll" style="max-height:230px"><table><thead><tr><th>週期</th><th>人數</th><th>例假</th><th>休息日</th><th>國定假日</th><th>預排建議</th><th>待確認</th></tr></thead><tbody id="mrWeeklyRows"></tbody></table></div><small style="display:block;color:#64748b;margin-top:6px">七日週期異常僅在此提示，不阻擋未來正式預排；不代表符合加班資格，實際工作安排及申報仍須依法核對。</small></details><section id="mrNeedSection"><b hidden id="mrNeedSummary">各公司、單位、組別及職稱排班核對中…</b><div hidden id="mrScopeSummary" role="status"></div><details id="mrScopeDetails" style="margin-top:8px"><summary style="cursor:pointer;font-weight:700">展開單位／職稱統計</summary><div class="scroll"><table><thead><tr><th>單位</th><th>組別</th><th>職稱</th><th>名冊</th><th>完成</th><th>未休／待核</th><th>班表缺漏</th><th>正式可申報</th><th>預排方式</th></tr></thead><tbody id="mrScopeRows"></tbody></table></div></details><div class="scroll"><table><thead><tr><th>預排勾選</th><th>員工編號</th><th>職稱</th><th>姓名</th><th>未休／待核額度</th><th>班表與考勤核對</th></tr></thead><tbody id="mrNeedRows"></tbody></table></div><div id="mrManualSelected" style="margin:10px 0;padding:10px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px" hidden><b id="mrManualSummary">手動預排尚未勾選人員</b><p style="font-size:12px">勾選後，逐人按「設定日期與時段」；確認後才儲存預排，不會自動申報。</p><div id="mrManualRows"></div></div></section><section id="mrPlannedSection"><b hidden id="mrPlannedSummary">自動預排建議核對中…</b><div class="scroll"><table><thead><tr><th><input id="mrPlanAll" type="checkbox" aria-label="全選自動預排建議"></th><th>日期</th><th>職稱</th><th>姓名</th><th>假別</th><th>原排班別／預排時段</th><th>狀態</th></tr></thead><tbody id="mrPlannedRows"></tbody></table></div><button id="mrSavePlans" type="button" class="primary" disabled>儲存勾選預排（0 筆）</button></section><div id="mrStatus" role="status">選好月份與人員後，讀取班表及出勤紀錄。</div><section id="mrExistingSection" aria-label="本月已申報休假加班" style="margin:12px 0;border:1px solid #cbd5e1;border-radius:10px;padding:10px"><b>已申報的例／休／國加班（唯讀，不重複申報）</b><div id="mrExistingStatus" role="status" style="margin:6px 0;font-size:12px;color:#334155">讀取班表後顯示既有申報。</div><div class="scroll" style="max-height:310px"><table><thead><tr><th>日期</th><th>職稱</th><th>姓名</th><th>假別</th><th>申報時段</th><th>申報狀態</th><th>來源／說明</th><th>申報編號</th></tr></thead><tbody id="mrExistingRows"></tbody></table></div></section><b>已完成出勤・尚未申報（自行勾選後送出）</b><div class="scroll"><table><thead><tr><th><input id="mrAll" type="checkbox" aria-label="全選"></th><th>日期</th><th>姓名</th><th>假別</th><th>出勤時段</th><th>申報時數</th><th>狀態</th></tr></thead><tbody id="mrRows"></tbody></table></div></div><footer><button data-close>取消</button><span id="mrResult" role="status" aria-live="polite">尚未送出申報</span><button id="mrSave" class="primary" disabled>申報勾選項目</button></footer>`;
 el.querySelector('#mrNeedSection').before(el.querySelector('#mrPlannedSection'));
 simplifyMonthlyRestLayout(el,settings);
 // Mount the requested visual dashboard, preserving the original official controller.
 g.P79MonthlyRestDashboard?.mount(el);
 document.body.appendChild(el);el.showModal();
 let autoPlan=settings.autoPlan!==false,explicitPlanningMode=settings.autoPlan!==undefined;
 const manualPeople=new Map(); // preserve picks across local filters; no implicit cloud writes
 const q=s=>el.querySelector(s),setStatus=x=>{q('#mrStatus').textContent=x;if(q('#mrResult'))q('#mrResult').textContent=x;};let busy=false,model=null,snapshot=null,rules=[],stop=false,loadedMonth='',loadedPeople=[],lastFailure='',lastCheckedDay=today();
 // Operator preferences are local, per authenticated account/server/month.
 const cutoffMemory=new Map();
 function cutoffStorageKey(month){
  try{
   const context=g.p79OvertimeContext,identity=context?.uploadIdentity?.();
   const owner=id(identity?.owner),server=String(context?.gasUrl?.()||'').trim();
   return owner&&server?'p79-monthly-rest-cutoff-v1:'+JSON.stringify([server,owner,month]):'';
  }catch(_){return '';}
 }
 function restoreCutoff(month){
  if(cutoffMemory.has(month))return validReportCutoff(month,cutoffMemory.get(month));
  const key=cutoffStorageKey(month);
  try{return key?validReportCutoff(month,g.localStorage?.getItem(key)):'';}catch(_){return '';}
 }
 function rememberCutoff(month,value){
  const cutoff=validReportCutoff(month,value);cutoffMemory.set(month,cutoff);
  const key=cutoffStorageKey(month);
  try{if(key){if(cutoff)g.localStorage?.setItem(key,cutoff);else g.localStorage?.removeItem(key);}}catch(_){}
  return cutoff;
 }
 q('#mrCutoff').value=restoreCutoff(q('#mrMonth').value);
 let people=monthlyPlanPeople(a.employees(),null,q('#mrMonth').value);
 function options(values,all){return '<option value="">'+all+'</option>'+values.map(v=>'<option>'+esc(v)+'</option>').join('');}
 const job=e=>e.jobTitle||e.deptDetail||'未設定';q('#mrDept').innerHTML=options([...new Set(people.map(e=>e.dept||'一般'))],'全部部門');
 function filter(){const dept=q('#mrDept').value;return people.filter(e=>!dept||(e.dept||'一般')===dept);}
 // 月份只需讀取一次；職稱、人員切換為本機過濾，不重新呼叫雲端。
 function chosenPeople(){const title=q('#mrJob').value,employee=q('#mrEmp').value;
  return filter().filter(e=>(!title||job(e)===title)&&(!employee||id(e.empId)===id(employee)));
 }
 function visibleRows(){const ids=new Set(chosenPeople().map(e=>id(e.empId)));
  return (model?.rows||[]).map((r,i)=>({r,i})).filter(({r})=>ids.has(id(r.empId)));
 }
 function isReadOnlySource(){return snapshot?.provisional===true||snapshot?.readOnlyDueAttendance===true;}
 function autoHistoricalReady(){return autoPlan&&loadedMonth<today().slice(0,7);}
 function autoSelectVerifiedHistory(){
  if(!autoPlan||isReadOnlySource()||snapshot?.attendanceEvidence?.complete!==true||model?.workflow?.canSubmit!==true)return;
  const current=today();
  for(const row of model?.rows||[]){
   // All three categories can be paired; formal submission retains the explicit regular-day legal exception confirmation.
   if(!row.saved&&!row.planned&&!row.attempted&&row.status==='可申報'&&cats.includes(row.category)&&row.date<=current)row.checked=true;
  }
 }
 function visibleExistingRows(){const ids=new Set(chosenPeople().map(e=>id(e.empId)));
  const all=!q('#mrDept').value&&!q('#mrJob').value&&!q('#mrEmp').value;
  // Existing report history is read-only; resigned staff stay in this section only.
  return existingRestOvertimeRows(snapshot,a.employees(),loadedMonth).filter(r=>all||ids.has(id(r.empId)));
 }
 function visiblePlannedRows(){const ids=new Set(chosenPeople().map(e=>id(e.empId)));
  return (model?.plannedRows||[]).filter(r=>ids.has(id(r.empId))&&!r.saved);
 }
 function jobs(){q('#mrJob').innerHTML=options([...new Set(filter().map(job))],'全部職稱');names();}
 function names(){q('#mrEmp').innerHTML='<option value="">全部人員</option>'+filter().filter(e=>!q('#mrJob').value||job(e)===q('#mrJob').value).map(e=>'<option value="'+esc(e.empId)+'">'+esc(e.name)+'</option>').join('');
  if(model&&!busy)paint();
 }
 function invalidate(){lastFailure='';model=null;snapshot=null;q('#mrRows').innerHTML='';q('#mrExistingRows').innerHTML='';q('#mrExistingStatus').textContent='讀取班表後顯示既有申報。';q('#mrAutoSupplementRows').innerHTML='';q('#mrAutoSupplementSummary').textContent='正在核對全員來源…';q('#mrBackfill').textContent='';q('#mrAuditSummary').textContent='';q('#mrAuditDetails').textContent='';q('#mrResult').textContent='尚未送出申報';q('#mrSave').disabled=true;q('#mrAll').checked=false;}
 q('#mrDept').onchange=jobs;q('#mrJob').onchange=names;q('#mrEmp').onchange=()=>{if(model&&!busy)paint();};
 q('#mrMonth').onchange=()=>{if(!busy){q('#mrCutoff').value=restoreCutoff(q('#mrMonth').value);manualPeople.clear();q('#mrLoad').click();}};
 q('#mrCutoff').onchange=()=>{if(busy)return;const input=q('#mrCutoff'),month=q('#mrMonth').value,raw=input.value,valid=validReportCutoff(month,raw);if(raw&&!valid){input.value=restoreCutoff(month);setStatus('截止日必須為選定月份內且不晚於今天的日期，已保留原設定。');return;}input.value=rememberCutoff(month,valid);manualPeople.clear();q('#mrLoad').click();};jobs();
 function controls(disabled,allowFilters=false){
  el.querySelectorAll('.filters input,.filters select,.filters button,#mrAll,#mrRows input,#mrRows select,#mrPlanAll,#mrPlannedRows input,#mrSavePlans,#mrNeedRows input,#mrManualRows button,#mrManualMode,#mrAutoMode,#mrNewPlan').forEach(e=>e.disabled=disabled);
  if(allowFilters){q('#mrDept').disabled=false;q('#mrJob').disabled=false;q('#mrEmp').disabled=false;}
  const allowed=model?.workflow?.canSubmit===true;
  const selectedFormal=allowed&&model?.rows.some(r=>r.checked&&!r.saved&&!r.planned);
  q('#mrSave').disabled=disabled||isReadOnlySource()||!(selectedFormal||
   (autoPlan&&!autoHistoricalReady()?model?.plannedRows?.some(r=>r.checked&&!r.saved):manualPeople.size&&!autoPlan));
  if(!disabled){
   q('#mrSavePlans').disabled=isReadOnlySource()||!autoPlan||!model?.plannedRows?.some(r=>r.checked&&!r.saved);
   q('#mrNewPlan').disabled=isReadOnlySource();
   q('#mrAll').disabled=!allowed||!visibleRows().some(({r})=>!r.saved&&!r.planned);
   el.querySelectorAll('#mrRows tr[data-row]').forEach(tr=>{
    const r=model?.rows[Number(tr.dataset.row)],pick=tr.querySelector('input.pick');
    if(pick)pick.disabled=!allowed||!!r?.planned;
   });
  }
  el.querySelectorAll('[data-close]').forEach(e=>{e.textContent=el.dataset.preplanLocked==='true'?'預排處理中':'關閉';e.disabled=el.dataset.preplanLocked==='true';});
 }
 const checkDayChange=()=>{if(!busy&&loadedMonth&&today()!==lastCheckedDay&&el.open){lastCheckedDay=today();q('#mrLoad').click();}};
  const checkInterval=g.setInterval?.(checkDayChange,30*60*1000);
  g.addEventListener?.('focus',checkDayChange);
  el.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(el.dataset.preplanLocked==='true')return;if(busy)stop=true;el.close();});el.oncancel=event=>{if(el.dataset.preplanLocked==='true'){event.preventDefault();return;}if(busy)stop=true;};el.onclose=()=>{if(checkInterval)g.clearInterval?.(checkInterval);g.removeEventListener?.('focus',checkDayChange);el.remove();};
 function paint(){
  q('#mrPlannedSection').hidden=!autoPlan;
  q('#mrManualSelected').hidden=autoPlan||manualPeople.size===0;
  q('#mrNewPlan').textContent='＋ 新增預排'+(!autoPlan&&manualPeople.size?'（已勾 '+manualPeople.size+' 人）':'');
  sortRows(model.rows);
  const progress=reportProgress(model),sum=key=>cats.reduce((n,c)=>n+progress[c][key],0);
  const personProgress=new Map(model.balances.map(b=>[id(b.emp.empId),personQuotaProgress(model,b.emp.empId)]));
  const quotaFor=empId=>personProgress.get(id(empId))||null;
  const quotaAttr=empId=>' data-quota-progress="'+esc(JSON.stringify(quotaFor(empId)))+'"';
  const personLabels=new Map([...personProgress].map(([empId,p])=>[empId,quotaProgressText(p)]));
  const pendingRows=visibleRows().map(({r})=>r).filter(r=>!r.saved&&!r.planned);
   const chosen=chosenPeople(),supplement=automaticSupplementReviewRows(snapshot,chosen,loadedMonth,model);
   const allSupplement=automaticSupplementReviewRows(snapshot,loadedPeople,loadedMonth,model);
   const supplementTotal=key=>supplement.reduce((a,r)=>a+(Number(r[key])||0),0);
   const unresolved=supplement.filter(r=>r.missing||r.noReport||r.remaining||r.pending);
   const unverifiedSource=isReadOnlySource()||snapshot?.attendanceEvidence?.complete!==true;
   q('#mrAutoSupplementSummary').textContent='月份 '+loadedMonth+'｜本次自動核對 '+supplement.length+
    ' 人（本帳號全範圍 '+allSupplement.length+' 人）｜已自動配休 '+supplementTotal('autoRest')+
    ' 日｜未休加班註記 '+supplementTotal('tagged')+' 筆｜已核對申報 '+supplementTotal('confirmed')+
    ' 筆｜申報出勤待核 '+supplementTotal('pending')+' 筆｜註記缺正式申報 '+supplementTotal('noReport')+
    ' 筆｜仍有缺額 '+supplementTotal('remaining')+' 天｜需處理 '+unresolved.length+' 人'+
    (unverifiedSource?'｜來源尚未完整核對，以上僅依已保存資料列示':'');
   q('#mrAutoSupplementRows').innerHTML=supplement.map(r=>
    '<tr><td>'+esc(r.role)+'</td><td>'+esc(r.name)+' <small>'+esc(r.empId)+'</small></td><td>'+r.autoRest+
    '</td><td>'+r.tagged+'</td><td>'+r.confirmed+'</td><td>'+r.pending+
    '</td><td>'+r.noReport+'</td><td>'+r.remaining+'</td><td>'+esc(r.state)+'</td></tr>').join('')||
    '<tr><td colspan="9">沒有本月份可核對的授權人員，不能當作零申報。</td></tr>';
   const existing=visibleExistingRows();
   if(!isReadOnlySource()){
    const scopedIds=new Set(chosenPeople().map(e=>id(e.empId)));
    for(const r of model.rows.filter(x=>x.saved&&!x.planned&&scopedIds.has(id(x.empId)))){
     if(existing.some(x=>id(x.empId)===id(r.empId)&&x.date===r.date&&x.reportId===r.id))continue;
     const emp=loadedPeople.find(x=>id(x.empId)===id(r.empId))||{};
     existing.push({empId:r.empId,name:r.name,role:job(emp),date:r.date,category:r.category,code:r.rule?.[1],reportId:r.id,status:'已核對出勤',monthlyRest:true});
    }
   }
   // Move each read-back-confirmed plan out of the actionable list.
   if(!isReadOnlySource()){
    const scopedIds=new Set(chosenPeople().map(e=>id(e.empId)));
    for(const r of model.plannedRows.filter(x=>x.saved===true&&scopedIds.has(id(x.empId)))){
     if(existing.some(x=>id(x.empId)===id(r.empId)&&x.date===r.date&&x.reportId===r.id))continue;
     const emp=loadedPeople.find(x=>id(x.empId)===id(r.empId))||{};
     existing.push({empId:r.empId,name:r.name,role:job(emp),date:r.date,category:r.category,code:r.rule?.[1],reportId:r.id,status:'預排已儲存（待出勤）',monthlyRest:true});
    }
   }
   const active=existing.filter(r=>!r.cancelled&&!r.historical);
   const verified=active.filter(r=>r.status==='已核對出勤');
   const pending=active.filter(r=>r.status!=='已核對出勤');
   const scheduleCount=(snapshot?.schedules||[]).filter(r=>r.schedule&&(!r.month||r.month===loadedMonth)).length;
   const provisional=snapshot?.provisional===true||snapshot?.source==='2026-10-provisional';
   const attendanceUnavailable=snapshot?.readOnlyDueAttendance===true;
   q('#mrExistingStatus').textContent=!scheduleCount?
    '未取得 '+loadedMonth+' 排班申報來源，不能斷言沒有正式申報。':
    '目前篩選 '+existing.length+' 筆｜現行申報 '+active.length+' 筆（已核對出勤 '+verified.length+'、其他狀態 '+pending.length+'）｜取消／舊版 '+(existing.length-active.length)+' 筆。颱風類申報不直接計入一般未休額度。'+
    (provisional?' ⚠️ 此份歷史備援非月底核薪定稿。':'')+
    (attendanceUnavailable?' ⚠️ 考勤讀取未完成，僅展示既有申報，不判定實際出勤。':'');
   q('#mrExistingRows').innerHTML=existing.map(r=>
    '<tr data-emp="'+esc(r.empId)+'" data-work-date="'+esc(r.date)+'"'+quotaAttr(r.empId)+'><td>'+esc(r.date)+'</td><td>'+esc(r.role)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.category)+'</td><td>'+esc(r.code||'時段待核')+
    '</td><td>'+esc(r.status)+'</td><td>'+esc(r.typhoon?'颱風加班（另核額度）':r.monthlyRest?'每月未休假加班':r.source||'一般例休國申報')+
    '</td><td><small>'+esc(r.reportId)+'</small></td></tr>').join('')||
    '<tr><td colspan="8">'+(scheduleCount?'這個篩選沒有已保存的例／休／國申報編號，其他加班仍需另查。':'本月來源尚未讀到，不能當作零申報。')+'</td></tr>';

  q('#mrAll').checked=pendingRows.length>0&&pendingRows.every(r=>r.checked);q('#mrAll').indeterminate=pendingRows.some(r=>r.checked)&&!q('#mrAll').checked;
  const phase=workflowStage(loadedMonth);
   if(isReadOnlySource()){
    phase.canSubmit=false;phase.canSuggest=false;
    phase.label=snapshot?.provisional===true?'10月歷史備援（只供查看）':'既有申報查詢（考勤讀取未完成）';
    phase.tip='申報紀錄仍可查看，但來源尚未完整核對，禁止新增、修改或送出加班。';
   }
   model.workflow=phase;
   const backfill=backfillContext(loadedMonth);
   q('#mrBackfill').textContent=backfill.historical
     ?'跨月補報：'+backfill.sourceMonth+' 原始加班日期與額度不變｜'+backfill.handlingMonth+' 提交處理；不佔用本月額度'
     :'加班與額度歸屬：'+loadedMonth;
   q('#mrPhase').textContent=phase.label+'｜'+phase.tip;
   const audit=workflowAudit(model);
   const weeks=weeklyReviewSummary(snapshot,chosenPeople(),loadedMonth,model.plannedRows);
   q('#mrWeeklyRows').innerHTML=weeks.map(w=>'<tr><td>'+esc(w.start)+'～'+esc(w.end)+(w.confirmed?'':'（參考）')+'</td><td>'+w.people.size+'</td><td>'+w.regular+'</td><td>'+w.rest+'</td><td>'+w.holiday+'</td><td>'+w.planned+'</td><td>'+(w.missing?w.missing+' 人需核對':'—')+'</td></tr>').join('')||'<tr><td colspan="7">目前無可核對的週期資料</td></tr>';
   q('#mrCompactStats').textContent='月份：'+loadedMonth+'　｜　已核對：'+audit.checked+' 人　｜　預排建議：'+visiblePlannedRows().length+' 筆　｜　正式可申報：'+audit.verified+' 筆';
   // Simple overview comes from the SAME verified model and HR/attendance
   // snapshot as the official original table. It does not make reports.
   const candidateCount=pendingRows.length;
   const verifiedReady=!unverifiedSource&&phase.canSubmit===true;
   q('#mrSimpleReadyCount').textContent=unverifiedSource?'待核對':candidateCount+' 筆';
   q('#mrSimpleReadyLabel').textContent=verifiedReady?'本月可申報':'待申報候選';
   q('#mrSimplePendingCount').textContent=unverifiedSource?'待核對':supplementTotal('pending')+' 筆';
   q('#mrSimpleGateHint').textContent=unverifiedSource
    ?'正式來源未完整核對，暫不能申報'
    :phase.canSubmit?'僅可勾選已核實出勤；送出後須以雲端申報編號核對'
    :'尚未開放正式申報；可查看候選與待核原因，不能直接送出';
   q('#mrSimpleEmpty').hidden=pendingRows.length>0;

   q('#mrAuditSummary').textContent='已核 '+audit.checked+' 人／無缺額 '+audit.complete+' 人｜待核對額度：例'+audit.shortage.例+'／休'+audit.shortage.休+'／國'+audit.shortage.國+'｜正式可申報 '+audit.verified+' 筆｜預排由你自行建立｜目前篩選 '+chosenPeople().length+' 人、'+visibleRows().length+' 筆（切換職稱不須重新讀取）';
   q('#mrAuditDetails').textContent=[...audit.people,...new Set([...audit.blocked,...(model.issues||[])])].join('\n')||'本次核對沒有未補額度或衝突。';
    const upcoming=visiblePlannedRows();
    const weeklyReview=upcoming.filter(r=>r.needsWeeklyReview).length;
    const scopedIds=new Set(chosenPeople().map(emp=>id(emp.empId)));
    const unfilled=(model.unfilled||[]).filter(x=>scopedIds.has(id(x.empId))).reduce((n,x)=>n+cats.reduce((t,c)=>t+x.remaining[c],0),0);
    const selectedPlans=upcoming.filter(r=>r.checked&&!r.saved);
    q('#mrPlanAll').checked=upcoming.length>0&&upcoming.every(r=>r.checked||r.saved);
    q('#mrPlanAll').indeterminate=selectedPlans.length>0&&!q('#mrPlanAll').checked;
    q('#mrSavePlans').textContent='儲存勾選預排（'+selectedPlans.length+' 筆）';
    q('#mrSavePlans').disabled=busy||isReadOnlySource()||!autoPlan||!selectedPlans.length;
    q('#mrPlannedSummary').textContent='自動建議 '+upcoming.length+
      ' 筆（尚未建立）｜未能安排 '+unfilled+' 天'+(weeklyReview?'｜例休週期待核 '+weeklyReview+' 筆':'')+'；尚未發生或尚未核實，不計入正式申報';
    q('#mrPlannedRows').innerHTML=upcoming.map(r=>{
      const emp=loadedPeople.find(e=>id(e.empId)===id(r.empId))||{};
      return '<tr data-emp="'+esc(r.empId)+'" data-work-date="'+esc(r.date)+'" data-saved="'+String(r.saved===true)+'"'+quotaAttr(r.empId)+' data-hours="'+esc(r.rule?.[2]||'')+' 小時"><td><input type="checkbox" class="plan-pick" data-plan-index="'+model.plannedRows.indexOf(r)+'" '+(r.checked?'checked':'')+' '+(r.saved?'disabled':'')+' aria-label="預排 '+esc(r.name)+' '+esc(r.date)+'"></td><td>'+esc(r.date)+'</td><td>'+esc(job(emp))+'</td><td>'+esc(r.name)+'</td><td class="'+esc(r.category)+'">'+
        esc(r.category)+'</td><td>'+esc(r.rule?.[1])+'</td><td>'+esc(r.status)+'</td></tr>';
    }).join('')||'<tr><td colspan="7">目前沒有可產生的月底預排建議；請查看各單位缺額和班表限制</td></tr>';
    const review=rosterReviewRows(model,chosenPeople());
    const scope=reviewAllUnits(model,chosenPeople());
    const allScope=reviewAllUnits(model,loadedPeople);
    q('#mrScopeSummary').textContent='本帳號可檢視的全範圍：'+
      allScope.staffCount+' 人／'+allScope.groupCount+' 個單位職稱分組；目前篩選 '+
      scope.staffCount+' 人、未休待核 '+scope.outstanding+' 人、班表缺漏 '+scope.missing+
      ' 人、正式可申報 '+scope.ready+' 筆；讀取未休不自動預排'+
      (snapshot?.attendanceEvidence?.complete!==true?'｜考勤未完整讀取，不能認定無卡或完成':'')+
      (scope.duplicateIds.length?'｜人員編號有重複或缺漏 '+scope.duplicateIds.length+' 項，須先處理':'');
    q('#mrScopeRows').innerHTML=scope.groups.map(u=>
       '<tr><td>'+esc(u.dept)+'</td><td>'+esc(u.group)+'</td><td>'+
       esc(u.role)+'</td><td>'+u.staff+'</td><td>'+u.completed+'</td><td>'+u.outstanding+
       '</td><td>'+u.missing+'</td><td>'+u.ready+'</td><td>'+(autoPlan?u.planned+' 筆建議':'自行建立')+'</td></tr>').join('')||
       '<tr><td colspan="9">目前篩選沒有需要核對的在職名冊</td></tr>';
    const fl=review.filter(x=>x.isFL),missing=review.filter(x=>x.missing).length;
    const flStaff=chosenPeople().filter(e=>/F\s*[\/／]\s*L/i.test(String(e.jobTitle||e.deptDetail||'')));
    const rosterIds=new Set((snapshot?.schedules||[]).filter(x=>x.schedule).map(x=>id(x.empId)));
    const flMatched=flStaff.filter(e=>rosterIds.has(id(e.empId))).length;
    q('#mrNeedSummary').textContent='正式班表逐人核對：未休／待核 '+review.length+' 人（F/L待核 '+fl.length+'／F/L名冊 '+flStaff.length+'／班表匹配 '+flMatched+'）'+
      (missing?'｜班表不完整 '+missing+' 人':'')+'｜下表不等於可直接申報';
    q('#mrNeedRows').innerHTML=review.map(x=>{
     const due=x.missing?null:cats.reduce((n,k)=>n+Math.max(0,Number(x.remaining[k])||0),0);
     const reviewType=x.missing?'missing':due>0?'deficit':'exception';
     const quota=x.missing?'尚無法計算':quotaProgressText(quotaFor(x.emp.empId));
     const hint=reviewType==='deficit'?(unverifiedSource?{suggestions:[],reason:'正式考勤尚未完整核對，不能建議申報時段'}:personPeriodSuggestions(model,x.emp.empId)):{suggestions:[],reason:''};
     const status=x.missing?'班表缺漏：'+x.reason:
       (x.unreported?'排休日有出勤未申報 '+x.unreported+' 天；':'')+
       (x.pending?'既有申報待核打卡 '+x.pending+' 天；':'')+
       (x.eligible?'正式可申報 '+x.eligible+' 筆；':'')+
       (due>0?(hint.suggestions.length?'已有 '+hint.suggestions.length+' 筆時段建議；':'')+hint.reason:'無剩餘缺額，不需新增未休加班');
     const plans=(model.plannedRows||[]).filter(r=>id(r.empId)===id(x.emp.empId)&&!r.saved);
     const canManual=manualPlanSelectable(x,loadedMonth);
     // Opening the plan editor is not a write. Attendance still has to be
     // verified when the chosen date is saved, not before opening the form.
     const canPreplan=canManual&&snapshot?.provisional!==true&&(Number(x.remaining.休)>0||Number(x.remaining.國)>0);
     const pick=autoPlan?'<input type="checkbox" class="need-plan" data-emp="'+esc(x.emp.empId)+'" aria-label="勾選 '+esc(x.emp.name)+' 的自動預排" '+(plans.length&&plans.every(r=>r.checked)?'checked ':'')+(!plans.length||busy?'disabled':'')+'>':
      '<input type="checkbox" class="need-plan manual-person-pick" data-emp="'+esc(x.emp.empId)+'" aria-label="手動預排勾選 '+esc(x.emp.name)+'" '+(manualPeople.has(id(x.emp.empId))?'checked ':'')+(!canManual||busy?'disabled':'')+' title="'+(canManual?'勾選後指定日期與時段；不會自動申報':'班表不完整、沒有剩餘額度或無可預排的未來日期')+'">';
     return '<tr data-review-type="'+reviewType+'" data-quota-progress="'+esc(JSON.stringify(quotaFor(x.emp.empId)))+'" data-period-suggestions="'+esc(JSON.stringify(hint.suggestions))+'" data-last-reported="'+esc(hint.lastReported||'')+'" data-next-report-date="'+esc(hint.nextReportDate||'')+'" data-can-preplan="'+String(canPreplan)+'"><td>'+pick+'</td><td>'+esc(x.emp.empId)+'</td><td>'+esc(x.role)+'</td><td>'+esc(x.emp.name)+'</td><td>'+esc(quota)+'</td><td>'+esc(status)+'</td></tr>';
    }).join('')||'<tr><td colspan="6">目前篩選內無未休額度或待核人員</td></tr>';
   const manualPicked=[...manualPeople.values()];
   q('#mrManualSummary').textContent='手動預排已勾選 '+manualPicked.length+' 人｜請逐人設定日期及時段後儲存';
   q('#mrManualRows').innerHTML=manualPicked.map(emp=>
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border-bottom:1px solid #e2e8f0;padding:7px">'+
    '<span>'+esc(emp.name)+'（'+esc(emp.empId)+'）</span>'+
    '<span><button type="button" class="manual-set-date" data-emp="'+esc(emp.empId)+'">設定日期與時段</button> '+
    '<button type="button" class="manual-remove-person" data-emp="'+esc(emp.empId)+'">取消勾選</button></span></div>').join('');
   const selectedFormal=phase.canSubmit&&model.rows.some(r=>r.checked&&!r.saved&&!r.planned);
   q('#mrSave').textContent=selectedFormal||autoHistoricalReady()?'申報勾選項目（'+sum('selected')+' 筆）':autoPlan?'儲存勾選預排（'+selectedPlans.length+' 筆）':
   manualPeople.size?'設定勾選預排（'+manualPeople.size+' 人）':
   '申報勾選項目（'+sum('selected')+' 筆）';
  q('#mrResult').textContent=lastFailure?'操作未完成：'+lastFailure:
   autoHistoricalReady()?'已選 '+sum('selected')+' 筆核實出勤；須雲端回讀確認':
   autoPlan?'已選預排 '+selectedPlans.length+' 筆（非正式申報）':
   '已勾選 '+sum('selected')+' 筆；請確認日期與時段後送出';
  q('#mrRows').innerHTML=visibleRows().map(({r,i})=>r.saved?'':'<tr data-row="'+i+'" data-emp="'+esc(r.empId)+'"'+quotaAttr(r.empId)+'><td><input class="pick" type="checkbox" '+(r.checked?'checked':'')+' '+(r.saved||r.planned||!model.workflow.canSubmit?'disabled':'')+' aria-label="申報 '+esc(r.name)+' '+r.date+'"></td><td><input class="date" type="date" value="'+r.date+'" min="'+loadedMonth+'-01'+'" max="'+loadedMonth+'-'+String(g.p79RestQuota(loadedMonth).days).padStart(2,'0')+'" '+(r.saved?'disabled':'')+'></td><td class="person">'+esc(r.name)+' <button type="button" class="person-progress" data-audit="'+esc(r.empId)+'" title="查看此人逐日額度核對">'+esc(personLabels.get(id(r.empId)))+'</button></td><td class="'+r.category+'"><select class="category" '+(r.saved?'disabled':'')+'>'+cats.filter(c=>rules.some(rule=>rule[0]===c&&fullDayRule(rule))).map(c=>'<option '+(c===r.category?'selected':'')+'>'+c+'</option>').join('')+'</select></td><td><select class="rule" '+(r.saved?'disabled':'')+'>'+rules.map((rule,k)=>rule[0]===r.category&&fullDayRule(rule)?'<option value="'+k+'" '+(JSON.stringify(rule)===JSON.stringify(r.rule)?'selected':'')+'>'+esc(rule[1])+'</option>':'').join('')+'</select></td><td>'+esc(r.rule[2])+' 小時'+'</td><td>'+esc(r.status)+'</td></tr>').join('');
  if(busy)q('#mrResult').textContent=q('#mrStatus').textContent;
  q('#mrSave').disabled=busy||isReadOnlySource()||!(selectedFormal||
    (autoPlan&&!autoHistoricalReady()?selectedPlans.length:manualPeople.size&&!autoPlan));
 }
 q('#mrRows').onclick=e=>{const button=e.target.closest('[data-audit]');if(button&&model)alert(auditText(model,button.dataset.audit));};
 q('#mrRows').onchange=e=>{const tr=e.target.closest('[data-row]');if(!tr)return;const r=model.rows[Number(tr.dataset.row)];if(r.saved)return;if(!e.target.classList.contains('pick'))r.id=crypto.randomUUID();
  if(e.target.classList.contains('pick')){r.checked=e.target.checked;model.quotaPreviewSuppressed=false;}
  if(e.target.classList.contains('date')){r.date=e.target.value;r.status='日期已改，儲存時重新核對出勤';}
  if(e.target.classList.contains('category')){r.category=e.target.value;const roster=snapshot.schedules.find(x=>id(x.empId)===id(r.empId))?.schedule||{},pair=snapshot.pairs.find(p=>id(p.empId)===id(r.empId)&&p.date===r.date);r.rule=(ruleFor(r.date,roster,pair,r.category,rules)||rules.find(x=>x[0]===r.category&&fullDayRule(x))).slice();r.status='假別已改，申報前會重新核對未休額度';}
  if(e.target.classList.contains('rule')){r.rule=rules[Number(e.target.value)].slice();r.status='時段已改，儲存時重新核對出勤';}
  paint();
 };
 q('#mrAll').onchange=()=>{if(!model?.workflow?.canSubmit)return;model.quotaPreviewSuppressed=false;visibleRows().forEach(({r})=>{if(!r.saved&&!r.planned)r.checked=q('#mrAll').checked;});paint();};
 q('#mrLoad').onclick=async(loadOptions={})=>{
  if(busy)return;invalidate();busy=true;controls(true,true);setStatus('正在同時讀取班表、出勤及雲端加班選項…');
  try{const requestedMonth=q('#mrMonth').value;
   if(loadedMonth&&loadedMonth!==requestedMonth)manualPeople.clear();
   loadedMonth=requestedMonth;
    const cutoff=q('#mrCutoff');cutoff.min=loadedMonth+'-01';cutoff.max=loadedMonth===today().slice(0,7)?today():loadedMonth+'-'+String(g.p79RestQuota(loadedMonth).days).padStart(2,'0');
    cutoff.value=validReportCutoff(loadedMonth,cutoff.value);
    if(loadedMonth>today().slice(0,7))throw Error('不能對未來月份先建立跨月補報');
    if(!people.length){
     setStatus('正在載入人資名冊與操作權限，完成後繼續核對…');
     await g.p79OvertimeContext?.refreshAccess?.();
     people=monthlyPlanPeople(a.employees(),null,loadedMonth);
     q('#mrDept').innerHTML=options([...new Set(people.map(e=>e.dept||'一般'))],'全部部門');jobs();
    }
    g.p79RestQuota(loadedMonth);
    if(!a.employees().length)throw Error('沒有可檢視的人員');
   const preferLocal=loadOptions?.preferLocal===true&&g.P79WorkhoursCache?.enabled?.()===true&&!!g.P79WorkhoursCache?.verifiedRawMonths?.(loadedMonth,g.p79OvertimeContext?.token?.());
   const readMonth=preferLocal?a.snapshot(loadedMonth,false,false,false,true).catch(()=>a.snapshot(loadedMonth,false,false,true,true)):a.snapshot(loadedMonth,false,false,true,true);
   const [data,ruleResponse]=await Promise.all([readMonth,g.P79Overtime.loadRules()]);
    snapshot=data;rules=ruleResponse.rows;
    people=monthlyPlanPeople(a.employees(),snapshot,loadedMonth);
    loadedPeople=people.slice();
    const allowedIds=new Set(loadedPeople.map(e=>id(e.empId)));
    for(const empId of manualPeople.keys())if(!allowedIds.has(empId))manualPeople.delete(empId);
    // Historical employees absent from the current HR roster remain searchable
    // when the authenticated month snapshot contains their official row.
    const known=new Set(people.map(e=>id(e.empId)));
    for(const row of snapshot?.schedules||[]){
     const empId=id(row?.empId);
     if(!empId||known.has(empId)||loadedMonth>=today().slice(0,7)||row.month&&String(row.month)!==loadedMonth)continue;
     const info=row.schedule?.__personnel||{};
     const person={empId,name:row.name||row.employeeName||empId,
      jobTitle:info.role||row.role||'未設定',dept:row.dept||row.department||'歷史人員',
      group:info.group||row.group||'不分組'};
     people.push(person);loadedPeople.push(person);known.add(empId);
    }
    const oldDept=q('#mrDept').value,oldJob=q('#mrJob').value,oldEmp=q('#mrEmp').value;
    q('#mrDept').innerHTML=options([...new Set(people.map(e=>e.dept||'一般'))],'全部部門');
    if(oldDept&&[...q('#mrDept').options].some(o=>o.value===oldDept))q('#mrDept').value=oldDept;
    jobs();
    if(oldJob&&[...q('#mrJob').options].some(o=>o.value===oldJob)){q('#mrJob').value=oldJob;names();}
    if(oldEmp&&[...q('#mrEmp').options].some(o=>o.value===oldEmp))q('#mrEmp').value=oldEmp;
    if(loadedMonth<today().slice(0,7)&&!explicitPlanningMode)autoPlan=true;
    q('#mrManualMode').checked=!autoPlan;q('#mrAutoMode').checked=autoPlan;
    q('#mrNewPlan').hidden=autoPlan;q('#mrPlannedSection').hidden=!autoPlan;
    model=plan(snapshot,loadedPeople,loadedMonth,rules,{manualOnly:!autoPlan,cutoff:q('#mrCutoff').value});
    autoSelectVerifiedHistory();
    if(isReadOnlySource()){model.rows=[];model.plannedRows=[];model.previewRows=[];model.workflow.canSubmit=false;model.workflow.canSuggest=false;}
    g.p79UpdateMonthlyRestPlans?.(loadedMonth,model.plannedRows||[],loadedPeople);paint();
   const pendingIssues=[...new Set(model.issues.filter(issue=>!issue.includes('已休、預排休與已申報合計超出額度')))];
   setStatus(isReadOnlySource()?'已顯示 '+loadedMonth+' 來源中的既有申報；'+(snapshot?.provisional===true?'歷史備援非月底核薪版。':'')+(snapshot?.readOnlyDueAttendance===true?'考勤尚未讀取成功。':'')+'目前僅供查看，不能新增、修改或儲存加班。':'已核對 '+loadedPeople.length+' 位授權人員；'+(autoPlan?'自動建議尚未儲存，':'未自動建立預排，')+'正式可申報 '+(model.rows||[]).length+' 筆；切換部門、職稱或姓名會立即篩選，先前勾選保留。'+(pendingIssues.length?'另有 '+pendingIssues.length+' 項仍待核對，請展開「逐人缺額及待核對原因」查看；已完成的項目不重複提示。':'本次沒有其他未解決的提示。'));

  }catch(e){console.warn('每月未休假資料讀取失敗',e);setStatus('讀取失敗：'+String(e?.message||e));}finally{busy=false;controls(false);}
 };
 // Explicit repair operation: whole authorized month, independent of UI filters.
 el.p79RepairAbnormalPreplans=async()=>{
  const service=g.p79OvertimeStatusContext;
  if(busy||!model||!loadedMonth)return;
  if(!service?.canRevoke?.()||typeof service.revoke!=='function'){setStatus('沒有班表及加班撤銷管理權限，未修改資料。');return;}
  const month=loadedMonth;let candidates=[],review=[],completed=0,failure='',reload=false,remaining=null,processed=0;
  const failed=[];
  const readRepairSnapshot=async()=>{
   for(let attempt=0;;attempt++){
    try{
     const source=await a.snapshot(month,false,false,true);
     if(source?.provisional||source?.readOnlyDueAttendance||source?.attendanceEvidence?.complete!==true||!source?.saveContext?.ready)throw Error('正式資料尚未完整核對，未修改');
     return source;
    }catch(error){
     if(attempt>=2||!/雲端正處理其他操作|排班讀取等[待候]|未取得鎖/.test(String(error.message||error)))throw error;
     setStatus('異常預排｜雲端忙碌，重新讀取 '+(attempt+1)+'/2');
     await new Promise(resolve=>g.setTimeout(resolve,500*(attempt+1)));
    }
   }
  };
  busy=true;el.dataset.preplanLocked='true';controls(true);
  try{
   setStatus('正在掃描 '+month+' 全部授權人員的異常預排（不受部門、職稱篩選限制）…');
   let fresh=await readRepairSnapshot();
   ({repair:candidates,review}=abnormalMonthlyRestPlans(fresh,a.employees(),month));
   const list=rows=>rows.map(r=>r.name+'｜'+r.date+'｜'+r.reason+(r.issue?'｜'+r.issue:'')).join('\n');
   if(!candidates.length){setStatus('查無可安全取消的異常預排。'+(review.length?'另有 '+review.length+' 筆需人工核對：'+list(review):''));return;}
   if(!confirm('本月全部授權人員共 '+candidates.length+' 筆異常預排可取消；正常預排、已申報、原始打卡不會刪除。\n\n'+list(candidates)+(review.length?'\n\n另有 '+review.length+' 筆僅供人工核對，不會修改：\n'+list(review):'')+'\n\n確認逐筆取消並重新計算額度？')){setStatus('已取消操作，未修改任何資料。');return;}
   reload=true;
   for(const candidate of candidates){
    if(!el.isConnected||loadedMonth!==month||!service.canRevoke())throw Error('視窗、月份或權限已變更');
    const current=abnormalMonthlyRestPlans(fresh,a.employees(),month).repair.find(r=>r.empId===candidate.empId&&r.date===candidate.date&&r.id===candidate.id&&JSON.stringify(r.report)===JSON.stringify(candidate.report));
    processed++;
    if(!current){
     failed.push(candidate.name+' '+candidate.date+'：原預排已變更，未撤銷');
     continue;
    }
    setStatus('異常預排修正 '+processed+'／'+candidates.length+'｜'+current.name+' '+current.date);
    let revokeError=null;
    try{
     const result=await service.revoke({...current,repairPreplan:true},fresh);
     if(result?.ok!==true||result.revocationVerified!==true)throw Error('撤銷回應未確認');
    }catch(error){revokeError=error;}
    // Never repeat a possibly successful mutation. Verify both the exact
    // revocation record and restored roster against a fresh cloud read.
    fresh=await readRepairSnapshot();
    const roster=fresh.schedules?.find(r=>id(r.empId)===current.empId)?.schedule,meta=roster?.__meta?.[current.date]||{};
    if(!roster||meta.overtimeReport?.id===current.id||meta.overtimeReports?.some?.(r=>r?.id===current.id&&confirmedReport(meta,r))||!meta.overtimeRevocations?.some(r=>r.confirmed===true&&String(r.reportId)===String(current.id))||String(roster[current.date]||'').trim()!==current.original){
     failed.push(current.name+' '+current.date+'：撤銷或原班別未確認'+(revokeError?'：'+String(revokeError.message||revokeError):''));
     // A fresh authoritative snapshot is available. Isolate this employee/date
     // and proceed with other candidates; never repeat this uncertain write.
     setStatus('已處理 '+processed+'／'+candidates.length+' 筆｜已確認 '+completed+' 筆｜待核對 '+failed.length+' 筆');
     continue;
    }
    completed++;
    snapshot=fresh;model=plan(fresh,loadedPeople,month,rules,{manualOnly:!autoPlan,cutoff:q('#mrCutoff').value});
    paint();controls(true);
    setStatus('異常預排已確認取消 '+completed+'／'+candidates.length+' 筆，已重新計算額度');
    await new Promise(resolve=>g.setTimeout(resolve,0));
   }
   fresh=await readRepairSnapshot();
   const audit=abnormalMonthlyRestPlans(fresh,a.employees(),month);
   remaining=audit.repair.length;review=audit.review;
   if(remaining)failure='全範圍仍有 '+remaining+' 筆異常預排，請重新核對';
  }catch(error){failure=String(error.message||error);}
  finally{
   busy=false;
   try{
    if(reload){
     await q('#mrLoad').onclick();const refreshed=!!model&&!isReadOnlySource();
     if(completed)try{await a.refresh?.();}catch(error){failure+=(failure?'；':'')+'排班／統計更新未確認：'+String(error.message||error);}
     const summary='異常預排修正：已確認 '+completed+'／'+candidates.length+' 筆。'+(failure?'核對未完整：'+failure+'。':refreshed?'已重新計算未休額度及建議日期，尚未儲存新預排。':'最新資料尚未完整讀取，請重新讀取以核對額度。')+(remaining!==null?' 全範圍剩餘可修正 '+remaining+' 筆。':' 全範圍剩餘筆數尚未確認。')+(failed.length?' '+failed.length+' 筆處理未確認：'+failed.join('；'):'')+(review.length?' 另 '+review.length+' 筆需人工核對：'+review.map(r=>r.name+' '+r.date+' '+r.issue).join('；'):'')+(processed<candidates.length?' 尚有 '+(candidates.length-processed)+' 筆未處理。':'');
     setStatus(summary);
     if(typeof g.alert==='function')g.alert(summary);
    }
    else if(failure)setStatus('異常預排掃描未完成：'+failure);
   }finally{delete el.dataset.preplanLocked;controls(false);}
  }
 };
 function choosePlanningMode(automatic){
  if(busy)return;
  autoPlan=automatic;
  q('#mrManualMode').checked=!autoPlan;q('#mrAutoMode').checked=autoPlan;
  q('#mrNewPlan').hidden=autoPlan;q('#mrPlannedSection').hidden=!autoPlan;
  if(model){
   const previousRows=model.rows;
   model=plan(snapshot,loadedPeople,loadedMonth,rules,{manualOnly:!autoPlan,cutoff:q('#mrCutoff').value});
   model.rows=previousRows;
   autoSelectVerifiedHistory();
   if(isReadOnlySource()){model.rows=[];model.plannedRows=[];model.previewRows=[];}
   paint();controls(false);
  }
 }
 el.p79OpenMonthlyRestPlan=employeeId=>q('#mrNewPlan').onclick(employeeId,true);
 // Batch action passes the selected dated rows, not merely employee IDs.
 // Refresh once, match the exact original candidates, then use the existing
 // guarded bulk save and cloud read-back. Unmatched rows are not written.
 el.p79ProcessMonthlyRestSelection=async(requested,mode)=>{
  if(busy||!model||!Array.isArray(requested)||!['plan','formal'].includes(mode))return;
  const month=loadedMonth,scope=new Set(chosenPeople().map(e=>id(e.empId)));
  const picked=requested.filter(r=>(r.kind!=='reference'||r.eligible===true)&&scope.has(id(r.empId))&&String(r.date||'').startsWith(month+'-')&&selectedRestCandidateKey(r));
  const previous=(mode==='plan'?model.plannedRows:model.rows).filter(r=>scope.has(id(r.empId))&&r.checked&&!r.saved);
  const byKey=new Map([...picked,...previous].map(r=>[selectedRestCandidateKey(r),r]));
  if(!byKey.size){setStatus('沒有已指定日期及時段的勾選項目。');return;}
  const wanted=[...byKey.values()],rejected=[];let rematched=[];
  busy=true;controls(true);setStatus((mode==='plan'?'正在依電腦已讀取的班表配對 ':'正在搜尋本月 ')+wanted.length+' 筆符合假別、額度及班別的日期…');
  try{
   // Future preplans use the already-loaded desktop snapshot; the save handler verifies cloud once.
   const fresh=mode==='plan'?snapshot:await a.snapshot(month,false,false,true);
   if(!el.isConnected||loadedMonth!==month)throw Error('月份或視窗已變更');
   if(fresh?.provisional===true||fresh?.readOnlyDueAttendance===true||fresh?.attendanceEvidence?.complete!==true)throw Error('正式班表或考勤尚未完整讀取，保留勾選，未寫入任何申報');
   const next=plan(fresh,loadedPeople,month,rules,{manualOnly:false,cutoff:q('#mrCutoff').value});
   const candidates=mode==='plan'?next.plannedRows:next.rows;
   const savedAt=row=>fresh.schedules?.find(x=>id(x.empId)===id(row.empId))?.schedule?.__meta?.[row.date]?.overtimeReport;
   const uncertain=[...model.rows,...model.plannedRows].filter(r=>(r.attempted||r.acknowledged)&&!r.saved);
   const blocked=request=>!!savedAt(request)||uncertain.some(old=>id(old.empId)===id(request.empId)&&old.category===request.category&&
    selectedRestCandidateKey(old)!==selectedRestCandidateKey(request));
   const {matched,unmatched,reassigned}=rematchSelectedRestCandidates(wanted,candidates,blocked);
   rematched=reassigned;
   // Keep native IDs for uncertain write retries; never assign a new ID
   // to an attempted record without checking its existing cloud report.
   for(const row of matched){
    const old=previous.find(x=>selectedRestCandidateKey(x)===selectedRestCandidateKey(row));
    if(old){row.id=old.id;row.attempted=old.attempted;row.acknowledged=old.acknowledged;}
    row.checked=true;
   }
   for(const row of unmatched){
    const roster=fresh.schedules?.find(x=>id(x.empId)===id(row.empId))?.schedule;
    const meta=roster?.__meta?.[row.date]||{};
    const relevant=(next.reviewNotes?.[id(row.empId)]||[]).filter(x=>x.category===row.category&&
     (mode==='plan'?x.date>=today():x.date<=today()));
    const balanceRow=next.balances.find(b=>id(b.emp.empId)===id(row.empId));
    const sameCategoryFormal=next.rows.filter(r=>id(r.empId)===id(row.empId)&&r.category===row.category&&!r.saved);
    const exactRef=(next.rosterReferences?.[id(row.empId)]||[]).find(r=>r.date===row.date&&r.category===row.category);
    const reasons=[exactRef?.issue,...relevant.map(x=>x.date.slice(5)+' '+x.reason)].filter(Boolean);
    const reason=meta.overtimeReport?'原日期已有加班或預排，保留原編號，未另建':blocked(row)||row.attempted?'原寫入尚待核對，不另建日期':!roster?'缺少正式班表':!balanceRow?'班表不完整，無法計算額度':!balanceRow.remaining[row.category]?'最新雲端'+row.category+'剩餘額度為0':mode==='plan'&&sameCategoryFormal.length>=balanceRow.remaining[row.category]?'缺額已有 '+sameCategoryFormal.length+' 筆實際出勤候選，請先正式申報':'原班表 '+(roster[row.date]||'未排')+'；'+([...new Set(reasons)].slice(0,1).join('／')||'本月無符合原假別及8小時規則的候選');
    rejected.push((row.name||row.empId)+' '+row.date+'：'+reason);
   }
   if(!matched.length){setStatus('重新核對後，'+rejected.length+' 筆暫無符合'+(mode==='plan'?'預排':'正式申報')+'資格的日期。未寫入資料。'+(rejected.length?' '+rejected.slice(0,2).join('；'):''));return;}
   // Preserve unrelated rows and only select exact matched candidates.
   const untouched=mode==='plan'?model.rows:model.plannedRows;
   if(mode==='plan')next.rows=untouched;else next.plannedRows=untouched;
   snapshot=fresh;model=next;
   if(mode==='plan'){autoPlan=true;q('#mrAutoMode').checked=true;q('#mrManualMode').checked=false;}
   paint();
   setStatus('已配對 '+matched.length+' 筆，其中自動改配 '+rematched.length+' 筆'+(rejected.length?'；另 '+rejected.length+' 筆查無合格時段：'+rejected.slice(0,5).join('；'):'')+'。');
  }catch(error){setStatus('批次核對未完成：'+String(error.message||error));return;}
  finally{busy=false;controls(false);}
  const summary=(rematched.length?'\n自動改配 '+rematched.length+' 筆（保留原人員與假別）：\n'+rematched.slice(0,12).map(({from,to})=>(to.name||to.empId)+' '+from.date+' → '+to.date+' '+to.rule[1]).join('\n')+(rematched.length>12?'\n其餘改配日期見列表':''):'')+
   (rejected.length?'\n另 '+rejected.length+' 筆已搜尋但無可用時段，保留待核、不寫入。':'');
  if(mode==='plan')await q('#mrSavePlans').onclick(summary);else await q('#mrSave').onclick(summary);
 };
 q('#mrManualMode').onchange=()=>{explicitPlanningMode=true;choosePlanningMode(false);};
 q('#mrAutoMode').onchange=()=>{explicitPlanningMode=true;choosePlanningMode(q('#mrAutoMode').checked);};
 q('#mrNewPlan').onclick=async(employeeId='',fromRoster=false)=>{
  if(busy||!model||!snapshot)return;
  if(snapshot.provisional===true){setStatus('歷史備援僅供查閱，不能建立預排。');return;}
  if(!fromRoster&&isReadOnlySource()){setStatus('請從已選未休人員設定預排，儲存時重新核對正式資料。');return;}
  const requested=Array.isArray(employeeId)?employeeId.map(id):[id(typeof employeeId==='string'?employeeId:'')].filter(Boolean);
  const allowed=new Set(requested);
  const eligible=fromRoster?rosterReviewRows(model,chosenPeople()).filter(x=>allowed.has(id(x.emp.empId))&&manualPlanSelectable(x,loadedMonth)&&(Number(x.remaining.休)>0||Number(x.remaining.國)>0)):[];
  if(fromRoster&&!eligible.length){setStatus('所選人員沒有本月可設定的休／國預排額度，請核對月份及班表。');return;}
  const selected=fromRoster?id(eligible[0].emp.empId):requested[0]||(manualPeople.size?[...manualPeople.keys()][0]:'');
  const chosen=fromRoster?eligible[0].emp:manualPeople.get(selected);
  if(selected&&!chosen){setStatus('找不到勾選人員，請重新勾選');return;}
  const detail=chosen?rosterReviewRows(model,loadedPeople).find(x=>id(x.emp.empId)===selected):null;
  if(chosen&&!manualPlanSelectable(detail,loadedMonth)){
   setStatus('這位人員沒有可用未休額度或可預排日期，請重新核對');return;
  }
  const prefill=chosen?
   {manualPlan:true,empId:chosen.empId,allowedEmpIds:[chosen.empId],requirePeriodSelection:true,pickDateExplicitly:true}:
   {manualPlan:true};
  if(fromRoster){
   if(!chosen||!detail||!manualPlanSelectable(detail,loadedMonth)||
      !(Number(detail.remaining.休)>0||Number(detail.remaining.國)>0))return setStatus('目前沒有可預排的休／國缺額');
   const month=loadedMonth;
   Object.assign(prefill,{allowedEmpIds:eligible.map(x=>x.emp.empId),monthlyRestPlanMonth:month,category:Number(detail.remaining.休)>0?'休':'國',
    note:'每月未休假加班預排（正式配休）',periodHint:'依本月未來班別選擇可配休時段；儲存後占用正式額度',
    validateMonthlyRestPlan:async({empId,date,rule})=>{
     const target=eligible.find(x=>id(x.emp.empId)===id(empId))?.emp;
     if(!el.isConnected||loadedMonth!==month||!target||!chosenPeople().some(e=>id(e.empId)===id(empId)))throw Error('原未休人員或月份已變更，請重新開啟');
     const fresh=await a.snapshot(month,false,false,true);
     const issue=manualRestPlanIssue(fresh,target,month,date,rule,today(),q('#mrCutoff').value);
     if(issue)throw Error(issue);
    }});
  }
  await g.P79Overtime.openReport(prefill);
  const form=document.querySelector('#p79OtClose')?.closest('dialog');
  if(form){
   let acknowledged=false;
   const saved=event=>{
    const draft=event?.detail?.draft,result=event?.detail?.result;
    if(chosen&&draft?.manualPlan===true&&(fromRoster?eligible.some(x=>id(x.emp.empId)===id(draft.empId)):id(draft.empId)===selected)&&
       result?.ok===true&&result?.directOvertimeSaved===true&&result?.report?.planned===true)
     acknowledged=true;
   };
   g.addEventListener?.('p79-overtime-report-saved',saved);
   form.addEventListener('close',()=>{
    g.removeEventListener?.('p79-overtime-report-saved',saved);
    if(acknowledged)manualPeople.delete(selected);
    if(el.isConnected&&!busy)q('#mrLoad').click();
   },{once:true});
  }
 };
 choosePlanningMode(autoPlan);
 q('#mrPrior').onclick=()=>{if(busy)return;q('#mrMonth').value=previousMonth(today().slice(0,7));q('#mrCutoff').value=restoreCutoff(q('#mrMonth').value);q('#mrLoad').click();};
 q('#mrNeedRows').onchange=e=>{
  if(busy||!e.target.classList.contains('need-plan'))return;
  const employeeId=id(e.target.dataset.emp);
  if(!autoPlan){
   const person=loadedPeople.find(x=>id(x.empId)===employeeId);
   const eligible=rosterReviewRows(model,loadedPeople).find(x=>id(x.emp.empId)===employeeId);
   if(!person||!manualPlanSelectable(eligible,loadedMonth)){paint();return;}
   if(e.target.checked)manualPeople.set(employeeId,{empId:person.empId,name:person.name});
   else manualPeople.delete(employeeId);
  }else{
   (model?.plannedRows||[]).filter(r=>id(r.empId)===employeeId&&!r.saved).forEach(r=>{r.checked=e.target.checked;});
  }
  paint();
 };
 q('#mrManualRows').onclick=e=>{
  const button=e.target.closest('[data-emp]');if(!button||busy||autoPlan)return;
  const employeeId=id(button.dataset.emp);
  if(button.classList.contains('manual-remove-person')){manualPeople.delete(employeeId);paint();return;}
  if(button.classList.contains('manual-set-date'))q('#mrNewPlan').onclick(employeeId);
 };
 q('#mrPlannedRows').onchange=e=>{
  if(busy||!autoPlan||!e.target.classList.contains('plan-pick'))return;
  const row=model?.plannedRows?.[Number(e.target.dataset.planIndex)];
  if(row&&!row.saved){row.checked=e.target.checked;paint();}
 };
 q('#mrPlanAll').onchange=()=>{if(busy||!autoPlan)return;visiblePlannedRows().forEach(r=>{r.checked=q('#mrPlanAll').checked;});paint();};
 q('#mrSavePlans').onclick=async(batchSummary='')=>{if(isReadOnlySource()){setStatus('既有申報目前僅供查閱，不能儲存加班預排。');return;}
  if(busy||!model||!autoPlan)return;
  const selected=visiblePlannedRows().filter(r=>r.checked&&!r.saved);if(!selected.length)return;
  if(!confirm('將勾選的 '+selected.length+' 筆建議儲存為預排？尚未確認出勤，不會列為正式加班；例休週期待核項目仍需核對。'+(typeof batchSummary==='string'?batchSummary:'')))return;
  busy=true;stop=false;el.dataset.preplanLocked='true';controls(true);let failure='',latest=null,verified=null,activeRow=null;
  // Only retry read operations on lock contention. A write with an uncertain
  // result must be reconciled by its original report ID, never blindly retried.
  const readPreplanSnapshot=async(readback,progress)=>{
   for(let attempt=0;;attempt++){
    try{return await a.snapshot(loadedMonth,readback,false,true);}
    catch(error){
     if(attempt>=2||!/雲端正處理其他操作|排班讀取等待|未取得鎖/.test(String(error.message||error)))throw error;
     setStatus(progress+'｜雲端忙碌，重新讀取 '+(attempt+1)+'/2');
     await new Promise(resolve=>g.setTimeout(resolve,500*(attempt+1)));
    }
   }
  };
  const exactConfirmed=(source,r)=>{
   if(!source||source.provisional===true||!Array.isArray(source.schedules))return false;
   const meta=source.schedules.find(x=>id(x.empId)===id(r.empId))?.schedule?.__meta?.[r.date];
   const report=meta?.overtimeReport;
   return report?.id===r.id&&report.planned===true&&report.category===r.category&&report.code===g.P79Overtime.report(r.rule).code&&confirmedReport(meta,report);
  };
  const markConfirmed=r=>{r.saved=true;r.checked=false;r.status='預排已儲存（未正式申報）';};
  setStatus('正在一次核對 '+selected.length+' 筆預排的雲端版本與額度…');
  try{
   latest=await readPreplanSnapshot(false,'核對雲端版本與額度');
   if(latest?.provisional===true||latest?.readOnlyDueAttendance===true||latest?.attendanceEvidence?.complete!==true)throw Error('正式考勤未完整核對，不能儲存預排');
   const batch=latest.saveContext;
   const suggested=plan(latest,loadedPeople,loadedMonth,rules,{manualOnly:false,cutoff:q('#mrCutoff').value}).plannedRows;
   const key=r=>id(r.empId)+'|'+r.date+'|'+r.category+'|'+g.P79Overtime.report(r.rule).code;
   const valid=new Set(suggested.map(key));
   // Reconcile already-confirmed candidates before any later candidate can
   // fail validation; this also removes stale rows left by an earlier timeout.
   for(const r of selected){
    if(exactConfirmed(latest,r)){r.attempted=true;r.acknowledged=true;markConfirmed(r);}
   }
   if(selected.some(r=>r.saved)){
    verified=latest;
    snapshot={...latest,saveContext:null};
    paint();controls(true);
   }
   for(const r of selected){
    if(r.saved)continue;
    r.acknowledged=false;
    if(monthlyRestElectionDay(r.date))throw Error(r.name+' '+r.date+' 為選舉日，不得建立一般未休假加班預排');
    const saved=latest.schedules?.find(x=>id(x.empId)===id(r.empId))?.schedule?.__meta?.[r.date]?.overtimeReport;
    if(saved?.id===r.id&&saved.planned===true&&saved.category===r.category&&saved.code===g.P79Overtime.report(r.rule).code){r.attempted=true;r.acknowledged=true;continue;}
    if(saved||!valid.has(key(r)))throw Error(r.name+' '+r.date+' 的班表、出勤或額度已變更，請重新讀取建議');
   }
   for(const r of selected){
    if(stop)break;
    if(r.saved)continue;
    activeRow=r;
    if(monthlyRestElectionDay(r.date))throw Error('選舉日不得建立一般未休假加班預排');
    if(r.date<today())throw Error('預排日期已過，請重新讀取');
    const progress='預排 '+(selected.indexOf(r)+1)+'／'+selected.length+'：'+r.name+' '+r.date;
    let writeError=null;
    if(!r.acknowledged){
     const draft={id:r.id,empId:r.empId,date:r.date,rule:g.P79Overtime.report(r.rule),manualPlan:true,preventReplace:false,note:'每月未休假加班預排（正式配休）',createdAt:Date.now(),directRow:true,onProgress:stage=>setStatus(progress+'｜'+stage)};
     r.attempted=true;r.status='儲存預排中／待雲端讀回';setStatus(progress+'｜上傳雲端');paint();controls(true);
     try{
      const result=await a.saveReport(draft,batch);
      if(result?.ok!==true||result.directOvertimeSaved!==true||result.id!==r.id||result.report?.planned!==true)throw Error('雲端未確認儲存為預排');
      r.acknowledged=true;
     }catch(error){writeError=error;}
    }
    r.status=writeError?'寫入結果未確認／待雲端讀回':'雲端已接收／待雲端讀回';setStatus(progress+'｜核對原申報編號');paint();controls(true);
    const fresh=await readPreplanSnapshot(true,progress);
    if(!exactConfirmed(fresh,r))throw writeError||Error('雲端讀回未確認，保留原編號供核對');
    verified=fresh;
    markConfirmed(r);
    snapshot={...latest,schedules:fresh.schedules,leaveDates:fresh.leaveDates,leaveCoverAssignments:fresh.leaveCoverAssignments,approvedLeaves:fresh.approvedLeaves,saveContext:null};
    setStatus('已確認 '+selected.filter(x=>x.saved).length+'／'+selected.length+' 筆｜'+r.name+' '+r.date+' 預排成功');
    paint();controls(true);
    activeRow=null;
    // Yield between records so the visible list updates before the next write.
    await new Promise(resolve=>g.setTimeout(resolve,0));
   }
  }catch(error){
   failure=(activeRow?activeRow.name+' '+activeRow.date+'：':'')+String(error.message||error);
   if(activeRow&&!activeRow.saved){activeRow.checked=true;activeRow.status='預排未確認：'+String(error.message||error);}
  }finally{
   const saved=selected.filter(r=>r.saved).length;
   // Refresh saved roster on partial success as well; retain original
   // candidate IDs and retry state until uncertain writes are reconciled.
   const refreshed=verified||latest;
   if(refreshed&&Array.isArray(refreshed.schedules)&&!refreshed.provisional){
    snapshot={...(latest||snapshot),schedules:refreshed.schedules,leaveDates:refreshed.leaveDates,leaveCoverAssignments:refreshed.leaveCoverAssignments,approvedLeaves:refreshed.approvedLeaves,saveContext:null};
   }
   // Reuse confirmed roster and already-read attendance; no redundant full reload.
   if(saved===selected.length&&!failure&&latest&&verified&&!stop){
    try{
     snapshot={...latest,schedules:verified.schedules,leaveDates:verified.leaveDates,leaveCoverAssignments:verified.leaveCoverAssignments,approvedLeaves:verified.approvedLeaves,saveContext:null};
     model=plan(snapshot,loadedPeople,loadedMonth,rules,{manualOnly:!autoPlan,cutoff:q('#mrCutoff').value});
     g.p79UpdateMonthlyRestPlans?.(loadedMonth,model.plannedRows||[],loadedPeople);
    }catch(error){failure='預排已確認，但畫面額度更新未完成：'+String(error.message||error);}
   }
   setStatus('本次已確認雲端儲存 '+saved+' 筆預排；成功項目已移至已預排／待核對（未正式申報加班）。'+(failure?'未完成：'+failure:'')+(selected.some(r=>!r.saved)?'其餘保留選取，請核對後重試。':''));
   busy=false;delete el.dataset.preplanLocked;try{paint();}finally{controls(false);}
   g.setTimeout?.(()=>{try{a.refresh?.();}catch(error){console.warn('預排已核對，統計更新失敗',error);}},0);
  }
 };
 q('#mrSave').onclick=async(batchSummary='')=>{if(isReadOnlySource()){setStatus('既有申報目前僅供查閱，不能送出正式申報。');return;}
  if(busy||!model)return;
  const hasFormal=visibleRows().some(({r})=>r.checked&&!r.saved&&!r.planned);
  if(!hasFormal&&autoPlan&&!autoHistoricalReady())return q('#mrSavePlans').onclick();
  if(!hasFormal&&manualPeople.size)return q('#mrNewPlan').onclick();
  if(!workflowStage(loadedMonth).canSubmit){setStatus('尚未到該申報月份，不能送出正式加班。');return;}
  const selected=visibleRows().map(({r})=>r).filter(r=>r.checked&&!r.saved&&!r.planned);if(!selected.length)return;
  if(!backfillContext(loadedMonth).historical&&!confirm('正式申報目前篩選內 '+selected.length+' 筆已配對日期及時段？'+(typeof batchSummary==='string'?batchSummary:'')))return;
  const context=backfillContext(loadedMonth);
  if(context.historical&&!confirm('跨月補報 '+selected.length+' 筆：實際加班及額度仍歸 '+context.sourceMonth+'，只在 '+context.handlingMonth+' 辦理補報。系統將重新驗證原月份的完整出勤、既有加班與時數；確認繼續嗎？'+(typeof batchSummary==='string'?batchSummary:'')))return;
  if(selected.some(r=>r.planned||r.date>today())){setStatus('含尚未完成出勤的預排日期，不得作為已發生的正式加班。');return;}
  if(selected.some(r=>r.category==='例')&&!confirm('例假出勤須符合法定天災、事變或突發事件等例外。請確認具備法定事由及證明，不能只為補滿未休額度。仍要進入正式核對嗎？'))return;
  const seen=new Set();for(const r of selected){const key=id(r.empId)+'|'+r.date;if(!r.date.startsWith(loadedMonth+'-')||r.date>today()||seen.has(key)){setStatus('日期不符或同一人同日重複，請調整後再申報。');return;}seen.add(key);}
  if(selected.some(r=>!fullDayRule(r.rule))){setStatus('未休假加班只允許完整8小時的申報，不能用未滿8小時、超過8小時或申報時段不足8小時的規則。');return;}
  busy=true;stop=false;controls(true);lastFailure='';let count=0,failure='',batch=null,verifiedSnapshot=null,activeRow=null;
  try{
   setStatus('正在重新核對未休額度與已申報紀錄…');
   const fresh=await a.snapshot(loadedMonth,false,false,true),available=new Map(),usage=new Map();batch=fresh.saveContext;
   if(fresh?.provisional===true||fresh?.readOnlyDueAttendance===true||fresh?.attendanceEvidence?.complete!==true)throw Error('正式考勤尚未完整核對，本次未送出正式申報');
   for(const emp of loadedPeople.filter(emp=>selected.some(r=>id(r.empId)===id(emp.empId)))){const roster=fresh.schedules.find(x=>id(x.empId)===id(emp.empId))?.schedule;if(!roster)throw Error(emp.name+' 班表已變更，請重新讀取');available.set(id(emp.empId),balance(emp,roster,loadedMonth,fresh).remaining);}
   for(const r of selected){activeRow=r;const roster=fresh.schedules.find(x=>id(x.empId)===id(r.empId))?.schedule,meta=roster?.__meta?.[r.date]||{};
    if(meta.overtimeReport?.id===r.id&&meta.overtimeReport.planned!==true&&meta.overtimeReport.category===r.category&&meta.overtimeReport.code===g.P79Overtime.report(r.rule).code){r.saved=true;r.checked=false;r.status='已核對儲存成功';continue;}
    if(monthlyRestElectionDay(r.date))throw Error(r.name+' '+r.date+' 為選舉日，請改用特殊加班申報');
    if(r.date<forwardReportStart(loadedMonth,q('#mrCutoff').value))throw Error(r.name+' 早於你設定的本次申報起日，請重新讀取');
    // Genuine completed attendance remains on its ORIGINAL day even if reported later.
    // The existing-date/report, leave, verified-hours and single-rule checks below stay mandatory.
    if(meta.overtimeReport||meta.overtime||meta.forEmpId||meta.coverAssignmentId||(fresh.leaveDates||[]).includes(id(r.empId)+'|'+r.date)||g.P79RestAttendance?.isLeaveDay(fresh,r.empId,r.date,roster))throw Error(r.name+' '+r.date+' 已有加班、代班或請假，請重新讀取');
    const attendance=(fresh.pairs||[]).filter(p=>id(p.empId)===id(r.empId)&&p.date===r.date);
    if(attendance.length!==1||!attendance[0].start||!attendance[0].end)throw Error(r.name+' '+r.date+' 出勤不完整或多班次，不能申報');
    if(!fullDayEvidence(fresh,r.empId,r.date,attendance[0]))throw Error(r.name+' '+r.date+' 實際工作未核對滿8小時或有非工作休息未扣除，不能申報');
    if(cats.includes(roster?.[r.date])&&roster[r.date]!==r.category)throw Error(r.name+' '+r.date+' 原定假別與申報假別不符');
    const latestRule=ruleFor(r.date,roster,attendance[0],r.category,rules);
    if(!latestRule||JSON.stringify(latestRule)!==JSON.stringify(r.rule))throw Error(r.name+' '+r.date+' 的出勤與選擇的加班時段規則不一致，請重新讀取');
    if(!balance(loadedPeople.find(e=>id(e.empId)===id(r.empId)),roster,loadedMonth,fresh).dates.includes(r.date))throw Error(r.name+' 日期早於報到日，請重新選擇');
    const key=id(r.empId)+'|'+r.category,n=(usage.get(key)||0)+1;usage.set(key,n);if(n>(available.get(id(r.empId))?.[r.category]||0))throw Error(r.name+'「'+r.category+'」勾選超過目前未休額度，請減少勾選或重新讀取');
   }
   paint();controls(true);
   for(const r of selected){if(stop)break;if(r.saved)continue;activeRow=r;setStatus('正在申報 '+(count+1)+'／'+selected.length+'：'+r.name+' '+r.date+' '+r.rule[1]);
    const draft={id:r.id,empId:r.empId,date:r.date,rule:g.P79Overtime.report(r.rule),forEmpId:'',note:backfillContext(loadedMonth).note,preventReplace:false,createdAt:Date.now()};
    const hadUnconfirmedAttempt=!!r.attempted;
    sessionStorage.setItem(KEY,JSON.stringify(draft));r.attempted=true;r.status='送出中／待雲端讀回';paint();controls(true);
    let result;try{result=await a.saveReport(draft,batch);}catch(error){
     // An explicit edit-lock refusal is not an ambiguous write. Never re-read the
     // whole locked roster just to verify a request the server refused. Preserve
     // any earlier uncertain attempt, and never bypass another editor's lock.
     if(!hadUnconfirmedAttempt&&isExplicitScheduleEditRefusal(error)){
      r.attempted=false;r.checked=true;r.status='班表編輯中，本次未送出成功';
      if(!model.rows.some(row=>row.attempted&&!row.saved))sessionStorage.removeItem(KEY);
     }else r.status='未確認成功：'+String(error?.message||error);
     paint();controls(true);throw error;
    }
    if(result?.ok!==true||result.directOvertimeSaved!==true||result.id!==draft.id)throw Error('雲端尚未確認接收此筆申報');
    r.acknowledged=true;r.checked=false;r.status='雲端已接收／批次核對中';count++;paint();controls(true);
   }
  }catch(e){failure=(activeRow?activeRow.name+' '+activeRow.date+'：':'')+String(e?.message||e);if(activeRow&&!activeRow.attempted&&!activeRow.saved)activeRow.status='申報核對失敗：'+failure;}
  finally{
   const pending=model.rows.filter(r=>r.attempted&&!r.saved);
   if(pending.length){
    setStatus('正在一次核對 '+pending.length+' 筆雲端申報…');
    try{
     const verified=await a.snapshot(loadedMonth,true,false,true);
     verifiedSnapshot=verified;
     for(const r of pending){const report=verified.schedules.find(x=>id(x.empId)===id(r.empId))?.schedule?.__meta?.[r.date]?.overtimeReport;
      if(report?.id===r.id&&report.planned!==true&&report.category===r.category&&report.code===g.P79Overtime.report(r.rule).code){r.saved=true;r.acknowledged=true;r.checked=false;r.status='雲端讀回已確認';}
      else{r.checked=true;r.status='讀回未確認；保留原編號重試核對';}
     }
     if(!failure&&pending.every(r=>r.saved))sessionStorage.removeItem(KEY);
    }catch(e){failure+=(failure?'；':'')+'批次讀回未確認：'+e.message;pending.forEach(r=>{r.checked=true;r.status='讀回未確認；保留原編號重試核對';});}
   }
   const confirmed=selected.filter(r=>r.saved).length,unverified=selected.filter(r=>r.attempted&&!r.saved).length;
   setStatus('本次已核對成功 '+confirmed+' 筆。'+(unverified?'另有 '+unverified+' 筆待核對。':'')+(stop?'已停止，其餘未送出。':'')+(failure?'後續停止：'+failure:'成功項目已移出待報清單。'));
   lastFailure=failure;model.quotaPreviewSuppressed=!!failure||!!stop||unverified>0;busy=false;paint();controls(false);
   if(el.open)showSubmissionResult(el,selected,failure);
   a.refresh?.();
   // 成功申報後立即用最新雲端重新建立建議，已完成項目直接消失，不需關閉重開。
   if(confirmed&&!failure&&!stop){
    try{
     const latest=verifiedSnapshot||await a.snapshot(loadedMonth,true,false,true);
     if(!el.open||q('#mrMonth').value!==loadedMonth)return;
     snapshot=latest;model=plan(latest,loadedPeople,loadedMonth,rules,{manualOnly:!autoPlan,cutoff:q('#mrCutoff').value});
     g.p79UpdateMonthlyRestPlans?.(loadedMonth,model.plannedRows||[],loadedPeople);
     paint();controls(false);
     q('#mrResult').textContent='本次雲端已確認 '+confirmed+' 筆，已從建議清單移除。';
     setStatus('雲端申報已核對 '+confirmed+' 筆；已完成項目不再顯示。'+
       (model.rows.length?'目前仍有 '+model.rows.length+' 筆可核對建議。':'目前沒有其他可申報建議。'));
    }catch(error){
     setStatus('本次已確認 '+confirmed+' 筆；重新讀取剩餘建議失敗：'+String(error?.message||error)+'。請點「讀取未休額度」重新核對。');
    }
   }
  }
 };
 // 開啟時只讀核對，優先重用同帳號已核對的本機月份資料；沒有使用者確認不呼叫 saveReport。
 q('#mrLoad').onclick({preferLocal:true});
}
g.P79MonthlyRest={open,plan,balance,abnormalMonthlyRestPlans,selectedRestCandidateKey,matchSelectedRestCandidates,rematchSelectedRestCandidates,personPeriodSuggestions,rosterPeriodReferences,manualRestPlanIssue,existingRestOvertimeRows,automaticSupplementReviewRows,restQuotaExemptDates,rosterReviewRows,reviewAllUnits,ruleFor,rosterRestPeriod,restPeriodMatches,sortRows,reportProgress,personQuotaProgress,quotaProgressText,auditText,personSummary,workflowStage,workflowAudit,previousMonth,backfillContext,fullDayRule,fullDayEvidence,latestReportedDate,validReportCutoff,forwardReportStart,monthEndWindowDate,weeklyRestReview,futureWeekRestProtected,weeklyCycleAnchor,weeklyCycleWindow,weeklyReviewSummary,weeklyRoster,weeklyPlanIssue,originalRestDesignation,automaticRestCategory,documentedFutureRestCategory,futureRestPlanIssue,canAutoSuggestFuture};

})(window);

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
const id=x=>String(x||'').trim().toUpperCase(),today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
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
 const R=g.P79OvertimeReason;
 const exemptReportDates=new Set(dates.filter(d=>{
   const m=roster.__meta?.[d],report=m?.overtimeReport;
   if(!confirmedReport(m,report))return false;
   const exception=R?.classify?.({empId:emp.empId,date:d,meta:m,report,roster,snapshot});
   // 颱風仍按特殊日豁免；但本人正式的「休」加班不能因代班連結而豁免。
   return exception?.exempt===true&&
     (exception.kind==='typhoon'||!ownRestCoverReport(m,roster,d));
 }));
 const nonQuotaDates=new Set([...typhoonProtected,...exemptReportDates]);
 // Any 休/例/國 roster day with one complete IN/OUT pair is an actual attended day.
 // A short pair counts as attendance without inventing a full shift or approved overtime.
 // 只改統計歸屬，不將打卡直接視為已核准的加班；正式申報仍須人工確認。
 const workedRestEvidence=new Set(dates.filter(d=>{
   if(!cats.includes(String(roster[d]||'').trim())||roster.__meta?.[d]?.overtimeReport)return false;
   const pairs=(snapshot?.pairs||[]).filter(p=>id(p.empId)===id(emp.empId)&&p.date===d&&p.start&&p.end);
   return pairs.length===1&&g.P79RestAttendance?.state(snapshot,emp.empId,d)==='worked';
 }));
 const excluded=dates.filter(d=>{
   if(workedRestEvidence.has(d))return true;
   if(nonQuotaDates.has(d)||g.P79RestAttendance?.isLeaveDay(snapshot,emp.empId,d,roster)||(snapshot?.leaveDates||[]).includes(id(emp.empId)+'|'+d))return true;
   // 代別人的班不等於自己請假；有正式本人休加不可從額度中剔除。
   return (snapshot?.leaveCoverAssignments||[]).some(a=>d>=a.startDate&&d<=a.endDate&&
      (id(a.leaveEmpId)===id(emp.empId)||
       (a.workerIds||[]).some(x=>id(x)===id(emp.empId))&&!ownRestCoverReport(roster.__meta?.[d],roster,d)));
 });
 const allocated=g.p79AllocateRestMonth(roster,roster.__meta||{},month,excluded,start,end,
   [...nonQuotaDates],[...nonQuotaDates]).meta;
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
  const hasUnverifiedReport=cats.includes(r?.category)&&!verified&&r&&!storedReport(r);
  const scheduledRest=cats.includes(allocation?.restCategory)&&!allocation.restQuotaOvertime;
  const leave=g.P79RestAttendance?.isLeaveDay(snapshot,emp.empId,d,roster)||false;
  if(leave){
   ledger.push({date:d,kind:'leave',category:'',actual});
   if(verified){reported[r.category]++;ledger.push({date:d,kind:'reported',category:r.category,actual,reportId:r.id});conflicts.push({date:d,reportId:r.id,reason:'請假日期與正式加班申報重疊，保留原申報供核對'});}
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
    const kind=actual==='open'||actual==='missing'||actual==='unknown'&&snapshot?.attendanceEvidence?.complete===true?'reserved':'off';
    (kind==='reserved'?reserved:off)[allocation.restCategory]++;
    ledger.push({date:d,kind,category:allocation.restCategory,actual});
   }else if(actual==='rest')extraRestDates.push(d);
   if(verified&&actual==='rest')conflicts.push({date:d,reportId:r.id,reason:'整班無卡暫按休假分類，原申報待核對，不可直接認定實際出勤'});
  }
 }
 // Supplement the shared schedule allocation with actual, non-leave no-card days.
 for(const c of ['例','休','國']){const n=Math.min(extraRestDates.length,Math.max(0,counts[c]-off[c]-reserved[c]-reported[c]));for(const date of extraRestDates.splice(0,n)){off[c]++;ledger.push({date,kind:'off',category:c,actual:'rest'});}}
 for(const date of extraRestDates)ledger.push({date,kind:'excessRest',category:'',actual:'rest'});
 for(const c of cats){const excess=off[c]+reported[c]+reserved[c]-counts[c];if(excess>0)conflicts.push({date:'',reason:c+'已休、預排休與已申報合計超出額度'+excess+'天，請核對既有申報或排休'});}
 const remaining=Object.fromEntries(cats.map(c=>[c,Math.max(0,counts[c]-off[c]-reported[c]-reserved[c])]));
 const unused=Object.fromEntries(cats.map(c=>[c,Math.max(0,counts[c]-off[c]-reserved[c])]));
 return {quota:counts,off,reported,reserved,unused,remaining,dates,typhoonDates:[...typhoonProtected],conflicts,ledger:ledger.sort((a,b)=>a.date.localeCompare(b.date))};
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
  if(date.startsWith(month+'-')&&cats.includes(report?.category)&&confirmedReport(meta,report)&&date>last)last=date;
 }
 return last;
}
// 本月月底未休假只找 25 日以後，歷史月份另用跨月核對。
function monthEndWindowDate(month,asOf=today()){
 // 25日只代表功能開放日，不是要回補25日以前的出勤。
 // 當月自今天起判斷已完成出勤；明天以後只能預排，不能提早當成正式加班。
 const date=String(asOf||today()).slice(0,10),start=month+'-25';
 return month===date.slice(0,7)?(date>start?date:start):month+'-01';
}
// 只提供參考預警；法定七日週期必須採勞雇已約定的起點，不能擅自以每月一日重算。
function weeklyRestReview(roster,month,cycleStart=''){
 const anchor=/^\d{4}-\d{2}-\d{2}$/.test(String(cycleStart))?cycleStart:'';
 const days=Object.keys(roster||{}).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort(),groups=new Map();
 const ms=d=>Date.parse(d+'T00:00:00+08:00');
 for(const date of days){
  if(!date.startsWith(month+'-'))continue;
  // 無週期起點時，只按週日至週六提供非法律結論的參考預警。
  const base=anchor?ms(anchor):ms(date)-new Date(ms(date)+8*3600000).getUTCDay()*86400000;
  const cycle=Math.floor((ms(date)-base)/604800000),key=new Date(base+cycle*604800000+8*3600000).toISOString().slice(0,10);
  if(!groups.has(key))groups.set(key,{start:key,days:[],regular:0,rest:0});
  const week=groups.get(key),code=String(roster[date]||'').trim();
  week.days.push(date);if(code==='例')week.regular++;if(code==='休')week.rest++;
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
function ruleFor(date,roster,pair,category,rules){
 const allowed=rules.filter(r=>r[0]===category&&fullDayRule(r));
 if(pair){const found=g.P79Overtime.inferRule(pair.start,pair.end,date,allowed,category);return found||null;}
 const range={早:'08-16',中:'16-24',晚:'24-08'}[roster[date]];
 return allowed.find(r=>r[6]+'-'+r[7]===range)||null;
}
function sortRows(rows){
 const rank=r=>r.saved?2:(!r.planned&&r.status==='可申報'?0:1);
 return rows.sort((a,b)=>rank(a)-rank(b)||cats.indexOf(a.category)-cats.indexOf(b.category)||String(a.date).localeCompare(String(b.date))||String(a.name).localeCompare(String(b.name),'zh-Hant-u-co-stroke')||id(a.empId).localeCompare(id(b.empId)));
}
// 例／休／國只採用既有排班與雲端申報規則；不自造時數或申報紀錄。
function workflowStage(month,asOf=today()){
 const current=String(asOf||'').slice(0,7);
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month>current)return {key:'audit',label:'每日盤點',canSubmit:false,canSuggest:false,tip:'尚未到該月份，只核對班表及已存資料。'};
 if(month<current)return {key:'closing',label:'月底結算複核',canSubmit:true,canSuggest:true,tip:'原月份只複核已確認的8小時工作；不得往上次申報日之前補報。'};
 const day=Number(asOf.slice(8));
 if(day<15)return {key:'audit',label:'每日盤點（1～14日）',canSubmit:false,canSuggest:false,tip:'先核對例／休／國、請假與既有申報；15日起才產生建議。'};
 if(day<25)return {key:'preview',label:'未休加班預覽（15～24日）',canSubmit:false,canSuggest:true,tip:'25日以前只核對排班與出勤，不顯示月底預排於正式申報。'};
 return {key:'submit',label:'集中核對申報（25日起）',canSubmit:true,canSuggest:true,tip:'只列今天已完成且核對8小時的實際工作；明天起的日期另外預排，不往回補25日至昨天。'};
}
function workflowAudit(model){
 const result={shortage:{例:0,休:0,國:0},people:[],blocked:[],checked:0,complete:0,verified:model.rows.filter(r=>!r.planned&&r.status==='可申報').length,planned:model.rows.filter(r=>r.planned).length};
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
function plan(snapshot,people,month,rules){
 const workflow=workflowStage(month),rows=[],plannedRows=[],balances=[],issues=[],unavailable=[],states=[],rosters=new Map((snapshot.schedules||[]).map(r=>[id(r.empId),r.schedule])),pairsByKey=new Map();
 for(const pair of snapshot.pairs||[]){const key=id(pair.empId)+'|'+pair.date;if(!pairsByKey.has(key))pairsByKey.set(key,[]);pairsByKey.get(key).push(pair);}
 const leaveDates=new Set(snapshot.leaveDates||[]),currentDate=today(),historical=backfillContext(month,currentDate).historical;
 const weekOf=date=>Number(date.slice(8))<=21?0:Number(date.slice(8))<=28?1:2;
 for(const emp of people){
  const roster=rosters.get(id(emp.empId));
  if(!roster){
   const start=String(g.p79MonthlyRestContext?.employmentStart?.(emp)||'').slice(0,10);
   const monthEnd=month+'-'+String(g.p79RestQuota(month).days).padStart(2,'0');
   if(start&&start>monthEnd)continue; // 尚未到職不應列「缺本月班表」。
   issues.push(emp.name+' 沒有本月班表');unavailable.push({emp,reason:'沒有本月班表'});continue;
  }
  let b;try{b=balance(emp,roster,month,snapshot)}catch(e){issues.push(e.message);unavailable.push({emp,reason:String(e.message||'班表不完整')});continue;}
  balances.push({emp,...b});
  b.conflicts.forEach(x=>issues.push(emp.name+' '+x.date+'：'+x.reason));
  const setting=g.p79MonthlyRestContext?.weeklyCycleStart;
  const cycleStart=typeof setting==='function'?setting(emp):String(setting||'');
  const restIssues=weeklyRestReview(roster,month,cycleStart);
  for(const week of restIssues)issues.push(emp.name+' 週期起點 '+week.start+'：'+
   (week.confirmedCycle?'約定週期':'暫以週日為起點預覽')+
   ' 例假'+week.regular+'日、休息日'+week.rest+'日；請先核對原排班，勿用加班申報補足休假');
  const candidates=[],lastReported=latestReportedDate(roster,month);
  if(!workflow.canSuggest){states.push({emp,b,candidates,used:new Set(),weekCount:[0,0,0],remaining:{...b.remaining}});continue;}
  for(const date of b.dates){
   const m=roster.__meta?.[date]||{};
   if((b.typhoonDates||[]).includes(date)||date<monthEndWindowDate(month,currentDate)||date<=lastReported||!['早','中','晚','國','休','例'].includes(roster[date])||m.overtimeReport||m.overtime||m.forEmpId||m.coverAssignmentId||m.overtimeExcluded||leaveDates.has(id(emp.empId)+'|'+date)||g.P79RestAttendance?.isLeaveDay(snapshot,emp.empId,date,roster))continue;
   const pairs=pairsByKey.get(id(emp.empId)+'|'+date)||[];
   // 未來排班只可列內部「預排參考」，不能進入已確定加班／正式申報清單。
   // 若當日改排休息、沒完成打卡或實際工作不足8小時，下次核對即不生成正式候選。
   const future=!historical&&date>currentDate;
   if(future){
    if(!['早','中','晚'].includes(roster[date])||pairs.length||
      g.P79RestAttendance?.state(snapshot,emp.empId,date)!=='open'||
      !futureWeekRestProtected(roster,date,cycleStart))continue;
   }else if(pairs.length!==1||!fullDayEvidence(snapshot,emp.empId,date,pairs[0]))continue;
   const pair=future?null:pairs[0],byCategory=new Map();
   // 休息日出勤只可認列「休」；不能拿同一日去填例假或國假缺額。
   const fixed=String(roster[date]||'').trim(),categoryOptions=fixed==='休'?['休']:fixed==='例'?['例']:fixed==='國'?['國']:cats;
   for(const category of categoryOptions){const rule=ruleFor(date,roster,pair,category,rules);if(rule)byCategory.set(category,rule);}
   if(byCategory.size)candidates.push({date,pair,byCategory});
  }
  states.push({emp,b,candidates,used:new Set(),weekCount:[0,0,0],remaining:{...b.remaining}});
 }
 // Schedule the whole group together rather than finishing one person first.
 // Actual eligible attendance always precedes future plans; distribute each person's
 // dates across weeks before maximizing the number sharing each eligible date.
 for(const category of cats)for(const planned of (historical?[false]:[false,true])){
  while(true){
   const byDate=new Map();
   for(const state of states){
    if(!state.remaining[category])continue;
    const available=state.candidates.filter(c=>!state.used.has(c.date)&&(!c.pair)===planned&&c.byCategory.has(category));
    if(!available.length)continue;
    const minWeek=Math.min(...available.map(c=>state.weekCount[weekOf(c.date)]));
    for(const candidate of available){
     if(state.weekCount[weekOf(candidate.date)]!==minWeek)continue;
     if(!byDate.has(candidate.date))byDate.set(candidate.date,[]);
     byDate.get(candidate.date).push({state,candidate});
    }
   }
   if(!byDate.size)break;
   const [date,group]=[...byDate].sort((a,b)=>b[1].length-a[1].length||b[0].localeCompare(a[0]))[0];
   for(const {state,candidate} of group){
    const rule=candidate.byCategory.get(category);
    (planned?plannedRows:rows).push({id:crypto.randomUUID(),empId:state.emp.empId,name:state.emp.name,date,category,rule:rule.slice(),checked:false,status:planned?'僅供排班預排（未申報）':'可申報',planned});
    state.used.add(date);state.weekCount[weekOf(date)]++;state.remaining[category]--;
   }
  }
 }
 if(workflow.canSuggest)for(const state of states)for(const category of cats)for(let n=0;n<state.remaining[category];n++)issues.push(state.emp.name+'「'+category+'」仍有1天尚未確認休假或實際8小時工作，不向月初補報');
 return {rows:sortRows(rows),plannedRows:sortRows(plannedRows),balances,issues,unavailable,workflow};
}
// 與正式申報候選分開：未休假盤點必須保留全員、所有職稱及排班缺漏，
 // 不因當天沒有8小時打卡或已過月末候選窗口就把 F/L 等職稱隱藏。
function rosterReviewRows(model,staff){
 const balances=new Map((model?.balances||[]).map(b=>[id(b.emp.empId),b]));
 const unavailable=new Map((model?.unavailable||[]).map(b=>[id(b.emp.empId),b.reason]));
 return (staff||[]).map(emp=>{
  const key=id(emp.empId),b=balances.get(key),role=String(emp.jobTitle||emp.deptDetail||'未設定'),isFL=/F\s*[\/／]\s*L/i.test(role);
  if(!b)return unavailable.has(key)?{emp,role,isFL,missing:true,reason:unavailable.get(key),remaining:{例:0,休:0,國:0},eligible:0,unreported:0,pending:0}:null;
  const remaining=Object.fromEntries(cats.map(c=>[c,Math.max(0,Number(b.remaining?.[c])||0)]));
  const due=cats.reduce((n,c)=>n+remaining[c],0);
  const unreported=(b.ledger||[]).filter(x=>x.kind==='workedRestUnreported').length;
  const pending=(b.ledger||[]).filter(x=>x.kind==='reportedPendingAttendance').length;
  if(!due&&!unreported&&!pending)return null;
  const eligible=(model.rows||[]).filter(r=>id(r.empId)===key&&!r.saved&&!r.planned).length;
  return {emp,role,isFL,missing:false,remaining,eligible,unreported,pending};
 }).filter(Boolean).sort((a,b)=>Number(b.isFL)-Number(a.isFL)||
   String(a.role).localeCompare(String(b.role),'zh-Hant')||
   String(a.emp.name).localeCompare(String(b.emp.name),'zh-Hant'));
}
function reportProgress(model,empId=null){
 const result=Object.fromEntries(cats.map(c=>[c,{remaining:0,selected:0,saved:0,after:0,over:0}]));
 for(const b of model.balances.filter(b=>empId==null||id(b.emp.empId)===id(empId)))for(const c of cats){
  const rows=model.rows.filter(r=>id(r.empId)===id(b.emp.empId)&&r.category===c),saved=rows.filter(r=>r.saved).length,selected=rows.filter(r=>r.checked&&!r.saved).length;
  const remaining=Math.max(0,b.remaining[c]-saved),t=result[c];
  t.remaining+=remaining;t.selected+=selected;t.saved+=saved;t.after+=Math.max(0,remaining-selected);t.over+=Math.max(0,selected-remaining);
 }
 return result;
}
function personSummary(model,empId){
 const b=model.balances.find(b=>id(b.emp.empId)===id(empId));if(!b)return '';
 const p=reportProgress(model,empId);
 return ['例','休','國'].map(c=>c+p[c].remaining).join('／');
}
function auditText(model,empId){
 const b=model.balances.find(b=>id(b.emp.empId)===id(empId));if(!b)return '';
 const p=reportProgress(model,empId),label={off:'已休',reserved:'預排休',reservedOvertime:'未確認安排（不扣額度）',reported:'正式申報',exemptOvertime:'颱風／純代班加班（不計例休國額度）',reportedPendingAttendance:'已申報／出勤待核對（預留額度）',workedRestUnreported:'休息日有出勤但尚未申報（需核對）',unconfirmed:'缺少申報編號（不扣額度）',unconfirmedAssignment:'人工加班時段待核（不扣額度）',typhoon:'颱風日（不計額度）',leave:'請假（不扣例／休／國）',excessRest:'額度以外無卡休息'};
 const lines=[b.emp.name+'｜逐日額度核對',personSummary(model,empId)];
 for(const c of ['例','休','國'])lines.push(c+'：應休 '+b.quota[c]+'－已休 '+b.off[c]+'－預排休 '+b.reserved[c]+'－既有申報 '+b.reported[c]+'－本次已成功 '+p[c].saved+'＝未報 '+p[c].remaining+'；勾選 '+p[c].selected+'，報後 '+p[c].after);
 lines.push('',...(b.ledger||[]).map(x=>x.date+' '+(x.category||'')+' '+label[x.kind]+
   (x.actual==='rest'&&x.kind==='off'?'（整班無卡）':'')+
   (x.statusNote?'（'+x.statusNote+'）':'')));
 lines.push(...model.rows.filter(r=>id(r.empId)===id(empId)&&(r.saved||r.checked)).map(r=>r.date+' '+r.category+' '+(r.saved?'本次已核對成功':'本次勾選，尚未申報')));
 if(b.conflicts.length)lines.push('','需核對：',...b.conflicts.map(x=>(x.date?x.date+' ':'')+x.reason));
 return lines.join('\n');
}
function styles(){if(document.getElementById('p79MonthlyRestStyle'))return;const el=document.createElement('style');el.id='p79MonthlyRestStyle';el.textContent=`#p79MonthlyRest{width:min(1080px,calc(100vw - 24px));max-height:90dvh;padding:0;border:0;border-radius:14px;color:#0f172a;background:#fff;box-shadow:0 20px 80px #0005;font:14px sans-serif}#p79MonthlyRest::backdrop{background:#0f172a88}#p79MonthlyRest header,#p79MonthlyRest footer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;background:#f1f5f9}#p79MonthlyRest footer{flex-wrap:wrap}#p79MonthlyRest #mrResult{flex:1;min-width:150px;font-weight:700;color:#0369a1}#p79MonthlyRest .body{padding:12px 16px;overflow:auto;max-height:calc(90dvh - 120px)}#p79MonthlyRest .filters{display:flex;gap:8px;flex-wrap:wrap;align-items:end}#p79MonthlyRest label{display:flex;flex-direction:column;gap:4px;font-size:12px}#p79MonthlyRest input,#p79MonthlyRest select{border:1px solid #cbd5e1;padding:6px;border-radius:7px;background:white;color:#0f172a;max-width:100%}#p79MonthlyRest button{padding:7px 12px;border:0;border-radius:8px;background:#e2e8f0;color:#0f172a;cursor:pointer}#p79MonthlyRest button.primary{background:#0369a1;color:white}#p79MonthlyRest button:disabled{opacity:.5;cursor:wait}#p79MonthlyRest table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:12px}#p79MonthlyRest th,#p79MonthlyRest td{padding:7px 5px;border-bottom:1px solid #e2e8f0;text-align:center}#p79MonthlyRest .scroll{overflow:auto;margin-top:10px}#p79MonthlyRest .國{background:#fef3c7;color:#92400e}#p79MonthlyRest .休{background:#dbeafe;color:#1e40af}#p79MonthlyRest .例{background:#fee2e2;color:#991b1b}#p79MonthlyRest td.person{white-space:nowrap;min-width:170px}#p79MonthlyRest .person-progress{display:inline-block;padding:0;background:transparent;font-size:12px;color:#0369a1;white-space:nowrap}#p79MonthlyRest #mrStatus{white-space:pre-line;line-height:1.6;margin:10px 0;color:#475569}`;document.head.appendChild(el);}
async function open(){
 const a=g.p79MonthlyRestContext;if(!a?.canReport())return alert('沒有申報加班權限');
 if(document.getElementById('p79MonthlyRest'))return;styles();
 const el=document.createElement('dialog');el.id='p79MonthlyRest';
 el.innerHTML=`<header><b>每月未休假加班</b><button data-close>關閉</button></header><div class="body"><div class="filters"><label>加班歸屬月份<input id="mrMonth" type="month" value="${esc(a.month()||today().slice(0,7))}" max="${today().slice(0,7)}"></label><button type="button" id="mrPrior">補報上月</button><label>部門<select id="mrDept"></select></label><label>職稱<select id="mrJob"></select></label><label>人員<select id="mrEmp"></select></label><button class="primary" id="mrLoad">讀取未休／建議日期</button></div><p style="font-size:12px;color:#64748b">開啟時會自動核對班表、出勤、申報與系統時數設定。25日起可以申報，但不是從25日回補：當月只看今天已完成且核對8小時的出勤；明天起的預排獨立呈現在加班頁，不算正式申報。若實際休息則不申報。原排例假與休息日不得為湊額度擅自變更，應先核對約定七日週期（特殊彈性工時例外）。</p><div id="mrBackfill" role="status" style="font-weight:800;color:#7c3aed;margin:6px 0"></div><div id="mrPhase" role="status" style="font-weight:800;color:#0369a1;margin:8px 0"></div><div id="mrAuditSummary" role="status" style="font-size:12px;font-weight:700;color:#334155"></div><details style="margin-top:6px"><summary style="cursor:pointer;font-size:12px">逐人缺額及待核對原因</summary><pre id="mrAuditDetails" style="white-space:pre-wrap;font:12px/1.6 sans-serif"></pre></details><section id="mrNeedSection"><b id="mrNeedSummary">全員未休假及排班核對中…</b><div class="scroll"><table><thead><tr><th>職稱</th><th>姓名</th><th>未休／待核額度</th><th>班表與考勤核對</th></tr></thead><tbody id="mrNeedRows"></tbody></table></div></section><div id="mrStatus" role="status">選好月份與人員後，讀取班表及出勤紀錄。</div><b>符合正式申報條件（當日完整8小時出勤）</b><div class="scroll"><table><thead><tr><th><input id="mrAll" type="checkbox" aria-label="全選"></th><th>日期</th><th>姓名</th><th>假別</th><th>出勤時段</th><th>申報時數</th><th>狀態</th></tr></thead><tbody id="mrRows"></tbody></table></div></div><footer><button data-close>取消</button><span id="mrResult" role="status" aria-live="polite">尚未送出申報</span><button id="mrSave" class="primary" disabled>申報勾選項目</button></footer>`;
 document.body.appendChild(el);el.showModal();
 const q=s=>el.querySelector(s),setStatus=x=>q('#mrStatus').textContent=x;let busy=false,model=null,snapshot=null,rules=[],stop=false,loadedMonth='',loadedPeople=[],lastFailure='',lastCheckedDay=today();
 const people=a.employees().slice().sort((x,y)=>String(x.name).localeCompare(String(y.name),'zh-Hant-u-co-stroke'));
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
 function jobs(){q('#mrJob').innerHTML=options([...new Set(filter().map(job))],'全部職稱');names();}
 function names(){q('#mrEmp').innerHTML='<option value="">全部人員</option>'+filter().filter(e=>!q('#mrJob').value||job(e)===q('#mrJob').value).map(e=>'<option value="'+esc(e.empId)+'">'+esc(e.name)+'</option>').join('');
  if(model&&!busy)paint();
 }
 function invalidate(){lastFailure='';model=null;q('#mrRows').innerHTML='';q('#mrBackfill').textContent='';q('#mrAuditSummary').textContent='';q('#mrAuditDetails').textContent='';q('#mrResult').textContent='尚未送出申報';q('#mrSave').disabled=true;q('#mrAll').checked=false;}
 q('#mrDept').onchange=jobs;q('#mrJob').onchange=names;q('#mrEmp').onchange=()=>{if(model&&!busy)paint();};
 q('#mrMonth').onchange=()=>{if(!busy)q('#mrLoad').click();};jobs();
 function controls(disabled){
  el.querySelectorAll('.filters input,.filters select,.filters button,#mrAll,#mrRows input,#mrRows select').forEach(e=>e.disabled=disabled);
  const allowed=model?.workflow?.canSubmit===true;
  q('#mrSave').disabled=disabled||!allowed||!model?.rows.some(r=>r.checked&&!r.saved&&!r.planned);
  if(!disabled){
   q('#mrAll').disabled=!allowed||!visibleRows().some(({r})=>!r.saved&&!r.planned);
   el.querySelectorAll('#mrRows tr[data-row]').forEach(tr=>{
    const r=model?.rows[Number(tr.dataset.row)],pick=tr.querySelector('input.pick');
    if(pick)pick.disabled=!allowed||!!r?.planned;
   });
  }
  el.querySelectorAll('[data-close]').forEach(e=>{e.textContent=disabled?'完成目前這筆後停止':'關閉';});
 }
 const checkDayChange=()=>{if(!busy&&loadedMonth&&today()!==lastCheckedDay&&el.open){lastCheckedDay=today();q('#mrLoad').click();}};
  const checkInterval=g.setInterval?.(checkDayChange,30*60*1000);
  g.addEventListener?.('focus',checkDayChange);
  el.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(busy){stop=true;setStatus('將在目前這筆完成後停止，已確認儲存的資料會保留。');}else el.close();});el.oncancel=e=>{if(busy){e.preventDefault();stop=true;}};el.onclose=()=>{if(checkInterval)g.clearInterval?.(checkInterval);g.removeEventListener?.('focus',checkDayChange);el.remove();};
 function paint(){
  sortRows(model.rows);
  const progress=reportProgress(model),sum=key=>cats.reduce((n,c)=>n+progress[c][key],0);
  const personLabels=new Map(model.balances.map(b=>[id(b.emp.empId),personSummary(model,b.emp.empId)]));
  const pendingRows=visibleRows().map(({r})=>r).filter(r=>!r.saved&&!r.planned);
  q('#mrAll').checked=pendingRows.length>0&&pendingRows.every(r=>r.checked);q('#mrAll').indeterminate=pendingRows.some(r=>r.checked)&&!q('#mrAll').checked;
  const phase=workflowStage(loadedMonth);model.workflow=phase;
   const backfill=backfillContext(loadedMonth);
   q('#mrBackfill').textContent=backfill.historical
     ?'跨月補報：'+backfill.sourceMonth+' 原始加班日期與額度不變｜'+backfill.handlingMonth+' 提交處理；不佔用本月額度'
     :'加班與額度歸屬：'+loadedMonth;
   q('#mrPhase').textContent=phase.label+'｜'+phase.tip;
   const audit=workflowAudit(model);
   q('#mrAuditSummary').textContent='已核 '+audit.checked+' 人／無缺額 '+audit.complete+' 人｜待核對額度：例'+audit.shortage.例+'／休'+audit.shortage.休+'／國'+audit.shortage.國+'｜已確認8小時且可申報 '+audit.verified+' 筆｜目前篩選 '+chosenPeople().length+' 人、'+visibleRows().length+' 筆（切換職稱不須重新讀取）';
   q('#mrAuditDetails').textContent=[...audit.people,...new Set([...audit.blocked,...(model.issues||[])])].join('\n')||'本次核對沒有未補額度或衝突。';
    const review=rosterReviewRows(model,chosenPeople());
    const fl=review.filter(x=>x.isFL),missing=review.filter(x=>x.missing).length;
    const flStaff=chosenPeople().filter(e=>/F\s*[\/／]\s*L/i.test(String(e.jobTitle||e.deptDetail||'')));
    const rosterIds=new Set((snapshot?.schedules||[]).filter(x=>x.schedule).map(x=>id(x.empId)));
    const flMatched=flStaff.filter(e=>rosterIds.has(id(e.empId))).length;
    q('#mrNeedSummary').textContent='正式班表逐人核對：未休／待核 '+review.length+' 人（F/L待核 '+fl.length+'／F/L名冊 '+flStaff.length+'／班表匹配 '+flMatched+'）'+
      (missing?'｜班表不完整 '+missing+' 人':'')+'｜下表不等於可直接申報';
    q('#mrNeedRows').innerHTML=review.map(x=>{
     const quota=x.missing?'尚無法計算':'例'+x.remaining.例+'／休'+x.remaining.休+'／國'+x.remaining.國;
     const status=x.missing?'班表缺漏：'+x.reason:
       (x.unreported?'排休日有出勤未申報 '+x.unreported+' 天；':'')+
       (x.pending?'既有申報待核打卡 '+x.pending+' 天；':'')+
       (x.eligible?'本次可申報 '+x.eligible+' 筆':'本次無符合8小時及日期條件的申報');
     return '<tr><td>'+esc(x.role)+'</td><td>'+esc(x.emp.name)+'</td><td>'+esc(quota)+'</td><td>'+esc(status)+'</td></tr>';
    }).join('')||'<tr><td colspan="4">目前篩選內無未休額度或待核人員</td></tr>';
   q('#mrSave').textContent=phase.canSubmit?'申報勾選項目（'+sum('selected')+' 天）':'25日起可核對正式申報';
  q('#mrResult').textContent='已核對成功 '+model.rows.filter(r=>r.saved).length+' 筆／待核對 '+model.rows.filter(r=>r.attempted&&!r.saved).length+' 筆／待申報 '+model.rows.filter(r=>!r.saved&&!r.attempted).length+' 筆'+(lastFailure?'｜停止原因：'+lastFailure:'');
  q('#mrRows').innerHTML=visibleRows().map(({r,i})=>r.saved?'':'<tr data-row="'+i+'"><td><input class="pick" type="checkbox" '+(r.checked?'checked':'')+' '+(r.saved||r.planned||!model.workflow.canSubmit?'disabled':'')+' aria-label="申報 '+esc(r.name)+' '+r.date+'"></td><td><input class="date" type="date" value="'+r.date+'" min="'+monthEndWindowDate(loadedMonth)+'" max="'+loadedMonth+'-'+String(g.p79RestQuota(loadedMonth).days).padStart(2,'0')+'" '+(r.saved?'disabled':'')+'></td><td class="person">'+esc(r.name)+' <button type="button" class="person-progress" data-audit="'+esc(r.empId)+'" title="查看此人逐日額度核對">'+esc(personLabels.get(id(r.empId)))+'</button></td><td class="'+r.category+'"><select class="category" '+(r.saved?'disabled':'')+'>'+cats.filter(c=>rules.some(rule=>rule[0]===c&&fullDayRule(rule))).map(c=>'<option '+(c===r.category?'selected':'')+'>'+c+'</option>').join('')+'</select></td><td><select class="rule" '+(r.saved?'disabled':'')+'>'+rules.map((rule,k)=>rule[0]===r.category&&fullDayRule(rule)?'<option value="'+k+'" '+(JSON.stringify(rule)===JSON.stringify(r.rule)?'selected':'')+'>'+esc(rule[1])+'</option>':'').join('')+'</select></td><td>'+esc(r.rule[2])+' 小時'+'</td><td>'+esc(r.status)+'</td></tr>').join('');
  q('#mrSave').disabled=!phase.canSubmit||!model.rows.some(r=>r.checked&&!r.saved&&!r.planned);
 }
 q('#mrRows').onclick=e=>{const button=e.target.closest('[data-audit]');if(button&&model)alert(auditText(model,button.dataset.audit));};
 q('#mrRows').onchange=e=>{const tr=e.target.closest('[data-row]');if(!tr)return;const r=model.rows[Number(tr.dataset.row)];if(r.saved)return;if(!e.target.classList.contains('pick'))r.id=crypto.randomUUID();
  if(e.target.classList.contains('pick'))r.checked=e.target.checked;
  if(e.target.classList.contains('date')){r.date=e.target.value;r.status='日期已改，儲存時重新核對出勤';}
  if(e.target.classList.contains('category')){r.category=e.target.value;const roster=snapshot.schedules.find(x=>id(x.empId)===id(r.empId))?.schedule||{},pair=snapshot.pairs.find(p=>id(p.empId)===id(r.empId)&&p.date===r.date);r.rule=(ruleFor(r.date,roster,pair,r.category,rules)||rules.find(x=>x[0]===r.category&&fullDayRule(x))).slice();r.status='假別已改，申報前會重新核對未休額度';}
  if(e.target.classList.contains('rule')){r.rule=rules[Number(e.target.value)].slice();r.status='時段已改，儲存時重新核對出勤';}
  paint();
 };
 q('#mrAll').onchange=()=>{if(!model?.workflow?.canSubmit)return;visibleRows().forEach(({r})=>{if(!r.saved&&!r.planned)r.checked=q('#mrAll').checked;});paint();};
 q('#mrLoad').onclick=async()=>{
  if(busy)return;invalidate();busy=true;controls(true);setStatus('正在同時讀取班表、出勤及雲端加班選項…');
  try{loadedMonth=q('#mrMonth').value;
    if(loadedMonth>today().slice(0,7))throw Error('不能對未來月份先建立跨月補報');
    g.p79RestQuota(loadedMonth);loadedPeople=people.slice();if(!loadedPeople.length)throw Error('沒有可檢視的人員');
   const [data,options]=await Promise.all([a.snapshot(loadedMonth,false,false,true),g.P79Overtime.loadRules()]);snapshot=data;rules=options.rows;model=plan(snapshot,loadedPeople,loadedMonth,rules);g.p79UpdateMonthlyRestPlans?.(loadedMonth,model.plannedRows||[],loadedPeople);paint();
   const pendingIssues=[...new Set(model.issues.filter(issue=>!issue.includes('已休、預排休與已申報合計超出額度')))];
   setStatus('已讀取 '+loadedPeople.length+' 位人員；切換部門、職稱或姓名會立即篩選，不會重新抓雲端資料；先前勾選的項目也會保留。'+(pendingIssues.length?'另有 '+pendingIssues.length+' 項仍待核對，請展開「逐人缺額及待核對原因」查看；已完成的項目不重複提示。':'本次沒有其他未解決的提示。'));

  }catch(e){setStatus('讀取失敗：'+e.message);}finally{busy=false;controls(false);}
 };
 q('#mrPrior').onclick=()=>{if(busy)return;q('#mrMonth').value=previousMonth(today().slice(0,7));q('#mrLoad').click();};
 q('#mrSave').onclick=async()=>{
  if(busy||!model)return;
  if(!workflowStage(loadedMonth).canSubmit){setStatus('尚未到集中申報期間：15日起提出建議，25日起核對正式送出。');return;}
  const selected=model.rows.filter(r=>r.checked&&!r.saved);if(!selected.length)return;
  const context=backfillContext(loadedMonth);
  if(context.historical&&!confirm('跨月補報 '+selected.length+' 筆：實際加班及額度仍歸 '+context.sourceMonth+'，只在 '+context.handlingMonth+' 辦理補報。系統將重新驗證原月份的完整出勤、既有加班與時數；確認繼續嗎？'))return;
  if(selected.some(r=>r.planned||r.date>today())){setStatus('含尚未完成出勤的預排日期，不得作為已發生的正式加班。');return;}
  if(selected.some(r=>r.category==='例')&&!confirm('例假出勤須符合法定天災、事變或突發事件等例外。請確認具備法定事由及證明，不能只為補滿未休額度。仍要進入正式核對嗎？'))return;
  const seen=new Set();for(const r of selected){const key=id(r.empId)+'|'+r.date;if(!r.date.startsWith(loadedMonth+'-')||r.date<monthEndWindowDate(loadedMonth)||seen.has(key)){setStatus('日期不符或同一人同日重複，請調整後再申報。');return;}seen.add(key);}
  if(selected.some(r=>!fullDayRule(r.rule))){setStatus('未休假加班只允許完整8小時的申報，不能用未滿8小時、超過8小時或申報時段不足8小時的規則。');return;}
  busy=true;stop=false;controls(true);lastFailure='';let count=0,failure='',batch=null;
  try{
   setStatus('正在重新核對未休額度與已申報紀錄…');
   const fresh=await a.snapshot(loadedMonth,false,false,true),available=new Map(),usage=new Map();batch=fresh.saveContext;
   for(const emp of loadedPeople.filter(emp=>selected.some(r=>id(r.empId)===id(emp.empId)))){const roster=fresh.schedules.find(x=>id(x.empId)===id(emp.empId))?.schedule;if(!roster)throw Error(emp.name+' 班表已變更，請重新讀取');available.set(id(emp.empId),balance(emp,roster,loadedMonth,fresh).remaining);}
   for(const r of selected){const roster=fresh.schedules.find(x=>id(x.empId)===id(r.empId))?.schedule,meta=roster?.__meta?.[r.date]||{};
    if(meta.overtimeReport?.id===r.id&&meta.overtimeReport.category===r.category&&meta.overtimeReport.code===g.P79Overtime.report(r.rule).code){r.saved=true;r.checked=false;r.status='已核對儲存成功';continue;}
    if(r.date<monthEndWindowDate(loadedMonth))throw Error(r.name+' '+r.date+' 當月不回補今天之前的日期，請改從今日以後核對');
    if(r.date<=latestReportedDate(roster,loadedMonth))throw Error(r.name+' '+r.date+' 已早於或等於上次已申報日期，不得月底往前補');
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
   for(const r of selected){if(stop)break;if(r.saved)continue;setStatus('正在申報 '+(count+1)+'／'+selected.length+'：'+r.name+' '+r.date+' '+r.rule[1]);
    const draft={id:r.id,empId:r.empId,date:r.date,rule:g.P79Overtime.report(r.rule),forEmpId:'',note:backfillContext(loadedMonth).note,preventReplace:true,createdAt:Date.now()};
    sessionStorage.setItem(KEY,JSON.stringify(draft));r.attempted=true;r.status='送出中／待雲端讀回';paint();controls(true);
    let result;try{result=await a.saveReport(draft,batch);}catch(error){r.status='未確認成功：'+error.message;paint();controls(true);throw error;}
    if(result?.ok!==true||result.directOvertimeSaved!==true||result.id!==draft.id)throw Error('雲端尚未確認接收此筆申報');
    r.acknowledged=true;r.checked=false;r.status='雲端已接收／批次核對中';count++;paint();controls(true);
   }
  }catch(e){failure=e.message;}
  finally{
   const pending=model.rows.filter(r=>r.attempted&&!r.saved);
   if(pending.length){
    setStatus('正在一次核對 '+pending.length+' 筆雲端申報…');
    try{
     const verified=await a.snapshot(loadedMonth,true,false,true);
     for(const r of pending){const report=verified.schedules.find(x=>id(x.empId)===id(r.empId))?.schedule?.__meta?.[r.date]?.overtimeReport;
      if(report?.id===r.id&&report.category===r.category&&report.code===g.P79Overtime.report(r.rule).code){r.saved=true;r.acknowledged=true;r.checked=false;r.status='雲端讀回已確認';}
      else{r.checked=true;r.status='讀回未確認；保留原編號重試核對';}
     }
     if(!failure&&pending.every(r=>r.saved))sessionStorage.removeItem(KEY);
    }catch(e){failure+=(failure?'；':'')+'批次讀回未確認：'+e.message;pending.forEach(r=>{r.checked=true;r.status='讀回未確認；保留原編號重試核對';});}
   }
   const confirmed=model.rows.filter(r=>r.saved).length,unverified=model.rows.filter(r=>r.attempted&&!r.saved).length;
   setStatus('本次已核對成功 '+confirmed+' 筆。'+(unverified?'另有 '+unverified+' 筆待核對。':'')+(stop?'已停止，其餘未送出。':'')+(failure?'後續停止：'+failure:'成功項目已移出待報清單。'));
   lastFailure=failure;busy=false;paint();controls(false);a.refresh?.();
   // 成功申報後立即用最新雲端重新建立建議，已完成項目直接消失，不需關閉重開。
   if(confirmed&&!failure&&!stop){
    try{
     const latest=await a.snapshot(loadedMonth,false,false,true);
     if(!el.open||q('#mrMonth').value!==loadedMonth)return;
     snapshot=latest;model=plan(latest,loadedPeople,loadedMonth,rules);
     g.p79UpdateMonthlyRestPlans?.(loadedMonth,model.plannedRows||[],loadedPeople);
     paint();controls(false);
     q('#mrResult').textContent='本次雲端已確認 '+confirmed+' 筆，已從建議清單移除。';
     setStatus('雲端申報已核對 '+confirmed+' 筆；已完成項目不再顯示。'+
       (model.rows.length?'目前仍有 '+model.rows.length+' 筆可核對建議。':'目前沒有其他可申報建議。'));
    }catch(error){
     setStatus('本次已確認 '+confirmed+' 筆；重新讀取剩餘建議失敗：'+String(error?.message||error)+'。請點「讀取未休／建議日期」重新核對。');
    }
   }
  }
 };
 // 開啟時只讀核對，沒有使用者確認不呼叫 saveReport。
 q('#mrLoad').click();
}
g.P79MonthlyRest={open,plan,balance,rosterReviewRows,ruleFor,sortRows,reportProgress,auditText,personSummary,workflowStage,workflowAudit,previousMonth,backfillContext,fullDayRule,fullDayEvidence,latestReportedDate,monthEndWindowDate,weeklyRestReview,futureWeekRestProtected};
})(window);

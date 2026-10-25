const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
function extract(name){
 const a=html.indexOf('    function '+name+'('),b=html.indexOf('\n    }',a);
 assert(a>=0&&b>a,'function missing: '+name);
 return html.slice(a,b+6);
}
const month='2026-10',date=n=>month+'-'+String(n).padStart(2,'0');
const dates=Array.from({length:31},(_,i)=>date(i+1)),emp={id:'EMP1',name:'夜班員工'};
const roster=Object.fromEntries(dates.map(d=>[d,'早']));
roster[date(11)]='晚';roster[date(8)]='颱';
const meta={
 [date(3)]:{overtimeReport:{id:'CONFIRMED',category:'國',code:'國08-16'}},
 [date(4)]:{overtimeReport:{id:'REVOKED',category:'國'},overtimeRevocations:[{confirmed:true,reportId:'REVOKED'}],overtime:true},
 [date(5)]:{overtime:true,overtimeStart:'08:00',overtimeEnd:'16:00'},
 [date(6)]:{overtimeReports:[{id:'OT1',category:'國'},{id:'OT2',category:'國'}]},
 [date(7)]:{overtimeReport:{id:'NOT-TYPHOON',category:'國'}}
};
const marked=new Set([1,2,3,4,5,6,8,9,10,12,13].map(date));
const ts=x=>Date.parse(x+'+08:00');
const c={window:null,Date,Intl,Map,Set,Array,Object,String,Number,Math,JSON,
 monthlyScheduleData:{EMP1:roster},monthlyScheduleMeta:{EMP1:meta},
 employees:[emp],p79RestQuota:()=>({days:31,counts:{例:4,休:5,國:2}}),
 p79TyphoonDates:()=>[...marked],scheduleTaipeiTodayKey:()=>date(25),p79EmploymentStartDate:()=>'',p79ScheduleConfirmedOvertime:()=>'',p79CompactOvertimeCode:()=>'',scheduleEscapeHtml:x=>String(x||'').replace(/"/g,'&quot;'),
 p79DailyRestCount:()=>({counts:{例:4,休:5,國:2},dates:{例:[],休:[],國:[]}}),
 approvedLeaveForEmployee:(_,d)=>d===date(9)?'年假':d===date(10)?'颱風假':null,
 scheduleLeaveTypeText:x=>x,p79ScheduleLeaveExportCode:x=>x==='颱風假'?'颱':'年'};
c.window=c;vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/port79-rest-attendance.js','utf8'),c);
const schedule={...roster,__meta:meta};
const evidence=c.P79RestAttendance.build({
 complete:true,month,now:ts('2026-10-25T12:00:00'),
 schedules:[{empId:emp.id,schedule}],
 sessions:[
  {empId:emp.id,start:ts('2026-10-02T08:00:00'),end:ts('2026-10-02T16:00:00')},
  {empId:emp.id,start:ts('2026-10-11T23:30:00'),end:ts('2026-10-12T07:50:00')},
  {empId:emp.id,start:ts('2026-10-13T08:00:00'),end:null}
 ]});
assert.equal(evidence.days['EMP1|'+date(11)].state,'worked');
assert.equal(evidence.days['EMP1|'+date(12)].state,'rest','overnight work remains accounted to prior shift date');
assert.equal(evidence.workCalendarDays['EMP1|'+date(12)],true,'actual overnight hours also flag typhoon calendar date');
assert.equal(evidence.days['EMP1|'+date(13)].state,'missing','unpaired punch must stay unconfirmed');
c.p79ScheduleRestClient=()=>({status:()=>({evidence})});
for(const name of ['p79ScheduleSpecialNoPunchCode','p79ScheduleTyphoonHasWork','p79ScheduleTyphoonDays','p79ScheduleRestCountCells'])vm.runInContext(extract(name),c);
const worked=[],off=c.p79ScheduleTyphoonDays(emp,month,worked);
const values=x=>[...x].sort();
assert.deepEqual(values(worked),values([2,3,5,6,12].map(date)),'verified day + saved overtime + assigned overtime + multiple reports + overnight overlap');
assert.deepEqual(values(off),values([1,4,8,10].map(date)),'true closure, revoked report falls back to rest, manually assigned 颱, approved 颱 leave');
assert(!worked.includes(date(4)),'confirmed report revocation cannot be resurrected by stale overtime flag');
assert(!worked.includes(date(7)),'non-typhoon overtime does not count');
assert(!worked.includes(date(9)),'annual leave without work does not count');
assert(!worked.includes(date(13)),'unpaired attendance alone cannot be marked worked');
assert.equal(new Set([...worked,...off]).size,9,'one employee-date is never double counted');
let htmlCells=c.p79ScheduleRestCountCells(emp,month,{},off,worked);
assert.match(htmlCells,/>9 天<\/span>/);
assert.doesNotMatch(htmlCells,/停4／勤5|停\d+／勤\d+|出勤／加班 \d+天/);
assert.match(htmlCells,/有出勤、加班或颱風停班同一天都只算 1 筆/);
assert.equal([...htmlCells.matchAll(/<td\b/g)].length,4,'only one additional summary column');
assert.match(c.p79ScheduleRestCountCells(emp,month,{}),/>9 天<\/span>/,'async refresh recomputes both groups without visible row');
assert.equal(c.p79ScheduleTyphoonHasWork('EMP1',date(4),meta[date(4)],'rest',evidence),false);
assert.equal(c.p79ScheduleTyphoonHasWork('EMP1',date(3),meta[date(3)],'rest',evidence),true);
assert(html.includes('p79ScheduleRestCountCells(emp,yearMonth,automaticRestMeta,typhoonShownDates,typhoonWorkedDates,visibleRestDates)'));
const before=JSON.stringify({roster,meta});c.p79ScheduleRestCountCells(emp,month,{});assert.equal(JSON.stringify({roster,meta}),before,'read-only tally');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
console.log('PASS typhoon total includes marked-date attendance and overtime, saved/assigned/overnight, excludes revoked/leave/unpaired and deduplicates dates without changing quotas');

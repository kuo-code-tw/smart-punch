const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
function fn(name){
 const start=html.indexOf('    function '+name+'('),end=html.indexOf('\n    }',start);
 assert(start>=0&&end>start,'missing '+name);
 return html.slice(start,end+6);
}
const month='2026-10',emp={id:'E1',name:'測試員工'},date=n=>month+'-'+String(n).padStart(2,'0');
const shifts=Object.fromEntries(Array.from({length:31},(_,i)=>[date(i+1),'早']));
shifts[date(5)]='颱';shifts[date(10)]='休';shifts[date(17)]='休';shifts[date(29)]='國';
const approved=new Map([[date(3),'特休假'],[date(4),'颱風假']]);
const marked=[date(1),date(2),date(3),date(4),date(12),date(30)];
const states=new Map([[date(1),'rest'],[date(2),'worked'],[date(3),'rest'],
 [date(4),'rest'],[date(5),'rest'],[date(12),'open'],[date(29),'rest'],[date(30),'rest']]);
const evidence={complete:true,days:{}};
let stateReads=0,markerReads=0;
const c={window:null,Map,Set,Array,String,Number,Math,Date,JSON,
 monthlyScheduleData:{E1:shifts},monthlyScheduleMeta:{E1:{}},employees:[emp],p79RestQuota:()=>({days:31,counts:{例:4,休:5,國:2}}),
 p79ScheduleRestClient:()=>({status:()=>({evidence})}),p79TyphoonDates:()=>{markerReads++;return marked},
 scheduleTaipeiTodayKey:()=>date(25),p79EmploymentStartDate:()=>'',approvedLeaveForEmployee:(_,day)=>approved.get(day)||null,
 p79ScheduleLeaveExportCode:text=>text==='颱風假'?'颱':'年',scheduleLeaveTypeText:x=>x,
 p79ScheduleConfirmedOvertime:()=>'',p79CompactOvertimeCode:()=>'',scheduleEscapeHtml:x=>String(x).replace(/"/g,'&quot;'),
 p79DailyRestCount:()=>({counts:{例:4,休:5,國:2},dates:{例:[],休:[],國:[]}})};
c.window=c;c.P79RestAttendance={state:(snap,_id,day)=>{stateReads++;return snap?.attendanceEvidence?.complete?(states.get(day)||'worked'):'unknown'}};
vm.createContext(c);
for(const name of ['p79ScheduleSpecialNoPunchCode','p79ScheduleTyphoonHasWork','p79ScheduleTyphoonDays','p79ScheduleRestCountCells'])vm.runInContext(fn(name),c);
const days=[...c.p79ScheduleTyphoonDays(emp,month)];
assert.deepEqual(days,[date(1),date(4),date(5),date(12)],
 'only a displayed typhoon day counts: verified no-punch, approved typhoon leave, manual 颱, and known no-card/open; exclude worked/leave/non-confirmed/future');
assert(!days.includes(date(2)),'punched on typhoon day cannot be reported as a typhoon absence');
assert(!days.includes(date(3)),'approved annual leave takes precedence');
assert(!days.includes(date(30)),'future date cannot be auto declared a typhoon absence');
const before=markerReads,initialStateReads=stateReads;
let cells=c.p79ScheduleRestCountCells(emp,month,{},days);
assert.equal(markerReads,before,'known visible typhoon dates require no second marker scan');
assert.equal(stateReads,initialStateReads,'known visible dates require no extra attendance scan');
assert.match(cells,/data-rest-category="颱"/);
assert.match(cells,/>4 天<\/span>/);
assert.match(cells,/不重複計入國定假日/);
for(const category of ['例','休','國','颱'])assert(cells.includes('data-rest-category="'+category+'"'));
assert.equal([...cells.matchAll(/<td\b/g)].length,4,'three quotas plus one separate typhoon counter');
cells=c.p79ScheduleRestCountCells(emp,month,{});
assert.match(cells,/>5 天<\/span>/,'async refresh includes the one verified typhoon work day');
assert.doesNotMatch(cells,/停4／勤1|停\d+／勤\d+/);
assert.equal(markerReads,before+1);
const unsynced={...evidence,complete:false};evidence.complete=false;
shifts[date(5)]='早';approved.delete(date(4));
assert.deepEqual([...c.p79ScheduleTyphoonDays(emp,month)],[],'pending evidence must not fabricate a typhoon day');
evidence.complete=true;
// UI must use exactly the displayed shift instead of counting calendar typhoon markers alone.
assert(html.includes('else if(shownShift===\'颱\')typhoonShownDates.push(dayStr);'));
assert(html.includes('if(typhoonCounted&&typhoonWorked)typhoonWorkedDates.push(dayStr);'));
assert(html.includes('p79ScheduleRestCountCells(emp,yearMonth,automaticRestMeta,typhoonShownDates,typhoonWorkedDates,visibleRestDates)'));
assert(html.includes('title="颱風日：停班、實際出勤及加班均計入；同日只算一次，不併入國定假日額度"'));
assert(html.includes('const cells=row.querySelectorAll(\'[data-rest-category]\');'));
for(const s of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(s[1].trim())new vm.Script(s[1]);
console.log('PASS separate typhoon column, 31-day evidence/approval/attendance precedence, no quota changes, async refresh, and all inline scripts parse');

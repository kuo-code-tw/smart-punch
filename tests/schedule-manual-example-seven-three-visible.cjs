'use strict';
// 2026-11 production screenshot regression: 黃柏源 例7/0 休3/1.
// Browser selection of "例" is persisted as roster 休, with manual
// metadata—not as a raw roster 例. Verify the real calendar formatter,
// left totals, Excel exporter and repeated allocation using that storage.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const source=fs.readFileSync('assets/port79-rest-allocation.js','utf8');
const {p79AllocateRestMonth,p79RestQuota}=Function(source+
 ';return {p79AllocateRestMonth,p79RestQuota};')();
const month='2026-11',d=n=>month+'-'+String(n).padStart(2,'0');
const examples=[1,2,3,5,9,11,13],rests=[4,6,7];
const roster=Object.fromEntries(Array.from({length:30},(_,i)=>[d(i+1),'早']));
const meta={};
for(const n of examples){
 roster[d(n)]='休';
 meta[d(n)]={manualRosterShift:'例',restCategory:'例',
  restAllocationSource:'manual'};
}
for(const n of rests){
 roster[d(n)]='休';
 meta[d(n)]={manualRosterShift:'休'};
}
const original=JSON.stringify({roster,meta}),emp={id:'AP1080060',name:'黃柏源',group:'D組'};
assert.deepEqual(p79RestQuota(month).counts,{例:5,休:4,國:0});
assert.equal(Object.values(meta).filter(x=>x.restCategory==='例').length,7,
 'fixture matches screenshot's seven manually selected 例 dates');
const plan=p79AllocateRestMonth(roster,meta,month),again=p79AllocateRestMonth(roster,plan.meta,month);
const total=(m,k)=>Object.values(m).filter(x=>x.restCategory===k).length;
assert.equal(total(plan.meta,'例'),5,'surplus manual 例 is moved out of 例 quota');
assert.equal(total(plan.meta,'休'),5,'all ten off days are retained as 5例5休');
assert.equal(plan.unresolved.length,0,'no missing statutory 休');
assert.equal(plan.conflicts.length,0,'unlocked manual examples do not produce false conflicts');
assert.deepEqual(again.meta,plan.meta,'reload is idempotent');
assert.equal(JSON.stringify({roster,meta}),original,'source/manual original not overwritten');

function extract(name){
 const start=html.indexOf('    function '+name+'('),end=html.indexOf('\n    }',start);
 assert(start>=0&&end>start,name+' exists');
 return html.slice(start,end+6);
}
const ctx={
 window:null,Date,Set,Map,JSON,Math,Array,String,Number,Object,
 p79RestQuota,p79EmployeeDateEligible:()=>true,
 monthlyScheduleData:{[emp.id]:roster},
 monthlyScheduleMeta:{[emp.id]:plan.meta},
 approvedLeaveForEmployee:()=>null,p79LeaveCoverOnDay:()=>[],
 p79ConfirmedOvertimeReport:()=>false,p79ScheduleHasVerifiedPunch:()=>false,
 p79ScheduleNoPunchRest:()=>false,p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=> '',
 p79ScheduleSpecialNoPunchCode:()=>'',p79ScheduleLeaveExportCode:()=>'',scheduleLeaveTypeText:()=> '',
 scheduleTaipeiTodayKey:()=>d(16),p79TyphoonDates:()=>[],
 p79ScheduleRestBalance:()=>({quota:p79RestQuota(month).counts,
  remaining:{例:0,休:0,國:0},ledger:[]}),
 p79ScheduleSpecialSummaryColumns:()=>({typhoon:false,election:false}),
 scheduleEscapeHtml:x=>String(x||''),p79ScheduleHasOfficialData:()=>true,
 port79ScheduleDirty:false
};
ctx.window=ctx;ctx.P79RestAttendance={state:()=> 'unknown',verifiedNoWork:()=>false};
ctx.P79ScheduleRestSummary={confirmedDates:()=>[]};
vm.createContext(ctx);
for(const name of ['p79VisibleRestKind','p79ScheduleDisplayDay',
  'p79ScheduleExportDay','p79ScheduleRestCountCells'])
 vm.runInContext(extract(name),ctx);
const view={
 automaticRestMeta:plan.meta,restBalance:{ledger:[]},
 attendanceEvidence:{complete:false,actualShifts:{},actualWorkedMinutes:{}},
 attendanceSnapshot:{attendanceEvidence:{complete:false,actualShifts:{},actualWorkedMinutes:{}}},
 typhoonDays:new Set(),electionDays:new Set(),typhoonToday:d(16)
};
const visible={例:[],休:[],國:[]};
for(let n=1;n<=30;n++){
 const date=d(n),cell=ctx.p79ScheduleDisplayDay(emp,date,view);
 if(cell.visibleRestKind)visible[cell.visibleRestKind].push(date);
 assert.equal(ctx.p79ScheduleExportDay(emp,date,view),cell.visibleCode,
  'Excel code and selected calendar day must always match');
}
assert.deepEqual(JSON.parse(JSON.stringify(Object.fromEntries(
 Object.entries(visible).map(([k,v])=>[k,v.length])))),
 {例:5,休:5,國:0},'real selected date grid, not hidden tags, shows 5例5休');
const cells=ctx.p79ScheduleRestCountCells(emp,month,plan.meta,[],[],visible,
 {typhoon:false,election:false});
const displayed=kind=>cells.match(new RegExp('data-rest-category="'+kind+
 '"[^>]*><span>([^<]+)</span>'))?.[1];
assert.deepEqual([displayed('例'),displayed('休'),displayed('國')],
 ['5/0','5/0','0/0'],'left counters must not remain 7/0 and 3/1');
assert.doesNotMatch(cells,/超休|p79-rest-overquota-note|p79-rest-over-quota/,
 'no new second-line excess label increases row height');
assert.match(html,/port79-rest-allocation\.js\?v=20261116-manual-example-v4/,
 'cache-busted script actually loads on the live roster page');
// A genuinely locked manual category remains unchanged instead of being silently altered.
const locked=JSON.parse(JSON.stringify(meta));
locked[d(1)].restCategoryLocked=true;locked[d(2)].restAllocationLocked=true;
const safe=p79AllocateRestMonth(roster,locked,month);
assert.equal(safe.meta[d(1)].restCategory,'例');
assert.equal(safe.meta[d(2)].restCategory,'例');
console.log('PASS screenshot 7例3休 manually chosen shift metadata -> 5例5休, left 5/0+5/0, Excel parity; idempotent, locks/formal roster and compact row protected');

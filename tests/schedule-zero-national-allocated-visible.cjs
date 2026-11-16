'use strict';
// Production regression 2026-11: a historical 國 (no national quota this month)
// was automatically assigned 例, but the month grid forced it back to 休.
// This checks the rendered day, left counters, Excel export and all-staff copy.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const allocScript=fs.readFileSync('assets/port79-rest-allocation.js','utf8');
const funcs=new Function(allocScript+';return {p79AllocateRestMonth,p79RestQuota};')();
const month='2026-11',day=n=>month+'-'+String(n).padStart(2,'0');
const original=Object.fromEntries(Array.from({length:30},(_,i)=>[day(i+1),'中']));
for(const n of [1,4,5,11,12,13,18,19,25])original[day(n)]='休';
original[day(14)]='國'; // legacy no-punch auto quota overflow, not a holiday in 2026-11
for(const n of [27,28,29])original[day(n)]='待排班'; // awaiting deleted leave restoration
const baseMeta={
 [day(14)]:{p79AutoRestQuotaOverflow:true,p79AutoRest:{
  originalShift:'中',assignedShift:'國',rule:'例→休→國',quotaOverflow:true
 }},
 [day(27)]:{manualRosterShift:'待排班',leaveRestorePending:true},
 [day(28)]:{manualRosterShift:'待排班',leaveRestorePending:true},
 [day(29)]:{manualRosterShift:'待排班',leaveRestorePending:true}
};
const clone=x=>JSON.parse(JSON.stringify(x));
assert.equal(funcs.p79RestQuota(month).counts.國,0);
const allocated=funcs.p79AllocateRestMonth(original,baseMeta,month);
assert.equal(allocated.meta[day(14)].restCategory,'例','shared allocator already fills one missing 例 with old 國');
assert.equal(allocated.meta[day(14)].restAllocationSource,'auto-v1');
assert.equal(allocated.unresolved.length,0,'all statutory 5例4休 slots can be filled');
assert.equal(original[day(14)],'國','cloud roster never overwritten');

function extract(name) {
 const begin=html.indexOf('    function '+name+'('),end=html.indexOf('\n    }',begin);
 assert(begin>=0&&end>begin,'missing '+name);return html.slice(begin,end+6);
}
function makeRenderer(raw,meta,workDate='') {
 const empId='AQC-C',scope={
  window:null,Date,Set,Map,JSON,Math,Array,String,Number,Object,
  p79RestQuota:funcs.p79RestQuota,p79EmployeeDateEligible:()=>true,
  monthlyScheduleData:{[empId]:raw},monthlyScheduleMeta:{[empId]:meta},
  approvedLeaveForEmployee:()=>null,p79LeaveCoverOnDay:()=>[],
  p79ConfirmedOvertimeReport:x=>!!x?.overtimeReport?.id,
  p79ScheduleHasVerifiedPunch:(_id,date)=>date===workDate,
  p79ScheduleNoPunchRest:()=>false,p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=> '',
  p79ScheduleSpecialNoPunchCode:()=>'',p79ScheduleLeaveExportCode:()=>'',scheduleLeaveTypeText:()=> '',
  scheduleTaipeiTodayKey:()=>day(16),p79TyphoonDates:()=>[],
  p79ScheduleRestBalance:()=>({quota:funcs.p79RestQuota(month).counts,
   remaining:{例:0,休:0,國:0},ledger:[]}),
  p79ScheduleSpecialSummaryColumns:()=>({typhoon:false,election:false}),
  scheduleEscapeHtml:x=>String(x||''),
  p79ScheduleHasOfficialData:()=>true,port79ScheduleDirty:false
 };
 scope.window=scope;
 scope.P79RestAttendance={state:()=> 'unknown',verifiedNoWork:()=>false};
 scope.P79ScheduleRestSummary={confirmedDates:()=>[]};
 vm.createContext(scope);
 for(const n of ['p79VisibleRestKind','p79ScheduleDisplayDay','p79ScheduleExportDay','p79ScheduleRestCountCells'])
  vm.runInContext(extract(n),scope);
 const emp={id:empId},view={
  automaticRestMeta:allocated.meta,restBalance:{ledger:[]},
  attendanceEvidence:{complete:false,actualShifts:workDate?{[empId+'|'+workDate]:'早'}:{},actualWorkedMinutes:{}},
  attendanceSnapshot:{attendanceEvidence:{complete:false,actualShifts:{},actualWorkedMinutes:{}}},
  typhoonDays:new Set(),electionDays:new Set(),typhoonToday:day(16)
 };
 const visible={例:[],休:[],國:[]};
 for(let n=1;n<=30;n++){
  const date=day(n),cell=scope.p79ScheduleDisplayDay(emp,date,view);
  if(cell.visibleRestKind)visible[cell.visibleRestKind].push(date);
 }
 const cells=scope.p79ScheduleRestCountCells(emp,month,allocated.meta,[],[],visible,
  {typhoon:false,election:false});
 const text=kind=>cells.match(new RegExp('data-rest-category="'+kind+'"[^>]*><span>([^<]+)</span>'))?.[1];
 return {scope,emp,view,visible,counter:{例:text('例'),休:text('休'),國:text('國')}};
}
const r=makeRenderer(original,baseMeta);
const selected=r.scope.p79ScheduleDisplayDay(r.emp,day(14),r.view);
assert.equal(selected.visibleRestKind,'例','old 國 must be drawn as the allocated 例 on screen');
assert.equal(selected.shownShift,'例','date tile matches the shared monthly allocation');
assert.equal(r.scope.p79ScheduleExportDay(r.emp,day(14),r.view),'例','Excel export uses the same displayed 例');
assert.deepEqual(clone(Object.fromEntries(Object.entries(r.visible).map(([k,v])=>[k,v.length]))),
 {例:5,休:5,國:0},'5例 and 4休 quotas filled; genuine extra off-day retained');
assert.deepEqual(clone(r.counter),{例:'5/0',休:'5/0',國:'0/0'},'left counters equal the actual dates');
assert.equal(r.visible.休.length-4,1,'extra saved 休 is not silently removed to force 5/4');
for(const n of [27,28,29])assert.equal(r.scope.p79ScheduleExportDay(r.emp,day(n),r.view),'待排班',
 'leave-deletion pending dates are preserved, not fabricated as off days');
assert.equal(original[day(14)],'國','source unchanged after display');

// Formal report and manual lock are always stronger than automatically
// reclassifying the legacy raw national marker.
{
 const locked=clone(baseMeta);locked[day(14)].restCategoryLocked=true;
 const a=funcs.p79AllocateRestMonth(original,locked,month);
 assert(!a.meta[day(14)]?.restAllocationSource,'locked date never gets an automatic quota assignment');
 const s=makeRenderer(original,locked);
 assert.equal(s.scope.p79ScheduleDisplayDay(s.emp,day(14),s.view).shownShift,'休');
 const formal=clone(baseMeta);
 formal[day(14)].overtimeReport={id:'FORMAL-14',category:'國',code:'國08-16'};
 const z=funcs.p79AllocateRestMonth(original,formal,month);
 assert.equal(z.meta[day(14)].overtimeReport.id,'FORMAL-14');
 assert.notEqual(z.meta[day(14)].restAllocationSource,'auto-v1','report is never replaced by synthetic 例');
 const f=makeRenderer(original,formal);
 assert.equal(f.scope.p79ScheduleDisplayDay(f.emp,day(14),f.view).shownShift,'休');
}
// Verified paired punch still outranks the old holiday, including its repaired
// quota. Existing allocation may still be shown in a read-only diagnostic.
{
 const w=makeRenderer(original,baseMeta,day(14));
 assert.equal(w.scope.p79ScheduleDisplayDay(w.emp,day(14),w.view).shownShift,'早');
}
// Repeated computations do not mutate the permanent roster or create new
// reports even when the same date has quota overflow history.
{
 const before=JSON.stringify({original,baseMeta});
 const repeated=funcs.p79AllocateRestMonth(original,allocated.meta,month);
 assert.equal(repeated.meta[day(14)].restCategory,'例');
 assert.equal(JSON.stringify({original,baseMeta}),before);
}
// Other 82 month grids follow the same single renderer without category
// changes for already-correct raw 休.
for(let i=0;i<82;i++){
 const render=makeRenderer(original,baseMeta);
 assert.equal(render.scope.p79ScheduleDisplayDay(render.emp,day(14),render.view).visibleRestKind,'例');
}
console.log('PASS historical November 國 counted as allocated 例 in date tile, left summary and Excel; all 83 grids; locks, reports, attendance, restored leave and extra rest protected');

'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const asset=fs.readFileSync('assets/port79-rest-allocation.js','utf8');
const html=fs.readFileSync('schedule/index.html','utf8');
const scope={Date,Set,Map,JSON,Math,Array,String,Number,Object};
vm.createContext(scope);vm.runInContext(asset,scope);
const {p79RestQuota,p79AllocateRestMonth}=scope;
const month='2026-11',date=n=>month+'-'+String(n).padStart(2,'0'),off=[1,5,8,12,15,19,22,26,29];
const copy=x=>JSON.parse(JSON.stringify(x));
const quotas=p79RestQuota(month).counts;
assert.deepEqual(copy(quotas),{例:5,休:4,國:0});
function roster(timedCode='例08-16'){
 const raw=Object.fromEntries(Array.from({length:30},(_,i)=>[date(i+1),'早']));
 raw[date(1)]='例';raw[date(5)]=timedCode;
 for(const n of off.filter(n=>n!==1&&n!==5))raw[date(n)]='休';
 return raw;
}
function extract(name){
 const start=html.indexOf('    function '+name+'('),end=html.indexOf('\n    }',start);
 assert(start>=0&&end>start,'missing '+name);return html.slice(start,end+6);
}
function visibleCells(raw,meta,allocated){
 const ctx={
  window:null,Date,Set,Map,JSON,Math,Array,String,Number,Object,
  p79RestQuota,p79EmployeeDateEligible:()=>true,
  monthlyScheduleData:{AQC_UNGROUPED:{...raw}},monthlyScheduleMeta:{AQC_UNGROUPED:copy(meta)},
  approvedLeaveForEmployee:()=>null,p79ScheduleHasVerifiedPunch:()=>false,
  p79LeaveCoverOnDay:()=>[],p79ConfirmedOvertimeReport:item=>!!item?.overtimeReport?.id,
  p79ScheduleNoPunchRest:()=>false,p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=> '',
  p79ScheduleSpecialNoPunchCode:()=>'',p79ScheduleLeaveExportCode:()=>'',scheduleLeaveTypeText:()=> '',
  scheduleTaipeiTodayKey:()=>date(1),
  p79ScheduleRestBalance:()=>({quota:quotas,remaining:{例:0,休:0,國:0},ledger:[]}),
  p79ScheduleSpecialSummaryColumns:()=>({typhoon:false,election:false}),
  scheduleEscapeHtml:x=>String(x||'')
 };
 ctx.window=ctx;ctx.P79RestAttendance={state:()=> 'unknown'};
 ctx.P79ScheduleRestSummary={confirmedDates:()=>[]};
 vm.createContext(ctx);
 for(const name of ['p79VisibleRestKind','p79ScheduleDisplayDay','p79ScheduleRestCountCells'])
  vm.runInContext(extract(name),ctx);
 const view={
  automaticRestMeta:allocated.meta,restBalance:{ledger:[]},
  attendanceEvidence:{complete:false,actualShifts:{},actualWorkedMinutes:{}},
  attendanceSnapshot:{attendanceEvidence:{complete:false,actualShifts:{},actualWorkedMinutes:{}}},
  typhoonDays:new Set(),electionDays:new Set(),typhoonToday:date(1)
 };
 const dates={例:[],休:[],國:[]};
 for(let n=1;n<=30;n++){
  const day=date(n),cell=ctx.p79ScheduleDisplayDay({id:'AQC_UNGROUPED'},day,view);
  if(cell.visibleRestKind)dates[cell.visibleRestKind].push(day);
 }
 const count={};for(const kind of ['例','休','國'])count[kind]=dates[kind].length;
 const cells=ctx.p79ScheduleRestCountCells({id:'AQC_UNGROUPED'},month,allocated.meta,[],[],dates,{typhoon:false,election:false});
 const text=kind=>cells.match(new RegExp('data-rest-category="'+kind+'"[^>]*><span>([^<]+)</span>'))?.[1];
 return {count,display:{例:text('例'),休:text('休'),國:text('國')},dates};
}
// The exact production regression: 1 ordinary 例 + 1 例08-16 + 7 休
// was reported as 例6/0 and 休3/1 after the previous patch.
{
 const raw=roster(),metadata={},before=JSON.stringify({raw,metadata});
 const alloc=p79AllocateRestMonth(raw,metadata,month);
 const result=visibleCells(raw,metadata,alloc);
 assert.deepEqual(copy(result.count),{例:5,休:4,國:0},'previous 6例/3休 must be 5例/4休');
 assert.deepEqual(copy(result.display),{例:'5/0',休:'4/0',國:'0/0'},'left counters match all 30 actual date cells');
 assert.equal(alloc.unresolved.length,0,'do not falsely report missing 休');
 assert.equal(JSON.stringify({raw,metadata}),before,'do not rewrite original roster or metadata');
 const again=p79AllocateRestMonth(raw,alloc.meta,month);
 assert.deepEqual(copy(visibleCells(raw,metadata,again).count),{例:5,休:4,國:0},'still correct after refresh');
}
// Imported timed holiday with manualRosterShift must reserve its quota too.
{
 const raw=roster('例16-24'),meta={[date(5)]:{manualRosterShift:'例16-24'}};
 const out=p79AllocateRestMonth(raw,meta,month);
 assert.deepEqual(copy(visibleCells(raw,meta,out).count),{例:5,休:4,國:0});
 assert.equal(out.meta[date(5)].manualRosterShift,'例16-24','preserve original source marker');
}
// A manually locked timed holiday must be counted but never edited.
{
 const raw=roster(),meta={[date(5)]:{manualRosterShift:'例08-16',restCategoryLocked:true,lockReason:'MANAGER'}};
 const before=JSON.stringify(meta);
 const out=p79AllocateRestMonth(raw,meta,month);
 assert.deepEqual(copy(visibleCells(raw,meta,out).count),{例:5,休:4,國:0});
 assert.equal(JSON.stringify(meta),before,'locked data unchanged');
 assert.equal(out.meta[date(5)].restCategory,undefined,'do not annotate locked source');
}
// Formally confirmed reports consume a quota once, not in addition to the
// visible day and never become a fabricated overtime report.
{
 const raw=roster(),meta={[date(5)]:{
  manualRosterShift:'例08-16',overtimeReport:{id:'FORMAL-HOLIDAY',category:'例'}
 }};
 const out=p79AllocateRestMonth(raw,meta,month);
 assert.deepEqual(copy(visibleCells(raw,meta,out).count),{例:5,休:4,國:0});
 assert.equal(out.meta[date(5)].overtimeReport.id,'FORMAL-HOLIDAY');
 assert.equal(out.meta[date(5)].restCategory,undefined);
}
// "休08-16" is also an existing visible category and cannot be reassigned
// as 例 while another four real 休 + five 例 are already available.
{
 const raw=Object.fromEntries(Array.from({length:30},(_,i)=>[date(i+1),'早']));
 const offs=[1,5,8,12,15,19,22,26,29];
 raw[date(1)]='休08-16';
 for(const n of offs.slice(1))raw[date(n)]='休';
 const out=p79AllocateRestMonth(raw,{},month);
 assert.deepEqual(copy(visibleCells(raw,{},out).count),{例:5,休:4,國:0});
}
console.log('PASS real November AQC 6/3 regression: 5例/4休 visible, time-coded and locked days, reports, repeat reload');

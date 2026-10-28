const fs=require('fs'),vm=require('vm'),a=require('node:assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8');
function extract(name){
  const start=html.indexOf('        function '+name+'('),end=html.indexOf('\n        }',start);
  a(start>=0&&end>start,'Missing '+name);
  return html.slice(start,end+10);
}
let tokenReads=0,holidayCalls=0,monthLoads=0,rosterReads=0,renders=0;
const callbacks=[],month='2026-10',date=month+'-23';
const roster=Array.from({length:500},(_,i)=>({
  get empId(){rosterReads++;return 'E'+i;},
  schedule:{__personnel:{group:'A'},__meta:{}}
}));
const state={token:'TOKEN',ready:true,rows:roster,covers:[],people:[]};
const ctx={
  String,Number,Math,Array,Set,Map,WeakMap,Date,console,
  p79AttendanceOvertimeMonths:new Map([[month,state]]),
  attendanceRowDateIso:row=>row.dateKey,
  p79AttendanceOvertimeDate:row=>row.dateKey,
  getAttendanceTimestamp:record=>record.at,
  getAttendanceEmployeeMasterToken:()=>{tokenReads++;return 'TOKEN';},
  p79LoadAttendanceOvertimeMonth:()=>{monthLoads++;},
  window:{P79SpecialOvertime:{forShift:()=>{holidayCalls++;return [];}}},
  getTodayAttendanceIso:()=> '2026-11-01',
  p79EmploymentStartDate:()=> '',
  attendanceRowOvertimeMinutes:()=>0,
  formatDurationMinutes:()=> '0 小時',
  renderAdminRecordsTable:()=>{renders++;},
  requestAnimationFrame:fn=>callbacks.push(fn),
  p79AttendanceOvertimeRepaintQueued:false
};
vm.createContext(ctx);
for(const name of ['p79AttendanceSpecialParts','p79AttendanceLoadViewMonth','p79AttendanceRosterRows',
'p79AttendanceRosterGroup','p79AttendanceReportedOvertime','attendanceRowOvertimeText',
'p79AttendanceOvertimeSubmissionState','p79QueueAttendanceOvertimeRepaint']){
  vm.runInContext(extract(name),ctx);
}
const view={token:ctx.getAttendanceEmployeeMasterToken(),specialParts:new WeakMap(),rosterIndex:new WeakMap(),loadedMonths:new Set()};
for(let i=0;i<50;i++){
  const row={empId:'E'+i,dateKey:date,clockIn:{at:0,id:'IN'+i},clockOut:{at:1,id:'OUT'+i}};
  const emp={empId:'E'+i};
  a.equal(ctx.p79AttendanceOvertimeSubmissionState(row,emp,view),'none');
  a.equal(ctx.p79AttendanceRosterGroup(row,emp,view),'A組');
  a.match(ctx.attendanceRowOvertimeText(row,view),/0 小時/,'no overtime remains zero even with privacy/detail wrapper');
  a.equal(ctx.p79AttendanceSpecialParts(row,view).length,0);
}
a.equal(tokenReads,1,'all visible rows share one auth-token read');
a.equal(holidayCalls,50,'holiday overlap calculated exactly once per row');
a.equal(monthLoads,1,'month requested once per visible table render');
a(rosterReads<=1000,'500-person roster index is built once, not scanned per table row: '+rosterReads);
// An incomplete shift must still display a special-day/pending badge in the clock-in column.
ctx.window.P79SpecialOvertime.forShift=()=>[{date,pending:true,kinds:[{code:'颱'}]}];
const pending={dateKey:date,clockIn:{at:0}};
a.equal(ctx.p79AttendanceSpecialParts(pending,view).length,0,'missing clock-out is not a completed shift');
a.equal(ctx.p79AttendanceSpecialParts(pending,view,true)[0].pending,true,'pending special-day badge remains visible');
for(let i=0;i<60;i++)ctx.p79QueueAttendanceOvertimeRepaint();
a.equal(callbacks.length,1,'parallel month cloud responses queue one repaint');
callbacks.shift()();a.equal(renders,1);
ctx.p79QueueAttendanceOvertimeRepaint();a.equal(callbacks.length,1,'future update still repaints');
callbacks.shift()();a.equal(renders,2);
a(html.includes('p79AttendanceOvertimeSubmissionState(row, reportEmployee, overtimeView)'));
a(html.includes('p79AttendanceSpecialParts(row,overtimeView,true)'));
console.log('PASS 50 rows/500 employees: one auth read, one holiday lookup per completed row, one month request and one paint per burst; incomplete-shift badges preserved');

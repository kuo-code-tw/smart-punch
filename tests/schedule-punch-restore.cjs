const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const engine=require('../attendance/v6-engine.js');
const source=fs.readFileSync('assets/port79-schedule-punch-restore.js','utf8');
const html=fs.readFileSync('schedule/index.html','utf8');
const context={window:{P79AttendanceV6:engine},Date,Set,Map,console};
vm.createContext(context);vm.runInContext(source,context);
const restore=context.window.P79SchedulePunchRestore;
function event(id,attNo,time,status){
 return{id:id+'-'+status+'-'+time,empId:id,attNo,timeStr:time,status};
}
const emp=[
 {id:'E1',attNo:'00011',company:'公司甲',role:'領班',group:'C'},
 {id:'E2',attNo:'00012',company:'公司乙',role:'ARMG',group:'A'},
 {id:'E3',attNo:'00013',company:'公司乙',role:'指揮手',group:'C'},
 {id:'E4',attNo:'00014',company:'公司丙',role:'AQC',group:'D'}
];
const records=[
 event('E1','00011','2026/10/24 08:03:00','上班簽到'),
 event('E1','00011','2026/10/24 16:02:00','下班簽退'),
 event('E1','00011','2026/10/25 16:04:00','上班簽到'),
 event('E1','00011','2026/10/26 00:02:00','下班簽退'),
 event('E2','00012','2026/10/24 23:57:00','上班簽到'),
 event('E2','00012','2026/10/25 08:01:00','下班簽退'),
 event('E3','00013','2026/10/25 00:06:00','上班簽到'),
 event('E3','00013','2026/10/25 08:05:00','下班簽退'),
 event('E4','00014','2026/10/24 08:00:00','上班簽到')
];
const schedules={
 E1:{'2026-10-24':'休','2026-10-25':'休'},
 E2:{'2026-10-24':'休'},E3:{'2026-10-24':'休'},
 E4:{'2026-10-24':'休'}
};
const metadata={E1:{'2026-10-24':{noPunchOriginalShift:'早'},'2026-10-25':{restCategory:'例',restAllocationSource:'auto-v1'}},E2:{'2026-10-24':{restAllocationSource:'auto-v1'}}};
const plan=options=>restore.plan({records,employees:emp,schedules,metadata,month:'2026-10',today:'2026-10-27',...options});
const auto=plan();
assert.deepEqual(Array.from(auto.corrections,r=>r.empId+'|'+r.date+'|'+r.shift).sort(),[
 'E1|2026-10-24|早','E1|2026-10-25|中','E2|2026-10-24|晚'
].sort(),'only known auto-rest days are automatically corrected');
const manual=plan({allowUnmarked:true});
assert.equal(manual.corrections.length,4,'explicit preview includes legacy unmarked work/rest collision');
assert(manual.corrections.some(r=>r.empId==='E3'&&r.date==='2026-10-24'&&r.shift==='晚'),'00:06 clock-in restores previous roster date');
assert(!manual.corrections.some(r=>r.empId==='E4'),'single punch never restores');
assert.equal(plan({isProtected:(id,date)=>id==='E1'&&date==='2026-10-24'}).corrections.length,2,'approved leave remains unchanged');
const hasManual={...metadata,E1:{'2026-10-24':{manualRosterShift:'休'},'2026-10-25':{overtimeReport:{id:'SAVE-1'}}}};
assert(!plan({metadata:hasManual,allowUnmarked:true}).corrections.some(r=>r.empId==='E1'),'manual leave and formal overtime are protected');
assert(!plan({today:'2026-10-25',allowUnmarked:true}).corrections.some(r=>r.date==='2026-10-25'),'current/future date not retroactively changed');
assert.equal(restore.shiftFromClockIn(
 {timeStr:'2026/10/24 12:15:00'},{timeStr:'2026/10/24 16:15:00'}),null,'ambiguous start time never creates a work shift');
assert(html.includes('p79ApplyNoPunchRestFromOfficial(yearMonth)'),'cloud reconciliation restores work shifts automatically');
assert(html.includes('noPunchOriginalShift'),'work-to-rest preserves original for later readback');
assert(!html.includes('p79RecheckCorrectedAttendance()'),'old manual repair action is removed');
assert(html.includes('allowUnmarked:true'),'historical unmarked shift recovery no longer requires a button');
assert(!html.includes('已由正式考勤核對完整上下班打卡'),'no confirmation popup for routine automatic reconciliation');
assert(!html.includes('補卡後修正排班'),'admin repair button removed');
assert(html.includes('ctx.attendanceEvidence.actualShifts'),'actual punch shifts have priority in every date cell');
assert(html.includes('shiftForSession:row=>window.P79SchedulePunchRestore'),'actual attendance map resolves from official paired punches');
assert(!html.includes('p79-attendance-evidence-worked'),'no unwanted attendance badges');
console.log('PASS reversible punch-to-roster: 2 dates, all companies, early/middle/night, cross-midnight, actual cloud paired punches, automatic background recovery, formal leave and overtime preservation, one-sided and ambiguous safeguards');

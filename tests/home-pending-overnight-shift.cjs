'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const report=require('../assets/port79-monthly-dashboard.js');
const engine=require('../attendance/v6-engine.js');
const source=fs.readFileSync('assets/port79-monthly-dashboard.js','utf8');
const homepage=fs.readFileSync('index.html','utf8');
new vm.Script(source);
assert(homepage.includes('port79-monthly-dashboard.js?v=20261107-imported-chinese-names-v1-night-pending-fix-v2'),
 'homepage must bust the cached early-missing-checkout script');
assert(source.includes('function p79HomePendingTiming'));
assert(source.includes('const checked=await verifyAttendancePendingWithOfficial(data,ym,token,scheduleData)'));
assert(source.includes("const scheduleData=permissions().schedule?await request('schedule',ym,token,true)"),
 'the live review modal must fetch the official schedule and show its shift');
const at=v=>Date.parse(v);
const nightIn={
 id:'IN-459',empId:'E459',attNo:'459',name:'王測試',status:'上班簽到',
 timeStr:'2026/11/07 23:34:00'
};
const nightOut={
 id:'OUT-459',empId:'E459',attNo:'459',name:'王測試',status:'下班簽退',
 timeStr:'2026/11/08 07:55:00'
};
const roster={schedules:[{empId:'E459',attNo:'459',name:'王測試',schedule:{'2026-11-07':'晚'}}]};
function run(records,now,scheduleData=roster){
 globalThis.P79AttendanceV6=engine;
 return report.analyzeAttendance({records},'2026-11',null,{now:at(now),scheduleData});
}
let shifts=engine.buildShifts([nightIn]);
assert.equal(shifts.length,1);
assert.equal(shifts[0].dateKey,'2026-11-07','night punch is attributed to original work date');
assert.equal(shifts[0].clockOut,null);
let r=run([nightIn],'2026-11-08T06:27:16+08:00');
assert.equal(r.pendingShifts,0,'06:27 cannot flag the not-yet-ended night shift');
assert.deepEqual(r.pendingDetails,[]);
r=run([nightIn],'2026-11-08T07:59:59+08:00');
assert.equal(r.pendingShifts,0,'before 08:00 still on duty');
r=run([nightIn],'2026-11-08T08:30:00+08:00');
assert.equal(r.pendingShifts,0,'reasonable 60-minute post-shift grace');
r=run([nightIn],'2026-11-08T09:01:00+08:00');
assert.equal(r.pendingShifts,1,'after expected end and grace an unmatched sign-in requires review');
assert.equal(r.pendingDetails[0].reason,'缺少下班卡');
assert.equal(r.pendingDetails[0].shift,'晚','the actual verified roster shift appears in the detail row');
assert.equal(r.pendingDetails[0].clockInRecordId,'IN-459');
r=run([nightIn,nightOut],'2026-11-08T09:01:00+08:00');
assert.equal(r.pendingShifts,0,'next-day official clock-out pairs to the original workday');
r=run([nightIn],'2026-11-08T09:01:00+08:00',null);
assert.equal(r.pendingShifts,0,'unavailable roster cannot cause a premature missing-checkout verdict');
r=run([nightIn],'2026-11-08T23:35:00+08:00',null);
assert.equal(r.pendingShifts,1,'truly aged unpaired punches remain visible after 24-hour fallback');
assert.equal(r.pendingDetails[0].shift,'','unknown roster is never fabricated');
const mediumRoster={schedules:[{empId:'E459',schedule:{
 '2026-11-07':'中',__meta:{'2026-11-07':{overtime:true,overtimeEnd:'04:00'}}
}}]};
const mediumIn={...nightIn,timeStr:'2026/11/07 15:45:00'};
r=run([mediumIn],'2026-11-08T03:30:00+08:00',mediumRoster);
assert.equal(r.pendingShifts,0,'approved 16-04 extension remains working at 03:30');
r=run([mediumIn],'2026-11-08T05:01:00+08:00',mediumRoster);
assert.equal(r.pendingShifts,1,'16-04 completed overtime can be audited after 05:00');
const missingIn={...nightOut,id:'ORPHAN',timeStr:'2026/11/07 17:55:00'};
r=run([missingIn],'2026-11-08T09:01:00+08:00');
assert.equal(r.pendingShifts,1,'genuinely orphaned checkout remains visible');
assert.equal(r.pendingDetails[0].reason,'缺少上班卡');
delete globalThis.P79AttendanceV6;
console.log('PASS home pending review: 11/07 night shift stays open at 11/08 06:27, paired next-day OUT, verified roster, safe fallback, middle-shift overtime, real missing IN.');

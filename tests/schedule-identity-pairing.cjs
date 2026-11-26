'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const engine=require('../attendance/v6-engine.js');
const ctx={window:{P79AttendanceV6:engine},Date,Intl,Set,Map};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('assets/port79-schedule-punch-restore.js','utf8'),ctx);
const api=ctx.window.P79SchedulePunchRestore;
const people=[{id:'EMP232',attNo:'232',name:'測試員工'},{id:'OTHER',attNo:'233'}];
const records=[
 {id:'in',empId:'EMP232',attNo:'232',status:'上班簽到',timeStr:'2026/11/23 23:36:00'},
 {id:'out',attNo:'0232',status:'下班簽退',timeStr:'2026/11/24 07:46:00'}
];
const before=JSON.stringify(records);
const rows=api.buildAttendanceShifts(records,people);
assert.equal(rows.length,1);
assert(rows[0].clockIn&&rows[0].clockOut);
const shift=api.displayShiftFromClockIn(rows[0].clockIn,rows[0].clockOut);
assert.equal(shift.date,'2026-11-23');
assert.equal(shift.shift,'晚');
assert.equal((shift.end-shift.start)/60000,490);
assert.equal(JSON.stringify(records),before,'source punches unchanged');
const conflict=api.normalizePairingRows([{...records[1],empId:'OTHER'}],people);
assert(conflict[0].__p79PairIdentity,'conflicting identities isolated');
assert.equal(api.buildAttendanceShifts([records[0],{...records[1],empId:'OTHER'}],people).filter(r=>r.clockIn&&r.clockOut).length,0);
const html=fs.readFileSync('schedule/index.html','utf8');
assert(html.includes('buildShifts:rows=>window.P79SchedulePunchRestore.buildAttendanceShifts(rows,employees)'));
assert(html.includes('scheduleManualEditIntent && !!scheduleEditLockState.mine && p79ScheduleHasOfficialData()'),'no edit-lock bypass');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);
console.log('PASS 23:36–07:46 same employee across differing ID formats: 11/23 night, 490 min; conflicting IDs and edit locks preserved');

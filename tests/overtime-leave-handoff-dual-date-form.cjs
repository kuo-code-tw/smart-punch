'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const g={};
const context={window:g,Date,Intl,Map,Set,TextEncoder,Error};
vm.runInNewContext(fs.readFileSync('assets/port79-leave-cover-suggest.js','utf8'),context);
vm.runInNewContext(fs.readFileSync('assets/port79-overtime-report.js','utf8'),context);
const api=g.P79Overtime,validate=api.validateLeaveLinkedOvertimeDate;
const approved=['2026-11-03'];
// The date of the approved leave, not the next-day punch date, determines credit.
assert.doesNotThrow(()=>validate('2026-11-04','LEAVER',approved,'2026-11-04','2026-11-03'));
assert.throws(()=>validate('2026-11-03','LEAVER',approved,'2026-11-04','2026-11-03'),/實際出勤日.*11-04/);
assert.throws(()=>validate('2026-11-04','LEAVER',['2026-11-02'],'2026-11-04','2026-11-03'),/核准請假日期不包含/);
// All-staff variant: another Nov 14 night leave with next-morning Nov 15 punch.
assert.doesNotThrow(()=>validate('2026-11-15','LEAVER',['2026-11-14'],'2026-11-15','2026-11-14'));
assert.throws(()=>validate('2026-11-15','LEAVER',['2026-11-14'],'2026-11-14','2026-11-14'),/實際出勤日/);
// Ordinary same-day linked dates remain valid.
assert.doesNotThrow(()=>validate('2026-11-03','LEAVER',approved,'2026-11-03','2026-11-03'));
assert.throws(()=>validate('2026-11-04','LEAVER',approved),/核准請假日不符/);
const day='2026-11-03',next='2026-11-04',leaveId='L-3';
const data={leaveCoverAssignments:[{leaveId,leaveEmpId:'LEAVER',workerIds:['FIRST','SECOND'],mode:'two',startDate:day,endDate:day}],
 schedules:[{empId:'LEAVER',schedule:{[day]:'晚'}},{empId:'SECOND',schedule:{[next]:'晚'}}]};
const result=api.resolveLeaveCoverReport(data,{id:leaveId},{date:next,coverDate:day,overtimeDate:day,empId:'SECOND',forEmpId:'LEAVER'});
assert.equal(result.workdayShiftMismatch,true,'a late shift cannot masquerade as 04–08 before an early shift');
assert.equal(result.expectedNormalShift,'早');
assert.equal(result.overtimeDate,day);
assert.equal(result.workDate,next);
assert.equal(result.requirePeriodSelection,true);
const html=fs.readFileSync('assets/port79-overtime-report.js','utf8');
assert(html.includes('dateInput.min=workDate;dateInput.max=workDate'),'work day input must be locked');
assert(html.includes("dateInput.readOnly=true"),'the leave day cannot override actual work date');
assert(html.includes('｜加班歸屬日 '),'user must see original leave day explicitly');
assert(html.includes("if(prefill.leaveHandoffId&&prefill.workdayShiftMismatch===true)"),'mismatched roster must be rejected before posting');
assert(html.indexOf("if(prefill.leaveHandoffId&&prefill.workdayShiftMismatch===true)")<html.indexOf("const validation=await prepareSaveValidation(validationRequest,true)"),'roster mismatch must block preflight and save');
assert(!html.includes("請假代班申報日期不可變更；原請假／代班日期是"),'misleading legacy date error must be removed');
new vm.Script(html);
console.log('PASS linked leave date vs actual next-day workdate, UI lock, source leave validation, no incorrect shift filing');

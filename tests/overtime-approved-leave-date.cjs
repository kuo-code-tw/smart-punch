const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const js=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const work=fs.readFileSync('work-hours/index.html','utf8');
const leave=fs.readFileSync('leave/index.html','utf8');
const ctx={};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(js,ctx);
const api=ctx.P79Overtime;
const records=[
 {empId:'AN1150017',status:'已核准',startDate:'2026/10/20',endDate:'2026/10/20',id:'L20'},
 {empId:'AN1150017',status:'待審核',startDate:'2026/10/26',endDate:'2026/10/26',id:'P26'},
 {empId:'AP0940176',status:'已核準',startTime:'2026-10-21 08:00',endTime:'2026-10-22 08:00',id:'L2122'},
 {empId:'OTHER',status:'已核准',startDate:'2026-10-26',endDate:'2026-10-26'},
 {empId:'AN1150017',status:'已駁回',startDate:'2026-10-25',endDate:'2026-10-25'}
];
const list=(x,id)=>Array.from(api.approvedLeaveDateChoices(x,id));
assert.deepEqual(list(records,'AN1150017'),['2026-10-20'],'approved leave must be Oct 20, not today');
assert.deepEqual(list(records,'AP0940176'),['2026-10-21','2026-10-22'],'multi-day leave must show all dates for explicit selection');
assert.deepEqual(list(records,'UNKNOWN'),[],'no approved leave must not assume current date');
assert.deepEqual(list([{empId:'E',status:'已核准',startDate:'2026-02-30',endDate:'2026-02-30'}],'E'),[],'invalid calendar dates must not pass');
assert.doesNotThrow(()=>api.validateLeaveLinkedOvertimeDate('2026-10-20','AN1150017',list(records,'AN1150017')));
assert.throws(()=>api.validateLeaveLinkedOvertimeDate('2026-10-26','AN1150017',list(records,'AN1150017')),/不符/,'the exact screenshot defect must be rejected before POST');
assert.throws(()=>api.validateLeaveLinkedOvertimeDate('2026-10-26','AN1150017',[]),/無法核對/,'missing official leave must block linked filing');
assert.throws(()=>api.validateLeaveLinkedOvertimeDate('2026-10-26','AN1150017',[],'2026-10-20'),/不可變更/,'handoff date must be locked');
assert.doesNotThrow(()=>api.validateLeaveLinkedOvertimeDate('2026-10-20','AN1150017',[],'2026-10-20'));
assert.doesNotThrow(()=>api.validateLeaveLinkedOvertimeDate('2026-10-26','',[]),'standalone overtime may still be filed on selected date');
assert(js.includes('approvedDates.length===1')&&js.includes('dateInput.value=approvedDates[0]'),'single approved leave must fill its actual date');
assert(js.includes("dateInput.value='';leaveDateSelect.value=''"),'multiple approved dates must not silently use today');
assert(js.includes('validateLeaveLinkedOvertimeDate(date,forSelect.value,approvedDates,'),'save should reject date mismatch');
assert(js.includes('請假日期（依核准紀錄）'));
for(const html of [work,leave])assert(html.includes('approvedLeaves:()=>'),'workhours and leave must feed real leave records');
assert(work.includes('port79-overtime-report.js?v=20261028-conversion-receipt-v2'),'workhours must load latest confirmed shift-aware rules');
assert(leave.includes('port79-overtime-report.js?v=20261028-conversion-receipt-v2'),'leave handoff retains approved-date refresh marker');
console.log('PASS approved leave dates: Oct 20 not 26, correct employee, status filtering, multi-day selection, save mismatch prevention, handoff lock, standalone overtime, both page contexts');

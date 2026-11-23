'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const page=fs.readFileSync('attendance/index.html','utf8');
const a=page.indexOf('        function p79AttendanceOfficialRestCategory(');
const b=page.indexOf('        function p79AttendanceRosterGroup(',a);
assert(a>=0&&b>a,'new official day classification helper is present');
assert.match(page,/>排班例／休／國<\/th>/,'requested column header replaces old note/location label');
assert(!page.includes('>備註/地點</th>'),'obsolete location column header removed');
const start=page.indexOf('<td data-p79-schedule-rest');
assert(start>0,'verified roster label is rendered in the old location cell');
const cell=page.slice(start,page.indexOf('</td>',start)+5);
assert(cell.includes('${rosterRestHtml}'),'cell uses roster-only presenter');
assert(!/locationText|noteText|formatAttendanceLocationDisplay/.test(cell),'neither locations nor old notes appear in the new column');
assert.equal((page.match(/id="adminRecordsTableBody"/g)||[]).length,1,'original attendance grid body remains');
for(const token of [
 'data-p79-att-no','data-p79-in-id','data-p79-out-id','data-p79-in-time','data-p79-out-time',
 'onclick="p79OpenAdminAttendanceOvertime(${rowIndex})"','openRowManualAdd(',
 'deleteDailyAttendance(', 'formatEditableAttendanceTimeCell(',
 'recordStatusFilter','recordDeptFilter','recordJobTitleFilter','recordNameFilter'
])assert(page.includes(token),'no original attendance data or actions deleted: '+token);
const states=new Map(),loaded=[];
const ctx={
 p79AttendanceOvertimeDate:r=>r.dateKey,
 p79AttendanceLoadViewMonth:(month)=>loaded.push(month),
 p79AttendanceOvertimeMonths:states,
 p79AttendanceRosterRows:(state,id)=>state.rows.filter(r=>String(r.empId).toUpperCase()===id),
 getAttendanceEmployeeMasterToken:()=> 'session-1'
};
vm.createContext(ctx);
vm.runInContext(page.slice(a,b),ctx);
function state(rows,{ready=true,token='session-1',pending=false}={}) {
 states.set('2026-11',{ready,pending,token,rows});
}
const emp={empId:'E1'},row={empId:'BAD-ID-DO-NOT-USE',dateKey:'2026-11-23',noteText:'原始備註不可修改',locationText:'79號碼頭'};
const result=()=>ctx.p79AttendanceOfficialRestCategory(row,emp,{token:'session-1'});
for(const [raw,expected] of [['例','例'],['休','休'],['國','國'],['例假','例'],['休息日','休'],['國定假日','國'],['休08-16','休']]){
 state([{empId:'E1',month:'2026-11',schedule:{'2026-11-23':raw}}]);
 const actual=result();
 assert.equal(actual.state,'rest',raw+' is only a schedule classification');
 assert.equal(actual.label,expected,raw+' source label');
}
state([{empId:'E1',month:'2026-11',schedule:{'2026-11-23':'休',__meta:{'2026-11-23':{restCategory:'國'}}}}]);
assert.equal(result().label,'國','specific official rest quota overrides generic 休 marker');
state([{empId:'E1',month:'2026-11',schedule:{'2026-11-23':'早',__meta:{'2026-11-23':{restCategory:'國'}}}}]);
assert.equal(result().state,'normal','workday is not converted to a holiday by metadata alone');
state([{empId:'E2',month:'2026-11',schedule:{'2026-11-23':'例'}}]);
assert.equal(result().state,'missing','never borrow another employee schedule');
state([{empId:'E1',month:'2026-10',schedule:{'2026-11-23':'例'}}]);
assert.equal(result().state,'missing','never borrow another month schedule');
state([{empId:'E1',month:'2026-11',schedule:{'2026-11-23':'例'}}],{ready:false,pending:true});
assert.equal(result().state,'loading','uncertain load is not a confirmed rest day');
state([{empId:'E1',month:'2026-11',schedule:{'2026-11-23':'國'}}],{token:'different-login'});
assert.equal(result().state,'missing','cached schedule from another session is not shown');
state([{empId:'E1',month:'2026-11',schedule:{'2026-11-23':'例'}},{empId:'E1',month:'2026-11',schedule:{'2026-11-23':'國'}}]);
assert.equal(result().state,'conflict','inconsistent official records require review');
assert.equal(ctx.p79AttendanceOfficialRestCategory(row,null,{token:'session-1'}).state,'missing','never trust a stale row empId for identity');
assert.equal(row.noteText,'原始備註不可修改','notes untouched in original records');
assert.equal(row.locationText,'79號碼頭','location source remains intact despite hidden column');
assert(loaded.every(month=>month==='2026-11'),'only same official schedule month read');
console.log('PASS attendance 例休國 display: roster-only, staff/date identity, no location display, original attendance data preserved');

'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const page=fs.readFileSync('attendance/index.html','utf8');
const allocation=fs.readFileSync('assets/port79-rest-allocation.js','utf8');
const start=page.indexOf('        function p79AttendanceOfficialRestCategory(');
const end=page.indexOf('        function p79AttendanceRosterGroup(',start);
assert(start>=0&&end>start,'monthly schedule summary must be present');
assert.match(page,/>排班月統計（例／休／國／選）<\/th>/);
assert.match(page,/data-p79-rest-month/,'render exact month of official roster');
assert.match(page,/rosterRest\.counts\[kind\]\[0\]\+'\/'\+rosterRest\.counts\[kind\]\[1\]/,'show allocated/remaining');
assert.match(page,/data-rest-category="選"/,'show election when an event exists');
const cellStart=page.indexOf('<td data-p79-schedule-rest');
assert(cellStart>0);
const cell=page.slice(cellStart,page.indexOf('</td>',cellStart)+5);
assert(!/locationText|noteText|formatAttendanceLocationDisplay/.test(cell),'no location or notes in replacement display');
assert.match(page,/p79AttendanceOfficialRestCategory\(row,displayEmp,overtimeView\)/);
assert.match(page,/restSummary:new Map\(\)/,'per-render cache keyed by month and employee');
for(const item of ['data-p79-att-no','data-p79-in-id','data-p79-out-id',
'data-p79-in-time','data-p79-out-time','p79OpenAdminAttendanceOvertime','deleteDailyAttendance(',
'recordStatusFilter','recordDeptFilter','recordJobTitleFilter','recordNameFilter'])
 assert(page.includes(item),'original attendance action remains: '+item);
const states=new Map(),loaded=[];
const ctx={
 p79AttendanceOvertimeDate:r=>r.dateKey,
 p79AttendanceLoadViewMonth:month=>loaded.push(month),
 p79AttendanceOvertimeMonths:states,
 p79AttendanceRosterRows:(s,id)=>s.rows.filter(r=>String(r.empId).toUpperCase()===id),
 getAttendanceEmployeeMasterToken:()=> 'session-1',
 window:{
   P79SpecialOvertime:{electionDates:()=>['2026-11-28']},
   P79OfficialCalendar:{get:()=>null}
 },
 Date,Set,Map,JSON,Math,Object,Array,Number,String,RegExp
};
vm.createContext(ctx);
vm.runInContext(allocation,ctx);
vm.runInContext(page.slice(start,end),ctx);
const view=()=>({token:'session-1',restSummary:new Map()});
const emp={empId:'E1'};
const row={dateKey:'2026-11-23',noteText:'備註原樣保留',locationText:'原始地點'};
const month='2026-11';
const full=()=>{
 const schedule={};
 for(let n=1;n<=30;n++){
  const date=month+'-'+String(n).padStart(2,'0');
  const day=new Date(Date.UTC(2026,10,n)).getUTCDay();
  schedule[date]=day===0?'例':day===6?'休':'早';
 }
 return schedule;
};
const state=(rows,{token='session-1',ready=true,pending=false}={})=>
 states.set(month,{token,ready,pending,rows,people:[{empId:'E1'}]});
const result=v=>ctx.p79AttendanceOfficialRestCategory(row,emp,v||view());
state([{empId:'E1',month,schedule:full()}]);
let actual=result();
assert.equal(actual.state,'ready','complete official month loaded');
assert.deepEqual(Array.from(actual.counts.例),[5,0],'例 5/0 from 5 Sundays');
assert.deepEqual(Array.from(actual.counts.休),[4,0],'休 4/0 from 4 Saturdays');
assert.deepEqual(Array.from(actual.counts.國),[0,0],'國 0/0 when monthly quota zero');
assert.equal(actual.election,1,'選 1 from known election day');
const changed=full();
changed['2026-11-01']='早';
state([{empId:'E1',month,schedule:changed}]);
actual=result();
assert.deepEqual(Array.from(actual.counts.例),[4,1],'missing one allocated 例 shows 4/1, never fabricated');
const other=full();
state([{empId:'E2',month,schedule:other}]);
assert.equal(result().state,'missing','never use another employee schedule');
const incomplete=full();delete incomplete['2026-11-30'];
state([{empId:'E1',month,schedule:incomplete}]);
assert.equal(result().state,'missing','incomplete month never produces false counts');
state([{empId:'E1',month,schedule:full()}],{token:'different-login'});
assert.equal(result().state,'missing','reject another login cache');
state([{empId:'E1',month,schedule:full()}],{ready:false,pending:true});
assert.equal(result().state,'loading','read-in-progress shows loading');
state([{empId:'E1',month,schedule:full()},{empId:'E1',month,schedule:changed}]);
assert.equal(result().state,'conflict','contradictory duplicate employee rows blocked');
assert.equal(row.noteText,'備註原樣保留');
assert.equal(row.locationText,'原始地點');
assert(loaded.every(x=>x===month),'requests exact attendance accounting month only');
console.log('PASS verified official monthly 例5/0 休4/0 國0/0 選1 counters, user/month isolation, read-only data');

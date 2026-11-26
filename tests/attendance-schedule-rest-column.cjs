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
assert.deepEqual(Array.from(actual.counts.例),[5,0],'shared allocator reassigns flexible rest day to missing 例 quota');
assert.deepEqual(Array.from(actual.counts.休),[3,1],'one fewer total off-day leaves one 休 quota unfilled');
const other=full();
state([{empId:'E2',month,schedule:other}]);
assert.equal(result().state,'missing','never use another employee schedule');
const incomplete=full();delete incomplete['2026-11-30'];
state([{empId:'E1',month,schedule:incomplete}]);
const incompleteResult=result();
assert.equal(incompleteResult.state,'missing','incomplete month never produces false counts');
assert.equal(incompleteResult.label,'月統計缺 1 日');
assert.deepEqual(Array.from(incompleteResult.missingDates),['2026-11-30']);
assert(incompleteResult.detail.includes('不代表當日缺卡'));
assert.equal(incompleteResult.counts,undefined,'do not fabricate monthly quotas');
const incompleteWithAttendance={...row,clockIn:{timeStr:'2026/11/23 23:36'},clockOut:{timeStr:'2026/11/24 07:46'},attendanceStatus:'正常'};
const checked=ctx.p79AttendanceOfficialRestCategory(incompleteWithAttendance,emp,view());
assert.equal(checked.label,'月統計缺 1 日');
assert.equal(incompleteWithAttendance.attendanceStatus,'正常','monthly missing date does not override completed attendance');
assert.equal(incompleteWithAttendance.clockIn.timeStr,'2026/11/23 23:36');
assert.equal(incompleteWithAttendance.clockOut.timeStr,'2026/11/24 07:46');
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

assert.equal(result().state,'conflict','source state remains immutable after duplicate check');
assert.equal(ctx.p79AttendanceOfficialRestCategory({dateKey:'bad-date'},emp,view()).label,'考勤日期待核對');
assert.equal(ctx.p79AttendanceOfficialRestCategory(row,null,view()).label,'員工身分待核對');
states.set(month,{token:'session-1',ready:false,pending:false,errorLabel:'班表連線逾時，稍後重試'});
assert.equal(result().label,'班表連線逾時，稍後重試','show the actual read failure, not an endless generic placeholder');

const loaderStart=page.indexOf('        function p79LoadAttendanceOvertimeMonth(');
const loaderEnd=page.indexOf('        // Refresh schedule/overtime metadata',loaderStart);
assert(loaderStart>=0&&loaderEnd>loaderStart,'official schedule retry loader exists');
const source=page.slice(loaderStart,loaderEnd);
assert.match(source,/getScheduleDataSecure/,'use only the official secure schedule service');
assert.match(source,/setTimeout\(\(\)=>controller\.abort\(\),25000\)/,
 'official secure schedule may be slower than the former twelve second limit');
assert.match(source,/p79QueueAttendanceOvertimeRepaint\(\)/,
 'success and failure repaint the visible table');
assert.match(source,/state\.retryAfter/,'failed reads are throttled');
assert.match(source,/state\.failures<=2/,'automatic retries are bounded');
assert(!source.includes('localStorage.setItem'),'loading never writes user attendance or roster data');

(async()=>{
 const stores=new Map(),calls=[],repaints=[];
 let token='session-1',returnData={ok:true,month,schedules:[{empId:'E1',month,schedule:full()}],employees:[{empId:'E1'}]};
 const fetchContext={
  p79AttendanceOvertimeMonths:stores,
  getAttendanceEmployeeMasterToken:()=>token,
  getActiveGasUrl:()=> 'https://script.google.com/macros/s/verified/exec',
  isValidGasWebAppUrl:()=>true,
  fetch:async(url)=>{calls.push(url);return {ok:true,json:async()=>returnData};},
  p79QueueAttendanceOvertimeRepaint:()=>repaints.push('updated'),
  AbortController:class{constructor(){this.signal={};}abort(){}},
  setTimeout:(fn,ms)=>{if(ms===700)Promise.resolve().then(fn);return 1;},
  clearTimeout:()=>{}, console:{warn:()=>{}},
  document:{visibilityState:'visible'},
  Date,Map,Set,JSON,Math,Number,String,Promise,encodeURIComponent
 };
 vm.createContext(fetchContext);vm.runInContext(source,fetchContext);
 const settle=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));};
 fetchContext.p79LoadAttendanceOvertimeMonth(month,token);
 await settle();
 assert.equal(stores.get(month).ready,true,'successful secure read marks month ready');
 assert.equal(stores.get(month).rows.length,1,'verified month rows retained');
 assert.equal(repaints.length,1,'fresh rows repaint without pressing any extra button');
 assert.match(calls[0],/month=2026-11/,'query is month-scoped');
 const next='2026-10';returnData={ok:false,error:'權限不足'};
 fetchContext.p79LoadAttendanceOvertimeMonth(next,token);
 await settle();
 assert.equal(stores.get(next).pending,false,'failed request no longer hangs in pending state');
 assert.equal(stores.get(next).errorLabel,'班表權限待核對','auth failures are not mislabeled missing roster');
 assert.equal(repaints.length,2,'failure also repaints with meaningful status');
 assert.equal(calls.length,2,'authentication errors do not retry storm');
 const other='2026-09';returnData={ok:true,month:other,schedules:[{empId:'E1',month:other}],employees:[]};
 fetchContext.p79LoadAttendanceOvertimeMonth(other,token);
 token='different-login';
 await settle();
 assert.equal(stores.get(other).ready,false,'stale response from previous login is not applied');
 console.log('PASS official roster fetch: successful repaint, meaningful failure, bounded retry, token isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});


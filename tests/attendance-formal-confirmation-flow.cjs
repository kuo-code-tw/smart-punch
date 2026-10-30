'use strict';
const fs=require('node:fs'),vm=require('node:vm'),a=require('node:assert/strict');
async function run({supported=true,failed=false,active=false,canConfirm=true}={}){
 const date='2026-10-28',month='2026-10',calls=[],months=new Map(),storage=new Map();
 const schedules=[{empId:'E1',schedule:{__meta:{[date]:active?{overtimeReport:{id:'R',category:'休',code:'休08-16'}}:{}}}}];
 const c={window:null,URL,AbortController,setTimeout,clearTimeout,crypto:{randomUUID:()=> '1234567890-test'},Date,Map,Set,location:{href:'https://example.test/attendance/'},document:{getElementById:()=>null},addEventListener(){},getAttendanceEmployeeMasterToken:()=> 'TOKEN',getActiveGasUrl:()=> 'https://example.test/gas',p79AttendanceOvertimeMonths:months,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},fetch:async(url,opts)=>{calls.push({url,opts});return{ok:true,json:async()=>opts.method==='POST'?(failed?{ok:false,error:'班表正在編輯'}:{ok:true,plannedRestAttendanceVersion:1,date,attendanceConfirmed:true,cancelled:1,punchReview:1,approvedReview:1,schedules,employees:[]}):{ok:true,revision:'REV',plannedRestAttendanceVersion:supported?1:undefined,plannedRestAttendanceCanConfirm:canConfirm,schedules,employees:[]}};}};
 c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('assets/port79-attendance-overtime.js','utf8'),c);
 a.equal(calls.length,0,'passive page initialization never confirms attendance or cancels plans');
 const result=await c.P79AttendanceOvertimeDayStatus.recheckAndMarkReviewed(date,true);return{result,calls,storage};
}
(async()=>{
 let x=await run();a.equal(x.result.ok,true);a.equal(x.calls.length,2);const payload=JSON.parse(x.calls[1].opts.body);a.equal(payload.action,'confirmAttendanceDayAndReconcile');a.equal(payload.date,'2026-10-28');a.equal(payload.expectedRevision,'REV');a.equal(x.storage.size,0,'a completed attendance confirmation without active reports cannot fake a green report badge');
 x=await run({failed:true});a.equal(x.result.ok,false);a.match(x.result.message,/班表正在編輯/);a.equal(x.storage.size,0);
 x=await run({supported:false,active:true});a.equal(x.result.ok,true);a.equal(x.calls.length,1,'old GAS never receives an unsupported mutating action');a.match(x.result.message,/自動取消尚未啟用/);
 x=await run({active:true,canConfirm:false});a.equal(x.result.ok,true);a.equal(x.calls.length,1,'read-only accounts keep the existing report review without a mutating request');
 x=await run({active:true});a.equal(x.result.ok,true);a.equal(x.storage.size,1,'green receipt uses the post-confirmation report snapshot');
 console.log('PASS explicit right-click confirmation only, fresh revision, authenticated cloud receipt, old GAS compatibility, no fake green badge, failed confirmation retains pending state');
})().catch(e=>{console.error(e);process.exitCode=1;});

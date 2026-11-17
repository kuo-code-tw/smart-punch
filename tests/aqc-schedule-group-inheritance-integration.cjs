'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createStore}=require('../assets/port79-aqc-schedule-groups.js');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function extract(name){
 const start=html.indexOf('function '+name+'(');
 assert(start>=0,'Missing '+name);
 const end=html.indexOf('\n}',start);
 assert(end>start,'Incomplete '+name);
 return html.slice(start,end+2);
}
function createContext(mode='history'){
 const calls=[],rows=[];
 const c={
  Date,Map,Set,Promise,setTimeout,clearTimeout,
  console:{warn:()=>{}},gcToken:'owner',
  operationScheduleStore:null,operationScheduleOwner:'',
  operationScheduleReads:new Map(),operationScheduleQueue:[],operationScheduleRunning:0,
  normalizePersonName:v=>String(v||'').trim(),
  renderOperationScheduleStatus:()=>{},
  refreshOperationGroupView:()=>rows.push('render')
 };
 c.window={P79AqcScheduleGroups:{createStore}};
 c.apiGetQuick=async(action,params,timeout)=>{
  assert.equal(action,'getScheduleDataSecure','must only read official schedule source');
  calls.push(params.month);
  if(params.month==='2026-11'){
   const explicit=mode==='explicit';
   return {ok:true,month:'2026-11',employees:[{empId:'A1',name:'Alice',jobTitle:'AQC',group:'不分組'}],
    schedules:[{empId:'A1',month:'2026-11',schedule:{__personnel:{
     role:'AQC',group:explicit?'不分組':'不分組',groupExplicit:explicit}}}]};
  }
  if(mode==='network-error')throw Error('temporary historical service error');
  if(params.month==='2026-10')return {ok:true,month:'2026-10',
   schedules:[{empId:'A1',month:'2026-10',schedule:{__personnel:{
    role:'AQC',group:'C組',groupExplicit:true}}}]};
  throw Error('Unexpected month '+params.month);
 };
 vm.createContext(c);
 for(const name of ['currentOperationScheduleStore','operationGroupForRecord',
  'operationScheduleErrorKind','pumpOperationScheduleGroups','ensureOperationScheduleGroups']){
  vm.runInContext(extract(name),c);
 }
 return {c,calls,rows};
}
async function waitFor(fn){
 for(let i=0;i<100;i++){
  if(fn())return;
  await new Promise(resolve=>setImmediate(resolve));
 }
 throw Error('Schedule background read did not complete');
}
(async()=>{
 const row={workDate:'2026-11-12',empId:'A1',name:'Alice'};
 const inherited=createContext();
 inherited.c.ensureOperationScheduleGroups([row]);
 await waitFor(()=>inherited.c.operationScheduleReads.get('2026-11')?.status==='ready');
 assert.deepEqual(inherited.calls,['2026-11','2026-10'],'current-month schedule and previous historical group read');
 assert.equal(inherited.c.operationGroupForRecord(row),'C組','current statistics use saved schedule group inheritance');
 assert.equal(inherited.c.operationScheduleRunning,0);
 const failed=createContext('network-error');
 failed.c.ensureOperationScheduleGroups([row]);
 await waitFor(()=>failed.c.operationScheduleReads.get('2026-11')?.status==='ready');
 assert.equal(failed.c.operationScheduleReads.get('2026-11').historyUnverified,true);
 assert.equal(failed.c.operationGroupForRecord(row),'不分組','historical read failure keeps current source intact');
 const explicit=createContext('explicit');
 explicit.c.ensureOperationScheduleGroups([row]);
 await waitFor(()=>explicit.c.operationScheduleReads.get('2026-11')?.status==='ready');
 assert.deepEqual(explicit.calls,['2026-11'],'explicit unassignment must not read/override history');
 assert.equal(explicit.c.operationGroupForRecord(row),'不分組');
 assert.match(html,/port79-aqc-schedule-groups\.js\?v=20261117-schedule-history-v4/);
 assert(!/if\(month===currentMonth&&personnelGroupCode\(hrGroup\)\)/.test(html),
  'HR group field must not override the official schedule');
 console.log('PASS schedule month group inheritance, explicit overrides, unavailable history safety and source authority');
})().catch(e=>{console.error(e);process.exitCode=1;});

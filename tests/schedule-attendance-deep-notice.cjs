'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('schedule/index.html','utf8');
const core=fs.readFileSync('assets/port79-attendance-core.js','utf8');
const helperStart=html.indexOf('    let p79LastAttendanceNotice=');
const helperEnd=html.indexOf('    function p79ScheduleRestBalance(',helperStart);
assert(helperStart>=0&&helperEnd>helperStart,'focus and storage share attendance notice consumer');
const listeners={},storage=new Map(),calls=[];
let month='2026-10',token='TEST';
const client={invalidate:m=>{calls.push('invalidate:'+m);return Promise.resolve()},
 refreshIfStale:m=>{calls.push('regular:'+m);return Promise.resolve()}};
const context={console,Date,JSON,Number,Math,employees:[{id:'E1'},{id:'E2'}],
 currentScheduleMonthKey:()=>month,currentPort79SsoToken:()=>token,
 p79ScheduleRestClient:()=>client,
 localStorage:{getItem:k=>storage.get(k)||null},
 window:{addEventListener:(name,fn)=>listeners[name]=fn}};
vm.createContext(context);
vm.runInContext(html.slice(helperStart,helperEnd),context);
function notice(id,at=Date.now()){return JSON.stringify({id,action:'addRecord',at})}
(async()=>{
 await context.p79RefreshScheduleRestEvidence();
 assert.deepEqual(calls,['regular:2026-10'],'ordinary view keeps normal freshness guard');
 storage.set('port79_attendance_sync_notice_v1',notice('E1-in'));
 await context.p79RefreshScheduleRestEvidence();
 assert.equal(calls.at(-1),'invalidate:2026-10','same-window return must bypass audit freshness');
 await context.p79RefreshScheduleRestEvidence();
 assert.equal(calls.filter(x=>x==='invalidate:2026-10').length,1,'same notice cannot cause endless cloud reads');
 listeners.storage({key:'port79_attendance_sync_notice_v1',newValue:notice('E2-in')});
 assert.equal(calls.filter(x=>x==='invalidate:2026-10').length,2,'other-tab confirmed save invalidates');
 listeners.storage({key:'port79_attendance_sync_notice_v1',newValue:notice('old',Date.now()-180000)});
 assert.equal(calls.filter(x=>x==='invalidate:2026-10').length,2,'expired notice ignored');
 listeners.storage({key:'port79_attendance_sync_notice_v1',newValue:notice('future',Date.now()+30000)});
 assert.equal(calls.filter(x=>x==='invalidate:2026-10').length,2,'future malformed notice ignored');
 month='2026-11';token='';
 listeners.storage({key:'port79_attendance_sync_notice_v1',newValue:notice('unauth')});
 assert.equal(calls.length,4,'logged-out view does not fetch');
 token='TEST';storage.set('port79_attendance_sync_notice_v1',notice('E1-new-month'));
 await context.p79RefreshScheduleRestEvidence();
 assert.equal(calls.at(-1),'invalidate:2026-11','changed selected month refreshes with current auth');
 const remStart=core.indexOf('function remove(key,payload,confirmed=true)');
 const remEnd=core.indexOf('function pendingForId(',remStart);
 assert(remStart>=0&&remEnd>remStart,'confirmed write is explicit in remove helper');
 let queue=[],notified=0;
 const w={readQueue:()=>queue,saveQueue:v=>{queue=v},samePayload:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
 p79NotifyAttendanceWrite:()=>notified++};
 vm.createContext(w);vm.runInContext(core.slice(remStart,remEnd),w);
 const payload={action:'addRecord',record:{id:'E1-IN',empId:'E1'}};
 queue=[{key:'k',payload}];assert.equal(w.remove('k',payload,false),true);
 assert.equal(notified,0,'rejected duplicate must never notify saved');
 queue=[{key:'k',payload}];assert.equal(w.remove('k',payload),true);
 assert.equal(notified,1,'confirmed official write sends one notice');
 assert.equal((core.match(/remove\(cur\.key,cur\.payload,false\)/g)||[]).length,2,
  'both asynchronous duplicate-rejection paths must suppress confirmation');
 assert(core.includes('remove(opKey(payload),payload,false)'),
  'direct-write duplicate-rejection path must suppress confirmation');
 console.log('PASS same-tab, other-tab, stale/future/logout guards, month selection and rejected-duplicate notification integrity');
})().catch(e=>{console.error(e);process.exitCode=1});

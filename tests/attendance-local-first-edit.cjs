'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-attendance-core.js','utf8');
function fn(n){let a=source.indexOf('function '+n+'(');assert(a>=0,n);if(source.slice(a-6,a)==='async ')a-=6;return source.slice(a,source.indexOf('\n}',a)+2)}
function setup(){
 const queue=[],timers=[],events=[],c={Date,JSON,Map,Set,String,Number,Math,window:{},navigator:{onLine:true},writing:false,queueStorage:'local',p79LocalFirstEditCallbacks:new Map(),isV5AttendanceWrite:()=>true,readQueue:()=>JSON.parse(JSON.stringify(queue)),opKey:p=>p.record.id,samePayload:(a,b)=>JSON.stringify(a)===JSON.stringify(b),enqueue:p=>{queue.splice(0,queue.length,{key:p.record.id,payload:JSON.parse(JSON.stringify(p))})},updateUi(){},setTimeout:f=>timers.push(f),drain:()=>events.push('drain'),showToast:(s,type)=>events.push(type),send:()=>{throw Error('foreground network is forbidden')}};
 vm.createContext(c);for(const n of ['p79CompleteLocalFirstEdit','submitAttendanceWrite','p79PunchUploadPriority','p79OrderedReadyQueue'])vm.runInContext(fn(n),c);
 return {c,queue,timers,events};
}
(async()=>{
 const original={action:'updateRecord',record:{id:'1',timeStr:'2026/11/25 08:00'},originalTimeStr:'2026/11/25 07:55',p79LocalFirst:true};
 let t=setup(),p=JSON.parse(JSON.stringify(original)),ack=0;
 let result=await t.c.submitAttendanceWrite(p,'confirmed',()=>ack++);
 assert.equal(result.queued,true);assert.equal(result.localSaved,true);assert.equal(result.cloudConfirmed,false);assert.equal(ack,0);
 assert.equal(t.queue.length,1);assert.equal(t.queue[0].payload.originalTimeStr,original.originalTimeStr);assert.equal(t.timers.length,1);
 p.record.timeStr='2026/11/25 09:00';assert.equal(t.queue[0].payload.record.timeStr,original.record.timeStr);
 t.timers[0]();assert.deepEqual(t.events,['drain']);t.c.p79CompleteLocalFirstEdit(t.queue[0],{ok:true});assert.equal(ack,1);
 t.c.p79CompleteLocalFirstEdit(t.queue[0],{ok:true});assert.equal(ack,1);
 t=setup();t.c.navigator.onLine=false;result=await t.c.submitAttendanceWrite(original,'',()=>{throw Error('false ACK')});assert.equal(result.queued,true);assert.equal(t.queue.length,1);
 t=setup();t.c.queueStorage='memory';result=await t.c.submitAttendanceWrite(original,'');assert.equal(result.ok,false);assert.equal(result.localSaved,false);assert.equal(t.queue.length,1);assert(t.events.includes('warning'));
 const prior={key:'1',payload:original},next={key:'1',payload:{...original,record:{...original.record,timeStr:'2026/11/25 09:00'}}};
 const attempted=new Set([prior.key+'|'+JSON.stringify(prior.payload)]);assert.equal(t.c.p79OrderedReadyQueue([prior,next],true,Date.now(),attempted).length,1);assert.equal(t.c.p79OrderedReadyQueue([prior,next],true,Date.now(),attempted)[0].payload.record.timeStr,next.payload.record.timeStr);
 for(const path of ['attendance/index.html','work-hours/index.html']){const h=fs.readFileSync(path,'utf8');assert(h.includes('p79LocalFirst: true'));assert(h.includes('sync=20261125-local-first-edit-v2'));}
 console.log('PASS local-first durable edit, offline queue, immutable baseline, truthful ACK, memory-only failure, newer same-ID edit and both page routes');
})().catch(e=>{console.error(e);process.exitCode=1});

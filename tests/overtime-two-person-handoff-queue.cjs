'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const report=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const page=fs.readFileSync('leave/index.html','utf8');
const start=report.indexOf(' function advanceLeaveHandoff(draft,sourcePrefill={})');
const end=report.indexOf(' // Match the currently selected overtime TYPE',start);
assert(start>=0&&end>start,'real queue helper exists');
const handoffKey='port79_leave_overtime_handoff_v1',date='2026-11-14';
const first={leaveId:'L14',empId:'A',date,forEmpId:'LEAVER',code:'延16-04'};
const second={leaveId:'L14',empId:'B',date:'2026-11-15',forEmpId:'LEAVER',code:'延04-16'};
const map=new Map(),storage={
 getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)
};
const ctx={sessionStorage:storage,JSON,String};
vm.createContext(ctx);vm.runInContext(report.slice(start,end),ctx);
const set=(entries=[first,second])=>map.set(handoffKey,JSON.stringify({id:'L14',pendingReports:true,createdAt:Date.now(),entries}));
const entries=()=>JSON.parse(map.get(handoffKey)||'null')?.entries||[];
const file=(entry,linked)=>({empId:entry.empId,date:entry.date,
 leaveHandoffId:linked?'L14':'',forEmpId:linked?'LEAVER':''});
const source=entry=>({empId:entry.empId,date:entry.date,leaveHandoffId:'L14',forEmpId:'LEAVER'});

set();
let p=ctx.advanceLeaveHandoff(file(first,false),source(first));
assert.equal(p.remaining,2);
assert.equal(p.nextAuto,true,'independently filed first worker should open second worker');
assert.equal(p.independent,true);
assert.equal(entries()[0].empId,'B','second worker is now the next open form');
assert.equal(entries()[1].empId,'A');
assert.equal(entries()[1].deferredAfterOwnOvertime,true,'the original A cover remains pending');

p=ctx.advanceLeaveHandoff(file(second,true),source(second));
assert.equal(p.nextAuto,false,'after original B cover is confirmed, no unvisited worker remains');
assert.equal(p.remaining,1,'original A cover has not been deleted');
assert.equal(entries()[0].empId,'A');
assert.equal(entries()[0].deferredAfterOwnOvertime,true);
assert.equal(page.includes("p79OpenLeaveOvertimeHandoff(autoContinue=false)"),true);
assert.equal(page.includes("sessionStorage.setItem(P79_HANDOFF_KEY,JSON.stringify({...queued,"),true,'manual re-entry can un-defer original cover');

p=ctx.advanceLeaveHandoff(file(first,true),source(first));
assert.equal(p.remaining,0,'after correctly linked A cover, queue completes');
assert.equal(map.has(handoffKey),false);

set();
p=ctx.advanceLeaveHandoff(file(first,false),source(first));
assert.equal(p.nextAuto,true);
p=ctx.advanceLeaveHandoff(file(second,false),source(second));
assert.equal(p.remaining,2,'two independent filings do not complete either planned night-cover entry');
assert.equal(p.nextAuto,false,'no endless reopening of deferred first worker');
assert(entries().every(e=>e.deferredAfterOwnOvertime===true));
assert.deepEqual(entries().map(e=>e.empId),['A','B']);

set();
p=ctx.advanceLeaveHandoff({empId:'UNRELATED',date,leaveHandoffId:'',forEmpId:''},source(first));
assert.equal(p,null,'unrelated staff must never alter the handoff queue');
assert.deepEqual(entries().map(e=>e.empId),['A','B']);
p=ctx.advanceLeaveHandoff(file(first,false),{});
assert.equal(p,null,'plain unrelated overtime must not advance a leave queue');
assert.deepEqual(entries().map(e=>e.empId),['A','B']);
assert(report.includes("try{progress=advanceLeaveHandoff(draft,prefill);}"),
 'queue transitions are only performed after confirmed save, using original source');
assert(report.indexOf("advanceLeaveHandoff(draft,prefill)")<report.indexOf("dispatchEvent?.(new CustomEvent('p79-overtime-report-saved'"),
 'avoid race: queue must advance before saved event triggers reconciliation');
assert(report.includes("await global.p79OpenLeaveOvertimeHandoff(true)"),
 'automatically ask host to show the next unvisited person');
const scripts=[...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
 .filter(x=>!/\bsrc=|application\/json|importmap/.test(x[1]));
for(const script of scripts)if(script[2].trim())new vm.Script(script[2]);
console.log('PASS 2-person handoff: first confirmed own overtime advances to second, original cover remains pending; two standalone filings stop safely; manual review can revisit; no duplicate or wrong-person progression');

'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const js=fs.readFileSync('assets/port79-data-cache.js','utf8');
const native=fs.readFileSync('desktop-lite/MainForm.cs','utf8');
const compact=fs.readFileSync('assets/port79-home-compact-controls.js','utf8');
const first=js.indexOf('let lastAllDownload=null;');
const end=js.indexOf('\nfunction ensureStyle()',first);
assert(first>0&&end>first);
const code=js.slice(first,end);
const systems=['attendance','workhours','leave','schedule','efficiency','hr','history'];
function suite({failure={}, attendanceMonths=10}={}){
 const calls=[], progress=[],writes=[],timeouts=[];
 const context={
  token:()=> 'T',viewerKey:()=> 'ADMIN@admin',gasUrl:()=> 'https://script.google.com/macros/s/TEST/exec',
  displayScope:()=> 'ADMIN',mutationStamp:()=>0,
  currentSystem:()=> 'home',
  Date,Set,JSON,Number,Object,Array,console,
  downloadAttendanceDatabase:async(_sys,onProgress,opts)=>{
   timeouts.push(opts?.interactive===true?30:60);
   calls.push('attendance');
   onProgress('attendance',2,attendanceMonths,'monthDone','已完成兩個月');
   if(failure.attendance)throw failure.attendance;
   return {fullDatabase:true,records:[],monthStats:[]};
  },
  saveSystemSnapshot:async(sys,data)=>{writes.push(sys);return data;},
  applyAttendanceSnapshotToPage:async()=>{},
  downloadSystem:async (sys,_progress,opts)=>{
   timeouts.push(opts?.interactive===true?30:60);
   calls.push(sys);
   if(failure[sys])throw failure[sys];
   return {ok:true};
  },
  getDisplaySnapshot:async()=>null
 };
 vm.createContext(context);
 vm.runInContext(code,context,{timeout:3000});
 return {context,calls,progress,writes,timeouts,run:options=>context.downloadAll((sys,index,total,state,error,detail,meta)=>
   progress.push({sys,index,total,state,error:error?.message||'',detail,meta}),options)};
}
test('interactive Windows batch completes quick independent systems before long attendance scan',async()=>{
 const f=suite();const res=await f.run({quickFirst:true});
 assert.deepEqual(f.calls,['leave','schedule','efficiency','hr','history','attendance']);
 assert.equal(res.length,7);assert(res.every(x=>x.ok));
 assert.deepEqual(Array.from(res,x=>x.system),['leave','schedule','efficiency','hr','history','attendance','workhours']);
 assert.deepEqual(f.writes,['workhours']);
 assert(f.timeouts.every(x=>x===30),'manual batch uses bounded 30-second cloud request');
 const m=f.progress.find(x=>x.sys==='attendance'&&x.state==='detail');
 assert.equal(m.meta.monthCompleted,2);assert.equal(m.meta.monthTotal,10);
});
test('legacy downloadAll remains attendance-first for existing business workflows',async()=>{
 const f=suite();const res=await f.run();
 assert.deepEqual(f.calls.slice(0,1),['attendance']);
 assert(f.timeouts.every(x=>x===60),'legacy cloud requests retain 60-second bound');
 assert.equal(res.length,7);
});
test('one isolated network error does not discard five successful independent systems',async()=>{
 const err=Object.assign(new Error('請假服務暫時逾時'),{code:'P79_TRANSPORT'});
 const f=suite({failure:{leave:err}});
 const res=await f.run({quickFirst:true});
 assert.equal(res[0].system,'leave');assert.equal(res[0].ok,false);
 assert.equal(res.filter(x=>x.ok).length,6);
 assert(f.calls.includes('hr')&&f.calls.includes('attendance'));
 assert.deepEqual(f.writes,['workhours']);
});
test('two consecutive network failures stop batch safely; no seven repeated timeouts',async()=>{
 const err=Object.assign(new Error('雲端傳輸逾時'),{code:'P79_TRANSPORT'});
 const f=suite({failure:{leave:err,schedule:err}});
 const res=await f.run({quickFirst:true});
 assert.deepEqual(f.calls,['leave','schedule']);
 assert.equal(res.length,7);assert.equal(res.filter(x=>x.ok).length,0);
 assert.equal(res.filter(x=>x.skipped).length,5);
 assert.equal(f.writes.length,0);
});
test('expired manager login blocks all subsequent cloud reads',async()=>{
 const err=Object.assign(new Error('登入已過期'),{code:'P79_AUTH'});
 const f=suite({failure:{leave:err}});
 const res=await f.run({quickFirst:true});
 assert.deepEqual(f.calls,['leave']);
 assert(res.slice(1).every(x=>x.skipped));
});
test('Windows and homepage report real month counts and do not count failures as completed',()=>{
 assert.match(js,/const timeoutMs=readOptions\?\.interactive===true\?30000:DOWNLOAD_TIMEOUT_MS/);
 assert.match(js,/fetchJson\('historyGetMonthData',\{token:t,type,month:m\},'',readOptions\)/);
 assert.match(js,/if\(\['P79_AUTH','P79_SCOPE','P79_TRANSPORT'\]\.includes\(e\?\.code\)\)throw e/);
 assert.match(js,/done\.add\(sys\)/);
 assert.match(js,/if\(state==='done'\|\|state==='reused'\)done\.add\(sys\)/);
 assert.match(js,/status\('stalled',lastDetail/);
 assert.match(js,/monthCompleted:Math\.max\(0,Math\.min\(240,lastMonthCompleted\)\)/);
 assert.match(js,/\{quickFirst:true\}/);
 assert.match(native,/monthCompleted=Math\.Max\(0,Math\.Min\(240,data\.monthCompleted\)\)/);
 assert.match(native,/monthTotal=Math\.Max\(0,Math\.Min\(240,data\.monthTotal\)\)/);
 assert.match(compact,/count\+'\/'\+total\+\(monthTotal\?/);
});

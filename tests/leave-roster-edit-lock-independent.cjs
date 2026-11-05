'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('leave/index.html','utf8');
function between(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert(a>=0&&b>a,'missing leave source block '+start);
 return html.slice(a,b);
}
const post=between('async function postCloud(payload){','function readHash()');
const preflight=between('async function p79ReadCurrentLeaveCoverState(){','function leaveBalanceNumber(');
const stable=between('let p79EmployeeLeaveDraft=null;','function populateDepartments(){');
const storage=new Map();
function fixture({responses=[],reads=[]}={}){
 let calls=[],sleeps=[];
 const c={Date,JSON,Error,Promise,console,sessionStorage:{
  getItem:key=>storage.get(key)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)
 },adminToken:'AUTH',GAS_URL:'https://script.google.com/macros/s/example/exec',leaveRequestToken:()=>'AUTH',
 encodeURIComponent, setTimeout:(fn,ms)=>{sleeps.push(ms);fn();return 1},
 jsonFetch:async (url,opt)=>{calls.push({url,opt});return url.includes('?action=getLeaveData')?reads.shift():responses.shift();}};
 vm.createContext(c);
 vm.runInContext(post+preflight+stable.split('async function submitLeave(){')[0],c);
 return {c,calls,sleeps};
}
(async()=>{
 let x=fixture({responses:[{ok:false,retryable:true,error:'正在處理班表'},{ok:true,id:'L1'}]});
 const result=await x.c.postCloud({action:'addLeave',leave:{id:'L1'}});
 assert.equal(result.ok,true);
 assert.equal(x.calls.length,2);
 assert.equal(x.calls[0].opt.body,x.calls[1].opt.body,'busy retry is exactly same request');
 assert.deepEqual(x.sleeps,[400],'explicit busy rejected writes retry with bounded delay');
 x=fixture({responses:[{ok:false,retryable:true},{ok:false,retryable:true},{ok:false,retryable:true}]});
 await assert.rejects(x.c.postCloud({action:'addLeave',leave:{id:'L1'}}),/不需要取得排班編輯權/);
 assert.equal(x.calls.length,3);
 x=fixture({responses:[{ok:false,error:'編輯排班'}]});
 await assert.rejects(x.c.postCloud({action:'addLeave',leave:{id:'L1'}}),/編輯排班/);
 assert.equal(x.calls.length,1,'non-retryable error must not be resent');
 x=fixture({responses:[{ok:true}]});
 x.c.jsonFetch=async()=>{throw Error('transport timeout')};
 await assert.rejects(x.c.postCloud({action:'addLeave',leave:{id:'L1'}}),/transport timeout/);
 assert.equal(x.sleeps.length,0,'uncertain transport must not blindly re-submit');
 x=fixture({reads:[{ok:false,retryable:true},{ok:true,leaveRecords:[],leaveCoverAssignments:[]}]});
 assert.equal((await x.c.p79ReadCurrentLeaveCoverState()).ok,true);
 assert.equal(x.calls.length,2,'read-only preflight safely retries');
 assert(!post.includes('scheduleAcquireEditLock'),'leave POST does not acquire long-lived roster lock');
 assert(!post.includes('syncSchedules'),'leave POST does not submit a roster overwrite');
 assert(stable.includes('p79EmployeeLeaveStableId(signature)'));
 storage.clear();x=fixture();
 const id=x.c.p79EmployeeLeaveStableId('EMP|DAY');
 assert.equal(x.c.p79EmployeeLeaveStableId('EMP|DAY'),id,'same pending request keeps its ID');
 x.c.p79EmployeeLeaveDraft=null;
 assert.equal(x.c.p79EmployeeLeaveStableId('EMP|DAY'),id,'refresh preserves in-flight idempotency');
 x.c.p79EmployeeLeaveClearStableId();assert.equal(storage.size,0);
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
  if(m[1].trim())new vm.Script(m[1]);
 }
 console.log('PASS leave submit independent of long roster edit lock; busy retry bounded, no unsafe duplicate POST, idempotent refresh, read-only preflight');
})().catch(e=>{console.error(e);process.exitCode=1});

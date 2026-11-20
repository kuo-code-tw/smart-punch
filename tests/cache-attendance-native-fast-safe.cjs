'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-data-cache.js','utf8');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function fixture({native=true,onMonth=()=>{},revision='REV1'}={}){
 const ss=new Map([['port79_user_token','TEST-ADMIN-TOKEN'],
  ['port79_user_session',JSON.stringify({empId:'QA',adminRole:'admin',dataScope:{team:'one'}})]]);
 const sessionStorage={getItem:k=>ss.get(k)||null,setItem:(k,v)=>ss.set(k,String(v)),removeItem:k=>ss.delete(k)};
 const months=Array.from({length:8},(_,i)=>'2026-'+String(i+1).padStart(2,'0'));
 let inFlight=0,maxInFlight=0,monthReads=0,directReads=0;
 const snapshots=[];
 const context={window:{
  GAS_URL:'https://script.google.com/macros/s/TEST/exec',
  ...(native?{chrome:{webview:{postMessage(){}}}}:{}),
  fetch:async(url)=>{
   const u=new URL(url),action=u.searchParams.get('action'),month=u.searchParams.get('month');
   inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
   try{
    if(action==='getAttendanceMonthData'||action==='getAttendanceMainDirect'){
     if(action==='getAttendanceMonthData')monthReads++;
     else directReads++;
     onMonth({action,month,ss});
     await wait(6);
     return new Response(JSON.stringify({ok:true,records:[{id:action+'-'+month,month}]}));
    }
    if(action==='getSyncMeta')return new Response(JSON.stringify({ok:true,revision}));
    if(action==='getAttendanceMonths')return new Response(JSON.stringify({ok:true,months}));
    if(action==='getAttendanceEmployeeMaster')return new Response(JSON.stringify({ok:true,employees:[{empId:'QA'}]}));
    if(action==='getLeaveData')return new Response(JSON.stringify({ok:true,leaveRecords:[]}));
    if(action==='getScheduleDataSecure')return new Response(JSON.stringify({ok:true,schedules:[]}));
    if(action==='gcGetData')return new Response(JSON.stringify({ok:true,records:[]}));
    if(action==='hrGetEmployees')return new Response(JSON.stringify({ok:true,employees:[]}));
    if(action==='getHistoricalDataCatalog')return new Response(JSON.stringify({ok:true,months:[]}));
    if(action==='historyGetMonthData')return new Response(JSON.stringify({ok:true,records:[]}));
    throw new Error('Unexpected action '+action);
   }finally{inFlight--;}
  }
 },URL,URLSearchParams,Request,Response,Blob,AbortController,Date,JSON,Map,Set,Promise,console,
 setTimeout,clearTimeout,sessionStorage,localStorage:sessionStorage,
 location:{pathname:'/smart-punch/hr/',href:'https://unit.invalid/smart-punch/hr/'},
 document:{}};
 vm.createContext(context);
 vm.runInContext(source.replace('window.Port79DataCache={',
 'storeApi=async()=>{};getDisplaySnapshot=async()=>null;saveSystemSnapshot=async(sys,data)=>{snapshots.push({sys,data});return data};applyAttendanceSnapshotToPage=async()=>true;window.Port79DataCache={'),context);
 return {api:context.window.Port79DataCache,ss,months,snapshots,metrics:()=>({maxInFlight,monthReads,directReads}),context};
}
async function test(name,cb){await cb();console.log('PASS '+name)}
(async()=>{
 await test('Native Windows has at most two simultaneous cloud month reads, preserves all original rows',async()=>{
  const f=fixture();
  const details=[];const data=await f.api.downloadSystem('attendance',(sys,i,total,state,label)=>details.push({i,total,state,label}));
  const metrics=f.metrics();
  assert.equal(metrics.monthReads,8);assert.equal(metrics.directReads,8);
  assert(metrics.maxInFlight>1,'Two month workers should run concurrently on native Windows');
  assert(metrics.maxInFlight<=2,'Never overload Google Apps Script with more than two calls');
  assert.equal(data.recordCount,16);
  assert.equal(data.monthStats.length,8);
  assert(data.monthStats.every(x=>x.ok===true));
  assert.equal(f.snapshots.length,2);
  assert(details.some(x=>x.state==='monthDone'&&x.i===8&&x.total===8));
 });
 await test('Regular web keeps single sequential month reader',async()=>{
  const f=fixture({native:false});await f.api.downloadSystem('attendance');
  assert.equal(f.metrics().maxInFlight,1);
 });
 await test('Business mutation during download stops stale full snapshot without declaring login invalid; other systems still download',async()=>{
  let changed=false;
  const f=fixture({onMonth:({action,ss})=>{
   if(!changed&&action==='getAttendanceMonthData'){changed=true;ss.set('port79_cache_mutated_at',String(Date.now()));}
  }});
  const result=await f.api.downloadAll();
  assert.equal(f.snapshots.length,0,'Never overwrite saved complete database with rows read before an edit');
  assert.equal(result[0].ok,false);assert.match(result[0].error,/其他資料修改/);
  assert.equal(result[1].ok,false,'Workhours depends on same attendance full snapshot');
  assert(result.slice(2).some(x=>x.ok),'Independent HR/leave/schedule must proceed with current verified identity');
 });
 await test('Data scope refresh cancels mixed-permission full snapshot, reports scope rather than login, and stops subsequent cloud batch',async()=>{
  let changed=false;
  const f=fixture({onMonth:({ss})=>{
   if(!changed){changed=true;ss.set('port79_user_session',JSON.stringify({empId:'QA',adminRole:'admin',dataScope:{team:'different'}}));}
  }});
  const result=await f.api.downloadAll();
  assert.equal(f.snapshots.length,0);
  assert.equal(result[0].ok,false);assert.match(result[0].error,/權限範圍/);
  assert(result.slice(1).every(x=>!x.ok),'Do not download data after scope changes');
 });
 await test('Credential change still cancels and refuses to save to wrong account',async()=>{
  let changed=false;
  const f=fixture({onMonth:({ss})=>{
   if(!changed){changed=true;ss.set('port79_user_token','OTHER-ACCOUNT-TOKEN');}
  }});
  const result=await f.api.downloadAll();
  assert.equal(f.snapshots.length,0);
  assert.match(result[0].error,/登入|憑證/);
  assert(result.slice(1).every(x=>!x.ok));
 });
 console.log('PASS native fast attendance concurrency, integrity and error classification suite');
})().catch(error=>{console.error(error);process.exitCode=1});

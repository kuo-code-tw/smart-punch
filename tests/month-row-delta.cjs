'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createHash,webcrypto}=require('node:crypto');

async function run(){
 const month='2026-11';
 const local=[{id:'keep',name:'考勤'},{id:'edit',status:'IN'},{id:'delete',status:'OUT'}];
 let official=[{name:'考勤',id:'keep'},{id:'edit',status:'OUT'},{id:'new',status:'IN'}];
 let route='getAttendanceMonthRaw',denied=false,reply;
 const cloud=vm.createContext({
  Utilities:{
   DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
   computeDigest:(algorithm,data,encoding)=>createHash(algorithm).update(data,encoding).digest(),
   base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url')
  },
  p79SecureLegacyRead_:request=>{
   assert.equal(request.parameter.action,route);
   assert.equal(request.parameter.token,'SESSION');
   return {getContent:()=>JSON.stringify(denied?{ok:false,error:'沒有查看權限'}:{
    ok:true,month,records:official,revision:'2'
   })};
  },
  port79DoGetCore_:request=>{
   assert.equal(request.parameter.action,'getScheduleDataSecure');
   return {getContent:()=>JSON.stringify({ok:true,month,schedules:official,scheduleGroups:['一組']})};
  }
 });
 vm.runInContext(fs.readFileSync('backend/month-row-delta.gs','utf8'),cloud);
 const readCache=fs.readFileSync('assets/port79-data-cache.js','utf8');
 const code=readCache.slice(readCache.indexOf('const monthDeltaFields='),readCache.indexOf('async function saveSystemSnapshot'));
 const url='https://script.google.com/macros/s/TEST/exec';
 let scope='scope';
 const browser=vm.createContext({
  window:{crypto:webcrypto},URL,TextEncoder,btoa,AbortController,Response,setTimeout,clearTimeout,
  gasUrl:()=>url,token:()=>'SESSION',validDownloadGasUrl:()=>true,
  viewerKey:()=>'VIEWER',displayScope:()=>scope,mutationStamp:()=>'',
  rawFetch:async(endpoint,options)=>{
   assert.equal(endpoint,url);
   assert.equal(options.method,'POST');
   const data=JSON.parse(options.body);
   assert.equal(data.action,'getMonthRowDelta');
   assert(!options.body.includes('考勤'));
   if(reply)return new Response(JSON.stringify(reply()));
   return new Response(JSON.stringify(cloud.p79ReadMonthRowDelta_(data)));
  }
 });
 vm.runInContext(code,browser);
 const incremental=await browser.readMonthDelta(route,month,{records:local});
 assert.deepEqual(JSON.parse(JSON.stringify(incremental.records)),official);
 assert.equal(incremental.records[0],local[0],'unchanged row must be referenced from local data');
 assert.equal(incremental.revision,'2');
 assert.equal(local.length,3,'applying a delta cannot mutate the saved baseline');
 assert(!incremental.records.some(row=>row.id==='delete'));
 route='getScheduleDataSecure';
 official=[{empId:'E1',schedule:{1:'早'}}];
 const schedule=await browser.readMonthDelta(route,month,{schedules:official,scheduleGroups:['一組']});
 assert.equal(schedule.schedules[0],official[0]);
 assert.equal(schedule.scheduleGroups[0],'一組');
 route='getAttendanceMonthRaw';
 denied=true;
 await assert.rejects(browser.readMonthDelta(route,month,{records:local}),/沒有查看權限/);
 denied=false;
 reply=()=>({ok:true,month,rowDelta:{version:1,changes:{records:[-99]}}});
 await assert.rejects(browser.readMonthDelta(route,month,{records:local}),/索引不完整/);
 reply=()=>{scope='changed';return {ok:true,month,rowDelta:{version:1,changes:{records:[]}}}};
 await assert.rejects(browser.readMonthDelta(route,month,{records:local}),/權限或資料已變更/);
 reply=()=>({ok:false,error:'未知操作: [getMonthRowDelta]。'});
 assert.equal(await browser.readMonthDelta(route,month,{records:local}),null);
 console.log('PASS month deltas: additions, edits, deletions, unchanged records, scope and legacy fallback');
}
run().catch(error=>{console.error(error);process.exitCode=1});

'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('schedule/index.html','utf8');
const start=html.indexOf('read:async(month,token)=>{'),end=html.indexOf('\n        update:(month,state)=>{',start);
assert(start>=0&&end>start,'schedule attendance client read function must exist');
const fn=html.slice(start+'read:'.length,end).trim().replace(/,$/,'');
function create(routes){
 const mockFetch=async url=>{
  const action=url.searchParams.get('action');
  if(!(action in routes))throw Error('endpoint not configured: '+action);
  const data=routes[action];
  if(data instanceof Error)throw data;
  return {ok:true,json:async()=>data};
 };
 return Function('GAS_URL','fetch','URL','AbortController','setTimeout','clearTimeout','return ('+fn+')')(
  'https://example.invalid/exec',mockFetch,URL,AbortController,setTimeout,clearTimeout);
}
const month='2026-10',inRec={id:'1',empId:'E1',timeStr:'2026/10/27 08:00',status:'上班簽到'};
const main={ok:true,month,records:[inRec]},raw={ok:true,month,records:[inRec]},empty={ok:true,month,records:[]};
(async()=>{
 let result=await create({getAttendanceMainDirect:main,getAttendanceMonthRaw:raw})(month,'safe-token');
 assert.equal(result.records.length,1,'paired endpoints should read official month');
 assert.equal(result.absenceReferenceRecords.length,1,'paired endpoints should keep independent reference');
 result=await create({getAttendanceMainDirect:new Error('Main unavailable'),getAttendanceMonthRaw:raw})(month,'safe-token');
 assert.equal(result.records.length,1,'raw feed must serve as covered fallback');
 assert.equal(result.absenceReferenceRecords,null,'one source is not dual-source confirmation');
 assert.match(result.absenceReferenceError,/正式考勤接口讀取失敗/);
 result=await create({getAttendanceMainDirect:empty,getAttendanceMonthRaw:raw})(month,'safe-token');
 assert.equal(result.records.length,1,'empty main feed must not suppress populated raw feed');
 assert.equal(result.absenceReferenceRecords,null,'empty main does not confirm absence');
 result=await create({getAttendanceMainDirect:main,getAttendanceMonthRaw:new Error('Raw unavailable')})(month,'safe-token');
 assert.equal(result.records.length,1,'official feed remains available');
 assert.equal(result.absenceReferenceRecords,null);
 await assert.rejects(
  create({getAttendanceMainDirect:new Error('Main offline'),getAttendanceMonthRaw:new Error('Raw offline')})(month,'safe-token'),
  /皆讀取失敗/,'no attendance must not be taken as proof of absence'
 );
 console.log('PASS: dual source, main-fail fallback, empty-main fallback, raw-fail fallback, both-fail safeguard');
})().catch(e=>{console.error(e);process.exitCode=1});

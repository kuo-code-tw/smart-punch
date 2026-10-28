const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(require('path').join(__dirname,'../assets/port79-data-cache.js'),'utf8');
function setup(override){
 const calls=[],snapshots=[],applied=[];const values=new Map([['port79_user_token','private-test-token'],['port79_user_session',JSON.stringify({empId:'QA',adminRole:'admin'})]]);
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v))};
 const fixture=(action,month)=>action==='getAttendanceMonths'?{ok:true,months:['2026-09','2026-10']}:action==='getAttendanceEmployeeMaster'?{ok:true,employees:[{empId:'QA'}]}:{ok:true,records:[{id:month+'-base'},...(action==='getAttendanceMainDirect'?[{id:month+'-direct'}]:[])]};
 const ctx={URL,URLSearchParams,Request,Response,Blob,AbortController,Date,JSON,Map,Set,Promise,console,setTimeout,clearTimeout,document:{},sessionStorage:storage,localStorage:storage,location:{pathname:'/smart-punch/hr/',href:'https://example.invalid/smart-punch/hr/'},snapshots,applied,cachedFullRow:null,window:{GAS_URL:'https://script.google.com/macros/s/TEST/exec',fetch:async input=>{const u=new URL(input),a=u.searchParams.get('action'),m=u.searchParams.get('month');calls.push(u);const d=u.searchParams.get('token')!=='private-test-token'?{ok:false,error:'未登入'}:override?.(a,m)??fixture(a,m);return new Response(JSON.stringify(d),{status:200})}}};
 vm.createContext(ctx);vm.runInContext(source.replace('window.Port79DataCache={','storeApi=async()=>{};getDisplaySnapshot=async()=>cachedFullRow;saveSystemSnapshot=async(sys,data)=>{snapshots.push({sys,data});if(sys==="attendance")cachedFullRow={data,cacheEndpoint:gasUrl(),displayScope:displayScope()};return data};applyAttendanceSnapshotToPage=async(data)=>applied.push(data);window.Port79DataCache={testBuildUrl:buildUrl,'),ctx);
 return {api:ctx.window.Port79DataCache,calls,snapshots,applied,ctx};
}
let passed=0;async function test(name,f){await f();passed++;console.log('PASS '+name)}
(async()=>{
 await test('all full download requests carry login credentials, both snapshots saved only after completion',async()=>{const x=setup();const d=await x.api.downloadSystem('attendance');assert.equal(d.recordCount,4);assert.equal(d.employeeCount,1);assert.equal(x.calls.length,8);assert(x.calls.every(u=>u.searchParams.get('token')==='private-test-token'));assert.deepEqual(x.snapshots.map(x=>x.sys),['attendance','workhours']);assert.equal(x.applied.length,1)});
 await test('workhours uses the same authenticated downloader and populates both cards',async()=>{const x=setup();await x.api.downloadSystem('workhours');assert.equal(x.snapshots.length,2);assert.equal(x.applied.length,1)});
 await test('failed month preserves old complete snapshots and reports actual month and reason',async()=>{const x=setup((a,m)=>a==='getAttendanceMonthData'&&m==='2026-09'?{ok:false,error:'月份讀取逾時'}:null);await assert.rejects(x.api.downloadSystem('attendance'),/2026-09.*月份讀取逾時.*保留原有完整快取/);assert.equal(x.snapshots.length,0);assert.equal(x.applied.length,0)});
 await test('failed main direct source cannot be presented as a complete download',async()=>{const x=setup(a=>a==='getAttendanceMainDirect'?{ok:false,error:'主表無法讀取'}:null);await assert.rejects(x.api.downloadSystem('workhours'),/主表無法讀取/);assert.equal(x.snapshots.length,0)});
 await test('malformed catalog, master or month payload does not turn into empty success',async()=>{for(const action of ['getAttendanceMonths','getAttendanceEmployeeMaster','getAttendanceMonthData','getAttendanceMainDirect']){const x=setup(a=>a===action?{ok:true}:null);await assert.rejects(x.api.downloadSystem('attendance'),/格式不正確/);assert.equal(x.snapshots.length,0)}});
 await test('legitimately empty month remains a valid download',async()=>{const x=setup(a=>['getAttendanceMonthData','getAttendanceMainDirect'].includes(a)?{ok:true,records:[]}:null);const d=await x.api.downloadSystem('attendance');assert.equal(d.recordCount,0);assert.equal(x.snapshots.length,2)});
 await test('default auth injection preserves explicit credentials and does not leak to other origins',()=>{const x=setup(),url=p=>new URL(x.api.testBuildUrl('getAttendanceMonths',p));assert.equal(url({}).searchParams.get('token'),'private-test-token');assert.equal(url({gcToken:'explicit'}).searchParams.has('token'),false);x.ctx.window.GAS_URL='https://other.invalid/api';assert.equal(url({}).searchParams.has('token'),false)});
 await test('shared full-download failure is not retried for the second card and later systems continue',async()=>{const x=setup(a=>a==='getAttendanceMonths'?{ok:false,error:'未授權'}:null);const r=await x.api.downloadAll();assert.equal(x.calls.filter(u=>u.searchParams.get('action')==='getAttendanceMonths').length,1);assert.equal(r[0].ok,false);assert.equal(r[1].ok,false);assert(r.some(x=>x.system==='hr'&&x.ok));assert.equal(x.snapshots.length,0)});
 await test('an unchanged cloud revision reuses the complete database without downloading months again',async()=>{
  const x=setup(a=>a==='getSyncMeta'?{ok:true,revision:'R1'}:null);await x.api.downloadSystem('attendance');const count=x.calls.length;
  const d=await x.api.downloadSystem('attendance');assert.equal(d.reusedCache,true);assert.equal(x.calls.length-count,4);
  assert.equal(x.calls.filter(u=>u.searchParams.get('action')==='getAttendanceMonthData').length,2);
 });
 await test('changed revisions and changed employee scope trigger a full read',async()=>{
  let revision='R1';const x=setup(a=>a==='getSyncMeta'?{ok:true,revision}:null);await x.api.downloadSystem('attendance');revision='R2';
  const d=await x.api.downloadSystem('attendance');assert(!d.reusedCache);assert.equal(x.calls.filter(u=>u.searchParams.get('action')==='getAttendanceMonthData').length,4);
  x.ctx.sessionStorage.setItem('port79_user_session',JSON.stringify({empId:'QA',adminRole:'admin',dataScope:{attendance:['D']}}));
  assert(!(await x.api.downloadSystem('attendance')).reusedCache);
 });
 await test('missing or changing metadata never validates the complete cache',async()=>{
  const x=setup();await x.api.downloadSystem('attendance');assert.equal(x.snapshots[0].data.sourceRevision,'');assert(!(await x.api.downloadSystem('attendance')).reusedCache);
  let n=0;const y=setup(a=>a==='getSyncMeta'?{ok:true,revision:'R'+(++n)}:null);await y.api.downloadSystem('attendance');assert.equal(y.snapshots[0].data.sourceRevision,'');
 });
 await test('two simultaneous attendance/workhours download actions share one full read',async()=>{
  const x=setup();await Promise.all([x.api.downloadSystem('attendance'),x.api.downloadSystem('workhours')]);assert.equal(x.calls.filter(u=>u.searchParams.get('action')==='getAttendanceMonths').length,1);
 });
 console.log(JSON.stringify({passed,scope:'Authenticated download and incomplete-data regression; no live cloud calls'}));
})().catch(e=>{console.error(e);process.exitCode=1});

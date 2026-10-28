const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=f=>fs.readFileSync(f,'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
const context=x=>{vm.createContext(x);return x};
let passed=0;async function test(name,f){await f();passed++;console.log('PASS '+name)}
(async()=>{
 await test('HR renders the native table from disk without adopting cached permissions or running migrations',async()=>{
  const html=read('hr/index.html'),start=html.indexOf('function p79ApplyHrEmployeesPayload('),end=html.indexOf('\nasync function p79FetchHrEmployeesCloud',start);
  const nodes=new Map();let render=0,migrate=0;
  const c=context({console,employees:[],hrAccess:'view',p79HrCloudDataReady:false,p79CanonicalOrgOptions:null,orgSettings:{},normalizePhone:x=>x,normalizeOrgSettings:x=>x,populateFilters(){},render(){render++},migrateLegacyAttendanceOrgSettings(){migrate++},canHr:()=>false,permLabel:x=>x,$:id=>{if(!nodes.has(id))nodes.set(id,{classList:{toggle(){}},textContent:''});return nodes.get(id)}});
  vm.runInContext(html.slice(start,end),c);c.p79ApplyHrEmployeesPayload({employees:[{empId:'QA'}],hrAccess:'manage'},false,'cache');
  assert.equal(render,1);assert.equal(c.hrAccess,'view');assert.equal(migrate,0);assert.equal(c.p79HrCloudDataReady,false);assert(nodes.get('status').textContent.includes('背景核對中'));
  c.p79ApplyHrEmployeesPayload({employees:[{empId:'QA'}],hrAccess:'view'},false,'cloud');assert(c.p79HrCloudDataReady);assert.equal(migrate,1);
 });
 await test('a slow HR disk read cannot overwrite a completed cloud response',async()=>{
  const html=read('hr/index.html'),start=html.indexOf('async function p79HydrateHrComputerCache('),end=html.indexOf('\nwindow.addEventListener',start),d=deferred();let paints=0;
  const c=context({console,token:'TOKEN',hrAccess:'view',p79HrCloudDataReady:false,window:{Port79DataCache:{getDisplaySnapshot:()=>d.promise}},p79ApplyHrEmployeesPayload:()=>paints++});
  vm.runInContext(html.slice(start,end),c);const p=c.p79HydrateHrComputerCache();c.p79HrCloudDataReady=true;d.resolve({data:{employees:[{empId:'OLD'}]}});assert.equal(await p,false);assert.equal(paints,0);
 });
 await test('leave displays existing native rows while cloud is pending, with no approval notification from cache',async()=>{
  const html=read('leave/index.html'),start=html.indexOf('async function p79HydrateLeaveComputerCache('),end=html.indexOf('\nwindow.addEventListener',start);let renders=0,status='';
  const c=context({console,adminSession:{empId:'QA'},p79LeaveCloudDataReady:false,employees:[],leaveRecords:[],window:{Port79DataCache:{getDisplaySnapshot:async()=>({data:{employees:[{empId:'QA'}],leaveRecords:[{id:'L1'}]}})}},populateDepartments(){},renderAll(){renders++},setStatus:t=>status=t});
  vm.runInContext(html.slice(start,end),c);assert(await c.p79HydrateLeaveComputerCache());assert.equal(c.leaveRecords[0].id,'L1');assert.equal(renders,1);assert(status.includes('背景核對'));
  c.p79LeaveCloudDataReady=true;assert.equal(await c.p79HydrateLeaveComputerCache(),false);assert.equal(renders,1);
 });
 await test('a late leave disk read respects both the cloud completion flag and the request lifetime',async()=>{
  const html=read('leave/index.html'),start=html.indexOf('async function p79HydrateLeaveComputerCache('),end=html.indexOf('\nwindow.addEventListener',start),d=deferred();let paints=0,active=true;
  const c=context({console,adminSession:{},p79LeaveCloudDataReady:false,window:{Port79DataCache:{getDisplaySnapshot:()=>d.promise}},populateDepartments(){},renderAll(){paints++},setStatus(){}});vm.runInContext(html.slice(start,end),c);
  const p=c.p79HydrateLeaveComputerCache(()=>active);active=false;d.resolve({data:{employees:[],leaveRecords:[{id:'stale'}]}});assert.equal(await p,false);assert.equal(paints,0);
 });
 await test('attendance preview selects boundary months, honors deletion tombstones and never persists old data',async()=>{
  const html=read('attendance/index.html'),start=html.indexOf('window.p79ApplyAttendanceFullCache=async function('),end=html.indexOf('\n};',start)+3;let writes=0;
  const c=context({console,Date,Set,window:{},records:[{id:'pending',timeStr:'2026-10-02'}],employees:[{empId:'AUTH'}],document:{getElementById:()=>null},attendanceRecordMonthKey:r=>r.timeStr.slice(0,7),isLocallyDeletedAttendanceRecord:r=>r.id==='deleted',mergeAttendanceRecordCollections:(a,b)=>[...a,...b],localStorage:{setItem(){writes++}},saveAttendanceSafetyBackup(){writes++}});vm.runInContext(html.slice(start,end),c);
  const now=new Date(),ym=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  const result=await c.window.p79ApplyAttendanceFullCache({records:[{id:'current',timeStr:ym+'-01'},{id:'ancient',timeStr:'2000-01-01'},{id:'deleted',timeStr:ym+'-02'}],employees:[{empId:'CACHED'}]},{previewOnly:true,silent:true});
  assert(result.ok);assert(c.records.some(r=>r.id==='current'));assert(!c.records.some(r=>r.id==='ancient'||r.id==='deleted'));assert(c.records.some(r=>r.id==='pending'));assert.equal(c.employees[0].empId,'AUTH');assert.equal(writes,0);
 });
 console.log(JSON.stringify({passed,scope:'Actual native display functions, delayed disk/cloud races, synthetic data only'}));
})().catch(e=>{console.error(e);process.exitCode=1});

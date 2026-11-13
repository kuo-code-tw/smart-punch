const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-workhours-cache.js','utf8'),html=fs.readFileSync('work-hours/index.html','utf8');
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).format(new Date());
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function setup(disk=new Map()){
 let token='TOKEN',viewer='A1@admin',version='v1',scope='scope1',rev='R1',stamp='',deny=false,failAction='',hold=null,corrupt=false,churn=false,diskFailure=false;
 const calls=[],applied=[];
 const win={sessionStorage:{getItem:()=>stamp},Port79DataCache:{viewerKey:()=>viewer,get:async k=>clone(disk.get(k)),put:async row=>{if(diskFailure)throw Error('disk unavailable');disk.set(row.key,clone(row));},getSystemSnapshot:async()=>null},P79WorkhoursCacheContext:{token:()=>token,url:()=> 'https://script.google.com/macros/s/FIXTURE/exec',canRead:()=>!deny,month:()=>month,applyBundle:b=>applied.push(clone(b)),failed:(m,e)=>applied.push({error:e.message}),applyFull(){}}};
 win.fetch=async(url,opts)=>{const u=new URL(url),action=u.searchParams.get('action'),m=u.searchParams.get('month');calls.push({action,month:m,token:u.searchParams.get('token'),opts});if(hold?.action===action)await hold.promise;if(failAction===action)return {ok:true,json:async()=>({ok:false,error:'fixture rejection'})};const revisions={schedule:'S1',leave:'L1',employees:'E1',attendance:rev,attendanceDelta:'D1',scope};let data;
 if(action==='getOvertimeReportCacheMeta'){data={ok:true,month:m,viewer:viewer.split('@')[0],cacheSchemaVersion:1,version,revisions};if(churn)version+='x';}
 else if(action==='getScheduleDataSecure')data={ok:true,month:m,employees:[{empId:viewer.split('@')[0]}],schedules:[{empId:viewer.split('@')[0],month:m,schedule:{__meta:{}}}],revision:'S1:L1:E1:'+m,overtimeLinkedDelete:true};
 else if(action==='getOvertimeConfig')data={ok:true,config:{overtimeConversionRowsV1:[['休','fixture',8,12.7]]}};
 else data={ok:true,month:m,records:[{id:'fixture-'+m}],revision:corrupt?'wrong':rev,deltaSeq:'D1'};
 return {ok:true,json:async()=>clone(data)};};
 const c={window:win,URL,Date,Intl,Map,Set,Object,Array,JSON,String,Number,Promise,AbortController,setTimeout,clearTimeout};vm.createContext(c);vm.runInContext(source,c);
 return {api:win.P79WorkhoursCache,win,calls,disk,applied,setToken:x=>token=x,setViewer:x=>viewer=x,change:()=>{version+='x';rev+='x'},scope:x=>{scope=x;version+='s'},stamp:x=>stamp=x,deny:x=>deny=x,fail:x=>failAction=x,hold:action=>{const d=deferred();hold={action,...d};return d;},corrupt:x=>corrupt=x,churn:x=>churn=x,diskFailure:x=>diskFailure=x};
}
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name)}
(async()=>{
await test('cold load stores a complete versioned bundle, shared by concurrent consumers',async()=>{const t=setup(),[a,b]=await Promise.all([t.api.load(month),t.api.load(month)]);assert.equal(t.calls.filter(c=>c.action==='getScheduleDataSecure').length,1);assert.equal(t.calls.filter(c=>c.action==='getAttendanceMonthRaw').length,t.api.monthsFor(month).length);assert.equal(t.calls.filter(c=>c.action==='getOvertimeReportCacheMeta').length,2);assert.equal(t.disk.size,1);a.roster.schedules[0].empId='mutated';assert.notEqual(b.roster.schedules[0].empId,'mutated');});
await test('fresh-page disk hit uses one version check and zero full data downloads',async()=>{const t=setup();await t.api.load(month);const n=setup(t.disk),preview=[];const b=await n.api.load(month,{onPreview:x=>preview.push(x)});assert.equal(n.calls.length,1);assert.equal(n.calls[0].action,'getOvertimeReportCacheMeta');assert.equal(b.source,'本機有效快取');assert.equal(preview[0].preview,true);});
await test('main-table then accounting/status reuse the same verified month without redownload',async()=>{const t=setup();await t.api.load(month);const n=t.calls.length;const a=await t.api.load(month),b=await t.api.load(month);assert.equal(t.calls.length,n);assert.equal(a.version,b.version);assert.equal(a.preview,false);});
await test('changed cloud version reloads full data and replaces obsolete records',async()=>{const t=setup();const a=await t.api.load(month);t.change();const b=await t.api.load(month,{force:true});assert.notEqual(a.version,b.version);assert.equal(t.calls.filter(c=>c.action==='getScheduleDataSecure').length,2);assert.equal(b.raw[month].revision,'R1x');});
await test('POST mutation stamp invalidates recent metadata and old in-flight reads',async()=>{const t=setup();await t.api.load(month);const n=t.calls.length;t.stamp('new-write');t.change();const b=await t.api.load(month);assert(t.calls.length>n);assert.equal(b.raw[month].revision,'R1x');const x=setup(),d=x.hold('getScheduleDataSecure'),p=x.api.load(month);await new Promise(r=>setTimeout(r,5));x.stamp('mid-write');d.resolve();await assert.rejects(p,/變更/);assert.equal(x.disk.size,0);});
await test('a confirmed edit cannot be covered by a pre-edit cached preview',async()=>{const t=setup();await t.api.load(month);const old=[...t.disk.values()][0];t.stamp(String(old.savedAt+1));t.change();await new Promise(r=>setTimeout(r,3));const previews=[];await t.api.load(month,{onPreview:b=>previews.push(b)});assert.equal(previews.length,0,'memory and disk snapshots older than the POST stamp cannot flash old declarations');});
await test('account switching cannot hydrate a previous account bundle',async()=>{const t=setup();await t.api.load(month);const n=setup(t.disk);n.setViewer('A2@admin');const preview=[];const b=await n.api.load(month,{onPreview:x=>preview.push(x)});assert.equal(preview.length,0);assert.equal(b.roster.employees[0].empId,'A2');});
await test('credential switching while a read is pending fails closed',async()=>{const t=setup(),d=t.hold('getOvertimeReportCacheMeta'),p=t.api.load(month);await new Promise(r=>setTimeout(r,5));t.setToken('OTHER');d.resolve();await assert.rejects(p,/變更/);assert.equal(t.disk.size,0);});
await test('scope changes invalidate preview and require current scoped roster',async()=>{const t=setup();await t.api.load(month);t.scope('new-scope');let invalidated=false;await t.api.load(month,{force:true,onInvalidate:()=>invalidated=true});assert(invalidated);assert.equal(t.calls.filter(c=>c.action==='getScheduleDataSecure').length,2);});
await test('a failed cloud validation never confirms a stale preview',async()=>{const t=setup();await t.api.load(month);const n=setup(t.disk);n.fail('getOvertimeReportCacheMeta');const previews=[];await assert.rejects(n.api.load(month,{onPreview:x=>previews.push(x)}),/rejection/);assert(previews[0].preview);assert.equal(n.calls.length,1);});
await test('version churn and mismatched raw revisions never poison saved cache',async()=>{const t=setup();t.churn(true);await assert.rejects(t.api.load(month),/持續更新/);assert.equal(t.disk.size,0);const n=setup();n.corrupt(true);await assert.rejects(n.api.load(month),/持續更新/);assert.equal(n.disk.size,0);});
await test('disk write failure does not block a verified visible result',async()=>{const t=setup();t.diskFailure(true);const b=await t.api.load(month);assert.equal(b.preview,false);assert.equal(t.disk.size,0);});
await test('same-session roster is reused without another cloud roster call, but metadata still verifies',async()=>{
 const t=setup();let reused=0;
 t.win.P79WorkhoursCacheContext.recentRoster=async(m,token,stamp)=>{
  reused++;assert.equal(m,month);assert.equal(token,'TOKEN');
  return {ok:true,month:m,employees:[{empId:'A1'}],schedules:[{empId:'A1',month:m,schedule:{__meta:{}}}],revision:'S1:L1:E1:'+m,overtimeLinkedDelete:true};
 };
 const b=await t.api.load(month);
 assert.equal(b.roster.schedules.length,1);assert.equal(reused,1);
 assert.equal(t.calls.filter(c=>c.action==='getScheduleDataSecure').length,0,'reuse one authenticated request');
 assert.equal(t.calls.filter(c=>c.action==='getOvertimeReportCacheMeta').length,2,'do not skip independent cloud revision check');
});
await test('wrong-month recent roster falls back to authenticated cloud',async()=>{
 const t=setup();t.win.P79WorkhoursCacheContext.recentRoster=async m=>({ok:true,month:'2026-01',employees:[],schedules:[]});
 await t.api.load(month);
 assert.equal(t.calls.filter(c=>c.action==='getScheduleDataSecure').length,1,'mismatched month cannot bypass cloud');
});
await test('explicit refresh skips stale previews and restricted readers use the legacy permission path',async()=>{const t=setup();await t.api.load(month);let previews=0;await t.api.load(month,{force:true,onPreview:()=>previews++});assert.equal(previews,0);t.win.P79WorkhoursCacheContext.cacheAccess=()=>false;assert.equal(t.api.enabled(),false);assert.throws(()=>t.api.load(month),/權限/);});
await test('denied viewers cannot read memory or disk through the service',async()=>{const t=setup();t.deny(true);assert.throws(()=>t.api.load(month),/權限/);assert.equal(t.calls.length,0);});
await test('multiple startup paths apply one shared verified load',async()=>{const t=setup();assert.deepEqual(await Promise.all([t.api.startup(),t.api.startup()]),[true,true]);assert.equal(t.calls.filter(c=>c.action==='getScheduleDataSecure').length,1);assert.equal(t.applied.filter(x=>!x.preview&&!x.error).length,1);});
await test('page integrates full-cache hydration, shared reads and truthful loading without weakening writes',async()=>{assert(html.includes('window.p79ApplyAttendanceFullCache=async function'));assert(html.includes('window.P79WorkhoursCache.load(month)'));assert(html.includes('loadingWithoutRows'));assert(html.includes("textContent='載入中…'"));assert(html.includes("action:'saveOvertimeReportDirect'"));assert(html.includes("const latest=await rpc('getScheduleDataSecure')"));assert(!source.includes("searchParams.set('action','delete"));assert(!source.includes("method:'POST'"));});
await test('a folder read taking over 250ms still reuses the bundle while metadata starts in parallel',async()=>{
 const seed=setup();await seed.api.load(month);const n=setup(seed.disk),read=n.win.Port79DataCache.get;
 n.win.Port79DataCache.get=async key=>{await new Promise(r=>setTimeout(r,350));return read(key)};
 const pending=n.api.load(month);await new Promise(r=>setImmediate(r));
 assert.equal(n.calls[0].action,'getOvertimeReportCacheMeta');const b=await pending;
 assert.equal(b.source,'本機有效快取');assert.equal(n.calls.length,1,'slow local disk must not trigger raw-month downloads');
});
await test('a late full database preview cannot repaint a completed verified month',async()=>{
 const n=setup(),disk=deferred();let full=0;n.win.Port79DataCache.getSystemSnapshot=()=>disk.promise;n.win.P79WorkhoursCacheContext.applyFull=()=>full++;
 assert(await n.api.startup());disk.resolve({data:{fullDatabase:true,records:[{id:'obsolete'}]}});await new Promise(r=>setImmediate(r));assert.equal(full,0);
});
await test('folder reads slower than 1.5 seconds still preview and reuse the saved month',async()=>{
 const seed=setup();await seed.api.load(month);const n=setup(seed.disk),read=n.win.Port79DataCache.get,previews=[];
 n.win.Port79DataCache.get=async key=>{await new Promise(r=>setTimeout(r,1650));return read(key)};
 const b=await n.api.load(month,{onPreview:x=>previews.push(x)});
 assert.equal(previews.length,1);assert.equal(previews[0].preview,true);
 assert.equal(b.source,'本機有效快取');assert.equal(n.calls.length,1,'slow disk must not cause full cloud downloads');
});
await test('consumers joining startup receive the local preview before cloud validation finishes',async()=>{
 const seed=setup();await seed.api.load(month);const n=setup(seed.disk),held=n.hold('getOvertimeReportCacheMeta');
 const startup=n.api.startup();await new Promise(r=>setImmediate(r));
 const previews=[],table=n.api.load(month,{onPreview:b=>previews.push(b)});
 assert.equal(previews.length,1,'late subscriber immediately receives existing preview');
 assert.equal(previews[0].preview,true);assert.equal(n.calls.length,1);
 held.resolve();await Promise.all([startup,table]);
});
await test('authenticated roster rows appear before a cold raw attendance read finishes',async()=>{
 const n=setup(),held=n.hold('getAttendanceMonthRaw'),rosters=[];
 const pending=n.api.load(month,{onRoster:b=>rosters.push(b)});await new Promise(r=>setImmediate(r));
 assert.equal(rosters.length,1);assert.equal(rosters[0].roster.month,month);assert.equal(rosters[0].preview,true);
 assert.equal(n.disk.size,0,'early roster is not a verified saved bundle');
 const late=[],joined=n.api.load(month,{onRoster:b=>late.push(b)});assert.equal(late.length,1);
 held.resolve();const b=await pending;await joined;assert.equal(b.preview,false);
 assert.equal(n.calls.filter(x=>x.action==='getScheduleDataSecure').length,1);
});
await test('refresh subscribers do not receive an in-flight local preview',async()=>{
 const seed=setup();await seed.api.load(month);const n=setup(seed.disk),held=n.hold('getOvertimeReportCacheMeta');
 const first=n.api.load(month);await new Promise(r=>setImmediate(r));let previews=0;
 const refresh=n.api.load(month,{force:true,onPreview:()=>previews++});assert.equal(previews,0);
 held.resolve();await Promise.all([first,refresh]);
});
await test('a preview callback failure cannot break other consumers or the verified read',async()=>{
 const seed=setup();await seed.api.load(month);const n=setup(seed.disk),held=n.hold('getOvertimeReportCacheMeta');
 const first=n.api.load(month,{onPreview:()=>{throw Error('bad UI callback')}});await new Promise(r=>setImmediate(r));
 let good=0;const second=n.api.load(month,{onPreview:()=>good++});assert.equal(good,1);
 held.resolve();assert.equal((await first).preview,false);assert.equal((await second).preview,false);
});
await test('visible table joins startup instead of downloading another schedule or waiting on itself',async()=>{
 const seed=setup();await seed.api.load(month);const n=setup(seed.disk),held=n.hold('getOvertimeReportCacheMeta');
 const startup=n.api.startup();await new Promise(r=>setImmediate(r));
 const start=html.indexOf('        function p79LoadWorkOvertimeMonths('),end=html.indexOf('\n        function p79MergeWorkOvertimeSnapshot',start);
 assert(start>=0&&end>start);let legacyReads=0,previewRows=0,verifiedRows=0;
 const states=new Map(),page={window:n.win,Map,Set,Date,Intl,Promise,AbortController,encodeURIComponent,
  document:{getElementById:()=>({dataset:{p79MonthInitialized:'1'},value:month})},
  currentPort79SsoToken:()=> 'TOKEN',normalizeScheduleDateKey:v=>v,getAttendanceDateKey:v=>v,p79WorkhoursIsEditing:()=>false,
  p79WorkOvertimeMonths:states,p79WorkOvertimeLoadLanes:[Promise.resolve()],p79WorkOvertimeNextLane:0,
  p79WorkOvertimeLoadQueue:Promise.resolve(),lastAttendanceCloudRevision:'',
  fetch:async()=>{legacyReads++;throw Error('legacy cloud route called')}
 };
 // Match the actual page guard: the bundle must not await its own table promise.
 n.win.P79WorkhoursCacheContext.recentRoster=async()=>{const s=states.get(month);if(s?.cacheBundleLoad)return null;throw Error('missing shared-read guard')};
 n.win.P79WorkhoursCacheContext.applyBundle=(b,state)=>{if(!state)return;state.ready=true;state.pending=b.preview;state.rows=b.roster.schedules;b.preview?previewRows++:verifiedRows++};
 n.win.P79WorkhoursCacheContext.applyRoster=()=>{};
 vm.createContext(page);vm.runInContext(html.slice(start,end),page);page.p79LoadWorkOvertimeMonths([]);
 const state=states.get(month);assert.equal(previewRows,1,'table displays the existing local rows while metadata is held');
 assert.equal(state.pending,true);assert.equal(legacyReads,0);
 held.resolve();await Promise.all([startup,state.promise]);
 assert.equal(verifiedRows,1);assert.equal(state.pending,false);assert.equal(state.cacheBundleLoad,false);
 assert.equal(n.calls.filter(c=>c.action==='getScheduleDataSecure'&&c.month===month).length,0);
 assert.equal(legacyReads,0);
 await page.p79WorkOvertimeLoadQueue;
});
await test('late subscribers cannot replay a preview invalidated by a changed scope',async()=>{
 const seed=setup();await seed.api.load(month);const n=setup(seed.disk);n.scope('new-scope');
 const held=n.hold('getAttendanceMonthRaw'),first=n.api.load(month);await new Promise(r=>setImmediate(r));
 let previews=0,invalidations=0;const second=n.api.load(month,{onPreview:()=>previews++,onInvalidate:()=>invalidations++});
 assert.equal(previews,0);assert.equal(invalidations,1);
 held.resolve();await Promise.all([first,second]);
});
await test('actual page hydrators keep previews pending, deduplicate calculation and defer during edits',async()=>{
 const start=html.indexOf('window.P79WorkhoursCacheContext={'),end=html.indexOf('\n};',start)+3;
 let editing=false,calculations=0;const states=new Map(),page={window:{},Date,Set,Map,Array,String,Number,
  currentPort79SsoToken:()=> 'TOKEN',hasValidHomepageAdminSession:()=>true,p79WorkhoursIsEditing:()=>editing,
  p79WorkOvertimeMonths:states,employees:[],records:[],schedules:[],leaveRecords:[],sysConfig:{},
  mergeCloudEmployees:x=>x,normalizeEmployeeIdentifiers:x=>x,normalizeAttendanceRecordIdentifiers:x=>x,
  isLocallyDeletedAttendanceRecord:()=>false,attendanceRecordMonthKey:r=>r.month,
  mergeAttendanceRecordCollections:(a,b)=>[...a,...b],applyPendingOperationsToCloudData:x=>x,
  p79BuildWorkRestAttendance:()=>{calculations++;return {attendanceEvidence:{complete:true}}},
  lastAttendanceCloudRevision:'',lastCloudLoadSuccessAt:0,p79DeferredOvertimeDisplay:false,
  p79OvertimeCalculationCache:null,p79WorkOvertimeRenderTimer:null,initDropdowns(){},renderOvertimeStats(){},
  setTimeout:()=>1,clearTimeout(){}
 };
 vm.createContext(page);vm.runInContext(html.slice(start,end),page);const c=page.window.P79WorkhoursCacheContext;
 const bundle={month,version:'v1',roster:{employees:[],schedules:[{empId:'A1',month,schedule:{}}],overtimeLinkedDelete:true},raw:{[month]:{month,records:[]}},config:{config:{}},meta:{revisions:{attendance:'A1'}}};
 c.applyBundle({...bundle,preview:true});const state=states.get(month);
 assert.equal(state.pending,true);assert.equal(state.canDelete,false);
 c.applyBundle({...bundle,preview:true},state);assert.equal(calculations,1,'startup/table preview pair computes once');
 c.applyBundle({...bundle,preview:false});assert.equal(state.pending,false);assert.equal(state.canDelete,true);
 c.applyBundle({...bundle,preview:false},state);assert.equal(calculations,2,'startup/table confirmation pair computes once');
 state.pending=true;c.applyBundle({...bundle,preview:false},state);assert.equal(state.pending,false,'same-version refresh must clear loading');
 editing=true;const rows=state.rows;c.applyBundle({...bundle,version:'v2',preview:false},state);
 assert.equal(state.rows,rows);assert.equal(state.at,0);assert.equal(page.p79DeferredOvertimeDisplay,true);
 editing=false;c.applyRoster({month,roster:bundle.roster,source:'核對中'},state);
 assert.equal(state.cachePreview,true);assert.equal(state.canDelete,false);assert.equal(state.pending,true);
 state.cacheBundleLoad=true;state.promise=new Promise(()=>{});state.cacheMutationStamp='';
 assert.equal(await c.recentRoster(month,'TOKEN',''),null,'bundle-backed table never awaits its own promise');
});
await test('integration cache mirror stays aligned with the production disk-read behavior',async()=>{
 assert.equal(fs.readFileSync('integration-test/data-cache.js','utf8').trimEnd(),fs.readFileSync('assets/port79-data-cache.js','utf8').trimEnd());
});
console.log('VERIFIED WORKHOURS CACHE: '+passed+' scenarios passed');
})().catch(e=>{console.error(e);process.exitCode=1});


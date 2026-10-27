const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const source=fs.readFileSync('assets/port79-overtime-application.js','utf8'),html=fs.readFileSync('work-hours/index.html','utf8');
const fn=n=>{const a=html.indexOf('        function '+n+'(');assert(a>=0,n);return html.slice(a,html.indexOf('\n        }',a)+10);};
const month='2026-10',version='a'.repeat(64),date='2026-10-19',person={empId:'A1',name:'測試',attNo:'1',jobTitle:'ARMG'};
function setup(){
 let session='fixture',allowed=true,metaVersion=version,network=0;
 const rows=new Map(),raw={ok:true,month,schedules:[{month,empId:'A1',schedule:{[date]:'早',__meta:{[date]:{overtimeReport:{id:'R1',category:'休',overtimeStart:'08',overtimeEnd:'16',declaredHours:8,convertedHours:12.7}}}}}],records:[],leaveRecords:[],leaveCoverAssignments:[]};
 const c={console,Date,Intl,URL,Promise,Map,Set,TextEncoder,AbortController,setTimeout,clearTimeout,crypto:crypto.webcrypto,
  currentPort79SsoToken:()=>session,p79CanExportOvertimeApplication:()=>allowed,p79EmploymentStartDate:()=>'',currentEmp:person,
  getActiveGasUrl:()=> 'https://fixture.invalid',p79WorkhoursEligibleEmployees:()=>[person],
  normalizeAttendanceStatsAttNo:x=>String(x||''),normalizeScheduleDateKey:x=>x,toDateInputValue:x=>x,leaveBelongsToEmployee:(l,e)=>l.empId===e.empId,
  buildDailyAttendanceRows:rows=>rows,p79DirectAttendanceTimestamp:r=>Date.parse(r.timeStr+'+08:00'),
  fetch:async()=>{network++;return {ok:true,json:async()=>({ok:true,cacheSchemaVersion:1,version:metaVersion,month,auditBatchVersion:1})};}
 };c.window=c;vm.createContext(c);
 vm.runInContext(fs.readFileSync('assets/port79-rest-attendance.js','utf8'),c);
 vm.runInContext(fn('p79WorkRestLeaveDates')+fn('p79BuildWorkRestAttendance'),c);
 const start=html.indexOf('window.p79OvertimeApplicationContext={'),end=html.indexOf('\n</script>',start);vm.runInContext(html.slice(start,end),c);
 vm.runInContext(source,c);const h=c.P79OvertimeApplication,api=c.p79OvertimeApplicationContext;
 let cloudReads=0;api.snapshot=async()=>{cloudReads++;return {...api.buildPreviewSnapshot(month,raw),saveContext:{token:'MUST-NOT-PERSIST',cloud:raw}};};
 const cache={viewerKey:()=> 'A1@admin',get:async k=>rows.get(k),put:async row=>{rows.set(row.key,row);return true;}};
 return {c,h,api,cache,rows,raw,get cloudReads(){return cloudReads},get network(){return network},token:v=>session=v,allow:v=>allowed=v,version:v=>metaVersion=v};
}
const tick=()=>new Promise(r=>setImmediate(r));let passed=0;
async function test(name,f){await f();passed++;console.log('PASS '+name);}
(async()=>{
 await test('initial preview stores scoped raw source without token; next preview only checks version',async()=>{
  const t=setup();let r=await t.h.loadReportPreviewSnapshot(t.api,month,t.cache);assert.equal(r.source,'雲端正式資料（已核對版本）');await tick();assert.equal(t.rows.size,1);
  const saved=[...t.rows.values()][0];assert(!JSON.stringify(saved).includes('MUST-NOT-PERSIST'));assert(!('saveContext' in saved.data));
  saved.savedAt=Date.now()-30*86400000;r=await t.h.loadReportPreviewSnapshot(t.api,month,t.cache);assert.equal(r.source,'本機有效快取（雲端版本一致）');assert.equal(t.cloudReads,1);assert.equal(t.network,3);
 });
 await test('raw cache rebuilds actual attendance; no-card reports stay excluded',async()=>{
  const t=setup();await t.h.loadReportPreviewSnapshot(t.api,month,t.cache);await tick();const r=await t.h.loadReportPreviewSnapshot(t.api,month,t.cache);
  assert.equal(r.data.attendanceEvidence.days['A1|'+date].state,'rest');assert.equal(t.h.collect([r.data],[person],[date],'',[],'actual').rows.length,0);
  const hit=[...t.rows.values()][0];hit.data.records=[{empId:'A1',dateKey:date,clockIn:{timeStr:date+'T07:55:00'},clockOut:{timeStr:date+'T16:05:00'}}];
  const worked=await t.h.loadReportPreviewSnapshot(t.api,month,t.cache);assert.equal(worked.data.attendanceEvidence.days['A1|'+date].state,'worked');assert.equal(t.h.collect([worked.data],[person],[date],'',[],'actual').rows.length,1);
 });
 await test('version changes force a fresh read rather than using an old cache timestamp',async()=>{
  const t=setup();await t.h.loadReportPreviewSnapshot(t.api,month,t.cache);await tick();t.version('b'.repeat(64));await t.h.loadReportPreviewSnapshot(t.api,month,t.cache);assert.equal(t.cloudReads,2);
 });
 await test('wrong month, malformed records, future timestamp and wrong viewer keys cannot hit',async()=>{
  for(const kind of ['month','records','future','key']){const t=setup();await t.h.loadReportPreviewSnapshot(t.api,month,t.cache);await tick();const row=[...t.rows.values()][0];if(kind==='month')row.data.month='2026-09';if(kind==='records')delete row.data.records;if(kind==='future')row.savedAt=Date.now()+120000;if(kind==='key')row.key='OTHER|private';await t.h.loadReportPreviewSnapshot(t.api,month,t.cache);assert.equal(t.cloudReads,2,kind);}
 });
 await test('account/permission changes during metadata validation cannot reuse or save another account data',async()=>{
  for(const kind of ['token','permission']){const t=setup();t.api.cacheMeta=async()=>{if(kind==='token')t.token('OTHER');else t.allow(false);return {cacheSchemaVersion:1,version};};await assert.rejects(()=>t.h.loadReportPreviewSnapshot(t.api,month,t.cache),/已變更/);assert.equal(t.cloudReads,0);assert.equal(t.rows.size,0);}
 });
 await test('concurrent source mutation during fresh read is not stamped as a valid cache',async()=>{
  const t=setup(),real=t.api.snapshot;t.api.snapshot=async()=>{const d=await real();t.version('b'.repeat(64));return d;};await assert.rejects(()=>t.h.loadReportPreviewSnapshot(t.api,month,t.cache),/讀取期間/);assert.equal(t.rows.size,0);
 });
 await test('unsupported old GAS falls back; authorization failure does not',async()=>{
  const t=setup();t.c.fetch=async()=>({ok:true,json:async()=>({ok:false,error:'未知操作: [getOvertimeReportCacheMeta]。'})});let reads=0;t.api.previewSnapshot=async()=>{reads++;return {previewSource:'本機快取＋雲端補齊'};};const r=await t.h.loadReportPreviewSnapshot(t.api,month,t.cache);assert.equal(reads,1);assert.equal(r.auditBatchVersion,0);
  t.c.fetch=async()=>({ok:true,json:async()=>({ok:false,error:'沒有權限'})});await assert.rejects(()=>t.h.loadReportPreviewSnapshot(t.api,month,t.cache),/沒有權限/);assert.equal(reads,1);
 });
 const byDate=()=>new Map(Array.from({length:18},(_,i)=>['2026-10-'+String(i+1).padStart(2,'0'),[{empId:'A1',reportId:'R'+i}]]));
 await test('new GAS confirms all 18 dates with exactly one request and exact receipt identities',async()=>{
  const t=setup();let calls=0,legacy=0;const api={batchExportSupported:()=>true,auditWrite:async()=>{legacy++;},auditBatchWrite:async p=>{calls++;return {ok:true,auditBatchVersion:1,count:18,days:18,receipts:p.batches.map(g=>({date:g.date,count:g.entries.length,requestId:p.requestId+'-'+g.date.replace(/-/g,'')}))};}};
  const r=await t.h.writeExportAuditBatches(byDate(),api,'x.xlsx','OTEXP-TEST-0001');assert.equal(r,18);assert.equal(calls,1);assert.equal(legacy,0);
 });
 await test('batch timeout, wrong counts, duplicate/missing dates never fall back or claim success',async()=>{
  for(const kind of ['throw','count','date','request']){const t=setup();let legacy=0;await assert.rejects(()=>t.h.writeExportAuditBatches(byDate(),{batchExportSupported:()=>true,auditWrite:()=>{legacy++;},auditBatchWrite:async p=>{if(kind==='throw')throw Error('timeout');const ack={ok:true,auditBatchVersion:1,count:18,days:18,receipts:p.batches.map(g=>({date:g.date,count:1,requestId:p.requestId+'-'+g.date.replace(/-/g,'')}))};if(kind==='count')ack.count=0;if(kind==='date')ack.receipts[1]=ack.receipts[0];if(kind==='request')ack.receipts[0].requestId='WRONG';return ack;}},'x.xlsx','OTEXP-TEST-0001'));assert.equal(legacy,0);}
 });
 await test('old GAS uses at most three requests in flight with one idempotent ID per date',async()=>{
  const t=setup();let active=0,peak=0,calls=0;const r=await t.h.writeExportAuditBatches(byDate(),{auditWrite:async p=>{active++;peak=Math.max(peak,active);calls++;assert(p.requestId.endsWith(p.date.replace(/-/g,'')));await new Promise(r=>setTimeout(r,2));active--;return {ok:true,count:1};}},'x.xlsx','OTEXP-TEST-0001');assert.equal(r,18);assert.equal(calls,18);assert(peak>1&&peak<=3);
 });
 await test('official source JSON hashes protect the exact printed report version',async()=>{
  const t=setup(),report={id:'R1',code:'休08-16',note:'吊櫃作業'},str=JSON.stringify(report);let received;
  await t.h.writeExportAuditBatches(new Map([[date,[{empId:'A1',reportId:'R1',reportSource:str}]]]),{auditWrite:async p=>{received=p.entries[0];return {ok:true,count:1};}},'x.xlsx','OTEXP-TEST-0001');assert.equal(received.version,crypto.createHash('sha256').update(str).digest('hex'));assert(!('reportSource' in received));
 });
 assert(source.includes('void showAudit(); // 下載已啟動'));new vm.Script(source);for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
 console.log(JSON.stringify({passed,failed:0,scope:'Actual preview cache, attendance builder, audit receipts and source fingerprints; simulated network only'}));
})().catch(e=>{console.error(e);process.exitCode=1});

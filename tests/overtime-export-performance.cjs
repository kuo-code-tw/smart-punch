// Regression: local schedule cache is never mistaken for the attendance-only database.
// Export audit remains confirmed and idempotent, but no longer waits one date at a time.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-overtime-application.js','utf8');
const browser={window:{},console,Intl,Date,Promise,TextEncoder,URL,setTimeout,clearTimeout};
vm.runInNewContext(source,browser,{filename:'port79-overtime-application.js'});
const h=browser.window.P79OvertimeApplication;
assert.equal(typeof h.loadReportPreviewSnapshot,'function');
assert.equal(typeof h.writeExportAuditBatches,'function');
assert(source.includes("void showAudit(); // 下載已啟動"),'audit list must not lock completed downloads');

(async()=>{
 const month='2026-10',snapshot={ok:true,month,schedules:[{month,empId:'E1',schedule:{__meta:{}}}]};
 let cloudReads=0;
 const api={snapshot:async()=>{cloudReads++;return snapshot}};
 const cached={getExportSnapshot:async()=>({data:snapshot,savedAt:Date.now()})};
 let report=await h.loadReportPreviewSnapshot(api,month,cached);
 assert.equal(report.source,'本機有效快取');
 assert.equal(cloudReads,0,'a recent complete schedule cache must avoid cloud');

 const stale={getExportSnapshot:async()=>({data:snapshot,savedAt:Date.now()-61000})};
 report=await h.loadReportPreviewSnapshot(api,'2026-09',stale);
 assert.equal(report.source,'雲端正式資料');
 assert.equal(cloudReads,1,'old cache must revalidate to avoid silent stale formal reports');

 const wrong={getExportSnapshot:async()=>({data:{ok:true,schedules:[{month:'2026-09',schedule:{}}]},savedAt:Date.now()})};
 report=await h.loadReportPreviewSnapshot(api,month,wrong);
 assert.equal(report.source,'雲端正式資料');
 assert.equal(cloudReads,2,'cross-month cached schedule data must be rejected');

 const byDate=new Map(Array.from({length:18},(_,i)=>['2026-10-'+String(i+1).padStart(2,'0'),[{empId:'E1',reportId:'R'+i}]]));
 let active=0,max=0,calls=0;
 const seen=new Set(),progress=[];
 const out=await h.writeExportAuditBatches(byDate,{auditWrite:async({date,entries,requestId})=>{
  active++;max=Math.max(max,active);calls++;
  assert(!seen.has(date),'each date must be written exactly once');seen.add(date);
  assert(requestId.endsWith(date.replace(/-/g,'')),'request id must preserve date-based idempotency');
  await new Promise(r=>setTimeout(r,4));
  active--;
  return {ok:true,count:entries.length};
 }},'加班申報.xlsx','id-', (done,total)=>progress.push([done,total]));
 assert.equal(out,18);assert.equal(calls,18);assert.equal(seen.size,18);
 assert(max>1&&max<=3,'bounded concurrency must speed up without flooding GAS');
 assert.equal(progress.length,18);assert(progress.every(([count,total])=>count>=1&&count<=18&&total===18));

 let fail=false;
 await assert.rejects(()=>h.writeExportAuditBatches(new Map([['2026-10-01',[{empId:'E1'}]]]),{
  auditWrite:async()=>{fail=true;return {ok:false,error:'Cloud rejected'};}
 },'x.xlsx','try-'),/Cloud rejected/);
 assert(fail,'failure must be surfaced, never silently recorded as success');
 console.log('PASS overtime export: fresh cached schedules; stale/mismatched fallback; 18 dates bounded 3-way audit; explicit cloud failure');
})().catch(e=>{console.error(e);process.exitCode=1});

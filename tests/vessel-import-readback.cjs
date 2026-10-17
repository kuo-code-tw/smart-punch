const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
const helpers=html.slice(html.indexOf('// p79-import-readback-v20261017'),html.indexOf('async function importExcelFiles('));
const start=html.indexOf('async function importExcelFiles('),end=html.indexOf('\n// v2026.09.28.7.46',start);
assert(start>=0&&end>start);const batch=html.slice(start,end);
const row={id:'WR-1',workingNo:'5260001',source:'working-report',name:'TEST',workDate:'2026-09-30',startTime:'23:00',endTime:'01:00',disc:12,load:20,hatches:2,timeHours:2};
const master={workingNo:'5260001',firstDate:'2026-09-30',lastDate:'2026-10-01',compareMonth:'2026-10'};
const expected=[{master,records:[row]}],full={ok:true,shipMasters:[master],records:[row]};
const plain=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const reads=[],posts=[],stages=[];
 const c={console,Map,Set,JSON,Number,String,Math,Error,groups:[],assignments:[],shipMasters:[master],records:[row],
 excelBatchImporting:false,excelImportQueue:[],excelCurrentImportKey:'',excelQueueStats:{},lastExcelImportResult:{},
 isExcelFile:()=>true,excelImportFileKey:f=>f.name,
 queueExcelFiles(files){c.excelImportQueue.push(...files);c.excelQueueStats.totalQueued+=files.length;return {added:files.length,skipped:0}},
 setExcelDropStatus(){},updateExcelImportLiveStatus:x=>stages.push(x),setExcelImportStage(){},finishExcelImportLiveStatus(){},
 refreshMonthlyCompareAfterSystemChange(){},renderVesselSummary(){},renderEfficiencyTabFast(){},cloudStatus(){},toast(){},
 apiGetQuick:async(action,params,timeout)=>{reads.push({action,params,timeout});return plain(full)},
 postCloud:async(action,payload)=>{posts.push({action,payload:plain(payload)});return {ok:true}},
 importExcel:async f=>{c.lastExcelImportResult=f.name==='good'?{ok:true,workingNo:master.workingNo}:{ok:false,reason:'cancelled'};}
 };vm.createContext(c);vm.runInContext(helpers+'\n'+batch,c);return {c,reads,posts,stages};
}
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name)}
(async()=>{
await test('master-only cannot verify personnel',()=>{const x=setup();assert.equal(x.c.p79CheckWorkingReportReadback(expected,{shipMasters:[master],records:[]}).ok,false)});
await test('persisted master and rows pass',()=>{const x=setup();assert.equal(x.c.p79CheckWorkingReportReadback(expected,full).ok,true)});
await test('source, working number or quantities differing fail',()=>{for(const patch of [{source:'web'},{workingNo:'5260001-2'},{disc:13}]){const x=setup();assert.equal(x.c.p79CheckWorkingReportReadback(expected,{shipMasters:[master],records:[{...row,...patch}]}).ok,false)}});
await test('partial personnel response fails',()=>{const x=setup();assert.equal(x.c.p79CheckWorkingReportReadback([{master,records:[row,{...row,id:'WR-2'}]}],full).ok,false)});
await test('cross-month reads are distinct fresh reads',async()=>{const x=setup();assert.equal((await x.c.p79VerifyWorkingReportImports(expected)).verified,true);assert.deepEqual(x.reads.map(r=>r.params.month),['2026-09','2026-10']);assert(x.reads.every(r=>r.params.fresh==='1'&&r.timeout===25000))});
await test('read errors do not verify',async()=>{const x=setup();x.c.apiGetQuick=async()=>{throw Error('timeout')};await assert.rejects(x.c.p79VerifyWorkingReportImports(expected),/timeout/)});
await test('last cancelled file does not prevent previous successful files syncing',async()=>{const x=setup();await x.c.importExcelFiles([{name:'good'},{name:'cancel'}]);assert.equal(x.posts.length,1);assert.equal(x.c.excelQueueStats.success,1);assert.equal(x.c.excelQueueStats.failed,1);assert.equal(x.reads.length,2)});
await test('all failures send no write',async()=>{const x=setup();await x.c.importExcelFiles([{name:'cancel'}]);assert.equal(x.posts.length,0)});
await test('pending upload does not read or report verified',async()=>{const x=setup();x.c.postCloud=async()=>({ok:false,pendingCloudSync:true});await x.c.importExcelFiles([{name:'good'}]);assert.equal(x.reads.length,0);assert.equal(x.stages.at(-1).state,'error')});
await test('new files during sync continue in next batch',async()=>{const x=setup();let count=0;x.c.postCloud=async()=>{count++;if(count===1)x.c.excelImportQueue.push({name:'good'});return {ok:true}};await x.c.importExcelFiles([{name:'good'}]);assert.equal(count,2);assert.equal(x.c.excelImportQueue.length,0);assert.equal(x.c.excelBatchImporting,false)});
await test('inline JavaScript parses',()=>{for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1])});
console.log(JSON.stringify({passed,failed:0,scope:'Synthetic import lifecycle and readback; no production cloud or actual Excel tested'}));
})().catch(error=>{console.error(error);process.exitCode=1});

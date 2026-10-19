const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8'),a=html.indexOf('function mergeCloudRecordsWithLocal('),code=html.slice(a,html.indexOf('\n}',a)+2);
const stamp='2026-10-19T06:00:00Z';
const c={Map,Set,Array,String,Object,Date,num:x=>Number(x)||0,recordIdentityKey:r=>r.id,shipMasters:[{workingNo:'SHIP1',workingSheetSource:{importedAt:stamp,reportRecordIds:['new1','new2']}}]};
vm.createContext(c);vm.runInContext(code,c);
const local=[{id:'new1',workingNo:'SHIP1',workingSheetImportedAt:stamp,source:'working-report',workingSheetRuleVersion:'SHIFT_X2',disc:381,load:0},{id:'new2',workingNo:'SHIP1',workingSheetImportedAt:stamp,source:'working-report',workingSheetRuleVersion:'SHIFT_X2',disc:0,load:390}];
const remote=[{id:'old-extra',workingNo:'SHIP1',disc:102},{id:'new1',workingNo:'SHIP1',disc:400},{id:'other',workingNo:'SHIP2',disc:100},{id:'child',workingNo:'SHIP1-1',disc:20}];
const out=c.mergeCloudRecordsWithLocal(remote,local);
assert(!out.some(r=>r.id==='old-extra'));assert(out.some(r=>r.id==='other'));assert(out.some(r=>r.id==='child'));
assert.equal(out.filter(r=>r.workingNo==='SHIP1').reduce((n,r)=>n+(r.disc||0)+(r.load||0),0),771);
assert(c.mergeCloudRecordsWithLocal(remote,local.slice(0,1)).some(r=>r.id==='old-extra'),'partial local data cannot delete cloud history');
const newer=remote.map(r=>r.id==='old-extra'?{...r,workingSheetImportedAt:'2026-10-20T00:00:00Z'}:r);
assert(c.mergeCloudRecordsWithLocal(newer,local).some(r=>r.id==='old-extra'),'newer remote batch is protected');
delete c.shipMasters[0].workingSheetSource.reportRecordIds;assert(c.mergeCloudRecordsWithLocal(remote,local).some(r=>r.id==='old-extra'),'legacy records without a replacement manifest retained');
console.log('PASS complete reimport replaces exact job, preserves other jobs and child jobs, partial snapshots and newer cloud imports');

// 另一台裝置以新雲端完整批次取代舊本機，不能把舊列補回、再上傳。
c.shipMasters[0].workingSheetSource.reportRecordIds=['new1','new2'];
const otherDevice=c.mergeCloudRecordsWithLocal(local,remote);
assert(!otherDevice.some(r=>r.id==='old-extra'));
assert.equal(otherDevice.filter(r=>r.workingNo==='SHIP1').reduce((n,r)=>n+(r.disc||0)+(r.load||0),0),771);
assert(otherDevice.some(r=>r.id==='other'));assert(otherDevice.some(r=>r.id==='child'));
assert(c.mergeCloudRecordsWithLocal(local.slice(0,1),remote).some(r=>r.id==='old-extra'),'partial cloud snapshot cannot discard local rows');
const savedMasters=c.shipMasters;c.shipMasters=[];
assert(!c.mergeCloudRecordsWithLocal(local,remote,savedMasters).some(r=>r.id==='old-extra'),'pre-upload merge uses fetched manifest even if local master is stale');
console.log('PASS second-device cloud replacement, partial cloud preservation and remote manifest during upload');
// 舊版沒有 manifest 的早上匯入，也必須能依原始批次與完整原表核對復原。
c.round=(n,d)=>Math.round(n*10**d)/10**d;
c.workloadRecordMetrics=r=>({disc:r.disc||0,load:r.load||0,hc:r.hatches||0,containers:(r.disc||0)+(r.load||0)});
c.recordRawMoveSplit=r=>({disc:r.disc||0,load:r.load||0});c.effectiveBundleRecord=r=>r;
const auditStart=html.indexOf('function workloadSheetAudit(');vm.runInContext(html.slice(auditStart,html.indexOf('\n}',auditStart)+2),c);
const legacyMaster=()=>({workingNo:'SHIP1',workingSheetSource:{importedAt:stamp,totalContainers:771,totalMoves:771,shiftMoves:0,hatches:26,bundleDeduct:0,disc:381,load:390}});
const good=local.map((r,i)=>({...r,hatches:i===0?26:0}));
c.shipMasters=[legacyMaster()];
const mixed=c.mergeCloudRecordsWithLocal([...good,{id:'stale41',workingNo:'SHIP1',source:'working-report',disc:41,workingSheetImportedAt:'2026-10-18T06:00:00Z'}],[]);
assert.equal(mixed.filter(r=>r.workingNo==='SHIP1').reduce((n,r)=>n+(r.disc||0)+(r.load||0),0),771);
assert(c.shipMasters[0].workingSheetSource.legacyVerifiedReplacement);
c.shipMasters=[legacyMaster()];assert(c.mergeCloudRecordsWithLocal(remote,good.slice(0,1)).some(r=>r.id==='old-extra'),'insufficient legacy batch cannot delete history');
c.shipMasters=[legacyMaster()];assert(c.mergeCloudRecordsWithLocal(remote,good.map(r=>({...r,hatches:0}))).some(r=>r.id==='old-extra'),'equal container total but wrong HC cannot replace history');
c.shipMasters=[legacyMaster()];assert(c.mergeCloudRecordsWithLocal(newer,good).some(r=>r.id==='old-extra'),'legacy migration never removes newer imports');
console.log('PASS legacy batch without manifest restores 771, with full DISC/LOAD, HC and Bundle audit; partial/invalid/newer data protected');
(async()=>{
 const start=html.indexOf('const p79WorkingReportRepairReads='),finish=html.indexOf('async function syncFromCloud(',start);let reads=0,merged=0;
 const q={Set,JSON,String,console,shipMasters:[legacyMaster()],records:[],workloadSheetAudit:()=>({status:'mismatch'}),apiGet:async(action,scope)=>{assert.equal(action,'gcGetData');assert.deepEqual(Object.keys(scope),[]);reads++;return{ok:true,records:[]};},mergeEfficiencyCloudData:()=>merged++};
 vm.createContext(q);vm.runInContext(html.slice(start,finish),q);await q.p79ReadCompleteWorkingReportOnMismatch();await q.p79ReadCompleteWorkingReportOnMismatch();assert.equal(reads,1);assert.equal(merged,1);
 console.log('PASS mismatch reads complete cloud data once instead of trusting partial month response');
})().catch(e=>{console.error(e);process.exitCode=1;});

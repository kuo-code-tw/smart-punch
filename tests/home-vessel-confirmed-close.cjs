'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const begin=html.indexOf('window.P79VesselHomeImport={');
const end=html.indexOf('\n};',begin);
assert(begin>0&&end>begin,'original embedded vessel importer is available');
const snippet=html.slice(begin,end+3);
new vm.Script(snippet);
function fixture({jobs,masters,records,pending=false,readError='',processed,success,failed}={}){
  jobs=jobs||[{workingNo:'SHIP-1',recordCount:2,recordIds:['ROW-1','ROW-2']}];
  masters=masters===undefined?[{workingNo:'SHIP-1'}]:masters;
  records=records===undefined?[{id:'ROW-1'},{id:'ROW-2'}]:records;
  let queueReads=0,reads=0,uploads=0;
  const ctx={
    window:{},document:{getElementById:()=>({textContent:'雲端狀態'})},
    p79VesselHomeImportInitialized:true,p79EfficiencyAuthReady:true,
    canManageEfficiency:()=>true,port79ShipAutoSyncBusy:false,p79EfficiencyManualSyncActive:false,
    ensureGcQueueReady:async()=>{},
    readQueue:()=>{queueReads++;return pending&&queueReads>1?[{id:'unsynced'}]:[];},
    cloudStatus(){},
    restoreVesselDataFromCloud:async()=>true,
    importExcelFiles:async()=>{uploads++;},
    p79ReadFullVesselData:async()=>{reads++;if(readError)throw Error(readError);return {shipMasters:masters,records};},
    excelQueueStats:{
      importedJobs:jobs,processed:processed??jobs.length,success:success??jobs.length,failed:failed??0
    }
  };
  vm.runInNewContext(snippet,ctx,{timeout:2000});
  return {ctx,reads:()=>reads,uploads:()=>uploads};
}
(async()=>{
  const confirmed=fixture();
  const result=await confirmed.ctx.window.P79VesselHomeImport.importFiles([{name:'ship.xlsx'}]);
  assert.equal(result.cloudConfirmed,true,'cloud master and every personnel record ID must be present');
  assert.equal(confirmed.reads(),1,'fresh cloud readback must occur before completed result');
  const missingRow=fixture({records:[{id:'ROW-1'}]});
  const r1=await missingRow.ctx.window.P79VesselHomeImport.importFiles([{name:'ship.xlsx'}]);
  assert.equal(r1.cloudConfirmed,false,'missing personnel row must leave homepage dialog open');
  assert.match(r1.cloudIssue,/未全部吻合/);
  const missingMaster=fixture({masters:[]});
  const r2=await missingMaster.ctx.window.P79VesselHomeImport.importFiles([{name:'ship.xlsx'}]);
  assert.equal(r2.cloudConfirmed,false,'missing vessel master is not a confirmed cloud import');
  const pending=fixture({pending:true});
  const r3=await pending.ctx.window.P79VesselHomeImport.importFiles([{name:'ship.xlsx'}]);
  assert.equal(r3.cloudConfirmed,false,'durable cloud outbox cannot be treated as completed');
  assert.equal(pending.reads(),0,'do not trust cloud readback while pending writes exist');
  const failedRead=fixture({readError:'雲端逾時'});
  const r4=await failedRead.ctx.window.P79VesselHomeImport.importFiles([{name:'ship.xlsx'}]);
  assert.equal(r4.cloudConfirmed,false);
  assert.match(r4.cloudIssue,/雲端逾時/);
  const partial=fixture({failed:1,success:0});
  const r5=await partial.ctx.window.P79VesselHomeImport.importFiles([{name:'ship.xlsx'}]);
  assert.equal(r5.cloudConfirmed,false,'failed batch must never auto close');
  const noId=fixture({jobs:[{workingNo:'SHIP-1',recordCount:2,recordIds:[]}]});
  const r6=await noId.ctx.window.P79VesselHomeImport.importFiles([{name:'ship.xlsx'}]);
  assert.equal(r6.cloudConfirmed,false,'cannot verify imported detail rows without IDs');
  const two=fixture({
    jobs:[
      {workingNo:'SHIP-1',recordCount:2,recordIds:['ROW-1','ROW-2']},
      {workingNo:'SHIP-2',recordCount:1,recordIds:['ROW-3']}
    ],
    masters:[{workingNo:'SHIP-1'},{workingNo:'SHIP-2'}],
    records:[{id:'ROW-1'},{id:'ROW-2'},{id:'ROW-3'}]
  });
  const r7=await two.ctx.window.P79VesselHomeImport.importFiles([{name:'a.xlsx'},{name:'b.xlsx'}]);
  assert.equal(r7.cloudConfirmed,true,'all vessel files must read back before closing');
  console.log('PASS original vessel importer cloud ACK/readback, partial records, missing master, queued writes, timeout and batch checks');
})().catch(e=>{console.error(e);process.exitCode=1});

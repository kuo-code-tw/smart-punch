// Synthetic regression test for the clean manual vessel-sync fast path.
// No live Google API calls, credentials, cloud writes or production data.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','aqc-efficiency','index.html'),'utf8');
const begin=html.indexOf('async function manualCloudSync(){');
const finish=html.indexOf('\n}\n\nasync function checkRevision(',begin);
assert(begin>=0&&finish>begin,'manualCloudSync function must be present');
const source=html.slice(begin,finish+2);
async function run(options={}){
  const queue=options.pending?[{id:'Q1',action:'gcUpsertRecord'}]:[];
  const calls={meta:0,pull:0,flush:0,states:[],stages:[],toasts:[]};
  const elements={
    efficiencyCloudSyncBtn:{disabled:false,style:{opacity:'1'}},
    efficiencySyncError:{hidden:true,open:false,style:{color:''}},
    efficiencySyncErrorText:{textContent:''},
    efficiencySyncErrorSummary:{textContent:''}
  };
  const c={
    console:{warn(){},error(){},log(){}},
    Date,Promise,
    setTimeout:()=>1,clearTimeout:()=>{},
    document:{getElementById:id=>elements[id]||null},
    P79FullRefreshRunning:false,p79EfficiencyManualSyncActive:false,
    p79EfficiencyReadbackRequired:!!options.readback,
    efficiencyHasUnsavedChanges:!!options.dirty,
    port79ShipAutoSyncBusy:false,cloudBusy:false,gcQueueFlushPromise:null,
    p79EfficiencySyncCurrentStage:'',p79EfficiencySyncPreflightRemote:null,
    p79EfficiencySyncTrace:[],
    requireEfficiencyAccess:()=>true,
    readQueue:()=>queue,
    flushQueue:async()=>{calls.flush++;queue.splice(0);return{ok:true};},
    vesselRevisionIsCurrent:async()=>{
      calls.meta++;
      if(options.metaError)throw Error('metadata temporarily unavailable');
      if(options.concurrentEdit)queue.push({id:'new',action:'gcUpsertRecord'});
      return options.sameRevision!==false;
    },
    restoreVesselDataFromCloud:async(show,strict)=>{
      assert.equal(strict,true,'full readback must be strict');
      calls.pull++;
      if(options.pullError)throw Error('full readback failed');
      return true;
    },
    p79SetEfficiencySyncLight:state=>calls.states.push(state),
    p79EfficiencySyncStep:stage=>{calls.stages.push(stage);c.p79EfficiencySyncCurrentStage=stage;},
    cloudStatus:()=>{},setEfficiencySaveState:()=>{c.efficiencyHasUnsavedChanges=false;},
    toast:msg=>calls.toasts.push(msg)
  };
  vm.createContext(c);vm.runInContext(source,c);
  await c.manualCloudSync();
  return {calls,queue,elements,c};
}
(async()=>{
  let passed=0;
  async function test(name,options,check){
    const result=await run(options);check(result);passed++;console.log('PASS '+name);
  }
  await test('clean unchanged sync checks metadata without full download',{},({calls,queue})=>{
    assert.equal(calls.flush,1);assert.equal(calls.meta,1);assert.equal(calls.pull,0);
    assert(calls.states.includes('success'));assert.equal(queue.length,0);
    assert(calls.toasts.some(s=>s.includes('無需重複下載')));
  });
  await test('pending upload still requires full readback',{pending:true},({calls})=>{
    assert.equal(calls.meta,0);assert.equal(calls.pull,1);assert(calls.states.includes('success'));
  });
  await test('unconfirmed write still requires full readback',{readback:true},({calls})=>{
    assert.equal(calls.meta,0);assert.equal(calls.pull,1);
  });
  await test('unsaved local changes never use revision shortcut',{dirty:true},({calls})=>{
    assert.equal(calls.meta,0);assert.equal(calls.pull,1);
  });
  await test('changed server revision triggers full readback',{sameRevision:false},({calls})=>{
    assert.equal(calls.meta,1);assert.equal(calls.pull,1);
  });
  await test('failed metadata check falls back to full readback',{metaError:true},({calls})=>{
    assert.equal(calls.meta,1);assert.equal(calls.pull,1);assert(calls.states.includes('success'));
  });
  await test('new edits arriving during revision check are not acknowledged',{concurrentEdit:true},({calls,queue})=>{
    assert.equal(calls.meta,1);assert.equal(calls.pull,0);assert.equal(queue.length,1);
    assert(!calls.states.includes('success'));assert(calls.states.includes('error'));
  });
  await test('strict full read failure does not report success',{pending:true,pullError:true},({calls})=>{
    assert.equal(calls.pull,1);assert(!calls.states.includes('success'));assert(calls.states.includes('error'));
  });
  console.log(JSON.stringify({passed,failed:0,scope:'isolated synthetic logic only; no live cloud writes'}));
})().catch(e=>{console.error(e);process.exitCode=1;});

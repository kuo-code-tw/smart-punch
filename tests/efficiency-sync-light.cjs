const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const light=html.slice(html.indexOf('let p79EfficiencyManualSyncActive='),html.indexOf('\n',html.indexOf('} ',html.indexOf('let p79EfficiencyManualSyncActive=')))+1);
const manual=html.slice(html.indexOf('async function manualCloudSync('),html.indexOf('async function checkRevision('));
(async()=>{
 for(const scenario of ['success','upload-failure','read-failure','new-pending']){
  const elements=Object.fromEntries(['efficiencySyncLight','efficiencySyncDot','efficiencySyncLabel','cloudState','efficiencyCloudSyncBtn'].map(id=>[id,{style:{},dataset:{},textContent:'同步雲端'}]));let pending=[],release,readStarted=false;
  const c={console:{error(){}},document:{getElementById:id=>elements[id]},readQueue:()=>pending,requireEfficiencyAccess:()=>true,flushQueue:async()=>{if(scenario==='upload-failure')return{ok:false};return{ok:true};},restoreVesselDataFromCloud:async()=>{readStarted=true;c.p79SetEfficiencySyncLight('success');await new Promise(resolve=>release=resolve);if(scenario==='read-failure')throw Error('read failed');if(scenario==='new-pending')pending=[{}];return true;},setEfficiencySaveState(){},toast(){}};
  vm.createContext(c);vm.runInContext(light,c);vm.runInContext(manual,c);
  const task=c.manualCloudSync();await new Promise(resolve=>setImmediate(resolve));
  if(scenario!=='upload-failure'){assert(readStarted);assert.equal(elements.efficiencySyncLight.dataset.state,'syncing','intermediate successful read cannot turn green');release();}
  await task;assert.equal(elements.efficiencySyncLight.dataset.state,scenario==='success'?'success':'error');
  if(scenario==='success'){pending=[{}];c.p79SetEfficiencySyncLight('success');assert.equal(elements.efficiencySyncLight.dataset.state,'pending','queue blocks green');}
 }
 console.log('PASS sync stays amber through upload/readback, green only after full success; failures and new writes block green');
})().catch(e=>{console.error(e);process.exitCode=1;});

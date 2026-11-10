const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const light=html.slice(html.indexOf('let p79EfficiencyManualSyncActive='),html.indexOf('\n',html.indexOf('} ',html.indexOf('let p79EfficiencyManualSyncActive=')))+1);
const manual=html.slice(html.indexOf('async function manualCloudSync('),html.indexOf('async function checkRevision('));
(async()=>{
 for(const scenario of ['success','upload-failure','read-failure','new-pending','busy-then-success','slow-warning']){
  const elements=Object.fromEntries(['efficiencySyncLight','efficiencySyncDot','efficiencySyncLabel','cloudState','efficiencyCloudSyncBtn','efficiencySyncError','efficiencySyncErrorText'].map(id=>[id,{style:{setProperty(k,v){this[k]=v}},dataset:{},textContent:'同步雲端'}]));let pending=[],release,readStarted=false;
  const c={setTimeout,clearTimeout,console:{error(){}},document:{getElementById:id=>elements[id]},readQueue:()=>pending,requireEfficiencyAccess:()=>true,flushQueue:async()=>{if(scenario==='upload-failure')return{ok:false,error:'雲端鎖定，稍後重試'};return{ok:true};},restoreVesselDataFromCloud:async()=>{readStarted=true;c.p79SetEfficiencySyncLight('success');await new Promise(resolve=>release=resolve);if(scenario==='read-failure')throw Error('read failed');if(scenario==='new-pending')pending=[{}];return true;},setEfficiencySaveState(){},toast(){}};
  if(scenario==='busy-then-success'){c.cloudBusy=true;c.gcQueueFlushPromise=null;c.setTimeout=(fn,ms)=>{if(ms>1000)return setTimeout(fn,ms);c.cloudBusy=false;queueMicrotask(fn);};}
  let watchdog;
  if(scenario==='slow-warning'){c.setTimeout=(fn,ms)=>{if(ms===60000){watchdog=fn;return 0;}return setTimeout(fn,ms);};}
  vm.createContext(c);vm.runInContext(light,c);vm.runInContext(manual,c);
  const task=c.manualCloudSync();await new Promise(resolve=>setImmediate(resolve));
  if(scenario!=='upload-failure'){assert(readStarted);assert.equal(elements.efficiencySyncLight.dataset.state,'syncing','intermediate successful read cannot turn green');if(scenario==='slow-warning'){watchdog();assert.equal(elements.efficiencySyncLight.dataset.state,'syncing');assert.equal(elements.efficiencySyncError.open,false,'slow request must not expand an error dialog');assert.equal(elements.efficiencySyncError.style.color,'#92400e');}release();}
  await task;assert.equal(elements.efficiencySyncLight.dataset.state,['success','busy-then-success','slow-warning'].includes(scenario)?'success':'error');
  if(scenario==='upload-failure'){assert(elements.efficiencySyncErrorText.textContent.includes('雲端鎖定'));assert.equal(elements.efficiencySyncError.open,true);}
  if(scenario==='success'){pending=[{}];c.p79SetEfficiencySyncLight('success');assert.equal(elements.efficiencySyncLight.dataset.state,'pending','queue blocks green');}
 }
 // Reproduce the screenshot: zero queued writes, an old red failure, then an automatic read retry.
 {const elements=Object.fromEntries(['efficiencySyncLight','efficiencySyncDot','efficiencySyncLabel','efficiencySyncError','efficiencySyncErrorText','efficiencySyncErrorSummary','efficiencyCloudSyncBtn'].map(id=>[id,{style:{setProperty(){}},dataset:{},hidden:false,open:true,textContent:'舊的上傳失敗：待同步 0 批'}]));const c={document:{getElementById:id=>elements[id]},readQueue:()=>[]};vm.createContext(c);vm.runInContext(light,c);c.p79SetEfficiencySyncLight('pending','雲端忙碌，等待讀回確認（自動重試 1）');assert.equal(elements.efficiencySyncError.open,false);assert.equal(elements.efficiencySyncError.style.color,'#92400e');assert(elements.efficiencySyncErrorText.textContent.includes('正在讀回確認'));assert(!elements.efficiencySyncErrorText.textContent.includes('上傳失敗'));c.p79SetEfficiencySyncLight('success');assert.equal(elements.efficiencySyncError.hidden,true);assert.equal(elements.efficiencySyncErrorText.textContent,'')}
 assert(/id="efficiencyCloudSyncBtn"[^>]*><span id="efficiencySyncLight"/.test(html));
 assert(!manual.includes('btn.textContent='));
 console.log('PASS sync stays amber through upload/readback, green only after full success; failures and new writes block green');
})().catch(e=>{console.error(e);process.exitCode=1;});

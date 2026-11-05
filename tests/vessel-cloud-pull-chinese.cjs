'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const full=fs.readFileSync('assets/port79-full-refresh.js','utf8');
const app=html.slice(html.indexOf('async function forcePullVesselCloudData(){'),html.indexOf('window.forcePullVesselCloudData=forcePullVesselCloudData;'));
assert(app.startsWith('async function forcePullVesselCloudData(){'));
assert(full.includes("g.restoreVesselDataFromCloud(false,true)"),'topbar must use real strict vessel readback');
assert(full.includes("context.pendingReason?.()"),'pending edits should explain why refresh is blocked');
assert(!full.includes("(g.shipMasters?.length||0)"),'topbar must not report global let variables as zero');
assert(!app.includes('vesselRevisionIsCurrent('),'explicit pull must not skip remote read because revision matches');
assert(app.includes('restoreVesselDataFromCloud(false,true)'),'explicit pull requires full authenticated cloud download');
assert(html.includes('id="shipEditLocalName"'),'Chinese name is independently editable');
assert(html.includes("localName:updated.localName"),'verified Chinese name stays with edited master');
assert(html.includes("中文：${esc(x.localName||'未提供')}"),'vessel list displays Chinese name or transparent fallback');
assert(html.includes('if(previousMaster?.localName&&!master.localName)'),'English-only reimport preserves confirmed Chinese name');
assert(html.includes("const remote=await apiGetQuick('gcGetData',{},GC_FULL_READ_TIMEOUT_MS)"),'Excel upload requires full cloud readback');
assert(html.includes('expectedIds'),'Excel cloud verification must inspect imported person rows');
async function runCase({pending=false,remoteOk=true}={}){
 let reads=0,queued=pending?[{id:'P'}]:[],events=[];
 const btn={textContent:'雲端拉取',disabled:false,style:{}};
 const cx={console,document:{getElementById:id=>id==='forceVesselCloudPullBtn'?btn:null},
 requireEfficiencyAccess:()=>true,ensureGcQueueReady:async()=>{},
 readQueue:()=>queued,cloudBusy:false,port79ShipAutoSyncBusy:false,p79EfficiencyManualSyncActive:false,
 cloudStatus:t=>events.push(t),toast:t=>events.push(t),
 restoreVesselDataFromCloud:async(show,strict)=>{reads++;assert.equal(show,false);assert.equal(strict,true);return remoteOk;},
 shipMasters:[{workingNo:'ONE'}],records:[{id:'ROW'}]};
 cx.window=cx;vm.createContext(cx);vm.runInContext(app,cx);
 const ok=await cx.forcePullVesselCloudData();
 return {ok,reads,events,btn};
}
(async()=>{
 const pass=await runCase();assert.equal(pass.ok,true);assert.equal(pass.reads,1);assert.equal(pass.btn.disabled,false);
 const blocked=await runCase({pending:true});assert.equal(blocked.ok,false);assert.equal(blocked.reads,0);assert(blocked.events.some(s=>s.includes('未確認上傳')));
 const fail=await runCase({remoteOk:false});assert.equal(fail.ok,false);assert.equal(fail.reads,1);
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(!/\bsrc=/.test(m[1])&&m[2].trim())new vm.Script(m[2]);
 }
 console.log('PASS vessel manual full pull, pending guards, cloud readback, Chinese vessel source and inline script parse');
})().catch(e=>{console.error(e);process.exitCode=1});

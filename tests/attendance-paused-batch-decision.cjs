'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('attendance/index.html','utf8');
const source=fs.readFileSync('assets/port79-attendance-core.js','utf8');
const begin=html.indexOf('async function keepVerifiedCloudBatch(button){');
const end=html.indexOf('async function handleInspectorClick(event){',begin);
assert(begin>=0&&end>begin,'The batch decision handler must be present');
const code=html.slice(begin,end);
new vm.Script(code);

assert.match(source,/verifiedConflicts:\[\]/);
assert.match(source,/p79PausedReviewIdentity\(payload,unique\[0\]\)/);
assert.match(source,/summary\.verifiedConflicts\.push\(/);
assert.match(html,/data-keep-cloud-verified-batch/);
assert.match(html,/已核實為相同員工、相同打卡紀錄/);
assert.match(html,/保留正式雲端，備份撤回已核對的/);
assert.match(html,/未核對成功的其餘項目仍保留/);
assert.match(html,/p79V5AuditPausedQueue\(\)/);
assert.match(html,/p79V5WithdrawPausedWrites\(selected\)/);
assert.match(html,/確認套用我的修改/);
assert.match(html,/核對並處理/);

const payload={action:'updateRecord',originalTimeStr:'2026/11/19 07:49:00',
 record:{id:'179503',empId:'E01',attNo:'01',timeStr:'2026/11/19 08:10:00',status:'下班簽退'}};
const row={key:'updateRecord:179503:E01:2026-11-19',id:'179503',
 originalTimeStr:payload.originalTimeStr,
 cloudTimeStr:'2026/11/19 07:47:00',
 desiredTimeStr:'2026/11/19 08:10:00',
 cloudStatus:'下班簽退',desiredStatus:'下班簽退',cloudNote:'',desiredNote:''};
async function test({changedCloud=false,changedDraft=false,approved=true,alreadyResolved=false}={}){
 const status={textContent:'',innerHTML:''},button={disabled:false};
 const actions={withdrawn:0,confirmed:0,reads:0,render:0,reviews:[]};
 const prior={...row,payload:JSON.parse(JSON.stringify(payload))};
 const next={...row,cloudTimeStr:changedCloud?'2026/11/19 07:48:00':row.cloudTimeStr};
 const queued={key:row.key,paused:true,payload:JSON.parse(JSON.stringify(payload))};
 if(changedDraft)queued.payload.record.timeStr='2026/11/19 10:00:00';
 const context={Date,String,JSON,Map,Error,
  reviewBusy:false,auditBusy:false,verifiedPausedBatch:[prior],inspectorQueueSnapshot:'',
  document:{getElementById:()=>status},
  window:{
   p79V5AuditPausedQueue:async()=>{actions.reads++;return {verifiedConflicts:alreadyResolved?[]:[next]};},
   p79V5ReadPendingQueue:()=>alreadyResolved?[]:[queued],
   p79V5WithdrawPausedWrites:selected=>{actions.withdrawn++;actions.reviews.push(...selected);return {ok:true,count:selected.length}}
  },
  confirm:()=>{actions.confirmed++;return approved},
  show:()=>{actions.render++},p79ReviewNext:()=>{},
  queueSnapshot:()=> 'current'
 };
 vm.createContext(context);vm.runInContext(code,context);
 await context.keepVerifiedCloudBatch(button);
 return {status,button,actions,context};
}
(async()=>{
 let a=await test();
 assert.equal(a.actions.reads,1,'Batch choice performs new official audit immediately before archiving');
 assert.equal(a.actions.confirmed,1);
 assert.equal(a.actions.withdrawn,1);
 assert.equal(a.actions.reviews[0].key,row.key);
 assert.equal(a.actions.reviews[0].payload.record.timeStr,payload.record.timeStr,'Exact draft survives until the approved archival');
 assert.equal(a.context.verifiedPausedBatch.length,0);
 assert.equal(a.button.disabled,false);
 a=await test({changedCloud:true});
 assert.equal(a.actions.confirmed,0,'Changed official time cannot be confirmed using a stale comparison');
 assert.equal(a.actions.withdrawn,0);
 assert.match(a.status.textContent,/沒有撤回任何舊修改/);
 a=await test({changedDraft:true});
 assert.equal(a.actions.confirmed,0,'A newer local edit prevents batch retirement');
 assert.equal(a.actions.withdrawn,0);
 a=await test({approved:false});
 assert.equal(a.actions.confirmed,1);
 assert.equal(a.actions.withdrawn,0,'Cancelled batch never removes drafts');
 a=await test({alreadyResolved:true});
 assert.equal(a.actions.withdrawn,0);
 assert.equal(a.actions.confirmed,0);
 console.log('PASS attendance batch decision: one verified action, fresh official reads, no overwrite, cancel, cloud drift and edit drift all preserved');
})().catch(e=>{console.error(e);process.exitCode=1});

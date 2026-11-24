'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const core=fs.readFileSync('assets/port79-attendance-core.js','utf8');
const html=fs.readFileSync('attendance/index.html','utf8');
function slice(start,end){
 const a=core.indexOf(start),b=core.indexOf(end,a+start.length);
 assert(a>=0&&b>a,start+' missing');return core.slice(a,b);
}
const functions=[
 slice('function p79EveryDuplicateAttendanceRowAlreadySaved(', 'async function p79ReadAttendanceEditCloud('),
 slice('async function p79ReadAttendanceEditCloud(', 'async function p79PrepareAttendanceEdit('),
 slice('async function p79AuditPausedAttendanceQueue(', 'async function p79ReviewPausedAttendanceWrite(')
];
for(const fn of functions)new vm.Script(fn);
const normalize=x=>String(x??'').trim().replace(/-/g,'/').replace(/(?:\.000)?$/,'');
const record=(time='2026/11/19 07:47:00',extra={})=>({
 id:'1795015495797',empId:'E791',attNo:'A791',name:'測試員工',status:'下班簽退',
 timeStr:time,note:'已核對',...extra
});
const payload=()=>({action:'updateRecord',originalTimeStr:'2026/11/19 07:46:00',record:record('2026/11/19 08:10:00')});
function fixture(cloud,seed=payload()){
 let queue=[{key:'Q-1795015495797',payload:JSON.parse(JSON.stringify(seed)),paused:true,state:'paused'}];
 const posts=[],get=[];
 const ctx={Date,JSON,String,Number,Array,Set,Map,Error,Promise,AbortController,setTimeout,clearTimeout,encodeURIComponent,
  gasUrl:()=> 'https://test.invalid/exec',token:()=> 'TEST_TOKEN',
  readQueue:()=>queue,lastDoneAt:0,updateUi(){},markRecentAttendanceMutationCloudConfirmed(){},
  payloadRecordId:p=>String(p.record.id),
  normalizeCompareValue:normalize,
  getAttendanceRecordType:r=>r.status.includes('上班')?'IN':r.status.includes('下班')?'OUT':'OTHER',
  p79PausedReviewIdentity:(p,c)=>String(p.record.id)===String(c.id)&&String(p.record.empId)===String(c.empId)&&String(p.record.attNo)===String(c.attNo),
  p79AttendanceEditAlreadySaved:(p,c)=>['id','empId','attNo','timeStr','status','note'].every(k=>normalize(p.record[k])===normalize(c[k])),
  p79PausedReviewItem:(key,p)=>{const item=queue.find(x=>x.key===key&&x.paused&&JSON.stringify(x.payload)===JSON.stringify(p));if(!item)throw Error('changed');return item},
  p79ArchiveObsoleteAttendanceEdits:(items)=>{const ids=new Set(items.map(x=>x.key));queue=queue.filter(x=>!ids.has(x.key));return items.length},
  remove:(key,p)=>{const n=queue.length;queue=queue.filter(x=>!(x.key===key&&JSON.stringify(x.payload)===JSON.stringify(p)));return queue.length!==n},
  fetch:async(url,opts)=>{
   if(opts?.method==='POST'){posts.push(JSON.parse(opts.body));throw Error('No writes allowed by reconciliation');}
   assert.equal(opts?.cache,'no-store');
   const u=new URL(url);get.push(u);
   assert.equal(u.searchParams.get('action'),'getAttendanceMainDirect');
   const month=u.searchParams.get('month');
   return {ok:true,json:async()=>({ok:true,month,records:cloud.filter(x=>normalize(x.timeStr).startsWith(month.replace('-','/')) ||
    x.timeStr.replaceAll('/','-').startsWith(month))})};
  }
 };
 vm.createContext(ctx);
 for(const code of functions)vm.runInContext(code,ctx);
 return {ctx,posts,get,get queue(){return queue},run:()=>ctx.p79AuditPausedAttendanceQueue()};
}
(async()=>{
 let x=fixture([record('2026/11/19 08:10:00',{source:'manual'}),
                record('2026/11/19 08:10:00',{source:'import',manuallyEditedAt:'2026-11-24T02:00:00Z'})]);
 let out=await x.run();
 assert.equal(out.confirmed,1,'Every physical row with the same ID confirms the intended edit');
 assert.equal(x.queue.length,0,'Only read-confirmed exact draft leaves the queue');
 assert.equal(x.posts.length,0,'Never POST or merge duplicate official rows');
 assert.equal(x.get.length,1);
 x=fixture([record('2026/11/19 08:10:00',{source:'a'}),record('2026/11/19 08:10:00',{source:'b'})]);
 const found=await x.ctx.p79ReadAttendanceEditCloud('1795015495797',undefined,payload());
 assert.equal(found.timeStr,'2026/11/19 08:10:00','Same business punch and different provenance should be safe to acknowledge');
 assert.equal(x.posts.length,0);

 x=fixture([record('2026/11/19 07:47:00'),record('2026/11/19 07:49:00')]);
 out=await x.run();
 assert.equal(out.confirmed,0);
 assert.equal(out.needsReview,1);
 assert.equal(out.ambiguousConflicts.length,1);
 assert.equal(out.ambiguousConflicts[0].candidates.length,2);
 assert.equal(x.queue.length,1,'Two different official clock times must retain the draft');
 assert.equal(x.posts.length,0);
 await assert.rejects(x.ctx.p79ReadAttendanceEditCloud('1795015495797',undefined,payload()),/無法唯一確認/);
 x=fixture([record('2026/11/19 08:10:00'),
            record('2026/11/19 06:11:00',{empId:'OTHER',attNo:'OTHER'})]);
 out=await x.run();
 assert.equal(out.confirmed,0,'A colliding ID with another employee cannot be accidentally acknowledged');
 assert.equal(out.ambiguousConflicts.length,1);
 assert.equal(x.queue.length,1);
 await assert.rejects(x.ctx.p79ReadAttendanceEditCloud('1795015495797',undefined,payload()),/無法唯一確認/);
 assert.equal(x.posts.length,0);

 const handlerStart=html.indexOf('async function keepAmbiguousCloudBatch(button){');
 const handlerEnd=html.indexOf('async function handleInspectorClick(event){',handlerStart);
 assert(handlerStart>=0&&handlerEnd>handlerStart);
 const handler=html.slice(handlerStart,handlerEnd);
 new vm.Script(handler);
 assert.match(html,/data-keep-cloud-ambiguous-batch/);
 assert.match(html,/正式雲端同一紀錄編號有多個打卡/);
 assert.match(html,/原編輯基準：/);
 assert.match(html,/想修改成：/);
 assert.match(html,/item\.candidates\.map\(row=>/);
 assert.match(html,/p79V5WithdrawPausedWrites\(selected\)/);
 async function decision({cloudDrift=false,draftDrift=false,approved=true}={}){
  const initial={key:'K',id:'1795015495797',name:'員工',originalTimeStr:'2026/11/19 07:46:00',desiredTimeStr:'2026/11/19 08:10:00',
   desiredStatus:'下班簽退',candidates:[{empId:'E1',timeStr:'2026/11/19 07:47:00'},{empId:'E1',timeStr:'2026/11/19 07:49:00'}],
   payload:payload()};
  const live={...initial,candidates:initial.candidates.map(v=>({...v}))};
  if(cloudDrift)live.candidates[1].timeStr='2026/11/19 07:51:00';
  const pending={key:'K',paused:true,payload:JSON.parse(JSON.stringify(initial.payload))};
  if(draftDrift)pending.payload.record.timeStr='2026/11/19 11:00:00';
  let withdraws=0,confirmed=0,reviews=0;
  const status={textContent:''};
  const ctx={Date,JSON,String,Map,Number,Error,reviewBusy:false,auditBusy:false,ambiguousPausedBatch:[initial],
   inspectorQueueSnapshot:'',window:{
    p79V5AuditPausedQueue:async()=>{reviews++;return{ambiguousConflicts:[live]}},
    p79V5ReadPendingQueue:()=>[pending],
    p79V5WithdrawPausedWrites:a=>{withdraws++;return{count:a.length}}
   },
   document:{getElementById:()=>status},
   confirm:()=>{confirmed++;return approved},
   show(){},p79ReviewNext(){},queueSnapshot:()=>JSON.stringify([pending])
  };
  vm.createContext(ctx);vm.runInContext(handler,ctx);
  const button={disabled:false};await ctx.keepAmbiguousCloudBatch(button);
  return{status,withdraws,confirmed,reviews,button};
 }
 let d=await decision();
 assert.equal(d.withdraws,1,'Only explicit confirmation can archive the approved draft');
 assert.equal(d.confirmed,1);assert.equal(d.reviews,1);
 assert.equal(d.button.disabled,false);
 d=await decision({cloudDrift:true});
 assert.equal(d.withdraws,0,'Changing cloud time aborts without archiving');
 assert.equal(d.confirmed,0);
 d=await decision({draftDrift:true});
 assert.equal(d.withdraws,0,'Changing the pending correction aborts without archiving');
 d=await decision({approved:false});
 assert.equal(d.withdraws,0,'Cancel always preserves drafts');
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
  if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);
 }
 console.log('PASS two remaining duplicated IDs: metadata-only variants settle automatically, different times show evidence, no arbitrary writes, explicit choice with fresh CAS guards');
})().catch(e=>{console.error(e);process.exitCode=1});

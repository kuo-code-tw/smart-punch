const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-attendance-core.js','utf8');
const start=source.indexOf('async function p79AuditPausedAttendanceQueue(');
const end=source.indexOf('async function p79ReviewPausedAttendanceWrite(',start);
assert(start>=0&&end>start,'batch reconciliation function must be present');
const fn=source.slice(start,end);
const makeItem=(id,time='2026/09/05 09:00')=>({
 key:'K'+id,paused:true,state:'paused',payload:{
  action:'updateRecord',originalTimeStr:'2026/09/05 07:30',
  record:{id,empId:'E'+id,attNo:'N'+id,status:'上班簽到',timeStr:time}
 }});
const cloudFor=(id,time='2026/09/05 09:00')=>({id,empId:'E'+id,attNo:'N'+id,status:'上班簽到',timeStr:time});
const eq=(a,b)=>String(a??'').trim().replace(/-/g,'/');
function setup(items,cloudRecords,{failRead=false,failArchive=false}={}){
 let queue=items.map(x=>JSON.parse(JSON.stringify(x))),reads=0,posts=0;
 const archives=[],progress=[];
 const c={
  Date,JSON,String,Number,Array,Map,Set,Error,Promise,AbortController,setTimeout,clearTimeout,encodeURIComponent,
  lastDoneAt:0,updateUi(){},
  gasUrl:()=> 'https://example.invalid/exec',token:()=> 'ADMIN_TEST',
  readQueue:()=>queue,payloadRecordId:p=>String(p?.record?.id??p?.id??''),
  normalizeCompareValue:eq,
  p79PausedReviewItem(key,payload){
   const live=queue.find(x=>x.key===key&&x.paused&&JSON.stringify(x.payload)===JSON.stringify(payload));
   if(!live)throw Error('draft changed while auditing');
   return live;
  },
  p79ArchiveObsoleteAttendanceEdits(items){
   if(failArchive)throw Error('backup unavailable');
   const keys=new Set(items.map(x=>x.key));
   archives.push(...items);
   queue=queue.filter(x=>!keys.has(x.key));return items.length;
  },
  p79PausedReviewIdentity(p,cloud){
   return String(p.record.id)===String(cloud.id)&&
    eq(p.record.empId,cloud.empId)&&eq(p.record.attNo,cloud.attNo);
  },
  p79AttendanceEditAlreadySaved(p,cloud){
   return ['id','empId','attNo','status','timeStr'].every(k=>eq(p.record[k],cloud[k]));
  },
  p79ConfirmWithdrawnAttendanceDrafts(){},
  markRecentAttendanceMutationCloudConfirmed(){},
  remove(key,payload){
   const i=queue.findIndex(x=>x.key===key&&JSON.stringify(x.payload)===JSON.stringify(payload));
   if(i<0)return false;
   queue.splice(i,1);return true;
  },
  fetch:async (url,options)=>{
   reads++;
   assert.equal(options.cache,'no-store');
   const parsed=new URL(url);
   assert.equal(parsed.searchParams.get('action'),'getAttendanceMainDirect','batch must use official month source');
   assert.equal(parsed.searchParams.get('month'),'2026-09');
   if(failRead)throw Error('cloud offline');
   return{ok:true,json:async()=>({ok:true,month:'2026-09',records:cloudRecords})};
  }
 };
 vm.createContext(c);vm.runInContext(fn,c);
 return{c,progress,archives,get queue(){return queue},get reads(){return reads},get posts(){return posts},
  run:()=>c.p79AuditPausedAttendanceQueue(x=>progress.push(JSON.parse(JSON.stringify(x))))};
}
(async()=>{
 const a=setup([makeItem('A'),makeItem('B'),makeItem('C'),makeItem('D'),makeItem('E')],
  [cloudFor('A'),cloudFor('C','2026/09/05 08:00'),{...cloudFor('D'),empId:'OTHER'},
   cloudFor('E','2026/09/05 08:00'),cloudFor('E','2026/09/05 10:00')]);
 const x=await a.run();
 assert.deepEqual([x.total,x.checked,x.confirmed,x.archived,x.needsReview,x.errors],[5,5,1,1,3,0]);
 assert.equal(a.reads,1,'a single month is downloaded once for all five edits');
 assert.deepEqual(a.queue.map(q=>q.key),['KC','KD','KE'],'conflicts, identity mismatch and duplicate IDs remain untouched');
 assert.equal(a.archives.length,1,'missing original is backed up before exiting the queue');
 assert.equal(a.archives[0].key,'KB');
 assert.equal(a.progress.length,5,'each entry emits immediate UI progress');
 const many=setup(Array.from({length:13},(_,i)=>makeItem(String(i+1))),[]);
 const done=await many.run();
 assert.equal(done.archived,13,'all verified-obsolete edits can be resolved in a single open dialog');
 assert.equal(many.queue.length,0);
 assert.equal(many.archives.length,13,'all thirteen retain individual backups');
 assert.equal(many.reads,1,'thirteen entries must not download the same month thirteen times');
 assert.equal(many.posts,0,'reconciliation must never force attendance writes');
 const failed=setup([makeItem('Z')],[],{failRead:true});
 const retry=await failed.run();
 assert.equal(retry.errors,1);
 assert.equal(failed.queue.length,1,'failed cloud read cannot discard pending data');
 assert.equal(failed.archives.length,0);
 const backup=setup([makeItem('M')],[],{failArchive:true});
 const blocked=await backup.run();
 assert.equal(blocked.errors,1);
 assert.equal(backup.queue.length,1,'archive storage failure keeps original pending modification');
 assert.equal(source.includes("new Event('p79-attendance-outbox-updated')"),true,'in-tab queue events are emitted');
 console.log('PASS paused queue audit: 1 monthly GET, 13 safe backups, confirmations, mismatch guards, failure preservation and live events');
})().catch(e=>{console.error(e);process.exitCode=1;});

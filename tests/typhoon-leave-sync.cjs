const assert=require('node:assert/strict');
const {NOTE,dateKey,buildPlan,run}=require('../assets/port79-typhoon-leave-sync.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const leave=(id,from,to,status='已核准')=>({id,name:'員工'+id,empId:id,status,startDate:from,endDate:to,days:1});
async function test(){
 assert.equal(NOTE,'颱風停班免計假（自動取消）');
 assert.equal(dateKey('2026/10/26 08:00'),'2026-10-26');
 assert.equal(dateKey('2026-02-30'),'');
 const rows=[leave('one','2026-10-26','2026-10-26'),leave('partial','2026-10-25','2026-10-27'),leave('rejected','2026-10-26','2026-10-26','已駁回')];
 const p=buildPlan(rows,['2026-10-26']);
 assert.deepEqual(p.cancel.map(x=>x.id),['one']);
 assert.deepEqual(p.review.map(x=>x.id),['partial']);
 let data={leaveRecords:copy(rows),leaveCoverAssignments:[{leaveId:'one',workerIds:['W1']},{leaveId:'partial',workerIds:['W2']}]};
 let deletes=0;
 const opts={dates:['2026-10-26'],read:async()=>copy(data),confirm:()=>true,remove:async(id,note)=>{
  assert.equal(note,NOTE);deletes++;
  data.leaveRecords=data.leaveRecords.filter(row=>row.id!==id);
  data.leaveCoverAssignments=data.leaveCoverAssignments.filter(row=>row.leaveId!==id);
  return {ok:true,linkedDelete:true};
 }};
 const result=await run(opts);
 assert.deepEqual(result.deleted.map(x=>x.id),['one']);
 assert.equal(result.review.length,1);
 assert.equal(deletes,1);
 assert.equal(data.leaveRecords.length,2);
 assert.deepEqual(data.leaveCoverAssignments.map(x=>x.leaveId),['partial']);
 const again=await run(opts);
 assert.equal(again.deleted.length,0);
 assert.equal(deletes,1);
 const deny=await run({...opts,dates:['2026-10-25','2026-10-26','2026-10-27'],confirm:()=>false});
 assert.equal(deny.confirmed,false);
 assert.equal(deletes,1);
 let changed={leaveRecords:[leave('updated','2026-10-26','2026-10-26')],leaveCoverAssignments:[]};
 const guarded=await run({dates:['2026-10-26'],read:async()=>copy(changed),confirm:()=>{
  changed.leaveRecords[0].endDate='2026-10-27';return true;
 },remove:async()=>{throw Error('must not delete changed request')}});
 assert.equal(guarded.deleted.length,0);
 assert.equal(guarded.skipped.length,1);
 const bad=await run({dates:['2026-10-26'],read:async()=>({leaveRecords:[leave('bad','2026-10-26','2026-10-26')],leaveCoverAssignments:[]}),confirm:()=>true,remove:async()=>({ok:true,linkedDelete:false})});
 assert.equal(bad.deleted.length,0);
 assert.equal(bad.errors.length,1);
 process.stdout.write('PASS typhoon leave sync\n');
}
test().catch(error=>{console.error(error);process.exitCode=1;});

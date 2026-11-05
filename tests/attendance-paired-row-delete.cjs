'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const core=fs.readFileSync('assets/port79-attendance-core.js','utf8');
const html=fs.readFileSync('attendance/index.html','utf8');
function extract(src,start,end){
  const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
  assert(a>=0&&b>a,'required source section: '+start);
  return src.slice(a,b);
}
const groupFn=extract(core,'function enqueueDeleteGroup(ids){','\nfunction samePayload(');
const uiFn=extract(html,'        async function deleteDailyAttendance(ids) {','\n        async function deleteRecord(id) {');
function queueContext(options={}){
  let queue=options.initial||[],saves=0,failFirst=!!options.fail;
  const context={Date,JSON,String,Array,Set,Number,
    queueStorage:'local',
    readQueue:()=>queue.slice(),
    saveQueue(next){
      saves++;
      if(failFirst){failFirst=false;return false;}
      queue=JSON.parse(JSON.stringify(next));
      return true;
    },
    opKey:p=>p.action+':'+p.id,
    samePayload:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
    updateUi(){}
  };
  vm.createContext(context);vm.runInContext(groupFn,context);
  return {context,get queue(){return queue},get saves(){return saves}};
}
function uiContext(options={}){
  const base=options.records||[
    {id:'IN-20261105',empId:'E234',status:'上班簽到',timeStr:'2026/11/05 11:55'},
    {id:'OUT-20261105',empId:'E234',status:'下班簽退',timeStr:'2026/11/05 20:01'}
  ];
  const logs=[],pending=new Set(),sent=[];
  const c={console,Array,String,Set,Math,records:base.slice(),
    requireAdminAction:()=>true,confirm:()=>options.confirm!==false,
    showToast:(message,type)=>logs.push({message,type}),
    renderAdminRecordsTable(){},renderAdminLiveTable(){},updateHomeClockInButtonState(){},
    window:{
      p79V5EnqueueDeleteGroup(ids){
        if(options.persistFail)return {ok:false,error:'storage full'};
        sent.push(...ids);ids.forEach(id=>pending.add(id));
        return {ok:true,count:ids.length};
      },
      async p79V5Drain(){
        if(options.busy)return false;
        c.records=c.records.filter(r=>!pending.has(r.id));
        pending.clear();return true;
      },
      p79V5QueueInfoForId:id=>pending.has(id)?{state:'pending'}:null
    }
  };
  vm.createContext(c);vm.runInContext(uiFn,c);
  return {c,logs,pending,sent};
}
(async()=>{
  const fresh=queueContext(), ids=['IN','OUT'];
  assert.equal(fresh.context.enqueueDeleteGroup(ids).ok,true);
  assert.equal(fresh.saves,1,'entire pair must persist in one storage write');
  assert.deepEqual(fresh.queue.map(x=>x.payload.id),ids,'both punch IDs stored before network');
  assert.deepEqual(fresh.queue.map(x=>x.payload.action),['deleteRecord','deleteRecord']);

  const repeat=queueContext({initial:[{key:'deleteRecord:IN',payload:{action:'deleteRecord',id:'IN'},attempts:4,lastError:'temporary',state:'pending'}]});
  assert.equal(repeat.context.enqueueDeleteGroup(['IN','OUT','IN']).ok,true);
  assert.equal(repeat.queue.length,2,'retrying grouped deletion must never duplicate the IN entry');
  assert.equal(repeat.queue[0].attempts,4,'pending retry history remains intact');

  const failed=queueContext({fail:true});
  assert.equal(failed.context.enqueueDeleteGroup(['IN','OUT']).ok,false,'refuse destructive writes if entire group cannot persist');
  assert.equal(failed.queue.length,0,'failed save may not trigger a partial group');

  const complete=uiContext();
  await complete.c.deleteDailyAttendance(['IN-20261105','OUT-20261105']);
  assert.deepEqual(complete.sent,['IN-20261105','OUT-20261105']);
  assert.equal(complete.c.records.length,0,'both sides removed only after mocked cloud ack');
  assert(complete.logs.some(x=>x.type==='success'&&x.message.includes('均已刪除')));

  const busy=uiContext({busy:true});
  await busy.c.deleteDailyAttendance(['IN-20261105','OUT-20261105']);
  assert.deepEqual(busy.sent,['IN-20261105','OUT-20261105'],'all IDs queued even when sync is busy');
  assert.equal(busy.pending.size,2);
  assert.equal(busy.c.records.length,2,'no optimistic removal when cloud is busy');
  assert(busy.logs.some(x=>x.type==='warning'&&x.message.includes('尚待雲端確認')));

  const storage=uiContext({persistFail:true});
  await storage.c.deleteDailyAttendance(['IN-20261105','OUT-20261105']);
  assert.equal(storage.sent.length,0);
  assert.equal(storage.c.records.length,2);

  const missing=uiContext();
  await missing.c.deleteDailyAttendance(['IN-20261105','NONEXISTENT']);
  assert.equal(missing.sent.length,0,'stale row blocked before any deletion');
  const ambiguous=uiContext({records:[{id:'SAME'},{id:'SAME'}]});
  await ambiguous.c.deleteDailyAttendance(['SAME']);
  assert.equal(ambiguous.sent.length,0,'ambiguous duplicate IDs may not delete multiple people');

  const orphan=uiContext({records:[{id:'OUT-ONLY',empId:'E234',status:'下班簽退',timeStr:'2026/11/05 20:01'}]});
  await orphan.c.deleteDailyAttendance(['OUT-ONLY']);
  assert.deepEqual(orphan.sent,['OUT-ONLY'],'existing orphan can be removed by a new explicit user action');
  assert.equal(orphan.c.records.length,0);

  assert(html.includes('deleteDailyAttendance(${JSON.stringify(recordIds)})'),'row trash action still submits row.records');
  console.log('PASS paired row delete: atomic outbox staging, busy queue, confirm, rollback, duplicate guards, orphan clean-up');
})().catch(error=>{console.error(error);process.exitCode=1});

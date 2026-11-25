'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('assets/port79-overtime-upload-queue.js','utf8');
const report=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const page=fs.readFileSync('work-hours/index.html','utf8');
new vm.Script(src);new vm.Script(report);
function fixture(disk=new Map()){
 let owner='QA',scope='scope1',token='TOKEN',online=true,mode='success',calls=0,reads=0,failDisk=false;
 const stages=[],events=[],held=new Set();
 const store={get length(){return disk.size},key:i=>[...disk.keys()][i],getItem:k=>disk.get(k)||null,setItem:(k,v)=>{if(failDisk)throw Error('disk full');disk.set(k,v)},removeItem:k=>disk.delete(k)};
 const locks={request:async(n,o,fn)=>{if(typeof o==='function'){fn=o;o={};}if(held.has(n)){if(o.ifAvailable)return fn(null);throw Error('lock busy');}held.add(n);try{return await fn({name:n});}finally{held.delete(n);}}};
 const c={document:{readyState:'loading',body:null,addEventListener(){}},localStorage:store,navigator:{get onLine(){return online},locks},setTimeout(){return 1},setInterval(){return 1},addEventListener(){},dispatchEvent:e=>events.push(e),confirm:()=>true,p79OvertimeContext:{uploadIdentity:()=>({owner,scope}),token:()=>token,gasUrl:()=> 'https://fixture.invalid',canReport:()=>true}};
 c.P79Overtime={runQueuedReview:async(draft,stage,guard)=>{calls++;assert(guard());stage('checking','核對出勤');stages.push('checking');if(mode==='prewrite')throw Error('雲端核對失敗');if(mode==='switch'){token='OTHER';stage('writing','正式寫入');throw Error('must not reach');}stage('writing','正式寫入');stages.push('writing');if(mode==='ambiguous')throw Error('連線中斷');stage('confirming','核對結果');stages.push('confirming');return {ok:true,id:draft.id,directOvertimeSaved:true,report:{id:draft.id,planned:false}};},checkQueuedReview:async draft=>{reads++;return {ok:true,id:draft.id,directOvertimeSaved:true,report:{id:draft.id,planned:false}};}};
 const ctx={window:c,CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts.detail}},JSON,Date,Set,Map,Array,Promise,Error,encodeURIComponent};
 vm.createContext(ctx);vm.runInContext(src.replace('enqueue};','enqueue,testDrain:drain,testAction:action};'),ctx);
 return{api:c.P79OvertimeUploadQueue,disk,stages,events,rows:()=>[...disk.values()].map(JSON.parse),mode:x=>mode=x,owner:x=>owner=x,scope:x=>scope=x,online:x=>online=x,failDisk:x=>failDisk=x,calls:()=>calls,reads:()=>reads};
}
const draft=(id='report-1')=>({id,empId:'E1',date:'2026-11-18',overtimeDate:'2026-11-18',coverDate:'2026-11-18',preventReplace:true,plannedReview:true,gasUrl:'https://fixture.invalid',rule:{category:'休',code:'休16-24'},note:'fixture'});
async function run(){
 const a=fixture();await a.api.enqueue(draft());assert.equal(a.calls(),0);assert.equal(a.rows()[0].state,'queued');assert(!JSON.stringify(a.rows()).includes('TOKEN'));await assert.rejects(a.api.enqueue(draft()),/已在背景上傳/);await a.api.testDrain();assert.equal(a.rows()[0].state,'done');assert.equal(a.rows()[0].draft,undefined);assert.equal(a.events.length,1);assert.deepEqual(a.stages,['checking','writing','confirming']);
 const b=fixture();b.mode('prewrite');await b.api.enqueue(draft());await b.api.testDrain();assert.equal(b.rows()[0].state,'failed');assert.equal(b.rows()[0].posted,false);b.mode('success');await b.api.testAction(b.rows()[0].key,'retry');await b.api.testDrain();assert.equal(b.rows()[0].state,'done');
 const c=fixture();c.mode('ambiguous');await c.api.enqueue(draft());await c.api.testDrain();assert.equal(c.rows()[0].state,'review');const restarted=fixture(c.disk);await restarted.api.testDrain();assert.equal(restarted.calls(),0);await restarted.api.testAction(restarted.rows()[0].key,'check');assert.equal(restarted.reads(),1);assert.equal(restarted.calls(),0);assert.equal(restarted.rows()[0].state,'done');
 const d=fixture();await d.api.enqueue(draft());d.owner('OTHER');await d.api.testDrain();assert.equal(d.calls(),0);d.owner('QA');d.scope('scope2');await d.api.testDrain();assert.equal(d.calls(),0);d.scope('scope1');d.online(false);await d.api.testDrain();assert.equal(d.calls(),0);d.online(true);await d.api.testDrain();assert.equal(d.rows()[0].state,'done');
 const e=fixture();e.failDisk(true);await assert.rejects(e.api.enqueue(draft()),/disk full/);assert.equal(e.rows().length,0);assert.equal(e.calls(),0);
 const f=fixture();f.mode('switch');await f.api.enqueue(draft());await f.api.testDrain();assert.equal(f.rows()[0].state,'failed');assert.equal(f.rows()[0].posted,false);assert(!f.stages.includes('writing'));
 const h=fixture();await h.api.enqueue(draft());const item=h.rows()[0];h.disk.set(item.key,JSON.stringify({...item,state:'writing',posted:true}));await h.api.testDrain();assert.equal(h.rows()[0].state,'review');assert.equal(h.calls(),0);
 const j=fixture();await j.api.enqueue(draft());const jitem=j.rows()[0];j.disk.set(jitem.key,JSON.stringify({...jitem,state:'checking',posted:false}));await j.api.testDrain();assert.equal(j.rows()[0].state,'done');assert.equal(j.calls(),1);
}
run().then(()=>{
 assert(report.indexOf('await global.P79OvertimeUploadQueue.enqueue(draft)')<report.indexOf('const validation=await prepareSaveValidation(validationRequest,true'));
 assert(report.includes('verifySavedReport(draft,result)')&&report.includes('checkQueuedReview')&&report.includes('runQueuedReview'));
 assert(page.includes('port79-overtime-upload-queue.js?v=20261125-local-outbox-v1'));
 assert(page.includes("typeof operation?.guard==='function'&&!operation.guard()"));
 console.log('PASS local-first overtime outbox: duplicate prevention, progress, retry, ambiguous POST read-only recovery, identity/scope, offline, disk failure, interrupted stages');
}).catch(e=>{console.error(e);process.exitCode=1});

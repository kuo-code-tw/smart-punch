const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8');
const match=html.match(/<script id="p79-outbox-inspector">([\s\S]*?)<\/script>/);
assert(match,'the inline sync inspector must be loaded');
new vm.Script(match[1]);
const events={},intervals=[],nodes=new Map();
let queue=[
 {key:'A',paused:true,payload:{action:'updateRecord',record:{id:'A',name:'甲'}}},
 {key:'B',paused:true,payload:{action:'updateRecord',record:{id:'B',name:'乙'}}}
];
const node=id=>{
 if(!nodes.has(id)){
  const listeners={};const classes=new Set();
  nodes.set(id,{
   id,innerHTML:'',textContent:'',scrollTop:40,disabled:false,events:listeners,
   classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
   addEventListener:(k,f)=>listeners[k]=f,
   insertAdjacentElement(_position,el){nodes.set(el.id,el);}
  });
 }
 return nodes.get(id);
};
for(const id of ['p79OutboxInspectPanel','p79OutboxInspectCard','p79OutboxInspectBody','p79OutboxReview','p79OutboxInspectClose','p79OutboxInspectRefresh','attendanceSyncCompactStatus'])node(id);
let audits=0;
const window={
 addEventListener(name,fn){events[name]=fn;},
 p79RefreshAttendanceSyncCompactStatus(){},
 p79V5ReadPendingQueue:()=>queue.slice(),
 p79V5AuditPausedQueue:async progress=>{
  audits++;
  const total=queue.length;
  if(!total)return{total:0,checked:0,confirmed:0,archived:0,needsReview:0,errors:0,lastError:''};
  queue.shift();
  const snapshot={total,checked:total,confirmed:1,archived:0,needsReview:total-1,errors:0,lastError:''};
  progress(snapshot);
  return snapshot;
 }
};
const document={
 body:{},
 hidden:false,
 getElementById:id=>nodes.get(id)||null,
 createElement(tag){return{id:'',tag,style:{},type:'',addEventListener(k,f){this.events??={};this.events[k]=f;}};},
 addEventListener(name,fn){events['doc:'+name]=fn;}
};
const context={document,window,localStorage:{getItem(){return '[]';}},MutationObserver:class{observe(){}},setInterval(fn){intervals.push(fn);}};
vm.createContext(context);
vm.runInContext(match[1],context);
assert(node('p79OutboxInspectBtn').events.click,'inspector opening button must exist');
(async()=>{
 node('p79OutboxInspectBtn').events.click({type:'click'});
 await new Promise(setImmediate);
 assert(node('p79OutboxInspectPanel').classList.contains('p79-show'),'panel remains open during and after batch');
 assert.equal(audits,1,'opening should start one safe audit of the entire queue');
 assert.equal(queue.length,1);
 assert.match(node('p79OutboxInspectBody').innerHTML,/新版考勤快速同步：1 筆/);
 assert.match(node('p79OutboxReview').textContent,/核對完成/);
 const card=node('p79OutboxInspectCard');
 queue.push({key:'C',paused:true,payload:{action:'updateRecord',record:{id:'C'}}});
 events['p79-attendance-outbox-updated']();
 assert.match(node('p79OutboxInspectBody').innerHTML,/新版考勤快速同步：2 筆/,
  'same-tab queue changes update visible detail without closing');
 assert.equal(card.scrollTop,40,'refresh should preserve the inspection scroll position');
 node('p79OutboxInspectRefresh').events.click();
 await new Promise(setImmediate);
 assert.equal(audits,2,'retrying the audit from the open panel should be possible');
 assert.equal(queue.length,1);
 assert(node('p79OutboxInspectPanel').classList.contains('p79-show'));
 assert.match(node('p79OutboxReview').textContent,/需要人工核對|仍需人工核對/);
 assert(intervals.length>=1,'cross-tab polling remains as a fallback');
 console.log('PASS inspector live audit: one opening audits all, events refresh in place, scroll retained, manual retry works');
})().catch(e=>{console.error(e);process.exitCode=1;});

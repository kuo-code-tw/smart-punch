'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const core=fs.readFileSync('assets/port79-attendance-core.js','utf8');
const home=fs.readFileSync('attendance/index.html','utf8');
const start=core.indexOf('async function p79ApplyPausedAttendanceReview(');
const end=core.indexOf('\nasync function send(',start);
assert(start>=0&&end>start,'Reviewed write must exist');
const code=core.slice(start,end);
new vm.Script(code);
assert.match(home,/#p79OutboxInspectBody\{flex:1 1 auto;min-height:0;overflow-y:auto/);
assert.match(home,/#p79OutboxReview:not\(:empty\)/);
assert(home.indexOf('<div id="p79OutboxReview" role="status"')<home.indexOf('<div id="p79OutboxInspectBody"></div>'),
 'The cloud-vs-draft comparison must stay visible ABOVE the long queue');
assert.match(home,/id="p79KeepCloudPausedReview"/);
assert.match(home,/p79V5WithdrawPausedWrites\(\[\{key:review\.key,payload:review\.payload\}\]\)/,
 'Keep-cloud action archives the exact draft; it never posts an attendance write');
assert.match(home,/data-review-next/);
assert.match(home,/function p79ReviewNext\(message\)/);
assert.match(home,/正在核對全部雲端正式紀錄/);
assert.match(home,/確認套用我的修改/);
assert.match(home,/if\(autoReview!==false\)void auditAllPaused\(\)/);
assert.match(core,/p79AttendanceEditAlreadySaved\(payload,cloud\)/);
assert.match(core,/雲端時間與編輯時不同/);
function harness(result={ok:true}){
 const cloud={id:'11',empId:'E1',attNo:'NO1',status:'下班簽退',timeStr:'2026/11/19 07:47:00',manuallyEditedAt:''};
 const payload={action:'updateRecord',originalTimeStr:'2026/11/18 07:47:00',
  record:{...cloud,timeStr:'2026/11/20 08:10:00',note:'人工修改'}};
 let q=[{key:'original-day-key',paused:true,payload:JSON.parse(JSON.stringify(payload))}];
 let removed=0,sent=0,rendered=0;
 const c={Date,JSON,String,AbortController,setTimeout,clearTimeout,Error,
  requireAdminAction:()=>true,
  p79PausedReviewItem:(key,p)=>{const item=q.find(x=>x.key===key&&x.paused&&JSON.stringify(x.payload)===JSON.stringify(p));if(!item)throw Error('佇列已變更');return item},
  p79ReadAttendanceEditCloud:async()=>({...cloud}),
  payloadRecordId:p=>p.record.id,
  p79PausedReviewIdentity:()=>true,
  p79AttendanceEditAlreadySaved:(p,record)=>p.record.timeStr===record.timeStr&&p.record.id===record.id,
  getAttendanceRecordType:()=> 'OUT',
  submitAttendanceWrite:async p=>{sent++;return result},
  readQueue:()=>q,
  samePayload:(a,b)=>JSON.stringify(a)===JSON.stringify(b),
  remove:(key,p)=>{const prev=q.length;q=q.filter(x=>!(x.key===key&&JSON.stringify(x.payload)===JSON.stringify(p)));if(q.length<prev){removed++;return true}return false},
  records:[{...cloud}],saveRecords(){rendered++},p79RenderOnlyVisibleAttendanceView(){rendered++}
 };
 vm.createContext(c);vm.runInContext(code,c);
 return {c,review:{state:'review',key:'original-day-key',payload,cloud},get q(){return q},get removed(){return removed},get sent(){return sent},get rendered(){return rendered}};
}
(async()=>{
 let h=harness();
 assert.equal((await h.c.p79ApplyPausedAttendanceReview(h.review)).ok,true);
 assert.equal(h.sent,1);assert.equal(h.removed,1,'Cross-day reviewed write clears exact prior paused draft once cloud confirms');
 assert.equal(h.q.length,0);
 h=harness({ok:false,queued:true});
 await h.c.p79ApplyPausedAttendanceReview(h.review);
 assert.equal(h.q.length,1,'Pending or failed cloud writes keep original paused draft');
 assert.equal(h.removed,0);
 h=harness();
 h.c.p79ReadAttendanceEditCloud=async()=>({...h.review.cloud,timeStr:'2026/11/19 07:48:00'});
 await assert.rejects(h.c.p79ApplyPausedAttendanceReview(h.review),/核對後雲端又有變更/);
 assert.equal(h.sent,0);assert.equal(h.q.length,1,'Newer official time must not be overwritten');
 h=harness();
 h.c.requireAdminAction=()=>false;
 await assert.rejects(h.c.p79ApplyPausedAttendanceReview(h.review),/權限/);
 assert.equal(h.sent,0);assert.equal(h.q.length,1);
 const scripts=[...home.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
 for(const m of scripts)if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);
 console.log('PASS conflict reviewer stays visible: explicit cloud/draft choices, next entry and safe CAS cleanup without bulk overwrite');
})().catch(e=>{console.error(e);process.exitCode=1});

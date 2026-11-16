const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('assets/port79-attendance-core.js','utf8');
function fn(name){const start=source.indexOf('function '+name+'(');let end=source.indexOf('\n}',start)+2;return source.slice(start,end);}
let queue=[],saved=0;const c={Date,String,Number,readQueue:()=>queue,saveQueue:q=>{queue=q;saved++}};vm.createContext(c);
for(const name of ['p79TransientAttendanceError','p79PauseAttendanceWrite','p79ResumeTransientAttendanceEdits'])vm.runInContext(fn(name),c);
const payload={action:'updateRecord',originalTimeStr:'2026/11/15 16:00',record:{id:'1',timeStr:'2026/11/15 17:00'}};
for(const message of ['雲端目前正在處理其他資料，請稍後自動重試','Failed to fetch','NetworkError']){
 assert.equal(c.p79PauseAttendanceWrite(payload,Error(message),3),false);assert.equal(c.p79PauseAttendanceWrite(payload,Error(message),50),false);
}
assert.equal(c.p79PauseAttendanceWrite(payload,{message:'雲端目前正在處理其他資料',retryable:false},3),true);
assert.equal(c.p79PauseAttendanceWrite(payload,Error('雲端時間與編輯時不同'),3),true);
assert.equal(c.p79PauseAttendanceWrite(payload,Error('TIME_CONFLICT'),1),true);
assert.equal(c.p79PauseAttendanceWrite(payload,Error('unknown'),3),true);
assert.equal(c.p79PauseAttendanceWrite(payload,{name:'AbortError',message:'This operation was aborted'},3),false);
const entry=(key,error,extra={})=>({key,paused:true,attempts:3,nextRetryAt:Number.MAX_SAFE_INTEGER,lastError:error,payload:JSON.parse(JSON.stringify(payload)),...extra});
queue=[entry('busy','雲端目前正在處理其他資料，請稍後自動重試'),entry('network','Failed to fetch'),entry('conflict','TIME_CONFLICT'),entry('unknown','unknown'),entry('permission','Failed to fetch',{lastFailureRetryable:false}),entry('withdrawn','由撤回備份恢復，等待核對；不會自動送出'),entry('no-baseline','Failed to fetch',{payload:{action:'updateRecord',record:{id:'2'}}})];
const before=queue.map(x=>JSON.stringify(x.payload));c.p79ResumeTransientAttendanceEdits();assert.equal(saved,1);
assert.deepEqual(queue.map(x=>x.paused),[false,false,true,true,true,true,true]);assert.deepEqual(queue.map(x=>JSON.stringify(x.payload)),before);assert.equal(queue[0].attempts,3);assert(queue[0].nextRetryAt<Date.now()+3000);
c.p79ResumeTransientAttendanceEdits();assert.equal(saved,1,'migration does not repeatedly reset backoff');
assert(source.includes('const cloud=await p79ReadAttendanceEditCloud(payloadRecordId(payload),ctrl.signal,payload)'));
assert(source.includes('if(p79AttendanceEditAlreadySaved(payload,cloud))return {ok:true,alreadySaved:true}'));
console.log('PASS transient failures retry safely; only known legacy transport/lock failures resume; original-time CAS, drafts, unknown/auth/conflict pauses preserved');

const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('assets/port79-attendance-core.js','utf8');
function fn(name){const start=source.indexOf('function '+name+'(');return source.slice(start,source.indexOf('\n}',start)+2)}
let queue=[],writes=0;const c={Date,String,Number,Math,readQueue:()=>queue,saveQueue:q=>{queue=q;writes++}};vm.createContext(c);
for(const name of ['p79TransientAttendanceError','p79AttendanceRetryDelay','p79ShortenTransientEditRetryWait'])vm.runInContext(fn(name),c);
const p={action:'updateRecord',record:{id:'1'}},busy=Error('雲端目前正在處理其他資料，請稍後自動重試');
assert.deepEqual([1,2,3,4,6,50].map(n=>c.p79AttendanceRetryDelay(p,n,busy)),[15000,30000,60000,60000,60000,60000]);
assert.equal(c.p79AttendanceRetryDelay(p,6,Error('Failed to fetch')),60000);assert.equal(c.p79AttendanceRetryDelay(p,3,{message:busy.message,retryable:false}),1200000);
assert.equal(c.p79AttendanceRetryDelay({action:'deleteRecord'},6,busy),3600000);
assert.equal(c.p79AttendanceRetryDelay({action:'addRecord'},6,busy),30000);
const now=Date.now(),entry=(key,extra={})=>({key,payload:p,paused:false,nextRetryAt:now+3600000,lastError:busy.message,attempts:6,...extra});
queue=[entry('old'),entry('paused',{paused:true}),entry('unknown',{lastError:'unknown'}),entry('conflict',{lastError:'TIME_CONFLICT'}),entry('nonretryable',{lastFailureRetryable:false}),entry('active',{state:'syncing'}),entry('due',{nextRetryAt:now-10})];
const before=JSON.stringify(queue.map(x=>({payload:x.payload,attempts:x.attempts})));
c.p79ShortenTransientEditRetryWait();assert.equal(writes,1);assert(queue[0].nextRetryAt<=Date.now()+30000);assert.equal(queue[1].nextRetryAt,now+3600000);assert.equal(queue[5].nextRetryAt,now+3600000);assert.equal(queue[6].nextRetryAt,now-10);assert.equal(before,JSON.stringify(queue.map(x=>({payload:x.payload,attempts:x.attempts}))));c.p79ShortenTransientEditRetryWait();assert.equal(writes,1);
for(const page of ['attendance','work-hours']){const html=fs.readFileSync(page+'/index.html','utf8');if(page==='attendance'){assert(html.includes('下次重試：'));assert(html.includes("timeZone:'Asia/Taipei'"));}assert(html.includes('20261122-confirmed-attendance-notice-v2'));}
console.log('PASS 15/30/60-second transient edit backoff, overdue legacy wait migration, conflict/active/unknown preservation and Taipei retry labels');

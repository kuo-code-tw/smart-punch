const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('assets/port79-attendance-core.js','utf8');
function fn(name){const start=source.indexOf('function '+name+'(');assert(start>=0);const a=source.slice(start-6,start)==='async '?start-6:start;return source.slice(a,source.indexOf('\n}',start)+2)}
async function checks(){
 let q=[],calls=[],busy=false,network=false;
 const c={Date,Math,Number,String,Set,Error,AbortController,setTimeout,clearTimeout,token:()=> 'QA',gasUrl:()=> 'cloud',navigator:{onLine:true},writing:false,syncBatchTotal:0,syncBatchDone:0,syncBatchStartedAt:0,lastDoneAt:0,currentOpText:'',activeSyncRecordId:'',readQueue:()=>q,saveQueue:v=>q=v,updateUi(){},scheduleDelta(){},desc:()=>'',payloadRecordId:p=>p.record.id,samePayload:(a,b)=>a===b,remove:key=>{q=q.filter(i=>i.key!==key);return true},send:async p=>{calls.push(p.record.id);if(network)throw Error('Failed to fetch');if(p.record.id==='conflict')throw Object.assign(Error('TIME_CONFLICT'),{retryable:false});if(p.record.id==='unknown')throw Error('unexpected');return {ok:true}}};
 vm.createContext(c);
 for(const name of ['p79AttendanceRetryDelay','p79TransientAttendanceError','p79PauseAttendanceWrite','p79PunchUploadPriority','p79OrderedReadyQueue','p79SendAttendanceInBrowserLane','drain'])vm.runInContext(fn(name),c);
 const item=id=>({key:id,payload:{action:'updateRecord',record:{id}},attempts:0,nextRetryAt:0});
 q=[item('conflict'),item('unknown'),item('ok')];await c.drain(true);
 assert.deepEqual(calls,['conflict','unknown','ok']);assert.deepEqual(q.map(x=>x.key),['conflict','unknown']);assert.equal(q[0].paused,true);assert.equal(q[1].attempts,1);
 q=[item('first'),item('second')];calls=[];network=true;await c.drain(true);assert.deepEqual(calls,['first']);assert.equal(q[0].attempts,1);assert.equal(q[1].attempts,0);network=false;
 c.navigator.locks={request:async(name,opts,cb)=>{assert.equal(name,'port79-attendance-cloud-write-v1');assert(opts.signal||opts.ifAvailable===true);return cb(busy?null:{})}};
 busy=true;calls=[];await assert.rejects(c.p79SendAttendanceInBrowserLane(item('first').payload,45000),e=>c.p79TransientAttendanceError(e));assert.deepEqual(calls,[]);
 busy=false;await c.p79SendAttendanceInBrowserLane(item('first').payload,45000);assert.deepEqual(calls,['first']);
 q=[item('first')];q[0].attempts=57;busy=true;calls=[];await c.drain(true);assert.equal(q[0].attempts,57);assert.equal(q[0].paused,false);assert.deepEqual(calls,[]);
 busy=false;const waiting=q[0];c.navigator.locks.request=async(name,opts,cb)=>{assert(opts.signal);q=[];return cb({})};await assert.rejects(c.p79SendAttendanceInBrowserLane(waiting.payload,45000,waiting.key),e=>e.browserLaneDeferred===true);assert.deepEqual(calls,[]);
 q=[item('first')];c.navigator.locks.request=async(name,opts,cb)=>cb({});await c.drain(true);assert.deepEqual(calls,['first']);assert.equal(q.length,0);
}
checks().then(()=>console.log('PASS queue isolation, forced retry bounds and browser writer lock')).catch(e=>{console.error(e);process.exitCode=1});

const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('assets/port79-attendance-core.js','utf8');
function fn(name){let a=source.indexOf('function '+name+'(');if(source.slice(a-6,a)==='async ')a-=6;return source.slice(a,source.indexOf('\n}',a)+2)}
const cloud={id:'1',empId:'E1',attNo:'1',status:'上班簽到',timeStr:'2026/10/18 08:00:00',note:''};
let posts=0,gets=0,queueInfo=null;
const c={Date,JSON,AbortController,setTimeout,clearTimeout,encodeURIComponent,gasUrl:()=> 'https://example.invalid',token:()=> 'token',payloadRecordId:p=>p.record.id,queueInfoForId:()=>queueInfo,getAttendanceRecordType:r=>r.status.includes('上班')?'IN':'OUT',fetch:async(url,opts)=>{if(opts.method==='POST'){posts++;return {text:async()=>JSON.stringify({ok:true})}}gets++;return {ok:true,json:async()=>({ok:true,found:{'1':cloud}})}}};
vm.createContext(c);for(const n of ['normalizeCompareValue','p79ReadAttendanceEditCloud','p79PrepareAttendanceEdit','p79AttendanceEditAlreadySaved','send'])vm.runInContext(fn(n),c);
(async()=>{
const payload={action:'updateRecord',originalTimeStr:'2026-10-18 8:00',originalPunchType:'IN',record:{...cloud,timeStr:'2026/10/18 09:00:00'}};
await c.send(payload);assert.equal(posts,1);
cloud.timeStr=payload.record.timeStr;assert((await c.send(payload)).alreadySaved);assert.equal(posts,1);
cloud.timeStr='2026/10/18 10:00:00';await assert.rejects(c.send(payload),e=>e.retryable===false&&e.message.includes('10:00'));assert.equal(posts,1);
queueInfo={paused:false};await assert.rejects(c.p79PrepareAttendanceEdit('1'),/尚在同步/);
queueInfo={paused:true};assert.equal((await c.p79PrepareAttendanceEdit('1')).timeStr,cloud.timeStr);
assert(!c.p79AttendanceEditAlreadySaved({...payload,record:{...cloud,note:'changed'}},cloud));
for(const path of ['attendance/index.html','work-hours/index.html']){const s=fs.readFileSync(path,'utf8');for(const m of s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(!/\bsrc=|application\/json|importmap/.test(m[1]))new vm.Script(m[2]);}assert(s.includes('await window.p79V5PrepareAttendanceEdit(id)'));assert(s.includes("String(snapshot?.timeStr || r.timeStr || '')"));}
console.log('PASS preflight, equivalent formatting, idempotent retry, real conflict, pending guard, paused recovery, note differences, both pages parse');
})().catch(e=>{console.error(e);process.exitCode=1});

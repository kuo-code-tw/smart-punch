'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const core=fs.readFileSync('assets/port79-attendance-core.js','utf8');
function fn(name){const a=core.indexOf('function '+name+'('),b=core.indexOf('\n}',a);assert(a>=0&&b>a);return core.slice(a,b+2);}
let queue=[],writes=0;
const c={Date,Number,Math,String,readQueue:()=>queue,saveQueue:q=>{queue=q;writes++;}};
vm.createContext(c);
for(const n of ['p79TransientAttendanceError','p79TrackAttendanceCloudFailure','p79RearmHeldAttendanceEdit'])vm.runInContext(fn(n),c);
const now=Date.now(),payload={action:'updateRecord',originalTimeStr:'2026/11/24 15:30',record:{id:'test',timeStr:'2026/11/24 15:33'}};
const item={key:'old',paused:true,retryHold:true,attempts:61,lastError:'雲端目前正在處理其他資料，請稍後自動重試',payload};
queue=[item,{...item,key:'collision',lastError:'TIME_CONFLICT'},{...item,key:'notdeployed',lastError:'相同考勤重複修復尚未部署至雲端',lastFailureRetryable:false}];
assert(c.p79RearmHeldAttendanceEdit(now));assert.equal(item.attempts,61);assert.equal(item.paused,false);assert.equal(item.retryRecoveryAt,now+900000);assert.equal(item.payload,payload);
assert(c.p79TrackAttendanceCloudFailure(item,Error(item.lastError)));item.paused=true;
assert.equal(c.p79RearmHeldAttendanceEdit(now+1000),false);assert.equal(writes,1);
assert(c.p79RearmHeldAttendanceEdit(item.retryRecoveryAt+1));assert.equal(queue[1].paused,true);assert.equal(queue[2].paused,true);
assert(core.includes('Number(data.attendanceIdenticalEditVersion)<1'));
new vm.Script(core);
console.log('PASS legacy 61-attempt hold rearmed once per cooldown; conflict and unsupported backend preserved');

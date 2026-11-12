const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const backend=fs.readFileSync('backend/leave-lock-retry.gs','utf8'),html=fs.readFileSync('leave/index.html','utf8');
function fn(source,name){const a=source.indexOf('function '+name+'(');return (source.slice(a-6,a)==='async '?'async ':'')+source.slice(a,source.indexOf('\n}',a)+2);}
function routerTest(available,action='addLeave'){
 let rows=[],writes=0,revisions=0,owners=0,signals=0;
 const sheet={appendRow:r=>{rows.push(r);writes++;},getLastRow:()=>rows.length+1,getRange:r=>({getValues:()=>[rows[r-2]],setValues:values=>{rows[r-2]=values[0];writes++;}})};
 const c={String,Array,Object,Number,Error,Date,JSON,Math,Set,Logger:{log(){}},parsePostData_:x=>x,normalizeAction_:x=>x.action,jsonOutput:x=>x,getSpreadsheet_:()=>({}),
 LockService:{getScriptLock:()=>({tryLock:()=>available,releaseLock(){}})},scheduleRequireEditLockOwner_(){owners++;throw Error('他人編輯中');},gcRequireSystemPermission_(){},scheduleHeartbeatEditLock_:()=>{signals++;return {ok:true};},
 p79IsEmployeeMasterMutationAction_:()=>false,p79IsScheduleMutationAction_:()=>false,p79IsLeaveMutationAction_:a=>a==='addLeave',touchLeaveSyncRevision_:()=>revisions++,touchSyncRevision_:()=>revisions++,
 LEAVE_HEADERS:Array(12),SHEET_LEAVE:'fake',ensureSheet_:()=>sheet,normalizeText_:x=>String(x||'').trim(),normalizeEmpId_:x=>x,userRequireTokenCore_:()=>({adminRole:'admin'}),normalizeLeavePayload_:d=>d.leave,validateLeave_(){},findEmployeeByIdentity_:()=>null,findRowById_:(_s,id)=>rows.findIndex(r=>r[0]===id)<0?-1:rows.findIndex(r=>r[0]===id)+2,
 leaveToRow_:l=>[l.id,'',l.empId,l.name,l.dept,l.leaveType,l.startDate,l.endDate,l.days,l.reason,l.status,l.source],p79DateOnly_:v=>String(v||'').slice(0,10)};
 vm.createContext(c);vm.runInContext(backend,c);const data={action,leave:{id:'TEST',empId:'FAKE',name:'測試',dept:'測試',leaveType:'事假',startDate:'2099-12-30',endDate:'2099-12-30',days:1,reason:'測試',status:'待審核',source:'test'}};
 let r=c.port79DoPostCore_(data);
 if(action==='scheduleHeartbeatEditLock'){assert(r.ok);assert.equal(revisions,0);assert.equal(signals,1);return;}
 if(!available){assert.equal(r.ok,false);assert.equal(r.rejectedBeforeWrite,true);assert.equal(r.retryable,true);assert.equal(writes,0);assert.equal(revisions,0);return;}
 assert(r.ok&&r.verified);assert.equal(owners,0);assert.equal(rows.length,1);r=c.port79DoPostCore_(data);assert(r.verified);assert.equal(rows.length,1,'same ID cannot append twice');
 rows[0][9]='錯誤備註';assert.throws(()=>c.p79ConfirmSavedLeave_(sheet,2,data.leave,'ok'),/讀回確認/);
}
(async()=>{
 routerTest(false);routerTest(true);routerTest(true,'scheduleHeartbeatEditLock');
 let calls=[],clock=0,responses=[],payload={action:'addLeave',leave:{id:'SAME-ID'}};
 const c={p79LeaveReads:new Map(),p79LeaveLoadGeneration:0,Date:{now:()=>clock},JSON,Number,Math,Error,Promise,GAS_URL:'test',leaveRequestToken:()=> 'token',adminToken:'',setStatus(){},setTimeout(f,ms){clock+=ms;f();},jsonFetch:async(_url,opt)=>{calls.push(opt.body);payload.leave.id='CHANGED-AFTER-START';const r=responses.shift();if(r instanceof Error)throw r;return r;}};
 vm.createContext(c);vm.runInContext(fn(html,'postCloud'),c);
 const busy={ok:false,retryable:true,rejectedBeforeWrite:true,error:'busy'};
 responses=[busy,busy,{ok:true}];assert((await c.postCloud(payload)).ok);assert.equal(calls.length,3);assert(calls.every(x=>x===calls[0]));assert.equal(JSON.parse(calls[0]).leave.id,'SAME-ID');
 for(const failure of [{ok:false,retryable:true,error:'busy without proof'},{ok:false,error:'permission'},Error('timeout')]){calls=[];responses=[failure,{ok:true}];await assert.rejects(c.postCloud(payload));assert.equal(calls.length,1,'uncertain/error replies never blindly retry');}
 calls=[];responses=Array(6).fill(busy);await assert.rejects(c.postCloud(payload));assert.equal(calls.length,6);assert(clock<90000);
 vm.runInContext(fn(html,'p79ReadCurrentLeaveCoverState'),c);calls=[];responses=[{ok:false,retryable:true,error:'read busy'},{ok:true,leaveRecords:[],leaveCoverAssignments:[]}];assert((await c.p79ReadCurrentLeaveCoverState()).ok);assert.equal(calls.length,2);responses=[{ok:false,error:'permission'}];await assert.rejects(c.p79ReadCurrentLeaveCoverState());
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=|application\/ld\+json/.test(m[1]))new vm.Script(m[2]);
 console.log('PASS real router lock rejection produces no revision churn; heartbeat does not invalidate data; leave single-row readback, same-ID retry, wrong content rejection; frontend retries only proven pre-write rejection with immutable body, bounded attempts and no timeout replay; inline syntax');
})().catch(e=>{console.error(e);process.exitCode=1;});

const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../attendance/index.html'),'utf8');
const core=fs.readFileSync(path.join(__dirname,'../assets/port79-attendance-core.js'),'utf8');

function functionBlock(source,start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert(a>=0&&b>a,`missing block: ${start}`);
 return source.slice(a,b);
}

async function retryHandlerChecks(){
 const block=functionBlock(html,'        async function retryCloudOutboxNow() {','\n        function enqueueCloudOperation(');
 let legacy=[],fast=[{payload:{action:'deleteRecord',id:'450'},lastError:'暫時逾時'}],calls=[],refreshes=0,toast='';
 const context={
  readCloudOutbox:()=>legacy,
  window:{p79V5ReadPendingQueue:()=>fast},
  refreshAttendanceSyncCompactStatus:()=>refreshes++,
  showToast:(message)=>{toast=message},
  isAdminLoggedIn:false,currentEmp:null,
  setCloudSyncStatus(){},
  flushCloudOutbox:async force=>{calls.push(force);fast=[];return true;},
  updateCloudOutboxStatus(){},
  canPerformAdminAction:()=>true
 };
 vm.createContext(context);vm.runInContext(block,context);
 await context.retryCloudOutboxNow();
 assert.deepEqual(calls,[true],'V5-only work must reach the shared retry route');
 assert.equal(fast.length,0);
 assert.equal(toast,'');
 await context.retryCloudOutboxNow();
 assert.equal(refreshes,1,'an empty detail queue refreshes the stale badge');
 assert.equal(toast,'目前沒有待同步資料');

 legacy=[{payload:{action:'updateRecord',record:{name:'測試'}}}];
 fast=[{payload:{action:'deleteRecord',id:'450'},lastError:'雲端忙碌'}];
 context.flushCloudOutbox=async force=>{calls.push(force);return false;};
 await context.retryCloudOutboxNow();
 assert.match(toast,/雲端忙碌/,'failure detail includes the remaining V5 error');
}

async function preserveLegacyWriterCheck(){
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
 let legacyCalls=0;
 const priorLegacyFlush=async()=>{legacyCalls++;return true;};
 const win={flushCloudOutbox:priorLegacyFlush,addEventListener(){}};
 const context={console,JSON,Date,Map,Set,Number,String,Math,Array,Promise,localStorage:storage,sessionStorage:storage,navigator:{onLine:false},document:{addEventListener(){},getElementById(){return null},createElement:()=>({}),body:{prepend(){}}},window:win,setInterval(){},setTimeout(){},clearTimeout(){}};
 vm.createContext(context);vm.runInContext(core,context);
 assert.equal(win.p79LegacyFlushCloudOutbox,priorLegacyFlush,'V5 bridge must preserve the original legacy writer before replacing it');
 const result=await win.flushCloudOutbox(true);
 assert.equal(legacyCalls,1,'shared retry drains the legacy queue first');
 assert.equal(result,false,'offline V5 queue remains unconfirmed');
}

(async()=>{
 await retryHandlerChecks();
 await preserveLegacyWriterCheck();
 assert(html.includes('window.p79RefreshAttendanceSyncCompactStatus = refreshAttendanceSyncCompactStatus'));
 assert(html.includes("window.addEventListener('storage',event=>"));
 console.log('PASS dual outbox retry, legacy writer preservation, empty-queue badge refresh, and cross-tab status reconciliation');
})().catch(error=>{console.error(error);process.exitCode=1});

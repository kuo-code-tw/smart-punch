const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert(start>=0,name);const line=html.slice(start,html.indexOf('\n',start));return line.endsWith('}')?line:html.slice(start,html.indexOf('\n}',start)+2);}
const calls=[],resolvers=[];let active=0,max=0,refreshes=0;
const c={Date,Map,Set,setTimeout:fn=>setImmediate(fn),renderOperationScheduleStatus:()=>{},gcToken:'owner-a',operationScheduleStore:null,operationScheduleOwner:'',operationScheduleQueue:[],operationScheduleRunning:0,operationScheduleReads:new Map(),normalizePersonName:v=>String(v||''),P79AqcScheduleGroups:require('../assets/port79-aqc-schedule-groups.js'),refreshOperationGroupView:()=>refreshes++,
 apiGetQuick:(action,p,timeout)=>{assert.equal(action,'getScheduleDataSecure');assert.equal(timeout,25000);calls.push(p.month);active++;max=Math.max(max,active);return new Promise((resolve,reject)=>resolvers.push({month:p.month,resolve:data=>{active--;resolve(data);},reject:(message='unavailable')=>{active--;reject(Error(message));}}));},apiPost:()=>assert.fail('group lookup must never write')};
c.window=c;vm.createContext(c);for(const name of ['currentOperationScheduleStore','operationGroupForRecord','operationScheduleErrorKind','pumpOperationScheduleGroups','ensureOperationScheduleGroups'])vm.runInContext(fn(name),c);
const rows=['2026-09','2026-10','2026-11'].map(m=>({workDate:m+'-16',empId:'A1',name:'Driver A'}));
const data=month=>({ok:true,employees:[{empId:'A1',name:'Driver A',jobTitle:'AQC',group:'A組'}],schedules:[{empId:'A1',month,schedule:{__personnel:{role:'AQC',group:'B組'}}}]});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 c.ensureOperationScheduleGroups(rows);for(let i=0;i<20;i++)c.ensureOperationScheduleGroups(rows);assert.equal(calls.length,2);assert.equal(max,2);
 resolvers[0].resolve(data(resolvers[0].month));await tick();assert.equal(calls.length,3);assert.equal(max,2);
 resolvers[1].resolve(data(resolvers[1].month));resolvers[2].resolve(data(resolvers[2].month));await tick();
 assert(rows.every(r=>c.operationGroupForRecord(r)==='B組'));assert.equal(c.operationScheduleRunning,0);assert.equal(refreshes,3);
 c.ensureOperationScheduleGroups(rows);assert.equal(calls.length,3);
 c.ensureOperationScheduleGroups([rows[0]],true);resolvers[3].reject();await tick();assert.equal(c.operationGroupForRecord(rows[0]),'排班讀取失敗');assert.equal(c.operationScheduleReads.get('2026-09').status,'error');c.ensureOperationScheduleGroups([rows[0]]);assert.equal(calls.length,4);
 c.ensureOperationScheduleGroups([rows[1]],true);c.gcToken='owner-b';c.currentOperationScheduleStore();resolvers[4].resolve(data('2026-10'));await tick();assert.equal(c.operationGroupForRecord(rows[1]),'未取得排班組別');
 c.ensureOperationScheduleGroups([rows[0]],true);resolvers[5].reject('timeout');await tick();await tick();assert.equal(calls.length,7);resolvers[6].resolve(data('2026-09'));await tick();assert.equal(c.operationGroupForRecord(rows[0]),'B組');
 assert.equal(c.operationScheduleErrorKind(Error('token denied')).retry,false);
 assert.equal(c.operationScheduleRunning,0);console.log(JSON.stringify({passed:8,failed:0,scope:'Two-request concurrency bound, deduplication, TTL, read failure and stale-account suppression'}));
})().catch(error=>{console.error(error);process.exitCode=1;});

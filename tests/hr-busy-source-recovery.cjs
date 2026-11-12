'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('hr/port79-hr-live-statistics.js','utf8');
const M=require('../hr/port79-hr-verified-metrics.js'),E=require('../attendance/v6-engine.js');
const tick=()=>new Promise(r=>setImmediate(r));
function setup(mode='recover'){
 let clock=Date.parse('2026-11-12T04:00:00Z'),serial=0,leaveCalls=0;
 const nodes=new Map(),timers=new Map(),events={},requests=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='p79rWorkDate'?'2026-11-12':'',innerHTML:'',textContent:'',style:{},closest:()=>({style:{}})});return nodes.get(id)};
 const staff=[{empId:'A',name:'甲',startDate:'2026-01-01'}],session={empId:'ADMIN',adminRole:'superadmin'};
 const FakeDate=class extends Date{constructor(...v){super(...(v.length?v:[clock]))}static now(){return clock}};
 const window={P79HrVerifiedMetrics:M,P79AttendanceV6:E,addEventListener:(name,fn)=>events[name]=fn};
 const document={visibilityState:'visible',getElementById:node,addEventListener:(name,fn)=>events[name]=fn};
 const ctx={window,document,Date:FakeDate,Intl,URL,AbortController,console,employees:staff,p79HrCloudDataReady:true,token:'TEST',
  sessionStorage:{getItem:k=>k==='port79_user_token'?'TEST':k==='port79_user_session'?JSON.stringify(session):k==='port79_gas_url'?'https://script.google.com/macros/s/TEST/exec':null},
  setTimeout(fn,ms){const id=++serial;if(ms<=4000){clock+=ms;queueMicrotask(fn)}else timers.set(id,{fn,at:clock+ms});return id},clearTimeout:id=>timers.delete(id),
  fetch:async url=>{const u=new URL(url),action=u.searchParams.get('action');requests.push(action);let data;
   if(action==='getLeaveData'){
    leaveCalls++;
    if(mode==='denied')data={ok:false,retryable:true,error:'沒有請假資料檢視權限'};
    else if(mode==='invalid')data={ok:true,partial:true};
    else if(mode==='always'||leaveCalls<=2)data={ok:false,retryable:true,retryAfterMs:1500,error:'雲端目前正在更新資料，請稍後自動重試'};
    else data={ok:true,employees:staff,leaveRecords:[{id:'L1',empId:'A',status:'已核准',startDate:'2026-11-12',endDate:'2026-11-12',days:1,leaveType:'事假'}]};
   }else data=action==='getScheduleDataSecure'?{ok:true,schedules:[]}:{ok:true,records:[]};
   return{ok:true,text:async()=>JSON.stringify(data)};
  }};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return{window,ctx,node,events,document,requests,timers,session,leaveCalls:()=>leaveCalls,
  async advance(){assert(timers.size,'a real retry must be scheduled');const [id,t]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];timers.delete(id);clock=t.at;t.fn();await tick();await tick();}};
}
(async()=>{
 let x=setup();await x.window.P79HrStatistics.refresh();assert.equal(x.leaveCalls(),2);assert.equal(x.timers.size,1);assert(x.node('p79rLeaveSummary').innerHTML.includes('稍後自動重試'));
 for(let i=0;i<20;i++)x.window.p79HrDashRender();await tick();assert.equal(x.leaveCalls(),2,'dashboard repaints respect retry backoff');
 await x.advance();assert.equal(x.leaveCalls(),3);assert.equal(x.timers.size,0);assert(x.node('p79rLeaveSummary').innerHTML.includes('事假'),'busy source recovers to the actual chart without manual refresh');
 assert.equal(x.requests.filter(a=>a==='getScheduleDataSecure').length,1);assert.equal(x.requests.filter(a=>a==='getAttendanceMonthData').length,1,'healthy sources are not fetched again');
 x=setup('always');await x.window.P79HrStatistics.refresh();for(let i=0;i<3;i++)await x.advance();assert.equal(x.leaveCalls(),8);assert.equal(x.timers.size,0,'automatic retries stop after three rounds');assert(x.node('p79rLeaveSummary').innerHTML.includes('請按重新整理重試'));
 for(let i=0;i<10;i++)x.window.p79HrDashRender();await tick();assert.equal(x.leaveCalls(),8,'repaints cannot restart an exhausted retry loop');
 for(const mode of ['denied','invalid']){x=setup(mode);await x.window.P79HrStatistics.refresh();assert.equal(x.leaveCalls(),1);assert.equal(x.timers.size,0,'authorization and incomplete data are never retried');assert(!x.node('p79rLeaveSummary').innerHTML.includes('0 人次'));}
 x=setup();await x.window.P79HrStatistics.refresh();x.session.empId='OTHER';await x.advance();assert.equal(x.leaveCalls(),2,'old-account timer cannot fetch or apply data');
 x=setup();await x.window.P79HrStatistics.refresh();x.document.visibilityState='hidden';await x.advance();assert.equal(x.leaveCalls(),2);x.document.visibilityState='visible';x.events.visibilitychange();await tick();assert.equal(x.leaveCalls(),3,'visible page resumes the missed retry');
 x=setup();await x.window.P79HrStatistics.refresh();x.events.pagehide();assert.equal(x.timers.size,0,'leaving the page cancels automatic retries');
 console.log('PASS HR busy recovery: actual delayed retry replaces failed chart, only failed source refetched, no repaint storm, bounded exhaustion, denial/incomplete response isolation, identity changes, hidden-page resume and pagehide cancellation');
})().catch(e=>{console.error(e);process.exitCode=1});

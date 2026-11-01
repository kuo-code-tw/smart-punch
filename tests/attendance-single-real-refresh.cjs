'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createRunner,auditRosterOvertime}=require('../assets/port79-full-refresh.js');
const day='2026-10-12',month='2026-10';
const restore={version:1,id:'RESTORED-NEW',code:'休08-16',status:'已核對出勤'};
const cancellation={confirmed:true,reportId:'REVOKED-OLD',at:'2026-10-27T13:00:00Z'};
const reportRow={empId:'EMP01',schedule:{__meta:{[day]:{overtimeReport:restore,overtimeRevocations:[cancellation]}}}};
const onlyRevoked={empId:'EMP01',schedule:{__meta:{[day]:{overtimeExcluded:true,overtimeRevocations:[cancellation]}}}};
assert.deepEqual(auditRosterOvertime([reportRow],day),{active:1,cancelled:1},'a prior cancellation cannot erase a separately restored report');
assert.deepEqual(auditRosterOvertime([onlyRevoked],day),{active:0,cancelled:1});
async function simulate({roster=[reportRow],cloudFailure=false,pending=false,monthSync=true}={}){
 let calls=[],renders=0,applied=0,attempts=0;
 const cache=new Map(),elements=new Map(),listeners=new Map();
 const doc={
  body:{dataset:{p79System:'attendance'}},
  getElementById:id=>elements.get(id)||null,
  querySelector:sel=>sel==='#p79SevenTop .action'?{prepend(n){this.panel=n;}}:null,
  querySelectorAll:()=>[],
  createElement(tag){const el={tagName:tag,style:{cssText:''},dataset:{},setAttribute(k,v){this[k]=v;},addEventListener(t,fn){listeners.set(t,fn);},
   append(...kids){this.children=(this.children||[]).concat(kids);for(const k of kids)if(k.id)elements.set(k.id,k);},
   prepend(n){this.children=[n,...(this.children||[])];}};return el;}
 };
 const context={gas:()=> 'https://script.google.com/macros/s/TEST/exec',identity:()=> 'TOKEN',token:()=> 'TOKEN',canRead:()=>true,hasPendingChanges:()=>pending,scope:()=>({month}),
  async readFresh(read){
   const [data,liveRoster]=await Promise.all([read('getAttendanceEmployeeMaster'),read('getScheduleDataSecure',{month})]);
   return{ok:true,confirmedFresh:true,data,roster:liveRoster,month};
  },
  async applySnapshot(s){applied++;return true;}
 };
 const c={
  URL,AbortController,setTimeout,clearTimeout,console,Map,Set,Promise,Date,Error,JSON,
  document:doc,MutationObserver:class{observe(){}},getComputedStyle:()=>({visibility:'visible'}),
  P79ManagementContext:context,p79AttendanceOvertimeMonths:cache,
  getAttendanceEmployeeMasterToken:()=> 'TOKEN',
  recordsSelectedDateKey:day,p79StartupAttendanceCurrentMonthSync:async()=>monthSync,
  p79RenderOnlyVisibleAttendanceView(){renders++;},
  fetch:async(url,options)=>{
   calls.push({url,options});attempts++;
   if(cloudFailure)return {ok:true,json:async()=>({ok:false,error:'GAS 讀取失敗'})};
   const req=new URL(url),action=req.searchParams.get('action');
   if(action==='getAttendanceEmployeeMaster')return {ok:true,json:async()=>({ok:true,employees:[{empId:'EMP01'}]})};
   if(action==='getScheduleDataSecure')return {ok:true,json:async()=>({ok:true,schedules:roster,leaveRecords:[],employees:[{empId:'EMP01'}],leaveCoverAssignments:[],revision:'R2'})};
   throw Error('Unrecognized action '+action);
  }
 };
 c.window=c;
 vm.createContext(c);
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../assets/port79-full-refresh.js'),'utf8'),c);
 assert.equal([...elements.keys()].filter(k=>k==='p79FullRefreshButton').length,1);
 assert.equal(typeof listeners.get('click'),'function');
 const result=await listeners.get('click')();
 return {result,calls,renders,applied,cache,button:elements.get('p79FullRefreshButton'),status:elements.get('p79FullRefreshStatus'),attempts};
}
(async()=>{
 let r=await simulate();
 if(!r.result)console.error('DETAIL',r.status?.textContent,r.calls.map(x=>new URL(x.url).searchParams.get('action')),r.applied,r.renders);
 assert.equal(r.result,true);
 assert.equal(r.calls.length,2,'button must read master and monthly official GAS roster');
 for(const c of r.calls){const u=new URL(c.url);assert.equal(u.searchParams.get('fresh'),'1');assert.equal(u.searchParams.get('month'),u.searchParams.get('action')==='getScheduleDataSecure'?month:null);assert.equal(c.options.cache,'no-store');}
 assert.equal(r.applied,1);assert.equal(r.renders,1);
 assert.equal(r.cache.get(month).rows[0].schedule.__meta[day].overtimeReport.id,'RESTORED-NEW');
 assert.equal(r.status.dataset.state,'success');assert.match(r.status.textContent,/有效加班申報 1 筆/);
 r=await simulate({roster:[onlyRevoked]});
 assert.equal(r.result,true,'fresh read can succeed yet reveal stale business data');
 assert.equal(r.status.dataset.state,'warning','never display a green verified receipt on an unconfirmed report');
 assert.match(r.status.textContent,/正式雲端快照仍未顯示有效申報/);
 r=await simulate({cloudFailure:true});
 assert.equal(r.result,false);assert.equal(r.applied,0);assert.equal(r.status.dataset.state,'error');assert.equal(r.cache.size,0);
 r=await simulate({pending:true});
 assert.equal(r.result,false);assert.equal(r.calls.length,0);assert.equal(r.status.dataset.state,'error');
 r=await simulate({monthSync:false});
 assert.equal(r.result,false);assert.equal(r.status.dataset.state,'error');
 const management=fs.readFileSync(path.resolve(__dirname,'../assets/port79-management-link.js'),'utf8');
 assert(management.includes("const manualOnly=context.system==='attendance'||context.system==='workhours'"));
 assert(management.includes('autoRefreshSafe:()=>!manualOnly&&!editing()'));
 assert(management.includes('if(manualOnly)return;'),'incoming signals must not auto refresh active attendance pages');
 assert(management.includes('if(!manualOnly){const button=document.createElement'), 'attendance must have only primary refresh control');
 const events=[],run=createRunner({check(){},run:async()=>({ok:true,summary:'read-only with inconsistency',warning:true}),notify:(st,msg)=>events.push(st),setFresh(){}});
 assert.equal(await run(),true);assert.deepEqual(events,['loading','warning']);
 console.log('PASS one real refresh button, 2 authenticated fresh reads, selected day overtime cache, discrepancy warning, offline/dirty guards, manual-only management signals');
})().catch(e=>{console.error(e);process.exitCode=1});

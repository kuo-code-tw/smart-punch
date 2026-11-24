'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
function fn(name){
 const start=html.indexOf('function '+name+'(');
 assert(start>=0,'missing '+name);
 const end=html.indexOf('\n}',start);
 assert(end>start,'missing close for '+name);
 return html.slice(start,end+2);
}
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 if(/\bsrc=|application\/ld\+json/i.test(match[1])||!match[2].trim())continue;
 new vm.Script(match[2]);
}
const requests=[],pending=[];
const ctx={Date,Promise,Map,Error,gcToken:'ACCOUNT-1',p79AqcRosterRequest:null,p79AqcRosterOwner:'',
 p79AqcRosterVerifiedAt:0,p79AqcRosterVerifiedResponse:null,
 apiGetQuick:(action,params,timeout)=>{
  requests.push({action,params,timeout});
  return new Promise((resolve,reject)=>pending.push({resolve,reject}));
 }};
vm.createContext(ctx);
vm.runInContext(fn('p79ReadOfficialAqcRoster'),ctx);
async function hr(){
 const a=ctx.p79ReadOfficialAqcRoster(),b=ctx.p79ReadOfficialAqcRoster();
 await Promise.resolve();await Promise.resolve();
 assert.equal(requests.length,1,'simultaneous components must share one HR request');
 assert.equal(requests[0].action,'gcGetEmployees','source remains the official, authenticated HR endpoint');
 assert.equal(requests[0].timeout,20000,'HR response gets bounded timeout, never three 25-second retries');
 const snapshot={ok:true,employees:[{empId:'A1',name:'正式現職人員',jobTitle:'AQC'}]};
 pending[0].resolve(snapshot);assert.equal(await a,snapshot);assert.equal(await b,snapshot);
 const cache=await ctx.p79ReadOfficialAqcRoster();
 assert.equal(cache,snapshot);assert.equal(requests.length,1,'verified HR roster reused for the same account within 60s');
 const manual=ctx.p79ReadOfficialAqcRoster(true);
 await Promise.resolve();await Promise.resolve();
 assert.equal(requests.length,2,'manual HR refresh must bypass the recent verified cache');
 pending[1].resolve(snapshot);await manual;
 ctx.gcToken='ACCOUNT-2';
 const next=ctx.p79ReadOfficialAqcRoster();
 await Promise.resolve();await Promise.resolve();
 assert.equal(requests.length,3,'account switch triggers a fresh authenticated request');
 pending[2].resolve({ok:true,employees:[{empId:'B1',name:'不同登入員工'}]});
 const nextResult=await next;
 assert.equal(nextResult.employees[0].empId,'B1','new account sees only its own verified response');
 ctx.gcToken='ACCOUNT-3';
 const stale=ctx.p79ReadOfficialAqcRoster(true);
 await Promise.resolve();await Promise.resolve();
 assert.equal(requests.length,4);
 ctx.gcToken='ACCOUNT-4';
 const newer=ctx.p79ReadOfficialAqcRoster(true);
 await Promise.resolve();await Promise.resolve();
 assert.equal(requests.length,5);
 pending[3].resolve({ok:true,employees:[{empId:'LEAK',name:'舊帳號資料'}]});
 await assert.rejects(stale,/登入身分已變更/);
 pending[4].resolve({ok:true,employees:[{empId:'SAFE',name:'新帳號資料'}]});
 assert.equal((await newer).employees[0].empId,'SAFE');
 await new Promise(resolve=>setImmediate(resolve)); // allow previous singleflight cleanup
 ctx.getHomeAdminSession=()=>({adminRole:'superadmin'});
 const hr=ctx.p79ReadOfficialAqcRoster(true);await Promise.resolve();await Promise.resolve();
 assert.equal(requests[5].action,'hrGetEmployees','HR-authorized accounts must read the same source as HR');
 assert.equal(requests[5].timeout,30000);
 pending[5].resolve({ok:true,employees:[{empId:'FORMER',employmentStatus:'resigned',phone:'private'}]});
 const hrResult=await hr;assert.equal(hrResult.employees[0].employmentStatus,'resigned');assert.equal(hrResult.employees[0].phone,undefined,'HR contact details are never cached by AQC');
}
function lazyRanking(){
 let observer=null,loadCount=0;
 const section={classList:{contains:()=>false}},input={value:'2026-11'};
 class ViewObserver{
  constructor(cb,opts){this.cb=cb;this.opts=opts;observer=this;}
  observe(x){assert.equal(x,section);}
  disconnect(){this.disconnected=true;}
 }
 const c={document:{getElementById:id=>id==='view-ranking'?section:id==='rankingMonth'?input:null},
  gcToken:'ACCOUNT-4',monthlyRankingReads:new Map(),p79RankingViewportObserver:null,p79RankingFallbackTimer:null,
  IntersectionObserver:ViewObserver,clearTimeout:()=>{},setTimeout:()=>{throw Error('browser with IntersectionObserver should defer to visibility')},
  activeEfficiencyTabName:()=> 'weekly',loadMonthlyRanking:()=>{loadCount++;}};
 vm.createContext(c);vm.runInContext(fn('p79QueueVisibleMonthlyRanking'),c);
 c.p79QueueVisibleMonthlyRanking('2026-11');
 assert.equal(loadCount,0,'monthly full-year cloud read must not compete with visible personnel summary');
 assert(observer&&observer.opts.rootMargin.includes('200px'));
 observer.cb([{isIntersecting:false}]);assert.equal(loadCount,0);
 observer.cb([{isIntersecting:true}]);assert.equal(loadCount,1,'loads automatically once monthly table becomes visible');
 c.monthlyRankingReads.set('ACCOUNT-4|2026-11',{status:'loading'});
 c.p79QueueVisibleMonthlyRanking('2026-11');observer.cb([{isIntersecting:true}]);
 assert.equal(loadCount,1,'in-flight full-year request cannot duplicate');
 input.value='2026-10';c.monthlyRankingReads.clear();
 c.p79QueueVisibleMonthlyRanking('2026-11');observer.cb([{isIntersecting:true}]);
 assert.equal(loadCount,1,'late visibility callback cannot request an obsolete month');
}
function rankingStoreInitialization(){
 const nodes=new Map();
 const el=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='rankingMonth'?'2026-11':'',textContent:'',innerHTML:''});return nodes.get(id)};
 const c={
  window:{P79PersonnelRanking:{rankMonth:()=>[]}},document:{getElementById:el},
  getPort79Year:()=> '2026',isoTodayLocal:()=> '2026-11-18',
  monthlyRankingRecords:()=>[],currentOperationScheduleStore:()=>({has:()=>true}),
  ensureOperationScheduleGroups:()=>{},p79EnsureFreshOfficialAqcRoster:()=>{},
  p79AqcHeadcountVerified:true,p79VerifiedAqcReportView:()=>({verified:true,rows:[],persons:[],rosterCount:0,excluded:0}),
  people:()=>[],workloadRecordMetrics:r=>r,operationGroupForRecord:()=> 'A組',normalizePersonName:s=>s,
  compareDriverNames:(a,b)=>a.localeCompare(b),esc:s=>String(s),monthlyRankingReads:new Map(),
  gcToken:'owner',activeEfficiencyTabName:()=> 'weekly',p79QueueVisibleMonthlyRanking:()=>{}};
 vm.createContext(c);vm.runInContext(fn('renderMonthlyRanking'),c);
 assert.doesNotThrow(()=>c.renderMonthlyRanking(),'complete monthly ranking should not access an uninitialized store');
 assert.match(el('rankingCount').textContent,/2026-11/);
}
function employmentSelector(){
 const select={value:'EMP:OLD',selectedOptions:[{textContent:'Former employee'}],innerHTML:''};
 const idx={people:[{key:'EMP:LIVE',empId:'LIVE',name:'Active employee'},{key:'EMP:OLD',empId:'OLD',name:'Former employee'}],byPerson:new Map()};
 const c={document:{getElementById:id=>id==='personStatPerson'?select:{value:'2026-11'}},activeEfficiencyTabName:()=> 'weekly',buildWorkloadIndex:()=>idx,workloadDateRange:()=>({start:'',end:''}),p79AqcHeadcountVerified:true,people:()=>[{empId:'LIVE',name:'Active employee'}],normalizePersonName:s=>s,displayPersonName:s=>s,esc:s=>s};
 vm.createContext(c);vm.runInContext(fn('populatePersonStatPeople'),c);c.populatePersonStatPeople();
 assert.match(select.innerHTML,/Active employee/);assert(!select.innerHTML.includes('Former employee'));assert.equal(select.value,'');
}
(async()=>{
 await hr();lazyRanking();rankingStoreInitialization();employmentSelector();
 const weekly=fn('renderWeeklyEfficiency');
 assert(weekly.includes('const baseRows=weeklyFilteredRecords(true);'));
 assert(weekly.includes('refreshWeeklyGroupFilter(baseRows);'));
 assert(!weekly.includes('ensureOperationScheduleGroups(weeklyFilteredRecords(true))'),'reuse the already filtered report rows');
 assert(html.includes("sourceRows:rs,persons:rankedPersonnelEfficiencyPersons(hrView.persons)"),
  'original WORKING REPORT counts remain unaffected by roster lookup');
 console.log('PASS personnel fast read: official HR singleflight, token isolation, bounded timeout, lazy monthly history, ranking initialization and shared filters');
})().catch(e=>{console.error(e);process.exitCode=1;});

'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const start=src.indexOf(' el.p79RepairAbnormalPreplans=async()=>{'),end=src.indexOf(' function choosePlanningMode',start);
assert(start>=0&&end>start);
const run=new Function('env','return (async()=>{const {g,a,q,controls,setStatus,id,abnormalMonthlyRestPlans,confirmedReport,confirm,plan,loadedMonth,loadedPeople,rules,isReadOnlySource}=env;let busy=false,model={},autoPlan=true,snapshot=null;const el={dataset:{},isConnected:true};const paint=()=>{};'+src.slice(start,end)+';await el.p79RepairAbnormalPreplans();return {busy,locked:el.dataset.preplanLocked};})()');
async function main(){
 for(const c of [{name:'all success',expected:3,writes:3},{name:'first rejected, continue others',fail:'A',expected:2,writes:3},{name:'wrong restored shift, continue others',wrong:'B',expected:2,writes:3},{name:'ack lost after write',throws:'A',expected:3,writes:3},{name:'global read failure stops unsafe writes',readFail:true,expected:0,writes:1},{name:'actual cloud busy read recovers',busyReads:2,expected:3,writes:3},{name:'actual cloud busy write retries unchanged report',busyWrites:2,expected:3,writes:5},{name:'busy error after write never repeats restored report',busyAfterWrite:true,expected:3,writes:3},{name:'persistent busy isolates first employee',busyWrites:10,expected:2,writes:6}]){
  const date='2026-11-28',staff=['A','B','C'].map(empId=>({empId,name:empId})),data=staff.map(e=>({...e,schedule:{[date]:'休16-24',__meta:{[date]:{overtimeReport:{id:e.empId,planned:true,category:'休'},overtimeAssignedShift:'休16-24',reportOriginalShift:'中'}}}}));
  let writes=0,syncs=0,busyReads=c.busyReads||0,busyWrites=c.busyWrites||0;const busyError='雲端目前正在處理其他資料，請稍後自動重試';const msgs=[],alerts=[];
  const snap=()=>({attendanceEvidence:{complete:true},saveContext:{ready:true},schedules:JSON.parse(JSON.stringify(data))});
  const env={g:{setTimeout:f=>f(),alert:s=>alerts.push(s),p79OvertimeStatusContext:{canRevoke:()=>true,revoke:async r=>{writes++;if(r.empId==='A'&&busyWrites>0){busyWrites--;throw Error(busyError)}if(c.fail!==r.empId){const x=data.find(x=>x.empId===r.empId).schedule;x[date]=c.wrong===r.empId?'晚':'中';x.__meta[date]={overtimeRevocations:[{confirmed:true,reportId:r.id}]}}if(c.busyAfterWrite&&r.empId==='A')throw Error(busyError);if(c.fail===r.empId||c.throws===r.empId)throw Error('lock');return {ok:true,revocationVerified:true}}}},a:{snapshot:async()=>{if(busyReads>0){busyReads--;throw Error(busyError)}if(c.readFail&&writes)throw Error('未取得鎖');return snap()},employees:()=>staff,refresh:async()=>{},syncRepairRoster:async(m,source)=>{assert.equal(m,'2026-11');assert(source.saveContext.ready);syncs++;}},q:()=>({value:'',onclick:async()=>{}}),controls:()=>{},setStatus:m=>msgs.push(m),id:x=>x,abnormalMonthlyRestPlans:source=>({repair:source.schedules.filter(x=>x.schedule.__meta[date].overtimeReport).map(x=>({empId:x.empId,name:x.name,date,id:x.empId,report:x.schedule.__meta[date].overtimeReport,original:'中',reason:'選舉日'})),review:[]}),confirmedReport:()=>true,confirm:()=>true,plan:()=>({}),loadedMonth:'2026-11',loadedPeople:staff,rules:[],isReadOnlySource:()=>false};
  const result=await run(env);
  assert(msgs.at(-1).includes('已確認 '+c.expected+'／'),c.name);
  assert.equal(writes,c.writes,c.name);assert.equal(result.busy,false);assert.equal(result.locked,undefined);assert.equal(alerts.length,1);assert.equal(syncs,1,c.name);
  if(c.wrong||c.fail)assert(msgs.at(-1).includes('尚未全部還原'),c.name);
  if(c.readFail)assert(msgs.at(-1).includes('尚有 2 筆未處理'),c.name);
 }
 const html=fs.readFileSync('work-hours/index.html','utf8');
 const start=html.indexOf(' syncRepairRoster:async(month,source)=>{'),end=html.indexOf(' snapshot:async function',start);
 assert(start>=0&&end>start);
 const calls=[],cache=new Map([['2026-11',{}]]);
 const sync=new Function('env','const {currentPort79SsoToken,sessionStorage,window,p79WorkOvertimeMonths,localStorage,p79QueueConfirmedRosterRecheck}=env;let p79OvertimeCalculationCache={};return ({'+html.slice(start,end)+'}).syncRepairRoster;')({currentPort79SsoToken:()=>'test',sessionStorage:{setItem:k=>calls.push(k)},window:{P79WorkhoursCache:{invalidate:async()=>calls.push('invalidate')}},p79WorkOvertimeMonths:cache,localStorage:{setItem:(k,v)=>{assert.equal(k,'p79_schedule_overtime_changed_v1');assert.equal(JSON.parse(v).month,'2026-11');calls.push('notify')}},p79QueueConfirmedRosterRecheck:m=>calls.push('recheck:'+m)});
 await sync('2026-11',{saveContext:{token:'test',month:'2026-11',ready:true},schedules:[]});
 assert.equal(cache.has('2026-11'),false);assert.equal(calls.join(','),'port79_cache_mutated_at,invalidate,notify,recheck:2026-11');
 let rejected=false;try{await sync('2026-11',{saveContext:{token:'wrong',month:'2026-11',ready:true},schedules:[]})}catch(e){rejected=true}assert(rejected);assert.equal(calls.length,4);
 const window={P79SpecialOvertime:{kindsForDate:d=>d==='2026-11-28'?[{kind:'election'}]:[]}};
 new Function('window',src)(window);
 const staff='ABCDEFGHI'.split('').map(empId=>({empId,name:empId}));
 const date='2026-11-28',earlier='2026-11-12';
 const roster=(shift,meta,extra={})=>({...Object.fromEntries(Array.from({length:30},(_,n)=>['2026-11-'+String(n+1).padStart(2,'0'),'中'])),[date]:shift,...extra,__meta:meta});
 const report=(id,note='每月未休假加班',code='休16-24')=>({id,planned:true,category:'休',note,code});
 const schedules=[
 ['A',roster('休16-24',{[date]:{overtimeReport:report('a'),reportOriginalShift:'中'}})],
 ['B',roster('休16-24',{})],
 ['C',roster('休16-24',{[date]:{overtimeReports:[report('c')]}})],
 ['D',roster('休16-24',{[date]:{overtimeReport:report('d','其他')}})],
 ['E',roster('選16-24',{[date]:{overtimeReport:report('e','選舉日','選16-24')}})],
 ['F',roster('中',{[earlier]:{overtimeRevocations:[{confirmed:true,reportId:'f'}],reportOriginalShift:'中'}},{[earlier]:'休16-24'})],
 ['G',roster('休16-24',{[date]:{overtimeReport:report('g')}})],
 ['I',roster('中',{[earlier]:{overtimeReport:report('i')}},{[earlier]:'休16-24','2026-11-03':''})]
 ].map(([empId,schedule])=>({empId,schedule}));
 const audit=window.P79MonthlyRest.abnormalMonthlyRestPlans({schedules},staff,'2026-11');
 assert.equal(audit.repair.map(x=>x.empId).join(','),'A');
 assert.equal(audit.review.map(x=>x.empId).sort().join(','),'B,C,D,F,G,H,I');
 assert.equal(audit.review.find(x=>x.empId==='F').date,earlier);
 assert.equal(audit.coverage.people,9);assert.equal(audit.coverage.rosters,8);assert.equal(audit.coverage.days,240);
 console.log('PASS whole-month audit includes orphaned shift, additional report, missing source and earlier revoked date; legitimate reports preserved');
 console.log('PASS 9 restoration flow cases and authenticated schedule sync/cache invalidation');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

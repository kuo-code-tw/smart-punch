'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8'),html=fs.readFileSync('work-hours/index.html','utf8');
const date='2026-11-28',month='2026-11',digest='a'.repeat(64),empId='A';
const report={id:'OLD',planned:true,category:'休',code:'休16-24',note:'每月未休假加班'};
const archive={confirmed:true,reportId:'OLD',empId,date,reason:'休假超額',originalShift:'休',report};
const row={empId,schedule:{[date]:'休16-24',__meta:{[date]:{overtimeExcluded:true,overtimeRevocations:[archive],overtimeAssignedShift:'休16-24',reportOriginalShift:'休',keep:'unchanged'}}}};
const other={empId:'B',schedule:{[date]:'早',__meta:{}}};
const people=[{empId},{empId:'B'}],window={P79SpecialOvertime:{kindsForDate:d=>d===date?[{kind:'election'}]:[]}};
new Function('window',src)(window);
const scan=source=>window.P79MonthlyRest.abnormalMonthlyRestPlans(source,people,month);
const source={ok:true,scheduleBaseDigest:digest,overtimeRevocationVersion:1,revision:'rev',schedules:[row,other],leaveRecords:[],leaveCoverAssignments:[]};
const candidate=scan(source).repair[0];assert(candidate?.restoreRevoked);assert.equal(candidate.original,'休');
assert.equal(scan({...source,scheduleBaseDigest:''}).repair.length,0);
const newer=JSON.parse(JSON.stringify(source));newer.schedules[0].schedule.__meta[date].overtimeReport={...report,id:'NEW'};assert.equal(scan(newer).repair.length,0);
const begin=html.indexOf(' revoke:async function(row,snapshot){'),end=html.indexOf('\n};\nasync function p79AccountingReportSnapshotV108',begin);
assert(begin>=0&&end>begin);
const clone=x=>JSON.parse(JSON.stringify(x));
class FixtureURL{constructor(s){this.base=s;this.params=new Map();this.searchParams={set:(k,v)=>this.params.set(k,v)};}toString(){return this.base+'?action='+(this.params.get('action')||'');}}
async function run(opts={}){
 const writes=[],calls=[],latest=clone(source);if(opts.leave)latest.leaveRecords=[{empId,status:'已核准',startDate:date,endDate:date}];if(opts.digest)latest.scheduleBaseDigest='';if(opts.revision)latest.revision='changed';
 const env={currentPort79SsoToken:()=>'token',p79CanDeleteOvertime:()=>true,isVerifiedSuperAdminSession:()=>!opts.denied,crypto:{randomUUID:()=>'fixture'},getActiveGasUrl:()=>'https://example.invalid/',URL:FixtureURL,setTimeout:()=>0,clearTimeout:()=>{},window,p79WorkhoursEligibleEmployees:()=>people,leaveBelongsToEmployee:(l,e)=>l.empId===e.empId,toDateInputValue:x=>x,AbortController:class{abort(){}},P79OvertimeStatus:{fetch:async(url,request)=>{const body=request.body?JSON.parse(request.body):null,action=body?.action||url.split('?action=')[1];calls.push(action);if(action==='syncSchedules')writes.push(body);return {ok:true,json:async()=>action==='getScheduleDataSecure'?latest:action==='scheduleAcquireEditLock'?{ok:true,mine:true}:{ok:true}}}}};
 const revoke=new Function('env','const {'+Object.keys(env).join(',')+'}=env;return ({'+html.slice(begin,end)+'}).revoke;')(env);
 let error;try{await revoke({...candidate,repairPreplan:true},{saveContext:{token:'token',cloud:source}});}catch(e){error=e;}
 return {writes,calls,error};
}
async function main(){
 const result=await run();assert(!result.error,result.error?.message);assert.equal(result.writes.length,1);
 const body=result.writes[0];assert.equal(body.expectedScheduleDigest,digest);assert.equal(body.saveRequestId,'SCHSAVE-fixture');assert.equal(body.schedules[0].schedule[date],'休');assert.equal(body.schedules[0].schedule.__meta[date].keep,'unchanged');assert.equal(JSON.stringify(body.schedules[0].schedule.__meta[date].overtimeRevocations),JSON.stringify([archive]));assert.equal(JSON.stringify(body.schedules[1]),JSON.stringify(other));assert.equal(result.calls.at(-1),'scheduleReleaseEditLock');
 for(const opts of [{leave:true},{denied:true},{digest:true},{revision:true}]){const blocked=await run(opts);assert(blocked.error);assert.equal(blocked.writes.length,0);assert.equal(blocked.calls.at(-1),'scheduleReleaseEditLock');}
 console.log('PASS existing schedule API: exact archive, digest, lock, permissions, leave, no other employee changes, receipt ID');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

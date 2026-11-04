'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const shared=fs.readFileSync('assets/port79-overtime-report.js','utf8');
async function fixture(page,mode='fresh'){
 let now=Date.now(),gets=0,posts=0,refreshes=0;const timers=[];
 const date=mode==='short-punch'?'2026-10-28':'2099-11-28';
 const rule={category:'休',code:'休08-16',declaredHours:8,convertedHours:8,normalStart:'',normalEnd:'',overtimeStart:'08',overtimeEnd:'16',position:'full',typeName:'休息日加班'};
 const report={...rule,id:'REPORT',planned:true};
 const cloud={ok:true,revision:'R1',records:mode==='short-punch'?[{empId:'E1'}]:[],leaveCoverAssignments:[],schedules:[{empId:'E1',schedule:{[date]:'休',__meta:{[date]:mode==='conflict'?{overtimeReport:{id:'OTHER'}}:{}}}}]};
 const c={console:{...console,warn(){}},Date:class extends Date{static now(){return now;}},Intl,Map,Set,AbortController,JSON,TypeError,
  setTimeout:(f)=>{timers.push(f);return timers.length;},clearTimeout(){},
  sessionStorage:{getItem:()=>null},localStorage:{setItem(){}},GAS_URL:'https://fixture.invalid',
  currentPort79SsoToken:()=> 'MANAGER',leaveRequestToken:()=> 'MANAGER',getActiveGasUrl:()=> 'https://fixture.invalid',
  p79CanReportOvertime:()=>true,canManageSchedule:()=>true,getScheduleClientId:()=> 'CLIENT',
  p79WorkOvertimeMonths:new Map(),p79OvertimeCalculationCache:null,renderOvertimeStats(){},
  loadCloudData:async()=>{refreshes++;throw Error('display read failed');},renderRoleScheduleView(){},
  p79OvertimeContext:{token:()=> 'MANAGER',gasUrl:()=> 'https://fixture.invalid'},
  fetch:async(url,options)=>{if(options?.method==='POST'){posts++;const body=JSON.parse(options.body);assert.equal(body.expectedRevision,'R1');return {ok:true,json:async()=>({ok:true,directOvertimeSaved:true,id:body.id,report})};}gets++;return {ok:true,json:async()=>cloud};},
  buildDailyAttendanceRows:raw=>raw.length?[{clockIn:{id:'IN',timeStr:date+'T08:00:00+08:00'},clockOut:{id:'OUT',timeStr:date+'T10:00:00+08:00'}}]:[],
  p79DirectAttendanceTimestamp:r=>Date.parse(r.timeStr)};
 c.P79AttendanceV6={buildShifts:c.buildDailyAttendanceRows};c.window=c;
 vm.createContext(c);vm.runInContext(shared,c);
 const html=fs.readFileSync(page+'/index.html','utf8'),name=page==='schedule'?'p79SaveScheduleOvertimeDraft':'p79SaveWorkOvertimeDraft';
 const start=html.indexOf('async function '+name+'(');
 const end=html.indexOf(page==='leave'?'let p79LeaveOvertimeConfig=':page==='schedule'?'    async function p79OpenScheduleOvertimeOptions':'window.p79OvertimeContext=',start);
 assert(start>0&&end>start);vm.runInContext(html.slice(start,end),c);
 const draft={id:'REPORT',empId:'E1',date,rule,forEmpId:'',leaveHandoffId:'',note:''};
 await c.P79Overtime.prepareSaveValidation(draft,false);
 if(mode==='expired')now+=15001;
 if(['conflict','short-punch'].includes(mode)){
  await assert.rejects(c[name](draft),mode==='conflict'?/已有申報或預排/:/出勤|時段|簽退|小時/);assert.equal(posts,0);
 }else{
  const result=await c[name](draft);assert.equal(result.id,'REPORT');assert.equal(posts,1);assert.equal(gets,mode==='expired'?2:1,'only this button press shares the fresh employee/day read');
  assert.equal(refreshes,0,'confirmation never waits for a full display refresh');
  if(page==='schedule'){
   for(const callback of timers.slice())callback();await new Promise(resolve=>setImmediate(resolve));
   assert.equal(refreshes,1,'schedule refresh runs separately after confirmed write');
  }
 }
}
(async()=>{for(const page of ['leave','schedule','work-hours'])for(const mode of ['fresh','expired','conflict','short-punch'])await fixture(page,mode);console.log('PASS three real save adapters: one-read preflight reuse, stale fallback, concurrent-report protection, actual-punch guard and deferred schedule refresh');})().catch(e=>{console.error(e);process.exit(1)});

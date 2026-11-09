'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const getFunction=(name)=>{
 const begin=html.indexOf('function '+name+'(');
 assert(begin>=0,name+' exists');
 const start=html.indexOf('{',begin);
 let depth=0,quote='',esc=false,end=-1;
 for(let i=start;i<html.length;i++){
  const c=html[i];
  if(quote){if(esc)esc=false;else if(c==='\\')esc=true;else if(c===quote)quote='';continue;}
  if("'\"\`".includes(c)){quote=c;continue;}
  if(c==='{')depth++;
  if(c==='}'&&--depth===0){end=i+1;break;}
 }
 assert(end>start,name+' balanced');
 return html.slice(begin,end);
};
const noPunchCode=getFunction('p79ScheduleNoPunchRest');
const displayCode=getFunction('p79ScheduleDisplayDay');
const day='2026-10-31',id='AP0920091';
let state='rest',complete=true,leave=null,shift='早',overtime=false;
const mock={
 window:{P79RestAttendance:{state:()=>!complete?'unknown':state}},
 p79EmployeeDateEligible:()=>true,
 approvedLeaveForEmployee:()=>leave,
 p79ScheduleHasVerifiedPunch:()=>complete&&state==='worked',
 p79LeaveCoverOnDay:()=>[],
 p79CoverageShift:()=>overtime?'休08-16':'',
 p79SubstituteShiftLabel:()=>overtime?'休08-16':'',
 p79ScheduleLeaveExportCode:()=> '年',
 scheduleLeaveTypeText:()=> '年',
 p79ScheduleSpecialNoPunchCode:()=> '',
 p79VisibleRestKind:(s,label)=>/^(休|例|國)/.exec(label||s)?.[1]||'',
 // Synthetic complete-proof fixture: a verified zero-card rest is not
 // equivalent to merely loading a page with no matching punches.
 p79ScheduleRestClient:()=>({status:()=>({evidence:{complete,days:{},
  absenceAuditReady:complete,
  absenceConfirmedDays:complete&&state==='rest'?{[id+'|'+day]:true}:{}}})}),
 scheduleTaipeiTodayKey:()=> '2026-11-01',
 monthlyScheduleData:{[id]:{[day]:'早'}},
 monthlyScheduleMeta:{[id]:{[day]:{}}}
};
const context=vm.createContext(mock);
vm.runInContext(noPunchCode+'\n'+displayCode,context);
const emp={id,name:'測試',role:'AQC'};
const get=()=>{
 mock.monthlyScheduleData[id][day]=shift;
 const evidence={complete,actualShifts:{[id+'|'+day]:'早'},actualWorkedMinutes:{[id+'|'+day]:480}};
 const ctx={automaticRestMeta:{},restBalance:{ledger:[]},attendanceSnapshot:{attendanceEvidence:evidence},
 attendanceEvidence:evidence,typhoonDays:new Set(),electionDays:new Set(),typhoonToday:'2026-11-01'};
 return context.p79ScheduleDisplayDay(emp,day,ctx);
};
assert.equal(get().visibleCode,'休','confirmed whole-day no punches is rest');
assert.equal(get().visibleRestKind,'休');
state='worked';assert.equal(get().visibleCode,'早','verified punches override rest');
state='missing';assert.equal(get().visibleCode,'打卡待核','single punch stays pending');
state='rest';complete=false;assert.equal(get().visibleCode,'打卡待核','unverified monthly source must not silently count work or leave');
complete=true;shift='國';assert.equal(get().visibleCode,'國','statutory holiday is not erased');
shift='早';leave={leaveType:'年假'};assert.equal(get().visibleCode,'年','approved leave has precedence');leave=null;
overtime=true;assert.equal(get().visibleCode,'休','old overtime display is suppressed when there are no punches');overtime=false;
shift='晚';state='open';assert.equal(get().visibleCode,'晚','not-yet-ended night shift stays planned');
assert.match(html,/else if\(shiftVal==='打卡待核'\)/,'pending state excluded from worked-day count');
assert.match(html,/const noPunchRest=\(!hasOfficialOvertimeReport\|\|verifiedNoWork\)&&/,
 'formal overtime is protected until its zero-punch status is verified');
assert.match(html,/p79ScheduleNoPunchRest\(emp.id,dayStr,rosterShift/,
 'screen still invokes the shared no-card resolution');
assert.match(html,/row\[String\(d\)\]=selected\.visibleCode/,'Excel uses exactly the same resolved day code');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
scripts.forEach(code=>new vm.Script(code));
console.log('PASS: 10/31 no-punch rest, real punches, single-sided, unverified, official holidays, approved leave, overtime precedence, ongoing night shift, counts and export');

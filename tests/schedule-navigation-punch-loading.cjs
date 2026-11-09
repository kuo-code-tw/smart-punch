'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const start=html.indexOf('    function p79ScheduleDisplayDay(');
const end=html.indexOf('    // On-demand full staff check',start);
assert(start>=0&&end>start,'real day-display function');
const month='2026-11',date=n=>month+'-'+String(n).padStart(2,'0');
const people=Array.from({length:83},(_,i)=>({
 id:'E'+String(i+1).padStart(3,'0'),name:'員工'+(i+1),
 role:['領班','指揮手','ARMG','AQC','F/L'][i%5],group:['A組','B組','C組','D組'][i%4]
}));
const roster={},meta={};
for(const [i,p] of people.entries()){
 roster[p.id]={};meta[p.id]={};
 for(let n=1;n<=30;n++)roster[p.id][date(n)]=n===4?'例':n===5?'休':['早','中','晚'][(i+n)%3];
}
const evidencePending={complete:false,days:{}};
const ctx={
 Date,Set,Map,console,
 monthlyScheduleData:roster,monthlyScheduleMeta:meta,
 p79EmployeeDateEligible:()=>true,approvedLeaveForEmployee:()=>null,
 p79LeaveCoverOnDay:()=>[],
 p79ScheduleHasVerifiedPunch:(id,d,e)=>!!e?.actualShifts?.[id+'|'+d],
 p79ScheduleNoPunchRest:(id,d,shift,a,l,state)=>ctx.activeEvidence?.complete===true&&
  ctx.activeEvidence.absenceAuditReady===true&&
  ctx.activeEvidence.absenceConfirmedDays?.[id+'|'+d]===true&&state==='rest',
 p79ConfirmedOvertimeReport:m=>!!m?.overtimeReport?.id,
 p79CoverageShift:()=>'',p79SubstituteShiftLabel:(id,d,m)=>m?.overtimeReport?.code||'',
 p79RestQuota:()=>({counts:{國:0},slots:[]}),
 p79VisibleRestKind:(shift,label)=>/^(休|例|國)/.exec(label||shift)?.[1]||'',
 p79ScheduleSpecialNoPunchCode:()=>'',p79ScheduleLeaveExportCode:x=>x,
 scheduleLeaveTypeText:x=>x,p79NightSplitRestLabel:()=> '',
 scheduleTaipeiTodayKey:()=> '2026-11-09'
};
ctx.window=ctx;
ctx.P79RestAttendance={
 state:(snapshot,id,d)=>snapshot?.attendanceEvidence?.complete===true?
   snapshot.attendanceEvidence.days?.[id+'|'+d]?.state||'unknown':'unknown',
 verifiedNoWork:(snapshot,id,d)=>snapshot?.attendanceEvidence?.complete===true&&
  snapshot.attendanceEvidence.absenceAuditReady===true&&
  snapshot.attendanceEvidence.absenceConfirmedDays?.[id+'|'+d]===true
};
vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
function render(emp,d,e){
 ctx.activeEvidence=e;
 return ctx.p79ScheduleDisplayDay(emp,d,{automaticRestMeta:{},restBalance:{ledger:[]},
  attendanceEvidence:e,attendanceSnapshot:{attendanceEvidence:e},
  typhoonDays:new Set(),electionDays:new Set(),typhoonToday:'2026-11-09'});
}
const untouched=JSON.stringify({roster,meta});
let checked=0;
for(const emp of people){
 for(let n=1;n<=8;n++){
  const day=date(n),old=roster[emp.id][day];
  const selected=render(emp,day,evidencePending);
  assert.equal(selected.visibleCode,old,emp.id+' '+day+' must retain original saved roster while official attendance loads');
  assert.equal(selected.punchPending,false,'unloaded punches cannot invent missing IN/OUT: '+emp.id+' '+day);
  assert.notEqual(selected.visibleCode,'打卡待核');
  if(!['例','休'].includes(old)){
   assert.equal(selected.attendanceUnverified,true,'source remains flagged unverified');
   assert.match(selected.shiftSource,/暫顯原排班/,'unverified display must not assert a confirmed work shift');
  }
  checked++;
 }
}
assert.equal(checked,83*8);
const emp=people[0],d=date(7),original=roster[emp.id][d];
const single={complete:true,days:{[emp.id+'|'+d]:{state:'missing'}},
 absenceAuditReady:true,absenceConfirmedDays:{}};
let result=render(emp,d,single);
assert.equal(result.visibleCode,'打卡待核','verified single-sided punch remains pending');
assert.equal(result.punchPending,true);
assert.equal(result.attendanceUnverified,false);
const worked={complete:true,days:{[emp.id+'|'+d]:{state:'worked'}},
 actualShifts:{[emp.id+'|'+d]:'早'},actualWorkedMinutes:{[emp.id+'|'+d]:480}};
result=render(emp,d,worked);
assert.equal(result.visibleCode,'早','verified paired IN+OUT restores actual shift');
assert.equal(result.punchPending,false);
const absent={complete:true,days:{[emp.id+'|'+d]:{state:'rest'}},
 absenceAuditReady:true,absenceConfirmedDays:{[emp.id+'|'+d]:true}};
result=render(emp,d,absent);
assert.equal(result.visibleCode,'休','fully audited no-punch day becomes 休');
assert.equal(result.punchPending,false);
const insufficient={complete:true,days:{[emp.id+'|'+d]:{state:'unknown'}},
 absenceAuditReady:false,absenceConfirmedDays:{}};
result=render(emp,d,insufficient);
assert.equal(result.visibleCode,original,'insufficient proof never fabricates rest or pending punch');
const cancelledSource={complete:false,days:{}};
meta[emp.id][d]={overtimeReport:{id:'OT-7',category:'延',code:'延04-08',overtimeDate:d}};
assert.equal(render(emp,d,cancelledSource).visibleCode,'延04-08',
 'saved cloud overtime remains visible while official attendance reloads');
delete meta[emp.id][d];
assert.equal(JSON.stringify({roster,meta}),untouched,'navigation renders may not mutate saved cloud rosters');
assert(!html.includes("\${selected.attendanceUnverified?'<span"),
 'one global attendance status replaces hundreds of per-cell 考勤未核 badges');
assert(html.includes("punchPending?'打卡待核':rosterShift"),
 'date cell only marks confirmed missing punches as pending');
assert(html.includes("const attendanceEvidence=monthEvidence?.evidence||{complete:false,days:{}}"),
 'loading still uses empty unverified state (no stale punch assertion)');
assert(html.includes('row[String(d)]=selected.visibleCode'),
 'Excel still exports shared resolved calendar code without rewriting source');
console.log('PASS 83 employees x 8 historical dates: navigation/reload does not mass-show 打卡待核; real missing, worked, absent and saved overtime remain correct; no cloud writes');

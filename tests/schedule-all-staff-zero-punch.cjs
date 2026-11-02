'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const sourceFile=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const engine=Function("let module={exports:{}};"+sourceFile('attendance/v6-engine.js')+";return module.exports;")();
const rest=Function("const window={};"+sourceFile('assets/port79-rest-attendance.js')+";return window.P79RestAttendance;")();
const shifts=Function("engine","const window={P79AttendanceV6:engine};let module={exports:{}};"+sourceFile('assets/port79-schedule-punch-restore.js')+";return module.exports;")(engine);
const evidenceApi=Function("window",sourceFile('assets/port79-schedule-rest-evidence.js')+";return window.P79ScheduleRestEvidence;")({P79RestAttendance:rest});
const people=Array.from({length:83},(_,i)=>({id:'E'+String(i+1).padStart(3,'0'),attNo:String(i+1),name:i===0?'杜智榮':'測試人員'+(i+1)}));
const schedules=people.map(person=>({empId:person.id,schedule:{'2026-10-27':'中','2026-10-28':'中','2026-10-31':'晚'}}));
const stamp=x=>Date.parse(engine.normalizeTime(x.timeStr).replace(/\//g,'-').replace(' ','T')+'+08:00');
const punch=(emp,date,time,type)=>({id:emp+'|'+date+'|'+time+'|'+type,
 empId:emp,attNo:String(Number(emp.slice(1))),timeStr:date+' '+time,
 status:type==='IN'?'上班簽到':'下班簽退'});
const healthy=[];
for(let d=1;d<=31;d+=2){
 const date='2026/10/'+String(d).padStart(2,'0');
 for(let i=2;i<=25;i++){
  const emp='E'+String(i).padStart(3,'0');
  healthy.push(punch(emp,date,'08:00','IN'),punch(emp,date,'16:00','OUT'));
 }
}
const make=(records,ref,badMonth=null)=>{
 const client=evidenceApi.create({
  token:()=>'token',employees:()=>people,schedules:()=>schedules,
  buildShifts:rows=>engine.buildShifts(rows),timestamp:stamp,leaveDates:()=>[],
  shiftForSession:row=>shifts.displayShiftFromClockIn(row.clockIn,row.clockOut),
  read:async month=>{if(month===badMonth)throw Error('Adjacent month test failure');return {ok:true,month,records:month==='2026-10'?records:[],
   absenceReferenceRecords:ref===null?null:month==='2026-10'?ref:[]};},
  update:()=>{},now:()=>Date.parse('2026-11-02T08:30:00+08:00')
 });
 return client.refresh('2026-10');
};
(async()=>{
 const key='E001|2026-10-27';
 const single=await make(healthy,null);
 assert.equal(single.days[key]?.state,'rest','complete authenticated month/day without punches should be rest');
 assert.equal(single.absenceConfirmedDays[key],true);
 assert.equal(single.absenceConfirmationModes[key],'official-coverage');
 assert(single.auditSummary.employees===83,'must scan all 83 employees');
 const partial=await make(healthy.slice(0,12),null);
 assert.notEqual(partial.days[key]?.state,'rest','incomplete month must never mark all staff rest');
 const one=await make([...healthy,punch('E001','2026/10/27','16:30','IN')],null);
 assert.equal(one.days[key]?.state,'missing','one punch requires investigation');
 const actual=await make([...healthy,punch('E001','2026/10/27','15:30','IN'),punch('E001','2026/10/27','23:40','OUT')],null);
 assert.equal(actual.days[key]?.state,'worked','complete middle-shift punch counts as worked');
 const contradictory=await make(healthy,[...healthy,punch('E001','2026/10/27','16:30','IN')]);
 assert.equal(contradictory.days[key]?.state,'unknown','available contradictory raw feed blocks rest');
 assert.equal(contradictory.absenceConfirmedDays[key],undefined);
 const noData=await make([],null);
 assert.notEqual(noData.days[key]?.state,'rest','empty official feed is not sufficient');
 const previousMonthFailed=await make(healthy,null,'2026-09');
 assert.equal(previousMonthFailed.days[key]?.state,'rest','failed unrelated previous month must not block October 27');
 const nextMonthFailed=await make(healthy,null,'2026-11');
 assert.equal(nextMonthFailed.days[key]?.state,'rest','failed next month must not block October 27');
 assert.notEqual(nextMonthFailed.days['E001|2026-10-31']?.state,'rest','failed next month must block unverified 10/31 night shift');
 console.log('PASS: all 83 employees covered; fallback only with healthy full-month/day feed; one-card, paired, disagreement, empty feed protected.');
})().catch(e=>{console.error(e);process.exitCode=1});

'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const engine=Function("let module={exports:{}};"+file('attendance/v6-engine.js')+";return module.exports;")();
const rest=Function("const window={};"+file('assets/port79-rest-attendance.js')+";return window.P79RestAttendance;")();
const shifts=Function("engine","const window={P79AttendanceV6:engine};let module={exports:{}};"+file('assets/port79-schedule-punch-restore.js')+";return module.exports;")(engine);
const api=Function("window",file('assets/port79-schedule-rest-evidence.js')+";return window.P79ScheduleRestEvidence;")({P79RestAttendance:rest});
const people=[
 {id:'E001',attNo:'1',startDate:'2026-10-01'},
 {id:'E002',attNo:'2',startDate:'2026-10-20'},
 {id:'E003',attNo:'3',startDate:'2026-10-01'}
];
const schedules=people.map(x=>({empId:x.id,schedule:Object.fromEntries(Array.from({length:31},(_,i)=>['2026-10-'+String(i+1).padStart(2,'0'),'早']))}));
const punch=(id,date,time,type)=>({id:id+'-'+date+'-'+time+'-'+type,empId:id,attNo:id.slice(-1),
 timeStr:date+' '+time,status:type==='IN'?'上班簽到':'下班簽退'});
const records=[];
for(let d=1;d<=31;d+=2)for(const emp of ['E001','E003']){
 const date='2026/10/'+String(d).padStart(2,'0');
 records.push(punch(emp,date,'08:00','IN'),punch(emp,date,'16:00','OUT'));
}
const client=api.create({token:()=> 't',employees:()=>people,schedules:()=>schedules,
 dateEligible:(person,date)=>date>=person.startDate,
 buildShifts:rows=>engine.buildShifts(rows),
 timestamp:x=>Date.parse(engine.normalizeTime(x.timeStr).replace(/\//g,'-').replace(' ','T')+'+08:00'),
 leaveDates:()=>[],
 shiftForSession:row=>shifts.displayShiftFromClockIn(row.clockIn,row.clockOut),
 read:async month=>({ok:true,month,records:month==='2026-10'?records:[],absenceReferenceRecords:null}),
 update:()=>{},now:()=>Date.parse('2026-11-02T08:30:00+08:00')});
(async()=>{
 const result=await client.refresh('2026-10');
 assert.equal(result.auditSummary.employees,3);
 assert.equal(result.auditSummary.daysChecked,74,'31 + 12 + 31 employed days; not 93');
 assert.equal(result.personnelAudit.E002.checked,12,'late hire only 10/20–31');
 assert.equal(result.absenceConfirmedDays['E002|2026-10-01'],undefined,'no rest before employment');
 assert.equal(result.absenceConfirmedDays['E002|2026-10-27'],true,'real no-punch date still counts rest');
 const totals=['workedDays','confirmedRestDays','missingDays','unknownDays'].reduce((sum,key)=>sum+result.auditSummary[key],0);
 assert.equal(totals,result.auditSummary.daysChecked,'all staff/day totals partition exactly once');
 for(const [emp,counts] of Object.entries(result.personnelAudit))
  assert.equal(counts.checked,counts.worked+counts.rest+counts.missing+counts.unknown,'per-employee totals partition exactly once: '+emp);
 assert(result.auditSummary.confirmedRestDays<=result.auditSummary.daysChecked);
 console.log('PASS: pre-hire days excluded, 74/74 eligible dates partitioned, late-hire verified zero-punch rest preserved.');
})().catch(e=>{console.error(e);process.exitCode=1});

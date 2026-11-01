'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const v6=require('../attendance/v6-engine.js');
const pages=['attendance/index.html','work-hours/index.html'].map(p=>fs.readFileSync(p,'utf8'));
function punch(id,empId,attNo,kind,time){return {id,empId,attNo,name:empId,status:kind==='IN'?'上班簽到':'下班簽退',timeStr:time};}
const inRec=(id,idNo,date,time)=>punch(id,'E'+idNo,String(idNo),'IN',date+' '+time);
const outRec=(id,idNo,date,time)=>punch(id,'E'+idNo,String(idNo),'OUT',date+' '+time);
function shifts(rows){return v6.buildShifts(rows);}
const source=[
 inRec('N-in',65,'2026/10/30','05:35'),
 inRec('D-in',65,'2026/10/30','07:34'),
 outRec('N-out',65,'2026/10/30','07:53'),
 outRec('D-out',65,'2026/10/30','15:47')
];
const before=JSON.stringify(source);
const paired=shifts(source);
assert.equal(paired.length,2,'two shifts must stay distinct even though their hours overlap');
const byStart=new Map(paired.map(row=>[row.clockIn?.id,row]));
const night=byStart.get('N-in'),day=byStart.get('D-in');
assert(night&&day,'both separate shifts are visible');
assert.equal(night.clockOut.id,'N-out');
assert.equal(night.accountingDateKey,'2026-10-29','05:35–07:53 belongs to 10/29');
assert.equal(night.dateKey,'2026-10-29','date-grouping uses previous workday');
assert.equal(night.actualDateKey,'2026-10-30','the physical date stays available');
assert.equal(night.workDateAdjusted,true);
assert.equal(day.clockOut.id,'D-out');
assert.equal(day.accountingDateKey,'2026-10-30','07:34–15:47 stays 10/30');
assert.equal(day.workDateAdjusted,false);
assert.equal(JSON.stringify(source),before,'source punches must never be rewritten');
function check(start,finish,expected){
 const [d1,t1]=start.split(' '),[d2,t2]=finish.split(' ');
 const r=shifts([inRec('in',71,d1,t1),outRec('out',71,d2,t2)]);
 assert.equal(r.length,1,'exactly one shift');
 assert.equal(r[0].accountingDateKey,expected,start+' to '+finish);
}
check('2026/10/30 00:00','2026/10/30 07:59','2026-10-29');
check('2026/10/30 07:34','2026/10/30 15:47','2026-10-30');
check('2026/10/30 05:35','2026/10/30 08:00','2026-10-30');
check('2026/10/30 05:35','2026/10/30 08:01','2026-10-30');
check('2026/10/29 23:35','2026/10/30 07:53','2026-10-29');
check('2026/11/01 05:35','2026/11/01 07:53','2026-10-31');
check('2027/01/01 05:35','2027/01/01 07:53','2026-12-31');
check('2026/10/30 00:05','2026/10/30 15:47','2026-10-30');
assert.equal(v6.accountingDateForSession(inRec('single',65,'2026/10/30','05:35'),null),'2026-10-30','unmatched clock-in is not guessed backward');
assert.equal(v6.accountingDateForSession(null,outRec('single',65,'2026/10/30','07:53')),'2026-10-30','unmatched clock-out is not guessed backward');
for(const employeeId of [65,293,472,479]){
 const row=shifts([inRec('i'+employeeId,employeeId,'2026/10/30','05:35'),outRec('o'+employeeId,employeeId,'2026/10/30','07:53')]);
 assert.equal(row[0].accountingDateKey,'2026-10-29','every employee follows same policy');
}
function fn(html,name){
 const start=html.indexOf('        function '+name+'('),end=html.indexOf('\n        }',start);
 assert(start>=0&&end>start,'missing '+name);return html.slice(start,end+10);
}
for(const page of pages){
 assert(/v6-engine\.js\?v=20261101-ship-(?:early-workday|workday-tooltip)/.test(page),'ship workday engine version busts stale cache');
 const ctx={Date,window:{P79AttendanceV6:v6},getAttendanceDateKey:t=>String(t||'').slice(0,10).replaceAll('-','/')};
 vm.createContext(ctx);vm.runInContext(fn(page,'p79AttendanceSessionWorkDate'),ctx);
 assert.equal(ctx.p79AttendanceSessionWorkDate(source[0],source[2],{}),'2026-10-29','legacy display workday matches V6');
 assert.equal(ctx.p79AttendanceSessionWorkDate(source[0],null,{}),'2026/10/30','unpaired punches keep actual date');
 const emp={empId:'E65',attNo:'65',name:'E65'};
 Object.assign(ctx,{Map,Set,records:source,canCurrentAdminViewDataRow:()=>true,buildDailyAttendanceRows:v6.buildShifts,findEmployeeForAttendanceIdentity:()=>emp,p79EmployeeDateEligible:()=>true});
 vm.runInContext(fn(page,'buildAttendanceDayMapByShift'),ctx);
 const prior=ctx.buildAttendanceDayMapByShift([emp],2026,10);
 assert.equal(prior.get('E65').size,2,'2 distinct workdays, no double count of 10/30');
 assert(prior.get('E65').has(29)&&prior.get('E65').has(30));
 for(const script of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(script[1].trim())new vm.Script(script[1]);
}
const exportCtx={window:{P79AttendanceV6:v6},Set};
vm.createContext(exportCtx);
const exportFn=fn(pages[0],'p79SelectAttendanceExportShifts');
vm.runInContext(exportFn,exportCtx);
const next=shifts([inRec('11-in',65,'2026/11/01','05:35'),outRec('11-out',65,'2026/11/01','07:53')]);
assert.equal(exportCtx.p79SelectAttendanceExportShifts([], '2026-10',undefined,undefined,next).length,2,'cross-month early shifts export to prior month');
assert.equal(exportCtx.p79SelectAttendanceExportShifts([], '2026-11',undefined,undefined,next).length,0,'cannot count prior workday in next month');
console.log('PASS ship-arrival early short shifts for all employees; 08:00 cutoff, overlapping day shift, month/year boundaries, export and 2-page stats');

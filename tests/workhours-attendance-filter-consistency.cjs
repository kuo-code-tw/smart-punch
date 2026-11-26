'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('work-hours/index.html','utf8');
const main=fs.readFileSync('attendance/index.html','utf8');
const v6=require('../attendance/v6-engine.js');
for(const name of ['p79WorkhoursDisplayPairingRows','p79WorkhoursAssessAttendanceRow','p79WorkhoursListAttendanceShifts','p79WorkhoursFilterAttendanceRows'])assert(html.includes('function '+name+'('));
assert(html.includes("const build=window.P79AttendanceV6?.buildShifts||buildDailyAttendanceRows"),'work-hours display follows shared V6 engine');
assert(html.includes('let dailyRows = p79WorkhoursListAttendanceShifts(filtered);'),'main work-hours attendance table uses shared pairing');
assert(html.includes('let rows = p79WorkhoursListAttendanceShifts(records.filter(canCurrentAdminViewDataRow));'),'work-hours filter options use shared pairing');
assert(html.includes('dailyRows = p79WorkhoursFilterAttendanceRows(dailyRows,statusFilter);'),'visible status and table use one classifier');
assert(html.includes('attendanceSessions=p79WorkhoursListAttendanceShifts(sourceRecords);'),'main overtime ledger uses the same normalized V6 pairing as attendance');
assert(html.includes('totalMinutes:observedMinutes??0,overtimeMinutes:0'),'existing official report preserves actual attendance duration without inventing payable overtime');
assert(html.includes('if(!shared&&evidenceRevision===lastAttendanceCloudRevision&&!p79WorkhoursIsEditing())'),'verified raw-month fallback updates visible records without racing edits');
assert(html.includes('?p79WorkhoursListAttendanceShifts(attendanceRows)'),'official no-punch evidence shares the normalized attendance pairing');
assert(html.includes('date:workDate,workDate,start:'),'evidence receives authoritative accounting work date');
assert(html.includes('<option value="PENDING">待確認</option>'));
const names=['ABNORMAL','PENDING','NORMAL'];
for(const name of names)assert(main.includes('<option value="'+name+'">')&&html.includes('<option value="'+name+'">'),'both interfaces offer '+name);
function fn(n){const a=html.indexOf('        function '+n+'('),b=html.indexOf('\n        }',a);assert(a>=0&&b>a);return html.slice(a,b+10);}
const people=[{empId:'E1',attNo:'01',name:'甲'},{empId:'E2',attNo:'02',name:'乙'}];
const ctx={employees:people,Date,window:{P79AttendanceV6:v6}};
vm.createContext(ctx);
for(const name of ['p79WorkhoursDisplayPairingRows','p79WorkhoursAssessAttendanceRow','p79WorkhoursListAttendanceShifts','p79WorkhoursFilterAttendanceRows'])vm.runInContext(fn(name),ctx);
const raw=[
 {id:'a',empId:'E1',attNo:'01',name:'甲',status:'上班簽到',timeStr:'2026/10/02 15:39'},
 {id:'b',empId:'E2',attNo:'02',name:'乙',status:'下班簽退',timeStr:'2026/10/02 15:50'},
 {id:'c',empId:'E1',attNo:'01',name:'甲',status:'下班簽退',timeStr:'2026/10/02 23:40'},
 {id:'d',empId:'E1',attNo:'02',name:'甲',status:'上班簽到',timeStr:'2026/10/03 08:00'}
];
const shifts=ctx.p79WorkhoursListAttendanceShifts(raw);
assert.equal(shifts.length,3,'one completed, one orphan and one conflict');
assert.equal(ctx.p79WorkhoursFilterAttendanceRows(shifts,'NORMAL').length,1);
assert.equal(ctx.p79WorkhoursFilterAttendanceRows(shifts,'ABNORMAL').length,2);
assert.equal(ctx.p79WorkhoursFilterAttendanceRows(shifts,'PENDING').length,0);
assert.equal(raw[3].__p79PairIdentity,undefined,'raw punch is not mutated');
ctx.p79DirectAttendanceTimestamp=r=>Date.parse(String(r?.timeStr||'').replaceAll('/','-').replace(' ','T')+'+08:00');
for(const name of ['p79WorkOvertimeObservedMinutes','p79WorkOvertimePreferAttendance'])vm.runInContext(fn(name),ctx);
vm.runInContext(fn('p79WorkOvertimeScopedPunches'),ctx);
const scopeRaw=[
 {id:'24-in',empId:'E1',attNo:'01',status:'上班簽到',timeStr:'2026/11/24 19:35'},
 {id:'24-out',empId:'LEGACY-E1',attNo:'01',status:'下班簽退',timeStr:'2026/11/25 07:50'},
 {id:'foreign',empId:'E2',attNo:'02',status:'下班簽退',timeStr:'2026/11/25 07:50'},
 {id:'conflict',empId:'E2',attNo:'01',status:'下班簽退',timeStr:'2026/11/25 08:00'}
];
const scoped=ctx.p79WorkOvertimeScopedPunches(scopeRaw,new Set(['E1']));
assert.equal(scoped.length,2,'legacy ID resolved before scope, foreign and conflicting IDs excluded');
const coverPair=ctx.p79WorkhoursListAttendanceShifts(scoped);
assert.equal(coverPair.length,1);
assert.equal(ctx.p79WorkOvertimeObservedMinutes(coverPair[0]),735,'24th 19:35 to 25th 07:50 is 12h15');
assert.equal(coverPair[0].accountingDateKey,'2026-11-24');
const overnight=ctx.p79WorkhoursListAttendanceShifts([
 {id:'night-in',empId:'E1',attNo:'01',name:'甲',status:'上班簽到',timeStr:'2026/11/23 23:36'},
 {id:'night-out',attNo:'01',name:'甲',status:'下班簽退',timeStr:'2026/11/24 07:46'}
]);
assert.equal(overnight.length,1,'cross-midnight records with missing ID share the HR identity');
assert.equal(ctx.p79WorkOvertimeObservedMinutes(overnight[0]),490,'23:36 to next day 07:46 is 8h10m');
assert.equal(ctx.p79WorkOvertimePreferAttendance({clockIn:overnight[0].clockIn,sortTime:Number.MAX_SAFE_INTEGER},overnight[0]),false,'newer incomplete record cannot replace a complete shift');
assert.equal(ctx.p79WorkOvertimePreferAttendance(overnight[0],{clockIn:overnight[0].clockIn,sortTime:Number.MAX_SAFE_INTEGER}),true);
// 11/23 overnight regression: valid attendance must override stale no-card evidence.
ctx.p79WorkhoursEligibleEmployees=()=>people;
ctx.normalizeScheduleDateKey=x=>String(x||'').replaceAll('/','-');
ctx.normalizeAttendanceStatsAttNo=x=>String(x||'').replace(/^0+/,'');
ctx.p79WorkRestLeaveDates=()=>[];
vm.runInContext(fs.readFileSync('assets/port79-rest-attendance.js','utf8'),ctx);
vm.runInContext(fn('p79BuildWorkRestAttendance'),ctx);
vm.runInContext(fn('p79OvertimeAttendanceIssue'),ctx);
vm.runInContext(fn('p79WorkOvertimeReconcileAttendanceMeta'),ctx);
const date='2026-11-23', roster={schedules:people.map(p=>({empId:p.empId,schedule:{[date]:'晚','2026-11-24':'早'}}))};
const evidence=ctx.p79BuildWorkRestAttendance('2026-11',roster,[
 {id:'night-in',empId:'E1',attNo:'01',name:'甲',status:'上班簽到',timeStr:'2026/11/23 23:36'},
 {id:'night-out',attNo:'01',name:'甲',status:'下班簽退',timeStr:'2026/11/24 07:46'}
]).attendanceEvidence;
assert.equal(evidence.days['E1|'+date].state,'worked','complete night attendance is not whole-shift absence');
assert.notEqual(evidence.days['E2|'+date].state,'worked','another person cannot inherit this attendance');
const saved={overtimeReport:{id:'R1',category:'延',code:'延20-08',declaredHours:4,attendanceState:'rest',attendanceReview:'整班無上下班卡'}};
const original=JSON.stringify(saved);
const recovered=ctx.p79WorkOvertimeReconcileAttendanceMeta(saved,overnight[0],date,roster.schedules[0].schedule);
assert.equal(recovered.overtimeReport.attendanceState,'worked');
assert.equal(recovered.overtimeReport.id,'R1');
assert(recovered.overtimeReport.attendanceReview,'original period must still be reviewed before payment');
assert.equal(JSON.stringify(saved),original,'official declaration not mutated');
assert.equal(ctx.p79WorkOvertimeReconcileAttendanceMeta(saved,null,date,{}),saved,'no evidence cannot create attendance');
assert(html.includes("const noPunchRest=row.reportVerified&&row.overtimeReport?.attendanceState==='rest'&&!row.clockIn&&!row.clockOut;"));
// Adjacent-day reports must never attach to a different workday, even when
// the end of a normal night shift overlaps the next calendar day's report.
vm.runInContext(fn('p79WorkOvertimeMatchWorkday'),ctx);
const reportContext={window:{},Date,Intl,Set,Map};
vm.runInNewContext(fs.readFileSync('assets/port79-overtime-report.js','utf8'),reportContext);
ctx.P79Overtime=reportContext.window.P79Overtime;
const start=Date.parse('2026-11-23T23:36:00+08:00'),end=Date.parse('2026-11-24T07:46:00+08:00');
const nextDate='2026-11-24',nextMeta={overtimeReport:{id:'REPORT-24',category:'休',code:'休04-08',overtimeStart:'04',overtimeEnd:'08',position:'full'}};
const map24={[nextDate]:nextMeta};
assert.equal(ctx.P79Overtime.matchReport(start,end,date,map24).date,nextDate,'old adjacent search reproduces wrong-day matching');
const normal=ctx.p79WorkOvertimeMatchWorkday(start,end,date,map24);
assert.equal(normal.date,date);
assert.equal(normal.meta,null,'23rd normal night shift cannot borrow a 24th report');
assert.equal(normal.minutes,null);
const actual24=ctx.p79WorkOvertimeMatchWorkday(Date.parse('2026-11-24T03:35:00+08:00'),Date.parse('2026-11-24T08:00:00+08:00'),nextDate,map24);
assert.equal(actual24.meta.overtimeReport.id,'REPORT-24');
assert.equal(actual24.minutes,240,'24th retains its own four-hour test report');
const linked={overtimeReport:{...nextMeta.overtimeReport,overtimeDate:date,workDate:nextDate}};
assert.equal(ctx.p79WorkOvertimeMatchWorkday(start,end,nextDate,{[nextDate]:linked}).meta.overtimeReport.overtimeDate,date,'explicit dual-date credit preserved');
assert(html.includes('p79WorkOvertimeMatchWorkday(start,end,workDate,reportMap)'));
assert(html.includes('p79WorkOvertimeMatchWorkday(start,end,row.accountingDateKey||row.dateKey'));
for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(script[1].trim())new vm.Script(script[1]);
console.log('PASS work-hours and attendance share V6 pairing: completed/orphan/conflicting punches, status filters and source immutability');

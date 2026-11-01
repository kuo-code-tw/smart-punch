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
for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(script[1].trim())new vm.Script(script[1]);
console.log('PASS work-hours and attendance share V6 pairing: completed/orphan/conflicting punches, status filters and source immutability');

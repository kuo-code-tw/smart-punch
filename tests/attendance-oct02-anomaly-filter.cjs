'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8');
const v6=require('../attendance/v6-engine.js');
function fn(name){
 const start=html.indexOf('        function '+name+'(');
 assert(start>=0,'missing '+name);
 const end=html.indexOf('\n        }',start);
 assert(end>start,'missing close '+name);
 return html.slice(start,end+10);
}
const master=[
 {empId:'E293',attNo:'293',name:'員工甲'},
 {empId:'E472',attNo:'472',name:'員工乙'},
 {empId:'E479',attNo:'479',name:'員工丙'},
 {empId:'E999',attNo:'999',name:'員工丁'}
];
const idx={
 byId:new Map(master.map(e=>[e.empId,e])),
 byAtt:new Map(master.map(e=>[e.attNo,[e]])),
 byName:new Map(master.map(e=>[e.name,[e]])),
 normAtt:v=>String(v??'').replace(/^0+/,''),
 normName:v=>String(v??'').replace(/\s+/g,'')
};
const context={employees:master,getAttendanceEmployeeLookupIndex:()=>idx,Date};
vm.createContext(context);
vm.runInContext(fn('p79AttendanceDisplayPairingRecords'),context);
const source=[
 {id:'I293',empId:'E293',attNo:'293',status:'上班簽到',timeStr:'2026/10/02 15:39'},
 {id:'I472',empId:'E472',attNo:'472',status:'上班簽到',timeStr:'2026/10/02 15:36'},
 {id:'O479',empId:'E479',attNo:'479',status:'下班簽退',timeStr:'2026/10/02 15:50'},
 {id:'I999',empId:'E999',attNo:'999',status:'上班簽到',timeStr:'2026/10/02 08:00'},
 {id:'O999',empId:'E999',attNo:'0999',status:'下班簽退',timeStr:'2026/10/02 17:00'},
 {id:'CONFLICT',empId:'E293',attNo:'472',status:'下班簽退',timeStr:'2026/10/02 17:00'}
];
const copied=context.p79AttendanceDisplayPairingRecords(source,master);
assert.equal(copied[4].attNo,'999','zero padded attendance number corrected for display');
assert.equal(source[4].attNo,'0999','raw data is untouched');
assert.equal(copied[5],source[5],'conflicting employee/attendance identities cannot be remapped');
const shifts=v6.buildShifts(copied.filter(r=>r.id!=='CONFLICT'));
assert.equal(shifts.filter(s=>s.clockIn&&!s.clockOut).length,2,'both missing sign-outs remain visible');
assert.equal(shifts.filter(s=>!s.clockIn&&s.clockOut).length,1,'orphan sign-out remains visible');
assert.equal(shifts.filter(s=>s.clockIn&&s.clockOut).length,1,'matching corrected ID pairs only one employee');
const statuses=new Map(shifts.map(s=>[s.attNo,s]));
const assessedContext={
 getAttendanceTimestamp:r=>{const match=String(r.timeStr||'').match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/);return match?new Date(+match[1],+match[2]-1,+match[3],+match[4],+match[5]).getTime():NaN;},
 Date,Number,String
};
vm.createContext(assessedContext);
vm.runInContext(fn('p79AttendanceRowAssessment'),assessedContext);
vm.runInContext(fn('p79FilterAttendanceStatus'),assessedContext);
const now=new Date(2026,10,1).getTime();
const abnormal=assessedContext.p79FilterAttendanceStatus(shifts,'ABNORMAL',now);
const normal=assessedContext.p79FilterAttendanceStatus(shifts,'NORMAL',now);
assert.equal(abnormal.length,3,'2026/10/02 three orphan punches must appear under 異常');
assert.equal(normal.length,1,'complete corrected shift must appear under 正常');
assert.deepEqual(new Set(abnormal.map(x=>x.attNo)),new Set(['293','472','479']));
assert.equal(assessedContext.p79FilterAttendanceStatus([{clockIn:{timeStr:'2026/11/01 10:00'}}],'PENDING',new Date(2026,10,1,12).getTime()).length,1,'within 24h open shift remains pending');
assert.equal(assessedContext.p79FilterAttendanceStatus([{clockIn:{timeStr:'2026/10/02 10:00'},dateConflict:true}],'ABNORMAL',now).length,1,'expired reversed punch remains abnormal');
assert(html.includes("const rangeView = statusFilter!=='ALL'||"),'status searches must show whole selected date range');
assert(html.includes("const evaluatedRows=p79FilterAttendanceStatus(dailyRows,'ALL');"),'status counts and list use same assessment');
assert(!html.includes("resetFilterControls(['recordDeptFilter','recordJobTitleFilter','recordNameFilter','recordStatusFilter']);"),'switching months must not silently reset status filter');
for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(script[1].trim())new vm.Script(script[1]);
console.log('PASS Oct 2 cross-employee orphan punches, secure identity matching, normal/abnormal/pending filters, stable month-wide results and inline syntax');

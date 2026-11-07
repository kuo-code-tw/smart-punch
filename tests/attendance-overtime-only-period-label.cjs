'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('attendance/index.html','utf8');
const fn=name=>{
 const start=html.indexOf('        function '+name+'(');
 assert(start>=0,'missing '+name);
 const end=html.indexOf('\n        }',start);
 assert(end>start,'missing closing brace for '+name);
 return html.slice(start,end+10);
};
const code=fn('p79AttendanceOvertimeOnlyCode');
const display=fn('attendanceRowOvertimeText');
const state={ready:true,token:'T'};
const c={Date,Number,String,Map,Set,window:{},p79AttendanceOvertimeMonths:new Map([['2026-11',state]]),
 getAttendanceEmployeeMasterToken:()=> 'T',
 p79AttendanceOvertimeDate:()=> '2026-11-07',
 p79AttendanceSpecialParts:()=>[],
 p79AttendanceLoadViewMonth:()=>{},
 attendanceRowOvertimeMinutes:()=>null,
 formatDurationMinutes:n=>n/60+' 小時',
 p79AttendanceReportedOvertime:()=>null};
vm.createContext(c);vm.runInContext(code+'\n'+display,c);
const report=(data={})=>({
 id:'OFFICIAL-1',category:'延',code:'延16-04',declaredHours:4,
 normalStart:'16',normalEnd:'24',overtimeStart:'24',overtimeEnd:'04',position:'after',
 ...data
});
const plan=r=>({label:r.code,minutes:r.declaredHours*60,report:r});
let p=plan(report());
const before=JSON.stringify(p);
assert.equal(c.p79AttendanceOvertimeOnlyCode(p),'延24-04','16-24 normal, 24-04 extension');
assert.equal(JSON.stringify(p),before,'rendering must not rewrite the official cloud report');
c.p79AttendanceReportedOvertime=()=>p;
const table=c.attendanceRowOvertimeText({empId:'CHEN',clockIn:{timeStr:'2026/11/07 15:36'}},{token:'T'});
assert(table.includes('>延24-04</div>'),'primary visible label is the overtime-only window');
assert(table.includes('正常16-24／加班24-04'),'hover states normal versus overtime');
assert(table.includes('原雲端班次代碼：延16-04'),'retains original full-shift code in disclosure');
assert(table.includes('申報 4 小時'),'4 hours saved, not entire 12-hour work span');
assert(!table.includes('>延16-04</div>'),'legacy whole-shift label not mistaken for overtime');
p=plan(report({code:'延04-16',normalStart:'08',normalEnd:'16',overtimeStart:'04',overtimeEnd:'08',position:'before'}));
assert.equal(c.p79AttendanceOvertimeOnlyCode(p),'延04-08','04-08 is early 4-hour extension, 08-16 normal');
p=plan(report({code:'延08-20',normalStart:'08',normalEnd:'16',overtimeStart:'16',overtimeEnd:'20'}));
assert.equal(c.p79AttendanceOvertimeOnlyCode(p),'延16-20','regular early-shift 4h extension');
p=plan(report({code:'延16-04',overtimeStart:'16',overtimeEnd:'04'}));
assert.equal(c.p79AttendanceOvertimeOnlyCode(p),'延16-04','mismatched 12-hour raw period must not be mislabeled as 4 hours');
p=plan(report({category:'代',code:'代24-04'}));
assert.equal(c.p79AttendanceOvertimeOnlyCode(p),'代24-04','standalone substitutes unchanged');
p=plan(report());p.reviewState='tentative';
assert.equal(c.p79AttendanceOvertimeOnlyCode(p),'延16-04','unconfirmed schedule reconciliation never silently rewrites periods');
p=plan(report({normalStart:'',overtimeStart:'24'}));
assert.equal(c.p79AttendanceOvertimeOnlyCode(p),'延16-04','missing normal shift evidence refuses auto relabel');
p=plan(report({overtimeStart:'24',overtimeEnd:'25'}));
assert.equal(c.p79AttendanceOvertimeOnlyCode(p),'延16-04','invalid time refuses auto relabel');
for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
 if(!/\bsrc=|application\/json|importmap/.test(script[1])&&script[2].trim())new vm.Script(script[2]);
console.log('PASS attendance display: Chen 16-24 normal + 24-04 overtime, Huang 04-08, valid 4h labels, original codes and payroll data untouched.');

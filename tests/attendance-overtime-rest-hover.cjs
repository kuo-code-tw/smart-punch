'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const doc=fs.readFileSync(path.join(__dirname,'../attendance/index.html'),'utf8');
const begin=doc.indexOf('        function attendanceRowOvertimeText(row,view) {');
const end=doc.indexOf('\n        function p79CanManageOvertime()',begin);
assert.ok(begin>0&&end>begin,'overtime rendering function found');
const source=doc.slice(begin,end);
const state={plan:null,actual:0};
const render=new Function('attendanceRowOvertimeMinutes','p79AttendanceOvertimeDate',
 'p79AttendanceSpecialParts','p79AttendanceLoadViewMonth','getAttendanceEmployeeMasterToken',
 'p79AttendanceOvertimeMonths','p79AttendanceReportedOvertime','formatDurationMinutes',
 source+';return attendanceRowOvertimeText;')(
 ()=>state.actual,()=> '2026-10-28',()=>[],()=>{},()=> 'token',
 new Map([['2026-10',{ready:true,token:'token'}]]),
 ()=>state.plan,
 minutes=>String(Math.floor((minutes||0)/60))+' 小時'
);
function parts(result) {
 const at=result.indexOf('class="p79-overtime-hidden-detail"');
 assert.ok(at>=0,'non-rest information is in one hidden container');
 return {rest:result.slice(0,at),details:result.slice(at)};
}
state.plan=null;state.actual=0;
let html=render({},{});
let p=parts(html);
assert.equal(p.rest,'','ordinary zero hours must not show at rest');
assert.match(p.details,/0 小時/,'zero hours still available on hover');
state.plan={label:'休08-16',report:{id:'R1'},reviewState:'',minutes:480,pending:false};
state.actual=0;
html=render({},{});
p=parts(html);
assert.match(p.rest,/休08-16/,'rest label always visible');
assert.doesNotMatch(p.rest,/已申報|申報|小時/,'rest label is the ONLY visible text');
assert.match(p.details,/已申報/,'report badge shown only inside hidden detail');
assert.match(p.details,/申報 8 小時/,'reported hours shown only inside hidden detail');
state.actual=63;
p=parts(render({},{}));
assert.match(p.rest,/休08-16/);
assert.match(p.details,/打卡估算 1 小時/,'estimated overtime hidden but available');
state.plan={label:'休08-16 / 國10-10',report:{id:'R2'},reviewState:'tentative',originalCode:'old',minutes:60,pending:true};
p=parts(render({},{}));
assert.match(p.rest,/休08-16/);
assert.doesNotMatch(p.rest,/國10-10|已申報|暫估|申報|小時/);
assert.match(p.details,/國10-10/,'additional labels are hidden');
assert.match(p.details,/暫估／未簽退/,'review status stays accessible');
assert.match(p.details,/已安排／待申報 1 小時/,'pending hours only on hover');
state.plan={label:'平08-16',report:null,minutes:0,pending:false,reviewState:''};
p=parts(render({},{}));
assert.equal(p.rest,'','non-rest labels hidden by default');
assert.match(p.details,/平08-16/);
const styleStart=doc.indexOf('<style id="p79-overtime-rest-visible-hover-v2">');
const styleEnd=doc.indexOf('</style>',styleStart);
assert.ok(styleStart>0&&styleEnd>styleStart);
const css=doc.slice(styleStart,styleEnd);
assert.match(css,/#adminRecordsTableBody td\[data-p79-overtime-hours\] \.p79-overtime-hidden-detail \{ display: none !important; \}/);
assert.match(css,/#adminRecordsTableBody td\[data-p79-overtime-hours\]:hover \.p79-overtime-hidden-detail/);
assert.match(css,/#adminRecordsTableBody td\[data-p79-overtime-hours\]:focus-within \.p79-overtime-hidden-detail/);
assert.match(css,/display: block !important/);
assert.match(doc,/<td data-p79-overtime-hours tabindex="0" onclick="this\.focus\(\)"/,'tap and keyboard focus are supported');
assert.match(doc,/<th class="px-2 py-3 text-center whitespace-nowrap">加班時數<\/th>/,'existing heading retained');
assert.doesNotMatch(doc,/p79-overtime-hover-value/,'old all-or-nothing opacity wrapper removed');
console.log('PASS attendance overtime: 休08-16 visible; zero/reports/extra details appear only on hover/focus');

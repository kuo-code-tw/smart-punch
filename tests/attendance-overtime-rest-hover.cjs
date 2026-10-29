'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const doc=fs.readFileSync('attendance/index.html','utf8');
const begin=doc.indexOf('        function attendanceRowOvertimeText(row,view) {');
const end=doc.indexOf('\n        function p79CanManageOvertime()',begin);
assert(begin>0&&end>begin,'overtime rendering function exists');
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
const visible=html=>html.split('<div class="p79-overtime-hidden-detail">')[0];
const hidden=html=>html.includes('<div class="p79-overtime-hidden-detail">')?
 html.split('<div class="p79-overtime-hidden-detail">')[1]:'';
state.plan=null;state.actual=0;
assert.equal(render({},{}),'','zero hours without a report must stay blank');
state.actual=125;
let html=render({},{});
assert.match(visible(html),/估算 2 小時/,'positive punch overtime must be visible without hover');
assert.doesNotMatch(html,/p79-overtime-hidden-detail/,'estimated overtime must not be hidden');
state.plan={label:'休08-16',report:{id:'R1'},reviewState:'',minutes:480,pending:false};
state.actual=0;
html=render({},{});
assert.match(visible(html),/休08-16/,'rest period remains visible');
assert.match(visible(html),/申報 8 小時/,'approved rest-day 8h is visible without hover');
assert.match(visible(html),/已申報/,'formal report status visible');
assert.doesNotMatch(visible(html),/估算/,'8h statutory overtime must not be rewritten as zero-hour estimate');
state.actual=63;
html=render({},{});
assert.match(visible(html),/申報 8 小時/,'official report has display priority');
assert.match(hidden(html),/打卡估算 1 小時/,'secondary estimate remains inspectable');
for(const code of ['國24-08','例16-24','代08-16','延16-20']){
 state.plan={label:code,report:{id:code},minutes:240,pending:false,reviewState:''};
 state.actual=0;
 html=render({},{});
 assert.match(visible(html),new RegExp(code),'all officially reported shift codes are visible: '+code);
 assert.match(visible(html),/申報 4 小時/,'positive declared hours not hidden: '+code);
}
state.plan={label:'休08-16 / 國10-10',report:{id:'R2'},reviewState:'tentative',
 originalCode:'old',minutes:60,pending:false};
html=render({},{});
assert.match(visible(html),/休08-16/);
assert.match(visible(html),/國10-10/,'non-rest classification must not be hidden');
assert.match(visible(html),/申報 1 小時/);
assert.match(visible(html),/暫估／未簽退/,'review warning should remain visible');
assert.match(hidden(html),/原雲端申報/,'original source remains accessible');
state.plan={label:'代24-08',report:null,minutes:480,pending:true,reviewState:''};
state.actual=0;html=render({},{});
assert.match(visible(html),/已安排／待申報 8 小時/,'unconfirmed cover displayed as pending, never approved');
assert.doesNotMatch(visible(html),/已申報|p79-overtime-primary-visible/);
state.actual=90;
html=render({},{});
assert.match(visible(html),/估算 1 小時/,'actual overtime still visible when a cover is awaiting submission');
assert.doesNotMatch(visible(html),/已申報/);
state.plan=null;state.actual=0;
for(let i=0;i<83;i++){
 state.actual=i%3===0?90:0;
 const result=render({empId:'E'+i},{});
 assert.equal(/估算/.test(visible(result)),i%3===0,'every staff row independently gets actual positive hours');
}
const cssStart=doc.indexOf('<style id="p79-overtime-rest-visible-hover-v2">');
const cssEnd=doc.indexOf('</style>',cssStart);
assert(cssStart>0&&cssEnd>cssStart);
const css=doc.slice(cssStart,cssEnd);
assert.match(css,/\.p79-overtime-primary-visible \{ display: block;/,'positive hours visible by default');
assert.match(css,/\.p79-overtime-hidden-detail \{ display: none !important;/,'only audit detail hidden');
assert.match(css,/:focus-within \.p79-overtime-hidden-detail/,'audit evidence still accessible');
assert.match(doc,/<td data-p79-overtime-hours tabindex="0" onclick="this\.focus\(\)"/);
assert.match(doc,/<th class="px-2 py-3 text-center whitespace-nowrap">加班時數<\/th>/);
console.log('PASS attendance overtime hours visible for all staff; reports/estimate/pending and shift codes stay distinct; zero blank and hover audit preserved');

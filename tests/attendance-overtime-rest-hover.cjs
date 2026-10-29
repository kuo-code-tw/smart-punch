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
assert.equal(render({},{}),'','zero hours without a report stays blank');
state.actual=125;
let html=render({},{});
assert.match(visible(html),/估算 2 小時/,'unreported actual positive overtime remains visible');
assert.doesNotMatch(html,/p79-overtime-hidden-detail/,'no official code is never mislabeled approved');
for(const code of ['國08-16','休08-16','國24-08','例16-24','代08-16','延16-20']){
 state.plan={label:code,report:{id:code},reviewState:'',minutes:480,pending:false};
 state.actual=0;
 html=render({},{});
 assert.equal(visible(html),'<div class="p79-overtime-code-visible text-cyan-700 dark:text-cyan-300">'+code+'</div>','only code visible for '+code);
 assert.doesNotMatch(visible(html),/申報|已申報|8 小時|估算|已安排/,'hours and state cannot leak into default row');
 assert.match(hidden(html),/申報 8 小時/,'declared hours accessible on hover');
 assert.match(hidden(html),/已申報/,'official status accessible on hover');
}
state.plan={label:'休08-16',report:{id:'R1'},reviewState:'',minutes:480,pending:false};
state.actual=63;html=render({},{});
assert.equal(visible(html).includes('估算'),false,'reported code keeps punch estimate hidden');
assert.match(hidden(html),/打卡估算 1 小時/,'supplemental estimate on hover');
state.plan={label:'休08-16 / 國10-10',report:{id:'R2'},reviewState:'tentative',
 originalCode:'原始代碼',minutes:60,pending:false};html=render({},{});
assert.match(visible(html),/休08-16 \/ 國10-10/,'multi-rule code stays readable without additional rows');
assert.doesNotMatch(visible(html),/暫估|申報|原雲端/);
assert.match(hidden(html),/申報 1 小時/);
assert.match(hidden(html),/暫估／未簽退|原雲端申報/);
state.plan={label:'代24-08',report:null,minutes:480,pending:true,reviewState:''};
state.actual=90;html=render({},{});
assert.match(visible(html),/代24-08/,'planned overtime code remains visible');
assert.doesNotMatch(visible(html),/已安排|已申報|估算/,'planned overtime must not claim approval');
assert.match(hidden(html),/已安排／待申報 8 小時/,'pending status visible only on hover');
assert.doesNotMatch(hidden(html),/已申報/);
state.plan={label:'<國08-16>',report:{id:'R3'},minutes:480,pending:false,reviewState:''};
assert.match(visible(render({},{})),/&lt;國08-16&gt;/,'codes are escaped, not injected');
state.plan=null;state.actual=0;
for(let i=0;i<83;i++){
 state.actual=i%3===0?90:0;
 const result=render({empId:'E'+i},{});
 assert.equal(/估算/.test(visible(result)),i%3===0,'every employee sees genuine unreported excess');
}
const cssStart=doc.indexOf('<style id="p79-overtime-rest-visible-hover-v2">');
const cssEnd=doc.indexOf('</style>',cssStart);
assert(cssStart>0&&cssEnd>cssStart);
const css=doc.slice(cssStart,cssEnd);
assert.match(css,/\.p79-overtime-code-visible/,'shift code is visible');
assert.match(css,/\.p79-overtime-hidden-detail \{ display: none !important;/,'report hours and statuses hidden by default');
assert.match(css,/:hover \.p79-overtime-hidden-detail/,'hover reveals report details');
assert.match(css,/:focus-within \.p79-overtime-hidden-detail/,'keyboard focus reveals report details');
assert.match(doc,/<td data-p79-overtime-hours tabindex="0" onclick="this\.focus\(\)"/);
assert.match(doc,/<th class="px-2 py-3 text-center whitespace-nowrap">加班時數<\/th>/);
console.log('PASS only overtime shift code visible for all staff; report hours/state on hover/focus, pending distinct; unreported actual time visible; markup safe');

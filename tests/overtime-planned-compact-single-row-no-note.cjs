'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8');
function extract(name){
 const start=html.indexOf('function '+name+'('),end=html.indexOf('\n        }',start);
 assert(start>=0&&end>start,name+' exists');
 return html.slice(start,end+10);
}
const cssStart=html.indexOf('<style id="p79-overtime-planned-matched-font-20261028">');
const cssEnd=html.indexOf('</style>',cssStart);
assert(cssStart>0&&cssEnd>cssStart);
const css=html.slice(cssStart,cssEnd);
assert.match(css,/\.p79-planned-punch-entry\s*\{/,'missing punch controls receive single-row style');
assert.match(css,/flex-wrap:nowrap!important/,'action row cannot wrap');
assert.match(css,/height:23px!important/,'buttons are compact');
assert.match(css,/font-size:10px!important/,'buttons use compact text');
assert.match(css,/padding:2px 5px!important/,'buttons have reduced horizontal and vertical padding');
assert(!html.includes('<span class="p79-planned-reason'),'visible long note below actions must be removed');
assert(!html.includes("reason.detail?'<span"),'reason details must not add second row');
const empty={innerHTML:'',textContent:''},nodes={
 p79OvertimePlannedBody:{...empty},p79OvertimePlannedCount:{...empty},p79OvertimePlannedPagination:{...empty}
};
const c={console,Number,String,Array,Set,Map,Math,Date,
 Intl:{DateTimeFormat:function(){return{format:()=> '2026-10-29'}}},
 p79OvertimeCalculationCache:null,p79WorkOvertimeMonths:new Map(),p79MonthlyRestDraftsByMonth:new Map(),
 p79OvertimePlannedDisplayedRows:[],records:[],currentEmp:{empId:'ADMIN'},
 p79ResolvePlannedOvertimePeriod:()=>null,p79CanDeleteOvertime:()=>true,
 canPerformAdminAction:()=>true,formatEditableAttendanceTimeCell:(r)=>r.timeStr,
 document:{getElementById:id=>nodes[id]||null},
 escapeHtml:s=>String(s??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])),
 p79OvertimePlannedPage:1};
vm.createContext(c);
for(const name of ['p79WorkOvertimeIsUnconfirmedPlan','p79OvertimePlannedVisibleRows',
 'p79OvertimePendingReason','p79OvertimePendingPunchCell','p79RenderOvertimePlannedRows'])
 vm.runInContext(extract(name),c);
const planned={empId:'E1',name:'某人',dateKey:'2026-10-28',monthKey:'2026-10',
 dept:'ARMG',jobTitle:'指揮手',planned:true,reportVerified:true,
 overtimeReport:{id:'P1',planned:true,code:'休24-08',declaredHours:8}};
const render=rows=>{c.p79RenderOvertimePlannedRows(rows,'2026-10','ALL','ALL','ALL');return nodes.p79OvertimePlannedBody.innerHTML;};
const missing=render([planned]);
assert.match(missing,/p79-planned-punch-entry/);
assert.match(missing,/p79-planned-punch-add[^>]*>補登上班<\/button>/);
assert.match(missing,/p79-planned-punch-add[^>]*>補登下班<\/button>/);
assert.match(missing,/刪除預排<\/button>/,'existing delete action is preserved');
assert(!missing.includes('有出勤請補登，未出勤不申報'),'remove supplementary note');
assert(!missing.includes('p79-planned-reason'),'no extra note line');
const paired={...planned,clockIn:{id:'I1',timeStr:'2026/10/28 23:38'},
 clockOut:{id:'O1',timeStr:'2026/10/29 07:46'}};
const complete=render([paired]);
assert.match(complete,/核對申報<\/button>/,'existing review action unchanged');
assert.match(complete,/刪除預排<\/button>/);
assert(!complete.includes('p79-planned-reason'));
for(const tag of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(tag[1].trim())new vm.Script(tag[1]);
console.log('PASS compact single-line missing punch/review/delete buttons, removed supplemental notes, original actions kept, inline scripts parse');

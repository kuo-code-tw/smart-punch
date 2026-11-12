'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-reference-dashboard.js','utf8');
const page=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/port79-reference-dashboard.css','utf8');
const nodes=new Map();
function node(id){
 if(!nodes.has(id))nodes.set(id,{value:id==='p79DashMonth'?'2026-11':'',innerHTML:'',textContent:'',
  disabled:false,classList:{add(){}},style:{}});
 return nodes.get(id);
}
for(const id of ['p79DashMonth','p79DashAttendanceBars','p79DashAttendanceChartTitle',
 'p79DashChartPage','p79DashChartPrevious','p79DashChartNext'])node(id);
const win={document:{readyState:'loading',getElementById:id=>nodes.get(id)||null,addEventListener(){}}};
const entry='g.P79ReferenceDashboard={';
vm.runInNewContext(source.replace(entry,'g.__chartPage=(page)=>{chartPage=page;renderAttendancePage()};'+entry),{window:win,Intl,Math,Number,Set,Map});
win.P79ReferenceDashboard.reset();
win.P79ReferenceDashboard.setOvertimeMode('actual');
win.P79ReferenceDashboard.setOvertimeReport({month:'2026-11',officialCount:2,declaredSubmittedHours:6,
 convertedHours:7.52,missingConversion:0,actualRows:[{title:'AQC',hours:4,count:1},{title:'F/L',hours:2,count:1}],
 convertedRows:[{title:'AQC',hours:6.02,count:1},{title:'F/L',hours:1.5,count:1}],rows:[{title:'AQC',hours:99,count:1}]});
let html=node('p79DashAttendanceBars').innerHTML;
assert.match(html,/p79r-ot-donut/);
assert.match(html,/<strong>6<\/strong>/,'actual mode reports only submitted 6h');
assert.match(html,/AQC：4 小時（66.7%）/);
assert.match(node('p79DashAttendanceChartTitle').innerHTML,/實際/);
assert(!html.includes('99 小時'),'planned/legacy rows must not leak into official charts');
win.P79ReferenceDashboard.setOvertimeMode('converted');
html=node('p79DashAttendanceBars').innerHTML;
assert.match(html,/<strong>7.52<\/strong>/);
assert.match(html,/AQC：6.02 小時（80.1%）/);
assert.match(node('p79DashAttendanceChartTitle').innerHTML,/換算/);
win.P79ReferenceDashboard.setLeaveReport({month:'2026-11',issues:[],rows:[{title:'AQC',days:1.5},{title:'F/L',days:0.5}]});
win.__chartPage(1);
html=node('p79DashAttendanceBars').innerHTML;
assert.match(html,/p79r-ot-donut/,'page two is a donut, not the retired horizontal bar chart');
assert.match(html,/<strong>2<\/strong>/);
assert.match(html,/AQC：1.5 天（75.0%）/);
assert.match(html,/F\/L：0.5 天（25.0%）/);
assert.match(node('p79DashChartPage').textContent,/第2頁/);
win.__chartPage(0);
assert.match(node('p79DashAttendanceBars').innerHTML,/<strong>7.52<\/strong>/,'returning to page one retains converted mode');
assert(page.includes('data-overtime-mode="actual"')&&page.includes('data-overtime-mode="converted"'));
assert(page.includes('id="p79DashOvertimeUnreported"'),'unreported subtotal remains separate');
assert(css.includes('min-height:122px!important'),'reference fixed 76px KPI height must be overridden');
console.log('PASS homepage actual/converted donut toggle, distinct submitted data, approved leave page donut, pagination and mobile KPI layout');

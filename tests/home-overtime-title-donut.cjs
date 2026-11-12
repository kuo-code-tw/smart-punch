'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-reference-dashboard.js','utf8');
const style=fs.readFileSync('assets/port79-reference-dashboard.css','utf8');
const home=fs.readFileSync('index.html','utf8');
const nodes=new Map();
function get(id){
 if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',textContent:'',value:id==='p79DashMonth'?'2026-11':'',
  disabled:false,classList:{add(){}},style:{}});
 return nodes.get(id);
}
const document={readyState:'loading',getElementById:id=>nodes.get(id)||null,addEventListener(){}};
for(const id of ['p79DashMonth','p79DashAttendanceBars','p79DashAttendanceChartTitle',
 'p79DashChartPage','p79DashChartPrevious','p79DashChartNext'])get(id);
const window={document};
const expose='g.P79ReferenceDashboard={';
assert(source.includes(expose),'public chart API still present');
vm.runInNewContext(source.replace(expose,'g.__chartPageTest=function(page){chartPage=page;renderAttendancePage()};'+expose),{window,Intl,Math,Number});
const front=[{title:'ARMG',hours:44,count:1},{title:'F/L',hours:36,count:1},
 {title:'領班',hours:32,count:1},{title:'指揮手',hours:8,count:1}];
window.P79ReferenceDashboard.reset();
window.P79ReferenceDashboard.setOvertimeReport({month:'2026-11',count:4,hours:120,rows:front});
let markup=get('p79DashAttendanceBars').innerHTML;
assert(markup.includes('p79r-ot-donut-layout'),'first page uses the specified donut layout');
assert(markup.includes('p79r-ot-center'),'total is displayed inside the circle');
assert(markup.includes('<strong>120</strong>'),'120 hours = 44 + 36 + 32 + 8');
for(const [title,hours,pct] of [['ARMG','44','36.7%'],['F/L','36','30.0%'],
 ['領班','32','26.7%'],['指揮手','8','6.7%']]){
 assert(markup.includes(title),title+' is visible');
 assert(markup.includes(hours+' 小時'),title+' hours match source');
 assert(markup.includes(pct),title+' percentage uses correct 1-decimal rounding');
}
assert.equal((markup.match(/class="p79r-ot-legend-row"/g)||[]).length,4);
assert(markup.includes('stroke="#147dff"')&&markup.includes('stroke="#19b9eb"')&&
 markup.includes('stroke="#36c638"')&&markup.includes('stroke="#ff9900"'),'four approved colors');
assert(markup.includes('<title>ARMG：44 小時（36.7%）</title>'),'per-sector hover title');
assert(markup.includes('含待審核')&&markup.includes('非薪資結算工時'),'formal statistical rules remain visible');
assert.equal(get('p79DashChartPage').textContent,'第1頁／共2頁');
assert.equal(get('p79DashChartNext').disabled,false);

const many=[...front,{title:'AQC',hours:6,count:1},{title:'倉庫員',hours:4,count:1},
 {title:'技術員',hours:2,count:1},{title:'主任',hours:999,count:1}];
window.P79ReferenceDashboard.setOvertimeReport({month:'2026-11',count:8,hours:1132,rows:many});
markup=get('p79DashAttendanceBars').innerHTML;
assert(markup.includes('<strong>132</strong>'),'the total is filtered employee overtime, not company-wide overtime');
assert.equal((markup.match(/class="p79r-ot-legend-row"/g)||[]).length,6,'top five plus Other');
assert(markup.includes('其他')&&markup.includes('6 小時'),'other aggregates excluded ranks 6+');
assert(!markup.includes('主任'),'manager never appears in employee chart');
assert(markup.includes('stroke="#94a3b8"'),'other group is neutral grey');

window.P79ReferenceDashboard.setOvertimeReport({month:'2026-11',count:1,hours:3,
 rows:[{title:'<img src=x onerror=alert(1)>',count:1,hours:3}]});
markup=get('p79DashAttendanceBars').innerHTML;
assert(!markup.includes('<img'),'untrusted title never becomes a DOM element');
assert(markup.includes('&lt;img'),'untrusted text is escaped');

window.P79ReferenceDashboard.setOvertimeReport({month:'2026-11',count:0,hours:0,rows:[]});
markup=get('p79DashAttendanceBars').innerHTML;
assert(markup.includes('<strong>0</strong>')&&markup.includes('本月尚無有效加班資料'),'real empty state shows a zero-hour blank donut');
window.P79ReferenceDashboard.setOvertimeReport({month:'2026-11',count:0,hours:0,rows:[],sourceWarning:'cloud unavailable'});
markup=get('p79DashAttendanceBars').innerHTML;
assert(markup.includes('即時加班來源尚未核對完成')&&!markup.includes('p79r-ot-donut'),'incomplete source must not be reported as zero');
window.P79ReferenceDashboard.setOvertimeReport({month:'2026-11',count:2,hours:6,rows:[{title:'未設定職稱',hours:6,count:2}]});
assert(get('p79DashAttendanceBars').innerHTML.includes('已讀取 2 筆加班申報'),'management/unmapped-only source not disguised as zero');

window.P79ReferenceDashboard.setLeaveReport({month:'2026-11',rows:[{title:'ARMG',days:1.5},{title:'F/L',days:0.5}],issues:[]});
window.__chartPageTest(1);
markup=get('p79DashAttendanceBars').innerHTML;
assert(markup.includes('p79r-ot-donut')&&markup.includes('p79r-ot-donut-layout'),'second page also uses the same donut layout');
assert(markup.includes('本月核准')&&markup.includes('請假天數')&&markup.includes('<strong>2</strong>'),'leave donut shows summed approved days');
assert(markup.includes('ARMG：1.5 天（75.0%）')&&markup.includes('F/L：0.5 天（25.0%）'),'leave donut uses real approved day shares');
assert(markup.includes('核准請假天數')&&markup.includes('1.5 天'),'leave tooltip and legend say days, never hours');
window.P79ReferenceDashboard.setLeaveReport({month:'2026-11',rows:[],issues:[]});
markup=get('p79DashAttendanceBars').innerHTML;
assert(markup.includes('p79r-ot-donut')&&markup.includes('本月尚無已核准請假'),'verified empty leave makes a zero ring');
window.P79ReferenceDashboard.setLeaveReport({month:'2026-11',rows:[],issues:['pending leave']});
markup=get('p79DashAttendanceBars').innerHTML;
assert(!markup.includes('p79r-ot-donut')&&markup.includes('待核對'),'unverified leave must not show false zero');
window.P79ReferenceDashboard.setLeaveReport({month:'2026-11',rows:[{title:'<img src=x onerror=alert(1)>',days:2}],issues:[]});
markup=get('p79DashAttendanceBars').innerHTML;
assert(!markup.includes('<img')&&markup.includes('&lt;img'),'leave donut escapes malicious titles');
assert.equal(get('p79DashChartPage').textContent,'第2頁／共2頁');
window.__chartPageTest(0);
assert(get('p79DashAttendanceChartTitle').innerHTML.includes('本月員工職稱加班時數統計'),'back to overtime page');

assert(style.includes('#p79DashAttendancePages .p79r-ot-donut'),'only target card is styled');
assert(style.includes('@container (max-width:400px)'),'mobile layout stacks under a narrow card');
assert(style.includes('html[data-theme="dark"] #p79DashAttendancePages'),'dark theme remains legible');
assert(home.includes('donut=20261112-v1'),'cache versions change for shipped JS and CSS');
console.log('PASS both pagination donut charts: overtime totals/colors/percentages and approved-leave days/percentages, error states, escaping and responsive layout');

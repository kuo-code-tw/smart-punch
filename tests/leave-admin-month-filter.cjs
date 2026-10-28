'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('leave/index.html','utf8');
assert(html.includes('id="filterMonth" onchange="renderAdmin()"'),'月份下拉選單應直接更新表格');
assert(html.includes('let rows=leaveRecords.filter(l=>p79LeaveMatchesMonth(l,month)'),'主表必須使用月份條件');
assert(html.includes('...p79LeaveComparisonRows.map(l=>'),'匯出/列印沿用篩選後的清單');
const start=html.indexOf('function normalizeLeaveFilterDate(');
const end=html.indexOf('function p79LeaveJobForRecord(',start);
assert(start>=0&&end>start,'日期與月份篩選函式必須存在');
const source=html.slice(start,end);
const select={value:'',dataset:{},innerHTML:''};
const rows=[
 {startTime:'2026/11/07',endTime:'2026/11/07',name:'十一月'},
 {startTime:'2026/10/27',endTime:'2026/10/28',name:'十月'},
 {startDate:'2026-10-31',endDate:'2026-11-02',name:'跨月'},
 {startDate:'2026-09-30',endDate:'2026-10-01',name:'上月跨月'},
 {startDate:'2026-12-05',endDate:'2026-12-05',name:'未來'}
];
const fakeDate=class extends Date{
 constructor(...args){super(...(args.length?args:['2026-10-28T03:00:00Z']));}
};
const api=new Function('$','leaveRecords','Intl','Date',
 source+';return {p79LeaveMatchesMonth,p79LeaveRecordMonthRange,populateLeaveAdminMonths};')(
 id=>id==='filterMonth'?select:null,rows,Intl,fakeDate);
api.populateLeaveAdminMonths();
assert.equal(select.value,'2026-10','台灣當月預設 2026-10');
assert(select.innerHTML.includes('2026年11月'),'可切換 11 月');
assert(select.innerHTML.includes('全部月份'),'可查看全部月份');
assert.deepEqual(rows.filter(r=>api.p79LeaveMatchesMonth(r,'2026-10')).map(r=>r.name),['十月','跨月','上月跨月']);
assert.deepEqual(rows.filter(r=>api.p79LeaveMatchesMonth(r,'2026-11')).map(r=>r.name),['十一月','跨月']);
assert.deepEqual(rows.filter(r=>api.p79LeaveMatchesMonth(r,'')).map(r=>r.name),rows.map(r=>r.name));
select.value='';api.populateLeaveAdminMonths();assert.equal(select.value,'','重載後必須保留全部月份');
select.value='2026-11';api.populateLeaveAdminMonths();assert.equal(select.value,'2026-11','重載後必須保留指定月份');
assert(!api.p79LeaveMatchesMonth({startDate:'invalid'},'2026-10'),'無效日期不可混入當月');
console.log('PASS: admin leave month filtering, default Taiwan month, cross-month, all-months, preserved selection, exports');

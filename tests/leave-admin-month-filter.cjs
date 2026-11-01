'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const html=fs.readFileSync('leave/index.html','utf8');
assert(html.includes('id="filterMonth" onchange="this.dataset.p79MonthUserSelected=\'1\''));
assert(html.includes('let rows=leaveRecords.filter(l=>p79LeaveMatchesMonth(l,month)'),'main list must respect month filter');
assert(html.includes('id="adminLeaveSummary"'),'show visible and all-month counts');
assert(html.includes('請假紀錄總計 '),'cloud status must identify all-month record total, not people count');
assert(html.includes('...p79LeaveComparisonRows.map(l=>'),'export uses filtered rows');
const start=html.indexOf('function normalizeLeaveFilterDate('),end=html.indexOf('function p79LeaveJobForRecord(',start);
assert(start>=0&&end>start,'date and month filters exist');
const source=html.slice(start,end);
const select={value:'',dataset:{},innerHTML:''};
const rows=[
 {startTime:'2026/11/07',endTime:'2026/11/07',name:'十一月'},
 {startTime:'2026/10/27',endTime:'2026/10/28',name:'十月'},
 {startDate:'2026-10-31',endDate:'2026-11-02',name:'跨月'},
 {startDate:'2026-09-30',endDate:'2026-10-01',name:'上月跨月'},
 {startDate:'2026-12-05',endDate:'2026-12-05',name:'未來'}
];
const fakeDate=class extends Date{constructor(...args){super(...(args.length?args:['2026-10-28T03:00:00Z']));}};
const create=(r=rows)=>new Function('$','leaveRecords','Intl','Date',source+
 ';return {p79LeaveMatchesMonth,p79LeaveRecordMonthRange,populateLeaveAdminMonths};')(
 id=>id==='filterMonth'?select:null,r,Intl,fakeDate);
const api=create();
api.populateLeaveAdminMonths();
assert.equal(select.value,'2026-10','current month is default if records overlap');
assert(select.innerHTML.includes('2026年11月'));
assert(select.innerHTML.includes('全部月份'));
assert.deepEqual(rows.filter(r=>api.p79LeaveMatchesMonth(r,'2026-10')).map(r=>r.name),['十月','跨月','上月跨月']);
assert.deepEqual(rows.filter(r=>api.p79LeaveMatchesMonth(r,'2026-11')).map(r=>r.name),['十一月','跨月']);
assert.deepEqual(rows.filter(r=>api.p79LeaveMatchesMonth(r,'')).map(r=>r.name),rows.map(r=>r.name));
select.value='';select.dataset.p79MonthUserSelected='1';api.populateLeaveAdminMonths();
assert.equal(select.value,'','manually chosen all months remains selected');
select.value='2026-11';api.populateLeaveAdminMonths();
assert.equal(select.value,'2026-11','manual selected month preserved');
assert(!api.p79LeaveMatchesMonth({startDate:'invalid'},'2026-10'));
const historical=Array.from({length:23},(_,i)=>({id:'L'+i,empId:'E'+(i%8),name:'員工'+(i%8),startDate:'2026-09-05',endDate:'2026-09-05'}));
select.value='';select.dataset={};
const historicalApi=create(historical);
historicalApi.populateLeaveAdminMonths();
assert.equal(select.value,'','all historical records are visible when current month has no matching leave');
assert.equal(historical.filter(r=>historicalApi.p79LeaveMatchesMonth(r,select.value)).length,23);
assert.equal(select.dataset.p79AutoAllReason,'no-current');
select.value='2026-10';select.dataset.p79MonthUserSelected='1';historicalApi.populateLeaveAdminMonths();
assert.equal(select.value,'2026-10','an explicitly selected empty month must not be overwritten');
select.value='';select.dataset={};create([]).populateLeaveAdminMonths();
assert.equal(select.value,'2026-10','when cloud list is not ready retain normal current-month default');
create(historical).populateLeaveAdminMonths();
assert.equal(select.value,'','historical cloud data arriving after empty boot should auto-show all records');
console.log('PASS month selection, cross-month leave, historical-month auto fallback, manual month preserved, delayed cloud loading and clear record counts');

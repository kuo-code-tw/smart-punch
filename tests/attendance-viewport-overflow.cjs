const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8');
const table=html.match(/<table class="attendance-records-wide-table[^]*?<\/table>/)?.[0];
assert(table,'attendance records table exists');
const cols=[...table.matchAll(/<col data-p79-att-col="(\d+)" style="width:(\d+)%"/g)];
const heads=[...table.matchAll(/<th\b/g)],sum=cols.reduce((v,x)=>v+Number(x[2]),0);
assert.equal(heads.length,14,'expected 14 displayed headers');
assert.equal(cols.length,heads.length,'every header, including action, needs a dedicated col');
assert.equal(sum,100,'column percentages must fit the viewport');
cols.forEach((c,i)=>assert.equal(Number(c[1]),i+1,'stable ordered column widths'));
const css=html.match(/<style id="p79-attendance-viewport-overflow-fix">([^]*?)<\/style>/)?.[1];
assert(css,'viewport fix style exists');
assert(css.includes('#p79AttendanceDateStrip')&&css.includes('flex-wrap:wrap!important'),'all date choices wrap on desktop');
assert(css.includes('max-width:100%!important'),'container must not expand page');
assert(css.includes('@media(max-width:1399px)')&&css.includes('overflow-x:auto!important'),'narrow screens scroll the table internally');
assert(css.includes('@media(max-width:767px)')&&css.includes('flex-wrap:nowrap!important'),'phone dates swipe inside their own strip');
const a=html.indexOf('        function renderRecordsPagination('),b=html.indexOf('\n        function attendanceRowAttentionRank(',a);
assert(a>0&&b>a);
let moved=0;
const box={innerHTML:'',classList:{add(){},remove(){}},get firstElementChild(){return {firstElementChild:{}};}};
const actions={replaceChildren(){}};
const c={
 document:{getElementById:id=>id==='recordsPagination'?box:id==='attendanceRecordActionsHost'?actions:null},
 escapeHtml:v=>String(v),refreshAttendanceSyncCompactStatus(){},goToRecordsPage:()=>moved++,
};
vm.createContext(c);vm.runInContext(html.slice(a,b),c);
const keys=Array.from({length:31},(_,i)=>'2026-10-'+String(31-i).padStart(2,'0'));
c.renderRecordsPagination(keys,'2026-10-24',[],0,null);
assert(box.innerHTML.includes('id="p79AttendanceDateStrip"'),'day strip renders');
assert.equal((box.innerHTML.match(/onclick="goToRecordsPage\(\d+\)"/g)||[]).length,33,'31 days plus two navigation buttons must be preserved');
assert(box.innerHTML.includes('10/01')&&box.innerHTML.includes('10/31'),'first and last day remain reachable');
assert(box.innerHTML.includes('showRecordsDateRange()'),'full range choice preserved');
console.log('PASS 14-column width alignment, desktop 31-day wrapping, mobile internal swipe, and all date actions');

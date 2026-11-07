'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const ref=fs.readFileSync(path.join(root,'assets/port79-reference-dashboard.js'),'utf8');
const pager=fs.readFileSync(path.join(root,'assets/port79-efficiency-week-month-pager.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/port79-reference-dashboard.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const days=Array.from({length:7},(_,i)=>({
 date:'2026-11-'+String(i+1).padStart(2,'0'),
 gph:({2:23.64,3:22.80,4:20.64,6:23.06})[i]??null,
 count:1
}));
function verifyChart(markup,caption){
 const line=[...markup.matchAll(/<polyline points="([^"]+)"/g)];
 assert.equal(line.length,1,caption+': one continuous polyline');
 assert.equal(line[0][1].trim().split(/\s+/).length,4,caption+': 4 observed points connected over empty dates');
 assert.equal((markup.match(/<circle /g)||[]).length,4,caption+': circles only for 4 measured dates');
 assert.equal((markup.match(/>—/g)||[]).length,3,caption+': 3 days remain missing');
 assert(!markup.includes('NaN'),caption+': no synthetic coordinates');
}
const pStart= pager.indexOf('function draw(p,report){'),pEnd=pager.indexOf('// 年度月份資料讀取限制並行',pStart);
assert(pStart>=0&&pEnd>pStart,'pager draw function');
const pChart={clientWidth:480,clientHeight:170,innerHTML:''};
const pCtx={
 lastChart:null,lastChartSize:'',mode:'week',chartEl:pChart,summaryEl:{textContent:''}
};
vm.createContext(pCtx);
vm.runInContext(pager.slice(pStart,pEnd),pCtx);
pCtx.draw({start:'2026-11-01',end:'2026-11-07'},{
 days,average:22.3,valid:4,failures:0
});
verifyChart(pChart.innerHTML,'weekly/monthly pager');
const rStart=ref.indexOf('function weeklyChart(report){'),rEnd=ref.indexOf('// Homepage ship timetable is a separate outside-website source',rStart);
assert(rStart>=0&&rEnd>rStart,'reference weekly chart function');
const rChart={innerHTML:'',closest(){return {querySelector(){return null;}}}};
const rCtx={
 $:id=>id==='p79DashShipBars'?rChart:null,
 fmt:(value,d)=>Number(value).toFixed(d||0),
 esc:value=>String(value),
 empty:()=>{throw Error('Unexpected empty chart')}
};
vm.createContext(rCtx);
vm.runInContext(ref.slice(rStart,rEnd),rCtx);
rCtx.weeklyChart({start:'2026-11-01',end:'2026-11-07',days});
verifyChart(rChart.innerHTML,'reference weekly chart');
assert(html.includes('id="p79DashShipRanking"'),'ranking remains present');
assert(html.includes('<th>GPH</th></tr>'),'GPH column remains visible');
assert(!html.slice(html.indexOf('最新完工船舶'),html.indexOf('最新完工船舶')+420).includes('<th>狀態</th>'),'status stays hidden');
assert(css.includes('article.p79d-ranking .p79d-table-scroll table'),'rank-specific CSS');
assert(css.includes('overflow-x:hidden!important'),'no horizontal table scrollbar');
assert(css.includes('table-layout:fixed!important'),'fit six columns within card');
assert(css.includes('width:34%!important'),'bilingual ship column allocated space');
assert(!/min-width:490px!important/.test(css),'old forced table minimum removed');
console.log('PASS: trend connects four observed GPH values across three missing dates; imported-vessel table fits without horizontal scroll.');

'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const js=fs.readFileSync('aqc-efficiency/terminal-ops.js','utf8');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
for(const id of ['terminalStopCategoryKpis','terminalStopBody','terminalStopDetailBody','terminalStopDetailCaption','terminalReasonFilter']){
 assert(html.includes('id="'+id+'"'),id);
}
const mk=(id,day,aqc,note,other={})=>({
 id,source:'working-report',workingNo:'5260203',shipName:'WAN HAI 376',
 workDate:day,number:aqc,startTime:'01:00',endTime:'04:00',note,...other
});
const rows=[
 mk('a','2026-11-02','7903','0200-0211 H/C*1；AQC故障｜0331-0348 7903 故障跳電'),
 mk('a2','2026-11-02','7903','AQC故障｜0331-0348 7903 故障跳電'), // same vessel/AQC/period
 mk('b','2026-11-08','7902','系統故障｜0400-0426 CMS當機｜0452-0502 H/C*2'),
 mk('c','2026-11-08','7905','AQC故障｜1323-1416 吊架下降失速'),
 mk('d','2026-11-08','7901','0940-1006 H/C*1；1137-1147 H/C*1｜OOG*1'),
 mk('e','2026-11-08','7902','系統更新停工'), // unknown duration
 mk('f','2026-11-08','7903','2355-0010 AQC故障'), // midnight
 mk('g','2026-11-08','7905','0711-0721 AQC故障',{stopItem1:'設備故障',stopTime1:10}), // explicit duplicate
 mk('oct','2026-10-09','7905','0930-1000 系統故障') // outside month
];
const ids=['terminalDashboardRoot','terminalMonth','terminalKpi','terminalWharfBody','terminalDayBody',
 'terminalShiftBody','terminalStopBody','terminalStopCategoryKpis','terminalStopDetailBody',
 'terminalStopDetailCaption','terminalReasonFilter','terminalDataStatus','terminalWarnings','terminalMonthCaption'];
const els=Object.fromEntries(ids.map(id=>[id,{dataset:{},value:id==='terminalMonth'?'2026-11':'',innerHTML:'',textContent:''}]));
els.terminalMonth.dataset.p79Year='2026';
const ctx={window:{},document:{getElementById:id=>els[id]},console:{warn(){}},records:rows,shipMasters:[],
 getPort79Year:()=>2026,GC_FULL_READ_TIMEOUT_MS:90000,
 shipMasterDateMatchesMonth:(s,m)=>String(s.lastDate||'').startsWith(m),
 apiGetQuick:async()=>({ok:true,shipMasters:[],records:rows})};
vm.createContext(ctx);
vm.runInContext(js,ctx);
const api=ctx.window.P79TerminalOps;
assert.equal(api.remarkCategory('0331-0348 故障跳電'),'設備故障');
assert.equal(api.remarkCategory('0400-0426 CMS當機'),'系統異常');
assert.equal(api.remarkCategory('0449-0459 H/C*2'),'');
assert.equal(api.remarkCategory('0711-0716 OOG*1'),'');
const excluded=api.scopeTo79and80('2026-11',[],[mk('exclude','2026-11-08','7911','AQC故障')]);
assert.equal(excluded.records.length,0,'unlisted AQC must not enter 79/80 terminal dashboard');
const stats=api.build('2026-11',[],rows);
assert.equal(stats.totalStopEvents,6,'no duplicate report/Remark intervals or regular H/C');
assert.equal(stats.totalStopMinutes,121,'17+26+53+15+10 minutes, no unknown time added');
assert.equal(stats.unknownStopEvents,1,'system update with no clock remains unquantified');
assert.equal(stats.byStop.find(x=>x.reason==='設備故障').events,4);
assert.equal(stats.byStop.find(x=>x.reason==='系統異常').events,2);
assert(stats.stopDetails.every(x=>x.date.startsWith('2026-11')),'only selected month');
assert(stats.stopDetails.some(x=>x.minutes===null),'unknown duration surfaced');
api.render();
assert(els.terminalStopCategoryKpis.innerHTML.includes('系統異常'));
assert(els.terminalStopBody.innerHTML.includes('未定時')===false,'table rows are numeric data');
assert(els.terminalStopDetailBody.innerHTML.includes('0331-0348 7903 故障跳電'));
assert(els.terminalStopDetailBody.innerHTML.includes('待核對'));
assert(els.terminalWarnings.innerHTML.includes('只計次數'));
api.filterReason('系統異常');
assert.equal(els.terminalReasonFilter.value,'系統異常');
assert(!els.terminalStopDetailBody.innerHTML.includes('故障跳電'),'dropdown filter narrows details');
assert(els.terminalStopDetailCaption.textContent.includes('系統異常'));
api.selectCategory('系統異常');
assert.equal(els.terminalReasonFilter.value,'','color card selection clears identical filter');
assert(els.terminalStopDetailBody.innerHTML.includes('故障跳電'),'category reset restores details');
api.selectCategory('設備故障');
assert.equal(els.terminalReasonFilter.value,'設備故障','color card and dropdown are synchronized');
api.filterReason('');
assert(els.terminalStopDetailBody.innerHTML.includes('CMS當機'),'all restores all categories');
// Untrusted remark strings must never be injected as HTML.
ctx.records=[mk('x','2026-11-08','7905','0331-0348 AQC故障 <img src=x onerror=alert(1)>')];
api.render();
assert(els.terminalStopDetailBody.innerHTML.includes('&lt;img'));
assert(!els.terminalStopDetailBody.innerHTML.includes('<img'));
console.log('PASS terminal stop Remark: classify, duration, midnight, duplicate prevention, untimed, month, filtering, safe HTML');

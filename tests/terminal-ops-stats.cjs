'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const js=fs.readFileSync('aqc-efficiency/terminal-ops.js','utf8');
assert(html.includes('data-tab="terminal"'));

for(const code of ['7901','7902','7903','7905','8001','8002','8003','8005','8006'])assert(html.includes('terminalRodOverviewMount')&&html.includes('terminal-rod-overview.js'),'AQC cards connected');
assert(html.includes('terminal-rod-overview.css?v=20261110-dual-v1'));
assert(js.includes('root.P79TerminalRodOverview?.render(stats,state);'));

assert(html.includes('id="view-terminal"'));
for(const id of ['terminalMonth','terminalWharfBody','terminalDayBody','terminalShiftBody','terminalStopBody','terminalStopCategoryKpis','terminalStopDetailBody','terminalStopDetailCaption','terminalReasonFilter','terminalDataStatus']){
  assert(html.includes('id="'+id+'"'),id);
}
assert(html.includes('./terminal-ops.js?v=20261110-matched-tables-v2'));
assert(html.includes('id="terminalDayTableWrap"'),'daily ship table has measured viewport');
assert(html.includes('id="terminalShiftTableWrap"'),'shift detail table has synced scroll viewport');
assert(html.includes('#view-terminal #terminalShiftTableWrap{box-sizing:border-box;overflow-y:auto}'),'shift details retain vertical scrolling');
assert(js.includes('new ResizeObserver(()=>alignTerminalDailyTables())'),'height stays synced on month and viewport updates');
assert(js.includes('shift.style.height=Math.round(height)'), 'shift table uses the left table measured height');
assert(html.includes("if(name==='terminal'){window.P79TerminalOps?.render()"));
assert(html.includes('<th>Bundle 扣除</th>'));
assert(html.includes('class="p79-ter-table p79-ter-day-table"'),'daily table uses dedicated width rules');
assert(html.includes('#view-terminal .p79-ter-day-table thead th:nth-child(5){width:16%;white-space:nowrap!important;overflow-wrap:normal!important;word-break:keep-all!important}'),'Bundle 扣除 header stays one line');

assert(html.includes('<th>原因分類（點選修改）</th>'));
assert(html.includes('@container (max-width:900px)'));
assert(!js.includes('apiPost(')&&!js.includes('postCloud(')&&!js.includes('gcSyncAll'),'analytics must be read only');
const mkShip=(no,date,wharf,disc,load,billed,moves,shift=0)=>({
 workingNo:no,vessel:no,lastDate:date,wharf,totalContainers:billed,totalMoves:moves,shiftMoves:shift,hatches:2,
 workingSheetSource:{disc,load}
});
const mkRecord=(id,no,date,start,end,disc,load,stop=[])=>({
 id,workingNo:no,workDate:date,startTime:start,endTime:end,disc,load,hatches:1,timeHours:1,source:'working-report',number:id,
 ...Object.fromEntries(stop.flatMap(([item,time],i)=>[['stopItem'+(i+1),item],['stopTime'+(i+1),time]]))
});
const ships=[
 mkShip('001','2026-11-02','79L',10,20,29,31,2),
 mkShip('001','2026-11-02','79L',10,20,29,31,2),
 mkShip('002','2026-11-04','80R',5,7,12,13,1),
 mkShip('099','2026-10-04','80R',100,200,300,301)
];
const recs=[
 mkRecord('r1','001','2026-11-02','07:55','08:10',4,2,[['機故',10]]),
 mkRecord('r1','001','2026-11-02','07:55','08:10',4,2,[['機故',10]]),
 mkRecord('r2','001','2026-11-03','17:00','18:00',0,7,[['天候',15]]),
 {...mkRecord('r3','002','2026-11-03','23:00','01:00',5,3,[['設備故障','00:05']]),source:'gc-driver-efficiency'},
 {...mkRecord('rFallback','001','2026-11-03','07:00','08:00',99,99),source:'gc-driver-efficiency'},
 mkRecord('rOct','099','2026-10-04','09:00','10:00',20,50)
];
const ids=['terminalDashboardRoot','terminalMonth','terminalKpi','terminalWharfBody','terminalDayBody','terminalShiftBody','terminalStopBody','terminalStopCategoryKpis','terminalStopDetailBody','terminalStopDetailCaption','terminalDataStatus','terminalWarnings','terminalMonthCaption'];
const elements=Object.fromEntries(ids.map(id=>[id,{dataset:{},value:id==='terminalMonth'?'2026-11':'',innerHTML:'',textContent:''}]));
elements.terminalMonth.dataset.p79Year='2026';
const ctx={window:{},document:{getElementById:id=>elements[id]},console:{warn(){}},
 getPort79Year:()=>2026,shipMasterDateMatchesMonth:(s,m)=>String(s._cloudLastDate||s.lastDate||s.firstDate||'').startsWith(m),
 shipMasters:ships,records:recs,GC_FULL_READ_TIMEOUT_MS:90000,
 apiGetQuick:async()=>({ok:true,shipMasters:ships,records:recs})
};
vm.createContext(ctx);vm.runInContext(js,ctx);
const api=ctx.window.P79TerminalOps;assert(api);
ships[0].workingSheetSource.bundleDeduct=1;
ships[1].workingSheetSource.bundleDeduct=1;
const stats=api.build('2026-11',ships,recs);
assert.equal(stats.vesselTotals.ships,2,'WORKING NO is unique');
assert.equal(stats.vesselTotals.disc,15);
assert.equal(stats.vesselTotals.load,27);
assert.equal(stats.vesselTotals.billed,41,'bill quantity is not raw DISC+LOAD');
assert.equal(stats.vesselTotals.moves,44,'moves include different source accounting');
assert.equal(stats.vesselTotals.bundle,1,'verified Bundle deduction from WORKING SHEET');
assert.equal(stats.byDay.find(x=>x.day==='2026-11-02').bundle,1,'daily Bundle deducted on completion day');
assert.equal(stats.byDay.find(x=>x.day==='2026-11-02').bundleMismatch,0,'30 original minus Bundle 1 is 29');
assert.equal(stats.byWharf.length,2);
assert.equal(stats.byWharf.find(r=>r.wharf==='79L').moves,31);
assert.equal(stats.byDay.length,2);
assert.equal(stats.records.length,3,'prefer WORKING REPORT over gc-driver for same ship and deduplicate IDs');
assert.equal(stats.byShift.length,2,'two occupied date-and-shift combinations');
assert.deepEqual(Array.from(stats.byShift,x=>x.day),['2026-11-03','2026-11-02'],'newest date first');
assert.equal(stats.crossShift,2);
assert.equal(stats.totalStopEvents,3);
assert.equal(stats.totalStopMinutes,30,'HH:MM stop times interpreted correctly');
assert.equal(api.shiftOf('07:59'),'晚班');
assert.equal(api.shiftOf('08:00'),'早班');
assert.equal(api.shiftOf('16:00'),'中班');
assert.equal(api.shiftOf('00:10'),'晚班');
api.render();
assert(elements.terminalWharfBody.innerHTML.includes('79L'));
assert(elements.terminalShiftBody.innerHTML.includes('晚班'));
assert(elements.terminalShiftBody.innerHTML.includes('p79-terminal-shift shift-night'),'night shift uses purple label');
assert(elements.terminalShiftBody.innerHTML.includes('p79-terminal-shift shift-middle'),'middle shift uses orange label');
assert(js.includes("s.shift==='早班'?'shift-early'"),'early shift has separate blue class');
for(const shift of ['shift-early','shift-middle','shift-night'])assert(html.includes('#view-terminal .p79-terminal-shift.'+shift),'all shift colors defined');
assert(html.includes('p79-ter-day-table thead th:nth-child(5){width:16%;white-space:nowrap!important'),'Bundle heading remains one line');
assert(elements.terminalStopBody.innerHTML.includes('設備故障'));
assert(elements.terminalDayBody.innerHTML.includes('p79-ter-bundle'));
assert(elements.terminalStopDetailBody.innerHTML.includes('setReasonCategory'));
assert(elements.terminalReasonFilter.innerHTML.includes('全部原因'));
assert(!elements.terminalStopDetailBody.innerHTML.includes('已手動分類'));
(async()=>{
 let calls=[];
 ctx.apiGetQuick=async(action,args,timeout)=>{
   calls.push({action,args:JSON.parse(JSON.stringify(args)),timeout});
   return {ok:true,shipMasters:ships,records:recs};
 };
 assert.equal(await api.load(true),true);
 assert.deepEqual(calls[0],{action:'gcGetData',args:{month:'2026-11'},timeout:90000},'cloud scope must be selected month');
 assert.equal(elements.terminalDataStatus.dataset.state,'cloud');
 assert(!elements.terminalWharfBody.innerHTML.includes('099'));
 elements.terminalMonth.value='2026-10';
 assert.equal(await api.load(true),true);
 assert.equal(elements.terminalWharfBody.innerHTML.includes('79L'),false,'October must not include November vessels');
 assert.equal(elements.terminalWharfBody.innerHTML.includes('80R'),true);
 assert.equal(elements.terminalKpi.innerHTML.includes('301'),true,'October moves');
 elements.terminalMonth.value='2026-09';
 ctx.apiGetQuick=async()=>{throw Error('offline')};
 assert.equal(await api.load(true),false);
 assert.equal(elements.terminalDataStatus.dataset.state,'local');
 assert(!elements.terminalWharfBody.innerHTML.includes('79L'),'failure cannot leak prior month');
 let slow,fast;
 ctx.apiGetQuick=(action,args)=>new Promise(resolve=>{
   if(args.month==='2026-08')slow=resolve;
   if(args.month==='2026-07')fast=resolve;
 });
 elements.terminalMonth.value='2026-08';
 const old=api.load(true);
 elements.terminalMonth.value='2026-07';
 const next=api.load(true);
 fast({ok:true,shipMasters:[mkShip('07','2026-07-03','82L',3,4,7,8)],records:[mkRecord('07r','07','2026-07-03','08:00','09:00',3,4)]});
 await next;
 slow({ok:true,shipMasters:[mkShip('08','2026-08-03','81R',9,10,19,21)],records:[mkRecord('08r','08','2026-08-03','08:00','09:00',9,10)]});
 await old;
 assert(elements.terminalWharfBody.innerHTML.includes('82L'));
 assert(!elements.terminalWharfBody.innerHTML.includes('81R'),'stale response must not overwrite latest month');
 elements.terminalMonth.value='2026-06';
 ctx.records=[mkRecord('bad','bad','2026-06-03','08:00','09:00',2,3,[['<script>alert(1)</script>',10]])];
 ctx.shipMasters=[mkShip('bad','2026-06-03','<img src=x onerror=alert(1)>',2,3,5,6)];
 api.render();
 assert(elements.terminalStopDetailBody.innerHTML.includes('&lt;script&gt;'),'raw stop text escaped in event details');
 assert(!elements.terminalWharfBody.innerHTML.includes('<img'),'wharf escaped');
 console.log('PASS terminal ops: month-only cloud, wharf, daily, shift, stoppages, dedup, cache, race, HTML escaping');
})().catch(error=>{console.error(error);process.exitCode=1});

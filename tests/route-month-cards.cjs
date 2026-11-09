'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const from=html.indexOf('function p79RouteServiceCode(');
const to=html.indexOf('function parseWorkingSheetSummary(book){',from);
assert(from>=0&&to>from,'production route code exists');
const nodes={
 routeSearch:{value:''},
 routeMonthFilter:{value:'2026-11',dataset:{p79Year:'2026'},innerHTML:''},
 routeCardsGrid:{innerHTML:''},
 routeDataCount:{textContent:''},
 routeMonthStatus:{dataset:{},textContent:''},
 routeStatsWarning:{textContent:''},
 routeDetailPanel:{classList:{toggle(){}},},
 routeDetailTitle:{textContent:''},
 routeDetailBody:{innerHTML:''},
 routeSummaryTableBody:{innerHTML:''},
 routeSummaryTableFoot:{innerHTML:''}
};
const fixture=(no,date,serviceI,serviceE,disc,load)=>({
 workingNo:no,firstDate:date,lastDate:date,vessel:no,serviceI,serviceE,
 workingSheetSource:{disc,load}
});
const local=[
 fixture('11A','2026-11-03','FOC','JTT',10,20),
 fixture('10A','2026-10-05','CIX','CIX',100,150),
 fixture('09A','2026-09-05','HPH','HPH',17,18)
];
const remote={
 '2026-11':[fixture('11A','2026-11-03','FOC','JTT',10,20),fixture('11B','2026-11-06','FOC','FOC',5,7)],
 '2026-10':[fixture('10A','2026-10-05','CIX','CIX',100,150)]
};
const calls=[];
const ctx={
 Map,Set,String,Number,Math,Date,console,
 document:{getElementById:id=>nodes[id]},
 getPort79Year:()=>2026,
 shipMasters:local,
 shipMasterDateMatchesMonth:(s,m)=>String(s._cloudLastDate||s.lastDate||s.firstDate||'').slice(0,7)===m,
 mergeShipMasterOne:(a,b)=>({...a,...b,serviceI:b.serviceI||a.serviceI,serviceE:b.serviceE||a.serviceE}),
 esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
 GC_FULL_READ_TIMEOUT_MS:90000,
 apiGetQuick:async(action,args,budget)=>{
   calls.push({action,args,budget});
   assert.equal(action,'gcGetData');
   assert.deepEqual(Object.keys(args),['month'],'No year or full-year scope allowed');
   return {ok:true,shipMasters:remote[args.month]||[]};
 }
};
vm.createContext(ctx);
vm.runInContext(html.slice(from,to),ctx);
(async()=>{
  assert.equal(await ctx.p79LoadRouteMonth(true),true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{action:'gcGetData',args:{month:'2026-11'},budget:90000});
  assert.equal(ctx.routeDataRows().length,2);
  assert(nodes.routeCardsGrid.innerHTML.includes('FOC'));
  assert(nodes.routeCardsGrid.innerHTML.includes('JTT'));
  assert(!nodes.routeCardsGrid.innerHTML.includes('CIX'));
  assert(nodes.routeCardsGrid.innerHTML.includes('p79-route-card'));
  assert(nodes.routeCardsGrid.innerHTML.includes('日本關東－泰國航線'));
  assert(nodes.routeSummaryTableBody.innerHTML.includes('福州－廈門－台灣航線'));
  assert(nodes.routeSummaryTableBody.innerHTML.includes('日本關東－泰國航線'));
  assert(nodes.routeSummaryTableFoot.innerHTML.includes('當月合計'));
  const chineseNames=vm.runInContext("Object.entries(P79_ROUTE_CHINESE_NAMES)",ctx);
  assert.equal(chineseNames.length,9);
  for(const [code,name] of chineseNames){assert(code&&name&&!name.includes('待補'));}
  assert.equal(vm.runInContext("p79RouteChineseName('OTHER')",ctx),'中文名稱待補');
  assert(nodes.routeCardsGrid.innerHTML.includes('--route-accent:'));
  assert(nodes.routeCardsGrid.innerHTML.includes('進口艘次'));
  assert(nodes.routeCardsGrid.innerHTML.includes('總櫃數'));
  assert.equal(nodes.routeMonthStatus.dataset.state,'cloud');
  const selected=vm.runInContext('p79RouteSummaryCache.findIndex(row=>row.route==="FOC")',ctx);
  ctx.p79SelectRoute(selected);
  assert(nodes.routeDetailTitle.textContent.includes('2026-11'));
  assert(nodes.routeDetailBody.innerHTML.includes('11A'));
  nodes.routeSearch.value='日本關東';
  ctx.renderRouteData();
  assert(nodes.routeCardsGrid.innerHTML.includes('JTT'));
  assert(!nodes.routeCardsGrid.innerHTML.includes('FOC'));
  assert(nodes.routeSummaryTableBody.innerHTML.includes('日本關東－泰國航線'));
  nodes.routeSearch.value='';
  ctx.renderRouteData();
  assert(!nodes.routeDetailBody.innerHTML.includes('10A'));
  nodes.routeMonthFilter.value='2026-10';
  assert.equal(await ctx.p79LoadRouteMonth(true),true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1])),{action:'gcGetData',args:{month:'2026-10'},budget:90000});
  assert.equal(ctx.routeDataRows().length,1);
  assert(nodes.routeCardsGrid.innerHTML.includes('CIX'));
  assert(nodes.routeSummaryTableBody.innerHTML.includes('中國－印度快線'));
  assert(!nodes.routeSummaryTableBody.innerHTML.includes('日本關東－泰國航線'));
  assert(!nodes.routeCardsGrid.innerHTML.includes('FOC'));
  assert(nodes.routeDetailPanel.classList);
  nodes.routeMonthFilter.value='2026-09';
  ctx.apiGetQuick=async()=>{throw Error('伺服器無法連線')};
  assert.equal(await ctx.p79LoadRouteMonth(true),false);
  assert.equal(nodes.routeMonthStatus.dataset.state,'local');
  assert(nodes.routeMonthStatus.textContent.includes('當月本機快取'));
  assert(nodes.routeCardsGrid.innerHTML.includes('HPH'));
  assert(!nodes.routeCardsGrid.innerHTML.includes('CIX'));
  let resolveFirst,resolveLast;
  ctx.apiGetQuick=(action,args)=>new Promise(resolve=>{
    if(args.month==='2026-08')resolveFirst=resolve;
    if(args.month==='2026-07')resolveLast=resolve;
  });
  nodes.routeMonthFilter.value='2026-08';
  const first=ctx.p79LoadRouteMonth(true);
  nodes.routeMonthFilter.value='2026-07';
  const last=ctx.p79LoadRouteMonth(true);
  resolveLast({ok:true,shipMasters:[fixture('07A','2026-07-03','JST','JST',8,9)]});
  await last;
  resolveFirst({ok:true,shipMasters:[fixture('08A','2026-08-03','JSV','JSV',9,10)]});
  await first;
  assert.equal(vm.runInContext('p79RouteMonthLoadedKey',ctx),'2026-07','slow earlier response must not overwrite newest month');
  assert(nodes.routeCardsGrid.innerHTML.includes('JST'));
  assert(!nodes.routeCardsGrid.innerHTML.includes('JSV'));
  assert(html.includes('grid-template-columns:repeat(3,minmax(0,1fr))'));
  assert(html.includes('@media(max-width:670px)'));
  assert(!html.includes('id="routeDataBody"'));
  console.log('PASS route monthly cloud scope, colored responsive cards, search detail isolation, error fallback, and out-of-order month safety');
})().catch(error=>{console.error(error);process.exitCode=1;});

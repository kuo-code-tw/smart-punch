'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const home=fs.readFileSync('index.html','utf8');
function fn(n){const a=html.indexOf('function '+n+'(');assert(a>=0,n);const b=html.indexOf('\n}',a);assert(b>a,'body '+n);return html.slice(a,b+2)}
const fake={
  routeSearch:{value:''},routeDataBody:{innerHTML:''},routeDataCount:{textContent:''},
  routeMonthFilter:{value:'',innerHTML:''},routeStatsWarning:{textContent:''},
  routeDetailPanel:{classList:{toggle(){}}},routeDetailTitle:{textContent:''},
  routeDetailBody:{innerHTML:''}
};
const c={
  console,Date,Map,Set,Number,String,shipManualOverrideCache:{},shipOverrideKey:s=>s.workingNo,
  XLSX:{utils:{sheet_to_json:ws=>ws}},
  document:{getElementById:id=>fake[id]},
  shipMasters:[],p79RouteSelected:'',p79RouteSummaryCache:[],getPort79Year:()=>2026,
  shipMasterDateMatchesYear:s=>s.firstDate?.startsWith('2026'),
  shipMasterDateMatchesMonth:(s,m)=>String(s.compareMonth||s.firstDate||'').startsWith(m),
  esc:v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
  num:v=>Number(v)||0,
};
vm.createContext(c);
for(const n of [
  'parseWorkingSheetService','p79RouteServiceCode','p79RouteQuantity','routeStatsForShips',
  'p79RouteMonthOptions','routeDataRows','renderRouteData','mergeShipMasterOne'
]) vm.runInContext(fn(n),c);
const parse=rows=>JSON.parse(JSON.stringify(c.parseWorkingSheetService(rows)));
assert.deepEqual(parse([['SERVICE(I/E):','','FOC','','JTT']]),{serviceI:'FOC',serviceE:'JTT'});
assert.deepEqual(parse([['SERVICE ( I / E )： ABC-7 / XYZ9']]),{serviceI:'ABC-7',serviceE:'XYZ9'});
assert.deepEqual(parse([['SERVICE(I/E):','','NEW99']]),{serviceI:'NEW99',serviceE:'NEW99'});
assert.deepEqual(parse([['SERVICE(I/E):','','WHARF NO.:','79']]),{serviceI:'',serviceE:''});
assert.deepEqual(parse([['VOYAGE(I/E):','N1','S2']]),{serviceI:'',serviceE:''});
const local={workingNo:'526001',serviceI:'ABC',serviceE:'XYZ',workingSheetSource:{importedAt:'2026-11-09T00:00:00Z',serviceI:'ABC',serviceE:'XYZ'}};
const cloud={workingNo:'526001',serviceI:'OLD',serviceE:'OLD',workingSheetSource:{importedAt:'2026-11-08T00:00:00Z',serviceI:'OLD',serviceE:'OLD'}};
const merged=c.mergeShipMasterOne(local,cloud);
assert.equal(merged.serviceI,'ABC');
assert.equal(merged.serviceE,'XYZ');
c.shipMasters=[
  {...JSON.parse(JSON.stringify(merged)),firstDate:'2026-11-01',vessel:'<script>test</script>',disc:10,load:20},
  {workingNo:'526002',firstDate:'2026-11-02',vessel:'B',serviceI:'FOC',serviceE:'JTT',workingSheetSource:{disc:3,load:4}},
  {workingNo:'526003',firstDate:'2026-11-02',vessel:'C',serviceI:'FOC',serviceE:'FOC',workingSheetSource:{disc:5,load:6}}
];
const rows=JSON.parse(JSON.stringify(c.routeStatsForShips(c.shipMasters)));
const by=Object.fromEntries(rows.map(r=>[r.route,r]));
assert.equal(by.FOC.importCalls,2);
assert.equal(by.FOC.exportCalls,1);
assert.equal(by.FOC.disc,8);
assert.equal(by.FOC.load,6);
assert.equal(by.JTT.exportCalls,1);
assert.equal(by.JTT.load,4);
c.renderRouteData();
assert(fake.routeDataBody.innerHTML.includes('ABC'));
assert(fake.routeDataBody.innerHTML.includes('FOC'));
assert(!fake.routeDataBody.innerHTML.includes('<script>'));
fake.routeSearch.value='foc';c.renderRouteData();
assert(!fake.routeDataBody.innerHTML.includes('>ABC<'));
assert.equal(fake.routeDataCount.textContent,'航線 1 條｜進口 2 艘次｜出口 1 艘次');
assert(!html.includes('compareMonthlyExcel'));
assert(!html.includes('parseMonthlyActualRows'));
assert(!html.includes('monthlyPasteBox'));
assert(!html.includes('compareExcelInput'));
assert(html.includes('workingNo,vessel,voyageI,voyageE,wharf,serviceI,serviceE'));
assert(html.includes("serviceI:summary.serviceI||''"));
assert(home.includes("launchSystem('efficiency')"));
assert(html.includes("showGcAccessDenied(!gcToken"));
assert(!html.includes("returnToPort79Home('此帳號沒有「效率系統」權限"));
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
console.log('PASS SERVICE I/E routes and per-direction statistics, old-row migration, SSO navigation guard, HTML syntax');

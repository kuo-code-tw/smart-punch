'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function extract(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Missing production function: '+start);
  return html.slice(a,b);
}
const route=vm.runInNewContext(extract('function p79RouteServiceCode(','let p79RouteSelected=')+
  '\n({routeStatsForShips,p79RouteServiceCode,p79RouteQuantity})');
const ships=[
 {workingNo:'101',vessel:'A',serviceI:'FOC',serviceE:'JTT',workingSheetSource:{disc:10,load:20}},
 {workingNo:'102',vessel:'B',workingSheetSource:{serviceI:'FOC',serviceE:'FOC',disc:5,load:7}},
 {workingNo:'103',vessel:'C',workingSheetSource:{disc:2,load:3}},
 {workingNo:'104',vessel:'D',workingSheetSource:{serviceI:'FEA',serviceE:'FOC',load:2}},
 {workingNo:'101',vessel:'A',serviceI:'FOC',serviceE:'JTT',workingSheetSource:{disc:10,load:20}}
];
const stats=route.routeStatsForShips(ships),by=Object.fromEntries(stats.map(x=>[x.route,x]));
assert.equal(stats.length,4);
assert.equal(by.FOC.importCalls,2);
assert.equal(by.FOC.exportCalls,2);
assert.equal(by.FOC.disc,15);
assert.equal(by.FOC.load,9);
assert.equal(by.JTT.exportCalls,1);
assert.equal(by.JTT.load,20);
assert.equal(by.FEA.importCalls,1);
assert.equal(by.FEA.missingDisc,1);
assert.equal(by['未分類'].importCalls,1);
assert.equal(by['未分類'].exportCalls,1);
assert.equal(by['未分類'].total,5);
assert.equal(stats.at(-1).route,'未分類');
const XLSX={utils:{sheet_to_json:sheet=>sheet.rows}};
const parse=vm.runInNewContext(extract('function parseWorkingSheetService(ws){','function p79RouteServiceCode(')+
  '\nparseWorkingSheetService',{XLSX});
for(const [rows,serviceI,serviceE] of [
 [[['SERVICE(I/E):','FOC','JTT']],'FOC','JTT'],
 [[['SERVICE (I / E)：FOC / JTT']],'FOC','JTT'],
 [[['SERVICE(I/E):','FOC']],'FOC','FOC'],
 [[['SERVICE(I):','FOC'],['SERVICE(E):','JTT']],'FOC','JTT'],
 [[['SERVICE(I/E):','','VOYAGE(I/E):','N100']],'',''],
 [[['M/V.','WAN HAI 103'],['SERVICE(I/E):','','FOC/JTT']],'FOC','JTT']
]) {
  const actual=parse({rows});
  assert.deepEqual([actual.serviceI,actual.serviceE],[serviceI,serviceE]);
}
assert.match(html,/id="routeMonthFilter"/);
assert.match(html,/serviceI:String\(summary\.serviceI\|\|''\)/);
assert.doesNotMatch(html,/<th>進口航線 SERVICE\(I\)<\/th>/);
const disclosure=extract('<details id="routeSummaryDisclosure"','<p id="routeStatsWarning"');
assert.match(disclosure,/^<details id="routeSummaryDisclosure" class="p79-route-list">/);
assert.doesNotMatch(disclosure.split('>')[0],/\\bopen\\b/,'Route table starts collapsed');
assert.match(disclosure,/<summary class="p79-route-list-head">[\\s\\S]*航線對照統計表[\\s\\S]*<\\/summary>/);
assert.match(disclosure,/id="routeSummaryTableBody"/,'Rows remain mounted and update while collapsed');
assert.match(disclosure,/id="routeSummaryTableFoot"/,'Monthly totals remain available when expanded');
assert.match(disclosure,/p79-route-expand-label">展開/);
assert.match(disclosure,/p79-route-collapse-label">收合/);
assert.match(html,/#view-compare \\.p79-route-list-head:focus-visible/,'Keyboard focus remains visible');
assert.ok(html.indexOf('id="routeDetailPanel"')>html.indexOf('</details>',html.indexOf('id="routeSummaryDisclosure"')),'Ship details stay independent of the collapse');
console.log('PASS route-service-summary: I/E grouping, quantities, duplicate prevention, missing values, SERVICE parser, default-collapsed table disclosure');

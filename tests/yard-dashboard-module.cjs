/* Run: node tests/yard-dashboard-module.cjs
 * Uses synthetic values only; actual private yard figures must never be committed.
 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'yard-dashboard/yard-dashboard.js'),'utf8');
const html=fs.readFileSync(path.join(root,'yard-dashboard/index.html'),'utf8');
const page=fs.readFileSync(path.join(root,'aqc-efficiency/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'yard-dashboard/yard-dashboard.css'),'utf8');
const matrix=Array.from({length:77},()=>Array(3).fill(null));
const mockSheet={matrix},window={
 document:{readyState:'loading',addEventListener:()=>{}},
 XLSX:{SSF:{parse_date_code:v=>null},utils:{sheet_to_json:s=>s.matrix}},
};
vm.runInNewContext(source,{window,console},{timeout:5000});
const api=window.P79YardDashboard;
assert.ok(api,'Yard API missing');
const f=api.fieldRows;
assert.ok(Object.keys(f).length>40,'Missing source workbook fields');
const r=Object.fromEntries(Object.keys(f).map(k=>[k,0]));
Object.assign(r,{
 date:'2026-11-13',
 imp20:100,imp40:10,impTeu:120,
 exp20:100,exp40:20,expTeu:140,
 trans20:100,trans40:30,transTeu:160,
 reefer20:50,reefer40:10,reeferTeu:70,
 heavyTotal:490,heavyCap:1000,heavyPct:49,
 heavyPlug20Cap:200,heavyPlug40Cap:100,heavyPlug20Pct:25,heavyPlug40Pct:10,
 genEmpty20:30,genEmpty40:20,genEmptyTeu:70,
 reeferEmpty20:10,reeferEmpty40:10,reeferEmptyTeu:30,
 emptyTotal:100,emptyCap:500,emptyPct:20,
 pti20Cap:60,pti40Cap:180,
 longImp20:10,longImp40:0,longImpTeu:10,
 longExp20:0,longExp40:10,longExpTeu:20,
 longTrans20:10,longTrans40:10,longTransTeu:30,longTotal:60,
 specialHeavy20:3,specialHeavy40:2,specialHeavyCount:5,specialHeavyTeu:7
});
assert.doesNotThrow(()=>api.validateRecord(r));
assert.throws(()=>api.validateRecord({...r,heavyTotal:491}),/不一致/);
assert.throws(()=>api.validateRecord({...r,heavyPct:55}),/不一致/);
assert.throws(()=>api.validateRecord({...r,emptyTotal:110}),/不一致/);
assert.throws(()=>api.validateRecord({...r,longTotal:50}),/不一致/);
matrix[0][2]='2026-11-13';matrix[1][0]='重櫃';matrix[2][0]='進口櫃';matrix[28][0]='空櫃';matrix[76][0]='Long-Stay合計';
for(const [key,row] of Object.entries(f))matrix[row-1][2]=r[key];
const parsed=api.parseBook({SheetNames:['Yard'],Sheets:{Yard:mockSheet}});
assert.equal(parsed.length,1);assert.equal(parsed[0].heavyTotal,490);
assert.equal(parsed[0].longTotal,60);
assert.throws(()=>{matrix[19][2]=999;api.parseBook({SheetNames:['Yard'],Sheets:{Yard:mockSheet}}) },/不一致/);
// Zero-stock dates must not create an invalid conic gradient or a NaN share.
assert.equal(api.donutGradient([{label:'進口',value:0}],0),'#e1ebfa');
assert.match(api.donutGradient([{label:'進口',value:0},{label:'出口',value:7}],7),/#ff861c 0\.0000% 100\.0000%/,'second category must retain its legend color');
const normal={...r,heavyTotal:490,heavyCap:1000,emptyTotal:100,emptyCap:500};
assert.equal(api.alertNotices(normal,[normal]).length,0,'normal yard capacity has no alerts');
const overCapacity={...normal,heavyTotal:1001,emptyTotal:501};
const warning=api.alertNotices(overCapacity,[overCapacity]);
assert.ok(warning.some(s=>s.includes('重櫃場存')&&s.includes('超過容量')));
assert.ok(warning.some(s=>s.includes('空櫃場存')&&s.includes('超過容量')));
assert.match(source,/r\.heavyTotal>0\?pct\(r\.longTotal\/r\.heavyTotal\*100\):'—'/,'zero heavy stock renders an undefined Long-Stay share as a dash');
// Axis scale follows real TEU inventory rather than a 3,000-TEU minimum.
assert.equal(api.trendAxisMax([{heavyTotal:100,emptyTotal:40}]),100);
assert.equal(api.trendAxisMax([{heavyTotal:490,emptyTotal:100}]),500);
assert.equal(api.trendAxisMax([{heavyTotal:5200,emptyTotal:2000}]),6000);
assert.equal(api.trendAxisMax([{heavyTotal:0,emptyTotal:0}]),1);
const trend=api.trendSvg([{date:'2026-11-12',heavyTotal:50,emptyTotal:20},{date:'2026-11-13',heavyTotal:100,emptyTotal:40}]);
assert.match(trend,/>TEU<\/text>/);
assert.doesNotMatch(trend,/>3,000<\/text>/,'small inventory cannot be flattened by a fixed 3,000 TEU axis');
assert.match(html,/當日櫃別明細/,'historical selector must not label all dates as today');
assert.match(html,/yard-dashboard\.js\?v=20261113-allowed-count-v1/,'new dashboard script must invalidate old cache');
assert.match(page,/20261113-yard-allowed-count-v1/,'embedded iframe must invalidate old page cache');
// Consistent product naming and center alignment across all history tables.
assert.match(html,/<title>碼頭儲位管理｜/);
assert.match(html,/<h1>碼頭儲位管理<\/h1>/);
assert.match(html,/aria-label="碼頭儲位管理分頁"/);
assert.doesNotMatch(html,/堆場儲位管理/);
assert.match(page,/data-tab="yard"[^>]*>▥ 碼頭儲位管理/);
assert.match(page,/aria-label="碼頭儲位管理"/);
assert.match(page,/title="碼頭儲位管理：/);
assert.doesNotMatch(page,/堆場儲位管理/);
assert.match(css,/\.yard-history-table th\{[^}]*text-align:center;[^}]*\}/,'history headings align center');
assert.match(css,/\.yard-history-table td\{[^}]*text-align:center;[^}]*\}/,'historical values and dates align center');
assert.doesNotMatch(css,/\.yard-history-table td:first-child\{text-align:left\}/,'date cannot override center alignment');
assert.match(html,/yard-dashboard\.css\?v=20261113-allowed-count-v1/,'updated CSS must invalidate cache');
assert.match(source,/STORAGE_PREFIX/);
assert.doesNotMatch(source,/window\.P79YardSeed|yard-seed\.js/);
assert.match(html,/yardHeavyDonut/);assert.match(html,/yardEmptyDonut/);
assert.match(html,/yardPlugRows/);assert.match(html,/yardTrendChart/);
assert.match(page,/data-tab="yard"/);assert.match(page,/p79YardDashboardFrame/);
assert.match(page,/name==='yard'/);
console.log('PASS yard: formula integrity, workbook mapping, privacy, chart targets and lazy vessel-tab integration');
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const terminal=fs.readFileSync('aqc-efficiency/terminal-ops.js','utf8');
const rods=fs.readFileSync('aqc-efficiency/terminal-rod-overview.js','utf8');
const css=fs.readFileSync('aqc-efficiency/terminal-rod-overview.css','utf8');
assert(html.includes('id="terminalRodOverviewMount"'),'overview anchor in live tab');
assert(html.includes('terminal-rod-overview.js?v=20261111-hc-bundle-v2'),'versioned JS loaded');
assert(html.includes('terminal-rod-overview.css?v=20261111-hc-bundle-v1'),'versioned CSS loaded');
assert(css.includes('gap:16px;align-items:stretch}'),'desktop berth card grid stretches both cards equally');
assert(css.includes('.p79-rod-card{display:flex;flex-direction:column;'),'both cards are vertical flex containers');
assert(css.includes('.p79-rod-scroll{display:flex;flex:1 1 auto;'),'table region grows to equalize card height');
assert(css.includes('.p79-rod-table{border-collapse:collapse;width:100%;height:100%;'),'table including the subtotal stays bottom-aligned');
assert(css.includes('@media (max-width:950px){#view-terminal .p79-rod-cards{grid-template-columns:1fr}}'),'small screen remains one card per row');
assert(html.includes('p79-ter-legacy-wharf'),'legacy comparison data kept for audits');
assert(terminal.includes('root.P79TerminalRodOverview?.render(stats,state);'),'overview called after current month build');
assert(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'),'two cards side-by-side on desktop');
const context={window:{},console:{warn(){}},document:{getElementById:()=>null},
  shipMasterDateMatchesMonth:(s,m)=>String(s.lastDate||'').startsWith(m)};
vm.createContext(context);
vm.runInContext(terminal,context);
vm.runInContext(rods,context);
const api=context.window.P79TerminalOps,overview=context.window.P79TerminalRodOverview;
assert.deepEqual(Array.from(overview.RODS['79']),['AQC7901','AQC7902','AQC7903','AQC7905']);
assert.deepEqual(Array.from(overview.RODS['80']),['AQC8001','AQC8002','AQC8003','AQC8005','AQC8006']);
assert.equal(overview.craneOf({number:'AQC7904'}),'','exclude 7904');
assert.equal(overview.craneOf({number:'8004'}),'','exclude 8004');
assert.equal(overview.craneOf({number:'7901 / 7902'}),'','ambiguous multi-rod record never double-counted');
assert.equal(overview.portOf('79L'),'79');
assert.equal(overview.portOf('80R'),'80');
const ship=(no,wharf,disc,load,total)=>({workingNo:no,wharf,lastDate:'2026-11-05',totalContainers:total,totalMoves:total+3,
  workingSheetSource:{disc,load}});
const row=(id,no,crane,disc,load)=>({id,workingNo:no,workDate:'2026-11-05',source:'working-report',
  number:crane,disc,load,startTime:'08:00',endTime:'09:00'});
const ships=[ship('001','79L',1019,923,1942),ship('002','80R',1482,1282,2764)];
const records=[
 row('a','001','7901',368,334),row('b','001','AQC7902',651,589),
 row('c','002','8001',425,411),row('d','002','8002',362,330),
 row('e','002','8003',644,592),row('e','002','8003',644,592)
];
const result=overview.calculate(api.build('2026-11',ships,records));
assert.equal(result.ports['79'].ships,1,'one ship at 79');
assert.equal(result.ports['80'].ships,1,'one ship at 80');
assert.equal(result.ports['79'].rods.length,4);
assert.equal(result.ports['80'].rods.length,5);
assert.equal(result.ports['79'].rodQuantity,1942,'79 per-rod DISC+LOAD aggregation');
assert.equal(result.ports['79'].rods.find(x=>x.name==='AQC7901').hcValue,null,'Missing AQC hatch data is unknown, never a fake zero');
assert(rods.includes('艙蓋 H/C'),'live crane table provides H/C column');
assert(rods.includes('terminalPort'+"'+code+'"+'BundleInfo'),'Bundle origins displayed separately for each berth');
assert(css.includes('p79-rod-bundle-origin'),'Bundle origin strip styled');
assert(!html.includes('id="terminalRodOverviewFold"'),'crane table always visible');
assert.equal(result.ports['80'].rodQuantity,2764,'80 deduplicated per-rod aggregation');
assert.equal(result.ports['79'].noRecords,2,'7903 and 7905 missing, not assumed zero');
assert.equal(result.ports['80'].noRecords,2,'8005 and 8006 missing, not assumed zero');
assert.equal(result.ports['79'].rods.find(x=>x.name==='AQC7903').quantity,null);
const incomplete=overview.calculate(api.build('2026-11',ships,[row('x','001','7901',6,null)]));
assert.equal(incomplete.ports['79'].needsReview,1,'partial data must be reviewed');
assert.equal(incomplete.ports['79'].rods[0].quantity,null,'no false aggregate when LOAD missing');
const conflict=overview.calculate(api.build('2026-11',ships,[row('y','002','AQC7901',6,7)]));
assert.equal(conflict.conflicts,1,'conflicting berth and crane mapping rejected');
console.log('PASS dual AQC cards: 4+5 whitelisted cranes, dedup, records, null, conflict, markup');

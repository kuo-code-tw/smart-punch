/* Real homepage Yard doughnut rendering from synthetic private-only Excel records. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const start=html.indexOf('function canViewHomeYard(session)'),end=html.indexOf('function launchSystem(target)',start);
assert.ok(start>0&&end>start,'real home presenter block remains accessible');
const source=html.slice(start,end);
const fixture={
 date:'2026-11-13',heavyTotal:10349,heavyCap:19200,emptyTotal:1926.25,emptyCap:5350,
 imp20:50,imp40:30,exp20:30,exp40:20,trans20:10,trans40:8,
 reefer20:10,reefer40:2,genEmpty20:60,genEmpty40:20,reeferEmpty20:4,reeferEmpty40:1
};
const session={adminRole:'admin',empId:'TEST-ADMIN',systemPermissions:{efficiency:'view'}};
const datasetKey='p79_yard_private_v1_TEST-ADMIN';
const allowanceKey='p79_yard_allowed_container_counts_v1_TEST-ADMIN';
function build({record=fixture,allowed=null,authorized=true}={}){
 const elements=new Map(),memory=new Map();
 let reads=0;
 if(record)memory.set(datasetKey,JSON.stringify({rows:[record],fileName:'yard.xlsx'}));
 if(allowed)memory.set(allowanceKey,JSON.stringify(allowed));
 const node=id=>{
  if(!elements.has(id))elements.set(id,{
   textContent:'',hidden:false,style:{},attributes:{},
   setAttribute(name,value){this.attributes[name]=value;}
  });
  return elements.get(id);
 };
 const context={window:{addEventListener(){}},document:{getElementById:node},
  getToken:()=>authorized?'VALID-TOKEN':'',$:node,console,
  YARD_HOME_STORAGE_PREFIX:'p79_yard_private_v1_',YARD_HOME_ALLOWED_PREFIX:'p79_yard_allowed_container_counts_v1_',
  localStorage:{getItem:key=>{reads++;return memory.get(key)||null;}}
 };
 vm.createContext(context);
 vm.runInContext(source,context,{timeout:5000});
 return {node,memory,context,reads:()=>reads};
}
const ids=['p79HomeYardPanel','p79HomeYardHeavyRing','p79HomeYardEmptyRing','p79HomeYardReeferRing',
 'p79HomeYardHeavyChartPct','p79HomeYardEmptyChartPct','p79HomeYardReeferChartPct','p79HomeYardReeferCapTotal',
 'p79HomeYardHeavyCount','p79HomeYardEmptyCount','p79HomeYardReeferCount'];
for(const id of ids)assert.match(html,new RegExp('id="'+id+'"'),'must include '+id);
assert.match(html,/class="p79-yard-kpis"/);
assert.match(html,/class="p79-yard-panels"/);
assert.match(html,/\.p79-yard-kpis\{grid-template-columns:repeat\(5,minmax\(0,1fr\)\)\}/,'five compact KPI cards on wide screens');
assert.match(html,/@media\(max-width:1400px\)/,'responsive card layout');
for(const id of ['p79HomeYardEmptyCapTop','p79HomeYardEmptyCapacitySize20Count','p79HomeYardEmptyCapacitySize40Teu','p79HomeYardEmptyCapacitySize45Teu','p79HomeYardEmptyCapacitySizeReefer20Count','p79HomeYardEmptyCapacitySizeReefer40Count'])
 assert.match(html,new RegExp('id="'+id+'"'),'empty-capacity card includes '+id);
assert.match(html,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
assert.match(html,/@media\(max-width:1180px\)/);
assert.match(html,/@media\(max-width:620px\)/);
assert.match(html,/p79-yard-donut-center/);
assert.doesNotMatch(html,/p79-home-yard-grid/,'old seven oversized KPI layout should be gone');
assert.match(html,/20／40 呎換算/,'correct cargo-container unit 呎');

const b=build();
b.context.renderHomeYardSummary(session);
assert.equal(b.node('p79HomeYardDate').textContent,'2026-11-13');
assert.equal(b.node('p79HomeYardHeavy').textContent,'10,349');
assert.equal(b.node('p79HomeYardEmpty').textContent,'1,926.25');
assert.equal(b.node('p79HomeYardHeavyCap').textContent,'19,200');
assert.equal(b.node('p79HomeYardEmptyCap').textContent,'5,350');
assert.equal(b.node('p79HomeYardEmptyCapTop').textContent,'5,350','empty card uses actual imported emptyCap');
assert.equal(b.node('p79HomeYardHeavyChartPct').textContent,'53.90%');
assert.equal(b.node('p79HomeYardEmptyChartPct').textContent,'36.00%');
assert.equal(b.node('p79HomeYardHeavyUsed').textContent,'10,349 TEU');
assert.equal(b.node('p79HomeYardHeavyFree').textContent,'8,851 TEU');
assert.equal(b.node('p79HomeYardHeavyCapTotal').textContent,'19,200 TEU');
assert.equal(b.node('p79HomeYardEmptyFree').textContent,'3,423.75 TEU');
assert.match(b.node('p79HomeYardHeavyRing').style.background,/conic-gradient/);
assert.match(b.node('p79HomeYardEmptyRing').attributes['aria-label'],/使用率 36.00%/);
assert.equal(b.node('p79HomeYardReeferTop').textContent,'17');
assert.equal(b.node('p79HomeYardReeferTopTeu').textContent,'20');
assert.equal(b.node('p79HomeYardHeavySize20Count').textContent,'100 櫃');
assert.equal(b.node('p79HomeYardHeavySize20Teu').textContent,'100 TEU');
assert.equal(b.node('p79HomeYardHeavySize40Count').textContent,'60 櫃');
assert.equal(b.node('p79HomeYardHeavySize40Teu').textContent,'120 TEU');
assert.equal(b.node('p79HomeYardHeavySize45Count').textContent,'—','45ft must not be fabricated from 40ft');
assert.equal(b.node('p79HomeYardHeavySizeTotalTeu').textContent,'220 TEU');
assert.equal(b.node('p79HomeYardEmptySize20Count').textContent,'64 櫃');
assert.equal(b.node('p79HomeYardEmptySize40Teu').textContent,'42 TEU');
assert.equal(b.node('p79HomeYardReeferSize20Count').textContent,'14 櫃');
assert.equal(b.node('p79HomeYardReeferSize40Teu').textContent,'6 TEU');
assert.equal(b.node('p79HomeYardReeferSizeTotalTeu').textContent,'20 TEU');
assert.equal(b.node('p79HomeYardReeferUsed').textContent,'20 TEU');
assert.equal(b.node('p79HomeYardReeferCapTotal').textContent,'未設定');
assert.equal(b.node('p79HomeYardReeferChartPct').textContent,'—','never fabricate reefer occupancy without a valid cap');
assert.match(b.node('p79HomeYardReeferRing').attributes['aria-label'],/上限未設定/);
assert.equal(b.node('p79HomeYardHeavyWarning').hidden,true);
assert.match(b.node('p79HomeYardSource').textContent,/yard.xlsx/);

const withLimit=build({allowed:{heavy:200,empty:100,reefer:14,reeferTeu:32}});
withLimit.context.renderHomeYardSummary(session);
assert.equal(withLimit.node('p79HomeYardReeferChartPct').textContent,'62.50%');
assert.equal(withLimit.node('p79HomeYardReeferFree').textContent,'12 TEU');
assert.equal(withLimit.node('p79HomeYardReeferCapTotal').textContent,'32 TEU');
assert.match(withLimit.node('p79HomeYardReeferRing').style.background,/#8046c8/);
assert.match(withLimit.node('p79HomeYardReeferLimit').textContent,/超出 3 櫃/);
assert.equal(withLimit.node('p79HomeYardHeavy').textContent,'10,349','limits never overwrite source inventory');

const withSizes=build({allowed:{heavy20:400,heavy40:500,heavy45:12,reefer20:10,reefer40:15}});
withSizes.context.renderHomeYardSummary(session);
assert.equal(withSizes.node('p79HomeYardCapacitySize20Count').textContent,'400 櫃');
assert.equal(withSizes.node('p79HomeYardCapacitySize40Teu').textContent,'1,000 TEU');
assert.equal(withSizes.node('p79HomeYardCapacitySize45Teu').textContent,'24 TEU','45ft capacity uses 2 TEU');
assert.equal(withSizes.node('p79HomeYardCapacitySizeReefer40Teu').textContent,'30 TEU');
assert.equal(withSizes.node('p79HomeYardHeavyCap').textContent,'19,200','manual size caps do not alter imported Excel capacity');
assert.equal(withSizes.node('p79HomeYardEmptyCapTop').textContent,'5,350','heavy limit does not alter empty Excel capacity');
assert.equal(withSizes.node('p79HomeYardEmptyCapacitySize20Count').textContent,'—','unconfigured empty capacity is unknown');
assert.equal(withSizes.node('p79HomeYardEmptyCapacitySizeReefer20Count').textContent,'—','shared reefer quota is not automatically empty-only');
const withEmptySizes=build({allowed:{empty20:420,empty40:210,empty45:17,reefer20:9,reefer40:6}});
withEmptySizes.context.renderHomeYardSummary(session);
assert.equal(withEmptySizes.node('p79HomeYardEmptyCapTop').textContent,'5,350','Excel empty capacity remains authoritative');
assert.equal(withEmptySizes.node('p79HomeYardEmptyCapacitySize20Count').textContent,'420 櫃');
assert.equal(withEmptySizes.node('p79HomeYardEmptyCapacitySize20Teu').textContent,'420 TEU');
assert.equal(withEmptySizes.node('p79HomeYardEmptyCapacitySize40Count').textContent,'210 櫃');
assert.equal(withEmptySizes.node('p79HomeYardEmptyCapacitySize40Teu').textContent,'420 TEU');
assert.equal(withEmptySizes.node('p79HomeYardEmptyCapacitySize45Count').textContent,'17 櫃');
assert.equal(withEmptySizes.node('p79HomeYardEmptyCapacitySize45Teu').textContent,'34 TEU','45ft uses two TEU');
assert.equal(withEmptySizes.node('p79HomeYardEmptyCapacitySizeReefer20Teu').textContent,'—','shared reefer allowance is not an empty-only quota');
const over=build({allowed:{heavy:300,empty:200,reefer:20,reeferTeu:12}});
over.context.renderHomeYardSummary(session);
assert.equal(over.node('p79HomeYardReeferChartPct').textContent,'166.67%','do not hide over-100 utilization');
assert.equal(over.node('p79HomeYardReeferFree').textContent,'0 TEU');
assert.equal(over.node('p79HomeYardReeferWarning').hidden,false);
assert.match(over.node('p79HomeYardReeferWarning').textContent,/超出容量 8 TEU/);
assert.match(over.node('p79HomeYardReeferRing').style.background,/360deg/,'visual arc is clamped at full circle');

const missing=build({record:null});
missing.context.renderHomeYardSummary(session);
assert.equal(missing.node('p79HomeYardHeavy').textContent,'—');
assert.equal(missing.node('p79HomeYardEmptyCapTop').textContent,'—');
assert.equal(missing.node('p79HomeYardEmptyCapacitySize45Teu').textContent,'—');
assert.equal(missing.node('p79HomeYardHeavyChartPct').textContent,'—');
assert.equal(missing.node('p79HomeYardReeferChartPct').textContent,'—');
assert.match(missing.node('p79HomeYardSource').textContent,/尚未在本瀏覽器匯入/);
const forbidden=build({authorized:false});
forbidden.context.renderHomeYardSummary(session);
assert.equal(forbidden.reads(),0,'do not read private Yard data without authenticated management permission');
assert.match(forbidden.node('p79HomeYardSource').textContent,/僅有權限的管理員/);
console.log('PASS Yard homepage doughnuts: compact layout, real TEU ratios, 20/40ft reefer conversion, no-limit neutrality, warnings and auth');

/* Synthetic-only regression for homepage Yard summary and manual daily capacity.
 * Run: node tests/yard-home-manual-capacity.cjs
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const yard=fs.readFileSync(path.join(root,'yard-dashboard/yard-dashboard.js'),'utf8');
const html=fs.readFileSync(path.join(root,'yard-dashboard/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'yard-dashboard/yard-dashboard.css'),'utf8');
const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
const parent=fs.readFileSync(path.join(root,'aqc-efficiency/index.html'),'utf8');

assert.match(home,/id="cardYard"[^>]*onclick="launchSystem\('yard'\)"[^>]*hidden/,'homepage contains permission-hidden Yard card');
assert.match(home,/id="p79HomeYardPanel"[^>]*hidden/,'homepage summary is initially hidden');
assert.match(home,/function canViewHomeYard\(session\)/);
assert.match(home,/if\(target==='yard'\)\{\s*if\(!canViewHomeYard\(currentSession\)\)return;/,'Yard entry is permission gated');
assert.match(home,/YARD_HOME_PATH='\.\/*yard-dashboard\/\?v=/);
assert.match(home,/id="p79HomeYardHeavyCap"/);
assert.match(home,/id="p79HomeYardEmptyCap"/);
assert.match(html,/id="yardManualHeavyCap"/);
assert.match(html,/id="yardManualEmptyCap"/);
assert.match(html,/id="yardCapacitySave"/);
assert.match(html,/id="yardCapacityReset"/);
assert.match(html,/id="yardEmptyCap"/,'show empty storage capacity to the right of existing KPIs');
assert.match(css,/\.yard-capacity-inline/);
assert.match(html,/yard-dashboard\.js\?v=20261113-manualcap-v1/);
assert.match(html,/yard-dashboard\.css\?v=20261113-manualcap-v1/);
assert.match(parent,/20261113-yard-manualcap-v1/,'embedded Yard cache updated');

const record=(date='2026-11-13')=>{
 const fake={document:{readyState:'loading',addEventListener(){}},XLSX:{SSF:{parse_date_code(){return null}}}};
 vm.runInNewContext(yard,{window:fake,console},{timeout:5000});
 const fields=fake.P79YardDashboard.fieldRows;
 const row=Object.fromEntries(Object.keys(fields).map(k=>[k,0]));
 return Object.assign(row,{date,imp20:10,impTeu:10,heavyTotal:10,heavyCap:100,heavyPct:10,
    heavyPlug20Cap:10,heavyPlug40Cap:10,pti20Cap:10,pti40Cap:10,
    genEmpty20:20,genEmptyTeu:20,emptyTotal:20,emptyCap:100,emptyPct:20});
};
const base=record();
function mockBrowser({authorized=true,initialData=[base]}={}){
 const nodes=new Map(),handlers=new Map(),store=new Map();
 const key='p79_yard_private_v1_TEST-ADMIN';
 store.set(key,JSON.stringify({rows:initialData,fileName:'yard.xlsx',updatedAt:'2026-11-13T00:00:00Z'}));
 function node(id){
  if(!nodes.has(id))nodes.set(id,{
   id,hidden:false,disabled:false,textContent:'',innerHTML:'',value:'',
   style:{},dataset:{},handlers:{},addEventListener(type,fn){this.handlers[type]=fn},setAttribute(){},
   classList:{add(){},remove(){},toggle(){}},
   parentElement:{classList:{add(){},remove(){}}},
   querySelector:part=>node(id+' '+part)
  });
  return nodes.get(id);
 }
 const document={
  readyState:'loading',getElementById:node,
  addEventListener:(type,fn)=>{if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn)},
  querySelectorAll:()=>[],documentElement:{classList:{add(){}}}
 };
 const window={
  document,location:{search:''},
  sessionStorage:{getItem:key=>{
   if(!authorized)return null;
   if(key==='port79_user_session')return JSON.stringify({empId:'TEST-ADMIN',adminRole:'superadmin'});
   if(key==='port79_user_token')return 'TEST-TOKEN';
   return null;
  }},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  XLSX:{SSF:{parse_date_code:()=>null},utils:{sheet_to_json:sheet=>sheet.matrix}},
  addEventListener(){},
 };
 window.parent=window;
 vm.runInNewContext(yard,{window,console,URLSearchParams},{timeout:5000});
 const init=(handlers.get('DOMContentLoaded')||[])[0];assert.equal(typeof init,'function');init();
 return {api:window.P79YardDashboard,node,store};
}
const b=mockBrowser();
const api=b.api;
assert.equal(api.capacityValue('1500.25'),1500.25);
for(const bad of ['',0,-1,'ABC',100000001,'1.123']){
 assert.throws(()=>api.capacityValue(bad),/容量必須輸入/,'reject invalid capacity: '+bad);
}
assert.doesNotThrow(()=>api.validateRecord(base));
const effective=api.effectiveRecord(base,{'2026-11-13':{heavyCap:200,emptyCap:80}});
assert.equal(effective.heavyCap,200);
assert.equal(effective.emptyCap,80);
assert.equal(effective.heavyPct,5);
assert.equal(effective.emptyPct,25);
assert.equal(effective._manualHeavyCap,true);
assert.equal(effective._manualEmptyCap,true);
assert.equal(base.heavyCap,100,'source Excel record cannot be mutated');
assert.equal(base.emptyPct,20,'source Excel percentage cannot be mutated');

const changed=api.setCapacityOverride('2026-11-13',{heavyCap:200,emptyCap:80});
assert.equal(changed.heavyCap,200);
assert.equal(changed.emptyCap,80);
assert.equal(b.node('yardHeavyCap').textContent,'100','explicit render needed to repaint page');
// Wire the actual page controls, not just the exposed calculation helper.
b.node('yardManualHeavyCap').value='275.5';
b.node('yardManualEmptyCap').value='125';
assert.equal(typeof b.node('yardCapacitySave').handlers.click,'function');
b.node('yardCapacitySave').handlers.click();
assert.equal(b.node('yardHeavyCap').textContent,'275.5');
assert.equal(b.node('yardEmptyCap').textContent,'125');
assert.match(b.node('yardStatus').textContent,/已儲存於此瀏覽器/);
assert.equal(typeof b.node('yardDetailBody').handlers.change,'function');
const inline={value:'333',dataset:{yardCapKey:'heavyCap',yardCapDate:'2026-11-13'},matches:selector=>selector==='input[data-yard-cap-key]'};
b.node('yardDetailBody').handlers.change({target:inline});
assert.equal(b.node('yardHeavyCap').textContent,'333');
assert.equal(b.node('yardEmptyCap').textContent,'125','editing heavy history must preserve empty capacity');
b.node('yardCapacityReset').handlers.click();
assert.equal(b.node('yardHeavyCap').textContent,'100');
assert.equal(b.node('yardEmptyCap').textContent,'100');
assert.equal(b.node('yardCapacityReset').disabled,true);
const capKey='p79_yard_capacity_overrides_v1_TEST-ADMIN';
let saved=JSON.parse(b.store.get(capKey));
assert.equal(saved['2026-11-13'].heavyCap,200);
assert.equal(saved['2026-11-13'].emptyCap,80);
let original=JSON.parse(b.store.get('p79_yard_private_v1_TEST-ADMIN'));
assert.equal(original.rows[0].heavyCap,100);
assert.equal(original.rows[0].emptyCap,100);
assert.throws(()=>api.setCapacityOverride('2026-11-13',{heavyCap:0,emptyCap:300}),/容量必須輸入/);
saved=JSON.parse(b.store.get(capKey));
assert.equal(saved['2026-11-13'].emptyCap,80,'atomic save never partially changes after invalid field');
assert.throws(()=>api.setCapacityOverride('2026-11-12',{heavyCap:300}),/尚未匯入資料/);
assert.equal(api.setCapacityOverride('2026-11-13',{heavyCap:null}).heavyCap,100);
assert.equal(api.setCapacityOverride('2026-11-13',{emptyCap:null}).emptyCap,100);
assert.deepEqual(JSON.parse(b.store.get(capKey)),{});
assert.equal(api.setCapacityOverride('2026-11-13',{heavyCap:100})._manualHeavyCap,undefined,'value matching Excel must not create an override');

const table=api.historyTable([effective],['heavyTotal','heavyCap','heavyPct'],['場存TEU','容量TEU','使用率％'],'heavyCap');
assert.match(table,/>手動容量 TEU<\/th>/);
assert.match(table,/data-yard-cap-key="heavyCap"/);
assert.match(table,/data-yard-cap-date="2026-11-13"/);
assert.match(table,/value="200"/);
assert.match(table,/is-manual/);
assert.match(yard,/historyTable\(list,\['genEmptyTeu'.*'emptyCap'\)/,'empty historical table is editable');
assert.match(yard,/historyTable\(list,\['impTeu'.*'heavyCap'\)/,'heavy historical table is editable');

const locked=mockBrowser({authorized:false});
assert.throws(()=>locked.api.setCapacityOverride('2026-11-13',{heavyCap:200}),/沒有儲存權限/);
assert.equal(locked.store.has(capKey),false);

const homeStart=home.indexOf('function canViewHomeYard(session)');
const homeEnd=home.indexOf('function launchSystem(target)',homeStart);
assert.ok(homeStart>=0&&homeEnd>homeStart);
const homepageNodes=new Map();
const hnode=id=>{
 if(!homepageNodes.has(id))homepageNodes.set(id,{textContent:''});
 return homepageNodes.get(id);
};
let activeToken='test-token',reads=0;
const dataStore=new Map([
 ['p79_yard_private_v1_TEST-ADMIN',JSON.stringify({rows:[base],fileName:'yard.xlsx'})],
 [capKey,JSON.stringify({'2026-11-13':{heavyCap:200,emptyCap:80}})]
]);
const context={
 window:{addEventListener(){}},
 currentSession:null,
 YARD_HOME_STORAGE_PREFIX:'p79_yard_private_v1_',
 YARD_HOME_CAPACITY_PREFIX:'p79_yard_capacity_overrides_v1_',
 getToken:()=>activeToken,
 $:hnode,
 localStorage:{getItem:key=>{reads++;return dataStore.get(key)||null;}},
 console
};
vm.createContext(context);vm.runInContext(home.slice(homeStart,homeEnd),context,{timeout:5000});
const employee={adminRole:'employee',empId:'TEST-ADMIN',systemPermissions:{efficiency:'view'}};
const admin={adminRole:'admin',empId:'TEST-ADMIN',systemPermissions:{efficiency:'view'}};
assert.equal(context.canViewHomeYard(employee),false);
assert.equal(context.canViewHomeYard(admin),true);
activeToken='';
assert.equal(context.canViewHomeYard(admin),false,'missing token rejects homepage Yard');
activeToken='test-token';
context.renderHomeYardSummary(employee);
assert.equal(reads,0,'unauthorized homepage cannot access Yard local data');
context.renderHomeYardSummary(admin);
assert.equal(hnode('p79HomeYardHeavy').textContent,'10');
assert.equal(hnode('p79HomeYardEmpty').textContent,'20');
assert.equal(hnode('p79HomeYardHeavyCap').textContent,'200');
assert.equal(hnode('p79HomeYardEmptyCap').textContent,'80');
assert.equal(hnode('p79HomeYardHeavyPct').textContent,'5.00%');
assert.equal(hnode('p79HomeYardEmptyPct').textContent,'25.00%');
assert.match(hnode('p79HomeYardSource').textContent,/本機|瀏覽器/);
console.log('PASS Yard home+capacity: permission gating, source integrity, date-scoped overrides, value validation, history right-hand inputs, summary percentages');

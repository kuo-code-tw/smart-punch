/* Synthetic tests: allowed physical box counts (櫃), not TEU capacity. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'yard-dashboard/yard-dashboard.js'),'utf8');
const html=fs.readFileSync(path.join(root,'yard-dashboard/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'yard-dashboard/yard-dashboard.css'),'utf8');
const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
const parent=fs.readFileSync(path.join(root,'aqc-efficiency/index.html'),'utf8');

assert.match(html,/data-yard-view="allowance"/);
assert.match(html,/重櫃容許上限（櫃）/);
assert.match(html,/空櫃容許上限（櫃）/);
assert.match(html,/id="yardAllowanceSave"/);
assert.match(html,/id="yardAllowanceClear"/);
assert.doesNotMatch(html,/id="yardManualHeavyCap"|id="yardManualEmptyCap"/,'TEU override inputs must not be shown as box count controls');
assert.match(html,/yard-dashboard\.js\?v=20261113-allowed-count-v1/);
assert.match(html,/yard-dashboard\.css\?v=20261113-allowed-count-v1/);
assert.match(parent,/20261113-yard-allowed-count-v1/);
assert.match(css,/\.yard-allowed-summary/);
assert.match(home,/id="p79HomeYardHeavyCount"/);
assert.match(home,/id="p79HomeYardEmptyCount"/);
assert.match(home,/YARD_HOME_ALLOWED_PREFIX='p79_yard_allowed_container_counts_v1_'/);

function fixture(date='2026-11-13'){
 const w={document:{readyState:'loading',addEventListener(){}},XLSX:{SSF:{parse_date_code(){return null}}}};
 vm.runInNewContext(js,{window:w,console},{timeout:5000});
 const fields=w.P79YardDashboard.fieldRows;
 const r=Object.fromEntries(Object.keys(fields).map(k=>[k,0]));
 Object.assign(r,{date,imp20:10,imp40:2,impTeu:14,exp20:3,exp40:1,expTeu:5,
  trans20:4,trans40:1,transTeu:6,reefer20:2,reefer40:1,reeferTeu:4,
  heavyTotal:29,heavyCap:100,heavyPct:29,
  genEmpty20:20,genEmpty40:5,genEmptyTeu:30,reeferEmpty20:2,reeferEmpty40:1,reeferEmptyTeu:4,
  emptyTotal:34,emptyCap:100,emptyPct:34,
  heavyPlug20Cap:10,heavyPlug40Cap:10,heavyPlug20Pct:20,heavyPlug40Pct:10,
  pti20Cap:10,pti40Cap:10});
 return r;
}
const source=fixture();
function browser({authorized=true,data=[source]}={}){
 const handlers=new Map(),nodes=new Map(),store=new Map();
 const tabs=['overview','heavy','empty','plugs','long','allowance'].map(v=>({dataset:{yardView:v},handlers:{},classList:{toggle(){}},
   addEventListener(n,fn){this.handlers[n]=fn},setAttribute(){}}));
 store.set('p79_yard_private_v1_TEST-ADMIN',JSON.stringify({rows:data,fileName:'yard.xlsx'}));
 function node(id){
  if(!nodes.has(id))nodes.set(id,{
   id,hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',dataset:{},style:{},handlers:{},
   addEventListener(type,fn){this.handlers[type]=fn},setAttribute(){},click(){},
   classList:{add(){},remove(){},toggle(){}},
   parentElement:{classList:{add(){},remove(){}}},
   querySelector:q=>node(id+' '+q)
  });
  return nodes.get(id);
 }
 const d={readyState:'loading',getElementById:node,
  querySelectorAll:q=>q==='[data-yard-view]'?tabs:[],
  documentElement:{classList:{add(){}}},
  addEventListener:(k,fn)=>{if(!handlers.has(k))handlers.set(k,[]);handlers.get(k).push(fn)}};
 const w={document:d,location:{search:''},parent:null,addEventListener(){},confirm:()=>true,
  sessionStorage:{getItem:k=>!authorized?null:k==='port79_user_session'?JSON.stringify({empId:'TEST-ADMIN',adminRole:'superadmin'}):k==='port79_user_token'?'TOKEN':null},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  XLSX:{SSF:{parse_date_code(){return null}},utils:{sheet_to_json(){return []}}}};
 w.parent=w;
 vm.runInNewContext(js,{window:w,console,URLSearchParams},{timeout:5000});
 const fn=(handlers.get('DOMContentLoaded')||[])[0];assert.equal(typeof fn,'function');fn();
 return {api:w.P79YardDashboard,store,node,tabs};
}
const b=browser(),a=b.api;
assert.doesNotThrow(()=>a.validateRecord(source),'fixture is consistent with Excel mapping');
assert.deepEqual(JSON.parse(JSON.stringify(a.containerCounts(source))),{heavy:24,empty:28},
 '20/40 both count as one box and special/LongStay not double counted');
assert.equal(source.heavyTotal,29,'TEU is distinct from heavy container count');
for(const invalid of ['','1.2','0','-4','abc','100000001']){
 assert.throws(()=>a.allowedCountValue(invalid),/正整數/);
}
assert.equal(a.allowedCountValue('7500'),7500);
let c=a.compareAllowedCounts(source,{heavy:20,empty:40});
assert.equal(c.heavy.exceeded,true);
assert.equal(c.heavy.remaining,-4);
assert.equal(c.empty.exceeded,false);
assert.equal(c.empty.remaining,12);
assert.match(a.alertNotices(source,[source],{heavy:20,empty:25}).join(' '),/重櫃實際 24 櫃/);
assert.match(a.alertNotices(source,[source],{heavy:20,empty:25}).join(' '),/空櫃實際 28 櫃/);
assert.doesNotMatch(a.alertNotices(source,[source],{heavy:30,empty:40}).join(' '),/超過容許上限/);
const limitKey='p79_yard_allowed_container_counts_v1_TEST-ADMIN';
assert.equal(typeof b.node('yardAllowanceSave').handlers.click,'function');
assert.equal(typeof b.node('yardAllowanceClear').handlers.click,'function');
const allowedTab=b.tabs.find(t=>t.dataset.yardView==='allowance');
allowedTab.handlers.click();
assert.equal(b.node('yardAllowedSettings').hidden,false);
assert.equal(b.node('yardContent').hidden,true);
b.node('yardHeavyAllowed').value='20';
b.node('yardEmptyAllowed').value='25';
b.node('yardAllowanceSave').handlers.click();
assert.deepEqual(JSON.parse(b.store.get(limitKey)),{heavy:20,empty:25});
assert.match(b.node('yardStatus').textContent,/已儲存/);
assert.match(b.node('yardAllowanceStatus').textContent,/超量/);
b.tabs.find(t=>t.dataset.yardView==='overview').handlers.click();
assert.equal(b.node('yardHeavyCount').textContent,'24');
assert.equal(b.node('yardEmptyCount').textContent,'28');
assert.match(b.node('yardHeavyLimitSummary').textContent,/超量 4 櫃/);
assert.match(b.node('yardEmptyLimitSummary').textContent,/超量 3 櫃/);
assert.match(b.node('yardAlerts').innerHTML,/超過容許上限/);
assert.equal(b.node('yardHeavyCap').textContent,'100','Excel TEU capacity unchanged');
const imported=JSON.parse(b.store.get('p79_yard_private_v1_TEST-ADMIN'));
assert.equal(imported.rows[0].heavyCap,100);
assert.equal(imported.rows[0].heavyTotal,29);
assert.equal(imported.rows[0].emptyTotal,34);
b.tabs.find(t=>t.dataset.yardView==='allowance').handlers.click();
b.node('yardHeavyAllowed').value='0';b.node('yardAllowanceSave').handlers.click();
assert.match(b.node('yardStatus').textContent,/設定失敗/);
assert.equal(JSON.parse(b.store.get(limitKey)).heavy,20,'invalid input does not overwrite saved setting');
b.node('yardAllowanceClear').handlers.click();
assert.equal(b.store.has(limitKey),false,'clear removes only allowance record');
assert.equal(b.node('yardHeavyAllowed').value,'');
assert.equal(b.node('yardEmptyAllowed').value,'');
assert.ok(b.store.has('p79_yard_private_v1_TEST-ADMIN'),'Excel records remain intact');
const empty=browser({data:[]});
empty.tabs.find(t=>t.dataset.yardView==='allowance').handlers.click();
assert.equal(empty.node('yardAllowedSettings').hidden,false,'setting possible before Excel import');
empty.node('yardHeavyAllowed').value='200';empty.node('yardEmptyAllowed').value='300';
empty.node('yardAllowanceSave').handlers.click();
assert.equal(JSON.parse(empty.store.get(limitKey)).heavy,200);
const locked=browser({authorized:false});
assert.throws(()=>locked.api.setAllowedCounts(20,30),/請先登入/);
assert.equal(locked.store.has(limitKey),false);

const begin=home.indexOf('function canViewHomeYard(session)');
const end=home.indexOf('function launchSystem(target)',begin);
assert.ok(begin>=0&&end>begin);
const nodes=new Map(),getNode=id=>nodes.get(id)||(nodes.set(id,{textContent:''}),nodes.get(id));
let token='TOKEN',reads=0;
const homeStore=new Map([
 ['p79_yard_private_v1_TEST-ADMIN',JSON.stringify({rows:[source],fileName:'yard.xlsx'})],
 [limitKey,JSON.stringify({heavy:20,empty:25})]
]);
const context={window:{addEventListener(){}},getToken:()=>token,currentSession:null,$:getNode,console,
 YARD_HOME_STORAGE_PREFIX:'p79_yard_private_v1_',YARD_HOME_ALLOWED_PREFIX:'p79_yard_allowed_container_counts_v1_',
 localStorage:{getItem:k=>{reads++;return homeStore.get(k)||null}}};
vm.createContext(context);vm.runInContext(home.slice(begin,end),context,{timeout:5000});
const denied={adminRole:'employee',empId:'TEST-ADMIN',systemPermissions:{efficiency:'view'}};
const admin={adminRole:'admin',empId:'TEST-ADMIN',systemPermissions:{efficiency:'view'}};
context.renderHomeYardSummary(denied);
assert.equal(reads,0,'employee cannot access local Yard data');
context.renderHomeYardSummary(admin);
assert.equal(getNode('p79HomeYardHeavyCount').textContent,'24 櫃');
assert.equal(getNode('p79HomeYardEmptyCount').textContent,'28 櫃');
assert.match(getNode('p79HomeYardHeavyLimit').textContent,/超出 4 櫃/);
assert.match(getNode('p79HomeYardEmptyLimit').textContent,/超出 3 櫃/);
assert.equal(getNode('p79HomeYardHeavyCap').textContent,'100','homepage uses Excel TEU, not obsolete manual overrides');
token='';assert.equal(context.canViewHomeYard(admin),false);
console.log('PASS Yard allowed boxes: global count limits, 20/40 counts, alerts, UI save/clear, auth, no-Excel setup, home summary, Excel untouched');

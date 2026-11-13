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
for(const type of ['Heavy','Empty'])assert.match(html,new RegExp('id="yard'+type+'Allowed45"'),'45ft limit input exists');
assert.match(html,/id="yardHeavyAllowedTeu"/);
assert.match(html,/id="yardEmptyAllowedTeu"/);
for(const id of ['Heavy','Empty','Reefer']){
 for(const size of ['20','40'])assert.match(html,new RegExp('id="yard'+id+'Allowed'+size+'"'));
 assert.match(html,new RegExp('id="yard'+id+'AllowedTeu"'));
}
assert.match(html,/id="yardReeferCount"/);
assert.match(html,/id="yardReeferTeuSummary"/);
assert.match(html,/20 呎櫃＝1 TEU，40／45 呎櫃＝2 TEU/);
assert.doesNotMatch(html,/id="yardManualHeavyCap"|id="yardManualEmptyCap"/,'TEU override inputs must not be shown as box count controls');
assert.match(html,/yard-dashboard\.js\?v=20261113-home-size-cards-v1/);
assert.match(html,/yard-dashboard\.css\?v=20261113-home-size-cards-v1/);
assert.match(parent,/20261113-yard-home-size-cards-v1/);
assert.match(css,/\.yard-allowed-summary/);
assert.match(home,/id="p79HomeYardHeavyCount"/);
assert.match(home,/id="p79HomeYardEmptyCount"/);
assert.match(home,/id="p79HomeYardHeavyTeu"/);
assert.match(home,/id="p79HomeYardEmptyTeu"/);
assert.match(home,/id="p79HomeYardReeferCount"/);
assert.match(home,/id="p79HomeYardReeferLimit"/);
assert.match(home,/id="p79HomeYardReeferTeu"/);
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
function browser({authorized=true,data=[source],role='superadmin',efficiency='manage',initialLimits=null}={}){
 const handlers=new Map(),nodes=new Map(),store=new Map();
 const tabs=['overview','heavy','empty','plugs','long','allowance'].map(v=>({dataset:{yardView:v},handlers:{},classList:{toggle(){}},
   addEventListener(n,fn){this.handlers[n]=fn},setAttribute(){}}));
 store.set('p79_yard_private_v1_TEST-ADMIN',JSON.stringify({rows:data,fileName:'yard.xlsx'}));
 if(initialLimits)store.set('p79_yard_allowed_container_counts_v1_TEST-ADMIN',JSON.stringify(initialLimits));
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
  sessionStorage:{getItem:k=>!authorized?null:k==='port79_user_session'?JSON.stringify({empId:'TEST-ADMIN',adminRole:role,systemPermissions:{efficiency}}):k==='port79_user_token'?'TOKEN':null},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  XLSX:{SSF:{parse_date_code(){return null}},utils:{sheet_to_json(){return []}}}};
 w.parent=w;
 vm.runInNewContext(js,{window:w,console,URLSearchParams},{timeout:5000});
 const fn=(handlers.get('DOMContentLoaded')||[])[0];assert.equal(typeof fn,'function');fn();
 return {api:w.P79YardDashboard,store,node,tabs};
}
const b=browser(),a=b.api;
assert.doesNotThrow(()=>a.validateRecord(source),'fixture is consistent with Excel mapping');
assert.deepEqual(JSON.parse(JSON.stringify(a.containerCounts(source))),{heavy:24,empty:28,reefer:6},
 '20/40 both count as one box and special/LongStay not double counted');
assert.equal(source.heavyTotal,29,'TEU is distinct from heavy container count');
const converted=JSON.parse(JSON.stringify(a.containerBreakdown(source)));
assert.deepEqual(converted,{heavy:{count:24,teu:29,twenty:19,forty:5},
 empty:{count:28,teu:34,twenty:22,forty:6},
 reefer:{count:6,teu:8,twenty:4,forty:2}},'reefer is a heavy/empty subset; both 20/40 types count toward reefer TEU');
assert.equal(a.allowedTeuValue(''),null,'TEU limit can be omitted');
assert.equal(a.allowedTeuValue('12000'),12000);
assert.equal(a.allowedSizeLimit('',''),null);
assert.deepEqual(JSON.parse(JSON.stringify(a.allowedSizeLimit('1','2','3'))),{twenty:1,forty:2,fortyfive:3,count:6,teu:11},'45ft counts as 2 TEU');
assert.equal(a.allowedSizeLimit('0','0','1').teu,2);
assert.deepEqual(JSON.parse(JSON.stringify(a.allowedSizeLimit('20','40'))),{twenty:20,forty:40,count:60,teu:100});
assert.deepEqual(JSON.parse(JSON.stringify(a.allowedSizeLimit('0','7'))),{twenty:0,forty:7,count:7,teu:14});
for(const bad of ['-1','1.5','abc','100000001'])assert.throws(()=>a.allowedSizeLimit(bad,'3'),/容許櫃數/);
assert.throws(()=>a.allowedSizeLimit('0','0'),/合計必須大於 0/);
assert.equal(a.compareAllowedCounts(source,{heavy:24,empty:28,reefer:6,reeferTeu:7}).reefer.teuExceeded,true,'reefer TEU can exceed while reefer boxes are within limit');
assert.match(a.alertNotices(source,[source],{heavy:30,empty:40,reefer:5,reeferTeu:7}).join(' '),/冷凍櫃實際 6 櫃，超過容許上限 5 櫃/);
assert.match(a.alertNotices(source,[source],{heavy:30,empty:40,reefer:5,reeferTeu:7}).join(' '),/冷凍櫃 20／40 呎換算 8 TEU，超過容許 TEU 上限 7 TEU/);
assert.doesNotMatch(a.alertNotices(source,[source],{heavy:30,empty:40}).join(' '),/冷凍櫃.*超過容許/,'backwards compatible when no reefer limits are configured');
for(const bad of ['0','-1','3.14','abc','200000001'])assert.throws(()=>a.allowedTeuValue(bad),/TEU 上限/);
const teuCheck=a.compareAllowedCounts(source,{heavy:24,empty:28,heavyTeu:28,emptyTeu:30});
assert.equal(teuCheck.heavy.exceeded,false,'box counts may fit while TEU exceeds');
assert.equal(teuCheck.empty.exceeded,false);
assert.equal(teuCheck.heavy.teuActual,29);
assert.equal(teuCheck.empty.teuActual,34);
assert.equal(teuCheck.heavy.teuExceeded,true);
assert.equal(teuCheck.empty.teuExceeded,true);
assert.equal(teuCheck.heavy.teuRemaining,-1);
assert.equal(teuCheck.empty.teuRemaining,-4);
const teuWarnings=a.alertNotices(source,[source],{heavy:30,empty:40,heavyTeu:28,emptyTeu:30}).join(' ');
assert.match(teuWarnings,/重櫃 20／40 呎換算 29 TEU，超過容許 TEU 上限 28 TEU/);
assert.match(teuWarnings,/空櫃 20／40 呎換算 34 TEU，超過容許 TEU 上限 30 TEU/);
for(const invalid of ['','1.2','0','-4','abc','100000001']){
 assert.throws(()=>a.allowedCountValue(invalid),/正整數/);
}
assert.equal(a.allowedCountValue('7500'),7500);
let c=a.compareAllowedCounts(source,{heavy:20,empty:40});
assert.equal(c.heavy.exceeded,true);
assert.equal(c.heavy.remaining,-4);
assert.equal(c.empty.exceeded,false);
assert.equal(c.empty.remaining,12);
const another=fixture('2026-11-12');another.imp20=15;another.impTeu=19;another.heavyTotal=34;another.heavyPct=34;
const anotherCompare=a.compareAllowedCounts(another,{heavy:20,empty:40});
assert.equal(anotherCompare.heavy.actual,29,'same allowed limit applies across dates');
assert.equal(anotherCompare.heavy.exceeded,true);
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
assert.match(b.node('yardAllowanceTeuBreakdown').textContent,/20 呎 19 ×1 ＋ 40 呎 5 ×2 ＝ 29 TEU/);
assert.match(b.node('yardAllowanceTeuBreakdown').textContent,/20 呎 22 ×1 ＋ 40 呎 6 ×2 ＝ 34 TEU/);
assert.match(b.node('yardAllowanceStatus').textContent,/超量/);
b.tabs.find(t=>t.dataset.yardView==='overview').handlers.click();
assert.equal(b.node('yardHeavyCount').textContent,'24');
assert.equal(b.node('yardEmptyCount').textContent,'28');
assert.match(b.node('yardHeavyLimitSummary').textContent,/超量 4 櫃/);
assert.match(b.node('yardEmptyLimitSummary').textContent,/超量 3 櫃/);
assert.match(b.node('yardAlerts').innerHTML,/超過容許上限/);
assert.match(b.node('yardHeavyTeuSummary').textContent,/換算 29 TEU/);
assert.match(b.node('yardEmptyTeuSummary').textContent,/換算 34 TEU/);
b.tabs.find(t=>t.dataset.yardView==='allowance').handlers.click();
b.node('yardHeavyAllowedTeu').value='28';
b.node('yardEmptyAllowedTeu').value='30';
b.node('yardAllowanceSave').handlers.click();
assert.deepEqual(JSON.parse(b.store.get(limitKey)),{heavy:20,empty:25,heavyTeu:28,emptyTeu:30});
b.tabs.find(t=>t.dataset.yardView==='overview').handlers.click();
assert.match(b.node('yardHeavyTeuSummary').textContent,/超量 1 TEU/);
assert.match(b.node('yardEmptyTeuSummary').textContent,/超量 4 TEU/);
assert.equal(b.node('yardHeavyTeuSummary').dataset.exceeded,'true');
assert.match(b.node('yardAlerts').innerHTML,/超過容許 TEU 上限/);
b.tabs.find(t=>t.dataset.yardView==='allowance').handlers.click();
b.node('yardHeavyAllowedTeu').value='0';
b.node('yardAllowanceSave').handlers.click();
assert.match(b.node('yardStatus').textContent,/設定失敗/);
assert.equal(JSON.parse(b.store.get(limitKey)).heavyTeu,28,'invalid TEU does not overwrite saved settings');
b.node('yardHeavyAllowedTeu').value='';b.node('yardAllowanceSave').handlers.click();
assert.deepEqual(JSON.parse(b.store.get(limitKey)),{heavy:20,empty:25,emptyTeu:30},'blank optional TEU disables only that limit');
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
empty.node('yardHeavyAllowedTeu').value='400';
empty.node('yardEmptyAllowedTeu').value='550';
empty.node('yardAllowanceSave').handlers.click();
assert.deepEqual(JSON.parse(empty.store.get(limitKey)),{heavy:200,empty:300,heavyTeu:400,emptyTeu:550});
// A saved legacy box-only setting must remain valid and not invent TEU ratios.
const legacy=browser({initialLimits:{heavy:40,empty:50,heavyTeu:90,emptyTeu:90}});
legacy.tabs.find(t=>t.dataset.yardView==='allowance').handlers.click();
assert.equal(legacy.node('yardHeavyAllowed').value,'40');
assert.equal(legacy.node('yardEmptyAllowed').value,'50');
assert.equal(legacy.node('yardHeavyAllowedTeu').value,'90');
assert.equal(legacy.node('yardHeavyAllowed20').value,'');
assert.equal(legacy.node('yardReeferAllowed').value,'');
assert.equal(legacy.node('yardHeavyAllowed').readOnly,false,'no fabricated length ratio for legacy box count');

const automatic=browser();
automatic.tabs.find(t=>t.dataset.yardView==='allowance').handlers.click();
for(const [type,twenty,forty,expectedCount,expectedTeu] of [
 ['Heavy',20,5,25,30],['Empty',40,10,50,60],['Reefer',3,2,5,7]
]){
 automatic.node('yard'+type+'Allowed20').value=String(twenty);
 automatic.node('yard'+type+'Allowed20').handlers.input();
 automatic.node('yard'+type+'Allowed40').value=String(forty);
 automatic.node('yard'+type+'Allowed40').handlers.input();
 assert.equal(automatic.node('yard'+type+'Allowed').value,String(expectedCount),'total boxes update as 20+40');
 assert.equal(automatic.node('yard'+type+'AllowedTeu').value,String(expectedTeu),'TEU auto-updates as 20 + 2*40');
 assert.equal(automatic.node('yard'+type+'Allowed').readOnly,true,'cannot accidentally contradict size allocation');
 assert.match(automatic.node('yard'+type+'AllowedPreview').textContent,/自動換算/);
}
automatic.node('yardAllowanceSave').handlers.click();
assert.match(automatic.node('yardStatus').textContent,/已儲存/);
assert.deepEqual(JSON.parse(automatic.store.get(limitKey)),{
 heavy:25,empty:50,heavyTeu:30,emptyTeu:60,
 heavy20:20,heavy40:5,empty20:40,empty40:10,
 reefer:5,reeferTeu:7,reefer20:3,reefer40:2
});
automatic.tabs.find(t=>t.dataset.yardView==='overview').handlers.click();
assert.equal(automatic.node('yardReeferCount').textContent,'6');
assert.match(automatic.node('yardReeferLimitSummary').textContent,/超量 1 櫃/);
assert.match(automatic.node('yardReeferTeuSummary').textContent,/超量 1 TEU/);
assert.match(automatic.node('yardAlerts').innerHTML,/冷凍櫃實際 6 櫃/);
assert.match(automatic.node('yardAlerts').innerHTML,/冷凍櫃 20／40 呎換算 8 TEU/);
assert.equal(automatic.node('yardHeavyCap').textContent,'100','derived size limits must not change Excel TEU source');
assert.equal(JSON.parse(automatic.store.get('p79_yard_private_v1_TEST-ADMIN')).rows[0].heavyTotal,29);
const restored=browser({initialLimits:JSON.parse(automatic.store.get(limitKey))});
restored.tabs.find(t=>t.dataset.yardView==='allowance').handlers.click();
assert.equal(restored.node('yardReeferAllowed20').value,'3');
assert.equal(restored.node('yardReeferAllowed40').value,'2');
assert.equal(restored.node('yardReeferAllowedTeu').value,'7');
restored.node('yardReeferAllowed20').value='4';
restored.node('yardReeferAllowed20').handlers.input();
assert.equal(restored.node('yardReeferAllowed').value,'6');
assert.equal(restored.node('yardReeferAllowedTeu').value,'8');
assert.equal(JSON.parse(restored.store.get(limitKey)).reefer,5,'changes are not persisted until save click');
restored.node('yardAllowanceSave').handlers.click();
assert.equal(JSON.parse(restored.store.get(limitKey)).reefer,6);
restored.node('yardReeferAllowed20').value='-1';
restored.node('yardAllowanceSave').handlers.click();
assert.match(restored.node('yardStatus').textContent,/設定失敗/);
assert.equal(JSON.parse(restored.store.get(limitKey)).reefer,6,'invalid size input must not overwrite prior saved limits');
restored.node('yardReeferAllowed20').value='4';
restored.node('yardReeferAllowed40').value='';
restored.node('yardReeferAllowed20').handlers.input();
assert.equal(restored.node('yardReeferAllowedTeu').value,'4','blank 40ft counts as 0 only in size allocation');
const viewer=browser({role:'admin',efficiency:'view'});
assert.equal(viewer.node('yardAllowanceSave').disabled,true,'view-only manager cannot edit terminal maximums');
assert.equal(viewer.node('yardHeavyAllowedTeu').disabled,true,'view-only manager cannot change TEU');
assert.equal(viewer.node('yardEmptyAllowedTeu').disabled,true);
assert.equal(viewer.node('yardReeferAllowed20').disabled,true);
assert.equal(viewer.node('yardReeferAllowed40').disabled,true);
assert.equal(viewer.node('yardReeferAllowedTeu').disabled,true);
assert.throws(()=>viewer.api.setAllowedCounts(20,30),/修改權限/);
assert.equal(viewer.store.has(limitKey),false);
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
 [limitKey,JSON.stringify({heavy:20,empty:25,heavyTeu:28,emptyTeu:30,reefer:5,reeferTeu:7})]
]);
const context={window:{addEventListener(){}},document:{getElementById:getNode},getToken:()=>token,currentSession:null,$:getNode,console,
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
assert.equal(getNode('p79HomeYardReeferCount').textContent,'6 櫃');
assert.match(getNode('p79HomeYardReeferLimit').textContent,/超出 1 櫃/);
assert.match(getNode('p79HomeYardReeferTeu').textContent,/換算 8 TEU｜上限 7，超出 1 TEU/);
assert.match(getNode('p79HomeYardHeavyLimit').textContent,/超出 4 櫃/);
assert.match(getNode('p79HomeYardEmptyLimit').textContent,/超出 3 櫃/);
assert.match(getNode('p79HomeYardHeavyTeu').textContent,/換算 29 TEU｜上限 28，超出 1 TEU/);
assert.match(getNode('p79HomeYardEmptyTeu').textContent,/換算 34 TEU｜上限 30，超出 4 TEU/);
assert.equal(getNode('p79HomeYardHeavyCap').textContent,'100','homepage uses Excel TEU, not obsolete manual overrides');
token='';assert.equal(context.canViewHomeYard(admin),false);
console.log('PASS Yard allowed boxes: global count limits, 20/40 counts, alerts, UI save/clear, auth, no-Excel setup, home summary, Excel untouched');

'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const script=fs.readFileSync('assets/port79-gate-home.js','utf8');
new vm.Script(script);
assert(html.includes('port79-gate-home.js?v=20261111-admin-phone-no-gate-v2'),
 'mobile fix must load a fresh JS version');
assert(html.includes('id="p79-mobile-gate-quantities-20261107"'),
 'mobile Gate six-tile layout is present');
class Clock extends Date{
 constructor(...args){super(...(args.length?args:['2026-11-07T08:00:00Z']));}
 static now(){return Date.parse('2026-11-07T08:00:00Z');}
}
class Element{
 constructor(){this.attrs={};this.listeners={};this.textContent='';this.hidden=false;this.title='';
  this.style={removeProperty(){}};this.classList={toggle(){}};}
 addEventListener(name,fn){this.listeners[name]=fn;}
 setAttribute(name,value){this.attrs[name]=value;}
 getAttribute(name){return this.attrs[name];}
 closest(){return null;}
}
const rows=[
 {date:'2026-11-01',deliverEmpty:1,pickupEmpty:2,deliverLoaded:3,pickupLoaded:4,truckEntries:5},
 {date:'2026-11-06',deliverEmpty:10,pickupEmpty:20,deliverLoaded:30,pickupLoaded:40,truckEntries:50}
];
function run(allowed){
 const map=new Map(),get=id=>{if(!map.has(id))map.set(id,new Element());return map.get(id)};
 const root={classList:{contains:()=>true}};
 const doc={readyState:'complete',documentElement:root,getElementById:get,addEventListener(){}};
 let calls=0;
 const session={empId:'TEST',adminRole:'admin',punchOnly:false,
  systemPermissions:{history:allowed?'view':'none'},
  finePermissions:{history:{'vessel.view':allowed}}};
 const store={port79_user_session:JSON.stringify(session),port79_user_token:'TEST',
   port79_gas_url:'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec'};
 const win={document:doc,sessionStorage:{getItem:key=>store[key]||null},
  P79HistoryRead:{read:async url=>{
   calls++;
   assert(url.includes('action=gateStatsReadYear'),'reads official daily Gate endpoint');
   return {ok:true,source:'port79-gate-daily',year:'2026',rows};
  }}};
 vm.runInNewContext(script,{window:win,globalThis:win,Intl,Date:Clock,URL,console},{timeout:3000});
 return {get,win,calls:()=>calls};
}
(async()=>{
 const allowed=run(true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.notEqual(allowed.get('p79HomeGateTab').attrs['aria-selected'],'true',
  'administrator phone must not automatically select Gate');
 assert.equal(allowed.calls(),0,'hidden Gate must not request cloud data on initial mobile load');
 allowed.win.P79GateStatsHome.switchTab('gate');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(allowed.get('p79HomeGatePanel').hidden,false,'Gate statistics remain functional when explicitly opened on desktop');
 assert.equal(allowed.get('p79GateDeliverEmpty').textContent,'11');
 assert.equal(allowed.get('p79GatePickupEmpty').textContent,'22');
 assert.equal(allowed.get('p79GateDeliverLoaded').textContent,'33');
 assert.equal(allowed.get('p79GatePickupLoaded').textContent,'44');
 assert.equal(allowed.get('p79GateTotalContainers').textContent,'110');
 assert.equal(allowed.get('p79GateTruckEntries').textContent,'55');
 assert.equal(allowed.calls(),1,'monthly total reads the cloud only once');
 allowed.win.P79GateStatsHome.chooseMode('day');
 assert.equal(allowed.get('p79GateTotalContainers').textContent,'100','daily switch reads last published daily record');
 const denied=run(false);
 await new Promise(resolve=>setImmediate(resolve));
 denied.win.P79GateStatsHome.switchTab('gate');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(denied.calls(),0,'non-viewer cannot query Gate cloud');
 assert.equal(denied.get('p79GateTotalContainers').textContent,'—');
 assert(denied.get('p79GateStatus').textContent.includes('權限'),
  'denied user sees an explanation, never an invented number');
 console.log('PASS: administrator phone does not auto-open Gate; manual desktop Gate still reads six authorized totals.');
})().catch(err=>{console.error(err);process.exitCode=1;});

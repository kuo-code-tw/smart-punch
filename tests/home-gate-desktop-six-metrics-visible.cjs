'use strict';
// Regression: the desktop Gate card used to show "已記錄 N 天" but hide all
// six value tiles because flex:1 1 0 plus min-height:0 collapsed the grid.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/port79-gate-home.css','utf8');
const script=fs.readFileSync('assets/port79-gate-home.js','utf8');
new vm.Script(script);
assert(html.includes('port79-gate-home.css?v=20261107-gate-equal-height-v2-six-metrics-visible-v3'),
  'new stylesheet URL avoids browser-cache stale desktop CSS');
const old=css.lastIndexOf('/* 2026-11-07 | Gate same height as the vessel efficiency trend.');
const fix=css.lastIndexOf('/* 2026-11-07 Gate desktop six-metric visibility fix.');
assert(old>=0&&fix>old,'visibility fix must override older fixed-height / flex-zero styles');
const final=css.slice(fix);
assert(final.includes('grid-auto-rows:auto!important'),'release outer fixed 260/275px grid tracks in Gate mode');
assert(final.includes('max-height:none!important'),'release fixed card height');
assert(final.includes('overflow:visible!important'),'prevent clipping KPIs');
assert(final.includes('flex:0 0 auto!important'),'KPI grid and panel may not shrink to zero');
assert(final.includes('min-height:140px!important'),'desktop two-row KPI grid reserves visible height');
assert(final.includes('grid-template-rows:repeat(2,minmax(66px,auto))!important'),'desktop 3 x 2 tiles');
assert(final.includes('grid-template-rows:repeat(3,minmax(66px,auto))!important'),'narrow 2 x 3 tiles');
assert(final.includes('min-height:208px!important'),'phone KPIs also remain visible');
const all=['p79GateDeliverEmpty','p79GatePickupEmpty','p79GateDeliverLoaded',
  'p79GatePickupLoaded','p79GateTruckEntries','p79GateTotalContainers'];
for(const id of all)assert(html.includes('id="'+id+'"'),'missing Gate KPI '+id);
assert(final.includes('#p79Dashboard.p79-gate-view-active'),
  'override must apply only while Gate tab is active, leaving imported vessels intact');
class Clock extends Date {
  constructor(...args){super(...(args.length?args:['2026-11-07T08:00:00Z']));}
  static now(){return Date.parse('2026-11-07T08:00:00Z');}
}
class Element {
  constructor(){this.textContent='';this.title='';this.hidden=false;this.attrs={};this.listeners={};
    this.classList={toggle(){}};this.style={removeProperty(){}};}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(k,fn){this.listeners[k]=fn;}
  closest(){return null;}
}
const elements=new Map();
function get(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);}
const session={empId:'TEST',adminRole:'superadmin',punchOnly:false};
const store={port79_user_session:JSON.stringify(session),port79_user_token:'TEST',
  port79_gas_url:'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec'};
let calls=0;
const rows=[2,3,4,5,6].map(n=>({
  date:'2026-11-'+String(n).padStart(2,'0'),
  deliverEmpty:n,pickupEmpty:n+10,deliverLoaded:n+20,
  pickupLoaded:n+30,truckEntries:n+40
}));
const doc={readyState:'complete',documentElement:{classList:{contains:()=>false}},
  getElementById:get,addEventListener(){}};
const win={document:doc,sessionStorage:{getItem:key=>store[key]||null},
  P79HistoryRead:{read:async url=>{
    calls++;
    assert(url.includes('action=gateStatsReadYear'));
    return {ok:true,source:'port79-gate-daily',year:'2026',rows};
  }}};
vm.runInNewContext(script,{window:win,globalThis:win,Date:Clock,Intl,URL,console},{timeout:3000});
(async()=>{
  win.P79GateStatsHome.switchTab('gate');
  await new Promise(resolve=>setImmediate(resolve));
  win.P79GateStatsHome.chooseMode('week');
  assert.equal(get('p79GatePeriod').textContent,'11/02－11/08 週');
  assert.equal(get('p79GateStatus').textContent,'已記錄 5 天 · 本期合計');
  assert.equal(get('p79GateDeliverEmpty').textContent,'20');
  assert.equal(get('p79GatePickupEmpty').textContent,'70');
  assert.equal(get('p79GateDeliverLoaded').textContent,'120');
  assert.equal(get('p79GatePickupLoaded').textContent,'170');
  assert.equal(get('p79GateTruckEntries').textContent,'220');
  assert.equal(get('p79GateTotalContainers').textContent,'380');
  assert.equal(calls,1,'switching period uses current official cloud data without duplicate requests');
  assert.equal(get('p79HomeGatePanel').hidden,false);
  win.P79GateStatsHome.switchTab('operations');
  assert.equal(get('p79HomeGatePanel').hidden,true,'original vessel card still restores');
  assert.equal(get('p79RankingView').hidden,false);
  console.log('PASS: desktop Gate week has five official days and all six values; final CSS cannot collapse the tiles.');
})().catch(err=>{console.error(err);process.exitCode=1;});

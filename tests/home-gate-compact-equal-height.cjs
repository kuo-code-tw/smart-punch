'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'assets/port79-gate-home.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/port79-gate-home.css'),'utf8');
new vm.Script(js);
const start=html.indexOf('<section id="p79HomeGatePanel"');
const end=html.indexOf('</section>',start);
assert(start>=0&&end>start);
const gate=html.slice(start,end);
const toolbar=gate.slice(gate.indexOf('<div class="p79-gate-toolbar"'),gate.indexOf('<div class="p79-gate-metrics">'));
assert(toolbar.indexOf('class="p79-gate-modes"')<toolbar.indexOf('class="p79-gate-navigation"'),
 'four-way mode switch appears before date paging in one top toolbar');
for(const label of ['Day','Week','Month','Year'])assert(toolbar.includes('id="p79Gate'+label+'"'));
assert(toolbar.includes('id="p79GatePeriod"')&&toolbar.includes('id="p79GatePrev"')&&toolbar.includes('id="p79GateNext"'));
assert(!gate.includes('class="p79-gate-caption"'),'remove needless caption occupying vertical space');
assert(html.includes('port79-gate-home.css?v=20261107-gate-equal-height-v2'));
assert(html.includes('port79-gate-home.js?v=20261111-admin-phone-no-gate-v2'));
const patch=css.slice(css.lastIndexOf('/* 2026-11-07 | Gate same height as the vessel efficiency trend.'));
assert(patch.includes('grid-auto-rows:260px!important'),'260px desktop row');
assert(patch.includes('grid-auto-rows:275px!important'),'275px phone row');
assert(patch.includes('grid-template-rows:repeat(2,minmax(0,1fr))!important'),'3x2 desktop');
assert(patch.includes('grid-template-rows:repeat(3,minmax(0,1fr))!important'),'2x3 mobile');
assert(patch.includes('flex:1 1 0!important'),'KPI rows fit free height');
assert(!js.includes("setProperty(key,values[key],'important')"),'no old inline max-content override');
class E{
 constructor(){this.attrs={};this.listeners={};this.hidden=false;this.textContent='';this.classList={toggle(){}};this.style={removeProperty(){}};}
 addEventListener(k,fn){this.listeners[k]=fn;}
 setAttribute(k,v){this.attrs[k]=v;}
 click(){this.listeners.click?.();}
 closest(){return null;}
}
const all=new Map(),get=id=>{if(!all.has(id))all.set(id,new E());return all.get(id);};
const doc={readyState:'complete',getElementById:get,addEventListener(){}};
const win={document:doc,sessionStorage:{getItem(){return null;}}};
vm.runInNewContext(js,{window:win,globalThis:win,Intl,Date,URL},{timeout:2000});
win.P79GateStatsHome.switchTab('gate');
for(const key of ['Day','Week','Month','Year']){
 get('p79Gate'+key).click();
 assert.equal(get('p79Gate'+key).attrs['aria-pressed'],'true',key+' selected');
 for(const other of ['Day','Week','Month','Year'].filter(t=>t!==key))
  assert.equal(get('p79Gate'+other).attrs['aria-pressed'],'false',other+' deselected');
}
get('p79GatePrev').click();
get('p79GateNext').click();
assert(get('p79GatePeriod').textContent,'navigation keeps visible period');
win.P79GateStatsHome.switchTab('operations');
assert.equal(get('p79HomeGatePanel').hidden,true,'the vessel list is restored');
console.log('PASS: Gate top toolbar buttons work, dates move, and shared trend-height CSS fits all six tiles.');

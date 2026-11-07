'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/port79-gate-home.css'),'utf8');
const code=fs.readFileSync(path.join(root,'assets/port79-gate-home.js'),'utf8');
new vm.Script(code);
const s=html.indexOf('<section id="p79HomeGatePanel"'),e=html.indexOf('</section>',s);
assert(s>0&&e>s,'Gate view exists');
const card=html.slice(s,e);
for(const id of ['p79GateDay','p79GateWeek','p79GateMonth','p79GateYear','p79GatePrev','p79GateNext','p79GateDeliverEmpty','p79GatePickupEmpty','p79GateDeliverLoaded','p79GatePickupLoaded','p79GateTruckEntries','p79GateTotalContainers']){
 assert(card.includes('id="'+id+'"'),id+' still present');
}
assert(card.includes('id="p79GateDay"')&&card.includes('id="p79GateWeek"'),'daily and weekly tabs also visible');
assert(!card.includes('href=')&&!card.includes('gateSave'),'homepage read-only');
const patch=css.slice(css.lastIndexOf('/* 2026-11-07 | Gate same height as the vessel efficiency trend.'));
assert(patch.includes('grid-auto-rows:260px!important'),'desktop Gate matches trend height');
assert(patch.includes('grid-auto-rows:275px!important'),'mobile Gate matches trend height');
assert(patch.includes('max-height:260px!important')&&patch.includes('max-height:275px!important'),'same bounded height');
assert(patch.includes('overflow:hidden!important'),'no nested scrolling');
assert(patch.includes('grid-template-columns:repeat(3,minmax(0,1fr))!important'),'desktop 3 columns, exactly 2 rows');
assert(patch.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'),'narrow phones 2 columns');
assert(patch.includes('min-height:0!important'),'KPI grid is flexible inside the shared panel row');
function style(){
 const map=new Map();return {setProperty(k,v,priority){map.set(k,{v,priority})},removeProperty:k=>map.delete(k),getPropertyValue:k=>map.get(k)?.v||'',getPropertyPriority:k=>map.get(k)?.priority||''};
}
const grid={style:style()};
const cardEl={style:style(),closest(sel){return sel==='.p79d-ship-panels'?grid:null;}};
const metricEl={style:style()};
const els=new Map();
function $(id){
 if(!els.has(id))els.set(id,{id,style:style(),hidden:false,attrs:{},textContent:'',classList:{toggle(){}},addEventListener(){},setAttribute(k,v){this.attrs[k]=v},closest(sel){return id==='p79HomeGatePanel'&&sel==='article.p79d-gate-flip'?cardEl:null},querySelector(sel){return id==='p79HomeGatePanel'&&sel==='.p79-gate-metrics'?metricEl:null}});
 return els.get(id);
}
const d={readyState:'complete',getElementById:$,addEventListener(){}};
const win={document:d,sessionStorage:{getItem(){return null;}}};
vm.runInNewContext(code,{window:win,globalThis:win,Intl,Date,URL});
win.P79GateStatsHome.switchTab('gate');
assert.equal(grid.style.getPropertyValue('grid-auto-rows'),'');
assert.equal(cardEl.style.getPropertyValue('max-height'),'');
assert.equal(cardEl.style.getPropertyValue('overflow'),'');
assert.equal($('p79HomeGatePanel').style.getPropertyValue('overflow-y'),'');
assert.equal(metricEl.style.getPropertyValue('max-height'),'');
assert.equal(metricEl.style.getPropertyValue('overflow-y'),'');
assert.equal($('p79HomeGatePanel').hidden,false);
assert.equal($('p79RankingView').hidden,true);
win.P79GateStatsHome.switchTab('operations');
for(const [el,prop] of [[grid,'grid-auto-rows'],[cardEl,'max-height'],[$('p79HomeGatePanel'),'overflow'],[metricEl,'overflow-y']]){
 assert.equal(el.style.getPropertyValue(prop),'',prop+' restored on vessel tab');
}
assert.equal($('p79HomeGatePanel').hidden,true);
assert.equal($('p79RankingView').hidden,false);
console.log('PASS: Six Gate KPIs fit trend-height row with four mode buttons and no inner scrolling.');

'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const baseCSS=fs.readFileSync(path.join(root,'assets/port79-reference-dashboard.css'),'utf8');
const gateCSS=fs.readFileSync(path.join(root,'assets/port79-gate-home.css'),'utf8');
const source=fs.readFileSync(path.join(root,'assets/port79-gate-home.js'),'utf8');
new vm.Script(source);
// Confirm the actual ROOT CAUSE is protected: the base dashboard used fixed
// 260px and 275px grid rows and fixed max-height on ALL ship cards.
assert(baseCSS.includes('grid-auto-rows:260px!important'));
assert(baseCSS.includes('grid-auto-rows:275px!important'));
assert(baseCSS.includes('max-height:260px!important'));
assert(baseCSS.includes('max-height:275px!important'));
const gateStart=baseCSS.lastIndexOf('/* 2026-11-07 Gate:');
assert(gateStart>0,'scoped grid fix is present AFTER the base rules');
const override=baseCSS.slice(gateStart);
assert(override.includes('grid-auto-rows:auto!important'),'Gate mode MUST release the parent grid row height');
assert(override.includes('#p79Dashboard.p79-gate-view-active'));
assert(override.includes('article.p79d-panel.p79d-gate-flip'));
assert(override.includes('max-height:none!important'));
assert(override.includes('overflow:visible!important'));
assert(gateCSS.includes('#p79Dashboard.p79-gate-view-active'),'Gate CSS also scopes expanded layout');
const versions={
 'port79-reference-dashboard.css':'20261107-gate-grid-track-fix-v4',
 'port79-gate-home.css':'20261107-gate-dwmy-v1',
 'port79-gate-home.js':'20261107-gate-dwmy-v1'
};
for(const [file,version] of Object.entries(versions)){
 assert(html.includes(file+'?v='+version),'cache bust updated for '+file);
}
function style(){
 const m=new Map();
 return {
  setProperty(k,v,priority){m.set(k,{v,priority})},
  removeProperty(k){m.delete(k)},
  getPropertyValue:k=>m.get(k)?.v||'',
  getPropertyPriority:k=>m.get(k)?.priority||''
 };
}
const grid={style:style()};
const card={style:style(),closest(sel){return sel==='.p79d-ship-panels'?grid:null;}};
const els=new Map();
function element(id){
 if(!els.has(id))els.set(id,{
  id,style:style(),hidden:false,textContent:'',attrs:{},handlers:{},
  setAttribute(k,v){this.attrs[k]=v;},
  addEventListener(k,fn){this.handlers[k]=fn;},
  classList:{toggle(){}},
  closest(sel){return id==='p79HomeGatePanel'&&sel==='article.p79d-gate-flip'?card:null;}
 });
 return els.get(id);
}
const doc={readyState:'complete',getElementById:element,addEventListener(){}};
const win={document:doc,sessionStorage:{getItem(){return null;}}};
vm.runInNewContext(source,{window:win,globalThis:win,Intl,Date,URL},{timeout:3000});
win.P79GateStatsHome.switchTab('gate');
assert.equal(grid.style.getPropertyValue('grid-auto-rows'),'max-content','outer grid row MUST fit all six KPI tiles');
assert.equal(grid.style.getPropertyPriority('grid-auto-rows'),'important','defeat late dashboard CSS');
assert.equal(card.style.getPropertyValue('height'),'auto');
assert.equal(card.style.getPropertyValue('min-height'),'0');
assert.equal(card.style.getPropertyValue('max-height'),'none');
assert.equal(card.style.getPropertyValue('overflow'),'visible');
assert.equal(element('p79HomeGatePanel').style.getPropertyValue('overflow-y'),'visible');
assert.equal(element('p79HomeGatePanel').hidden,false);
assert.equal(element('p79RankingView').hidden,true);
win.P79GateStatsHome.switchTab('operations');
for(const [el,prop] of [[grid,'grid-auto-rows'],[card,'max-height'],[card,'overflow'],[element('p79HomeGatePanel'),'overflow-y']]){
 assert.equal(el.style.getPropertyValue(prop),'','returning to vessels restores original '+prop);
}
assert.equal(element('p79HomeGatePanel').hidden,true);
assert.equal(element('p79RankingView').hidden,false);
console.log('PASS: Gate toggles 260/275px outer grid height and card overflow; vessel ranking style is restored.');

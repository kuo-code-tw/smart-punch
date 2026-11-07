'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'assets/port79-gate-home.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/port79-gate-home.css'),'utf8');
for(const key of ['p79HomeOperationsTab','p79HomeGateTab','p79HomeGatePanel','p79GateDay','p79GateWeek','p79GateMonth','p79GateYear','p79GatePrev','p79GateNext','p79GateTruckEntries']){
 assert(html.includes('id="'+key+'"'),key+' present in homepage');
}
assert(html.includes('port79-gate-home.js?v=20261107-gate-equal-height-v2'));
assert(html.includes('port79-gate-home.css?v=20261107-gate-equal-height-v2'));
assert(!html.includes('id="p79GateImportLink"'),'homepage Gate card is read-only; no upload or download actions');
assert(!html.includes('id="p79HomeStatTabs"'),'no whole-homepage tabs');
assert(css.includes('#p79Dashboard #p79HomeGatePanel[hidden]'),'new panel truly hidden by default');
assert(!js.includes('5344')&&!js.includes('1124'),'operational XLSX values must not be hard-coded in public source');
class Element{
 constructor(){this.textContent='';this.hidden=false;this.attrs={};this.listeners={};this.focused=false;this.classNames=new Set();this.classList={toggle:(name,enabled)=>{if(enabled)this.classNames.add(name);else this.classNames.delete(name);}};}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,fn){this.listeners[k]=fn;}
 focus(){this.focused=true;}
 click(){if(this.listeners.click)this.listeners.click();}
}
const ids=new Map();
function $(id){if(!ids.has(id))ids.set(id,new Element());return ids.get(id);}
const operationEls=[new Element(),new Element(),new Element(),new Element()];
const d={
 readyState:'complete',
 getElementById:$,
 querySelectorAll(q){assert.equal(q,'#p79Dashboard [data-p79-home-operations]');return operationEls;},
 addEventListener(){}
};
const storage={getItem(k){
 if(k==='port79_user_session')return JSON.stringify({role:'superadmin',empId:'TEST'});
 if(k==='port79_user_token')return 'TEST-TOKEN';
 return null;
}};
const win={document:d,sessionStorage:storage,Intl,Date,URL,console};
vm.runInNewContext(js,{window:win,globalThis:win,Intl,Date,URL,console}, {timeout:3000});
const api=win.P79GateStatsHome;
assert(api,'gate pager installed');
const rows=[
 {date:'2026-11-01',deliverEmpty:2,pickupEmpty:37,deliverLoaded:213,pickupLoaded:122,truckEntries:263},
 {date:'2026-11-02',deliverEmpty:166,pickupEmpty:164,deliverLoaded:498,pickupLoaded:357,truckEntries:981},
 {date:'2026-10-31',deliverEmpty:3,pickupEmpty:4,deliverLoaded:5,pickupLoaded:6,truckEntries:7}
];
const m=api.aggregateFor(rows,'2026','month','2026-11');
assert.equal(m.days,2);
assert.equal(m.totals.deliverEmpty,168);
assert.equal(m.totals.pickupEmpty,201);
assert.equal(m.totals.deliverLoaded,711);
assert.equal(m.totals.pickupLoaded,479);
assert.equal(m.totals.truckEntries,1244);
const daily=api.aggregateFor(rows,'2026','day','2026-11-02');
assert.equal(daily.days,1,'daily preview includes only selected date');
assert.equal(daily.totals.truckEntries,981);
const weekly=api.aggregateFor(rows,'2026','week','2026-11-02');
assert.equal(weekly.days,1,'weekly view uses Monday to Sunday');
assert.equal(weekly.totals.truckEntries,981);
assert.equal(api.rangeFor('week','2026-11-01').start,'2026-10-26','Sunday belongs to previous Monday week');
const y=api.aggregateFor(rows,'2026','year','2026-11');
assert.equal(y.days,3);
assert.equal(y.totals.truckEntries,1251);
const dup=api.aggregateFor([...rows,{...rows[0],truckEntries:300}],'2026','month','2026-11');
assert.equal(dup.days,2,'duplicate dates count once');
assert.equal(dup.totals.truckEntries,1281,'last corrected day replaces earlier day');
$('p79HomeGateTab').click();
assert.equal($('p79HomeGatePanel').hidden,false);
assert.equal($('p79RankingView').hidden,true,'only imported-vessel ranking is hidden');
assert(operationEls.every(e=>!e.hidden),'other homepage panels must remain visible');
assert.equal($('p79HomeGateTab').attrs['aria-selected'],'true');
assert($('p79Dashboard').classNames.has('p79-gate-view-active'),'Gate view activates natural card height');
$('p79GateDay').click();
assert.equal($('p79GateDay').attrs['aria-pressed'],'true');
$('p79GateWeek').click();
assert.equal($('p79GateWeek').attrs['aria-pressed'],'true');
$('p79GateYear').click();
assert.equal($('p79GateYear').attrs['aria-pressed'],'true');
$('p79GatePrev').click();
const expectedYear=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric'}).format(new Date()))-1;
assert($('p79GatePeriod').textContent.includes(String(expectedYear)),'year arrow moves backward one year');
$('p79HomeOperationsTab').click();
assert.equal($('p79HomeGatePanel').hidden,true);
assert.equal($('p79RankingView').hidden,false,'ranking card restored');
assert(operationEls.every(e=>!e.hidden),'whole homepage never changes visibility');
assert.equal($('p79HomeOperationsTab').attrs['aria-selected'],'true');
assert(!$('p79Dashboard').classNames.has('p79-gate-view-active'),'vessel list restores normal dashboard layout');
console.log('PASS: compact homepage gate tab, day/week/month/year paging, six KPIs, date dedupe, and private-data safeguards');

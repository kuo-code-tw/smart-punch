'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'gate-import/index.html'),'utf8');
const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
const live=fs.readFileSync(path.join(root,'assets/port79-gate-live.js'),'utf8');
new vm.Script(live);
for(const mode of ['Day','Week','Month','Year']){
 assert(html.includes('id="gateLiveMode'+mode+'"'));
 assert(html.includes('id="gateMode'+mode+'"'));
 assert(home.includes('id="p79Gate'+mode+'"'));
}
assert(html.includes('port79-gate-live.js?v=20261110-gate-month-follow-v2'));
assert(html.includes('id="gateLiveRows"')&&html.includes('id="gateLivePageNext"'));
assert(html.includes('#gateLivePanel .scroll{max-height:none;max-width:100%;overflow:visible}'));
assert(!live.includes('6535')&&!live.includes('5344'),'no official business values embedded');
class E{
 constructor(){this.attrs={};this.listeners={};this.dataset={};this.children=[];this.disabled=false;this._text='';}
 set textContent(v){this._text=v;if(v==='')this.children=[];}
 get textContent(){return this._text;}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,fn){this.listeners[k]=fn;}
 appendChild(el){this.children.push(el);}
 click(){this.listeners.click?.();}
}
const refs=new Map(),el=id=>{if(!refs.has(id))refs.set(id,new E());return refs.get(id);};
const doc={readyState:'complete',getElementById:el,createElement:()=>new E(),addEventListener(){}};
class Clock extends Date{
 constructor(...args){super(...(args.length?args:['2026-11-07T07:00:00Z']));}
 static now(){return new Date('2026-11-07T07:00:00Z').getTime();}
}
const fakeRows=[
 {date:'2026-11-01',deliverEmpty:1,pickupEmpty:2,deliverLoaded:3,pickupLoaded:4,truckEntries:5},
 {date:'2026-11-02',deliverEmpty:10,pickupEmpty:20,deliverLoaded:30,pickupLoaded:40,truckEntries:50}
];
let requests=[];
const win={
 document:doc,
 sessionStorage:{getItem(k){return {
  port79_user_session:JSON.stringify({role:'superadmin',empId:'TEST'}),
  port79_user_token:'TEST_TOKEN',
  port79_gas_url:'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec'
 }[k]||null;}},
 fetch:async url=>{
  requests.push(url);
  const year=new URL(url).searchParams.get('year');
  return {ok:true,json:async()=>({ok:true,source:'port79-gate-daily',year,rows:year==='2026'?fakeRows:[]})};
 }
};
vm.runInNewContext(live,{window:win,globalThis:win,Date:Clock,URL,Intl,console},{timeout:4000});
(async()=>{
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(el('gateLiveTotal').textContent,'110','monthly KPI is computed from official daily figures');
 assert.equal(el('gateLiveTruck').textContent,'55','trucks are distinct from containers');
 assert.equal(el('gateLiveRows').children.length,2,'month shows daily detail');
 win.P79GateLive.changeMode('day');
 assert.equal(el('gateLiveTotal').textContent,'100','daily view selects latest available date in month');
 win.P79GateLive.changeMode('week');
 assert.equal(el('gateLiveTotal').textContent,'100','weekly view starts on Monday');
 assert.equal(win.P79GateLive.range('week','2026-11-01').start,'2026-10-26');
 win.P79GateLive.changeMode('year');
 assert.equal(el('gateLiveTotal').textContent,'110');
 assert.equal(el('gateLiveRows').children.length,1,'annual view groups by month');
 assert.equal(requests.length,1,'switching cached periods does not repeat cloud reads');
 await win.P79GateLive.refresh();
 assert.equal(requests.length,2,'explicit refresh re-reads official cloud data');
 fakeRows.push({date:'2026-10-15',deliverEmpty:2,pickupEmpty:3,deliverLoaded:4,pickupLoaded:5,truckEntries:6});
 await win.P79GateLive.refresh('2026-10-15');
 assert.equal(el('gateLiveMonth').value,'2026-10');
 assert.equal(el('gateLiveTotal').textContent,'14','import of another month changes visible month');
 el('gateLiveMonth').value='2026-11';el('gateLiveMonth').listeners.change.call(el('gateLiveMonth'));
 assert.equal(el('gateLiveTotal').textContent,'110','month picker loads selected month only');
 await win.P79GateLive.refresh('2025-12-31');
 assert.equal(new URL(requests.at(-1)).searchParams.get('year'),'2025','cross-year import fetches imported year');
 assert.equal(el('gateLiveMonth').value,'2025-12');
 console.log('PASS: Gate vessel tab reads cloud daily data; four periods, month rollup, truck separation and cache.');
})().catch(error=>{console.error(error);process.exitCode=1;});

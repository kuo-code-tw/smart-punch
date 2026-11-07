'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const file=path.join(__dirname,'../assets/port79-google-sheet-schedule.js');
const code=fs.readFileSync(file,'utf8');
new vm.Script(code);
const HOUR=60*60*1000;
let clock=1794060000000,network=0,nextTimer=1;
class ClockDate extends Date{static now(){return clock;}}
const store=new Map(),timers=new Map(),events={},elements=new Map();
const element=id=>{
 if(!elements.has(id))elements.set(id,{
  id,dataset:{gasUrl:'https://script.google.com/macros/s/DEPLOYED-TEST/exec'},
  innerHTML:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}
 });
 return elements.get(id);
};
const win={
 document:null,CustomEvent:class{constructor(type){this.type=type;}},
 localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},
 sessionStorage:{getItem:()=>null},
 setTimeout(fn,ms){const id=nextTimer++;timers.set(id,{fn,ms});return id;},
 clearTimeout(id){timers.delete(id);},
 addEventListener(type,fn){events[type]=fn;}
};
const doc={
 readyState:'complete',visibilityState:'visible',getElementById:element,
 createElement(){return {src:'',remove(){}};},
 head:{appendChild(script){
  network++;
  const callback=new URL(script.src).searchParams.get('callback');
  assert(callback&&typeof win[callback]==='function','anonymous public JSONP callback');
  win[callback]({ok:true,source:'port79-wanhai-vessel',lastSync:clock,
   rows:[{name:'WAN HAI 288',localName:'示例中文船名',
    etb:'2099/11/07 09:02',etd:'2099/11/08 00:00',berth:'W80'}]});
 }},
 addEventListener(type,fn){events[type]=fn;},dispatchEvent(){}
};
win.document=doc;
function mount(){
 vm.runInNewContext(code,{window:win,Date:ClockDate,URL,Intl,console},{timeout:3000});
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
(async()=>{
 mount();await flush();
 assert.equal(network,1,'first visit fetches official schedule');
 assert(store.has('p79_public_ship_schedule_hourly_v1'),'only public schedule is cached');
 assert(element('p79DashVesselNotices').innerHTML.includes('WAN HAI 288'),'render official rows');
 assert([...timers.values()].some(t=>t.ms===HOUR),'schedule next check in one hour');
 clock+=10*60*1000;
 events.visibilitychange();events.online();await flush();
 assert.equal(network,1,'focus or online within one hour must not poll');
 const hourly=[...timers].find(([,t])=>t.ms===50*60*1000);
 assert(hourly,'remaining wait is 50 minutes');
 clock+=50*60*1000;
 timers.delete(hourly[0]);hourly[1].fn();await flush();
 assert.equal(network,2,'automatically poll at one-hour mark');
 clock+=5*60*1000;
 timers.clear(); // a browser navigation cancels timers from the previous page
 mount();await flush();
 assert.equal(network,2,'reload within the hour must reuse public cache');
 const manual=element('p79PublicShipRefresh');
 assert.equal(typeof manual.handlers.click,'function');
 manual.handlers.click();await flush();
 assert.equal(network,3,'explicit manual update can bypass hour limit');
 doc.visibilityState='hidden';events.visibilitychange();
 assert(![...timers.values()].some(t=>t.ms>=HOUR),'hidden page does not actively poll');
 clock+=2*HOUR;
 doc.visibilityState='visible';events.visibilitychange();await flush();
 assert.equal(network,4,'returning to visible tab only fetches when overdue');
 assert(!code.includes('300000'),'five-minute timer must not return');
 console.log('PASS: Wan Hai ship schedule hourly automatic reads, visibility limit, cache reload and manual refresh');
})().catch(error=>{console.error(error);process.exitCode=1;});

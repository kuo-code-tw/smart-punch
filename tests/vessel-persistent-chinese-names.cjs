'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-google-sheet-schedule.js','utf8');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const cache=new Map(),events={},timers=[],nodes={};let payload,reads=0;
nodes.p79PublicShipBoard={id:'p79PublicShipBoard',dataset:{gasUrl:'https://script.google.com/macros/s/TEST/exec'},addEventListener(){}};
const doc={readyState:'loading',visibilityState:'visible',getElementById:id=>nodes[id],addEventListener:(name,fn)=>events[name]=fn,dispatchEvent(){},
 createElement:()=>({remove(){}}),head:{appendChild(s){reads++;window[new URL(s.src).searchParams.get('callback')](payload);}}};
const window={document:doc,localStorage:{getItem:k=>cache.get(k),setItem:(k,v)=>cache.set(k,v)},sessionStorage:{getItem:()=>null},
 setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},addEventListener(){},CustomEvent:class{}};
vm.runInNewContext(source,{window,URL,Intl,Date,Promise,Uint32Array});
const api=window.P79ManualShipSchedule;
payload={ok:true,source:'port79-wanhai-vessel',lastSync:Date.now(),chineseNames:{WANHAI178:'闊春',WANHAI376:'宙春',INVALID:'not Chinese'},rows:[{name:'WAN HAI 276',localName:'越春',berth:'W80',etd:'2099/11/07 10:00'}]};
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
(async()=>{
 events.DOMContentLoaded();await settle();
 assert.equal(api.getChineseName('WAN HAI 178'),'闊春');assert.equal(api.getChineseName('wan-hai 376'),'宙春');
 assert.equal(api.getChineseName('WAN HAI 999'),'');assert.equal(api.getChineseName('INVALID'),'');
 assert.equal(payload.rows.length,1,'historical names never become fake sailing rows');
 payload={...payload,chineseNames:{},rows:[]};await api.refresh();assert.equal(api.getChineseName('WAN HAI 178'),'闊春','name survives disappearance from current schedule');
 const tick=timers.find(t=>t.ms===300000).fn,before=reads;doc.visibilityState='hidden';tick();await settle();assert.equal(reads,before);
 doc.visibilityState='visible';events.visibilitychange();await settle();assert.equal(reads,before+1);
 const start=html.indexOf('function p79VesselChineseName('),end=html.indexOf('// 輕量即時檢查專用',start);
 assert(start>=0&&end>start);const store={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)};
 const context={shipMasters:[],localStorage:store,sessionStorage:store,apiGetQuick:async()=>({...payload,chineseNames:{WANHAI178:'闊春',WANHAI376:'宙春'}}),renderVesselSummary(){},console,Date};
 vm.createContext(context);vm.runInContext(html.slice(start,end),context);await context.p79RefreshOfficialVesselNames();
 assert.equal(context.p79VesselChineseDisplay({vessel:'WAN HAI 178'}),'闊春');
 assert.equal(context.p79VesselChineseDisplay({vessel:'WAN HAI 376'}),'宙春');
 assert.equal(context.p79VesselChineseDisplay({vessel:'WAN HAI 178',chineseName:'既有核對名稱'}),'既有核對名稱');
 console.log('PASS persistent names for departed vessels, month report lookup, five-minute refresh, hidden-page pause, and unknown-name protection');
})().catch(e=>{console.error(e);process.exitCode=1;});

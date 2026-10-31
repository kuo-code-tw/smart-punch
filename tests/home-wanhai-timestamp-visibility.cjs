'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(dir,'assets/port79-google-sheet-schedule.js'),'utf8');
const css=fs.readFileSync(path.join(dir,'assets/port79-reference-dashboard.css'),'utf8');
const controls={};
const elements={};
for(const id of ['p79DashVesselNotices','p79PublicShipBoard','p79PublicShipRefresh','p79PublicShipAll','p79ShipScheduleAll','p79DashRefresh']){
 elements[id]={id,innerHTML:'',className:'',dataset:{gasUrl:'https://script.google.com/macros/s/EXAMPLE/exec'},addEventListener(type,fn){controls[id+':'+type]=fn}};
}
const handlers={};
const publicData={ok:true,source:'port79-wanhai-vessel',lastSync:1793440000000,rows:[{
 name:'WAN HAI 271',localName:'百春',inVoyage:'N269',outVoyage:'N269',
 eta:'2026/10/29 08:30',etb:'2026/10/31 02:00',etd:'2026/10/31 16:00',berth:'W79'
}]};
const doc={readyState:'loading',getElementById:id=>elements[id]||null,
 addEventListener(type,fn){handlers[type]=fn},
 createElement(){return {remove(){},async:false,referrerPolicy:''}},
 head:{appendChild(el){
   const callback=new URL(el.src).searchParams.get('callback');
   assert.equal(typeof window[callback],'function','authenticated-independent public callback');
   window[callback](publicData);
 }}};
const window={document:doc,sessionStorage:{getItem(){return null}},crypto:{getRandomValues(arr){for(let i=0;i<arr.length;i++)arr[i]=12345+i;return arr}},
 setTimeout(fn){return 7},clearTimeout(){}};
vm.runInNewContext(source,{window,URL,Uint32Array,Intl,Date,Promise,Set});
assert.equal(typeof handlers.DOMContentLoaded,'function');
handlers.DOMContentLoaded();
(async()=>{
 for(let i=0;i<12;i++)await Promise.resolve();
 for(const id of ['p79DashVesselNotices','p79PublicShipBoard']){
  const html=elements[id].innerHTML;
  assert(html.includes('WAN HAI 271'),id+' ship must render');
  for(const [date,time] of [['2026/10/29','08:30'],['2026/10/31','02:00'],['2026/10/31','16:00']]){
   assert(html.includes('<span class="p79-wanhai-date">'+date+'</span><span class="p79-wanhai-clock">'+time+'</span>'),id+' '+date+' '+time+' must be visible separately');
  }
  assert(html.includes('title="2026/10/31 16:00"'),'unmodified time retained for tooltip');
  assert(html.includes('W79'),'berth retained');
 }
 assert(css.includes('grid-auto-rows:auto!important;'),'grid row follows normal vessel trend height');
 assert(css.includes('height:auto!important;min-height:310px!important;max-height:none!important;'),'cards use shared compact height rather than forced huge height');
 assert(css.includes('overflow:visible!important;text-overflow:clip!important;'),'time no ellipsis');
 assert(css.includes('max-width:620px'),'small screens have own layout');
 assert(!css.includes('grid-auto-rows:620px!important;')&&!css.includes('grid-auto-rows:440px!important;'),'oversized fixed rows prohibited');
 console.log('PASS: employee + admin see full date and HH:mm; cards follow normal trend height; no ellipsis; responsive CSS.');
})().catch(e=>{console.error(e);process.exitCode=1});

'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('assets/port79-google-sheet-schedule.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const controls={},nodes={},handlers={};
for(const id of ['p79PublicShipBoard','p79DashVesselNotices','p79PublicShipRefresh','p79PublicShipAll',
 'p79ShipScheduleAll','p79DashRefresh']){
 nodes[id]={id,innerHTML:'',className:'',dataset:{gasUrl:'https://script.google.com/macros/s/EXAMPLE/exec'},
 addEventListener(type,handler){controls[id+':'+type]=handler}};
}
const official={
 ok:true,source:'port79-wanhai-vessel',lastSync:1793510000000,rows:[
 {name:'WAN HAI 178',localName:'萬春',etb:'2026/11/02 16:30',etd:'2026/11/03 02:30',berth:'W80'},
 {name:'WAN HAI 316',localName:'',etb:'2026/11/03 08:30',etd:'2026/11/03 21:00',berth:'W80'},
 {name:'WAN HAI 105',VesselName:'萬和',etb:'2026/11/04 07:00',etd:'2026/11/05 00:30',berth:'W79'},
 {name:'WAN HAI 103',localName:'WAN HAI 103',etb:'2026/11/04 09:00',etd:'2026/11/05 00:30',berth:'W80'}
]};
let dialog;
const body={innerHTML:'',querySelector:()=>null};
const doc={
 readyState:'loading',getElementById:id=>nodes[id]||(id==='p79PublicShipDialogBody'?body:null),
 addEventListener(type,handler){handlers[type]=handler},
 createElement(tag){
  if(tag==='script')return {remove(){},async:false,referrerPolicy:''};
  if(tag==='dialog'){
   dialog={id:'',innerHTML:'',open:false,setAttribute(){},addEventListener(){},close(){this.open=false},
    showModal(){this.open=true}};
   return dialog;
  }
  throw Error('Unexpected element '+tag);
 },
 head:{appendChild(tag){
  const callback=new URL(tag.src).searchParams.get('callback');
  window[callback](official);
 }},
 body:{appendChild(el){nodes[el.id]=el}}
};
const window={document:doc,sessionStorage:{getItem:()=>null},
 crypto:{getRandomValues(arr){for(let i=0;i<arr.length;i++)arr[i]=32000+i;return arr}},
 setTimeout:()=>1,clearTimeout(){}};
class FixtureDate extends Date{static now(){return Date.parse('2026-11-02T00:00:00Z');}}
vm.runInNewContext(script,{window,URL,Intl,Promise,Set,Date:FixtureDate,Uint32Array});
const parsed=window.P79ManualShipSchedule.parseRows(official.rows);
assert.equal(parsed[0].localName,'萬春','keep the actual published Chinese name');
assert.equal(parsed[1].localName,'','do not infer a Chinese name');
assert.equal(parsed[2].localName,'萬和','support legacy provider VesselName field');
assert.equal(parsed[3].localName,'','English-only provider field is not a Chinese name');
assert.equal(typeof handlers.DOMContentLoaded,'function');
handlers.DOMContentLoaded();
(async()=>{
 for(let i=0;i<10;i++)await Promise.resolve();
 assert(nodes.p79PublicShipBoard.innerHTML.includes('中文：萬春'),'staff card displays Chinese name');
 assert(nodes.p79DashVesselNotices.innerHTML.includes('中文：萬春'),'dashboard card displays Chinese name');
 assert.equal(typeof controls['p79PublicShipAll:click'],'function');
 controls['p79PublicShipAll:click']();
 assert.equal(dialog.open,true,'dialog opened');
 assert(dialog.innerHTML.includes('p79PublicShipDialogBody'));
 const table=body.innerHTML;
 for(const heading of ['英文船名','中文船名','靠泊碼頭','靠泊時間 ETB','離岸時間 ETD'])
  assert(table.includes('<th>'+heading+'</th>'),'table heading '+heading);
 assert(table.includes('<td>WAN HAI 178</td><td>萬春</td><td>W80</td>'),'English and Chinese names are independent cells');
 assert(table.includes('<td>WAN HAI 316</td><td>未提供</td>'),'missing name is explicitly missing');
 assert(table.includes('<td>WAN HAI 105</td><td>萬和</td>'),'legacy provider name shown only if Chinese');
 assert(table.includes('<td>WAN HAI 103</td><td>未提供</td>'),'no made-up name from English');
 assert.equal(official.rows[1].localName,'','source data never mutated');
 assert(/port79-google-sheet-schedule\.js\?v=\d{8}-[a-z0-9-]+/i.test(html),
  'bust old browser cache for new schedule UI');
 assert(script.includes("data?.source!=='port79-wanhai-vessel'"),
  'only accepted official-source payloads');
 assert(!script.includes("src.searchParams.set('token'"),
  'public endpoint does not transmit staff credentials');
 console.log('PASS bilingual official ship names on staff/admin cards and detailed schedule; missing names transparent and protected');
})().catch(error=>{console.error(error);process.exitCode=1});

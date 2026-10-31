'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../assets/port79-google-sheet-schedule.js'),'utf8');
const w={document:{readyState:'loading',addEventListener(){}}};
vm.runInNewContext(src,{window:w,URL,Intl,Date,Uint32Array});
const parse=w.P79ManualShipSchedule.parseRows;
const records=[
 {name:'WAN HAI 178',localName:'萬春',inVoyage:'N076',outVoyage:'S077',eta:'2026/11/02 14:00',etb:'2026/11/02 15:00',etd:'2026/11/03 01:00',berth:'W80'},
 {name:'CAPE FELTON',localName:'',etb:'2026/11/02 20:00',etd:'2026/11/03 10:00',berth:'W64'},
 {name:'',localName:'',etb:'',etd:'',berth:'W99'},
 {name:'MISSING TIMES',etb:'',etd:'',berth:''}
];
const rows=parse(records);
assert.equal(rows.length,2);
assert.equal(rows[0].name,'WAN HAI 178');
assert.equal(rows[0].etb,'2026/11/02 15:00');
assert.equal(rows[0].eta,'2026/11/02 14:00','WAN HAI original ETA is arrival ETA');
assert.equal(rows[0].inVoyage,'N076');assert.equal(rows[0].outVoyage,'S077');
assert.equal(rows[0].berth,'W80');
assert.equal(rows[1].berth,'W64');
assert(src.includes("data?.source!=='port79-wanhai-vessel'"),'reject port authority data from front-end');
new vm.Script(src);
console.log('PASS: WAN HAI ETA/ETB/ETD/voyages/berth survive; invalid rows filtered.');
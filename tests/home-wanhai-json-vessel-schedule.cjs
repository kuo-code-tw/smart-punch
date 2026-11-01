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
// Source can keep all six official records, while the public board excludes
// a past-ETD vessel without pretending that its real departure was verified.
const checkTime=Date.UTC(2026,10,1,6,25,0); // 2026/11/01 14:25 Asia/Taipei
const official=parse([
 {name:'WAN HAI 271',etb:'2026/10/31 02:00',etd:'2026/10/31 16:00',berth:'W79'},
 {name:'WAN HAI 376',etb:'2026/11/02 00:00',etd:'2026/11/03 00:30',berth:'W79'},
 {name:'NO ETD',etb:'2026/11/01 12:00',etd:'',berth:'W80'}
]);
const current=w.P79ManualShipSchedule.selectCurrentRows(official,checkTime);
assert.equal(official.length,3,'raw source records preserved');
assert.equal(current.expiredCount,1,'expired ETD row excluded from current board');
assert.equal(current.rows.length,2);
assert(!current.rows.some(r=>r.name==='WAN HAI 271'));
assert(current.rows.some(r=>r.name==='WAN HAI 376'));
assert(current.rows.some(r=>r.name==='NO ETD'),'unknown ETD is not invented');
assert.equal(w.P79ManualShipSchedule.parseTaipeiTime('2026/10/31 16:00'),Date.UTC(2026,9,31,8));
assert(Number.isNaN(w.P79ManualShipSchedule.parseTaipeiTime('2026/11/31 16:00')));
assert(src.includes("data?.source!=='port79-wanhai-vessel'"),'reject port authority data from front-end');
new vm.Script(src);
console.log('PASS: WAN HAI ETA/ETB/ETD/voyages/berth survive; invalid rows filtered.');
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const model=require('../assets/port79-monthly-dashboard.js');
const input=[
 {workingNo:'A',shipName:'即將到港',voyageE:'V123',eta:'2026-11-02 09:30',etd:'2026-11-03 18:00',wharf:'79號碼頭',status:'預定'},
 {workingNo:'B',shipName:'有作業資料',voyageI:'V789',firstDate:'2026-10-14',lastDate:'2026-10-15'},
 {workingNo:'C',shipName:'未提供船期'},
 {workingNo:'D',shipName:'已刪除',eta:'2026-11-01',deleted:true},
 {workingNo:'E',shipName:'無效日期',eta:'2026-02-30'},
 {workingNo:'F',shipName:'有預計離港',etd:'2026/11/04 21:05'}
];
const before=JSON.stringify(input),rows=model.shipScheduleRows(input,'2026-10-31');
assert.equal(JSON.stringify(input),before,'display model must never mutate source masters');
assert.equal(rows.length,5,'deleted masters cannot appear in the ship board');
assert.equal(rows[0].name,'即將到港','earliest upcoming ETA should be first');
assert.equal(rows[0].dateLabel,'預計抵港');
assert.equal(rows[0].eta,'2026-11-02 09:30');
assert.equal(rows[0].etd,'2026-11-03 18:00');
assert.equal(rows[0].wharf,'79號碼頭');
assert.equal(rows[1].dateLabel,'預計離港');
assert.equal(rows[1].etd,'2026-11-04 21:05');
const work=rows.find(x=>x.name==='有作業資料');
assert.equal(work.eta,'','actual work date must not masquerade as ETA');
assert.equal(work.etd,'','actual work date must not masquerade as ETD');
assert.equal(work.dateLabel,'作業首日');
assert.equal(work.workEnd,'2026-10-15');
assert.equal(rows.find(x=>x.name==='無效日期').eta,'','invalid ETA must not display');
assert.equal(rows.find(x=>x.name==='未提供船期').dateLabel,'日期未提供','unknown times must remain unknown');
const report=model.analyzeVessels({shipMasters:input,records:[]});
assert.equal(report.scheduleRows.length,5,'same loaded monthly ship masters should drive the board');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const view=fs.readFileSync(path.join(__dirname,'../assets/port79-reference-dashboard.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../assets/port79-reference-dashboard.css'),'utf8');
assert(html.includes('<b>船期看板</b>'));
assert(html.includes('id="p79ShipScheduleAll"'));
assert(!html.includes('船舶作業重點提醒'));
assert(html.includes('port79-reference-dashboard.js?v=20261031-ship-schedule-board-v1'));
assert(html.includes('port79-monthly-dashboard.js?v=20261031-ship-schedule-board-v1'));
assert(view.includes('renderShipSchedule(v,ym)'),'board must be rendered from the existing monthly snapshot');
assert(view.includes('function openShipSchedule(index=-1)'),'click opens the full-list modal');
assert(view.includes("['船名','航次','碼頭','預計抵港 ETA','預計離港 ETD','作業首日','作業末日','狀態']"));
assert(!view.includes('setInterval(')&&!view.includes('fetch('),'board must not add automatic data fetching');
assert(view.includes('esc(s.name)')&&view.includes('esc(r.name)'),'user-provided ship names must be escaped');
assert(css.includes('#p79ShipScheduleDialog')&&css.includes('.p79-schedule-row'),'board and dialog styles exist');
new vm.Script(view);
console.log('PASS: actual ETA/ETD versus recorded work dates, month snapshot, missing/invalid/deleted cases, safe clickable board, no automatic refresh');

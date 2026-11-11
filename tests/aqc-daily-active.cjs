'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-aqc-daily-active.js','utf8');
const ctx={window:{},Date,Intl,console};vm.runInNewContext(source,ctx);
const c=ctx.window.P79AqcDaily.calculate;
const d=s=>Date.parse(s+'+08:00');
const record=(unit,from,to,source='WORKING REPORT')=>({unit,start:d(from),end:d(to),source});
const raw=[
 record('AQC7901','2026-11-09T08:00:00','2026-11-09T16:00:00'),
 record('7901','2026-11-09T16:00:00','2026-11-09T20:00:00'), // same rod, another shift
 record('7902','2026-11-09T14:00:00','2026-11-10T02:00:00'), // crosses midnight
 record('8002','2026-11-09T08:00:00','2026-11-09T15:00:00'),
 record('8005','2026-11-10T09:00:00','2026-11-10T14:00:00'),
 record('7904','2026-11-09T08:00:00','2026-11-09T09:00:00'), // not installed
 record('8010','2026-11-09T08:00:00','2026-11-09T09:00:00'), // not installed
 record('7903','2026-11-11T00:00:00','2026-11-11T04:00:00'), // outside requested range
 record('8001','2026-11-08T23:00:00','2026-11-09T00:00:00'), // midnight ends = no 11/09
 {unit:'7905',start:NaN,end:NaN}
];
const r=c(raw,'2026-11-09','2026-11-10');
assert.equal(r.days.length,2);
assert.equal(r.days[0].n79,2);assert.equal(r.days[0].n80,1);assert.equal(r.days[0].total,3);
assert.equal(r.days[1].n79,1);assert.equal(r.days[1].n80,1);assert.equal(r.days[1].total,2);
assert.equal(r.activeDays,2);
assert.deepEqual([...r.distinct79],['7901','7902']);assert.deepEqual([...r.distinct80],['8002','8005']);
assert.equal(r.intervalCount,5);
assert.equal(ctx.window.P79AqcDaily.unitOf('AQC 08002'),'8002');
assert.throws(()=>c(raw,'2026-11-10','2026-11-09'),/起訖日期/);
assert.throws(()=>c(raw,'2026-11-01','2027-02-02'),/93 天/);
assert.deepEqual([...c([], '2026-11-11','2026-11-11').days.map(x=>x.total)],[0]);
// Default display is the complete current calendar month, not a rolling seven-day window.
const monthWindow=ctx.window.P79AqcDaily.monthWindow;
assert.deepEqual({...monthWindow('2026-11-11')},{start:'2026-11-01',end:'2026-11-30'});
assert.deepEqual({...monthWindow('2026-02-11')},{start:'2026-02-01',end:'2026-02-28'});
assert.deepEqual({...monthWindow('2028-02-11')},{start:'2028-02-01',end:'2028-02-29'});
assert.deepEqual({...monthWindow('2026-12-31')},{start:'2026-12-01',end:'2026-12-31'});
assert.equal(c([],monthWindow('2026-11-11').start,monthWindow('2026-11-11').end).days.length,30);
assert.equal(c([],monthWindow('2028-02-11').start,monthWindow('2028-02-11').end).days.length,29);
const renderSource=source.slice(source.indexOf('function render(){'),source.indexOf('function exportCsv(){'));
assert(!renderSource.includes("dailyAqcStart').value="),'rerender must not reset user-selected start');
assert(!renderSource.includes("dailyAqcEnd').value="),'rerender must not reset user-selected end');
assert(source.includes("dailyAqcStart').addEventListener('change',render)"));
assert(source.includes("dailyAqcEnd').addEventListener('change',render)"));
console.log('PASS AQC daily active: true physical AQC dedup, day split, midnight boundary, physical inventories, permissions-safe pure compute and range limits');
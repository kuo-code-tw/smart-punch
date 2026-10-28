'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const lib=fs.readFileSync('assets/port79-aqc-concurrent.js','utf8');
const app=fs.readFileSync('assets/port79-aqc-multi-rod.js','utf8');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
new Function('window',lib);new Function('window',app);
assert(html.includes('data-tab="multi-rod"'));
assert(html.indexOf('port79-aqc-concurrent.js')<html.indexOf('port79-aqc-multi-rod.js'));
assert(app.includes('function concurrentResult()'));
assert(app.includes("const result=concurrentResult()"));
assert(!app.includes('>補登船舶資料</button>'),'no redundant add-vessel button');
assert(app.includes('同桿跨船接桿核對'),'audit per-unit finish/start transitions');
assert(app.includes("const scope=identity(),result=concurrentResult(),rows=g.P79AqcConcurrent?.groupSegments(result.rows)||result.rows;"),"Excel must consolidate by ship pair, not duplicate source segments");
assert(app.includes('不能證明同時作業'),'source overlaps must not be claimed as actual concurrency');
assert(app.includes('上限／來源'),'physical limit remains visible in the compact single-line toolbar');
assert(app.includes('來源時間重疊桿數（非已確認）'),'Excel must differentiate source overlaps from actual activity');
const win={};new Function('window',lib)(win);const calc=win.P79AqcConcurrent;
const at=Date.parse('2026-10-28T17:00:00+08:00');
const record=(number,ship,start,end,date='2026-10-28',workingNo=ship)=>({
 source:'working-report',number:String(number),shipName:ship,workingNo,workDate:date,startTime:start,endTime:end
});
const compute=(records,masters=[],manual=[],min=4,mode='day')=>calc.compute(calc.index(records,masters,at),manual,{date:'2026-10-28',min,mode});
const a=[record(101,'A','08:00','12:00'),record(102,'A','08:00','12:00'),record(103,'B','09:00','11:00'),record(104,'B','09:00','11:00')];
let out=compute(a);
assert.equal(out.rows.length,1,'2+2 cross-vessel should be one concurrent window');
assert.equal(out.rows[0].start,'2026-10-28T09:00');
assert.equal(out.rows[0].end,'2026-10-28T11:00');
assert.equal(out.rows[0].totalRods,4);
assert.equal(out.rows[0].shipCount,2);
assert.deepEqual(out.rows[0].ships.map(s=>s.rods),[2,2]);
assert.equal(out.rows[0].containers,null,'do not fabricate interval cargo volume');
out=compute([record(101,'A','08:00','09:00'),record(102,'A','08:00','09:00'),record(103,'B','09:00','11:00'),record(104,'B','09:00','11:00')]);
assert.equal(out.rows.length,0,'adjacent, non-overlapping vessels must not count');
out=compute([record(101,'A','08:00','12:00'),record(102,'A','08:00','12:00'),record(101,'B','09:00','11:00'),record(104,'B','09:00','11:00')]);
assert.equal(out.rows.length,0,'same physical AQC cannot be on two ships at once');
const night=[101,102].map(n=>record(n,'A','23:00','03:00','2026-10-27')).concat([103,104].map(n=>record(n,'B','00:00','02:00')));
out=compute(night);
assert.equal(out.rows.length,1,'cross-midnight overlaps belong to the following day');
assert.equal(out.rows[0].start,'2026-10-28T00:00');
assert.equal(out.rows[0].end,'2026-10-28T02:00');
const masters=[
 {workingNo:'S1',vessel:'A',aqcs:[101,102].map(n=>({number:n,commence:'2026-10-28T08:00:00+08:00',complete:'2026-10-28T12:00:00+08:00'}))},
 {workingNo:'S2',vessel:'B',aqcs:[103,104].map(n=>({number:n,commence:'2026-10-28T09:00:00+08:00',complete:'2026-10-28T11:00:00+08:00'}))}
];
out=compute([],masters);
assert.equal(out.rows.length,1,'WORKING SHEET timed crane entries must be supported');
assert.equal(out.rows[0].totalRods,4);
const configOnly=[{workingNo:'C1',vessel:'C',aqcCount:6,firstDate:'2026-10-28',lastDate:'2026-10-28'}];
out=compute([],configOnly);
assert.equal(out.rows.length,0,'configured cranes are not proof of simultaneous operation');
assert.equal(out.pending.length,1,'unverified configured cranes remain visible in diagnostics');
const manual=[{id:'M1',ship:'A',start:'2026-10-28T08:00',end:'2026-10-28T12:00',rods:2,containers:200,hatches:2,shiftMoves:1}];
out=compute(a,[],manual);
assert.equal(out.rows.length,1,'manual A row must replace—not add to—cached A cranes');
assert.equal(out.rows[0].totalRods,4);
assert.equal(out.rows[0].ships.length,2);
assert.equal(out.rows[0].containers,null,'manual vessel-wide count must not be attributed to partial concurrent window');
out=compute(a,[],[],5);
assert.equal(out.rows.length,0,'custom threshold 5 suppresses 4 concurrent cranes');
// A screenshot-like three-vessel case: four overlapping cranes plus one older
// crane whose WORKING SHEET actually ended BEFORE 00:23.
const oldCrane=[record(8003,'WAN HAI 277','00:23','01:56','2026-10-06','W277'),
 record(8005,'WAN HAI 277','00:23','01:56','2026-10-06','W277'),
 record(7903,'WAN HAI 288','00:23','01:56','2026-10-06','W288'),
 record(7905,'WAN HAI 288','00:23','01:56','2026-10-06','W288'),
 record(7902,'WAN HAI 271','00:23','01:56','2026-10-06','W271')];
const olderMaster=[{vessel:'WAN HAI 271',workingNo:'W271',aqcs:[{number:7902,
 commence:'2026-10-06T00:00:00+08:00',complete:'2026-10-06T00:20:00+08:00'}]}];
let oldResult=calc.compute(calc.index(oldCrane,olderMaster,at),[],{date:'2026-10-06',min:4});
assert.equal(oldResult.rows.length,1);
assert.equal(oldResult.rows[0].totalRods,4,'finished previous-vessel crane must not become phantom fifth');
assert.equal(oldResult.rows[0].shipCount,2);
assert.deepEqual(oldResult.rows[0].ships.map(s=>s.ship),['WAN HAI 277','WAN HAI 288']);
let incomplete=calc.compute(calc.index(oldCrane,[],at),[],{date:'2026-10-06',min:4});
assert.equal(incomplete.rows.length,1);
assert.equal(incomplete.rows[0].totalRods,5);
assert.equal(incomplete.rows[0].needsReview,true,'report-only five rods must be marked unverified');
assert.equal(incomplete.rows[0].displayRods,null,'must not display five as actual work at a four-crane port');
assert.equal(incomplete.rows[0].physicalCapacity,4);
// Five overlapping WORKING SHEET service intervals do NOT prove five cranes ran
// concurrently when the confirmed physical capacity is four.
const verified=[{workingNo:'V1',vessel:'CONFIRMED',aqcs:[101,102,103,104,105].map(number=>({
 number,commence:'2026-10-06T08:00:00+08:00',complete:'2026-10-06T11:00:00+08:00'}))}];
const real5=calc.compute(calc.index([],verified,at),[],{date:'2026-10-06',min:4});
assert.equal(real5.rows[0].totalRods,5,'source intervals may show five overlapping');
assert.equal(real5.rows[0].displayRods,null,'physical four-crane limit must flag even five sheet intervals');
assert.equal(real5.rows[0].capacityConflict,true);
assert.equal(real5.peak,4);
const future5=calc.compute(calc.index([],verified,at),[],{date:'2026-10-06',min:4,capacity:5});
assert.equal(future5.rows[0].displayRods,5,'new physical capacity can be configured when equipment expands');
assert.equal(future5.rows[0].capacityConflict,false);
// Matching must still work when cloud WORKING NO differs but name + voyage + AQC match.
const mismatchedNo=oldCrane.map(x=>x.shipName==='WAN HAI 271'?{...x,workingNo:'LEGACY-OTHER',voyageE:'S268',shipName:'WAN HAI 271 S268'}:x);
const matchingMaster=[{...olderMaster[0],voyageE:'S268'}];
const reconciled=calc.compute(calc.index(mismatchedNo,matchingMaster,at),[],{date:'2026-10-06',min:4});
assert.equal(reconciled.rows.length,1);
assert.equal(reconciled.rows[0].totalRods,4,'name+voyage match should beat stale WORKING NO and exclude finished AQC');
console.log('PASS: AQC cross-ship handoff and physical capacity enforced; future capacity changes tested');

// Verified 2026-10-13/14 screenshot: 7905 finishes at 03:01, so five rods
// exist up to but NOT after the finish boundary.
const octoberMasters=[
 {vessel:'WAN HAI 316',workingNo:'M316',aqcs:[
  {number:8002,commence:'2026-10-13T11:23:00+08:00',complete:'2026-10-14T08:42:00+08:00'},
  {number:8003,commence:'2026-10-13T11:27:00+08:00',complete:'2026-10-14T10:30:00+08:00'}]},
 {vessel:'WAN HAI 292',workingNo:'M292',aqcs:[
  {number:7902,commence:'2026-10-13T13:54:00+08:00',complete:'2026-10-14T08:10:00+08:00'},
  {number:7903,commence:'2026-10-13T13:56:00+08:00',complete:'2026-10-14T08:04:00+08:00'},
  {number:7905,commence:'2026-10-13T16:36:00+08:00',complete:'2026-10-14T03:01:00+08:00'}]}
];
const octoberIndex=calc.index([],octoberMasters,at);
const day13=calc.compute(octoberIndex,[],{date:'2026-10-13',mode:'day',min:4});
const day14=calc.compute(octoberIndex,[],{date:'2026-10-14',mode:'day',min:4});
assert.deepEqual(day13.rows.map(x=>[x.start,x.end,x.totalRods]),[
 ['2026-10-13T13:56','2026-10-13T16:36',4],
 ['2026-10-13T16:36','2026-10-14T00:00',5]
],'10/13: five begins only when AQC 7905 starts at 16:36');
assert.deepEqual(day14.rows.map(x=>[x.start,x.end,x.totalRods]),[
 ['2026-10-14T00:00','2026-10-14T03:01',5],
 ['2026-10-14T03:01','2026-10-14T08:04',4]
],'10/14: once 7905 finishes at 03:01 count MUST drop from five to four');
assert(!day14.rows.some(x=>x.totalRods===5&&x._end>Date.parse('2026-10-14T03:01:00+08:00')),
 'source 5-interval segment must never extend past 7905 completion');
assert(day13.rows[1].capacityConflict&&day14.rows[0].capacityConflict,
 'both source five-overlap portions require review under four-crane limit');
assert.equal(day13.rows[1].displayRods,null);
assert.equal(day14.rows[0].displayRods,null);
assert.equal(day14.rows[1].displayRods,4);
assert.equal(day13.peak,4);
assert.equal(day14.peak,4);
console.log('PASS: Oct13-14 source intervals change at 03:01; actual five is never confirmed with four-crane limit');

console.log('PASS: cross-vessel 2+2 overlap, cache-only computation, midnight, manual priority, duplicate equipment, quantity caution, export UI');

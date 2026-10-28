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
assert(app.includes('補登船舶資料'));
assert(app.includes("const scope=identity(),result=concurrentResult(),rows=result.rows;"));
assert(app.includes("result.peak+' 桿'"));
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
console.log('PASS: cross-vessel 2+2 overlap, cache-only computation, midnight, manual priority, duplicate equipment, quantity caution, export UI');

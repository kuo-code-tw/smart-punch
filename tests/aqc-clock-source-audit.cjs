'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const engine=fs.readFileSync(path.join(__dirname,'../assets/port79-aqc-concurrent.js'),'utf8');
const context={window:{},Date,Intl,console};
vm.createContext(context);
vm.runInContext(engine,context);
const {index,compute,invalidate}=context.window.P79AqcConcurrent;
const aqcs=rows=>rows.map(([number,commence,complete])=>({number,commence,complete}));
const at=s=>Date.parse(s);
function ship(vessel,workingNo,voyageE,rows){return {vessel,workingNo,voyageE,aqcs:aqcs(rows)}}
const masters=[
 ship('WAN HAI 316','5260176','S254',[
  ['8002','2026-10-13T11:23:00+08:00','2026-10-14T08:42:00+08:00'],
  ['8003','2026-10-13T11:27:00+08:00','2026-10-14T10:30:00+08:00'],
  ['8005','2026-10-13T11:33:00+08:00','2026-10-13T15:47:00+08:00']
 ]),
 ship('WAN HAI 292','5260177','S073',[
  ['7902','2026-10-13T13:55:00+08:00','2026-10-14T08:10:00+08:00'],
  ['7903','2026-10-13T13:56:00+08:00','2026-10-14T08:05:00+08:00'],
  ['7905','2026-10-13T16:36:00+08:00','2026-10-14T03:02:00+08:00']
 ])
];
const records=[
 ['5260176','WAN HAI 316','S254','8002','19:23',22],
 ['5260176','WAN HAI 316','S254','8003','19:27',32],
 ['5260176','WAN HAI 316','S254','8005','19:33',42],
 ['5260177','WAN HAI 292','S073','7902','05:55',22],
 ['5260177','WAN HAI 292','S073','7903','05:56',32],
 ['5260177','WAN HAI 292','S073','7905','08:36',42]
].map(([workingNo,shipName,voyage,number,startTime,sourceRow])=>({
 source:'working-report',workingNo,shipName,voyage,number,startTime,
 endTime:'22:00',workDate:'2026-10-13',sourceRow
}));
const clock=index(records,masters,at('2026-10-28T00:00:00+08:00'));
assert.equal(clock.clockConflicts.length,6,'six real-source clocks have 8h mismatch');
assert.deepEqual([...clock.clockConflicts].map(x=>x.offsetMinutes).sort((a,b)=>a-b),[-480,-480,-480,480,480,480]);
const d13=compute(clock,[],{date:'2026-10-13',min:4,capacity:4});
const d14=compute(clock,[],{date:'2026-10-14',min:4,capacity:4});
const five=d13.rows.filter(x=>x.totalRods===5);
assert.equal(five.length,2,'two distinct five-source overlaps on Oct 13');
assert.ok(five.every(x=>x.capacityConflict&&x.needsReview&&x.displayRods===null),'not proven five active cranes');
assert.ok(five.every(x=>x.timeConflicts.length===5),'show every involved clock conflict');
assert.equal(d13.rows.find(x=>x.start==='2026-10-13T15:47').totalRods,4,'8005 completed before 7905 start');
assert.equal(d14.rows.find(x=>x.start==='2026-10-14T03:02').totalRods,4,'7905 removed after completion');
assert.ok(![...d13.rows,...d14.rows].some(x=>x.totalRods>=6),'no false simultaneous 8005/7905');
assert.equal(d13.physicalCapacity,4,'physical limit not inferred from source overlap');
assert.equal(d13.sourcePeak,5,'preserve evidence of source overlap, not hide it');
assert.equal(d13.peak,4,'capacity bound retained for backwards compatibility');
const justOne=index([],[
 ship('SHIP A','A','', [['7901','2026-10-13T10:00:00+08:00','2026-10-13T11:00:00+08:00']]),
 ship('SHIP B','B','', [['7901','2026-10-13T11:00:00+08:00','2026-10-13T12:00:00+08:00']])
],at('2026-10-28T00:00:00+08:00'));
const handoff=compute(justOne,[],{date:'2026-10-13',min:1});
assert.equal(handoff.rows.length,2,'adjacent intervals must not overlap');
assert.ok(handoff.rows.every(x=>x.totalRods===1),'same AQC has one physical identity');
const clean=index([], [ship('S','TEST','',[
 ['7901','2026-10-13T10:00:00+08:00','2026-10-13T11:00:00+08:00'],
 ['7902','2026-10-13T10:00:00+08:00','2026-10-13T11:00:00+08:00'],
 ['7903','2026-10-13T10:00:00+08:00','2026-10-13T11:00:00+08:00'],
 ['7905','2026-10-13T10:00:00+08:00','2026-10-13T11:00:00+08:00']
 ])],at('2026-10-28T00:00:00+08:00'));
const four=compute(clean,[],{date:'2026-10-13',min:4});
assert.equal(four.rows.length,1);
assert.equal(four.rows[0].totalRods,4);
assert.equal(four.rows[0].needsReview,false,'clean source overlap not marked as 8h conflict');
assert.equal(four.clockConflicts.length,0,'missing REPORT means missing comparison, not assumed offset');
const parsedDate=index([{source:'working-report',workingNo:'TEST',shipName:'S',number:'7901',sourceRow:3,
 startTime:'10:00',endTime:'11:00',workDate:'2026-10-13'}],clean.masters,at('2026-10-28T00:00:00+08:00'));
assert.equal(parsedDate.clockConflicts.length,0,'correct clocks do not trigger the 8h warning');
const labelSource=fs.readFileSync(path.join(__dirname,'../assets/port79-aqc-multi-rod.js'),'utf8');
assert.match(labelSource,/clockConflict/, 'UI shows individual clock evidence');
assert.match(labelSource,/r\.end\.replace\('T',' '\),'',r\.physicalCapacity/,'Excel actual-active-rods blank absent verified telemetry');
assert.match(labelSource,/來源未自動校時/,'never claim to have silently fixed raw data');
console.log('AQC source-clock audit / handoff / Excel safety regression passed');

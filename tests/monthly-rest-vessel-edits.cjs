'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const versions=require('../assets/port79-vessel-versions.js');
const monthly=require('../assets/port79-monthly-dashboard.js');
const efficiency=fs.readFileSync('aqc-efficiency/index.html','utf8');
const home=fs.readFileSync('index.html','utf8');
const monthlyRest=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const schedule=fs.readFileSync('schedule/index.html','utf8');
const hours=fs.readFileSync('work-hours/index.html','utf8');
const base={vessel:'WAN HAI 105',voyageI:'N466',voyageE:'S466',wharf:'79R',hatches:12,shiftMoves:0,gph:22};
const item=(workingNo,compareDate,totalContainers,more={})=>({
 ...base,workingNo,compareDate,totalContainers,totalMoves:totalContainers,...more
});
const samples=[
 item('5260196-4','2026-10-29',299,{workingSheetImportedAt:'2026-10-29T12:00:00Z'}),
 item('5260196-3','2026-10-27',488,{workingSheetImportedAt:'2026-10-27T12:00:00Z'}),
 item('5260196-2','2026-10-27',488,{workingSheetImportedAt:'2026-10-27T10:00:00Z'}),
 item('5260196','2026-10-29',299,{workingSheetImportedAt:'2026-10-29T13:00:00Z'})
];
const before=JSON.stringify(samples),result=versions.collapse(samples);
assert.equal(result.rows.length,1,'latest imported voyage replaces older quantities and completion dates');
assert.deepEqual(result.excludedWorkingNos.slice().sort(),['5260196-2','5260196-3','5260196-4']);
assert.equal(result.rows.reduce((a,b)=>a+b.totalContainers,0),299);
assert.equal(JSON.stringify(samples),before,'no mutation to permanent ship records');
const actual=[
 item('5260149-1','2026-10-27',350),
 item('5260149-2','2026-10-27',420),
 item('5260149-3','2026-10-28',350),
 item('5260149-4','2026-10-27',350,{vessel:'WAN HAI 106'})
];
assert.equal(versions.collapse(actual).rows.length,4,'legitimate different moves, dates, vessels not merged');
const cannotProve=[item('5260196-5','2026-10-27',488,{hatches:null}),item('5260196-6','2026-10-27',488,{hatches:12})];
assert.equal(versions.collapse(cannotProve).rows.length,2,'unknown totals must not be presumed duplicate');
const records=samples.map(s=>({workingNo:s.workingNo,empId:'E1',name:'同一位',totalMoves:s.totalMoves,timeHours:2,hatches:0}));
const v=monthly.analyzeVessels({shipMasters:samples.map(s=>({...s,lastDate:s.compareDate})),records});
assert.equal(v.count,1,'homepage vessel count mirrors the active two operations');
assert.equal(v.moves,299,'monthly ship totals exclude edited copies');
assert.equal(v.people.length,1);
assert.equal(v.people[0].moves,299,'personnel Moves do not include superseded report details');
assert.equal(v.detailCount,1,'historical copied detail rows do not inflate current-month data');
assert(efficiency.includes('window.P79VesselVersionView'),'AQC efficiency page uses same dedupe rule');
assert(efficiency.includes('const superseded=new Set(versioned?.collapse?.(shipMasters||[])?.excludedWorkingNos||[])'),
 'AQC person summary excludes only proven superseded edit rows');
assert(efficiency.includes('const current=versioned?.collapse?.(masters)?.rows||masters'),
 'AQC vessel count uses current view rather than raw suffix rows');
assert(efficiency.includes('port79-vessel-versions.js?v=20261030-original-revisions-v2'));
assert(home.includes('port79-vessel-versions.js?v=20261030-original-revisions-v2'));

// The original error shadowed the selector-building function options()
// with a later block-scoped const options in the click handler.
const old='const [data,options]=await Promise.all([a.snapshot(loadedMonth,false,false,true),g.P79Overtime.loadRules()])';
assert(!monthlyRest.includes(old),'monthly-rest load must not shadow options() with TDZ binding');
assert(monthlyRest.includes('const [data,ruleResponse]=await Promise.all'));
assert(monthlyRest.includes('function options(values,all)'));
for(const page of [schedule,hours])assert(page.includes('tdz=20261030-options-v1'),'each browser view loads fixed modal version');
console.log('PASS screenshot 5260196 copied revisions 4 -> 2, physical operation 787 not 1574; home/AQC summaries; true separate child work preserved; options TDZ fixed, cache bust; no writes');

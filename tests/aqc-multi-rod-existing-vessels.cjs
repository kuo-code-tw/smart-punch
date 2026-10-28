'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const js=fs.readFileSync('assets/port79-aqc-multi-rod.js','utf8');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
new Function(js);
assert(html.includes('data-tab="multi-rod"'),'multi-rod feature must be in efficiency menu');
assert(html.includes('sheet-timestamps-v6'),'browser must fetch refreshed script');
assert(js.includes("WORKING REPORT自動推算"));
assert(js.includes("WORKING SHEET主檔待核對"));
assert(js.includes("'AQC作業明細'")&&js.includes("'每日船舶彙總'"));
const start=js.indexOf(' function sourceRows(){'),end=js.indexOf(' let sourceBusy=null',start);
assert(start>0&&end>start,'existing vessel derivation block must exist');
const create=new Function('records','shipMasters','canonicalOperationalRecords','normalizeAqcNo','getRows','filtered','val','today',js.slice(start,end)+'\nreturn {autoCandidates,masterCandidates,sheetActivityCandidates,combinedFiltered};');
const args={multiRodDate:'2026-10-28',multiRodMode:'day',multiRodMin:'4'};
const r=(n,workDate='2026-10-28',work='A1',ship='TEST SHIP')=>({source:'working-report',workDate,workingNo:work,shipName:ship,voyageE:'N1',number:String(n),startTime:'08:00',endTime:'12:00',disc:10,load:5,hatches:2});
const master=(n=4)=>({workingNo:'A1',vessel:'TEST SHIP',firstDate:'2026-10-28',lastDate:'2026-10-28',aqcCount:n,shiftMoves:7});
const api=(recs=[],masters=[],manual=[])=>create(recs,masters,x=>x,x=>String(x),()=>manual,()=>manual.filter(x=>x.rods>=4),id=>args[id],()=>'2026-10-28');
const four=[r(101),r(102),r(103),r(104)];
let output=api(four,[master()]).combinedFiltered();
assert.equal(output.length,1,'four distinct AQC units produce a single vessel candidate');
assert.equal(output[0].source,'auto');
assert.equal(output[0].rods,4);
assert.equal(output[0].containers,60);
assert.equal(output[0].hatches,8);
assert.equal(output[0].shiftMoves,7);
assert.equal(api(four.slice(0,3)).combinedFiltered().length,0,'three units do not reach default four-unit threshold');
assert.equal(api([], [master()]).combinedFiltered()[0].source,'master','dated master-only vessel must appear with a review-needed label');
assert.equal(api(four.slice(0,2),[master()]).combinedFiltered()[0].source,'master','partial report does not silently hide a pending master candidate');
assert.equal(api(four,[master()]).combinedFiltered().length,1,'master candidate must not double-count a report-confirmed vessel');
const manual=[{id:'MR-1',ship:'TEST SHIP',workingNo:'A1',voyage:'N1',start:'2026-10-28T08:00',rods:5}];
assert.equal(api(four,[master()],manual).combinedFiltered()[0].id,'MR-1','saved manual record supersedes derived candidate');
assert.equal(api(four.map(x=>({...x,workDate:'2026-10-27'})),[master()]).combinedFiltered()[0].source,'master','previous-day WORKING REPORT cannot be presented as a verified current-day event');
assert(!js.includes("row?.source==='auto'?'':(row?.id||'')"),'master fallback must not write synthetic ID as a real cloud record');

// AQC commencement/completion is the main evidence of a crane's actual vessel activity.
const datedMaster={workingNo:'A2',vessel:'TIMED SHIP',firstDate:'2026-10-27',lastDate:'2026-10-29',
 aqcCount:4,aqcs:[101,102,103,104].map(number=>({number,commence:'2026-10-28T08:00:00+08:00',complete:'2026-10-28T16:00:00+08:00'}))};
assert.equal(api([],[datedMaster]).combinedFiltered()[0]?.source,'sheet','four actual AQC crane intervals must show without WORKING REPORT');
assert.equal(api([],[datedMaster]).combinedFiltered()[0]?.rods,4,'actual per-crane timestamps determine rod count');
const nightRows=[101,102,103,104].map(n=>({...r(n,'2026-10-27','A3','NIGHT SHIP'),startTime:'23:00',endTime:'03:00'}));
assert.equal(api(nightRows).autoCandidates().some(x=>x.date==='2026-10-28'&&x.rods===4),true,'overnight shifts count on the following day');
const prevDate=api(nightRows).autoCandidates().find(x=>x.date==='2026-10-28');
assert.equal(prevDate.containers,null,'overnight moves must not be double-counted into next day');
assert.equal(api([],[{...datedMaster,aqcCount:3,aqcs:datedMaster.aqcs.slice(0,3)}]).combinedFiltered().length,0,'three actual crane intervals do not meet four-unit threshold');
console.log('PASS: vessel timestamps, cross-midnight activity, monthly matching, provenance, and no fabricated day-specific quantity');

console.log('PASS: existing vessel AQC rod detection, provenance, deduplication, menu, Excel, and date isolation');

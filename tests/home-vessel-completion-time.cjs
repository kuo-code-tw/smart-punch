'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const m=require('../assets/port79-monthly-dashboard.js');
const html=fs.readFileSync('index.html','utf8'),ui=fs.readFileSync('assets/port79-reference-dashboard.js','utf8');
const report=m.analyzeVessels({shipMasters:[
 {workingNo:'A',vesselName:'WAN HAI 288',vesselChineseName:'源春',lastDate:'2026-11-08',totalMoves:600,gph:20.85,workingSheetImportedAt:'2026-11-08T06:24:00+08:00',lashingDateTime:'2026-11-08T03:40:00'},
 {workingNo:'B',vesselName:'SEASPAN BRISBANE',lastDate:'2026-11-08',totalMoves:1815,gph:24.82,workingSheetImportedAt:'2026-11-08T06:22:00+08:00',workingSheetSource:{lashingDateTime:'2026-11-08T05:15:00'}},
 {workingNo:'C',vesselName:'DATE ONLY',lastDate:'2026-11-07',totalMoves:33,gph:12,workingSheetImportedAt:'2026-11-08T08:59:00+08:00'},
 {workingNo:'Z',vesselName:'DELETED',lastDate:'2026-11-09',lashingDateTime:'2026-11-09T18:20',deleted:true}
],records:[]});
const sorted=m.latestCompletedVessels(report.vessels,Number.MAX_SAFE_INTEGER);
assert.deepEqual(sorted.map(v=>v.workingNo),['B','A','C'],'actual LASHING time, not import time');
assert.equal(report.vessels.find(v=>v.workingNo==='A').completedAt,'2026-11-08T03:40:00');
assert.equal(report.vessels.find(v=>v.workingNo==='B').completedAt,'2026-11-08T05:15:00');
assert.equal(report.vessels.find(v=>v.workingNo==='C').completedAt,'','do not backfill imported time');
assert.equal(report.vessels.find(v=>v.workingNo==='C').completionDate,'2026-11-07');
assert.equal(m.shipCompletionTimestamp({lashingDateTime:'2026-11-07T23:55:00Z'}),'2026-11-08T07:55:00','UTC converted to Taiwan');
assert.equal(m.shipCompletionTimestamp({lashingDateTime:'2026-11-08T02:10:00+08:00'}),'2026-11-08T02:10:00');
assert.equal(m.shipCompletionTimestamp({lastDate:'2026-11-08',workingSheetImportedAt:'2026-11-08T06:24:00+08:00'}),'');
assert.equal(m.shipCompletionTimestamp({lashingDateTime:'2026-11-31T24:70'}),'');
assert.deepEqual(m.latestCompletedVessels(report.vessels,1).map(v=>v.workingNo),['B']);
assert(html.includes('最新完工船舶')&&html.includes('<th>完工時間</th>')&&html.includes('本月完工船舶 · 依完工時間'));
assert(!html.includes('最新匯入船舶</button>')&&!html.includes('<th>匯入時間</th>'));
assert(ui.includes('model.latestCompletedVessels(source,Number.MAX_SAFE_INTEGER)'));
assert(ui.includes('s.completedAt')&&ui.includes('時間未記錄'));
assert(!ui.includes('importLabel('));
console.log('PASS: actual LASHING completion time, Taiwan timezone, date-only fallback, completion ordering, valid bilingual names and labels');

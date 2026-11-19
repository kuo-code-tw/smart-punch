'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const fn=name=>{
  const start=html.indexOf('function '+name+'(');
  assert(start>=0,name+' production function missing');
  const end=html.indexOf('\n}',start);
  assert(end>start,name+' closing brace');
  return html.slice(start,end+2);
};
let saves=0,invalidations=0;
const source=[
// WORKING REPORT 2026-06, 24 original operator intervals (names withheld).
// Numeric source is the supplied WAN HAI 278 original sheet, not screenshot estimates.
[10,5,2,0,''],[13,39,0,1,''],[16,8,29,1,''],[19,19,5,1,''],
[22,0,23,1,''],[25,0,26,0,''],[28,0,16,0,''],
[48,14,0,0,"D7甲 40' 1BN/4FR , 20' 2BN/8FR"],
[51,53,0,1,"D5甲 40' 8BN/32FR"],
[54,33,8,0,''],[57,0,30,0,''],[60,0,20,1,''],[63,0,26,0,''],
[66,6,27,0,"D7甲20' 1BN/4FR"],
[69,0,3,0,''],[86,8,0,0,''],[89,28,0,0,''],[92,28,0,0,''],
[95,20,0,1,''],
[98,21,16,0,"D7甲20' 1BN/3FR"],
[101,0,14,1,''],[104,0,9,0,''],[107,0,26,0,''],[110,0,2,0,'']
];
assert.equal(source.length,24);
const rows=Array.from({length:181},()=>Array(23).fill(''));
const wsRows=Array.from({length:64},()=>Array(18).fill(''));
wsRows[14][1]='Bundle';wsRows[16][1]='組數/櫃數';
wsRows[16][3]=4;wsRows[16][4]=15;wsRows[16][5]=9;wsRows[16][6]=36;
for(const [row,disc,load,hc,note] of source){rows[row-1][6]=disc;rows[row-1][10]=load;rows[row-1][14]=hc;rows[row-1][19]=note;}
const c={
 num:v=>Number(v)||0,round:(v,p)=>Number(Number(v).toFixed(p)),
 XLSX:{utils:{sheet_to_json:s=>s.rows}},Array,Map,Set,Math,Number,String,Date,
 effectiveHours:()=>1,saveLocal:()=>saves++,invalidateWorkloadIndex:()=>invalidations++,
 records:[]
};
vm.createContext(c);
for(const name of ['parseBundleRemark','scanWorkbookBundleEvidence','buildBundleImportAudit',
 'workingSheetBundleInfo','applyBundleDeductionToWorkingReport','bundleRemarkTextFromRecord',
 'canonicalBundleRemark','effectiveBundleRecord','repairBundleRecordsFromRemarks','vesselQuantityAudit'])
 vm.runInContext(fn(name),c);
const gross=source.reduce((n,r)=>n+r[1]+r[2],0);
const hc=source.reduce((n,r)=>n+r[3],0);
assert.equal(gross,564);assert.equal(hc,8);
const sheet=c.workingSheetBundleInfo({rows:wsRows});
assert.equal(sheet.deduct,38);assert.equal(sheet.bn,13);assert.equal(sheet.fl,51);
const scan=c.scanWorkbookBundleEvidence({Sheets:{'WORKING REPORT':{rows}}});
assert.equal(scan.reportBn,13);assert.equal(scan.reportFl,51);
assert.equal(scan.reportDeduct,38);
assert.equal(scan.hits.length,4);
let sourceDeduct=0;
for(const [row,disc,load,hatches,note] of source){
 const x=c.applyBundleDeductionToWorkingReport(disc,load,note);
 sourceDeduct+=x.bundleDeduct;
 assert.equal(x.disc+x.load,disc+load-x.bundleDeduct,'row '+row+' source evidence');
}
assert.equal(sourceDeduct,38);
assert.equal(gross-sourceDeduct,526);
const bundleExamples=[
 {sourceRow:48,rawDisc:14,rawLoad:0,disc:11,load:0,bundleDeduct:3,bundleBn:3,bundleFl:12,expected:5},
 {sourceRow:51,rawDisc:53,rawLoad:0,disc:45,load:0,bundleDeduct:8,bundleBn:8,bundleFl:32,expected:29},
 {sourceRow:66,rawDisc:6,rawLoad:27,disc:5,load:27,bundleDeduct:1,bundleBn:1,bundleFl:4,expected:30},
 {sourceRow:98,rawDisc:21,rawLoad:16,disc:21,load:15,bundleDeduct:1,bundleBn:1,bundleFl:3,expected:35}
];
for(const record of bundleExamples){
 const repaired=c.effectiveBundleRecord({...record,source:'working-report',bundleInfo:[]});
 assert.equal(repaired.disc+repaired.load,record.expected,'stale BN-only row '+record.sourceRow);
 assert.equal(repaired.bundleDeduct,record.bundleFl-record.bundleBn);
}
const corrected=bundleExamples.reduce((sum,r)=>sum+c.effectiveBundleRecord(r).disc+c.effectiveBundleRecord(r).load,0);
const otherGross=gross-bundleExamples.reduce((sum,r)=>sum+r.rawDisc+r.rawLoad,0);
assert.equal(corrected+otherGross,526,'legacy 551 becomes 526, no new phantom containers');
const imported=bundleExamples.map(r=>({...r,source:'working-report',bundleInfo:[]}));
assert.equal(c.buildBundleImportAudit({Sheets:{'WORKING REPORT':{rows}}},{bundleDeduct:38},imported).ok,true,
  'three independent sources: sheet, raw report and stored personnel');
const stale=imported.reduce((s,r)=>s+r.disc+r.load,0)+otherGross;
assert.equal(stale,551,'regression must reproduce the screenshot 551, not just 38-13 arithmetic');
c.records=imported;
assert.equal(c.repairBundleRecordsFromRemarks(),4,'self-heal four evidenced legacy rows');
assert.equal(c.records.reduce((sum,r)=>sum+r.containers,0)+otherGross,526);
assert.equal(saves,1);assert.equal(invalidations,1);
assert.equal(c.repairBundleRecordsFromRemarks(),0,'subsequent renders do not double-deduct');
assert.equal(saves,1,'stable records do not keep changing');

// Regression for screenshot: intervals merged by AQC/person after import.
// 11BN/44FR belongs to DISC source rows. Aggregated LOAD=8 must not absorb
// a 33-move deduction: that made 100 instead of 75 on AQC 7903.
const mergedLegacy={
 source:'working-report',name:'AQC 7903',rawDisc:100,rawLoad:8,
 disc:100,load:0,bundleDeduct:33,bundleBn:11,bundleFl:44,
 bundleRemark:'11BN/44FR',bundleInfo:[],hatches:1
};
const mixedCorrected=c.applyBundleDeductionToWorkingReport(100,8,'11BN/44FR');
assert.equal(mixedCorrected.disc,67);
assert.equal(mixedCorrected.load,8);
assert.equal(mixedCorrected.disc+mixedCorrected.load,75);
const projected=c.effectiveBundleRecord(mergedLegacy);
assert.equal(projected.disc,67);
assert.equal(projected.load,8);
assert.equal(projected.bundleDeduct,33);

// Protect records whose source row already assigned Bundle on LOAD; never
// move that deduction onto DISC simply because merged DISC is numerically
// closer to the BN/FR quantity.
const correctLoadSplit={
 source:'working-report',name:'AQC 7905',rawDisc:41,rawLoad:65,
 disc:41,load:63,bundleDeduct:2,bundleBn:1,bundleFl:3,
 bundleRemark:'1BN/3FR',bundleInfo:[],hatches:2
};
const protectedSplit=c.effectiveBundleRecord(correctLoadSplit);
assert.equal(protectedSplit.disc,41);
assert.equal(protectedSplit.load,63);

// Green audit must check measured person DISC/LOAD, not a tautological
// calculated total (the screenshot showed green 526 while red said 551).
c.recordRawMoveSplit=r=>({disc:c.effectiveBundleRecord(r).rawDisc,load:c.effectiveBundleRecord(r).rawLoad});
c.recoveredMoveSplit=r=>({disc:r.disc,load:r.load});
const job={bundleDeduct:33,totalContainers:75,shiftMoves:0,totalMoves:75,hatches:1};
const badAudit=c.vesselQuantityAudit(job,[mergedLegacy]);
assert.equal(badAudit.measuredAdjustedMoves,100);
assert.equal(badAudit.calculatedAdjusted,75);
assert.equal(badAudit.recordBundleMathOk,false);
assert.equal(badAudit.ok,false);
c.records=[mergedLegacy,correctLoadSplit];
assert.equal(c.repairBundleRecordsFromRemarks(),1,'only stale merged person is changed');
assert.equal(c.records[0].disc,67);
assert.equal(c.records[0].load,8);
assert.equal(c.records[1].disc,41);
assert.equal(c.records[1].load,63);
assert.equal(c.vesselQuantityAudit(job,[mergedLegacy]).ok,true);
assert.equal(c.repairBundleRecordsFromRemarks(),0,'merged record repair is idempotent');
console.log('PASS WAN HAI 278: 564 gross - 38 Bundle = 526; merged AQC 7903 100/8 with 11BN/44FR becomes 67/8 (75), green audit measures actual personnel totals');

'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const start=html.indexOf('function buildBundleImportAudit(');
const end=html.indexOf('function workingSheetBundleInfo(',start);
assert(start>=0 && end>start,'Bundle audit functions must exist');

const c={
  num:v=>Number(v)||0,
  scanWorkbookBundleEvidence:()=>({reportDeduct:19,hits:[{row:1},{row:2},{row:3}],suspicious:[]}),
  effectiveBundleRecord:r=>r,
  Date,Math,Array,Number,String
};
vm.createContext(c);
vm.runInContext(html.slice(start,end),c);

// A real 19-vs-16 discrepancy must remain visible in the audit; it must not
// invent 3 bundles or attribute them to a driver.
const source={Sheets:{'WORKING REPORT':{}}};
const mismatch=c.buildBundleImportAudit(source,{bundleDeduct:19},[{bundleDeduct:16}]);
assert.equal(mismatch.ok,false);
assert(mismatch.errors.some(x=>x.includes('19')&&x.includes('16')));
const pending=c.buildBundleImportAuditMetadata(mismatch);
assert.equal(pending.status,'pending-review');
assert.equal(pending.ok,false);
assert.equal(pending.workingSheetDeduct,19);
assert.equal(pending.workingReportDeduct,19);
assert.equal(pending.personDetailDeduct,16);
assert.equal(pending.difference,3);
assert.equal(pending.unassignedDeduct,3);
assert.equal(pending.excessDeduct,0);
assert.equal(pending.hitCount,3);
assert(pending.errors.length>0);

// Future vessels may have arbitrary Bundle counts; no fixed 19/16 override.
const matching=c.buildBundleImportAudit(source,{bundleDeduct:16},[{bundleDeduct:16}]);
assert.equal(c.buildBundleImportAuditMetadata(matching).unassignedDeduct,0);
const over=c.buildBundleImportAudit(source,{bundleDeduct:13},[{bundleDeduct:16}]);
const excess=c.buildBundleImportAuditMetadata(over);
assert.equal(excess.status,'pending-review');
assert.equal(excess.unassignedDeduct,0);
assert.equal(excess.excessDeduct,3);

// Audit mismatches must not abort the otherwise valid WORKING SHEET import.
// Keep one nonblocking warning and persist audit status in BOTH ship snapshots.
const gateStart=html.indexOf('const bundleAudit=buildBundleImportAudit(book,summary,imported);');
const gateEnd=html.indexOf('const audit=summary.importAudit||{};',gateStart);
assert(gateStart>=0 && gateEnd>gateStart,'import audit gate exists');
const gate=html.slice(gateStart,gateEnd);
assert(!/\\breturn\\s*;/.test(gate),'Bundle discrepancy cannot abort file import');
assert(!gate.includes('p79HomeExcelImportWarning('),'Bundle discrepancy cannot open blocking alert');
assert(gate.includes('buildBundleImportAuditMetadata(bundleAudit)'),'persist source evidence');
assert.equal((html.match(/bundleAudit:\{\.\.\.bundleAuditMetadata\}/g)||[]).length,2,
 'both main ship record and source snapshot retain unresolved audit evidence');
assert(html.includes('bundleReviewPending:!bundleAudit.ok'),'batch import marks review without failure');
assert(html.includes('Bundle 待核對')&&html.includes('⚠️ 已匯入'),
 'user sees accurate successful-import + pending-review state');

console.log('PASS Bundle mismatches: import safely, keep 19/16 and unresolved 3, no fabricated driver records');

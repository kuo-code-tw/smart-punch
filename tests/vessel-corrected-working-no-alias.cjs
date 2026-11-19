'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const versions=require('../assets/port79-vessel-versions.js');
function fn(name){const i=html.indexOf('function '+name+'(');assert(i>=0,name);const j=html.indexOf('\n}',i);assert(j>i,name);return html.slice(i,j+2);}
const old={
 workingNo:'5290042',sourceWorkingNo:'5290042',vessel:'WAN HAI 290',
 voyageI:'N085',voyageE:'N085',wharf:'79R',
 firstDate:'2026-06-10',lastDate:'2026-06-10',compareDate:'2026-06-10',
 totalContainers:471,totalMoves:473,hatches:6,shiftMoves:2,
 workingSheetImportedAt:'2026-11-19T04:00:00Z',
 workingSheetSource:{sourceWorkingNo:'5290042',importedAt:'2026-11-19T04:00:00Z',reportRecordIds:['old1']}
};
const corrected={
 ...old,workingNo:'5260042',sourceWorkingNo:'5290042',
 workingSheetImportedAt:'2026-11-19T05:27:00Z',
 workingSheetSource:{sourceWorkingNo:'5290042',importedAt:'2026-11-19T05:27:00Z',reportRecordIds:['new1','new2']}
};
const c={
 num:x=>Number(x)||0,normalizeShipText:x=>String(x||'').trim().toUpperCase(),
 normalizeMonthlySerial:x=>String(x||'').replace(/^\d{3}/,'').replace(/-.*/,''),Map,Set,Number,Date,String,
 workloadSheetAudit:(master,rows)=>({
  status:rows.length===2&&rows.reduce((n,r)=>n+r.disc+r.load,0)===473&&
    rows.reduce((n,r)=>n+r.hatches,0)===6?'match':'mismatch'
 }),
 shipMasters:[old,corrected],shipMasterQuality:()=>100,mergeShipMasterOne:(a,b)=>({...a,...b}),
 workingNoSortParts:x=>({base:Number(String(x||'').replace(/\D/g,'')),suffix:0})
};
vm.createContext(c);
for(const name of ['sameShipMasterJob','originalNumericWorkingNo','importSourceWorkingNo','vesselImportCallNumber',
 'sameVerifiedCorrectedShipJob','sameShipMasterJobWithSerialGuard','chooseLatestShipMaster','dedupeShipMasters',
 'p79VerifiedCorrectedVesselAliases','p79IsSupersededCorrectedVesselRow'])
 vm.runInContext(fn(name),c);
assert(c.sameVerifiedCorrectedShipJob(old,corrected),'explicit original number links corrected import');
assert.equal(c.sameShipMasterJobWithSerialGuard(old,corrected),true);
const master=c.dedupeShipMasters([old,corrected]);
assert.equal(master.length,1);
assert.equal(master[0].workingNo,'5260042');
assert.equal(master[0].sourceWorkingNo,'5290042');
for(const pair of [[old,corrected],[corrected,old]]){
 const result=versions.collapse(pair);
 assert.equal(result.rows.length,1);
 assert.equal(result.rows[0].workingNo,'5260042');
 assert.deepEqual(result.excludedWorkingNos,['5290042']);
}
for(const different of [
 {...corrected,sourceWorkingNo:'5260042'},
 {...corrected,wharf:'80R'},
 {...corrected,voyageI:'N086',voyageE:'N086'},
 {...corrected,firstDate:'2026-06-11',lastDate:'2026-06-11',compareDate:'2026-06-11'},
 {...corrected,workingNo:'5260042-CALL2',sourceFileName:'WAN HAI 290 第二靠.xlsx'},
 {...corrected,vessel:'WAN HAI 291'}
]){
 assert.equal(c.sameVerifiedCorrectedShipJob(old,different),false,'independent work must not be treated as a correction');
 assert.equal(versions.collapse([old,different]).rows.length,2,'independent visit remains visible');
}
const missingTime={...old,workingSheetImportedAt:'',workingSheetSource:{}};
assert.equal(versions.collapse([missingTime,corrected]).rows.length,1,'untimed original with same quantities is a duplicate');
const modified={...corrected,totalContainers:470,totalMoves:472};
assert.equal(versions.collapse([old,modified]).rows.length,1,'timestamped correction may legitimately revise quantity');
assert.match(html,/sourceWorkingNo:String\(s\.sourceWorkingNo\|\|s\.workingSheetSource\?\.sourceWorkingNo\|\|s\.workingNo/,'dashboard must retain original lineage');
// Real dashboard regression: corrected master survives but an old 185-Move
// WORKING REPORT batch can repopulate 5290042 through recordMap unless filtered.
const oldWR=(id,disc,date='2026-06-10',extra={})=>({
 id,workingNo:'5290042',sourceWorkingNo:'5290042',
 source:'working-report',shipName:'WAN HAI 290',vessel:'WAN HAI 290',
 voyageI:'N085',voyageE:'N085',wharf:'79R',workDate:date,
 sheetCompareDate:'2026-06-10',disc,load:0,hatches:0,
 workingSheetImportedAt:'2026-11-19T04:00:00Z',...extra
});
const newWR=(id,disc,hatches)=>({
 id,workingNo:'5260042',sourceWorkingNo:'5290042',
 source:'working-report',shipName:'WAN HAI 290',vessel:'WAN HAI 290',
 voyageI:'N085',voyageE:'N085',wharf:'79R',workDate:'2026-06-10',
 disc,load:0,hatches,workingSheetImportedAt:'2026-11-19T05:27:00Z'
});
const oldWRRows=[oldWR('old1',100),oldWR('old2',85)];
const newWRRows=[newWR('new1',200,3),newWR('new2',273,3)];
const source=[...oldWRRows,...newWRRows];
const aliases=c.p79VerifiedCorrectedVesselAliases([old,corrected],source);
assert.equal(aliases.get('5290042').length,1);
assert.equal(c.p79IsSupersededCorrectedVesselRow({...old,manualOverrides:{}},aliases),true,
 'empty override metadata must not resurrect old master 5290042');
assert(oldWRRows.every(r=>c.p79IsSupersededCorrectedVesselRow(r,aliases)),
 'old 185 WR moves must not reconstruct the superseded ship');
assert(newWRRows.every(r=>!c.p79IsSupersededCorrectedVesselRow(r,aliases)),
 'new complete 473 WR moves are retained');
assert.equal(c.p79IsSupersededCorrectedVesselRow(oldWR('differentWharf',50,'2026-06-10',{wharf:'80R'}),aliases),false);
assert.equal(c.p79IsSupersededCorrectedVesselRow(oldWR('differentVoyage',50,'2026-06-10',{voyageI:'N086',voyageE:'N086'}),aliases),false);
assert.equal(c.p79IsSupersededCorrectedVesselRow(oldWR('differentDate',50,'2026-06-11',{sheetCompareDate:''}),aliases),false);
assert.equal(c.p79IsSupersededCorrectedVesselRow(oldWR('secondCall',50,'2026-06-10',{sourceFileName:'WAN HAI 290 第二靠.xlsx'}),aliases),false);
assert.equal(c.p79IsSupersededCorrectedVesselRow(oldWR('manuallyEdited',50,'2026-06-10',{manualEditedAt:'2026-11-19T04:40:00Z'}),aliases),false);
assert.equal(c.p79IsSupersededCorrectedVesselRow(oldWR('laterImport',50,'2026-06-10',{workingSheetImportedAt:'2026-11-19T05:40:00Z'}),aliases),false);
assert.equal(c.p79IsSupersededCorrectedVesselRow(oldWR('otherOriginal',50,'2026-06-10',{sourceWorkingNo:'5299999'}),aliases),false);
assert.equal(c.p79VerifiedCorrectedVesselAliases([corrected],oldWRRows).size,0,
 'never suppress historical source without a complete validated replacement');
const incomplete={...corrected,workingSheetSource:{...corrected.workingSheetSource,reportRecordIds:['new1']}};
assert.equal(c.p79VerifiedCorrectedVesselAliases([incomplete],source).size,0,
 'a partial manifest cannot hide the old ship');
const shipRows=html.slice(html.indexOf('function vesselJobRows('),html.indexOf('const SUMMARY_PAGE_SIZE'));
assert(shipRows.includes('p79IsSupersededCorrectedVesselRow(r,verifiedAliases)'),
 'dashboard record-derived fallback must exclude verified old source');
const monthRows=html.slice(html.indexOf('function vesselJobRowsForMonth('),html.indexOf('function availableMonthlyCompareMonths('));
assert(monthRows.includes('p79IsSupersededCorrectedVesselRow(s,verifiedAliases)'),
 'monthly compare must use the same corrected master');
assert(monthRows.includes('p79IsSupersededCorrectedVesselRow(r,verifiedAliases)'),
 'monthly fallback must exclude old report-only row');

for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
 if(script[1].trim())new vm.Script(script[1]);
}
console.log('PASS screenshot WAN HAI 290: old master/185-Move report excluded after 5260042 verified 473-Move manifest; independent jobs protected');

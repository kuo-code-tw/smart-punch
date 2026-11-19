'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const from=html.indexOf('function p79PruneVerifiedCorrectedVesselRecords(');
const to=html.indexOf('function shipMasterToSummary(',from);
assert(from>=0&&to>from,'production cleanup remains adjacent to ship merge');
const corrected={
 workingNo:'5260042',sourceWorkingNo:'5290042',
 vessel:'WAN HAI 290',voyageI:'N085',voyageE:'N085',wharf:'79R',
 firstDate:'2026-06-10',lastDate:'2026-06-10',compareDate:'2026-06-10',
 totalContainers:471,totalMoves:473,hatches:6,shiftMoves:2,
 workingSheetImportedAt:'2026-11-19T05:27:00Z',
 workingSheetSource:{
  importedAt:'2026-11-19T05:27:00Z',sourceWorkingNo:'5290042',
  totalContainers:471,totalMoves:473,shiftMoves:2,hatches:6,bundleDeduct:0,
  reportRecordIds:['new1','new2']
 }
};
const base=(id,no,stamp,disc,hc,overrides={})=>({
 id,workingNo:no,source:'working-report',workingSheetImportedAt:stamp,
 shipName:'WAN HAI 290',vessel:'WAN HAI 290',voyageI:'N085',voyageE:'N085',
 wharf:'79R',workDate:'2026-06-10',disc,load:0,hatches:hc,
 ...overrides
});
const firstStamp='2026-11-19T04:00:00Z',newStamp='2026-11-19T05:27:00Z';
const newRows=[base('new1','5260042',newStamp,200,3),base('new2','5260042',newStamp,273,3)];
const oldRows=[base('old1','5290042',firstStamp,100,0),base('old2','5290042',firstStamp,85,0)];
const keepRows=[
 base('oldmanual','5290042','',22,0,{source:'manual-entry'}),
 base('later','5290042','2026-11-19T05:40:00Z',11,0),
 base('differentShip','5290042',firstStamp,20,0,{shipName:'WAN HAI 291'}),
 base('differentWharf','5290042',firstStamp,30,0,{wharf:'80R'}),
 base('differentDate','5290042',firstStamp,13,0,{workDate:'2026-06-11'}),
 base('secondCall','5290042-CALL2',firstStamp,80,0)
];
const all=[...oldRows,...newRows,...keepRows];
let auditCalls=0;
const c={Array,String,Date,Map,Set,Number,console,
 normalizeShipText:s=>String(s||'').trim().toUpperCase(),
 vesselImportCallNumber:r=>/\b第二靠/.test(String(r.sourceFileName||''))||/-CALL2/.test(String(r.workingNo||''))?2:1,
 workloadSheetAudit:(m,rows)=>{auditCalls++;
 const total=rows.reduce((x,r)=>x+Number(r.disc||0)+Number(r.load||0),0);
 const hc=rows.reduce((x,r)=>x+Number(r.hatches||0),0);
 return {status:rows.length===2&&total===473&&hc===6&&m.workingSheetSource.totalMoves===473?'match':'mismatch'};
 }};
vm.createContext(c);vm.runInContext(html.slice(from,to),c);
const result=c.p79PruneVerifiedCorrectedVesselRecords([corrected],all);
assert.equal(result.removedIds.length,2,'only 185 old source moves from 5290042 removed');
assert.deepEqual(Array.from(result.removedIds),['old1','old2']);
assert.equal(result.records.length,all.length-2);
for(const row of [...newRows,...keepRows])assert(result.records.some(r=>r.id===row.id),'keep '+row.id);
assert.deepEqual(Array.from(result.auditLog,x=>x.original+'->'+x.current),['5290042->5260042']);
const incomplete=all.filter(x=>x.id!=='new2');
assert.equal(c.p79PruneVerifiedCorrectedVesselRecords([corrected],incomplete).removedIds.length,0,
 'incomplete corrected batch cannot discard prior source');
const noManifest={...corrected,workingSheetSource:{...corrected.workingSheetSource,reportRecordIds:[]}};
assert.equal(c.p79PruneVerifiedCorrectedVesselRecords([noManifest],all).removedIds.length,0,
 'unknown source provenance never removes historical records');
const extraCall={...corrected,workingNo:'5260042-CALL2',sourceFileName:'WAN HAI 290 第二靠.xlsx'};
assert.equal(c.p79PruneVerifiedCorrectedVesselRecords([extraCall],all).removedIds.length,0,
 'never delete first-call work due to second call');
assert(auditCalls>=2);
assert(html.includes('p79PruneVerifiedCorrectedVesselRecords(sendingMasters,mixedRecords)'));
assert(html.includes('p79PruneVerifiedCorrectedVesselRecords(shipMasters,records)'));
console.log('PASS WAN HAI 290 185 stale WR only removed after 473/6 manifest audit; manual, newer and second call retained');

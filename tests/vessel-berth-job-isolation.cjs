'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
function fn(name){const a=html.indexOf('function '+name+'(');assert(a>=0,name);return html.slice(a,html.indexOf('\n}',a)+2);}
const make=(wharf,total,hc)=>({workingNo:'5260142',vessel:'WAN HAI 103',voyageI:'N616',voyageE:'S617',wharf,firstDate:'2026-09-17',lastDate:'2026-09-17',totalContainers:total,totalMoves:total,shiftMoves:0,hatches:hc,workingSheetSource:{totalContainers:total,totalMoves:total,shiftMoves:0,hatches:hc,bundleDeduct:0,disc:total,load:0}});
const masters=[make('79R',541,26),make('80L',31,0)];
const rows=masters.map((m,i)=>({id:'r'+i,source:'working-report',workingNo:m.workingNo,shipName:m.vessel,voyageI:m.voyageI,voyageE:m.voyageE,wharf:m.wharf,workDate:'2026-09-17',name:'A',number:'6',startTime:'08:00',endTime:'12:00',disc:m.totalContainers,load:0,hatches:m.hatches}));
const original=JSON.stringify({masters,rows});
const c={console,shipMasters:masters,records:rows,num:v=>Number(v)||0,round:(v,n=2)=>+Number(v).toFixed(n),esc:v=>String(v),canonicalOperationalRecords:rs=>rs,recordRawMoveSplit:r=>r,effectiveBundleRecord:()=>({bundleDeduct:0}),workloadRecordMetrics:r=>({disc:r.disc,load:r.load,hc:r.hatches,containers:r.disc+r.load}),sanitizeShipMasterMetrics:x=>({...x}),normalizeWorkingSheetBillingSemantics:x=>x,applyShipManualOverrides:x=>x,effectiveShipOverrides:()=>({}),mergeShipMasterOne:(a,b)=>({...a,...b}),dedupeShipMasters:x=>x,normalizeMonthlySerial:x=>String(x),normalizeShipText:v=>String(v||'').trim().toUpperCase(),vesselLooseToken:v=>v,recordSerialCandidates:()=>[],document:{getElementById:()=>({value:'2026-09'})},recordMatchesMasterDate:()=>true,recordMatchesMasterVoyage:()=>true,monthlySerialFromWorkingNo:x=>x,monthlyShipNo:x=>x,recoveredMoveSplit:x=>x,dashboardAdjustJobsForMonthlyReference:x=>x};
vm.createContext(c);
for(const name of ['shipMasterKey','vesselScopeMaster','vesselScopeRows','driverVesselReference','workloadSheetAudit','dashboardWorkingReportResult','dashboardWorkingReportBadge','workingNoHasSuffix','workingNoRoot','recordsForVessel','officialRecordsForVessel','canonicalShipMasters','importSourceWorkingNo','sameVoyageForMasters','linkedChildMasterCandidates','vesselMonthlyExportRows'])vm.runInContext(fn(name),c);
for(const master of masters){
 const audit=c.dashboardWorkingReportResult(master);assert.equal(audit.status,'match',master.wharf);assert.equal(audit.containers,master.totalContainers);assert.equal(audit.diff,0);
 assert.equal(c.recordsForVessel(master.workingNo,master.vessel,master).length,1);
 assert.equal(c.officialRecordsForVessel(master.workingNo,master.vessel,master)[0].wharf,master.wharf);
}
assert(c.dashboardWorkingReportBadge(masters[1]).includes('WR 31／WS 31'));
assert.equal(c.canonicalShipMasters(masters).length,2,'same number across berths stays separate');
const ambiguous={...rows[0],id:'missing-berth',wharf:'',disc:10};c.records=[...rows,ambiguous];
assert.equal(c.dashboardWorkingReportResult(masters[1]).status,'pending','missing berth is not silently assigned to either job');
c.records=rows;
assert.equal(c.driverVesselReference(JSON.stringify(['5260142','80L']),masters,rows).rows[0].disc,31);
assert.equal(c.driverVesselReference('5260142',masters,rows).master,null,'unscoped same-number selection is not guessed');
c.shipMasters=[masters[0],{...masters[1],workingNo:'5260142-2',sourceWorkingNo:'5260142'}];
assert.equal(c.linkedChildMasterCandidates(masters[0]).length,0,'cross-berth child is not absorbed into parent');
c.shipMasters=masters;c.vesselJobRows=()=>masters;
const exported=c.vesselMonthlyExportRows('2026-09');
assert.deepEqual(Array.from(exported,r=>r.bill),[541,31]);
assert.deepEqual(Array.from(exported,r=>r.disc),[541,31]);
assert.equal(JSON.stringify({masters,rows}),original,'display/audit/export never rewrite source records');
c.normalizePersonName=x=>x;c.displayPersonName=x=>x;c.normalizeAqcNo=x=>x;c.operationalSourceRank=()=>50;c.vesselMasterForRecord=()=>null;
vm.runInContext(fn('canonicalOperationalRecords'),c);
const sameSegment=rows.map(r=>({...r,disc:10,hatches:0}));assert.equal(c.canonicalOperationalRecords(sameSegment).length,2,'same driver/time at separate berths is not deduplicated');
console.log('PASS: WAN HAI 103 79R=541 and 80L=31 remain separate in audit, detail, canonical masters and monthly exports; missing berth pending; source immutable');

c.shipManualOverrideCache={'NO:5260142':{totalMoves:572}};
for(const name of ['shipOverrideKey','effectiveShipOverrides','applyShipManualOverrides'])vm.runInContext(fn(name),c);
assert.equal(c.effectiveShipOverrides(masters[1],masters).totalMoves,undefined,'legacy number-only override cannot bleed across berths');
assert.equal(c.canonicalShipMasters(masters)[1].totalMoves,31,'canonicalization uses the incoming scope to protect manual overrides');

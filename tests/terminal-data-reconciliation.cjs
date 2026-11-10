'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const opsCode=fs.readFileSync('aqc-efficiency/terminal-ops.js','utf8');
const rodCode=fs.readFileSync('aqc-efficiency/terminal-rod-overview.js','utf8');
const auditCode=fs.readFileSync('aqc-efficiency/terminal-data-audit.js','utf8');
const css=fs.readFileSync('aqc-efficiency/terminal-data-audit.css','utf8');
assert(html.includes('id="terminalReconciliationMount"'));
assert(html.includes('terminal-data-audit.css?v=20261111-audit-v1'));
assert(html.includes('terminal-data-audit.js?v=20261111-audit-v1'));
assert(html.includes('terminal-ops.js?v=20261111-audit-v3'));
assert(css.includes('p79-audit-list'),'audit messages have visible layout');
assert(opsCode.includes('root.P79TerminalDataAudit?.render(stats,scoped);'),'audit receives same scoped stats as other panels');
assert(!auditCode.includes('apiPost(')&&!opsCode.includes('apiPost('),'audit must not write to cloud');
const ship=(no,wharf,billed,moves,disc,load,shift)=>({
 workingNo:no,vessel:no,lastDate:'2026-11-10',wharf,
 totalContainers:billed,totalMoves:moves,shiftMoves:shift,hatches:2,
 workingSheetSource:{disc,load,bundleDeduct:0}
});
const row=(id,no,number,disc,load,extras={})=>({
 id,workingNo:no,number,workDate:'2026-11-10',source:'working-report',
 startTime:'08:00',endTime:'09:00',disc,load,hatches:1,...extras
});
const ships=[
 ship('A','79L',100,110,65,35,10),
 ship('B','80R',200,220,100,100,20),
 ship('C','81L',999,1000,500,499,1)
];
const records=[
 row('r1','A','AQC7901',65,45,{remark:'AQC故障',stopItem1:'機故',stopTime1:20}),
 row('r1','A','AQC7901',65,45,{remark:'AQC故障',stopItem1:'機故',stopTime1:20}),
 row('r2','B','AQC8002',105,115),
 row('r3','C','AQC8101',500,499),
 row('r4','A','AQC8002',0,0),  // wrong berth for this ship
 row('r5','UNKNOWN','unknown',1,1)
];
const legacyKey='A|2026-11-10|AQC7901|設備故障|填報:20:機故';
let saved=JSON.stringify({[legacyKey]:'系統異常'});
const elements={};
for(const id of ['terminalDashboardRoot','terminalMonth','terminalWharfBody','terminalKpi',
 'terminalDayBody','terminalShiftBody','terminalStopBody','terminalStopCategoryKpis','terminalStopDetailBody',
 'terminalStopDetailCaption','terminalReasonFilter','terminalWarnings','terminalMonthCaption',
 'terminalDataStatus','terminalRodOverviewMount','terminalReconciliationMount']){
 elements[id]={dataset:{},style:{},innerHTML:'',textContent:'',value:id==='terminalMonth'?'2026-11':''};
}
elements.terminalMonth.dataset.p79Year='2026';
const context={window:{},document:{getElementById:id=>elements[id]||null},console:{warn(){}},
 localStorage:{getItem:()=>saved,setItem:(k,v)=>{saved=v;}},
 shipMasters:ships,records,getPort79Year:()=>2026,
 shipMasterDateMatchesMonth:(s,m)=>String(s.lastDate||'').startsWith(m)};
vm.createContext(context);
for(const code of [opsCode,rodCode,auditCode])vm.runInContext(code,context);
const api=context.window.P79TerminalOps;
const rod=context.window.P79TerminalRodOverview;
const auditor=context.window.P79TerminalDataAudit;
assert.deepEqual(Array.from(rod.RODS['79']),['AQC7901','AQC7902','AQC7903','AQC7905']);
assert.deepEqual(Array.from(rod.RODS['80']),['AQC8001','AQC8002','AQC8003','AQC8005','AQC8006']);
const scope=api.scopeTo79and80('2026-11',ships,records);
assert.deepEqual(Array.from(scope.ships,s=>s.workingNo),['A','B'],'wharf 81 excluded');
assert.deepEqual(Array.from(scope.records,r=>r.id),['r1','r2'],'duplicates, foreign and conflicted records excluded');
assert.equal(scope.excludedShips,1);
assert.equal(scope.excludedRecords,1);
assert.equal(scope.conflictingRecords,1);
assert.equal(scope.unassignedRecords,1);
assert.equal(api.targetPort('79L'),'79');
assert.equal(api.targetPort('80R'),'80');
assert.equal(api.targetPort('81L'),'');
assert.equal(api.recordAqcPort({number:'AQC8002'}),'80');
const before=JSON.stringify([ships,records]);
const stats=api.build('2026-11',scope.ships,scope.records);
assert.equal(JSON.stringify([ships,records]),before,'scope and reconciliation are read-only');
assert.equal(stats.vesselTotals.ships,2);
assert.equal(stats.vesselTotals.billed,300);
assert.equal(stats.vesselTotals.moves,330);
assert.equal(stats.vesselTotals.shift,30);
assert.equal(stats.totalStopEvents,1,'one Remark + same-row stop report cannot count twice');
assert.equal(stats.totalStopMinutes,20,'the confirmed time comes from the stop form');
assert.equal(stats.unknownStopEvents,0,'linked Remark no longer creates a phantom pending incident');
assert.equal(stats.stopDetails[0].reason,'AQC故障','retain original Remark reason for audit');
assert.equal(stats.stopDetails[0].category,'系統異常','prior manually selected category retained after merge');
assert.equal(stats.stopDetails[0].manualCategory,'系統異常');
assert.equal(stats.manualAliasMap[stats.stopDetails[0].eventKey][0],legacyKey,'legacy override is associated');
const separate=api.stopEventsForRecord(row('independent','A','AQC7902',0,0,{
 remark:'AQC故障',stopItem1:'機故',stopTime1:7,stopItem2:'設備故障',stopTime2:9
}));
assert.equal(separate.length,3,'two same-category timed records are ambiguous and must not be merged away');
const timed=api.stopEventsForRecord(row('timed','A','AQC7902',0,0,{
 remark:'AQC故障 08:00-08:20',stopItem1:'機故',stopTime1:20
}));
assert.equal(timed.length,1,'exact matching interval and filled stop stay one event');
const audit=auditor.audit(stats,scope);
assert(audit.alerts.some(a=>a.code==='raw-79'&&a.message.includes('+10')),'79 cross-file discrepancy flagged');
assert(audit.alerts.some(a=>a.code==='raw-80'&&a.message.includes('+20')),'80 cross-file discrepancy flagged');
assert(audit.notes.some(n=>n.includes('未歸入 79／80 碼頭 1 艘')),'scope exclusion shown');
assert(audit.notes.some(n=>n.includes('SHIFT 10')),'expected SHIFT accounting described without calling it automatically correct');
assert(audit.alerts.some(a=>a.code==='scope-conflict'),'source berth/crane conflicts flagged');
const other=api.build('2026-11',[ship('D','79L',100,112,65,35,10)],[
 row('d','D','AQC7901',65,35)]);
const otherAudit=auditor.audit(other,{excludedShips:0,excludedRecords:0,conflictingRecords:0,unassignedRecords:0});
assert(otherAudit.alerts.some(a=>a.code==='move-79'),'unexpected move mismatch flagged');
const noData=auditor.audit(api.build('2026-11',[],[]),{});
assert(noData.verdict.includes('無法核對'),'empty source cannot appear all-clear');
console.log('PASS terminal audit: exact 79/80 scope, event dedup, manual override, report vs sheet gaps, move check, no source mutations');

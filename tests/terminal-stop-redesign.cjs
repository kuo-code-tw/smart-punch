'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const css=fs.readFileSync('aqc-efficiency/terminal-stop-redesign.css','utf8');
const script=fs.readFileSync('aqc-efficiency/terminal-ops.js','utf8');
assert(html.includes('terminal-stop-redesign.css?v=20261110-stop-v1'),'versioned stop stylesheet included');
assert(html.includes('p79-ter-stop-redesigned'),'exception section uses dashboard styling');
assert(html.includes('p79-stop-overview-table'),'summary table class wired');
assert(html.includes('p79-stop-detail-table'),'events table class wired');
assert(html.includes('id="terminalStopTotalEvents"'));
assert(html.includes('id="terminalStopConfirmedMinutes"'));
assert(html.includes('id="terminalStopUnknownEvents"'));
assert(html.includes('id="terminalStopCategoryKpis"'));
assert(html.includes('id="terminalReasonFilter"'));
assert(html.includes('id="terminalStopDetailBody"'));
assert(css.includes('grid-template-columns:repeat(6,minmax(0,1fr))'),'desktop exception cards in a single six-column row');
assert(css.includes('@media(max-width:760px)'),'responsive exception cards');
assert(css.includes('.p79-stop-detail-wrap{max-height:390px;overflow:auto}'),'scrollable event table');
assert(css.includes('.p79-stop-category-tag'),'category pills');
assert(!script.includes('apiPost(')&&!script.includes('postCloud(')&&!script.includes('gcSyncAll'),'statistic module read only');
const ids=['terminalDashboardRoot','terminalMonth','terminalKpi','terminalWharfBody','terminalDayBody',
 'terminalShiftBody','terminalStopBody','terminalStopCategoryKpis','terminalStopDetailBody',
 'terminalStopDetailCaption','terminalDataStatus','terminalWarnings','terminalMonthCaption',
 'terminalStopTotalEvents','terminalStopConfirmedMinutes','terminalStopUnknownEvents','terminalReasonFilter'];
const elements=Object.fromEntries(ids.map(id=>[id,{dataset:{},style:{},innerHTML:'',textContent:'',value:id==='terminalMonth'?'2026-11':''}]));
elements.terminalMonth.dataset.p79Year='2026';
const ships=[{workingNo:'A',lastDate:'2026-11-10',wharf:'79L',totalContainers:15,totalMoves:17,workingSheetSource:{disc:8,load:7}}];
const recs=[{id:'r1',workingNo:'A',workDate:'2026-11-10',source:'working-report',
 number:'AQC7901',startTime:'08:00',endTime:'09:00',disc:3,load:5,stopItem1:'機故',stopTime1:20,remark:'AQC故障'}];
const context={window:{},document:{getElementById:id=>elements[id]},console:{warn(){}},
 getPort79Year:()=>2026,shipMasterDateMatchesMonth:(s,m)=>String(s.lastDate||'').startsWith(m),
 shipMasters:ships,records:recs};
vm.createContext(context);vm.runInContext(script,context);
const api=context.window.P79TerminalOps;
assert(api,'terminal ops API');
const stats=api.build('2026-11',ships,recs);
api.render();
assert.equal(elements.terminalStopTotalEvents.textContent,String(stats.totalStopEvents),'count from original WORKING REPORT summary');
assert.equal(elements.terminalStopConfirmedMinutes.textContent,String(stats.totalStopMinutes),'minutes from existing calculation');
assert.equal(elements.terminalStopUnknownEvents.textContent,String(stats.unknownStopEvents),'pending count from original summary');
assert(elements.terminalStopCategoryKpis.innerHTML.includes('p79-ter-stop-kpi tone-rose'),'category styles');
assert(elements.terminalStopDetailBody.innerHTML.includes('p79-stop-category-tag tone-rose'),'detail category badge');
assert(!elements.terminalStopDetailBody.innerHTML.includes('class="p79-stop-pending"'),'timed report resolves a matching untimed Remark');
assert(elements.terminalStopDetailBody.innerHTML.includes('setReasonCategory'),'original manual classification remains available');
api.selectCategory('設備故障');
assert(elements.terminalStopDetailCaption.textContent.includes('設備故障'),'category filter works');
assert(elements.terminalStopCategoryKpis.innerHTML.includes('active'),'selected category highlighted');
context.shipMasters=[];
context.records=[];
elements.terminalMonth.value='2026-10';
api.render();
assert.equal(elements.terminalStopTotalEvents.textContent,'—','no source data must not display fake zero event count');
assert.equal(elements.terminalStopConfirmedMinutes.textContent,'—','no source data must not display fake confirmed minutes');
assert.equal(elements.terminalStopUnknownEvents.textContent,'—','no source data must not display fake pending count');
console.log('PASS terminal stoppages: dashboard styling, source-backed counts, filtering, manual classification, no-data values');

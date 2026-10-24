const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert(start>=0,name);const line=html.slice(start,html.indexOf('\n',start));return line.endsWith('}')?line:html.slice(start,html.indexOf('\n}',start)+2);}
const els={workloadSheetAuditBody:{},workloadSheetAuditState:{}};
const c={num:v=>Number(v)||0,round:(v,n=2)=>Number(v.toFixed(n)),shipMasters:[],
 document:{getElementById:id=>els[id]},esc:v=>String(v).replace(/</g,'&lt;'),vesselLabelForRecord:r=>r.vessel,
 workloadRecordMetrics:r=>({disc:r.disc,load:r.load,hc:r.hatches,containers:r.disc+r.load}),
 recordRawMoveSplit:r=>({disc:r.rawDisc??r.disc,load:r.rawLoad??r.load}),effectiveBundleRecord:r=>({bundleDeduct:r.bundleDeduct||0})};
vm.createContext(c);for(const name of ['workloadVesselGroupKey','workloadSheetAudit','renderWorkloadSheetAudit'])vm.runInContext(fn(name),c);
const master={workingNo:'5260182',vessel:'TEST VESSEL',workingSheetSource:{disc:150,load:419,totalContainers:569,totalMoves:569,shiftMoves:0,hatches:16,bundleDeduct:0}};
const rows=[{workingNo:'5260182',vessel:'TEST VESSEL',name:'Driver A',workDate:'2026-10-16',disc:49,load:112,hatches:6},
 {workingNo:'5260182',vessel:'TEST VESSEL',name:'Driver B',workDate:'2026-10-17',disc:52,load:166,hatches:7},
 {workingNo:'5260182',vessel:'TEST VESSEL',name:'Driver C',workDate:'2026-10-17',disc:49,load:141,hatches:3}];
let passed=0;function test(name,f){f();passed++;console.log('PASS '+name);}
test('all drivers reconcile 150 discharge + 419 load = 569 and 16 HC',()=>{const a=c.workloadSheetAudit(master,rows);assert.equal(a.containers,569);assert.equal(a.diff,0);assert.equal(a.status,'match');});
test('missing driver is a mismatch, never repaired by redistributing quantities',()=>{const before=JSON.stringify(rows),a=c.workloadSheetAudit(master,rows.slice(1));assert.equal(a.status,'mismatch');assert.equal(a.diff,-161);assert.equal(JSON.stringify(rows),before);});
test('same total with wrong DISC/LOAD split fails',()=>{const changed=structuredClone(rows);changed[0].disc++;changed[0].load--;const a=c.workloadSheetAudit(master,changed);assert.equal(a.diff,0);assert.equal(a.status,'mismatch');assert(a.reasons.includes('DISC／LOAD 分項不一致'));});
test('same containers with wrong HC fails',()=>{const changed=structuredClone(rows);changed[0].hatches++;assert.equal(c.workloadSheetAudit(master,changed).status,'mismatch');});
test('missing source or source metric is pending even if totals would match',()=>{assert.equal(c.workloadSheetAudit(null,rows).status,'pending');const m=structuredClone(master);delete m.workingSheetSource.totalMoves;assert.equal(c.workloadSheetAudit(m,rows).status,'pending');assert.equal(c.workloadSheetAudit(master,[]).status,'pending');});
test('zero is a valid source value',()=>{const m={workingSheetSource:{disc:0,load:0,totalContainers:0,totalMoves:0,shiftMoves:0,hatches:0,bundleDeduct:0}};assert.equal(c.workloadSheetAudit(m,[{disc:0,load:0,hatches:0}]).status,'match');});
test('shift is compared against operation Moves separately from billing',()=>{const m=structuredClone(master);m.workingSheetSource.totalContainers=559;m.workingSheetSource.shiftMoves=10;assert.equal(c.workloadSheetAudit(m,rows).status,'match');});
test('Bundle must be assigned to real report details and mathematically consistent',()=>{const m={workingSheetSource:{disc:10,load:20,totalContainers:27,totalMoves:27,shiftMoves:0,hatches:0,bundleDeduct:3}},rs=[{disc:10,load:17,rawDisc:10,rawLoad:20,bundleDeduct:3,hatches:0}];assert.equal(c.workloadSheetAudit(m,rs).status,'match');rs[0].bundleDeduct=2;assert.equal(c.workloadSheetAudit(m,rs).status,'mismatch');});
test('a one-driver, one-day selection still audits all drivers and dates for its ship',()=>{c.shipMasters=[master];c.renderWorkloadSheetAudit([rows[1]],rows);assert(els.workloadSheetAuditBody.innerHTML.includes('569'));assert(els.workloadSheetAuditState.textContent.includes('1 艘一致'));});
test('child WORKING NO is isolated and cannot make parent match',()=>{c.shipMasters=[master];const child={...rows[0],workingNo:'5260182-1'};c.renderWorkloadSheetAudit([rows[1]],[rows[1],rows[2],child]);assert(els.workloadSheetAuditState.textContent.includes('1 艘不一致'));});
test('no selection resets the audit instead of showing a stale green result',()=>{c.renderWorkloadSheetAudit([],rows);assert(els.workloadSheetAuditState.textContent.includes('0 艘船'));assert(els.workloadSheetAuditBody.innerHTML.includes('沒有 WORKING REPORT'));});
test('person statistics refresh the full-ship audit before the no-person early return',()=>{const src=fn('renderPersonStats');assert(src.indexOf('renderWorkloadSheetAudit(')<src.indexOf('if(!pid)'));assert(src.includes('idx.rows'));});
test('monthly export exists in shared function menu and its action group',()=>{const menu=fs.readFileSync(path.join(__dirname,'../assets/port79-seven-top.js'),'utf8');assert(menu.includes("['monthly-export','📥 匯出每月作業量表']"));assert(menu.includes("if(a==='monthly-export')return window.openVesselMonthlyExportDialog?.()"));assert(menu.includes("'import','export','monthly-export'"));assert(html.includes('id="vesselMonthlyExportMonth" type="month"'));assert(html.includes('port79-seven-top.js?v='),'shared menu asset should be versioned');});
for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(script[1].trim())new vm.Script(script[1]);
console.log(JSON.stringify({passed,failed:0,scope:'Read-only reconciliation and monthly menu wiring; no backend calls'}));

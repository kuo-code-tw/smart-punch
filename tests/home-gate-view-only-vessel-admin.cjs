'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'..');
const home=fs.readFileSync(path.join(base,'index.html'),'utf8');
const vessel=fs.readFileSync(path.join(base,'aqc-efficiency/index.html'),'utf8');
const gate=fs.readFileSync(path.join(base,'gate-import/index.html'),'utf8');
const start=home.indexOf('id="p79HomeGatePanel"');
const end=home.indexOf('</article>',start);
const card=home.slice(start,end);
assert(start>=0&&end>start,'compact home Gate statistics card');
assert(!card.includes('href='),'homepage Gate summary must not link to import, export or data edits');
assert(!card.includes('gateSave')&&!card.includes('gateDownload'),'homepage contains no Gate edit actions');
for(const id of ['p79GatePrev','p79GateNext','p79GateMonth','p79GateYear','p79GateTruckEntries']){
 assert(card.includes('id="'+id+'"'),'homepage retains '+id+' for viewing stats');
}
assert(vessel.includes('data-tab="gate"'),'vessel system includes Gate management tab');
assert(vessel.includes('id="view-gate"'),'vessel system has separate Gate management panel');
assert(vessel.includes('data-src="../gate-import/?embed=1"'),'Gate import loads under vessel system');
assert(vessel.includes("'dispatch','gate'")||vessel.includes("'dispatch','gate']"),'vessel tab router recognizes Gate');
assert(vessel.includes("if(name==='gate')"),'vessel tab select lazily loads Gate manager');
assert(gate.includes("data-gate-embed"),'Gate upload page renders inside vessel system');
assert(gate.includes("location.replace('../aqc-efficiency/?tab=gate')"),'old standalone Gate URL redirects into vessel system');
for(const id of ['gateFile','gatePreview','gateSave','gateDownload']){
 assert(gate.includes('id="'+id+'"'),'Gate admin retains upload/export control '+id);
}
console.log('PASS: homepage Gate is view-only; Gate upload/export moved into vessel-system tab.');

'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
globalThis.P79AttendanceV6=require('../attendance/v6-engine.js');
const el=()=>({textContent:'',title:'',dataset:{},setAttribute(){},innerHTML:'',insertAdjacentHTML(a,b){this.innerHTML+=b;}});
const card=el(),count=el(),hint=el(),details=el(),dialog={open:true,querySelector:()=>null},status=el();
const elements={p79DashEarlyPunchTrigger:card,p79DashEarlyPunchCount:count,p79DashEarlyPunchHint:hint,p79EarlyPunchRows:details,p79DashEarlyPunchDialog:dialog,p79EarlyPunchDialogStatus:status};
globalThis.document={getElementById:id=>elements[id]||null};
const api=require('../assets/port79-home-early-punch-alert.js');
const punch={id:'REAL-1',empId:'E1',attNo:'001',name:'測試甲',status:'上班簽到',timeStr:'2026/11/20 08:02:00'};
const roster={empId:'E1',attNo:'001',name:'測試甲',schedule:{'2026-11-20':'早'}};
let r=api.render({records:[punch]},{schedules:[roster]},'2026-11',{
 now:Date.parse('2026-11-20T17:10:00+08:00'),leaveData:{leaveRecords:[]},
 preview:true,provisionalReason:'核准請假資料權限不足'
});
assert.equal(r.count,1,'Provisional report may show a real one-sided pair');
assert.equal(count.textContent,'1?','Tentative count cannot be mistaken for confirmed');
assert.equal(card.dataset.alertState,'unverified','Preview must not use red confirmed warning');
assert.match(hint.textContent,/初步候選/);
assert.match(hint.title,/請假資料權限不足/);
assert.match(details.innerHTML,/候選/);
assert.match(details.innerHTML,/核准請假資料權限不足/);
assert.equal(r.details[0].clockInEvents[0].id,'REAL-1','Original punch ID preserved for exact-row official edit');
assert.match(r.details[0].reason,/候選/,'Not formally confirmed missing');
r=api.render({records:[punch]},{schedules:[roster]},'2026-11',{
 now:Date.parse('2026-11-20T17:10:00+08:00'),leaveData:{leaveRecords:[]}
});
assert.equal(count.textContent,'1','Confirmed read uses unqualified count');
assert.equal(card.dataset.alertState,'pending');
assert.doesNotMatch(r.details[0].reason,/候選/);
const dash=fs.readFileSync('assets/port79-monthly-dashboard.js','utf8');
assert.match(dash,/Promise\.any\(\[live,historical\]\)/);
assert.match(dash,/preview:provisional/);
assert.match(dash,/if\(!can\.attendance\|\|!can\.schedule\)/,'Denied permission never stays a silent dash');
console.log('PASS pending duty: provisional candidate with source warning, verified count only with complete data, original record link intact');

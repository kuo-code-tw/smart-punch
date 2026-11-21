'use strict';
const assert=require('node:assert/strict');
globalThis.P79AttendanceV6=require('../attendance/v6-engine.js');
globalThis.location={href:'https://example.test/smart-punch/',origin:'https://example.test'};
globalThis.p79AuditAttendanceEditorUrl=()=> 'https://example.test/smart-punch/attendance/?v=1#port79sso=test';
const bridgeCalls=[];
globalThis.P79HomeAuditInlineEditor={open:args=>{bridgeCalls.push(args);return true},close:()=>{},isWriting:()=>false};
const listeners=new Map(),nodes=new Map();
function node(id){
 if(nodes.has(id))return nodes.get(id);
 const n={id,hidden:false,textContent:'',innerHTML:'',dataset:{},classList:{contains:()=>true},
 setAttribute(){},addEventListener:(name,fn)=>listeners.set(id+':'+name,fn),
 insertAdjacentHTML(_,value){this.innerHTML+=value;}};
 nodes.set(id,n);return n;
}
const dialog=node('p79DashEarlyPunchDialog');
dialog.open=true;
dialog.querySelector=s=>({'[data-early-add]':node('add'),'[data-early-attendance]':node('link')})[s]||null;
dialog.querySelectorAll=()=>[];
dialog.showModal=()=>{dialog.open=true;};
dialog.close=()=>{dialog.open=false;};
globalThis.document={getElementById:node};
const audit=require('../assets/port79-home-early-punch-alert.js');
const day='2026-11-20';
const p={empId:'E1',attNo:'001',name:'測試甲',schedule:{[day]:'早'}};
const attendance={records:[{id:'R1',empId:'E1',attNo:'001',name:'測試甲',status:'上班簽到',timeStr:'2026/11/20 07:36:00'}]};
const data=audit.render(attendance,{schedules:[p]},'2026-11',
 {leaveData:{leaveRecords:[]},now:Date.parse('2026-11-20T17:02:00+08:00')});
assert.equal(data.count,1);
assert.match(node('p79EarlyPunchRows').innerHTML,/class="p79-early-pencil"/);
assert.match(node('p79EarlyPunchRows').innerHTML,/class="p79-early-add"/);
audit.bind(async()=>({attendance,schedule:{schedules:[p]},leaveData:{leaveRecords:[]},month:'2026-11'}));
function click(side){
 const before=globalThis.location.href;
 listeners.get('p79EarlyPunchRows:click')({target:{closest:()=>({dataset:{earlyEdit:'0',earlySide:side}})}});
 assert.equal(globalThis.location.href,before,'Audit detail must never navigate away');
 const args=bridgeCalls.at(-1);
 assert.match(args.url,/\/attendance\/\?v=1#port79sso=test/);
 assert.equal(args.row.name,'測試甲');
 assert.equal(args.side,side);
 return args;
}
const edit=click('IN');
assert.equal(edit.row.clockInEvents[0].id,'R1');
const add=click('OUT');
assert.equal(add.row.clockInEvents[0].id,'R1');
assert.equal(bridgeCalls.length,2);
globalThis.p79AuditAttendanceEditorUrl=()=> '';
audit.render(attendance,{schedules:[p]},'2026-11',
 {leaveData:{leaveRecords:[]},now:Date.parse('2026-11-20T17:02:00+08:00')});
assert.doesNotMatch(node('p79EarlyPunchRows').innerHTML,/p79-early-pencil|p79-early-add/);
console.log('PASS pending-duty inline: purple pencil/yellow plus, same dialog, original form bridge and permission guard');

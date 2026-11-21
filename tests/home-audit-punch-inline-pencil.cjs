'use strict';
const assert=require('node:assert/strict');
globalThis.P79AttendanceV6=require('../attendance/v6-engine.js');
globalThis.location={href:'https://example.test/smart-punch/',origin:'https://example.test'};
let saved={};
globalThis.sessionStorage={getItem:k=>saved[k]||null,setItem:(k,v)=>saved[k]=v,removeItem:k=>delete saved[k]};
globalThis.p79AuditAttendanceEditorUrl=()=> 'https://example.test/smart-punch/attendance/?v=1#port79sso=test';
const listeners=new Map(),nodes=new Map();
function node(id){
 if(nodes.has(id))return nodes.get(id);
 const n={id,hidden:false,textContent:'',innerHTML:'',dataset:{},
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
 globalThis.location.href='https://example.test/smart-punch/';
 listeners.get('p79EarlyPunchRows:click')({target:{closest:()=>({dataset:{earlyEdit:'0',earlySide:side}})}});
 const url=new URL(globalThis.location.href);
 assert.equal(url.pathname,'/smart-punch/attendance/');
 assert.equal(url.searchParams.get('entry'),'manage');
 assert.equal(url.hash,'#port79sso=test');
 return JSON.parse(saved.port79_attendance_audit_handoff_v1);
}
const edit=click('IN');
assert.equal(edit.side,'IN');
assert.equal(edit.clockInEvents[0].id,'R1');
const add=click('OUT');
assert.equal(add.side,'OUT');
assert.equal(add.clockInEvents[0].id,'R1');
globalThis.p79AuditAttendanceEditorUrl=()=> '';
globalThis.location.href='https://example.test/smart-punch/';
audit.render(attendance,{schedules:[p]},'2026-11',
 {leaveData:{leaveRecords:[]},now:Date.parse('2026-11-20T17:02:00+08:00')});
assert.doesNotMatch(node('p79EarlyPunchRows').innerHTML,/p79-early-pencil|p79-early-add/);
console.log('PASS audit native navigation: existing pencil, yellow missing-side add, exact identity transfer, same origin and permission guard');

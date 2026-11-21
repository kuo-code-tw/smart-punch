'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'assets/port79-home-early-punch-alert.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/port79-monthly-dashboard.css'),'utf8');
new vm.Script(source);
assert.match(html,/id="p79EarlyPunchEditorFrame"/);
assert.match(html,/data-early-editor-back/);
assert.match(html,/data-early-add hidden/);
assert.match(html,/p79AuditAttendanceEditorUrl=function/);
assert.match(html,/\.attendance!=='manage'/,'only official attendance managers may use embedded editor');
assert.match(source,/frame\.src=url/);
assert.match(source,/await recheck\(\)/);
assert.match(css,/\.p79-early-editing/);

globalThis.P79AttendanceV6=require('../attendance/v6-engine.js');
globalThis.location={href:'https://example.test/smart-punch/index.html',origin:'https://example.test'};
globalThis.p79AuditAttendanceEditorUrl=()=> 'https://example.test/smart-punch/attendance/?v=1#port79sso=test';

const nodes=new Map(),listeners=new Map();
function node(key){
 if(nodes.has(key))return nodes.get(key);
 const state={hidden:key==='p79EarlyPunchEditor',innerHTML:'',textContent:'',dataset:{},
  classList:{add(){},remove(){}},
  addEventListener(name,callback){listeners.set(key+':'+name,callback)},
  setAttribute(name,value){this[name]=value},
  removeAttribute(name){if(name==='src')this.src=''},
  insertAdjacentHTML(position,value){this.innerHTML+=value}};
 nodes.set(key,state);
 return state;
}
const btn=node('p79DashEarlyPunchTrigger');
const dialog=node('p79DashEarlyPunchDialog');
dialog.open=true;
dialog.querySelector=selector=>{
 if(selector==='[data-early-add]')return node('addButton');
 if(selector==='[data-early-editor-back]')return node('backButton');
 if(selector==='[data-early-attendance]')return node('attendanceLink');
 return null;
};
dialog.querySelectorAll=()=>[];
dialog.close=()=>{dialog.open=false};
dialog.showModal=()=>{dialog.open=true};
globalThis.document={getElementById:node};
const report=require('../assets/port79-home-early-punch-alert.js');
const date='2026-11-10';
const employee=(emp,name)=>({empId:emp,attNo:emp,name,group:'A組',schedule:{[date]:'早'}});
const roster={schedules:[employee('E1','測試甲'),employee('E2','測試乙')]};
const attendance={records:[
 {id:'2-in',empId:'E2',attNo:'E2',name:'測試乙',status:'上班簽到',timeStr:'2026/11/10 08:00:00'},
 {id:'2-out',empId:'E2',attNo:'E2',name:'測試乙',status:'下班簽退',timeStr:'2026/11/10 16:00:00'}]};
const options={now:Date.parse('2026-11-10T08:31:00+08:00'),leaveData:{leaveRecords:[]}};
let rechecks=0;
report.bind(async()=>{rechecks++;return {attendance,schedule:roster,month:'2026-11',leaveData:{leaveRecords:[]}}});
const outcome=report.render(attendance,roster,'2026-11',options);
assert.equal(outcome.count,1);
assert.match(node('p79EarlyPunchRows').innerHTML,/data-early-edit="0"/,'manager sees per-row attendance editor');
assert.equal(node('addButton').hidden,false,'manager can add even before selecting a row');
listeners.get('p79EarlyPunchRows:click')({target:{closest:()=>({dataset:{earlyEdit:'0'}})}});
assert.equal(node('p79EarlyPunchEditor').hidden,false);
assert.equal(node('p79EarlyPunchRows').hidden,true);
assert.match(node('p79EarlyPunchEditorWho').textContent,/測試甲/);
assert.equal(node('p79EarlyPunchEditorFrame').src,globalThis.p79AuditAttendanceEditorUrl());
(async()=>{
 await listeners.get('backButton:click')();
 assert.equal(node('p79EarlyPunchEditor').hidden,true,'return closes editor without modifying data');
 assert.equal(node('p79EarlyPunchEditorFrame').src,'','SSO URL is discarded on return');
 assert.equal(rechecks,1,'return triggers fresh official cloud reread');
 globalThis.p79AuditAttendanceEditorUrl=()=> '';
 report.render(attendance,roster,'2026-11',options);
 assert.doesNotMatch(node('p79EarlyPunchRows').innerHTML,/data-early-edit/,'view-only user cannot edit');
 assert.equal(node('addButton').hidden,true,'view-only user cannot add');
 globalThis.p79AuditAttendanceEditorUrl=()=> 'https://evil.example/attendance/';
 report.render(attendance,roster,'2026-11',options);
 assert.doesNotMatch(node('p79EarlyPunchRows').innerHTML,/data-early-edit/,'cross-origin page is rejected');
 globalThis.p79AuditAttendanceEditorUrl=()=> 'https://example.test/smart-punch/attendance/';
 report.render({records:[]},{schedules:[]},'2026-11',options);
 assert.equal(node('addButton').hidden,false,'manager can add a punch when pending list is empty');
 assert(!source.includes("action:'addRecord'")&&!source.includes("action:'updateRecord'"),
  'audit popup must reuse original editor, not create an unverified attendance write path');
 console.log('PASS home roster audit: editor in same dialog, manager-only add/correct, official iframe, cloud recheck and no duplicate writer');
})().catch(error=>{console.error(error);process.exitCode=1});

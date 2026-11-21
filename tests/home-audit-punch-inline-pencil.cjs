'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/port79-home-early-punch-alert.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/port79-monthly-dashboard.css'),'utf8');
new vm.Script(source);
assert(html.includes('20261121-inline-pencil-v2'),'website refreshes updated pencil script');
assert.match(source,/data-early-side/);
assert.match(css,/\.p79-early-pencil/);
assert(!source.includes('<th>考勤修正</th>'),'remove separate large edit column');
assert(source.includes('child.openEditRecordModal(chosen.id,side,chosen.timeStr'));
assert(source.includes('child.openRowManualAdd('),'missing side uses existing official punch addition');
globalThis.P79AttendanceV6=require('../attendance/v6-engine.js');
globalThis.location={href:'https://example.test/smart-punch/',origin:'https://example.test'};
globalThis.p79AuditAttendanceEditorUrl=()=> 'https://example.test/smart-punch/attendance/?entry=manage#port79sso=test';
const listeners=new Map(),nodes=new Map(),calls=[];
function node(id){
 if(nodes.has(id))return nodes.get(id);
 const classes=new Set();
 const x={id,hidden:id==='p79EarlyPunchEditor',textContent:'',innerHTML:'',src:'',
  dataset:{},classList:{
   contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k)},
  addEventListener:(name,fn)=>listeners.set(id+':'+name,fn),
  setAttribute(){},removeAttribute(k){if(k==='src')this.src='';},
  insertAdjacentHTML(_,text){this.innerHTML+=text;}};
 nodes.set(id,x);return x;
}
const dialog=node('p79DashEarlyPunchDialog');
dialog.open=true;
dialog.querySelector=sel=>({
 '[data-early-add]':node('add'),
 '[data-early-editor-back]':node('back'),
 '[data-early-attendance]':node('elsewhere')
})[sel]||null;
dialog.querySelectorAll=()=>[];
dialog.close=()=>{dialog.open=false};
dialog.showModal=()=>{dialog.open=true};
globalThis.document={getElementById:node};
const officialDoc={getElementById:id=>{
 if(id==='viewAdmin')return node('official-admin');
 return node('official-'+id);
}};
node('official-editRecordModal').classList.add('hidden');
node('official-addRecordModal').classList.add('hidden');
const child={
 location:{origin:'https://example.test'},document:officialDoc,
 p79AttendanceRecordCounts:()=>({visibleRawRecords:4}),
 async openEditRecordModal(...args){
  calls.push({action:'edit',args});node('official-editRecordModal').classList.remove('hidden');
 },
 async openRowManualAdd(...args){
  calls.push({action:'add',args});node('official-addRecordModal').classList.remove('hidden');
 }
};
const frame=node('p79EarlyPunchEditorFrame');frame.contentWindow=child;
const audit=require('../assets/port79-home-early-punch-alert.js');
const day='2026-11-20';
const p1={empId:'E1',attNo:'001',name:'測試甲',schedule:{[day]:'早'}};
const p2={empId:'E2',attNo:'002',name:'測試乙',schedule:{[day]:'早'}};
const punch=(id,p,status,clock)=>({
 id,empId:p.empId,attNo:p.attNo,name:p.name,status,
 timeStr:'2026/11/20 '+clock});
const in1=punch('R1',p1,'上班簽到','07:36:00');
const in2=punch('R2',p2,'上班簽到','08:00:00');
const out2=punch('R3',p2,'下班簽退','16:00:00');
const roster={schedules:[p1,p2]},leaveData={leaveRecords:[]};
const options={leaveData,now:Date.parse('2026-11-20T17:02:00+08:00')};
let cloudReads=0;
audit.bind(async()=>{cloudReads++;return {attendance:{records:[in1,in2,out2]},schedule:roster,leaveData,month:'2026-11'}});
const value=audit.render({records:[in1,in2,out2]},roster,'2026-11',options);
assert.equal(value.count,1,'incomplete punch appears in audit');
assert.equal(value.details[0].clockInEvents[0].id,'R1','real cloud record identity preserved');
const row=node('p79EarlyPunchRows').innerHTML;
assert.equal((row.match(/class="p79-early-pencil"/g)||[]).length,2,'one pen in each punch cell');
assert.match(row,/07:36:00<\/span><button[^>]*data-early-side="IN"/);
assert.match(row,/—<\/span><button[^>]*data-early-side="OUT"/);
const click=side=>listeners.get('p79EarlyPunchRows:click')({
 target:{closest:()=>({dataset:{earlyEdit:'0',earlySide:side}})}
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 click('IN');assert(frame.onload,'clicking a pencilled time loads official editor');
 frame.onload();await tick();
 assert.equal(calls[0].action,'edit');
 assert.equal(calls[0].args[0],'R1');
 assert.equal(calls[0].args[1],'IN');
 assert.equal(calls[0].args[2],'2026/11/20 07:36:00');
 assert.equal(calls[0].args[5],true,'existing punch must reverify official cloud');
 assert.equal(frame.onload,null,'later navigation may not reopen the modal');
 await listeners.get('back:click')();
 assert.equal(cloudReads,1,'on return reread official cloud');
 click('OUT');frame.onload();await tick();
 assert.equal(calls[1].action,'add','missing punch uses the existing official add UI');
 assert.equal(decodeURIComponent(calls[1].args[1]),day);
 assert.equal(calls[1].args[2],'下班簽退');
 assert.equal(decodeURIComponent(calls[1].args[3]),'R1','pair to the existing IN event');
 await listeners.get('back:click')();
 globalThis.p79AuditAttendanceEditorUrl=()=> '';
 audit.render({records:[in1,in2,out2]},roster,'2026-11',options);
 assert(!node('p79EarlyPunchRows').innerHTML.includes('p79-early-pencil'),'view-only users see no pen');
 assert.equal(calls.length,2,'no independent writer or automatic save');
 console.log('PASS audit punch pencils: exact IN edit, missing OUT add, official cloud check, refreshed audit and view-only protection');
})().catch(error=>{console.error(error);process.exitCode=1});

'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-attendance-audit-handoff.js','utf8');
const now=Date.now();
async function run(side){
 const records=[{id:'R1',empId:'E1',attNo:'001',name:'測試甲',status:'上班簽到',timeStr:'2026/11/20 07:36:00'}];
 const payload={source:'home-early-audit',createdAt:now,side,date:'2026-11-20',shift:'早',
  empId:'E1',attNo:'001',name:'測試甲',clockInEvents:[{id:'R1',timeStr:'2026/11/20 07:36:00'}],clockOutEvents:[]};
 const store={port79_attendance_audit_handoff_v1:JSON.stringify(payload)},calls=[];
 const w={document:{readyState:'complete',getElementById:()=>({})},
  sessionStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v,removeItem:k=>delete store[k]},
  records,openEditRecordModal:async(...args)=>calls.push({action:'edit',args}),
  openRowManualAdd:async(...args)=>calls.push({action:'add',args}),
  setInterval:()=>1,clearInterval:()=>{},
  addEventListener:()=>{},
  location:{href:'https://example.test/smart-punch/attendance/'}};
 const c={window:w,records,isAdminLoggedIn:true,Date,URL,console,setTimeout,clearTimeout};
 vm.createContext(c);vm.runInContext(source,c);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(store.port79_attendance_audit_handoff_v1,undefined,'handoff consumed once');
 assert.equal(calls.length,1);
 return calls[0];
}
(async()=>{
 let c=await run('IN');
 assert.equal(c.action,'edit');
 assert.equal(c.args[0],'R1');
 assert.equal(c.args[1],'IN');
 assert.equal(c.args[5],true,'must verify official cloud');
 c=await run('OUT');
 assert.equal(c.action,'add');
 assert.equal(c.args[2],'下班簽退');
 assert.equal(decodeURIComponent(c.args[3]),'R1','retain exact pair anchor');
 console.log('PASS native attendance handoff: edit and yellow plus invoke official forms with exact identity and cloud check');
})().catch(e=>{console.error(e);process.exitCode=1;});

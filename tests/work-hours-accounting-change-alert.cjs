// Accounting alert must be prominent but count only verified cloud audit evidence.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const month='2026-10',html=fs.readFileSync('work-hours/index.html','utf8'),code=fs.readFileSync('assets/port79-overtime-status.js','utf8');
const reason=fs.readFileSync('assets/port79-overtime-reason.js','utf8');
const nodes=Object.fromEntries(['p79OvertimeChangeText','p79ChangeModified','p79ChangeCancelled','p79ChangeHint'].map(id=>[id,{textContent:'',disabled:true}]));
const host={hidden:false,dataset:{},querySelector:selector=>nodes[selector.slice(1)]};
let selectedMonth=month,allow=true,token='session-123';
const document={getElementById:id=>id==='p79OvertimeChangeNotice'?host:
 id==='overtimeMonthFilter'?{value:selectedMonth}:null};
const g={document};vm.runInNewContext(reason,{window:g});
vm.runInNewContext(code,{window:g,document});
const people=Array.from({length:83},(_,i)=>({empId:'E'+i,name:'員工'+i}));
const audits=[
 {empId:'E1',schedule:{__meta:{'2026-10-12':{
  overtimeReport:{id:'MOD',category:'延',reportedAt:'2026-10-10',modifiedAt:'2026-10-24',code:'延16-20'}}}}},
 {empId:'E2',schedule:{__meta:{'2026-10-13':{
  overtimeRevocations:[{confirmed:true,reportId:'DROP',report:{id:'DROP',category:'國'},
   empId:'E2',date:'2026-10-13',actor:'主管A',at:'2026-10-25T08:00:00+08:00',reason:'取消'}]}}}},
 {empId:'E3',schedule:{__meta:{'2026-10-14':{
  overtimeReport:{id:'OLD',category:'國',code:'國08-16'},overtime:true}}}},
 {empId:'E4',schedule:{__meta:{'2026-10-15':{
  overtimeRevocations:[{confirmed:false,reportId:'NOT-YET',report:{id:'NOT-YET'},
   empId:'E4',date:'2026-10-15',actor:'主管A',at:'2026-10-25'}]}}}},
 {empId:'SECRET',schedule:{__meta:{'2026-10-16':{
  overtimeRevocations:[{confirmed:true,reportId:'HIDDEN',report:{id:'HIDDEN'},
   empId:'SECRET',date:'2026-10-16',actor:'主管A',at:'2026-10-25'}]}}}}
];
const summary=g.P79OvertimeStatus.auditSummary(audits,people,month);
assert.equal(summary.modified,1);
assert.equal(summary.cancelled,1);
assert.equal(summary.total,2);
assert.equal(summary.newest.name,'員工2');
g.P79OvertimeStatus.updateBanner(summary,{ready:true});
assert.equal(host.dataset.p79State,'changed');
assert.match(nodes.p79OvertimeChangeText.textContent,/2 筆/);
assert.match(nodes.p79ChangeModified.textContent,/1/);
assert.match(nodes.p79ChangeCancelled.textContent,/1/);
assert.equal(nodes.p79ChangeCancelled.disabled,false);
// Extract the actual page integration instead of writing a duplicate implementation.
const start=html.indexOf('function p79UpdateOvertimeChangeAlert(){');
const end=html.indexOf('function renderOvertimeStats() {',start);
assert(start>0&&end>start);
const context={
 window:{P79OvertimeStatus:g.P79OvertimeStatus},document,
 p79WorkOvertimeMonths:new Map([[month,{ready:true,token,rows:audits}]]),
 currentPort79SsoToken:()=>token,p79CanExportOvertimeApplication:()=>allow,
 p79WorkhoursEligibleEmployees:()=>people
};
const key=Object.keys(context);
const refresh=new Function(...key,html.slice(start,end)+'return p79UpdateOvertimeChangeAlert;')(...key.map(k=>context[k]));
refresh();
assert.equal(host.hidden,false);
assert.match(nodes.p79OvertimeChangeText.textContent,/2 筆/);
allow=false;refresh();assert.equal(host.hidden,true);
allow=true;selectedMonth='ALL';refresh();assert.equal(host.dataset.p79State,'loading');
assert.equal(nodes.p79ChangeModified.disabled,true);
selectedMonth=month;context.p79WorkOvertimeMonths.get(month).ready=false;refresh();
assert.equal(host.dataset.p79State,'loading');
assert(!nodes.p79OvertimeChangeText.textContent.includes('0 筆'),'unverified data must not claim zero');
context.p79WorkOvertimeMonths.get(month).ready=true;
context.p79WorkOvertimeMonths.get(month).rows=[];
refresh();
assert.equal(host.dataset.p79State,'clear');
assert.match(nodes.p79ChangeHint.textContent,/舊資料/);
assert(html.includes("P79OvertimeStatus.open({state:'amended'})"));
assert(html.includes("P79OvertimeStatus.open({state:'revoked'})"));
assert(html.includes('.p79-accounting-change-banner[hidden]{display:none!important}'));
console.log('PASS 83-person visibility; verified modified/cancelled counts, no false warnings, permission gate, month reload and audit-aware no-record state');

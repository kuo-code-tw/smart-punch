/* Regression coverage for HR dashboard and read-only statistics; synthetic records only. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const base='hr/';
function file(name){return fs.readFileSync(base+name,'utf8')}
const html=file('index.html'),dashboard=file('port79-hr-reference-dashboard.js'),
operations=file('port79-hr-operations.js'),bridge=file('port79-hr-live-statistics.js'),
metrics=file('port79-hr-verified-metrics.js'),css=file('port79-hr-reference-dashboard.css');
for(const [name,src]of [['dashboard',dashboard],['operations',operations],['statistics',bridge],['metrics',metrics]])
 new Function(src);
const sandbox={module:{exports:{}},window:undefined};vm.createContext(sandbox);
vm.runInContext(metrics,sandbox);const M=sandbox.module.exports;
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name)}
test('new HR assets and data refresh hook are mounted',()=>{
 for(const asset of ['port79-hr-verified-metrics.js','port79-hr-reference-dashboard.js','port79-hr-live-statistics.js','port79-hr-operations.js'])
  assert(html.includes(asset),asset);
 assert(html.includes('window.p79HrDashRender?.()'));
 assert(css.includes('body.p79r-ready[data-p79-hr-view="payroll"]'));
});
test('all HR menu links and payroll/training views are wired',()=>{
 for(const path of ['../attendance/','../schedule/','../leave/','../work-hours/'])
  assert(dashboard.includes(path),path);
 for(const tab of ['employees','payroll','training'])
  assert(dashboard.includes('data-hr-view="'+tab+'"'),tab);
 assert(operations.includes('window.p79HrDashboardGo=function(view)'));
});
test('date parsing validates ROC calendar and rejects invalid dates',()=>{
 assert.equal(M.date('115/11/11'),'2026-11-11');
 assert.equal(M.date('2026-11-11'),'2026-11-11');
 assert.equal(M.date('2026-02-30'),'');
});
test('current staff excludes inactive, leave and effective resignations',()=>{
 assert.equal(M.isWorking({employmentStatus:'active',terminationDate:'2026-11-01'},'2026-11-11'),false);
 assert.equal(M.isWorking({employmentStatus:'leave'},'2026-11-11'),false);
 assert.equal(M.isWorking({employmentStatus:'resigned'},'2026-11-11'),false);
 assert.equal(M.isWorking({employmentStatus:'active'},'2026-11-11'),true);
 assert.equal(M.isWorking({employmentStatus:'active',startDate:'2026-11-12'},'2026-11-11'),false);
});
test('payroll calculation is opt-in and never inserts official pay rates',()=>{
 const c=M.payDraft({base:45000,allowance:3000,overtime:2500.5,deductions:5500});
 assert.equal(c.ok,true);assert.equal(c.gross,50500.5);assert.equal(c.net,45000.5);
 assert.equal(c.authoritative,false);
 for(const bad of [{base:-1,allowance:0,overtime:0,deductions:0},{base:'abc',allowance:0,overtime:0,deductions:0}])
  assert.equal(M.payDraft(bad).ok,false);
 assert(operations.includes('並且不會儲存在雲端'));
 assert(!operations.includes('localStorage.setItem'));
});
const people=['A01','A02','A03'],leave=[
 {id:'L1',empId:'A02',status:'已核准',startDate:'2026-11-11',endDate:'2026-11-11',leaveType:'特休'},
 {id:'L2',empId:'A03',status:'已退回',startDate:'2026-11-11',endDate:'2026-11-11'},
 {id:'L3',empId:'A01',status:'已核准',startDate:'2026-11-01',endDate:'2026-11-02',revoked:true}
];
test('approved leave counts exclude revoked/pending and fail on ambiguous versions',()=>{
 const good=M.approvedLeaveCount(leave,'2026-11',people);
 assert.equal(good.ready,true);assert.equal(good.count,1);
 assert.equal(M.approvedLeaveCount([...leave,{...leave[0],leaveType:'病假'}],'2026-11',people).ready,false);
});
const schedules=[
 {empId:'A01',schedule:{'2026-11-11':'早',__meta:{'2026-11-11':{overtimeReport:{id:'OT01',declaredHours:2,status:'已申報'}}}}},
 {empId:'A02',schedule:{'2026-11-11':'早',__meta:{'2026-11-11':{overtimeReport:{id:'OT02',declaredHours:5,planned:true}}}}},
 {empId:'A03',schedule:{'2026-11-11':'休',__meta:{'2026-11-11':{overtimeReport:{id:'OT03',declaredHours:1,revoked:true}}}}}
];
test('overtime counts verified non-planned reports without double counting',()=>{
 const res=M.officialOvertime(schedules,'2026-11',people);
 assert.equal(res.ready,true);assert.equal(res.hours,2);assert.equal(res.planned,1);
 const mismatch=[...schedules,{empId:'A01',schedule:{__meta:{'2026-11-11':{overtimeReport:{id:'OT01',declaredHours:6,status:'已申報'}}}}}];
 assert.equal(M.officialOvertime(mismatch,'2026-11',people).ready,false,'conflicting duplicate report must fail closed');
});
test('attendance denominator respects leave and scheduled workday, no name-only match',()=>{
 const rows=[{empId:'A01',type:'上班打卡',timeStr:'2026-11-11 07:56:00'}];
 const r=M.attendanceRate({records:rows,schedules,leaveRecords:leave,employees:people.map(empId=>({empId,employmentStatus:'active'})),day:'2026-11-11'});
 assert.equal(r.ready,true);assert.equal(r.expected,1);assert.equal(r.clocked,1);assert.equal(r.percent,100);
});
test('attendance fail-closed on incomplete schedules and date mismatch',()=>{
 const args={records:[],schedules:schedules.slice(0,1),leaveRecords:[],employees:people.map(empId=>({empId})),day:'2026-11-11'};
 assert.equal(M.attendanceRate(args).ready,false);
 assert.equal(M.attendanceRate({...args,day:'2026-02-30'}).ready,false);
});
test('data bridge authenticates every cloud request and prevents stale results',()=>{
 assert(bridge.includes("url.searchParams.set('token',auth)"));
 assert(bridge.includes("url.searchParams.set('gcToken',auth)"));
 assert(bridge.includes("identity()!==startIdentity"));
 assert(bridge.includes("Promise.allSettled"));
 assert(bridge.includes("access('attendance','records.view')"));
 assert(!bridge.includes('localStorage.setItem'));
});
test('training requires authenticated HR staff and CSV stays user-controlled',()=>{
 assert(operations.includes("if(view==='training')"));
 assert(operations.includes('parseCsv('));
 assert(operations.includes('exportCsv('));
 assert(operations.includes('資料只保留在目前頁面'));
});
test('dashboard, employee table, payroll and training views switch without runtime errors',()=>{
 const nodes={};const mk=(id)=>({id,dataset:{},style:{},hidden:false,innerHTML:'',textContent:'',value:'',
   addEventListener(){},remove(){},querySelector(){return null},querySelectorAll(){return []},
   classList:{add(){},remove(){},toggle(){}}});
 const known=['p79HrShellV103','p79rPayrollForm','p79rPayrollResult','p79rPayrollEmployee',
  'p79rPayrollMonth','p79rPayrollExport','p79rPayrollClear','p79rTrainingForm',
  'p79rTrainingResult','p79rTrainingEmployee','p79rTrainingExport','p79rTrainingImport',
  'p79rTrainingClear','fStatus','p79rWorkDate'];
 known.forEach(id=>{nodes[id]=mk(id)});
 const main=mk('main');
 main.querySelector=()=>null;
 main.insertBefore=element=>{nodes[element.id]=element};
 main.appendChild=element=>{nodes[element.id]=element};
 const doc={readyState:'complete',getElementById:id=>nodes[id]||null,
  createElement:()=>mk(''),querySelector:query=>query==='main.wrap'?main:null,
  querySelectorAll:()=>[],body:{dataset:{},classList:{add(){}}}};
 const ss={getItem(key){
  if(key==='port79_user_session')return JSON.stringify({empId:'ADMIN01',adminRole:'superadmin'});
  if(key==='port79_user_token')return 'test-token';
  return null
 }};
 const window={P79HrVerifiedMetrics:M,scrollTo(){},p79HrCloseMenu(){}};
 const ctx={window,document:doc,location:{hash:''},sessionStorage:ss,employees:[],
  p79HrCloudDataReady:false,alert(){},console,Intl,Date};
 vm.createContext(ctx);
 vm.runInContext(dashboard,ctx);
 vm.runInContext(operations,ctx);
 assert.equal(typeof window.p79HrDashboardGo,'function');
 window.p79HrDashboardGo('payroll');
 assert.equal(doc.body.dataset.p79HrView,'payroll');
 assert.equal(nodes.p79rOppayroll.hidden,false);
 assert(nodes.p79rOppayroll.innerHTML.includes('薪資作業'));
 window.p79HrDashboardGo('training');
 assert.equal(doc.body.dataset.p79HrView,'training');
 assert.equal(nodes.p79rOptraining.hidden,false);
 assert(nodes.p79rOptraining.innerHTML.includes('教育訓練'));
 window.p79HrDashboardGo('employees');
 assert.equal(doc.body.dataset.p79HrView,'employees');
 assert.equal(nodes.p79rOppayroll.hidden,true);
 assert.equal(nodes.p79rOptraining.hidden,true);
});

console.log(JSON.stringify({passed,failed:0,scope:'HR dashboard synthetic fixtures, no cloud writes'}));

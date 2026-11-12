/* Regression tests: only existing HR data and already-available system modules. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const get=n=>fs.readFileSync('hr/'+n,'utf8');
const html=get('index.html'),dashboard=get('port79-hr-reference-dashboard.js'),
  metrics=get('port79-hr-verified-metrics.js'),live=get('port79-hr-live-statistics.js'),
  css=get('port79-hr-reference-dashboard.css');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name)}
function moduleInVm(src){const box={module:{exports:{}},window:undefined};vm.createContext(box);vm.runInContext(src,box);return box.module.exports}
const M=moduleInVm(metrics);
test('all UI/metric files parse and scripts are referenced in HR',()=>{
 for(const x of [dashboard,metrics,live])new Function(x);
 for(const file of ['port79-hr-reference-dashboard.css','port79-hr-reference-dashboard.js','port79-hr-verified-metrics.js','port79-hr-live-statistics.js'])
   assert(html.includes(file),file);
 assert(html.includes('window.p79HrDashRender?.()'));
 assert(css.includes('p79r-kpis'));
});
test('only existing systems shown; payroll/training add-ons absent',()=>{
 assert(!html.includes('port79-hr-operations.js'),'new operations must not load');
 assert(!dashboard.includes('薪資作業'));
 assert(!dashboard.includes('教育訓練'));
 assert(!dashboard.includes('績效管理'),'efficiency must have actual system name');
 for(const path of ['../attendance/','../schedule/','../leave/','../work-hours/','../aqc-efficiency/','../history-data/']){
  assert(dashboard.includes('href="'+path+'"'),path);
  assert(fs.existsSync('hr/'+path+'index.html'),'real target must exist '+path);
 }
 for(const phrase of ['員工資料','考勤管理','排班管理','請假管理','工時／加班','船舶效率','歷史資料']){
  assert(dashboard.includes(phrase),phrase);
 }
});
test('existing human-resources editing, status and permission functions stay intact',()=>{
 for(const identifier of ['function openEditor(', 'function resignCurrent(', 'function restoreCurrent(',
    'function openOrgSettings(', 'function openPermissionOverview(', 'function openSessionLogs(', 'function exportEmployees(']){
  assert(html.includes(identifier),identifier);
 }
 for(const id of ['id="fStatus"','id="addBtn"','id="orgSettingsBtn"','id="p79HrImportToolbar"']){
  assert(html.includes(id),id);
 }
});
test('shared navigation preserves the mounted horizontal HR header',()=>{
 const shared=fs.readFileSync('assets/port79-seven-top.js','utf8');
 const source=shared.slice(shared.indexOf('function p79NormalizeLegacyTop(sys){'),shared.indexOf('\nfunction mount(){',shared.indexOf('function p79NormalizeLegacyTop(sys){')));
 const header={dataset:{p79Layout:'reference'},style:{setProperty(){throw Error('HR header was hidden')}},setAttribute(){throw Error('HR header made inaccessible')}};
 const ctx={META:{hr:['','人資管理']},document:{querySelector:q=>q==='#p79HrShellV103'?header:null,body:{setAttribute(){}},title:''}};
 vm.createContext(ctx);vm.runInContext(source+';p79NormalizeLegacyTop("hr")',ctx);
 assert(css.includes('html body.p79-workspace.p79r-ready{padding:78px 0 0!important'));
 assert(css.includes('#p79WorkspaceTopbar{display:flex!important;left:0!important}'));
 assert(css.includes('#p79WorkspaceStatus{display:block!important}'));
 assert(css.includes('top:var(--p79-hr-toolbar-height)!important'));
});
test('valid local and ROC dates only',()=>{
 assert.equal(M.date('115/11/11'),'2026-11-11');
 assert.equal(M.date('2026-11-11'),'2026-11-11');
 assert.equal(M.date('2026-02-30'),'');
});
test('resigned, leave-of-absence and future hires excluded from actual workforce',()=>{
 assert.equal(M.isWorking({employmentStatus:'resigned'},'2026-11-11'),false);
 assert.equal(M.isWorking({employmentStatus:'leave'},'2026-11-11'),false);
 assert.equal(M.isWorking({employmentStatus:'active',terminationDate:'2026-11-02'},'2026-11-11'),false);
 assert.equal(M.isWorking({employmentStatus:'active',startDate:'2026-11-12'},'2026-11-11'),false);
 assert.equal(M.isWorking({employmentStatus:'active',startDate:'2026-11-10'},'2026-11-11'),true);
});
const people=['A01','A02','A03'];
const leaves=[
 {id:'L1',empId:'A02',status:'已核准',startDate:'2026-11-11',endDate:'2026-11-11',approvedDays:1,leaveType:'特休'},
 {id:'L2',empId:'A03',status:'已退回',startDate:'2026-11-11',endDate:'2026-11-11'},
 {id:'L3',empId:'A01',status:'已核准',startDate:'2026-11-01',endDate:'2026-11-02',revoked:true}
];
const roster=[
 {empId:'A01',schedule:{'2026-11-11':'早',__meta:{'2026-11-11':{overtimeReport:{id:'OT1',declaredHours:2,status:'已申報'}}}}},
 {empId:'A02',schedule:{'2026-11-11':'早',__meta:{'2026-11-11':{overtimeReport:{id:'OT2',declaredHours:5,planned:true}}}}},
 {empId:'A03',schedule:{'2026-11-11':'休',__meta:{'2026-11-11':{overtimeReport:{id:'OT3',declaredHours:1,revoked:true}}}}}
];
test('only approved and non-revoked leave counted',()=>{
 const res=M.approvedLeaveCount(leaves,'2026-11',people);
 assert.equal(res.ready,true);assert.equal(res.count,1);
 assert.equal(M.approvedLeaveCount([...leaves,{...leaves[0],leaveType:'病假'}],'2026-11',people).ready,false);
});
test('existing overtime reports: avoid planned, deleted and conflicting duplicates',()=>{
 const o=M.officialOvertime(roster,'2026-11',people);
 assert.equal(o.ready,true);assert.equal(o.hours,2);assert.equal(o.planned,1);
 const dup=[...roster,{empId:'A01',schedule:{__meta:{'2026-11-11':{overtimeReport:{id:'OT1',declaredHours:6,status:'已申報'}}}}}];
 assert.equal(M.officialOvertime(dup,'2026-11',people).ready,false);
});
test('attendance uses actual employee clock-in, full-day leave and valid roster',()=>{
 const punches=[{empId:'A01',type:'上班打卡',timeStr:'2026-11-11 07:55:00'}];
 const calc=M.attendanceRate({records:punches,schedules:roster,leaveRecords:leaves,
   employees:people.map(empId=>({empId,employmentStatus:'active'})),day:'2026-11-11'});
 assert.equal(calc.ready,true);assert.equal(calc.expected,1);assert.equal(calc.clocked,1);assert.equal(calc.percent,100);
 const half=M.attendanceRate({records:punches,schedules:roster,leaveRecords:[{...leaves[0],approvedDays:0.5}],
   employees:people.map(empId=>({empId,employmentStatus:'active'})),day:'2026-11-11'});
 assert.equal(half.ready,true);assert.equal(half.expected,2);assert.equal(half.percent,50);
});
test('partial official data must not produce false zero or attendance rate',()=>{
 assert.equal(M.attendanceRate({records:[],schedules:roster.slice(0,1),leaveRecords:[],
   employees:people.map(empId=>({empId})),day:'2026-11-11'}).ready,false);
 assert.equal(M.attendanceRate({records:[],schedules:roster,leaveRecords:[{...leaves[0],approvedDays:undefined}],
   employees:people.map(empId=>({empId})),day:'2026-11-11'}).ready,false);
});
test('HR dashboard can toggle existing employee table',()=>{
 const els={};const e=id=>els[id]||(els[id]={value:'',textContent:'',innerHTML:'',dataset:{},
   remove(){},removeAttribute(){},style:{setProperty(){}},addEventListener(){},querySelectorAll(){return []},classList:{add(){},toggle(){}}});
 const main=e('main');main.querySelector=()=>null;main.insertBefore=x=>{els[x.id]=x};
 main.appendChild=x=>{els[x.id]=x};
 const doc={readyState:'complete',getElementById:id=>els[id]||null,
  createElement:()=>({id:'',innerHTML:'',querySelectorAll(){return []}}),
  querySelector:q=>q==='main.wrap'?main:null,querySelectorAll(){return []},
  body:{dataset:{},classList:{add(){}}}};
 e('p79HrShellV103');e('p79rWorkDate');e('fStatus');
 const window={scrollTo(){}};
 const ctx={window,document:doc,location:{hash:''},employees:[],
   p79HrCloudDataReady:false,alert(){},console,Date,Intl};
 vm.createContext(ctx);vm.runInContext(dashboard,ctx);
 assert.equal(doc.body.dataset.p79HrView,'dashboard');
 assert(els.p79HrShellV103.innerHTML.includes('員工資料'));
 window.p79HrDashboardGo('employees');
 assert.equal(doc.body.dataset.p79HrView,'employees');
 window.p79HrDashboardGo('dashboard');
 assert.equal(doc.body.dataset.p79HrView,'dashboard');
});
async function cloud(){
 const elements={};const e=id=>elements[id]||(elements[id]={value:id==='p79rWorkDate'?'2026-11-11':'',textContent:'',style:{},closest:()=>({style:{}})});
 const doc={getElementById:e,addEventListener(){}};
 const persons=[{empId:'A01',employmentStatus:'active'},{empId:'A02',employmentStatus:'active'}];
 const schedule=roster.slice(0,2);
 let account={empId:'ADMIN',adminRole:'superadmin'};
 const storage={getItem(k){
  if(k==='port79_user_session')return JSON.stringify(account);
  if(k==='port79_user_token')return 'TEST';
  if(k==='port79_gas_url')return 'https://script.google.com/macros/s/TEST/exec';
  return null
 }};
 const calls=[],w={P79HrVerifiedMetrics:M,p79HrDashRender(){}};
 const c={window:w,document:doc,sessionStorage:storage,employees:persons,
  p79HrCloudDataReady:true,token:'TEST',Date,Intl,URL,AbortController,setTimeout,clearTimeout,console,
  fetch:async raw=>{
   const url=new URL(raw),action=url.searchParams.get('action');calls.push(action);
   assert.equal(url.searchParams.get('token'),'TEST');
   if(action==='getLeaveData')assert.equal(url.searchParams.has('month'),false,'use the existing full leave ledger contract');
   const data=action==='getLeaveData'?{ok:true,employees:persons,leaveRecords:leaves.slice(0,1)}:
     action==='getScheduleDataSecure'?{ok:true,schedules:schedule}:
     action==='getAttendanceMainDirect'?{ok:true,records:[{empId:'A01',type:'上班打卡',timeStr:'2026-11-11 07:55:00'}]}:
     null;
   assert(data,'unexpected action');
   return{ok:true,text:async()=>JSON.stringify(data)};
  }};
 vm.createContext(c);vm.runInContext(live,c);
 await w.P79HrStatistics.refresh();
 assert.equal(e('p79rAttendance').textContent,'100.0%');
 assert.equal(e('p79rLeaves').textContent,'1');
 assert.equal(e('p79rOvertime').textContent,'2.0 小時');
 assert.equal(calls.length,3);
 let attempts=0;const successfulFetch=c.fetch;
 c.fetch=async raw=>{if(new URL(raw).searchParams.get('action')==='getLeaveData'&&attempts++===0)throw Error('temporary network failure');return successfulFetch(raw)};
 await w.P79HrStatistics.refresh();
 assert.equal(attempts,2,'one bounded read retry after a transient failure');
 assert.equal(e('p79rLeaves').textContent,'1');
 assert.equal(calls.length,6);
 account={empId:'OTHER',adminRole:'admin',systemPermissions:{hr:'view',attendance:'none',leave:'none',schedule:'none',workhours:'none'}};
 await w.P79HrStatistics.refresh();
 assert.equal(calls.length,6,'must not query forbidden module on account switch');
 assert.equal(e('p79rAttendance').textContent,'—');
}
cloud().then(()=>{passed++;console.log('PASS authorized read-only source bridge and permission switching');
 console.log(JSON.stringify({passed,failed:0,scope:'existing HR, leave, attendance, schedule only; no production write'}));
}).catch(err=>{console.error(err);process.exitCode=1});

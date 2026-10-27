const fs=require('fs'),vm=require('vm'),a=require('assert/strict');const c={window:null,Date,Intl,console};c.window=c;vm.createContext(c);for(const f of ['port79-overtime-reason.js','port79-rest-allocation.js','port79-rest-attendance.js','port79-monthly-rest-overtime.js','port79-overtime-status.js'])vm.runInContext(fs.readFileSync('assets/'+f,'utf8'),c);c.p79MonthlyRestContext={employmentStart:()=>''};const api=c.P79OvertimeStatus,month='2026-10',emp={empId:'TEST1',name:'測試',dept:'部門',jobTitle:'ARMG'},roster={__meta:{}},days={};for(let i=1;i<=31;i++){const d=month+'-'+String(i).padStart(2,'0');roster[d]='早';days['TEST1|'+d]={state:'worked'};}const report={id:'R1',category:'休',overtimeStart:'24:00',overtimeEnd:'08:00',declaredHours:8};roster.__meta[month+'-01']={overtimeReport:report};
for(const n of [2,8,9,15,21,22,28,29,30,31]){const d=month+'-'+n;const key=month+'-'+String(n).padStart(2,'0');roster[key]='休';days['TEST1|'+key]={state:'rest'};}
const snapshot={schedules:[{empId:emp.empId,schedule:roster}],attendanceEvidence:{complete:true,month,days}},before=JSON.stringify(snapshot);let result=api.collect(snapshot,[emp],month,c.P79MonthlyRest.balance);a.equal(result.rows.length,1);a.equal(result.rows[0].excessDays,1,'actual rest fills quota before active declaration');a.equal(api.status(result.rows[0]),'review');a.equal(result.rows[0].period,'24:00–08:00');a.equal(JSON.stringify(snapshot),before);
a.throws(()=>api.collect({...snapshot,attendanceEvidence:{complete:false}},[emp],month,c.P79MonthlyRest.balance),/完整核對/);
result=api.collect(snapshot,[emp],month,()=>{throw Error('班表未完整')});a.equal(api.status(result.rows[0]),'unverified');a.equal(api.filter(result.rows,{status:'review'}).length,0);
const audit={confirmed:true,reason:'休假超額',reportId:'R1',empId:emp.empId,date:month+'-01',actor:'TEST',at:'2026-10-22T05:00:00Z',report};roster.__meta[month+'-01']={overtimeExcluded:true,overtimeRevocations:[audit]};result=api.collect(snapshot,[emp],month,c.P79MonthlyRest.balance);a.equal(result.rows.length,1);a.equal(api.status(result.rows[0]),'revoked');a.equal(api.filter(result.rows,{name:'test1',dept:'部門',job:'ARMG',category:'休',status:'revoked'}).length,1);a.equal(result.rows[0].report.id,'R1');
roster.__meta[month+'-01'].overtimeReport={...report,id:'R2'};delete roster.__meta[month+'-01'].overtimeExcluded;result=api.collect(snapshot,[emp],month,c.P79MonthlyRest.balance);a.equal(result.rows.length,2);a.equal(result.rows.filter(r=>api.status(r)==='revoked').length,1,'re-report never inherits old cancellation');
const html=fs.readFileSync('work-hours/index.html','utf8');a(html.includes('每日加班人員統計'));a(html.includes('onclick="P79OvertimeStatus.open()"'));a(html.includes('>申報／異動紀錄</button>'));a(html.includes('overtimeRevocationVersion!==1'));a(html.includes("reason:'rest_quota_excess'"));a(html.includes('expectedReportId:row.id'));a(html.includes('P79OvertimeStatus.fetch'));a(html.includes("snapshot(month,true,true)"));a.equal(api.filter(result.rows,{employee:'TEST1'}).length,2,'employee picker matches the exact employee ID');
a.equal(api.filter(result.rows,{employee:'TEST2'}).length,0,'employee picker never matches another employee');
const statusUi=fs.readFileSync('assets/port79-overtime-status.js','utf8');
a(statusUi.includes("new Intl.Collator('zh-Hant-u-co-stroke'"),'all name options must use Traditional Chinese stroke order');
a.equal((statusUi.match(/id="osEmployee"/g)||[]).length,1,'there must be exactly one employee selector');
a(!statusUi.includes('id="osName"'),'redundant employee search must be removed');
const markupStart=statusUi.indexOf('<div class="os-filters">');
const markupEnd=statusUi.indexOf('</div><div class="os-tabs">',markupStart);
a(markupStart>=0&&markupEnd>markupStart,'filter bar markup exists');
const filterMarkup=statusUi.slice(markupStart,markupEnd);
const fieldOrder=['osMonth','osDept','osJob','osEmployee','osCat','osState','osLoad','osAccountingExport'];
const positions=fieldOrder.map(field=>filterMarkup.indexOf('id="'+field+'"'));
a(positions.every(n=>n>=0)&&positions.every((n,i)=>!i||n>positions[i-1]),'one row follows month, department, job, employee, leave type, status and buttons');
a(statusUi.includes('display:grid;grid-template-columns:'),'all 8 controls share a desktop row');
a(statusUi.includes('1880px'),'dialog uses a larger desktop width');
a(statusUi.includes('overflow-x:auto'),'small screens scroll controls rather than overlapping');
a(html.includes('port79-overtime-status.js?v=20261027-dept-job-name-onefield-v3'),'updated filter code must bypass browser cache');
a(statusUi.includes("q('#osDept').onchange=()=>{options('dept')"),'department selection updates job and employee menus');
a(statusUi.includes("q('#osJob').onchange=()=>{options('job')"),'job selection updates employee menu');
a(statusUi.includes("q('#osEmployee').onchange=employeeChanged"),'name selection filters rows');
a(statusUi.includes("const query=()=>({employee:uid(q('#osEmployee').value)"),'filter reads actual selected employee, not stale state');
const staff=[
 {empId:'E30',name:'蔡欣穎',dept:'第二事業處',jobTitle:'ARMG'},
 {empId:'E20',name:'陳小明',dept:'第二事業處',jobTitle:'F/L'},
 {empId:'E05',name:'王榮章',dept:'第一事業處',jobTitle:'ARMG'},
 {empId:'E10',name:'宋文豪',dept:'第二事業處',jobTitle:'ARMG'},
 {empId:'E01',name:'王榮章',dept:'第二事業處',jobTitle:'ARMG'},
 {empId:'E25',name:'單建誠',dept:'第一事業處',jobTitle:'F/L'}
];
const sorted=api.sortEmployeesByStroke(staff);
a.deepEqual(Array.from(sorted,x=>x.empId),['E01','E05','E10','E20','E25','E30'],'names use stroke count with employee-ID tie-break');
a.deepEqual(Array.from(api.employeeFilterOptions(staff).departments),['第一事業處','第二事業處'],'departments use stroke sort');
a.deepEqual(Array.from(api.employeeFilterOptions(staff,'第二事業處').jobs),['ARMG','F/L'],'job options are limited to selected department');
a.deepEqual(Array.from(api.employeeFilterOptions(staff,'第二事業處','ARMG').employees,x=>x.empId),['E01','E10','E30'],'selected department and job narrow names, maintaining stroke order');
a.deepEqual(Array.from(api.employeeFilterOptions(sorted,'第一事業處','ARMG').employees,x=>x.empId),['E05'],'normalizing already sorted staff keeps its job');
const sample=[
 {id:'R1',empId:'E01',name:'王榮章',category:'休',dept:'第二事業處',job:'ARMG',revocation:audit},
 {id:'R1',empId:'E10',name:'宋文豪',category:'休',dept:'第二事業處',job:'ARMG',revocation:audit},
 {id:'R1',empId:'E30',name:'蔡欣穎',category:'國',dept:'第二事業處',job:'ARMG',revocation:audit}
];
a.deepEqual(Array.from(api.filter(sample,{employee:'E10',category:'休',dept:'第二事業處',job:'ARMG',status:'revoked'}),x=>x.empId),['E10'],'choosing a person never returns records of other employees');
a.equal(api.filter(sample,{employee:'E10',dept:'第一事業處'}).length,0,'incompatible department must not return all employees');
a.equal(api.filter(sample,{employee:''}).length,3,'all names includes all eligible employees');
console.log('PASS live status uses shared quota/rest evidence including cross-day periods, actual rest priority, incomplete-data blocking, saved archive and new-report isolation, combined filters and capability-gated integration');

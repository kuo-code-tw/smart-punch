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
a(statusUi.includes("new Intl.Collator('zh-Hant-u-co-stroke'"),'employee picker must sort names by Traditional Chinese stroke count');
a(statusUi.includes('<label>姓名（筆畫）<select id="osEmployee"'),'employee picker must be clickable');
a(statusUi.includes("q('#osEmployee').onchange=employeeChanged"),'employee selection must trigger filtering');
a(statusUi.includes("q('#osEmployee').oninput=employeeChanged"),'employee selection must work with mouse and keyboard');
a(statusUi.includes('employee:selectedEmployee'),'selected employee remains active when other filters are changed');
a(!statusUi.includes("q('#osName').value='';selected.clear();paint();"),'selecting employee must not clear search');
a(!statusUi.includes("q('#osEmployee').value='';selected.clear();paint();"),'typing search must not silently reset the employee dropdown');
a(statusUi.includes('display:grid;grid-template-columns:'),'all filter controls must stay in one row');
a(statusUi.includes('1880px'),'dialog must be wider for desktop');
a(html.includes('port79-overtime-status.js?v=20261027-stroke-filter-one-row-v2'),'browser must load updated script');
const sorted=api.sortEmployeesByStroke([
 {empId:'E30',name:'蔡欣穎'}, {empId:'E20',name:'陳小明'},
 {empId:'E05',name:'王榮章'}, {empId:'E10',name:'宋文豪'},
 {empId:'E01',name:'王榮章'}, {empId:'E25',name:'單建誠'}]);
a.deepEqual(Array.from(sorted,x=>x.empId),['E01','E05','E10','E20','E25','E30'],'names use Chinese stroke count with stable employee-ID tie-break');
const sample=[
 {id:'R1',empId:'E01',name:'王榮章',category:'休',dept:'A',job:'ARMG',revocation:audit},
 {id:'R1',empId:'E10',name:'宋文豪',category:'休',dept:'A',job:'ARMG',revocation:audit},
 {id:'R1',empId:'E30',name:'蔡欣穎',category:'國',dept:'B',job:'F/L',revocation:audit}
];
a.deepEqual(Array.from(api.filter(sample,{employee:'E10'}),x=>x.name),['宋文豪'],'selecting a name must return only that employee, not all');
a.deepEqual(Array.from(api.filter(sample,{employee:'E10',name:'宋',category:'休',dept:'A',job:'ARMG',status:'revoked'}),x=>x.empId),['E10'],'name selection must combine with other filters');
a.equal(api.filter(sample,{employee:'E10',name:'王'}).length,0,'conflicting search must show zero, not reset to all');
a.equal(api.filter(sample,{employee:''}).length,3,'all names returns the full eligible set');
console.log('PASS live status uses shared quota/rest evidence including cross-day periods, actual rest priority, incomplete-data blocking, saved archive and new-report isolation, combined filters and capability-gated integration');

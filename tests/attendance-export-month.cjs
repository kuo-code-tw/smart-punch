const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8');
function fn(name){let a=html.indexOf('function '+name+'(');assert(a>=0,name);if(html.slice(a-6,a)==='async ')a-=6;return html.slice(a,html.indexOf('\n        }',a)+10);}
const elements={exportAttendanceMonth:{value:'2026-10'},exportCompanyFilter:{value:'ALL'},filterMonthSelect:{value:'2026-09'},p79AttendanceExportProgress:{textContent:''},exportRecordsModal:{querySelector:()=>null,classList:{remove(){},add(){}}}};
const fields=[{checked:true,value:'time',getAttribute:()=> '打卡時間'},{checked:true,value:'empId',getAttribute:()=> '工號'}];
const rows=[{empId:'AP1',timeStr:'2026/09/30 23:50'},{empId:'AP1',timeStr:'2026/10/01 00:10'},{empId:'AN2',timeStr:'115/10/12 07:30'},{empId:'AN2',timeStr:'2026/11/01 00:00'},{empId:'HIDDEN',timeStr:'2026/10/12 07:31'}];
let saved,toasts=[];
const c={console,p79LoadXlsxLibrary:async()=>true,getActiveGasUrl:()=> 'https://test.invalid/',p79ReadAttendanceExportMonth:async()=>rows,p79AuditAttendanceExportPairs:()=>[],records:rows,employees:[],document:{getElementById:id=>elements[id],querySelectorAll:()=>fields},requireAdminAction:()=>true,canCurrentAdminViewDataRow:r=>r.empId!=='HIDDEN',getTodayAttendanceIso:()=> '2026-10-12',updateExportFieldCount(){},normalizeAttendanceStatsAttNo:v=>String(v),ensureExcelLibrary:()=>true,findEmployeeForAttendanceIdentity:()=>null,getAttendanceIdentityEmployeePool:()=>[],formatDateTime:v=>v,formatAttendanceLocationDisplay:v=>v,sysConfig:{companyName:'測試'},defaultConfig:{},showToast:(...x)=>toasts.push(x),XLSX:{utils:{aoa_to_sheet:rows=>({rows}),book_new:()=>({}),book_append_sheet:(w,s)=>w.sheet=s},writeFile:(w,name)=>saved={w,name}}};
c.window=c;vm.createContext(c);for(const name of ['getAttendanceDateKey','p79AttendanceExportMatchesMonth','openExportRecordsModal','closeExportRecordsModal','exportSelectedRecordsExcel'])vm.runInContext(fn(name),c);
(async()=>{
await c.exportSelectedRecordsExcel();assert.equal(saved.w.sheet.rows.length,3);assert(saved.name.includes('2026-10'));assert.deepEqual(Array.from(saved.w.sheet.rows.slice(1),r=>r[1]),['AP1','AN2']);
elements.exportCompanyFilter.value='AP';await c.exportSelectedRecordsExcel();assert.equal(saved.w.sheet.rows.length,2);
elements.exportAttendanceMonth.value='2026-09';elements.exportCompanyFilter.value='ALL';await c.exportSelectedRecordsExcel();assert.equal(saved.w.sheet.rows.length,2);assert.equal(saved.w.sheet.rows[1][0],'2026/09/30 23:50');
saved=null;elements.exportAttendanceMonth.value='';await c.exportSelectedRecordsExcel();assert.equal(saved,null);
elements.exportAttendanceMonth.value='2026-12';await c.exportSelectedRecordsExcel();assert.equal(saved,null);assert(toasts.at(-1)[0].includes('2026-12'));
c.openExportRecordsModal();assert.equal(elements.exportAttendanceMonth.value,'2026-09');elements.filterMonthSelect.value='ALL';c.openExportRecordsModal();assert.equal(elements.exportAttendanceMonth.value,'2026-10');
// Export reads exactly one authoritative endpoint with a bounded single attempt.
const reads=[],reader={Date,URL,encodeURIComponent,getActiveGasUrl:()=> 'https://test.invalid/',getAttendanceEmployeeMasterToken:()=> 'test',normalizeAttendanceRecordIdentifiers:r=>r,fetchGasJsonWithRetry:async(url,label,attempts,timeout)=>{const u=new URL(url);reads.push({action:u.searchParams.get('action'),attempts,timeout});return {ok:true,month:u.searchParams.get('month'),records:[]};}};
vm.createContext(reader);for(const name of ['p79ReadAttendanceExportSource','p79ReadAttendanceExportMonth'])vm.runInContext(fn(name),reader);
const today=new Date(),current=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');await reader.p79ReadAttendanceExportMonth(current);assert.equal(reads.length,1);assert.equal(reads[0].action,'getAttendanceMainDirect');assert.equal(reads[0].attempts,1);assert.equal(reads[0].timeout,20000);
reader.fetchGasJsonWithRetry=async()=>({ok:true,month:current,records:[{name:'測試',timeStr:current.replace('-','/')+'/01'}]});await assert.rejects(reader.p79ReadAttendanceExportMonth(current),/缺少時分/);reader.fetchGasJsonWithRetry=async()=>({ok:true,month:current,records:[{timeStr:current.replace('-','/')+'/01 00:00'}]});assert.equal((await reader.p79ReadAttendanceExportMonth(current)).length,1,'real midnight is retained');reader.fetchGasJsonWithRetry=async(url,label,attempts,timeout)=>{const u=new URL(url);reads.push({action:u.searchParams.get('action'),attempts,timeout});return {ok:true,month:u.searchParams.get('month'),records:[]};};
await reader.p79ReadAttendanceExportMonth('2020-09');assert.equal(reads[1].action,'getAttendanceMonthData');reader.fetchGasJsonWithRetry=async()=>({ok:false,error:'offline'});await assert.rejects(reader.p79ReadAttendanceExportMonth(current),/offline/);
// Optional combined export produces one workbook with three authorized sheets.
elements.exportIncludeSchedule={checked:true};elements.exportAttendanceMonth.value='2026-10';elements.exportCompanyFilter.value='AP';
const people=[{empId:'AP1',attNo:'1',name:'甲'},{empId:'AN2',attNo:'2',name:'乙'}];
c.getAdminAttendanceEmployees=()=>people;c.p79RequireScheduleExport=()=>true;
c.p79ReadAttendanceExportSource=async()=>({schedules:[{empId:'AP1',month:'2026-10',schedule:{'2026-10-01':'晚','2026-10-02':'休'}}]});
c.buildDailyAttendanceRows=()=>[{empId:'AP1',dateKey:'2026-10-01',clockIn:{timeStr:'2026/10/01 23:30'},clockOut:{timeStr:'2026/10/02 07:30'}}];
c.findEmployeeForAttendanceIdentity=(r,pool)=>pool.find(p=>p.empId===r.empId)||null;c.normalizeScheduleDateKey=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)?v:'';c.p79EmployeeDateEligible=()=>true;c.attendanceRowAttendanceText=()=> '8';
for(const name of ['p79AttendanceLeaveReportCode','p79AttendanceExportScheduleLabel','p79BuildScheduleAttendanceExport'])vm.runInContext(fn(name),c);
c.XLSX.utils.book_new=()=>({sheets:[]});c.XLSX.utils.book_append_sheet=(w,s,name)=>w.sheets.push({s,name});
await c.exportSelectedRecordsExcel();assert.deepEqual(saved.w.sheets.map(s=>s.name),['考勤紀錄','2026-10月排班表','排班與每日考勤']);assert.equal(saved.w.sheets[1].s.rows.length,2);assert.equal(saved.w.sheets[1].s.rows[1][5],'晚');assert.equal(saved.w.sheets[2].s.rows[1][8],'2026/10/02 07:30');assert.equal(saved.w.sheets[2].s.rows[1][9],'8');assert(!JSON.stringify(saved.w).includes('AN2'));
const mixed={leaveRecords:[{empId:'AP1',status:'已核准',leaveType:'特休假',startDate:'2026-10-03',endDate:'2026-10-03'}],schedules:[{empId:'AP1',month:'2026-10',role:'AQC',schedule:{'2026-10-01':'休','2026-10-02':'早','2026-10-03':'早','__meta':{'2026-10-01':{restCategory:'例'},'2026-10-02':{overtimeReport:{code:'代16-20'}}}}},{empId:'AP1',month:'2026-11',schedule:{'2026-10-01':'晚'}}]};
const checked=c.p79BuildScheduleAttendanceExport('2026-10',[people[0]],[],mixed);assert.deepEqual(Array.from(checked.scheduleRows[1].slice(5,8)),['例','代16-20','年']);assert.equal(checked.scheduleRows[1][4],'AQC');
assert.throws(()=>c.p79BuildScheduleAttendanceExport('2026-10',[people[0]],[],{schedules:[...mixed.schedules,{empId:'AP1',month:'2026-10',schedule:{'2026-10-01':'早'}}]}),/不同版本/);
reader.fetchGasJsonWithRetry=async()=>({ok:true,month:'2026-11',schedules:mixed.schedules});await assert.rejects(reader.p79ReadAttendanceExportSource('getScheduleDataSecure','2026-10'),/其他月份/);
saved=null;c.p79ReadAttendanceExportSource=async()=>{throw Error('排班讀取失敗')};await c.exportSelectedRecordsExcel();assert.equal(saved,null,'no partially populated workbook on schedule failure');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
console.log('PASS: generated Excel excludes other months; ROC dates, company and permission filters, empty/invalid months, default selection and script syntax');

})().catch(error=>{console.error(error);process.exitCode=1});

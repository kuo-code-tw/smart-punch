const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8');
function fn(name){let a=html.indexOf('function '+name+'(');assert(a>=0,name);if(html.slice(a-6,a)==='async ')a-=6;return html.slice(a,html.indexOf('\n        }',a)+10);}
const elements={exportAttendanceStart:{value:'2026-10-01'},exportAttendanceEnd:{value:'2026-10-31'},exportAttendanceMonth:{value:'2026-10'},exportCompanyFilter:{value:'ALL'},filterMonthSelect:{value:'2026-09'},p79AttendanceExportProgress:{textContent:''},exportRecordsModal:{querySelector:()=>null,classList:{remove(){},add(){}}}};
const fields=[{checked:true,value:'time',getAttribute:()=> '打卡時間'},{checked:true,value:'empId',getAttribute:()=> '工號'}];
const rows=[{empId:'AP1',timeStr:'2026/09/30 23:50'},{empId:'AP1',timeStr:'2026/10/01 00:10'},{empId:'AN2',timeStr:'115/10/12 07:30'},{empId:'AN2',timeStr:'2026/11/01 00:00'},{empId:'HIDDEN',timeStr:'2026/10/12 07:31'}];
let saved,toasts=[];
const c={console,p79LoadXlsxLibrary:async()=>true,getActiveGasUrl:()=> 'https://test.invalid/',p79ReadAttendanceExportMonth:async()=>rows,p79ReadAttendanceExportScope:async month=>({records:rows.filter(r=>c.p79AttendanceExportMatchesMonth(r,month)),source:rows}),p79AuditAttendanceExportPairs:()=>[],records:rows,employees:[],document:{getElementById:id=>elements[id],querySelectorAll:()=>fields},requireAdminAction:()=>true,canCurrentAdminViewDataRow:r=>r.empId!=='HIDDEN',getTodayAttendanceIso:()=> '2026-10-12',updateExportFieldCount(){},normalizeAttendanceStatsAttNo:v=>String(v),ensureExcelLibrary:()=>true,findEmployeeForAttendanceIdentity:()=>null,getAttendanceIdentityEmployeePool:()=>[],formatDateTime:v=>v,formatAttendanceLocationDisplay:v=>v,sysConfig:{companyName:'測試'},defaultConfig:{},showToast:(...x)=>toasts.push(x),XLSX:{utils:{aoa_to_sheet:rows=>({rows}),book_new:()=>({}),book_append_sheet:(w,s)=>w.sheet=s},writeFile:(w,name)=>saved={w,name}}};
c.window=c;vm.createContext(c);for(const name of ['getAttendanceDateKey','p79AttendanceExportMatchesMonth','p79ResetExportDateRange','openExportRecordsModal','closeExportRecordsModal','exportSelectedRecordsExcel'])vm.runInContext(fn(name),c);
c.p79SelectAttendanceExportShifts=(source,month,start,end)=>source.filter(r=>{const day=c.getAttendanceDateKey(r.timeStr).replaceAll('/','-');return day.slice(0,7)===month&&day>=start&&day<=end;});
(async()=>{
c.p79ResetExportDateRange();await c.exportSelectedRecordsExcel();assert.equal(saved.w.sheet.rows.length,3);assert(saved.name.includes('2026-10'));assert.deepEqual(Array.from(saved.w.sheet.rows.slice(1),r=>r[1]),['AP1','AN2']);
elements.exportCompanyFilter.value='AP';c.p79ResetExportDateRange();await c.exportSelectedRecordsExcel();assert.equal(saved.w.sheet.rows.length,2);
elements.exportAttendanceMonth.value='2026-09';elements.exportCompanyFilter.value='ALL';c.p79ResetExportDateRange();await c.exportSelectedRecordsExcel();assert.equal(saved.w.sheet.rows.length,2);assert.equal(saved.w.sheet.rows[1][0],'2026/09/30 23:50');
saved=null;elements.exportAttendanceMonth.value='';c.p79ResetExportDateRange();await c.exportSelectedRecordsExcel();assert.equal(saved,null);
elements.exportAttendanceMonth.value='2026-12';c.p79ResetExportDateRange();await c.exportSelectedRecordsExcel();assert.equal(saved,null);assert(toasts.at(-1)[0].includes('2026-12'));
c.openExportRecordsModal();assert.equal(elements.exportAttendanceMonth.value,'2026-09');elements.filterMonthSelect.value='ALL';c.openExportRecordsModal();assert.equal(elements.exportAttendanceMonth.value,'2026-10');
// Export reads exactly one authoritative endpoint with a bounded single attempt.
const reads=[],reader={Date,URL,encodeURIComponent,getActiveGasUrl:()=> 'https://test.invalid/',getAttendanceEmployeeMasterToken:()=> 'test',normalizeAttendanceRecordIdentifiers:r=>r,fetchGasJsonWithRetry:async(url,label,attempts,timeout)=>{const u=new URL(url);reads.push({action:u.searchParams.get('action'),attempts,timeout});return {ok:true,month:u.searchParams.get('month'),records:[]};}};
vm.createContext(reader);for(const name of ['p79ReadAttendanceExportSource','p79ReadAttendanceExportMonth'])vm.runInContext(fn(name),reader);
const today=new Date(),current=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');await reader.p79ReadAttendanceExportMonth(current);assert.equal(reads.length,1);assert.equal(reads[0].action,'getAttendanceMonthRaw');assert.equal(reads[0].attempts,1);assert.equal(reads[0].timeout,60000);
reader.fetchGasJsonWithRetry=async()=>({ok:true,month:current,records:[{name:'測試',timeStr:current.replace('-','/')+'/01'}]});await assert.rejects(reader.p79ReadAttendanceExportMonth(current),/缺少時分/);reader.fetchGasJsonWithRetry=async()=>({ok:true,month:current,records:[{timeStr:current.replace('-','/')+'/01 00:00'}]});assert.equal((await reader.p79ReadAttendanceExportMonth(current)).length,1,'real midnight is retained');reader.fetchGasJsonWithRetry=async(url,label,attempts,timeout)=>{const u=new URL(url);reads.push({action:u.searchParams.get('action'),attempts,timeout});return {ok:true,month:u.searchParams.get('month'),records:[]};};
await reader.p79ReadAttendanceExportMonth('2020-09');assert.equal(reads[1].action,'getAttendanceMonthRaw');reader.fetchGasJsonWithRetry=async()=>({ok:false,error:'offline'});await assert.rejects(reader.p79ReadAttendanceExportMonth(current),/offline/);
reader.fetchGasJsonWithRetry=async()=>{const e=Error('signal is aborted without reason');e.name='AbortError';throw e;};await assert.rejects(reader.p79ReadAttendanceExportMonth(current),/60 秒.*尚未產生檔案/);
// Optional combined export uses the SAME columns and month-wide row layout as the schedule system.
elements.exportIncludeSchedule={checked:true};elements.exportAttendanceMonth.value='2026-10';elements.exportCompanyFilter.value='AP';
const people=[{empId:'AP1',attNo:'1',name:'甲',jobTitle:'ARMG',group:'A組'},
 {empId:'AN2',attNo:'2',name:'乙',jobTitle:'F/L'}];
c.getAdminAttendanceEmployees=()=>people;c.p79RequireScheduleExport=()=>true;
c.p79ReadAttendanceExportSource=async()=>({schedules:[{empId:'AP1',month:'2026-10',role:'ARMG',
 schedule:{'2026-10-01':'晚','2026-10-02':'休',__personnel:{role:'ARMG',group:'A組',lockType:'FIXED_LOCKED'},
 __meta:{'2026-10-02':{restCategory:'例'}}}}],leaveRecords:[]});
c.buildDailyAttendanceRows=()=>[{empId:'AP1',dateKey:'2026-10-01',
 clockIn:{timeStr:'2026/10/01 23:30'},clockOut:{timeStr:'2026/10/02 07:30'}}];
c.findEmployeeForAttendanceIdentity=(r,pool)=>pool.find(p=>p.empId===r.empId)||null;
c.normalizeScheduleDateKey=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)?v:'';
c.p79EmployeeDateEligible=()=>true;c.getAttendanceTimestamp=r=>r?.timeStr?Date.parse(r.timeStr.replaceAll('/','-').replace(' ','T')+'+08:00'):NaN;
c.XLSX.utils.book_new=()=>({sheets:[]});
c.XLSX.utils.book_append_sheet=(w,s,name)=>w.sheets.push({s,name});
for(const name of ['p79AttendanceLeaveReportCode','p79AttendanceExportScheduleLabel','p79BuildScheduleAttendanceExport'])vm.runInContext(fn(name),c);
c.p79ResetExportDateRange();await c.exportSelectedRecordsExcel();
assert.deepEqual(saved.w.sheets.map(s=>s.name),['考勤紀錄','2026-10職稱班表'],'only authoritative roster, no redundant daily sheet');
assert.equal(saved.w.sheets[1].s.rows.length,2);
assert.deepEqual(Array.from(saved.w.sheets[1].s.rows[0].slice(0,8)),['工號','姓名','職稱','組別','排班屬性','1','2','3']);
assert.deepEqual(Array.from(saved.w.sheets[1].s.rows[1].slice(0,7)),['AP1','甲','ARMG','A組','固定鎖定','晚','例']);
assert.equal(saved.w.sheets[1].s.rows[0].length,36,'complete 31-day schedule uses same day 1..31 layout');
assert(!JSON.stringify(saved.w).includes('AN2'),'company scope applies to schedule');
// Filtering attendance dates must not silently truncate the official month roster.
elements.exportAttendanceStart.value='2026-10-02';elements.exportAttendanceEnd.value='2026-10-02';
await c.exportSelectedRecordsExcel();
assert.equal(saved.w.sheets[1].s.rows[0].length,36);
assert.equal(saved.w.sheets[1].s.rows[0][5],'1');
assert(!saved.w.sheets.some(item=>item.name==='排班與每日考勤'));
saved=null;elements.exportAttendanceStart.value='2026-10-03';
await c.exportSelectedRecordsExcel();assert.equal(saved,null);assert(toasts.at(-1)[0].includes('結束日期'));
c.p79ResetExportDateRange();
// Real shift selector keeps next-month clock-out with its selected work date.
const selector={window:{P79AttendanceV6:{buildShifts:()=>[
 {accountingDateKey:'2026/10/31',clockIn:{id:'in'},clockOut:{id:'out',timeStr:'2026/11/01 07:00'}},
 {accountingDateKey:'2026/09/30',clockIn:{id:'old'}}
]}}};
vm.createContext(selector);vm.runInContext(fn('p79SelectAttendanceExportShifts'),selector);
assert.deepEqual(Array.from(selector.p79SelectAttendanceExportShifts([], '2026-10','2026-10-31','2026-10-31'),r=>r.id),['in','out']);
const mixed={leaveRecords:[{empId:'AP1',status:'已核准',leaveType:'特休假',startDate:'2026-10-03',endDate:'2026-10-03'}],
 schedules:[{empId:'AP1',month:'2026-10',role:'AQC',schedule:{'2026-10-01':'休','2026-10-02':'早','2026-10-03':'早',
 __meta:{'2026-10-01':{restCategory:'例'},'2026-10-02':{overtimeReport:{id:'OT1',code:'代16-20'}}}}}]};
const checked=c.p79BuildScheduleAttendanceExport('2026-10',[people[0]],[],mixed);
assert.deepEqual(Array.from(checked.scheduleRows[1].slice(5,8)),['例','代16-20','年']);
assert.equal(checked.scheduleRows[1][2],'AQC');
// The same shared 例／休／國 allocation used by the schedule system is applied
// only to an export copy, without modifying the official cloud schedule.
let allocationCalls=0;
c.p79EmploymentStartDate=()=> '';
c.p79AllocateRestMonth=(schedule,metadata,exportMonth)=>{
 allocationCalls++;assert.equal(exportMonth,'2026-10');
 return {meta:{...metadata,'2026-10-01':{restCategory:'國'}}};
};
const before=JSON.stringify(mixed);
const allocated=c.p79BuildScheduleAttendanceExport('2026-10',[people[0]],[],mixed);
assert.equal(allocated.scheduleRows[1][5],'國');
assert.equal(allocationCalls,1,'shared schedule allocator invoked once per staff');
assert.equal(JSON.stringify(mixed),before,'export allocation does not modify official roster');
delete c.p79AllocateRestMonth;
assert.throws(()=>c.p79BuildScheduleAttendanceExport('2026-10',[people[0]],[],
 {schedules:[...mixed.schedules,{empId:'AP1',month:'2026-10',schedule:{'2026-10-01':'早'}}]}),/不同版本/);
reader.fetchGasJsonWithRetry=async()=>({ok:true,month:'2026-11',schedules:mixed.schedules});
await assert.rejects(reader.p79ReadAttendanceExportSource('getScheduleDataSecure','2026-10'),/其他月份/);
// Cached exports label their source and Taipei timestamp in the actual workbook.
elements.exportIncludeSchedule.checked=false;
c.p79ReadAttendanceExportScope=async(month,options)=>{options.sources.push({action:'getAttendanceMonthRaw',month,source:'本機快取',savedAt:Date.parse('2026-10-24T08:00:00Z')});return{source:rows};};
c.p79ResetExportDateRange();await c.exportSelectedRecordsExcel();assert.equal(saved.w.sheets.at(-1).name,'資料來源與快取時間');assert.equal(saved.w.sheets.at(-1).s.rows[1][2],'本機快取');assert(saved.w.sheets.at(-1).s.rows[1][3].includes('16:00:00'));
elements.exportIncludeSchedule.checked=true;
saved=null;c.p79ReadAttendanceExportSource=async()=>{throw Error('排班讀取失敗')};c.p79ResetExportDateRange();await c.exportSelectedRecordsExcel();assert.equal(saved,null,'no partially populated workbook on schedule failure');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
console.log('PASS: generated Excel excludes other months; ROC dates, company and permission filters, empty/invalid months, default selection and script syntax');

})().catch(error=>{console.error(error);process.exitCode=1});

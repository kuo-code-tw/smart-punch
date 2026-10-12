const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8');
function fn(name){const a=html.indexOf('        function '+name+'(');assert(a>=0,name);return html.slice(a,html.indexOf('\n        }',a)+10);}
const elements={exportAttendanceMonth:{value:'2026-10'},exportCompanyFilter:{value:'ALL'},filterMonthSelect:{value:'2026-09'},exportRecordsModal:{classList:{remove(){},add(){}}}};
const fields=[{checked:true,value:'time',getAttribute:()=> '打卡時間'},{checked:true,value:'empId',getAttribute:()=> '工號'}];
const rows=[{empId:'AP1',timeStr:'2026/09/30 23:50'},{empId:'AP1',timeStr:'2026/10/01 00:10'},{empId:'AN2',timeStr:'115/10/12 07:30'},{empId:'AN2',timeStr:'2026/11/01 00:00'},{empId:'HIDDEN',timeStr:'2026/10/12 07:31'}];
let saved,toasts=[];
const c={records:rows,employees:[],document:{getElementById:id=>elements[id],querySelectorAll:()=>fields},requireAdminAction:()=>true,canCurrentAdminViewDataRow:r=>r.empId!=='HIDDEN',getTodayAttendanceIso:()=> '2026-10-12',updateExportFieldCount(){},normalizeAttendanceStatsAttNo:v=>String(v),ensureExcelLibrary:()=>true,findEmployeeForAttendanceIdentity:()=>null,getAttendanceIdentityEmployeePool:()=>[],formatDateTime:v=>v,formatAttendanceLocationDisplay:v=>v,sysConfig:{companyName:'測試'},defaultConfig:{},showToast:(...x)=>toasts.push(x),XLSX:{utils:{aoa_to_sheet:rows=>({rows}),book_new:()=>({}),book_append_sheet:(w,s)=>w.sheet=s},writeFile:(w,name)=>saved={w,name}}};
vm.createContext(c);for(const name of ['getAttendanceDateKey','p79AttendanceExportMatchesMonth','openExportRecordsModal','closeExportRecordsModal','exportSelectedRecordsExcel'])vm.runInContext(fn(name),c);
c.exportSelectedRecordsExcel();assert.equal(saved.w.sheet.rows.length,3);assert(saved.name.includes('2026-10'));assert.deepEqual(Array.from(saved.w.sheet.rows.slice(1),r=>r[1]),['AP1','AN2']);
elements.exportCompanyFilter.value='AP';c.exportSelectedRecordsExcel();assert.equal(saved.w.sheet.rows.length,2);
elements.exportAttendanceMonth.value='2026-09';elements.exportCompanyFilter.value='ALL';c.exportSelectedRecordsExcel();assert.equal(saved.w.sheet.rows.length,2);assert.equal(saved.w.sheet.rows[1][0],'2026/09/30 23:50');
saved=null;elements.exportAttendanceMonth.value='';c.exportSelectedRecordsExcel();assert.equal(saved,null);
elements.exportAttendanceMonth.value='2026-12';c.exportSelectedRecordsExcel();assert.equal(saved,null);assert(toasts.at(-1)[0].includes('2026-12'));
c.openExportRecordsModal();assert.equal(elements.exportAttendanceMonth.value,'2026-09');elements.filterMonthSelect.value='ALL';c.openExportRecordsModal();assert.equal(elements.exportAttendanceMonth.value,'2026-10');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
console.log('PASS: generated Excel excludes other months; ROC dates, company and permission filters, empty/invalid months, default selection and script syntax');

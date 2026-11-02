'use strict';
const fs=require('node:fs'),vm=require('node:vm'),a=require('node:assert/strict');
const engine=require('../attendance/v6-engine.js');
const work=fs.readFileSync('work-hours/index.html','utf8');
const attendance=fs.readFileSync('attendance/index.html','utf8');
function extract(html,name) {
 const at=html.indexOf('        function '+name+'(');
 a(at>=0,name+' exists');
 const end=html.indexOf('\n        }',at);
 a(end>at,name+' ends');
 return html.slice(at,end+10);
}
const context={window:{P79AttendanceV6:engine},JSON,Map,Error};
vm.createContext(context);
vm.runInContext(extract(work,'p79SelectWorkHoursCompanyImportPunches'),context);
const exported=source=>Array.from(context.p79SelectWorkHoursCompanyImportPunches(source));
const punch=(id,emp,side,time)=>({
 id,empId:emp,attNo:emp,status:side==='IN'?'上班簽到':'下班簽退',
 timeStr:time,location:'公司GPS位置',note:'供正式公司匯入'
});
function pair(label,emp,start,end){
 const inside=punch(label+'-I',emp,'IN',start),outside=punch(label+'-O',emp,'OUT',end);
 inside.v5PairTargetId=outside.id;outside.v5PairTargetId=inside.id;
 return [inside,outside];
}
const mid=[
 ...pair('valid','472','2026/10/02 15:36','2026/10/02 23:47'),
 ...pair('dupe','472','2026/10/02 15:34','2026/10/02 17:47')];
const morning=[
 ...pair('morning-keep','248','2026/10/01 07:35','2026/10/01 15:55'),
 ...pair('morning-drop','248','2026/10/01 07:31','2026/10/01 15:47')];
const night=[
 ...pair('night-drop','455','2026/10/01 23:30','2026/10/02 07:46'),
 ...pair('night-keep','455','2026/10/01 23:38','2026/10/02 07:48')];
const twoShifts=[
 ...pair('first','100','2026/10/01 07:34','2026/10/01 15:58'),
 ...pair('second','100','2026/10/01 15:59','2026/10/01 23:52')];
const all=[...mid,...morning,...night,...twoShifts];
const original=JSON.stringify(all);
const picked=exported(all);
a.deepEqual(picked.map(r=>r.id),[
 'valid-I','valid-O','morning-keep-I','morning-keep-O',
 'night-keep-I','night-keep-O','first-I','first-O','second-I','second-O'
],'only chosen original punches exported, two different shifts remain independent');
a.equal(picked.length,10);
a.equal(picked[0],all[0],'original event object retained, not a normalized copy');
a.equal(picked[1].timeStr,'2026/10/02 23:47','original timestamp format unchanged');
a.equal(picked[1].status,'下班簽退','original import status unchanged');
a.equal(picked[1].location,'公司GPS位置','source location untouched');
a.equal(JSON.stringify(all),original,'export selection must not mutate any raw data');
const corrected=[punch('same-in','240','IN','2026/10/30 07:40'),
 punch('same-out','240','OUT','2026/10/30 16:50'),
 {...punch('same-out','240','OUT','2026/10/30 15:50'),
 manuallyEdited:true,manuallyEditedAt:'2026-10-30T09:04:44.015Z',
 sourceEventKey:'240|2026/10/30 16:50|下班簽退'}];
a.deepEqual(exported(corrected).map(r=>r.timeStr),
 ['2026/10/30 07:40','2026/10/30 15:50'],
 'edited official OUT wins; historical 16:50 is excluded only from company export');
// Two source versions with identical ID/time must select the precise newer
// edited object, not the first matching event in the company import.
const unedited=punch('identical','780','IN','2026/10/03 07:35');
const edited={...unedited,manuallyEdited:true,manuallyEditedAt:'2026-10-03T09:00:00Z',note:'已核實修改版本'};
const endOriginal=punch('identical-out','780','OUT','2026/10/03 15:50');
const exactVersion=exported([unedited,edited,endOriginal]);
a.equal(exactVersion.length,2);
a.equal(exactVersion[0],edited,'same-ID/time must export latest official source version');
a.equal(exactVersion[0].note,'已核實修改版本');
// Attendance page already exports canonical selected punches; the format must stay
// one row for each original IN or OUT, not two new clock-time columns.
const selection={window:{P79AttendanceV6:engine},Set};
vm.createContext(selection);
vm.runInContext(extract(attendance,'p79SelectAttendanceExportShifts'),selection);
const attendanceSelected=Array.from(selection.p79SelectAttendanceExportShifts(
 mid,'2026-10','2026-10-02','2026-10-02'));
a.equal(attendanceSelected.length,2,'attendance export matches work-hours canonical pair');
a.deepEqual(attendanceSelected.map(r=>r.id),['valid-I','valid-O']);
for(const html of [work,attendance]) {
 const idx=html.indexOf('async function exportSelectedRecordsExcel()');
 a(idx>=0,'company import export still exists');
 const source=html.slice(idx,idx+8000);
 a(source.includes('const sheetRows = [selectedFields.map(f => f.label)]'),
  'company-import header and selected field order unchanged');
 a(source.includes('visibleRecords.forEach(r => {'),
  'each chosen original punch remains one row');
 a(source.includes("if (f.key === 'time') val = formatDateTime(r.timeStr)"),
  'existing company time column unchanged');
 a(!source.includes('clockInTime'),'no extra clock-in column added');
 a(!source.includes('clockOutTime'),'no extra clock-out column added');
}
// Execute the actual work-hours Excel exporter with a real duplicate-pair
// fixture and a fake spreadsheet writer: verify the EXACT original columns.
const fields=['attNo','empId','name','time','status'].map((key)=>({
 checked:true,value:key,getAttribute:()=>({attNo:'考勤號碼',empId:'工號',name:'姓名',time:'打卡時間',status:'出勤狀態'})[key]
}));
let saved=null;
const exportVm={window:{P79AttendanceV6:engine,p79EnsureXlsx:async()=>true},
 document:{querySelectorAll:()=>fields,getElementById:()=>({value:'ALL'})},
 records:mid,JSON,Map,Set,Error,
 requireAdminAction:()=>true,canCurrentAdminViewDataRow:()=>true,
 findEmployeeForAttendanceIdentity:r=>({attNo:r.attNo,empId:r.empId,name:r.name||'472'}),
 formatDateTime:v=>v,formatAttendanceLocationDisplay:v=>v,
 ensureExcelLibrary:()=>true,sysConfig:{companyName:'測試'},defaultConfig:{companyName:'測試'},
 closeExportRecordsModal:()=>{},showToast:()=>{},
 XLSX:{utils:{aoa_to_sheet:rows=>({rows}),book_new:()=>({}),book_append_sheet:(wb,ws)=>{wb.sheet=ws}},writeFile:(wb,name)=>saved={wb,name}}
};
vm.createContext(exportVm);
vm.runInContext(extract(work,'p79SelectWorkHoursCompanyImportPunches'),exportVm);
const expAt=work.indexOf('        async function exportSelectedRecordsExcel() {');
const expEnd=work.indexOf('\\n        }',expAt);
a(expAt>=0&&expEnd>expAt);
vm.runInContext(work.slice(expAt,expEnd+10),exportVm);
(async()=>{
 await exportVm.exportSelectedRecordsExcel();
 a(saved,'real exporter produced a workbook');
 a.deepEqual(Array.from(saved.wb.sheet.rows[0]),['考勤號碼','工號','姓名','打卡時間','出勤狀態']);
 a.equal(saved.wb.sheet.rows.length,3,'one selected IN and one selected OUT, not four rows');
 a.deepEqual(Array.from(saved.wb.sheet.rows.slice(1),r=>[r[3],r[4]]),
  [['2026/10/02 15:36','上班簽到'],['2026/10/02 23:47','下班簽退']]);
 a(!saved.wb.sheet.rows[0].some(c=>c==='簽到時間'||c==='簽退時間'),
  'company import layout is not changed into shift-per-row');
 console.log('PASS real work-hours XLSX generation retains header/order and exactly one canonical IN/OUT pair');
})().catch(e=>{console.error(e);process.exitCode=1});

console.log('PASS unchanged company import schema; canonical selected IN/OUT only; cross-day, morning/middle, corrected official event and real second shifts');

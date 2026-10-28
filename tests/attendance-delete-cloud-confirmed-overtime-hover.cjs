'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../attendance/index.html'),'utf8');
const beginning='        async function deleteCurrentModalAttendanceRecord() {';
const ending='\n        function closeEditModal()';
const start=html.indexOf(beginning),end=html.indexOf(ending,start);
assert.ok(start>0&&end>start,'current edit modal deletion function found');
const snippet=html.slice(start,end);
const employee={id:'OUT-20261028',empId:'AN1140026',name:'test-user',status:'下班簽退',timeStr:'2026/10/28 07:55'};
function setup(reply){
 let confirmResolve;
 const report=[],btn={disabled:false,textContent:''},dialog={hidden:false,classList:{contains(k){return k==='hidden'&&dialog.hidden}}};
 const obj={id:{value:employee.id},deleteModalRecordBtn:btn,editRecordModal:dialog};
 const c={console,Promise,Date,records:[employee],activeEditingAttendanceRecord:employee,
 activeEditingAttendanceRecordSnapshot:employee,p79AttendanceEditCloudReady:true,
 p79VerifyAttendanceDeleteBaseline:async()=>true,requireAdminAction:()=>true,
 document:{getElementById:id=>obj[id]||null},getAttendanceImportEventKey:()=>null,
 getAttendanceDeleteLabel:()=> '下班打卡',confirm:()=>true,showToast:(...args)=>report.push(args),
 postToCloud:()=>typeof reply==='function'?reply():reply,
 p79ApplyConfirmedAttendanceDelete:id=>{if(id!==employee.id)throw Error('wrong record ID');c.records=c.records.filter(x=>x.id!==id);return true},
 closeEditModal:()=>{dialog.hidden=true},p79ScheduleAttendanceMutationRender(){},
 updateHomeClockInButtonState(){},updateEditModalDeleteButton:()=>{btn.textContent='🗑 刪除下班'},
 };
 vm.createContext(c);vm.runInContext(snippet,c);
 return {c,btn,dialog,report,resolve:(x)=>confirmResolve?.(x)};
}
async function run(){
 let saved=0;
 const cases=[
  {name:'cloud reject preserves original',reply:{ok:false,error:'server unavailable'},expectDeleted:false},
  {name:'queued response preserves original',reply:{ok:false,queued:true},expectDeleted:false},
  {name:'localOnly is never accepted as official deletion',reply:{ok:true,localOnly:true},expectDeleted:false},
  {name:'confirmed cloud deletion removes exactly the requested OUT',reply:{ok:true},expectDeleted:true},
 ];
 for(const t of cases){
  const x=setup(t.reply);await x.c.deleteCurrentModalAttendanceRecord();
  assert.equal(x.c.records.length,t.expectDeleted?0:1,t.name);
  assert.equal(x.dialog.hidden,t.expectDeleted,t.name+' modal state');
  assert.ok(x.report.some(v=>v[1]=== (t.expectDeleted?'success':'warning')),t.name+' user feedback');
  if(!t.expectDeleted)assert.equal(x.btn.disabled,false,t.name+' retry possible');
  saved++;
 }
 let release;
 const pending=setup(()=>new Promise(resolve=>release=resolve));
 const operation=pending.c.deleteCurrentModalAttendanceRecord();
 for(let i=0;i<12&&typeof release!=='function';i++)await Promise.resolve();
 assert.equal(typeof release,'function','cloud deletion request must be reached');
 assert.equal(pending.c.records.length,1,'record stays visible while cloud is pending');
 release({ok:true});await operation;
 assert.equal(pending.c.records.length,0,'record removed only after authoritative response');
 saved++;
 const single=html.slice(html.indexOf('        async function deleteRecord(id) {'),html.indexOf('\n        function p79ApplyConfirmedAttendanceDelete(',html.indexOf('        async function deleteRecord(id) {')));
 assert.ok(single.indexOf('await postToCloud(')<single.indexOf('p79ApplyConfirmedAttendanceDelete('),'single deletion confirmation before local mutation');
 assert.ok(!single.includes('purgeDeletedAttendanceRecordFromAllLocalCaches'),'single deletion does not hide a failed delete');
 const daily=html.slice(html.indexOf('        async function deleteDailyAttendance(ids) {'),html.indexOf('\n        async function deleteRecord(id) {'));
 assert.ok(daily.indexOf('await postToCloud(')<daily.indexOf('p79ApplyConfirmedAttendanceDelete('),'daily deletion is also cloud-first');
 assert.match(daily,/已停止後續刪除/,'partial failure stops further deletes');
 saved++;
 const css=html.slice(html.indexOf('<style id="p79-overtime-hours-hover-only-20261028">'),html.indexOf('</style>',html.indexOf('<style id="p79-overtime-hours-hover-only-20261028">'))+8);
 assert.match(css,/#adminRecordsTableBody td\[data-p79-overtime-hours\]:hover/,'hover reveals overtime values');
 assert.match(css, /:focus-within/,'keyboard or tap can reveal overtime values');
 assert.match(css, /opacity: 0 !important/,'overtime value hidden by default');
 assert.match(css, /opacity: 1 !important/,'overtime value visible on hover');
 assert.match(html,/data-p79-overtime-hours.*?p79-overtime-hover-value.*?attendanceRowOvertimeText\(row,overtimeView\)/,'only overtime hours values wrapped');
 assert.match(html,/<th class="px-2 py-3 text-center whitespace-nowrap">加班時數<\/th>/,'column heading stays visible');
 saved++;
 const rejectStart=html.indexOf('        window.p79HandleRejectedPunch=function(id,reason){');
 const rejectEnd=html.indexOf('\n        function getEmployeePunchRecords(',rejectStart);
 assert.ok(rejectStart>=0&&rejectEnd>rejectStart);
 const reject=html.slice(rejectStart,rejectEnd);
 assert.match(reject,/removeAttendanceRecordsFromArchive\(\[key\]\)/,'confirmed duplicate rejection cleans only rejected local record');
 assert.match(reject,/cloudHasId/,'existing confirmed cloud punch never deleted');
 assert.match(reject,/p79MobileRefreshOfficial\(true\)/,'cloud state is reread after duplicate rejection');
 saved++;
 console.log('PASS attendance cloud-first deletion + rejected mobile ghost cleanup + overtime-hours hover:',saved,'regressions');
}
run().catch(e=>{console.error(e);process.exitCode=1});

const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const block=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i+1);assert(i>=0&&j>i,a);return html.slice(i,j);};
const month='2026-11',day=month+'-07';
const active={empId:'A',month,name:'在職',schedule:{[day]:'中',__personnel:{group:'不分組',groupExplicit:true}}};
const hidden={empId:'LEFT',month,name:'歷史人員',role:'AQC',group:'D組',schedule:{[day]:'早',__personnel:{role:'AQC',group:'D組',groupExplicit:true,order:30},__meta:{[day]:{overtimeReport:{id:'FORMAL',category:'休'},overtimeAmendments:[{eventId:'AMENDED'}],overtimeRevocations:[{reportId:'OLD',confirmed:true}]},[month+'-08']:null},customAuditField:{keep:true}}};
const context={};vm.createContext(context);
vm.runInContext(block('    function p79PreserveHiddenScheduleRows(','    function p79ApplySchedulePayload('),context);
const merge=context.p79PreserveHiddenScheduleRows,plain=x=>JSON.parse(JSON.stringify(x));
const original=JSON.stringify(hidden),edited=JSON.stringify(active);
let rows=merge([active],[{...active,schedule:{[day]:'早'}},hidden,{...hidden,empId:'OTHER',month:'2026-10'}],month);
assert.equal(rows.length,2);assert.equal(rows[0].schedule[day],'中');assert.deepEqual(plain(rows[1]),hidden);
assert.equal(JSON.stringify(hidden),original);assert.equal(JSON.stringify(active),edited);
rows[1].schedule.__meta[day].overtimeReport.id='LOCAL';assert.equal(hidden.schedule.__meta[day].overtimeReport.id,'FORMAL');
assert.equal(merge([active],[hidden,{...hidden,empId:' left '}],month).length,2);
assert.equal(merge([active],[],month).length,1);
assert.throws(()=>merge([active],[{empId:'BAD',month,schedule:null}],month),/格式不完整/);
// Real group-edit -> real save handler: inactive historical rows must survive,
// and an explicit move to 不分組 must be serialized before saving.
let posted,queued=0;const emp={id:'A',name:'在職',role:'AQC',group:'B組',lockType:'ROTATION',order:10};
const c={console,JSON,Set,Object,Array,String,Date,Promise,Error,
 employees:[emp],monthlyScheduleData:{A:{[day]:'中'}},monthlyScheduleMeta:{A:{}},
 p79ScheduleCloudRows:[hidden],schedulePersonnelOverrides:{[month]:{}},
 currentScheduleMonthKey:()=>month,currentPort79SsoToken:()=> 'test',
 requireScheduleEditLock:()=>true,p79EnsureGroupEdit:async()=>true,
 scheduleEditLockState:{mine:true},p79ScheduleGroupHistoryUnverifiedMonth:'',
 p79ApplyNoPunchRestFromOfficial:async()=>{},p79ApplyAutomaticRestMetadata(){},approvedLeaveForEmployee:()=>null,p79LeaveCoverOnDay:()=>[],
 p79ScheduleLocalMutationVersion:7,scheduleRoleGroupList:()=>['B組','不分組'],scheduleOrderNumber:x=>x,
 nextScheduleOrder:()=>20,saveAllDataToLocalStorage(){},queuePersonnelCloudSave(){queued++;},buildRoleTabsAndRender(){},
 p79CreateScheduleSaveRequestId:()=> 'request123',cloudPost:async payload=>{posted=plain(payload);return {ok:true};},
 p79BuildScheduleOvertimeMeta(){throw Error('hidden row must not enter editable overtime validation');},
 p79MarkScheduleCloudWriteConfirmed(v){assert.equal(v,7);},p79RefreshScheduleRestCounts(){},
 p79ScheduleRestClient:()=>({refresh(){}}),localStorage:{setItem(){}},sessionStorage:{getItem:()=>null},P79Overtime:{KEY:'unused'},
 window:{P79ScheduleRestSummary:{acceptRows(){}}},document:{getElementById:()=>({value:month})}
};
vm.createContext(c);
for(const [a,b] of [
 ['    function savePersonnelOverrideForCurrentMonth(','    function scheduleGroupIsMeaningful('],
 ['    async function updateEmpGroupAndResort(','    async function updateEmpRoleAndResort('],
 ['    function p79PreserveHiddenScheduleRows(','    function p79ApplySchedulePayload('],
 ['    function p79PreserveLinkedScheduleDays(','    function p79PreserveHiddenScheduleRows('],
 ['    async function saveScheduleMonthToCloud(','    async function saveScheduleEmployeesToCloud(']
])vm.runInContext(block(a,b),c);
(async()=>{
 await c.updateEmpGroupAndResort('A','不分組');assert.equal(queued,1);assert.equal(emp.group,'不分組');assert.equal(c.schedulePersonnelOverrides[month].A.groupExplicit,true);
 assert.equal(await c.saveScheduleMonthToCloud(false),true);assert.equal(posted.expectedEmployeeCount,2);
 assert.deepEqual(posted.schedules.find(r=>r.empId==='LEFT'),hidden);
 const saved=posted.schedules.find(r=>r.empId==='A');assert.equal(saved.group,'不分組');assert.equal(saved.schedule.__personnel.groupExplicit,true);
 // Use the actual reload/inheritance functions to verify the explicit setting wins.
 const reload={String,Object,Array,Set,employeeMasterBase:[emp],employees:[],schedulePersonnelOverrides:{[month]:{A:saved.schedule.__personnel},'2026-10':{A:{group:'B組',groupExplicit:true}}},
  currentScheduleMonthKey:()=>month,cloneScheduleEmployee:e=>({...e}),scheduleEmployeeEligibleForMonth:()=>true,scheduleOrderNumber:x=>x};
 vm.createContext(reload);vm.runInContext(block('    function scheduleGroupIsMeaningful(','    // Read historical group metadata'),reload);
 reload.applySchedulePersonnelOverrides(month);assert.equal(reload.employees[0].group,'不分組');
 console.log('PASS hidden historic roster/audit preservation, month/ID isolation, immutable snapshots, real group edit/save payload and explicit ungrouping after reload');
})().catch(e=>{console.error(e);process.exitCode=1;});

const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
function fn(name){
  const start=html.indexOf('    function '+name+'(');
  const asyncStart=html.indexOf('    async function '+name+'(');
  const at=start>=0?start:asyncStart;
  assert(at>=0,'Missing function '+name);
  return html.slice(at,html.indexOf('\n    }',at)+6);
}
function payload(month,groups){
  return {ok:true,month,schedules:groups.map(([id,group,explicit=false])=>({
    empId:id,month,role:'ARMG',group,
    schedule:{'2026-10-01':'早',__personnel:{role:'ARMG',group,groupExplicit:explicit,
      groupOptions:['A組','C組']}}
  }))};
}
const names=['scheduleGroupIsMeaningful','latestHistoricalScheduleOverride',
 'applySchedulePersonnelOverrides','p79ScheduleGroupPreviousMonth',
 'p79ScheduleGroupHistorySnapshot','p79ScheduleRolesWithoutGroups',
 'p79ScheduleLoadPreviousGroups','p79ScheduleRestorePreviousGroups'];
const employees=['E1','E2','E3'].map(id=>({id,group:'不分組',role:'ARMG'}));
const cloud=new Map([
  ['2026-10',payload('2026-10',[['E1','C組'],['E2','C組'],['E3','A組']])],
  ['2026-11',payload('2026-11',[['E1','不分組'],['E2','不分組'],['E3','不分組']])]
]);
let reads=[];
const c={console,String,Object,Array,Set,Map,Date,Promise,URL,AbortController,
 setTimeout,clearTimeout,encodeURIComponent,
 GAS_URL:'https://example.invalid/roster',
 fetch:async url=>{
   const month=new URL(url).searchParams.get('month');
   reads.push(month);
   return {ok:true,json:async()=>cloud.get(month)||{ok:true,month,schedules:[]}};
 },
 document:{getElementById:()=>({value:'2026-11'})},
 employeeMasterBase:employees,employees:[],availableGroups:['不分組','不輪班'],
 schedulePersonnelOverrides:{'2026-11':Object.fromEntries(employees.map(e=>
    [e.id,{role:'ARMG',group:'不分組',groupExplicit:false}]))},
 scheduleRoleGroupOptions:{'2026-11':{}},
 cloneScheduleEmployee:e=>({...e}),scheduleEmployeeEligibleForMonth:()=>true,
 scheduleOrderNumber:x=>x??null,
 currentScheduleMonthKey:()=> '2026-11'
};
vm.createContext(c);
vm.runInContext("let p79ScheduleGroupHistoryToken=''; const p79ScheduleGroupHistoryCache=new Map(); let p79ScheduleGroupHistoryUnverifiedMonth='';",c);
for(const name of names)vm.runInContext(fn(name),c);
assert.equal(c.p79ScheduleGroupPreviousMonth('2027-01'),'2026-12');
assert.equal(c.p79ScheduleGroupPreviousMonth('2026-01',2),'2025-11');
assert.equal(c.p79ScheduleGroupPreviousMonth('invalid'),'');
c.applySchedulePersonnelOverrides('2026-11');
assert.deepEqual(Array.from(c.p79ScheduleRolesWithoutGroups('2026-11')),['ARMG']);
(async()=>{
  const result=await c.p79ScheduleLoadPreviousGroups('2026-11','TOKEN-A',['ARMG']);
  assert.equal(result.verified,true);
  assert.deepEqual(reads,['2026-10']);
  c.p79ScheduleRestorePreviousGroups('2026-11',result.history);
  assert.deepEqual(Array.from(c.employees,e=>e.group),['C組','C組','A組']);
  assert.equal(c.schedulePersonnelOverrides['2026-11'].E1.group,'不分組','November cloud record retained');
  assert.equal(c.schedulePersonnelOverrides['2026-10'].E1.group,'C組','October cloud record retained');
  assert.deepEqual(Array.from(c.p79ScheduleRolesWithoutGroups('2026-11')),[]);
  c.schedulePersonnelOverrides['2026-11'].E1.groupExplicit=true;
  c.applySchedulePersonnelOverrides('2026-11');
  assert.equal(c.employees[0].group,'不分組','explicit November unassignment remains authoritative');
  assert.equal(c.employees[1].group,'C組');
  c.schedulePersonnelOverrides['2026-11'].E1.groupExplicit=false;
  c.schedulePersonnelOverrides['2026-12']=Object.fromEntries(employees.map(e=>
    [e.id,{role:'ARMG',group:'不分組',groupExplicit:false}]));
  const december=await c.p79ScheduleLoadPreviousGroups('2026-12','TOKEN-A',['ARMG']);
  assert.deepEqual(reads,['2026-10','2026-11'],'October reused from verified in-session cache');
  assert.deepEqual(Array.from(december.history,h=>h.month),['2026-10','2026-11']);
  c.p79ScheduleRestorePreviousGroups('2026-12',december.history);
  assert.deepEqual(Array.from(c.employees,e=>e.group),['C組','C組','A組'],'intermediate untouched month must not mask October');
  c.schedulePersonnelOverrides['2026-11'].E2.groupExplicit=true;
  c.applySchedulePersonnelOverrides('2026-12');
  assert.equal(c.employees[1].group,'不分組','latest explicit historical unassignment takes priority');
  assert.equal(c.schedulePersonnelOverrides['2026-10'].E2.group,'C組','old month not modified');
  const invalid=c.p79ScheduleGroupHistorySnapshot({ok:true,month:'2026-09',schedules:[]},'2026-10');
  assert.equal(invalid,null,'different-month response must be rejected');
  const altered=c.p79ScheduleGroupHistorySnapshot(
    {ok:true,month:'2026-10',schedules:[{empId:'E1',month:'2026-11',group:'WRONG'}]},'2026-10');
  assert.deepEqual(Object.keys(altered.overrides),[],'other-month row ignored');
  for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
    if(script[1].trim())new vm.Script(script[1]);
  }
  console.log('PASS cloud history group continuity for Nov/Dec, explicit unassignment, authentication cache, immutable monthly roster, scripts parse');
})().catch(err=>{console.error(err);process.exitCode=1;});

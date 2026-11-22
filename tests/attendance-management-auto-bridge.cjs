'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-management-link.js','utf8');
const start=source.indexOf("g.P79ManagementContext={system:'attendance'");
const end=source.indexOf('\n;\n})(window);\n},"leave"',start);
assert(start>=0&&end>start,'real attendance manager adapter must exist');
const realSource=source.slice(start,end);
assert(source.includes("port79_attendance_sync_notice_v1"),'confirmed punch has cross-system invalidation key');
function setup(sync=true){
 let auth='TOKEN',month='2026-10',reads=0,applies=0,renders=0,pending=false;
 const state={employees:[],leaveRecords:[],schedules:[]};
 const g={
  window:null,Map,Set,Date,Promise,
  getRequestedAttendanceCloudMonth:()=>month,currentPort79SsoToken:()=>auth,getActiveGasUrl:()=> 'https://script.google.com/macros/s/TEST/exec',
  canReadAdminCloudData:()=>true,document:{getElementById:()=>({classList:{contains:()=>false}})},
  p79V5GetStatus:()=>({pending}),
  mergeCloudEmployees:e=>e,normalizeEmployeeIdentifiers:e=>e,initDropdowns:()=>{},renderAdminEmployeeTable:()=>{},p79RenderOnlyVisibleAttendanceView:()=>{renders++},
  p79StartupAttendanceCurrentMonthSync:async()=>{reads++;return typeof sync==='function'?sync():sync},
 };
 g.window=g;Object.defineProperties(g,{
  employees:{get:()=>state.employees,set:v=>{state.employees=v}},
  leaveRecords:{get:()=>state.leaveRecords,set:v=>{state.leaveRecords=v}},
  schedules:{get:()=>state.schedules,set:v=>{state.schedules=v}}
 });
 vm.createContext(g);vm.runInContext('const g=window;\n'+realSource,g);
 const snapshot={ok:true,confirmedFresh:true,month:'2026-10',data:{employees:[{empId:'E-1'}]},
  roster:{schedules:[{month:'2026-10',empId:'E-1',schedule:{}}],leaveRecords:[]}};
 return {api:g.P79ManagementContext,snapshot,state,reads:()=>reads,renders:()=>renders,changeToken:x=>{auth=x},changeMonth:x=>{month=x},pending:x=>{pending=x}};
}
(async()=>{
 const a=setup(true);
 assert(a.api.canRead());
 assert.equal(await a.api.applySnapshot(a.snapshot,['people','leave','schedule']),true);
 assert.equal(a.reads(),1,'confirmed cross-system notice must refresh the official attendance month');
 assert.equal(a.state.schedules.length,1,'cloud roster snapshot is applied');
 assert.equal(a.renders(),1);
 assert.equal(await a.api.applySnapshot(a.snapshot),true,'primary manual read retains its own month owner');
 assert.equal(a.reads(),1,'manual full refresh must not initiate an extra duplicate attendance read');
 const b=setup(false);
 assert.equal(await b.api.applySnapshot(b.snapshot,['attendance']),false,'failed dedicated month read must never confirm synchronization');
 const c=setup(true);c.changeMonth('2026-11');
 assert.equal(await c.api.applySnapshot(c.snapshot,['attendance']),false,'changed month cannot confirm an old snapshot');
 const d=setup(async()=>{d.changeToken('DIFFERENT');return true});
 assert.equal(await d.api.applySnapshot(d.snapshot,['attendance']),false,'login changed during cloud sync must not confirm an old snapshot');
 const e=setup();e.pending(true);assert.equal(e.api.hasPendingChanges(),true,'pending edits block the automatic bridge');
 console.log('PASS attendance automatic management read: confirmed notice, one official month owner, no duplicate manual read, cloud failure, scope and pending writes');
})().catch(e=>{console.error(e);process.exitCode=1});

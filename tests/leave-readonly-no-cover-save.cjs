'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),html=fs.readFileSync('leave/index.html','utf8');
(async()=>{
 const fresh={ok:true,leaveRecords:[{id:'EXISTING',empId:'E1',leaveType:'特休假',status:'已核准',startDate:'2026-11-28',endDate:'2026-11-28',source:'manual-admin'}],leaveCoverAssignments:[{leaveId:'EXISTING',workerIds:['E2']},{leaveId:'OLD_ORPHAN',workerIds:['E3']}]};
 let reads=0,writes=0;const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',disabled:false,textContent:'',close(){this.closed=true;}});return nodes.get(id);};
 const c={console,Date,JSON,Set,Map,Error,adminCreateLeaveBusy:false,adminCreateLeaveId:'NEW-ID',
  GAS_URL:'https://fixture.invalid',leaveRequestToken:()=> 'MANAGER',
  jsonFetch:async()=>{reads++;return fresh;},postCloud:async()=>{writes++;throw Error('unexpected mutation');},
  $:el,normalizeLeaveFilterDate:v=>v,setStatus(){},loadCloud:async()=>true,p79ToggleCreateNoCover(){}};
 vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('async function p79ReadCurrentLeaveCoverState(){'),html.indexOf('function leaveBalanceNumber')),c);
 vm.runInContext(html.slice(html.indexOf('async function p79SaveCreateLeaveWithoutCover('),html.indexOf('async function saveAdminCreateLeave(')),c);
 el('adminCreateLeaveStart').value=el('adminCreateLeaveEnd').value='2026-11-28';el('adminCreateLeaveType').value='特休假';
 const before=JSON.stringify(fresh);await c.p79SaveCreateLeaveWithoutCover({empId:'E1'},1);
 assert.equal(reads,1,'exactly one dedupe read, no cleanup write/read cycle');assert.equal(writes,0,'no-cover save does not clean, replace, or rewrite existing arrangements');
 assert.equal(c.adminCreateLeaveId,'EXISTING');assert.equal(JSON.stringify(fresh),before);assert(el('adminCreateLeaveDialog').closed);
 console.log('PASS leave preflight is read-only with historical orphans; no-cover exact leave preserves all existing cover and roster data without duplicate writes');
})().catch(e=>{console.error(e);process.exit(1)});

'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const page=fs.readFileSync('leave/index.html','utf8');
const source=fs.readFileSync('assets/port79-leave-daily-simple.js','utf8').replace(/\}\)\(\);\s*$/, 'window.seedDaily=(date,value)=>rows.set(date,value);})();');
const dates=['2026-11-28','2026-11-29'],nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,textContent:'',close(){this.closed=true;}});return nodes.get(id);};
const people=[{empId:'LEAVER',name:'甲',dept:'A'},{empId:'WORKER',name:'乙',dept:'A'},{empId:'LEAVER2',name:'丙',dept:'A'}];
const storage=new Map(),fresh={ok:true,leaveRecords:[],leaveCoverAssignments:[]};let fail=true,posts=0,reads=0;
const c={document:{getElementById:el,addEventListener(){}},console,Map,Set,Date,JSON,
 adminSession:{adminRole:'superadmin'},leaveAccess:'manage',adminCreateLeaveBusy:false,
 openAdminCreateLeave:async()=>{},saveAdminCreateLeave:()=>{},p79DailyCreateDates:()=>dates,leaveCreatePeople:()=>people,esc:s=>s,
 sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 p79UpdateLeaveHandoffBanner:()=>{},p79ReadCurrentLeaveCoverState:async()=>{reads++;return fresh;},
 p79PlanLeaveCoverRequest:(records,covers,r)=>({leaveId:r.id,existing:records.some(x=>x.id===r.id),covered:covers.some(x=>x.leaveId===r.id)}),
 postCloud:async request=>{posts++;if(request.action==='saveLeaveCoverAssignment'&&request.leaveId==='L2'&&fail)throw Error('second day offline');return {ok:true};},
 setStatus(){},loadCloud:async()=>true,alert(){throw Error('permission denied');}};
c.window=c;vm.createContext(c);
const start=page.indexOf('const P79_HANDOFF_KEY='),end=page.indexOf('function p79LeaveHandoffEntryState',start);
vm.runInContext(page.slice(start,end),c);vm.runInContext(source,c);
for(const [i,date] of dates.entries())c.seedDaily(date,{id:'L'+(i+1),applicant:i===1?'LEAVER2':'LEAVER',applicantOverride:i===1,first:'WORKER',second:''});
el('adminCreateLeaveEmployee').value='LEAVER';el('adminCreateLeaveDaily').checked=true;el('adminCreateLeaveType').value='特休假';
(async()=>{
 await c.saveAdminCreateLeave();let h=JSON.parse(storage.get('port79_leave_overtime_handoff_v1'));
 assert.equal(h.entries.length,1,'first successful day remains queued when second cover save fails');assert.equal(h.entries[0].leaveId,'L1');assert.equal(h.pendingReports,true);
 assert(!el('adminCreateLeaveDialog').closed,'partial failure keeps the form available');
 fail=false;await c.saveAdminCreateLeave();h=JSON.parse(storage.get('port79_leave_overtime_handoff_v1'));
 assert.deepEqual(h.entries.map(e=>e.leaveId),['L1','L2'],'retry preserves first pending report and adds only the second');
 assert.deepEqual(h.entries.map(e=>e.forEmpId),['LEAVER','LEAVER2'],'default applicant and explicit per-day override retain different leave links');
 assert.equal(posts,5,'retry does not rewrite already confirmed leave or cover');assert.equal(reads,2,'one dedupe read per save attempt');
 assert(el('adminCreateLeaveDialog').closed);assert.equal(c.adminCreateLeaveBusy,false);
 c.leaveAccess='view';await assert.rejects(c.saveAdminCreateLeave(),/permission denied/);assert.equal(posts,5);
 console.log('PASS partial daily save retains confirmed pending reports; retry is idempotent; other days retained; view-only cannot save');
})().catch(e=>{console.error(e);process.exit(1)});

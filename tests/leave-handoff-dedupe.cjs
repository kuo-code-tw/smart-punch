const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('leave/index.html','utf8');
const start=html.indexOf('const P79_HANDOFF_KEY='),end=html.indexOf('window.p79OvertimeContext={',start);
assert(start>0&&end>start,'leave page must provide cloud-reconciled substitute handoff');
const source=html.slice(start,end);
assert(html.includes('if(plan.covered){\n   p79DiscardLeaveHandoff(plan.leaveId);'),'existing leave cover should not be requeued');
assert(html.includes('if(plan.covered){\n   p79DiscardLeaveHandoff(adminCreateLeaveId);'),'retroactive leave with existing cover should not be requeued');
assert((html.match(/p79ActivateLeaveHandoff\(\);/g)||[]).length===3,'all three fresh handoff entry points must be marked active');
function fixture(report=null,covers=true,rows=true){
 const entry={empId:'WORKER',forEmpId:'LEAVER',date:'2026-10-20',name:'代班甲'};
 const leaveCoverAssignments=covers?[{leaveId:'LEAVE',leaveEmpId:'LEAVER',workerIds:['WORKER'],startDate:'2026-10-20',endDate:'2026-10-20'}]:[];
 const schedules=rows?[{empId:'WORKER',schedule:{'2026-10-20':'早',__meta:{'2026-10-20':report?{overtimeReport:report}:{}}}}]:[];
 const data={ok:true,month:'2026-10',leaveCoverAssignments,schedules,config:{}};
 const stored=new Map(),banner={hidden:true},label={textContent:''},calls={fetch:0,open:0,status:[]};
 const context={console,Date,Map,JSON,Promise,adminSession:{adminRole:'superadmin'},GAS_URL:'https://fixture.invalid',p79LeaveHandoffBusy:false,p79LeaveHandoffContext:null,p79LeaveOvertimeConfig:{},leaveRequestToken:()=> 'test-token',p79CanReportOvertime:()=>true,
   sessionStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)},
   $:id=>id==='p79LeaveHandoffBanner'?banner:id==='p79LeaveHandoffStatus'?label:null,
   normalizeLeaveFilterDate:v=>String(v||'').slice(0,10).replaceAll('/','-'),
   jsonFetch:async()=>{calls.fetch++;return data},
   P79Overtime:{showReportLoading:()=>({isConnected:true,close(){this.isConnected=false},querySelector:()=>({textContent:''})}),resolveLeaveCoverReport:()=>({code:'代08-16'}),openReport:async opts=>{calls.open++;calls.last=opts}},
   setStatus:(msg)=>calls.status.push(msg)};
 vm.createContext(context);vm.runInContext(source,context);
 const put=(entries=[entry])=>{stored.set('port79_leave_overtime_handoff_v1',JSON.stringify({id:'LEAVE',createdAt:Date.now(),entries}));};
 const read=()=>JSON.parse(stored.get('port79_leave_overtime_handoff_v1')||'null');
 return {context,entry,put,read,banner,label,calls};
}
(async()=>{
 let t=fixture();t.put();await t.context.p79ReconcileLeaveHandoff();
 assert.equal(t.read(),null,'already assigned substitute must not reappear on revisit');
 assert.equal(t.banner.hidden,true);
 t=fixture({id:'SAVED',category:'代',code:'代08-16'});t.put();t.context.p79ActivateLeaveHandoff();await t.context.p79ReconcileLeaveHandoff();
 assert.equal(t.read(),null,'filed overtime must not reappear even during fresh handoff');
 t=fixture();t.put();t.context.p79ActivateLeaveHandoff();await t.context.p79ReconcileLeaveHandoff();
 assert.equal(t.read().entries.length,1,'newly assigned and not filed is allowed to continue once');
 assert.equal(t.banner.hidden,false,'fresh verified pending handoff should remain available');
 await t.context.p79OpenLeaveOvertimeHandoff();assert.equal(t.calls.open,1);
 assert.equal(t.calls.last.date,'2026-10-20','handoff must use original leave date, never today');
 t=fixture(null,false);t.put();t.context.p79ActivateLeaveHandoff();await t.context.p79ReconcileLeaveHandoff();
 assert.equal(t.read(),null,'cancelled cover cannot remain in queue');
 t=fixture();t.put();t.context.p79ActivateLeaveHandoff();t.context.jsonFetch=async()=>{throw Error('offline')};
 await assert.rejects(t.context.p79ReconcileLeaveHandoff(),/offline/);
 assert.equal(t.read().entries.length,1,'cloud errors must not silently destroy unverified entries');
 assert.equal(t.banner.hidden,true,'unverified browser queue must not claim real availability');
 t=fixture(null,true,false);t.put();t.context.p79ActivateLeaveHandoff();
 await assert.rejects(t.context.p79ReconcileLeaveHandoff(),/班表/);
 assert.equal(t.read().entries.length,1,'missing employee schedule must not be treated as completed');
 console.log('PASS leave cover handoff: existing arrangements, filed overtime, new submission, original date, cancelled covers, offline safeguards');
})().catch(e=>{console.error(e);process.exit(1)});

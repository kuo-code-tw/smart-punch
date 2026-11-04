const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('leave/index.html','utf8');
const start=html.indexOf('const P79_HANDOFF_KEY='),end=html.indexOf('window.p79OvertimeContext={',start);
assert(start>0&&end>start,'leave page must provide cloud-reconciled substitute handoff');
const source=html.slice(start,end);
assert(html.includes('if(plan.covered){\n   p79DiscardLeaveHandoff(plan.leaveId);'),'existing leave cover should not be requeued');
assert(html.includes('if(plan.covered){\n   p79DiscardLeaveHandoff(adminCreateLeaveId);'),'retroactive leave with existing cover should not be requeued');
assert(html.includes('function p79AppendLeaveHandoffEntries(entries)'), 'confirmed handoffs merge without replacing earlier pending entries');
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
   P79Overtime:{typeOptions:()=>[],showReportLoading:()=>({isConnected:true,close(){this.isConnected=false},querySelector:()=>({textContent:''})}),resolveLeaveCoverReport:()=>({code:'代08-16'}),openReport:async opts=>{calls.open++;calls.last=opts}},
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
 assert.equal(t.read().verifiedAt,undefined,'offline queue must not claim cloud verification');
 t=fixture(null,true,false);t.put();t.context.p79ActivateLeaveHandoff();
 await assert.rejects(t.context.p79ReconcileLeaveHandoff(),/班表/);
 assert.equal(t.read().entries.length,1,'missing employee schedule must not be treated as completed');
 // A slow later employee/month must not delay the first verified filing.
 t=fixture();
 const later={...t.entry,empId:'SECOND',date:'2026-11-01'};
 t.put([t.entry,later]);t.context.p79ActivateLeaveHandoff();
 const fetchFirst=t.context.jsonFetch;
 t.context.jsonFetch=async url=>{
  if(url.includes('empId=SECOND'))throw Error('later month offline');
  return fetchFirst(url);
 };
 await t.context.p79OpenLeaveOvertimeHandoff();
 assert.equal(t.calls.open,1,'first verified filing opens without fetching later entries');
 assert.equal(t.calls.fetch,1,'one context read is reused by the filing dialog');
 assert.equal(t.read().entries.length,2,'unverified later entries must remain queued');
 // Once the first filing is saved, the later error must preserve the whole queue.
 const firstData=await fetchFirst();
 firstData.schedules[0].schedule.__meta['2026-10-20']={overtimeReport:{id:'SAVED'}};
 await assert.rejects(t.context.p79ReconcileLeaveHandoff(),/later month offline/);
 assert.equal(t.read().entries.length,2,'partial reconciliation cannot drop entries on error');
 // A same-month second date must receive its own scoped punch/leave context.
 t=fixture();
 const secondDate={...t.entry,date:'2026-10-28'},urls=[];
 t.put([t.entry,secondDate]);t.context.p79ActivateLeaveHandoff();
 t.context.jsonFetch=async url=>{
  urls.push(url);const date=url.includes('2026-10-28')?'2026-10-28':'2026-10-20';
  return {ok:true,date,config:{},leaveCoverAssignments:[{leaveId:'LEAVE',leaveEmpId:'LEAVER',workerIds:['WORKER'],startDate:'2026-10-20',endDate:'2026-10-28'}],
   schedules:[{empId:'WORKER',schedule:{__meta:{'2026-10-20':{overtimeReport:{id:'SAVED'}}}}}]};
 };
 t.context.P79Overtime.resolveLeaveCoverReport=(data,h,e)=>{assert.equal(data.date,e.date,'do not relabel a different day context as current');return {};};
 await t.context.p79OpenLeaveOvertimeHandoff();
 assert.equal(urls.length,2,'completed first day and pending later day use separate contexts');
 assert.equal(t.calls.open,1);assert.equal(t.calls.last.date,'2026-10-28');
 // Confirmed days survive partial saves, later additions, reloads and selective deletion.
 t=fixture();
 t.context.p79AppendLeaveHandoffEntries([{...t.entry,leaveId:'L1'}]);
 t.context.p79AppendLeaveHandoffEntries([{...t.entry,empId:'SECOND',leaveId:'L2'}]);
 t.context.p79AppendLeaveHandoffEntries([{...t.entry,leaveId:'L1'}]);
 assert.equal(t.read().entries.length,2,'merging confirmed days is idempotent');
 assert.equal(t.read().pendingReports,true,'confirmed pending reports remain actionable after reload');
 t.context.p79DiscardLeaveHandoff('L1');
 assert.equal(t.read().entries.length,1,'deleting one daily leave preserves the other pending report');
 assert.equal(t.read().entries[0].leaveId,'L2');
 console.log('PASS leave cover handoff: existing arrangements, filed overtime, new submission, original date, cancelled covers, offline safeguards');
})().catch(e=>{console.error(e);process.exit(1)});

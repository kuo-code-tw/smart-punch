(function(global){
'use strict';
// Draft: management-only invalidation. It never writes domain records or submits punch requests.
// The original efficiency verifier labels every {ok:false} as an auth rejection.
// Keep the server's exact lock-contention response as a failed read in the isolated candidate.
if(global.P79ManagementTestMode===true&&typeof global.verifyGcSsoToken==='function'){
 const verify=global.verifyGcSsoToken;
 global.verifyGcSsoToken=async function(...args){
  try{return await verify.apply(this,args);}
  catch(error){
   if(error?.ssoAuthRejected===true&&String(error.message||'').trim()==='雲端正在同步管理員資料，請稍後重試 SSO 驗證'){
    const unavailable=new Error('雲端正在同步管理員資料，請稍後重試 SSO 驗證');
    unavailable.ssoAuthRejected=false;unavailable.retryable=true;throw unavailable;
   }
   throw error;
  }
 };
}
const TOPICS=['people','organization','permissions','leave','cover','schedule','overtime','attendance','efficiency','history'];
const ACTIONS={
 hrUpsertEmployee:['people','permissions'],hrDeleteEmployee:['people','permissions','schedule'],hrSetEmploymentStatus:['people','schedule'],hrSaveOrgSettings:['organization','people'],
 addLeave:['leave'],addLeaveRecord:['leave'],updateLeaveStatus:['leave','cover','schedule','overtime'],
 deleteLeaveRecord:['leave','cover','schedule','overtime'],saveLeaveCoverAssignment:['leave','cover','schedule','overtime'],cleanupOrphanLeaveCovers:['cover','schedule','overtime'],
 updateLeaveBalances:['leave'],syncSchedules:['schedule','overtime'],saveScheduleEmployee:['people','schedule'],saveScheduleGroups:['organization','schedule'],
 saveOvertimeReportDirect:['overtime','schedule'],deleteOvertimeAssignment:['overtime','schedule'],
 gcUpsertShipMaster:['efficiency','history'],gcDeleteShipMaster:['efficiency','history'],gcUpsertRecord:['efficiency','history'],gcDeleteRecord:['efficiency','history'],gcSyncAll:['efficiency','history'],gcUpsertGroup:['efficiency'],gcDeleteGroup:['efficiency'],gcAssignEmployee:['efficiency'],
 updateRecord:['attendance','overtime'],deleteRecord:['attendance','overtime']
};
const DEPENDENCIES={attendance:['people','organization','permissions','leave','cover','schedule','overtime','attendance'],hr:['people','organization','permissions'],leave:['people','organization','permissions','leave','cover','schedule','overtime'],schedule:['people','organization','permissions','leave','cover','schedule','overtime','attendance'],workhours:['people','organization','permissions','leave','cover','schedule','overtime','attendance'],efficiency:['people','organization','permissions','efficiency'],history:['history','attendance','schedule','efficiency']};
function topicsFor(action){return (ACTIONS[action]||[]).slice();}
function validEvent(e){return !!e&&e.v===1&&typeof e.id==='string'&&e.id.length<150&&Number.isFinite(e.at)&&Array.isArray(e.topics)&&e.topics.length<=TOPICS.length&&e.topics.every(t=>TOPICS.includes(t));}
function create(options){
 const {system,isManager,refresh,isEditing,notify=()=>{},clock=Date.now}=options;
 const dependencies=DEPENDENCIES[system]||[];let pending=new Set(),seen=new Set(),running=null,disposed=false,generation=0;
 function status(){return {pending:[...pending],running:!!running,generation};}
 function receive(event){
  if(disposed||!isManager()||!validEvent(event)||seen.has(event.id))return false;
  seen.add(event.id);if(seen.size>128)seen.delete(seen.values().next().value);
  const relevant=event.topics.filter(t=>dependencies.includes(t));if(!relevant.length)return false;
  relevant.forEach(t=>pending.add(t));generation++;notify(status());return true;
 }
 async function synchronize(){
  if(disposed||!isManager())return {ok:false,reason:'permission'};
  if(running)return running;
  if(isEditing())return {ok:false,reason:'editing'};
  if(!pending.size)return {ok:true,unchanged:true};
  const captured=generation;
  running=Promise.resolve().then(async()=>{try{
   const result=await refresh([...pending]);
   if(disposed||!isManager())return {ok:false,reason:'permission'};
   if(result!==true)return {ok:false,reason:'unconfirmed'};
   if(generation===captured)pending.clear();
   return {ok:true,pending:pending.size>0};
  }catch(error){return {ok:false,reason:'read-failed',errorType:['AbortError','ReferenceError','TypeError'].includes(error?.name)?error.name:'ReadError'};}finally{running=null;if(!disposed)notify(status());}});
  return running;
 }
 function acknowledge(action,response){
  const topics=topicsFor(action);if(disposed||!isManager()||!topics.length||response?.ok!==true||response?.retryable||response?.error)return null;
  return {v:1,id:options.makeId(),at:clock(),topics};
 }
 return {receive,synchronize,acknowledge,status,dispose(){disposed=true;pending.clear();seen.clear();}};
}
function attach(options){
 if(!options.isManager())return {dispose(){}};
 const KEY=options.channelKey||'p79-management-revision-v1';const engine=create(options),listeners=[],priorFetch=global.fetch;let disposed=false;
 const invalidate=()=>{try{const prev=Number(sessionStorage.getItem('port79_cache_mutated_at')||0);sessionStorage.setItem('port79_cache_mutated_at',String(Math.max(Date.now(),prev+1)));}catch(_){}};
 const handle=e=>{if(engine.receive(e))invalidate();};
 let channel=null;try{if(typeof global.BroadcastChannel==='function')channel=new global.BroadcastChannel(KEY);}catch(_){}
 if(channel)channel.onmessage=e=>handle(e.data);
 const publish=event=>{if(disposed||!event)return;if(options.receiveOwn===true)handle(event);else invalidate();try{localStorage.setItem(KEY,JSON.stringify(event));}catch(_){};try{channel?.postMessage(event);}catch(_){};};
 const storage=e=>{if(e.key===KEY&&e.newValue)try{handle(JSON.parse(e.newValue));}catch(_){};};
 global.addEventListener('storage',storage);listeners.push(()=>global.removeEventListener('storage',storage));listeners.push(()=>channel?.close());
 function requestAction(input,init){
  const method=String(init?.method||(typeof input==='object'?input.method:'GET')||'GET').toUpperCase();if(method==='GET')return '';
  try{const url=new URL(typeof input==='string'?input:input.url,global.location.href);if(url.origin!==options.gasOrigin||url.pathname!==options.gasPath)return '';return JSON.parse(init?.body||'{}').action||'';}catch(_){return '';}
 }
 async function wrapped(input,init){
  const action=options.isManager()?requestAction(input,init):'',response=await priorFetch.call(global,input,init);
  if(topicsFor(action).length&&response.ok){
   // Only an explicit domain ACK is a revision. HTTP 200/timeout is never a success.
   void response.clone().json().then(body=>publish(engine.acknowledge(action,body))).catch(()=>{});
  }
  return response;
 }
 global.fetch=wrapped;
 const onFocus=()=>{if(options.isManager()&&options.autoRefreshSafe?.())void engine.synchronize();};
 global.addEventListener('focus',onFocus);listeners.push(()=>global.removeEventListener('focus',onFocus));
 // No polling: receiver adapters decide when a form is safe to reload.
 return {engine,publish,dispose(){if(disposed)return;disposed=true;listeners.forEach(f=>f());engine.dispose();if(global.fetch===wrapped)global.fetch=priorFetch;}};
}
global.P79ManagementSync={topicsFor,validEvent,create,attach,dependencies:DEPENDENCIES};
})(typeof window==='undefined'?globalThis:window);

(function(g){
'use strict';
function makeAdapter(system,context){
 if(!context||typeof context.canRead!=='function'||typeof context.readFresh!=='function'||typeof context.hasPendingChanges!=='function'||typeof context.identity!=='function'||typeof context.applySnapshot!=='function')throw Error('Incomplete management adapter: '+system);
 let generation=0,disposed=false,reading=null;
 return {
  system,
  isManager:()=>!disposed&&context.canRead()===true,
  isEditing:()=>context.hasPendingChanges()!==false||context.isFormOpen?.()===true,
  async refresh(topics){
   if(disposed||context.canRead()!==true||context.hasPendingChanges()!==false||context.isFormOpen?.()===true)return false;
   if(reading)return reading;
   const epoch=++generation,identity=context.identity();
   reading=Promise.resolve().then(async()=>{
    const snapshot=await context.readFresh(topics);
    if(disposed||epoch!==generation||context.identity()!==identity||context.canRead()!==true||context.hasPendingChanges()!==false||context.isFormOpen?.()===true)return false;
    if(snapshot?.ok!==true||snapshot.fromCache===true||snapshot.confirmedFresh!==true)return false;
    // Applying is a local display operation; adapters never submit domain writes.
    const applied=await context.applySnapshot(snapshot,topics);
    return applied===true;
   }).finally(()=>{reading=null;});return reading;
  },
  dispose(){disposed=true;generation++;}
 };
}
g.P79ManagementAdapterFactory={makeAdapter};
})(typeof window==='undefined'?globalThis:window);

(function(){const path=location.pathname;const sys=path.includes('/attendance/')?'attendance-admin':path.includes('/work-hours/')?'workhours':path.includes('/aqc-efficiency/')?'efficiency':path.includes('/history-data/')?'history':path.includes('/schedule/')?'schedule':path.includes('/leave/')?'leave':path.includes('/hr/')?'hr':'';const registers={"attendance-admin":function(){(function(g){'use strict';
g.P79ManagementContext={system:'attendance',identity:()=>currentPort79SsoToken(),gas:()=>getActiveGasUrl(),token:()=>currentPort79SsoToken(),canRead:()=>canReadAdminCloudData()&&!document.getElementById('viewAdmin')?.classList.contains('hidden'),hasPendingChanges:()=>!!window.p79V5GetStatus?.().pending,
scope:()=>({month:getRequestedAttendanceCloudMonth()}),readFresh:async read=>{const month=getRequestedAttendanceCloudMonth();const [d,roster]=await Promise.all([read('getAttendanceEmployeeMaster'),read('getScheduleDataSecure',{month})]);if(!Array.isArray(d.employees)||!Array.isArray(roster.leaveRecords)||!Array.isArray(roster.schedules))throw Error('管理資料不完整');return {ok:true,confirmedFresh:true,data:d,roster,month};},
applySnapshot:async s=>{employees=mergeCloudEmployees(s.data.employees.map(normalizeEmployeeIdentifiers));leaveRecords=s.roster.leaveRecords;schedules=(schedules||[]).filter(r=>String(r.month||'')!==s.month).concat(s.roster.schedules);initDropdowns();renderAdminEmployeeTable();p79RenderOnlyVisibleAttendanceView();return true;}}
;
})(window);
},"leave":function(){(function(g){'use strict';
g.P79ManagementContext={system:'leave',identity:()=>leaveRequestToken(),gas:()=>GAS_URL,token:()=>leaveRequestToken(),canRead:()=>!!adminSession&&leaveAccess!=='none',hasPendingChanges:()=>!!(adminCreateLeaveBusy||p79LeaveHandoffBusy),scope:()=>({}),
readFresh:async read=>{const d=await read('getLeaveData');if(!Array.isArray(d.employees)||!Array.isArray(d.leaveRecords)||!Array.isArray(d.leaveCoverAssignments))throw Error('請假資料不完整');return {ok:true,confirmedFresh:true,data:d};},
applySnapshot:async snapshot=>{const d=snapshot.data;employees=d.employees;leaveRecords=d.leaveRecords;window.p79LeaveCoverAssignments=d.leaveCoverAssignments;populateDepartments();renderAll();setStatus('☁️ 跨系統更新已讀回核對','');return true;}}
;
})(window);
},"schedule":function(){(function(g){'use strict';
g.P79ManagementContext={system:'schedule',identity:()=>String(currentPort79SsoToken())+'|'+String(document.getElementById('month-picker')?.value||''),gas:()=>GAS_URL,token:()=>currentPort79SsoToken(),
canRead:()=>!!currentPort79SsoToken()&&scheduleAccessLevel!=='none',
hasPendingChanges:()=>!!(port79ScheduleDirty||scheduleSaveTimer||personnelSaveTimer||port79ScheduleWriteInFlight||Date.now()<p79ScheduleProtectLocalUntil),
scope:()=>({month:currentScheduleMonthKey()}),
readFresh:async(read)=>{const roster=await read('getScheduleDataSecure',{month:currentScheduleMonthKey()});if(!Array.isArray(roster.schedules)||!Array.isArray(roster.employees)||!Array.isArray(roster.leaveRecords)||!Array.isArray(roster.leaveCoverAssignments))throw Error('班表資料不完整');return {ok:true,confirmedFresh:true,roster};},
applySnapshot:async snapshot=>{const data=snapshot.roster;if(data.scheduleAccessLevel)scheduleAccessLevel=normalizeSchedulePermissionLevel(data.scheduleAccessLevel,'none');        const cloudEmployees = (data.employees || [])
          .filter(emp => String(emp.empId || '').toUpperCase() !== 'ADMIN' && (emp.empId || emp.name))
          .map(emp => ({
            id: String(emp.empId || '').trim().toUpperCase(),
            name: emp.name || '',
            dept: String(emp.dept || '').trim(),
            role: emp.jobTitle || emp.deptDetail || emp.role || emp.dept || 'AQC',
            group: emp.group || '不分組',
            lockType: emp.lockType || 'ROTATION',
            order: scheduleOrderNumber(emp.order),
            employmentStatus: emp.employmentStatus || 'active',
            startDate:emp.startDate||'',reportingDate:emp.reportingDate||'',
            terminationDate: emp.terminationDate || '',
            lastWorkDate: emp.lastWorkDate || '',
            attendanceNo: String(emp.attendanceNo || emp.attNo || emp.attendanceId || '').trim().toUpperCase(),
            attNo: String(emp.attNo || emp.attendanceNo || emp.attendanceId || '').trim().toUpperCase()
          }))
          .filter(emp => emp.id);

        if (cloudEmployees.length) employeeMasterBase = cloudEmployees.map(cloneScheduleEmployee);
        else if (!employeeMasterBase.length) employeeMasterBase = employees.map(cloneScheduleEmployee);

        leaveRecords = Array.isArray(data.leaveRecords) ? data.leaveRecords : [];
        leaveCoverAssignments = Array.isArray(data.leaveCoverAssignments) ? data.leaveCoverAssignments : [];
        // 不使用排班快照的空值清除出勤中狀態；由即時考勤端點更新。
        monthlyScheduleData = {};
        monthlyScheduleMeta = {};
        schedulePersonnelOverrides = {};
        scheduleRoleGroupOptions = {};

        (data.schedules || []).forEach(row => {
          const empId = String(row.empId || '').trim().toUpperCase();
          const month = String(row.month || '').trim();
          const schedule = row.schedule && typeof row.schedule === 'object' ? Object.assign({}, row.schedule) : {};
          if (!empId) return;

          const personnel = schedule.__personnel && typeof schedule.__personnel === 'object'
            ? Object.assign({}, schedule.__personnel)
            : {};
          const groupRole=String(personnel.role||row.role||'');
          if(month&&groupRole&&Array.isArray(personnel.groupOptions)){
            if(!scheduleRoleGroupOptions[month])scheduleRoleGroupOptions[month]={};
            scheduleRoleGroupOptions[month][groupRole]=personnel.groupOptions.filter(g=>typeof g==='string'&&g.trim());
          }
          if (month) {
            if (!schedulePersonnelOverrides[month]) schedulePersonnelOverrides[month] = {};
            schedulePersonnelOverrides[month][empId] = {
              role: String(personnel.role || row.role || ''),
              group: String(personnel.group || row.group || '不分組'),
              lockType: String(personnel.lockType || 'ROTATION'),
              order: scheduleOrderNumber(personnel.order ?? row.order)
            };
          }
          delete schedule.__personnel;

          if (!monthlyScheduleData[empId]) monthlyScheduleData[empId] = {};
          if (!monthlyScheduleMeta[empId]) monthlyScheduleMeta[empId] = {};
          const meta = schedule.__meta && typeof schedule.__meta === 'object' ? schedule.__meta : {};
          delete schedule.__meta;
          Object.assign(monthlyScheduleData[empId], schedule);
          Object.assign(monthlyScheduleMeta[empId], meta);
        });

        applySchedulePersonnelOverrides(currentScheduleMonthKey());

        const groupSet = new Set(['不分組']);
        (data.scheduleGroups || []).forEach(g => { if(g) groupSet.add(g); });
        employees.forEach(emp => { if(emp.group) groupSet.add(emp.group); });

        // V10.24：即使 ScriptProperties 的組別清單被洗掉，
        // 仍從歷史月份的人員分組撈回 A組/B組/C組等有效組別。
        Object.values(schedulePersonnelOverrides || {}).forEach(monthMap => {
          Object.values(monthMap || {}).forEach(ov => {
            const g = String(ov?.group || '').trim();
            if (scheduleGroupIsMeaningful(g)) groupSet.add(g);
          });
        });

        groupSet.delete('不輪班');
        availableGroups = [...groupSet, '不輪班'];

        cloudLoaded = true;
        saveAllDataToLocalStorage();

buildRoleTabsAndRender();renderTodaySchedulePanel();return true;}
};
})(window);
},"workhours":function(){(function(g){'use strict';
g.P79ManagementContext={system:'workhours',identity:()=>currentPort79SsoToken()+'|'+getRequestedAttendanceCloudMonth()+'|'+(document.getElementById('overtimeMonthFilter')?.value||''),gas:()=>getActiveGasUrl(),token:()=>currentPort79SsoToken(),canRead:()=>canReadAdminCloudData(),hasPendingChanges:()=>!!(window.p79V5GetStatus?.().pending||cloudOutboxBusy||cloudDirectWriteBusy>0),
scope:()=>({month:document.getElementById('overtimeMonthFilter')?.value||getRequestedAttendanceCloudMonth()}),
readFresh:async read=>{const selected=document.getElementById('overtimeMonthFilter')?.value||getRequestedAttendanceCloudMonth();if(!/^\d{4}-\d{2}$/.test(selected))throw Error('請先選擇單一月份再同步');const [core,roster]=await Promise.all([read('getAttendanceCoreData',{month:selected}),read('getScheduleDataSecure',{month:selected})]);if(!Array.isArray(core.employees)||!Array.isArray(core.records)||!Array.isArray(roster.schedules)||!Array.isArray(roster.leaveCoverAssignments))throw Error('加班資料不完整');return {ok:true,confirmedFresh:true,core,roster,month:selected,at:Date.now()};},
applySnapshot:async s=>{employees=mergeCloudEmployees(s.core.employees.map(normalizeEmployeeIdentifiers));if(currentEmp){const mine=employees.find(e=>String(e.empId).toUpperCase()===String(currentEmp.empId).toUpperCase());if(mine)currentEmp={...currentEmp,...mine};}leaveRecords=Array.isArray(s.core.leaveRecords)?s.core.leaveRecords:leaveRecords;
// Core replies may be partial. Keep attendance records under the existing dedicated sync owner; never replace a month from this management refresh.
schedules=(schedules||[]).filter(r=>normalizeScheduleMonthKey(r.month)!==s.month).concat(s.roster.schedules);
p79WorkOvertimeMonths.set(s.month,{token:currentPort79SsoToken(),at:Date.now(),pending:false,ready:true,rows:s.roster.schedules,covers:s.roster.leaveCoverAssignments,revision:s.roster.revision,canDelete:s.roster.overtimeLinkedDelete===true});p79OvertimeCalculationCache=null;initDropdowns();renderOvertimeStats();return true;}}
;
})(window);
},"efficiency":function(){(function(g){'use strict';
g.P79ManagementContext={system:'efficiency',identity:()=>loadGcSession()+'|'+JSON.stringify(efficiencyCloudScopeParams()),gas:()=>getGasUrl(),token:()=>loadGcSession(),canRead:()=>requireEfficiencyAccess(),hasPendingChanges:()=>readQueue().length>0||!!cloudBusy||!!port79ShipAutoSyncBusy,
scope:()=>efficiencyCloudScopeParams(),readFresh:async read=>{const [d,p]=await Promise.all([read('gcGetData',efficiencyCloudScopeParams()),read('gcGetEmployees')]);if(!Array.isArray(d.records)||!Array.isArray(d.shipMasters)||!Array.isArray(p.employees))throw Error('效率資料不完整');return {ok:true,confirmedFresh:true,data:d,people:p.employees};},
applySnapshot:async s=>{const d=s.data;systemEmployees=s.people.map(normalizeCloudEmployee).filter(Boolean);if(Array.isArray(d.groups))groups=d.groups;if(Array.isArray(d.assignments))assignments=mergeAssignmentsKeepLocal(assignments,d.assignments);if(d.shipMasters.length)shipMasters=canonicalShipMasters(mergeShipMastersPreferComplete(shipMasters,d.shipMasters.map(sanitizeShipMasterMetrics)));if(d.records.length)records=mergeCloudRecordsWithLocal(d.records,records);invalidateWorkloadIndex();populateSelects();renderVesselSummary();renderEfficiencyTabFast();updateEmployeeDataState('人資員工主檔');return true;}}
;
})(window);
},"hr":function(){(function(g){'use strict';
g.P79ManagementContext={system:'hr',identity:()=>token,gas:()=>GAS_URL,token:()=>token,canRead:()=>!!session&&!!token&&hrAccess!=='none',hasPendingChanges:()=>false,scope:()=>({}),
readFresh:async read=>{const d=await read('hrGetEmployees');if(!Array.isArray(d.employees))throw Error('人資資料不完整');return {ok:true,confirmedFresh:true,data:d};},
applySnapshot:async snapshot=>{p79CanonicalOrgOptions=null;p79ApplyHrEmployeesPayload(snapshot.data,false,'cloud');return true;}}
;
})(window);
}};if(registers[sys])registers[sys]();})();
(function(g){
'use strict';
if(g.P79ManagementPageBridge)return;
const context=g.P79ManagementContext,api=g.P79ManagementSync,factory=g.P79ManagementAdapterFactory;
if(!context||!api||!factory)return;
let stopped=false,suspended=false,binding=null,timer=null,bootTimer=null,attempts=0,bar=null,pendingState=null,viewRevision=0;
const activeReads=new Set();
const topicNames={people:'人員',organization:'部門職稱',permissions:'權限',leave:'請假',cover:'代班',schedule:'班表',overtime:'加班',attendance:'考勤',efficiency:'效率',history:'歷史資料'};
function roleAllowed(){try{const s=JSON.parse(sessionStorage.getItem('admin_session')||sessionStorage.getItem('port79_user_session')||'null');return s?.punchOnly!==true&&['admin','superadmin'].includes(String(s?.adminRole||s?.role||'').toLowerCase())}catch(_){return false;}}
function openForm(){
 const el=document.activeElement;if(el&&el.matches?.('input,select,textarea,[contenteditable="true"]'))return true;
 return [...document.querySelectorAll('dialog[open],[role="dialog"],.modal')].some(el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden');
}
function editing(){try{return context.hasPendingChanges()!==false||openForm()}catch(_){return true;}}
function readScope(){return JSON.stringify(context.scope?.()||{});}
async function readFresh(action,params={}){
 if(stopped||suspended)throw Error('頁面已離開');
 const originIdentity=context.identity(),revision=viewRevision,scope=readScope(),raw=context.gas(),tk=context.token();if(!tk)throw Error('登入尚未完成');
 const url=new URL(raw,location.href);if(url.origin!=='https://script.google.com'||!url.pathname.startsWith('/macros/s/'))throw Error('雲端來源不正確');
 url.searchParams.set('action',action);url.searchParams.set('token',tk);url.searchParams.set('gcToken',tk);url.searchParams.set('_',Date.now());Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,String(v)));
 const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),12000);activeReads.add(ctl);
 try{const response=await fetch(url.toString(),{method:'GET',cache:'no-store',signal:ctl.signal});const data=await response.json();
  if(!response.ok||data?.ok!==true||data.retryable)throw Error(data?.error||'雲端未確認讀取');
  if(stopped||suspended||revision!==viewRevision||context.identity()!==originIdentity||readScope()!==scope||!context.canRead())throw Error('頁面、登入、權限或範圍已變更');return data;
 }finally{clearTimeout(timeout);activeReads.delete(ctl);}
}
function ensureBar(){
 if(bar)return bar;bar=document.createElement('div');bar.id='p79ManagementSyncBar';bar.setAttribute('role','status');bar.setAttribute('aria-live','polite');
 bar.style.cssText='display:none;align-items:center;justify-content:space-between;gap:10px;padding:9px 16px;background:#eff6ff;color:#1e3a8a;border-bottom:1px solid #93c5fd;font:700 13px system-ui;flex-wrap:wrap';
 const label=document.createElement('span');label.dataset.label='1';bar.appendChild(label);const button=document.createElement('button');button.type='button';button.textContent='更新相關資料';button.style.cssText='padding:6px 12px;border:1px solid #60a5fa;border-radius:8px;background:white;color:#1d4ed8;font:inherit';button.onclick=()=>void synchronize();bar.appendChild(button);
 const header=document.getElementById('p79SevenTop');if(header)header.after(bar);else document.body.prepend(bar);return bar;
}
function notify(state){
 pendingState=state;if(stopped||suspended||!roleAllowed()||!context.canRead()){if(bar)bar.style.display='none';return;}
 const b=ensureBar();b.style.display='flex';const names=state.pending.map(t=>topicNames[t]||t).join('、');if(!state.pending.length){b.dataset.confirmed=String(Date.now());b.querySelector('[data-label]').textContent='跨系統更新已讀回核對';b.querySelector('button').disabled=false;return;}b.querySelector('[data-label]').textContent=state.running?'正在核對跨系統最新資料…':names+' 有更新'+(editing()?'｜正在編輯，保留內容並延後套用':'｜準備同步');b.querySelector('button').disabled=state.running;
 if(state.pending.length&&!state.running&&!editing()&&document.visibilityState==='visible'){clearTimeout(timer);timer=setTimeout(()=>void synchronize(),500);}
}
async function synchronize(){
 clearTimeout(timer);timer=null;if(stopped||suspended||!binding||!roleAllowed()||editing()||document.visibilityState!=='visible')return;
 const result=await binding.engine.synchronize();
 if(!stopped&&!suspended&&result.ok!==true&&bar){clearTimeout(timer);timer=null;bar.querySelector('[data-label]').textContent=result.reason==='editing'?'正在編輯，保留內容並延後更新':'跨系統更新尚未確認'+(result.errorType?'（'+result.errorType+'）':'')+'｜保留目前資料，可按更新重試';}
}
function boot(){
 if(stopped||suspended||binding||!roleAllowed())return;
 if(!context.canRead()){if(++attempts<30)bootTimer=setTimeout(boot,1000);return;}
 const adapter=factory.makeAdapter(context.system,{...context,isFormOpen:openForm,identity:()=>context.identity()+'|'+readScope()+'|'+viewRevision,readFresh:()=>context.readFresh(readFresh)});
 const backend=new URL(context.gas(),location.href);
 binding=api.attach({receiveOwn:g.P79ManagementTestMode===true,system:context.system,isManager:()=>roleAllowed()&&adapter.isManager(),isEditing:adapter.isEditing,refresh:adapter.refresh,notify,gasOrigin:backend.origin,gasPath:backend.pathname,channelKey:g.P79ManagementTestMode?'p79-management-test-v1':'p79-management-revision-v1',makeId:()=>context.system+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),autoRefreshSafe:()=>!editing()});
 g.P79ManagementPageBridge={binding,adapter,readFresh,synchronize};if(g.P79ManagementTestMode){const state=document.getElementById('p79StageState');if(state)state.textContent='管理員已驗證｜共用介面已接入｜驗收版 20261017.1';}
}
const resume=()=>{if(stopped||suspended)return;if(binding&&pendingState?.pending.length&&editing()){if(bar)bar.querySelector('[data-label]').textContent='正在編輯，保留內容並延後更新';return;}if(!binding)boot();else if(pendingState?.pending.length&&!editing()){clearTimeout(timer);timer=setTimeout(()=>void synchronize(),500);}};
const changed=()=>{viewRevision++;};document.addEventListener('input',changed,true);document.addEventListener('change',changed,true);document.addEventListener('focusout',resume);document.addEventListener('visibilitychange',resume);g.addEventListener('focus',resume);
function pagehide(event){
 suspended=true;viewRevision++;clearTimeout(timer);clearTimeout(bootTimer);timer=null;bootTimer=null;
 activeReads.forEach(ctl=>ctl.abort());activeReads.clear();
 if(event.persisted)return;
 stopped=true;binding?.dispose();g.P79ManagementPageBridge?.adapter?.dispose();
 document.removeEventListener('input',changed,true);document.removeEventListener('change',changed,true);document.removeEventListener('focusout',resume);document.removeEventListener('visibilitychange',resume);g.removeEventListener('focus',resume);g.removeEventListener('pagehide',pagehide);g.removeEventListener('pageshow',pageshow);
}
function pageshow(event){if(event.persisted&&!stopped){suspended=false;resume();}}
g.addEventListener('pagehide',pagehide);g.addEventListener('pageshow',pageshow);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);

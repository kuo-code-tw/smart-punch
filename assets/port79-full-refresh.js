(function(g){
'use strict';
function createReader({context,fetchImpl,identity,assertCurrent,timeoutMs=30000}){
 return async function read(action,params={}){
  assertCurrent();const url=new URL(context.gas());if(url.origin!=='https://script.google.com'||!url.pathname.startsWith('/macros/s/'))throw Error('雲端來源設定不正確');
  const token=context.token();if(!token)throw Error('請先登入');
  url.searchParams.set('action',action);url.searchParams.set('token',token);url.searchParams.set('gcToken',token);url.searchParams.set('fresh','1');url.searchParams.set('_',String(Date.now()));
  Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,String(value)));
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeoutMs);
  try{const response=await fetchImpl(url.toString(),{method:'GET',cache:'no-store',signal:ctl.signal});const data=await response.json();
   if(!response.ok||data?.ok!==true||data.retryable||data.fromCache===true)throw Error(data?.error||'雲端尚未確認最新資料');
   assertCurrent();if(context.identity()!==identity)throw Error('登入或查詢範圍已變更，請再重新整理');return data;
  }finally{clearTimeout(timer);}
 };
}
function createRunner({check,run,notify=()=>{},setFresh=()=>{}}){
 let running=null;
 return function refresh(){if(running)return running;
  running=Promise.resolve().then(async()=>{check();setFresh(true);notify('loading','正在重新讀取正式雲端資料…');try{
    const result=await run();
    if(result!==true&&result?.ok!==true)throw Error('雲端資料尚未全部更新');
    check();
    notify(result?.warning?'warning':'success',
      result?.summary||'正式雲端資料已讀取並更新 '+new Date().toLocaleTimeString('zh-TW',{hour12:false}));
    return true;
   }catch(error){notify('error','更新未完成：'+(error?.name==='AbortError'?'雲端讀取逾時，請重試':String(error?.message||error)));return false;}finally{setFresh(false);}}).catch(error=>{notify('error',String(error?.message||error));return false;}).finally(()=>{running=null;});return running;
 };
}
// Count currently effective reports from actual freshly read GAS rows. A prior
// cancellation does not invalidate a later report with another report ID.
function auditRosterOvertime(rows,date=''){
 const found=new Set(),cancelled=new Set();
 for(const row of Array.isArray(rows)?rows:[]){
  for(const [day,meta] of Object.entries(row?.schedule?.__meta||{})){
   if(date&&day!==date)continue;
   const emp=String(row.empId||'').trim().toUpperCase();
   const revoked=new Set((meta?.overtimeRevocations||[]).filter(x=>x?.confirmed===true).map(x=>String(x.reportId||'')));
   for(const old of revoked)if(old)cancelled.add(emp+'|'+day+'|'+old);
   for(const report of [meta?.overtimeReport,...(Array.isArray(meta?.overtimeReports)?meta.overtimeReports:[])]){
    const id=String(report?.id||'').trim();
    if(id&&meta?.overtimeExcluded!==true&&!revoked.has(id))found.add(emp+'|'+day+'|'+id);
   }
  }
 }
 return {active:found.size,cancelled:cancelled.size};
}
const api={createReader,createRunner,auditRosterOvertime};if(typeof module==='object'&&module.exports){module.exports=api;return;}g.P79FullRefresh=api;
const sys=()=>document.body.dataset.p79System||'',element=id=>document.getElementById(id);
function isEditing(){return [...document.querySelectorAll('dialog[open],[role="dialog"],.modal')].some(node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden');}
function check(){const context=g.P79ManagementContext;if(sys()==='history'){if(typeof g.p79RefreshHistoryAll!=='function')throw Error('歷史資料頁仍在初始化');return;}
 if(!context||!context.canRead())throw Error('請先登入並確認本系統查詢權限');
 if(context.hasPendingChanges()!==false||isEditing())throw Error('有編輯中或尚未儲存的內容，請先完成儲存再重新整理，原資料已保留');}
function notify(state,message){const b=element('p79FullRefreshButton'),status=element('p79FullRefreshStatus');if(b){b.disabled=state==='loading';b.textContent=state==='loading'?'↻ 更新中…':'↻ 重新整理';}if(status){status.textContent=message;status.dataset.state=state;}}
async function refreshCurrentSystem(){
 if(sys()==='history'){await g.p79RefreshHistoryAll();return true;}
 const context=g.P79ManagementContext,identity=context.identity(),scope=JSON.stringify(context.scope?.()||{});
 const assertCurrent=()=>{check();if(context.identity()!==identity||JSON.stringify(context.scope?.()||{})!==scope)throw Error('查詢範圍已變更，請重新整理目前範圍');};
 const read=createReader({context,fetchImpl:(...args)=>g.fetch(...args),identity,assertCurrent});
 const snapshot=await context.readFresh(read,['people','organization','permissions','leave','cover','schedule','overtime','attendance','efficiency','history']);
 assertCurrent();if(snapshot?.ok!==true||snapshot.confirmedFresh!==true||snapshot.fromCache)throw Error('雲端回覆不完整');
 if(await context.applySnapshot(snapshot)!==true)throw Error('最新資料尚未套用完成');
 if(sys()==='attendance'||sys()==='workhours'){
  if(typeof p79StartupAttendanceCurrentMonthSync!=='function'||
     await p79StartupAttendanceCurrentMonthSync(false)!==true)
    throw Error('考勤月份明細未完成正式雲端讀取，沒有更新成功');
  assertCurrent();
  if(sys()==='attendance'){
   const month=String(snapshot.month||context.scope?.().month||'');
   const roster=snapshot.roster;
   if(!/^\d{4}-\d{2}$/.test(month)||!Array.isArray(roster?.schedules))
    throw Error('本次沒有取得所選月份的正式班表，沒有更新成功');
   // The existing admin adapter updates employees and leave/schedule tables,
   // but does not update the overtime-date indicator's separate month cache.
   // Refresh that cache from the same authenticated, no-store GAS response.
   const months=typeof p79AttendanceOvertimeMonths!=='undefined'?p79AttendanceOvertimeMonths:null;
   if(!months||typeof months.set!=='function')throw Error('加班日期資料尚未就緒，沒有更新成功');
   const auditToken=typeof getAttendanceEmployeeMasterToken==='function'
       ?String(getAttendanceEmployeeMasterToken()||'').trim():String(context.token()||'');
   if(!auditToken||String(context.token()||'')!==identity)
    throw Error('登入驗證已變更，沒有更新加班申報');
   months.set(month,{token:auditToken,at:Date.now(),ready:true,pending:false,
     rows:roster.schedules,people:roster.employees||snapshot.data?.employees||[],
     covers:roster.leaveCoverAssignments||[],revision:roster.revision,source:'official-fresh'});
   p79RenderOnlyVisibleAttendanceView();
   assertCurrent();
   const selected=typeof recordsSelectedDateKey==='undefined'?'':String(recordsSelectedDateKey||'');
   const scopeDate=selected.startsWith(month+'-')?selected:'';
   const report=auditRosterOvertime(roster.schedules,scopeDate);
   const dateLabel=scopeDate||month;
   const warning=report.active===0&&report.cancelled>0;
   return {ok:true,warning,summary:
    dateLabel+' 已重新讀取正式班表 '+roster.schedules.length+' 筆；'+
    '有效加班申報 '+report.active+' 筆、取消歷史 '+report.cancelled+' 筆。'+
    (warning?'正式雲端快照仍未顯示有效申報，不能當成已核對成功；請檢查 GAS 歷史同步。':'考勤月份已完成同步，未修改既有申報或取消歷史。')};
  }
  p79RenderOnlyVisibleAttendanceView();
  renderAttendanceStatsTable();renderOvertimeStats();
  return {ok:true,summary:String(snapshot.month||'目前月份')+' 考勤與加班統計已從正式雲端重新讀取並更新。'};
 }else if(sys()==='schedule'){
  if(typeof scheduleCanShowLiveAttendance==='function'&&scheduleCanShowLiveAttendance()&&await refreshScheduleAttendanceState(true)!==true)throw Error('班表已更新，但即時出勤狀態尚未完成更新');
 }else if(sys()==='hr'){
  await p79ReadCanonicalOrgOptions();assertCurrent();p79ApplyHrEmployeesPayload(snapshot.data,false,'cloud');
 }else if(sys()==='efficiency'){
  const active=activeEfficiencyTabName(),month=element(active==='dispatch'?'dispatchMonth':active==='ranking'?'rankingMonth':'filterMonth')?.value||context.scope?.().month;
  if(/^\d{4}-\d{2}$/.test(month||'')){
   const history=await read('historyGetMonthData',{type:'vessel',month});if(!Array.isArray(history.records)||!Array.isArray(history.shipMasters))throw Error('船舶歷史明細不完整');mergeEfficiencyCloudData(history);
   const roster=await read('getScheduleDataSecure',{month});currentOperationScheduleStore().apply(month,roster);operationScheduleReads.set(month,{at:Date.now(),status:'ready'});
  }
  invalidateWorkloadIndex();renderEfficiencyTabFast();saveLocal();
 }
 assertCurrent();return true;
}
const refresh=createRunner({check,run:refreshCurrentSystem,notify,setFresh:value=>{g.P79FullRefreshRunning=value;}});api.refresh=refresh;g.p79FullRefresh=refresh;
function mount(){if(element('p79FullRefreshButton'))return;const host=document.querySelector('#p79SevenTop .action');if(!host)return;
 const box=document.createElement('div');box.style.cssText='display:flex;align-items:center;gap:6px;flex-wrap:wrap';
 const button=document.createElement('button');button.id='p79FullRefreshButton';button.type='button';button.textContent='↻ 重新整理';button.title='手動讀取目前月份正式考勤、排班與加班申報；未完成會顯示錯誤，不會覆蓋未儲存資料';button.addEventListener('click',refresh);
 const status=document.createElement('span');status.id='p79FullRefreshStatus';status.setAttribute('role','status');status.style.cssText='font-size:12px;max-width:320px;white-space:normal';box.append(button,status);host.prepend(box);
}
mount();const observer=new MutationObserver(mount);observer.observe(document.documentElement,{childList:true,subtree:true});
})(typeof window==='undefined'?globalThis:window);

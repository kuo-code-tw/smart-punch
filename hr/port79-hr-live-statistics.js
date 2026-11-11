/* Authorized, read-only sources only; never cache HR data to localStorage or change personnel records. */
(function(){
'use strict';
const M=window.P79HrVerifiedMetrics;
if(!M)return;
const $=id=>document.getElementById(id),cache=new Map();let loadId=0,inFlightKey='',lastRefresh=0,lastAuthIdentity='';
function sess(){try{return JSON.parse(sessionStorage.getItem('port79_user_session')||sessionStorage.getItem('admin_session')||'null')}catch(e){return null}}
function access(key,action){
 const s=sess(),role=String(s?.adminRole||s?.role||s?.actualAdminRole||'').toLowerCase();
 if(!s||s.punchOnly||!['admin','superadmin'].includes(role))return false;
 if(role==='superadmin')return true;
 if(!['view','manage'].includes(s.systemPermissions?.[key]))return false;
 const fine=s.finePermissions?.[key];
 return !action||fine?.[action]!==false;
}
function emp(){try{return typeof employees!=='undefined'&&Array.isArray(employees)?employees:[]}catch(e){return []}}
function ready(){try{return typeof p79HrCloudDataReady!=='undefined'&&p79HrCloudDataReady}catch(e){return false}}
function activeToken(){
 const found=sessionStorage.getItem('port79_user_token')||sessionStorage.getItem('port79_admin_token')||'';
 // The HR page itself owns the verified management token; never mix login identities.
 try{if(typeof token!=='undefined'&&token&&found&&String(token)!==String(found))return ''}catch(e){return ''}
 return found;
}
function apiBase(){
 let val='';
 try{val=String(sessionStorage.getItem('port79_gas_url')|| (typeof GAS_URL!=='undefined'?GAS_URL:'')).trim()}catch(e){}
 return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(val)?val:'';
}
function selection(){return M.date($('p79rWorkDate')?.value)||M.date(new Date().toISOString().slice(0,10))}
function todayTaipei(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function identity(){const s=sess();return String(s?.empId||'')+'|'+activeToken()+'|'+selection()}
function sourceText(id,msg){const el=$(id+'Sub');if(el)el.textContent=msg}
function readFailure(result){
 const e=result?.reason;
 if(e?.name==='AbortError')return '雲端回應逾時';
 if(/權限|授權|登入|token/i.test(String(e?.message||'')))return '雲端授權未確認';
 if(/fetch|network/i.test(String(e?.message||'')))return '雲端連線未完成';
 return '雲端資料未確認';
}
function setVal(id,num,sub){
 const el=$(id);if(el)el.textContent=num;
 if(sub)sourceText(id,sub);
}
async function get(action,month,auth,ms=30000){
 const base=apiBase();if(!base)throw Error('未確認正式資料服務網址');
 const url=new URL(base);
 url.searchParams.set('action',action);
 // Leave's existing endpoint returns the full ledger; filter dates locally.
 if(action!=='getLeaveData')url.searchParams.set('month',month);
 url.searchParams.set('token',auth);
 url.searchParams.set('gcToken',auth);
 url.searchParams.set('_',String(Date.now()));
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
 try{
  const response=await fetch(url.toString(),{cache:'no-store',redirect:'follow',signal:controller.signal});
  if(!response.ok)throw Error('正式資料來源 HTTP '+response.status);
  const body=await response.text();
  if(/^\s*<!doctype html|^\s*<html/i.test(body))throw Error('正式服務返回登入頁，而非授權 JSON');
  const data=JSON.parse(body);
  if(data?.ok!==true)throw Error(data?.error||'資料來源未授權或回傳失敗');
  if(data.month&&String(data.month)!==month)throw Error('正式資料月份不一致');
  return data;
 }finally{clearTimeout(timer)}
}
function leaveRows(result){
 if(!result||!Array.isArray(result.employees)||!Array.isArray(result.leaveRecords))throw Error('核准請假或人資名冊不完整');
 return result.leaveRecords;
}
function officialSchedules(result){
 if(!result||!Array.isArray(result.schedules))throw Error('正式班表不完整');
 return result.schedules;
}
function attendanceRows(result){
 if(!result||!Array.isArray(result.records))throw Error('正式打卡紀錄不完整');
 return result.records;
}
function display(payload,scope,day){
 if(!payload)return;
 const month=day.slice(0,7);
 const all=emp(),staffIds=all.map(e=>String(e.empId||'').trim().toUpperCase()).filter(Boolean);
 const leaveResult=payload.leave?.status==='fulfilled'?payload.leave.value:null;
 const scheduleResult=payload.schedule?.status==='fulfilled'?payload.schedule.value:null;
 const attendanceResult=payload.attendance?.status==='fulfilled'?payload.attendance.value:null;
 let leave=null,ot=null,attendance=null;
 if(scope.leave&&leaveResult){
  try{leave=M.approvedLeaveCount(leaveRows(leaveResult),month,staffIds);
   if(leave.ready)setVal('p79rLeaves',String(leave.count),'正式核准請假申請數（依可檢視範圍）');
   else sourceText('p79rLeaves','核准請假紀錄未完全核對');
  }catch(e){sourceText('p79rLeaves','核准請假資料不完整')}
 }else if(scope.leave)sourceText('p79rLeaves','正式請假資料暫不可用：'+readFailure(payload.leave));
 else sourceText('p79rLeaves','目前帳號沒有請假資料檢視權限');
 if(scope.schedule&&scope.workhours&&scheduleResult){
  try{ot=M.officialOvertime(officialSchedules(scheduleResult),month,staffIds);
   if(ot.ready)setVal('p79rOvertime',ot.hours.toFixed(1)+' 小時','正式申報，不含預排／撤銷');
   else sourceText('p79rOvertime','申報資料含待核或不完整紀錄');
  }catch(e){sourceText('p79rOvertime','正式班表資料不完整')}
 }else if(scope.schedule&&scope.workhours)sourceText('p79rOvertime','正式加班申報讀取失敗：'+readFailure(payload.schedule));
 else sourceText('p79rOvertime','需要班表與工時資料檢視權限');
 if(scope.attendance&&scope.schedule&&scope.leave&&attendanceResult&&scheduleResult&&leaveResult){
  try{attendance=M.attendanceRate({
    records:attendanceRows(attendanceResult),schedules:officialSchedules(scheduleResult),
    leaveRecords:leaveRows(leaveResult),employees:all,day
   });
   if(attendance.ready){
    setVal('p79rAttendance',attendance.percent===null?'—':attendance.percent.toFixed(1)+'%',
      attendance.expected+' 人應到／'+attendance.clocked+' 人已打上班卡（當日）');
    const donut=$('p79rActiveDonut')?.closest('.p79r-donut');
    if(donut)donut.style.background='conic-gradient(#2b85e9 '+(attendance.percent??0)+'%,#e1edf8 0)';
   }else sourceText('p79rAttendance',attendance.reason||'當日打卡核對尚未完成');
  }catch(e){sourceText('p79rAttendance','當日打卡與班表未核對完成')}
 }else if(scope.attendance&&scope.schedule&&scope.leave)sourceText('p79rAttendance','正式打卡／班表／請假尚未讀齊');
 else sourceText('p79rAttendance','需要考勤、排班與請假檢視權限');
}
function reset(msg){
 setVal('p79rAttendance','—',msg||'等待正式考勤');
 setVal('p79rLeaves','—',msg||'等待核准請假');
 setVal('p79rOvertime','—',msg||'等待正式加班申報');
}
async function refresh(force){
 if(!ready())return;
 const day=selection(),month=day.slice(0,7),auth=activeToken(),startIdentity=identity();
 if(lastAuthIdentity&&lastAuthIdentity!==String(sess()?.empId||'')+'|'+auth){cache.clear();loadId++;inFlightKey=''}
 lastAuthIdentity=String(sess()?.empId||'')+'|'+auth;
 if(!auth||!apiBase()||!sess())return reset('沒有已驗證的雲端登入權杖');
 const scope={attendance:access('attendance','records.view'),schedule:access('schedule','records.view'),
 leave:access('leave','records.view'),workhours:access('workhours','overtime.view')};
 const key=startIdentity+'|'+month;
 if(inFlightKey===key)return;
 const hit=cache.get(key);
 if(!force&&hit&&Date.now()-hit.at<120000){display(hit.data,scope,day);return}
 if(!force&&Date.now()-lastRefresh<1000)return;
 lastRefresh=Date.now();inFlightKey=key;const current=++loadId;
 reset('正式資料核對中…');
 const read=async(key,enabled,action)=>{
  if(!enabled)throw Error('目前沒有資料檢視權限');
  try{return await get(action,month,auth)}catch(error){
   // A bounded read retry matches the existing leave page's slow-cloud flow.
   // Never retry after an account/date change or an authorization failure.
   if(current!==loadId||identity()!==startIdentity||/權限|授權|登入|token/i.test(String(error.message)))throw error;
   return get(action,month,auth);
  }
 };
 const result=await Promise.allSettled([
  read('leave',scope.leave,'getLeaveData'),
  read('schedule',scope.schedule,'getScheduleDataSecure'),
  read('attendance',scope.attendance,'getAttendanceMainDirect')
 ]);
 if(current!==loadId||identity()!==startIdentity||!ready())return;
 inFlightKey='';
 const data={leave:result[0],schedule:result[1],attendance:result[2]};
 cache.set(key,{at:Date.now(),data});
 if(cache.size>8)cache.delete(cache.keys().next().value);
 display(data,scope,day);
}
const original=window.p79HrDashRender;
window.p79HrDashRender=function(){
 original?.();
 const day=selection(),key=identity()+'|'+day.slice(0,7),entry=cache.get(key);
 if(entry){display(entry.data,{
  attendance:access('attendance','records.view'),schedule:access('schedule','records.view'),
  leave:access('leave','records.view'),workhours:access('workhours','overtime.view')
 },day)}
 if(ready())void refresh(false);
};
window.P79HrStatistics={refresh:()=>refresh(true),access,selection,todayTaipei};
document.addEventListener('DOMContentLoaded',function(){
 const date=$('p79rWorkDate');
 if(date)date.addEventListener('change',function(){loadId++;inFlightKey='';reset('正在更換統計日期');void refresh(true)});
 if(ready())void refresh(false);
});
})();

/* Authorized, read-only sources only; never cache HR data to localStorage or change personnel records. */
(function(){
'use strict';
const M=window.P79HrVerifiedMetrics;
if(!M)return;
const $=id=>document.getElementById(id),cache=new Map(),sourceCache=new Map(),sourceInflight=new Map(),timings=[];
const CACHE_TTL_MS=120000;let loadId=0,inFlightKey='',lastAuthority='';
const RECOVERY_DELAYS=[5000,15000,30000];let recoveryTimer=null,recoveryKey='',recoveryAttempts=0;
function cancelRecovery(){if(recoveryTimer!==null)clearTimeout(recoveryTimer);recoveryTimer=null}
function transient(error){
 if(/權限|授權|登入|token/i.test(String(error?.message||'')))return false;
 return error?.retryable===true||error?.name==='AbortError'||/fetch|network|逾時|雲端.*(?:忙碌|更新|處理|寫入|同步)|請稍後/i.test(String(error?.message||''));
}
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
function authority(){const s=sess();return String(s?.empId||'')+'|'+activeToken()+'|'+apiBase()+'|'+JSON.stringify([s?.adminRole,s?.systemPermissions,s?.finePermissions])}
function identity(){return authority()+'|'+selection()}
function sourceText(id,msg){const el=$(id+'Sub');if(el)el.textContent=msg}
function readFailure(result){
 const e=result?.reason;
 if(e?.name==='AbortError')return '雲端回應逾時';
 if(/權限|授權|登入|token/i.test(String(e?.message||'')))return '雲端授權未確認';
 if(/fetch|network/i.test(String(e?.message||'')))return '雲端連線未完成';
 const message=String(e?.message||'雲端資料未確認').replace(/[，,；;]?\s*請稍後自動重試/g,'').slice(0,140);
 return message+(e?.retryAt?'；稍後自動重試':e?.retryExhausted?'；請按重新整理重試':'');
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
 const started=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms);
 let outcome='error';
 try{
  const response=await fetch(url.toString(),{cache:'no-store',redirect:'follow',signal:controller.signal});
  if(!response.ok)throw Object.assign(Error('正式資料來源 HTTP '+response.status),{retryable:response.status===429||response.status>=500});
  const body=await response.text();
  if(/^\s*<!doctype html|^\s*<html/i.test(body))throw Error('正式服務返回登入頁，而非授權 JSON');
  const data=JSON.parse(body);
  if(data?.ok!==true)throw Object.assign(Error(data?.error||'資料來源未授權或回傳失敗'),{retryable:data?.retryable===true,retryAfterMs:Number(data?.retryAfterMs)||0});
  if(data.partial===true||data.complete===false||data.incomplete===true)throw Error('正式資料回應不完整，請重新同步');
  if(data.month&&String(data.month)!==month)throw Error('正式資料月份不一致');
  outcome='ok';return data;
 }finally{
  clearTimeout(timer);
  // Local, redacted source timings: no tokens, URLs, personnel or source payloads.
  timings.push({source:action,month:action==='getLeaveData'?'all':month,ms:Date.now()-started,result:outcome});
  if(timings.length>30)timings.shift();
 }
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
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function content(id,html){const el=$(id);if(el)el.innerHTML=html}
function note(id,message){content(id,'<div class="p79r-live-error">'+esc(message)+'</div>')}
function dateOffset(day,offset){return new Date(Date.parse(day+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10)}
function monthOffset(month,offset){const d=new Date(month+'-15T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+offset);return d.toISOString().slice(0,7)}
function summaryChart(id,total,rawRows,unit,empty){
 const rows=(rawRows||[]).map(([label,value])=>[String(label||'其他'),Number(value)]).filter(([,value])=>Number.isFinite(value)&&value>0);
 const amount=unit==='小時'?Number(total).toFixed(1):String(Number(total)||0);
 const heading='<div class="p79r-live-total">'+esc(amount)+' '+esc(unit)+'</div>';
 if(!rows.length){content(id,heading+'<div class="p79r-breakdown-empty">'+esc(empty)+'</div>');return}
 const sum=rows.reduce((n,[,v])=>n+v,0),colors=['#2563eb','#0d9488','#8b5cf6','#e59c27','#e35b7b','#0891b2','#64748b','#65a30d'];
 let start=0;
 const sectors=rows.map(([,value],i)=>{
  const end=i===rows.length-1?100:start+value/sum*100;
  const segment=colors[i%colors.length]+' '+start.toFixed(3)+'% '+end.toFixed(3)+'%';
  start=end;
  return segment;
 }).join(',');
 const legend=rows.map(([label,value],i)=>{
  const percent=(value/sum*100).toFixed(1)+'%',display=unit==='小時'?value.toFixed(1):String(value);
  return '<div class="p79r-breakdown-item"><span class="p79r-breakdown-dot" style="background:'+colors[i%colors.length]+'"></span><span class="p79r-breakdown-label">'+esc(label)+'</span><b>'+esc(percent)+'</b><small>'+esc(display)+' '+esc(unit)+'</small></div>';
 }).join('');
 content(id,heading+'<div class="p79r-breakdown"><div class="p79r-breakdown-donut" role="img" aria-label="'+esc((unit==='人次'?'請假':'加班')+'分類占比圖')+'" style="background:conic-gradient('+sectors+')"><div class="p79r-breakdown-center"><b>100%</b><span>分類占比</span></div></div><div class="p79r-breakdown-legend">'+legend+'</div></div>');
}
function hiddenJobTitle(value){
 try{
  if(typeof p79IsJobTitleHidden==='function')return !!p79IsJobTitleHidden(value);
  const hidden=typeof orgSettings!=='undefined'&&Array.isArray(orgSettings.hiddenJobTitles)?orgSettings.hiddenJobTitles:[];
  const key=v=>String(v??'').normalize('NFKC').replace(/[\s\/_-]+/g,'').toUpperCase();
  return !!key(value)&&hidden.some(v=>key(v)===key(value));
 }catch(e){return false}
}
function prepareAttendance(data){
 if(!window.P79AttendanceV6?.buildShifts)throw Error('打卡配對元件尚未載入');
 const staff=emp(),ids=new Set(staff.map(e=>String(e.empId||'').trim().toUpperCase())),attMap=new Map();
 for(const e of staff){const k=String(e.attNo||'').replace(/^0+/,'');if(k)attMap.set(k,attMap.has(k)?null:e)}
 const punches=attendanceRows(data).map(r=>{const key=String(r.empId||r.employeeId||'').trim().toUpperCase();let employeeId=key;
  if(key&&!ids.has(key))return null;
  if(!key){const e=attMap.get(String(r.attNo||r.attendanceNo||'').replace(/^0+/,''));if(!e)return null;employeeId=e.empId}
  return {...r,empId:employeeId,status:r.status||r.type||r.action};
 }).filter(Boolean);
 const shifts=window.P79AttendanceV6.buildShifts(punches),workdays=new Map();
 const key=r=>String(r.id||[r.empId,r.attNo,r.timeStr,r.status].join('|'));
 for(const shift of shifts)if(shift.clockIn)workdays.set(key(shift.clockIn),M.date(shift.accountingDateKey||shift.dateKey));
 return {...data,shifts,records:punches.map(r=>({...r,accountingDate:workdays.get(key(r))||undefined}))};
}
function setDonut(punched,total,mode,message){
 const amount=$('p79rActiveDonut'),caption=$('p79rDonutCaption'),ring=amount?.closest?.('.p79r-donut');
 if(!amount||!ring||!caption)return;
 const ready=Number.isFinite(punched)&&Number.isFinite(total)&&total>0;
 const ratio=ready?Math.max(0,Math.min(100,punched/total*100)):null;
 amount.textContent=ready?ratio.toFixed(1)+'%':'—';
 caption.textContent=mode==='official'?'正式出勤率':mode==='observed'?'打卡覆蓋率':'待核對';
 ring.classList?.toggle?.('p79r-donut-pending',!ready);
 ring.classList?.toggle?.('p79r-donut-observed',ready&&mode==='observed');
 ring.style.background=ready?'conic-gradient(#2563eb 0% '+ratio.toFixed(1)+'%,#dbeafe '+ratio.toFixed(1)+'% 100%)':'repeating-conic-gradient(#dde8f5 0 13deg,#edf3fa 13deg 26deg)';
 ring.setAttribute?.('role','img');ring.setAttribute?.('aria-label',caption.textContent+' '+amount.textContent);
 const status=$('p79rDonutSource');if(status)status.textContent=message||'';
}
function scopeIssues(payload,scope){
 return [['考勤',scope.attendance,payload.attendance],['排班',scope.schedule,payload.schedule],['核准請假',scope.leave,payload.leave]]
 .filter(([,ok,r])=>!ok||r?.status!=='fulfilled')
 .map(([n,ok,r])=>n+'：'+(ok?r?'讀取失敗（'+readFailure(r)+'）':'讀取中':'缺少檢視權限'));
}
function punchCoverage(data,staff,day){
 const details=M.attendanceDetails({records:attendanceRows(data),shifts:data.shifts||[],employees:staff,day,leaveRecords:[],schedules:[]});
 return {count:details.filter(r=>r.clockIn.length>0).length,total:details.length};
}
function renderPendingTrend(day,reason){
 content('p79rAttendanceTrend',Array.from({length:7},(_,i)=>dateOffset(day,i-6)).map(d=>'<div class="p79r-trend-row" title="'+esc(reason)+'"><span>'+d.slice(5)+'</span><div class="p79r-trend-track p79r-trend-pending"></div><b>待核對</b></div>').join('')+'<div class="p79r-live-error">'+esc(reason)+'</div>');
}
function panels(payload,scope,day,leave,ot,attendance){
 const month=day.slice(0,7),staff=emp(),ids=new Set(staff.map(e=>String(e.empId||'').trim().toUpperCase())),take=r=>ids.has(String(r.empId||r.employeeId||'').trim().toUpperCase());
 if(leave?.ready)summaryChart('p79rLeaveSummary',leave.count,Object.entries(leave.typeCounts),'人次','本月沒有已核准請假申請');
 else note('p79rLeaveSummary',$('p79rLeavesSub')?.textContent||'核准請假資料待核對');
 if(ot?.ready){summaryChart('p79rOvertimeSummary',ot.hours,Object.entries(ot.byType||{}),'小時','本月沒有正式加班申報');const el=$('p79rOvertimeSummary');if(el)el.innerHTML+='<div class="p79r-live-note">正式申報，不含預排／撤銷；另有 '+ot.planned+' 筆預排。</div>'}
 else note('p79rOvertimeSummary',$('p79rOvertimeSub')?.textContent||'正式加班申報待核對');
 const a=payload.attendance?.status==='fulfilled'?payload.attendance.value:null,s=payload.schedule?.status==='fulfilled'?payload.schedule.value:null,l=payload.leave?.status==='fulfilled'?payload.leave.value:null;
 let rows=null,paired=[];
 if(scope.attendance&&a){
  try{
   paired=a.shifts||[];
   const punches=attendanceRows(a);
   rows=M.attendanceDetails({records:punches,shifts:paired,employees:staff,day,leaveRecords:l&&scope.leave?leaveRows(l).filter(take):[],schedules:s&&scope.schedule?officialSchedules(s):[]});
   // Hide rows from the dashboard only. Official attendance totals and source records stay intact.
   const visibleRows=rows.filter(r=>!hiddenJobTitle(r.jobTitle));
   const fields=['姓名','單位','職稱','班別','上班打卡','下班打卡','狀態'];
   const scopeText=visibleRows.length===rows.length
     ?rows.length+' 位人員'
     :visibleRows.length+' 位顯示人員（正式統計含 '+rows.length+' 位，隱藏職稱不列入明細）';
   content('p79rAttendanceDetails','<div class="p79r-live-note">'+esc(day)+'｜'+scopeText+'；日期依正式跨日配對。'+(!scope.leave||!l?' 請假資料未取得。':'')+(!scope.schedule||!s?' 班表資料未取得。':'')+'</div><table><thead><tr>'+fields.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+(visibleRows.length?visibleRows.map(r=>'<tr>'+[r.name||r.empId,r.unit||'未設定',r.jobTitle||'未設定',r.shift||'未排班',r.clockIn.join('、')||'—',r.clockOut.join('、')||'—',r.state].map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="7">目前沒有可顯示的人員</td></tr>')+'</tbody></table>');
  }catch(e){note('p79rAttendanceDetails',e.message)}
 }else note('p79rAttendanceDetails',scope.attendance?'正式打卡讀取失敗：'+readFailure(payload.attendance):'目前帳號沒有考勤資料檢視權限');
 if(rows){const counts={};rows.forEach(r=>counts[r.state]=(counts[r.state]||0)+1);
  const punched=rows.filter(r=>r.clockIn.length>0).length;
  if(!attendance?.ready)setDonut(punched,rows.length,'observed',punched+' 位有上班打卡／'+rows.length+' 位在職人員。此為打卡覆蓋率，非正式出勤率。');content('p79rAttendanceBreakdown','<div class="p79r-live-note">'+esc(day)+'｜'+(attendance?.ready?(attendance.expected+' 人應到／'+attendance.clocked+' 人已簽到'):'應到人數待班表與請假核對')+'</div>'+Object.entries(counts).map(([label,value])=>'<div class="p79r-live-row"><span>'+esc(label)+'</span><b>'+value+' 人</b></div>').join(''))}
 else note('p79rAttendanceBreakdown','正式考勤尚未確認，無法顯示出勤分布');
 if(scope.attendance&&scope.schedule&&scope.leave&&a&&s&&l){
  try{
   const leaves=leaveRows(l).filter(take),known=new Set(l.employees.map(e=>String(e.empId||'').trim().toUpperCase()));
   const timeline=Array.from({length:7},(_,i)=>{const d=dateOffset(day,i-6);let calc;
    if(staff.filter(e=>M.isWorking(e,d)).some(e=>!known.has(String(e.empId||'').trim().toUpperCase())))calc={ready:false,reason:'請假資料範圍未完整涵蓋人員'};
    else calc=M.attendanceRate({employees:staff,records:attendanceRows(a),schedules:officialSchedules(s),leaveRecords:leaves,day:d});
    if(d>todayTaipei())calc={ready:false,reason:'未來日期'};
    else if(!calc.ready){const observed=punchCoverage(a,staff,d);if(observed.total)calc={...calc,punchPercent:observed.count/observed.total*100};}
    return {day:d,...calc};});
   content('p79rAttendanceTrend',timeline.map(r=>'<div class="p79r-trend-row" title="'+esc(r.reason||r.clocked+' 人已到／'+r.expected+' 人應到')+'"><span>'+r.day.slice(5)+'</span><div class="p79r-trend-track"><div class="p79r-trend-bar'+(!r.ready&&r.punchPercent!==undefined?' p79r-trend-provisional':'')+'" style="width:'+(r.ready&&r.percent!==null?r.percent:(r.punchPercent??0))+'%"></div></div><b>'+(r.ready?(r.percent===null?'無應到':r.percent.toFixed(1)+'%'):(r.punchPercent===undefined?'待核對':r.punchPercent.toFixed(1)+'%*'))+'</b></div>').join('')+'<div class="p79r-live-note">已簽到人數 ÷ 正式應到人數；排定休假與全日核准請假不列入應到。未排班或來源不齊的日期不計算正式出勤率；* 為打卡人數／在職人數，並非正式出勤率。</div>');
   }catch(e){renderPendingTrend(day,'出勤率核對失敗：'+e.message)}
 }else{
  const issue=scopeIssues(payload,scope).join('；')||'正式來源仍待核對';
  if(a&&scope.attendance){
   try{
    const daily=Array.from({length:7},(_,i)=>{const d=dateOffset(day,i-6);return {day:d,...punchCoverage(a,staff,d)}});
    content('p79rAttendanceTrend','<div class="p79r-live-note">以下是打卡覆蓋率（已打上班卡／在職人員），不是正式應到出勤率。</div>'+daily.map(r=>{
      const percent=r.day>todayTaipei()||!r.total?null:r.count/r.total*100;
      return '<div class="p79r-trend-row" title="'+esc(r.count+' / '+r.total+' 位有上班打卡')+'"><span>'+r.day.slice(5)+'</span><div class="p79r-trend-track"><div class="p79r-trend-bar p79r-trend-provisional" style="width:'+(percent??0).toFixed(1)+'%"></div></div><b>'+(percent===null?'待核對':percent.toFixed(1)+'%*')+'</b></div>';
    }).join('')+'<div class="p79r-live-error">正式出勤率尚未核對：'+esc(issue)+'</div>');
   }catch(e){renderPendingTrend(day,'正式出勤率未核對：'+issue+'；打卡覆蓋率也無法計算：'+e.message)}
  }else renderPendingTrend(day,'正式出勤率尚未核對：'+issue);
 }
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
  try{leave=M.approvedLeaveCount(leaveRows(leaveResult).filter(r=>staffIds.includes(String(r.empId||r.employeeId||'').trim().toUpperCase())),month,staffIds);
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
  try{
   const known=new Set(leaveResult.employees.map(e=>String(e.empId||'').trim().toUpperCase()));
   if(all.filter(e=>M.isWorking(e,day)).some(e=>!known.has(String(e.empId||'').trim().toUpperCase())))throw Error('請假授權範圍未涵蓋全部人員');
   attendance=M.attendanceRate({
    records:attendanceRows(attendanceResult),schedules:officialSchedules(scheduleResult),
    leaveRecords:leaveRows(leaveResult).filter(r=>staffIds.includes(String(r.empId||r.employeeId||'').trim().toUpperCase())),employees:all,day
   });
   if(day>todayTaipei())attendance={ready:false,reason:'未來日期尚無實際出勤率'};
   if(attendance.ready){
    setVal('p79rAttendance',attendance.percent===null?'—':attendance.percent.toFixed(1)+'%',
      attendance.expected+' 人應到／'+attendance.clocked+' 人已打上班卡（當日）');
     setDonut(attendance.clocked,attendance.expected,'official',attendance.expected+' 人應到／'+attendance.clocked+' 人已打上班卡');
   }else sourceText('p79rAttendance',attendance.reason||'當日打卡核對尚未完成');
  }catch(e){sourceText('p79rAttendance','正式出勤率未核對完成：'+String(e.message||e).slice(0,100))}
 }else if(scope.attendance&&scope.schedule&&scope.leave)sourceText('p79rAttendance','正式資料未讀齊：'+scopeIssues(payload,scope).join('；'));
 else sourceText('p79rAttendance','需要檢視權限：'+scopeIssues(payload,scope).join('；'));
 panels(payload,scope,day,leave,ot,attendance);
}
function reset(msg){
 setDonut(null,null,'pending',msg||'等待核對正式考勤');
 for(const id of ['p79rAttendanceDetails','p79rAttendanceTrend','p79rAttendanceBreakdown','p79rLeaveSummary','p79rOvertimeSummary'])note(id,msg||'正式資料核對中…');
 setVal('p79rAttendance','—',msg||'等待正式考勤');
 setVal('p79rLeaves','—',msg||'等待核准請假');
 setVal('p79rOvertime','—',msg||'等待正式加班申報');
}
async function refresh(force){
 if(!ready())return;
 const day=selection(),month=day.slice(0,7),auth=activeToken(),startIdentity=identity(),authorityKey=authority();
 if(lastAuthority&&lastAuthority!==authorityKey){cache.clear();sourceCache.clear();sourceInflight.clear();loadId++;inFlightKey=''}
 lastAuthority=authorityKey;
 if(!auth||!apiBase()||!sess())return reset('沒有已驗證的雲端登入權杖');
 const scope={attendance:access('attendance','records.view'),schedule:access('schedule','records.view'),
 leave:access('leave','records.view'),workhours:access('workhours','overtime.view')};
 const key=startIdentity+'|'+month;
 if(inFlightKey===key)return;
 if(force||recoveryKey!==key){cancelRecovery();recoveryKey=key;recoveryAttempts=0}
 if(force){cache.clear();sourceCache.clear()}
 const hit=cache.get(key);
 if(!force&&hit&&Date.now()-hit.at<CACHE_TTL_MS){
  display(hit.data,scope,day);
  // A rejected source is not a successful two-minute snapshot. Wait only for its recovery deadline.
  if(hit.complete||!hit.retryAt||Date.now()<hit.retryAt)return;
 }
 cancelRecovery();
 inFlightKey=key;const current=++loadId;
 if(!hit)reset('正式資料核對中…');
 const readOne=async(enabled,action,requestedMonth)=>{
  if(!enabled)throw Error('目前沒有資料檢視權限');
  // Reuse month responses across day changes; never persist private ledgers.
  const cacheKey=authorityKey+'|'+action+'|'+(action==='getLeaveData'?'all':requestedMonth);
  const cached=sourceCache.get(cacheKey);
  if(!force&&cached&&Date.now()-cached.at<CACHE_TTL_MS)return cached.value;
  if(!force&&sourceInflight.has(cacheKey))return sourceInflight.get(cacheKey);
  const work=(async()=>{
   try{return await get(action,requestedMonth,auth,15000)}catch(error){
    // Never retry authorization denial or a request for a former account/date.
    if(current!==loadId||identity()!==startIdentity||!transient(error))throw error;
    const delay=Math.min(4000,Math.max(1000,Number(error.retryAfterMs)||1000));
    await new Promise(resolve=>setTimeout(resolve,delay));
    if(current!==loadId||identity()!==startIdentity||!ready())throw error;
    return get(action,requestedMonth,auth,15000);
   }
  })();
  sourceInflight.set(cacheKey,work);
  try{
   const value=await work;
   if(authority()===authorityKey){
    sourceCache.set(cacheKey,{at:Date.now(),value});
    if(sourceCache.size>18)sourceCache.delete(sourceCache.keys().next().value);
   }
   return value;
  }finally{if(sourceInflight.get(cacheKey)===work)sourceInflight.delete(cacheKey)}
 };
 const months=[...new Set([month,dateOffset(day,-6).slice(0,7)])];
 const attMonths=[...new Set([...months,dateOffset(day,1).slice(0,7)])];
 // Future-month schedules do not affect the selected day or prior six days.
 // Attendance alone needs the next month when a night shift crosses month-end.
 const scheduleMonths=months;
 const join=async(enabled,action,selected,field)=>{
  const data=await Promise.all(selected.map(m=>readOne(enabled,action,m)));
  if(data.some(d=>!Array.isArray(d[field])))throw Error('正式'+field+'資料不完整');
  return {ok:true,[field]:data.flatMap(d=>d[field]),employees:data.flatMap(d=>d.employees||[])};
 };
 const data=hit?{...hit.data}:{};
 const publish=(key,value)=>{if(current===loadId&&identity()===startIdentity&&ready()){if(key==='attendance'&&value.status==='fulfilled'){try{value={status:'fulfilled',value:prepareAttendance(value.value)}}catch(reason){value={status:'rejected',reason}}}data[key]=value;display(data,scope,day)}};
 const task=(key,promise)=>promise.then(value=>publish(key,{status:'fulfilled',value}),reason=>publish(key,{status:'rejected',reason}));
 await Promise.all([
  task('leave',readOne(scope.leave,'getLeaveData',month)),
  task('schedule',join(scope.schedule,'getScheduleDataSecure',scheduleMonths,'schedules')),
  task('attendance',join(scope.attendance,'getAttendanceMonthData',attMonths,'records'))
 ]);
 if(current===loadId)inFlightKey='';
 if(current!==loadId||identity()!==startIdentity||!ready())return;
 const failures=['leave','schedule','attendance'].filter(name=>scope[name]&&data[name]?.status==='rejected');
 const recoverable=failures.filter(name=>transient(data[name].reason));
 const retryAt=recoverable.length&&recoveryAttempts<RECOVERY_DELAYS.length?Date.now()+RECOVERY_DELAYS[recoveryAttempts++]:0;
 for(const name of recoverable){data[name].reason.retryAt=retryAt;data[name].reason.retryExhausted=!retryAt;}
 cache.set(key,{at:Date.now(),data,complete:failures.length===0,retryAt});
 if(retryAt){
  recoveryTimer=setTimeout(()=>{
   recoveryTimer=null;
   if(current===loadId&&identity()===startIdentity&&ready()&&document.visibilityState!=='hidden')void refresh(false);
  },Math.max(0,retryAt-Date.now()));
  recoveryTimer?.unref?.();
 }
 if(cache.size>8)cache.delete(cache.keys().next().value);
 display(data,scope,day);
}
const original=window.p79HrDashRender;
window.p79HrDashRender=function(){
 original?.();
 const day=selection(),key=identity()+'|'+day.slice(0,7),entry=cache.get(key);
 if(entry&&Date.now()-entry.at<CACHE_TTL_MS){display(entry.data,{
  attendance:access('attendance','records.view'),schedule:access('schedule','records.view'),
  leave:access('leave','records.view'),workhours:access('workhours','overtime.view')
 },day)}
 if(ready())void refresh(false);
};
window.P79HrStatistics={refresh:()=>refresh(true),access,selection,todayTaipei,
 getTimings:()=>timings.map(row=>({...row}))};
window.addEventListener?.('focus',()=>{if(ready())void refresh(false)});
window.addEventListener?.('pagehide',()=>{cancelRecovery();loadId++;inFlightKey=''});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='hidden'&&ready())void refresh(false)});
document.addEventListener('DOMContentLoaded',function(){
 const date=$('p79rWorkDate');
 if(date)date.addEventListener('change',function(){loadId++;inFlightKey='';reset('正在更換統計日期');void refresh(true)});
 if(ready())void refresh(false);
 const refreshButton=document.querySelector?.('[onclick*="loadEmployees(true)"]');
 refreshButton?.addEventListener('click',()=>{cache.clear();void refresh(true)});
});
})();

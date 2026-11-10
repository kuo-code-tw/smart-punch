/* 79 號碼頭首頁：早／中／晚班表出勤待核；必須同時核對正式班表、考勤與核准請假。唯讀。 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.P79HomeEarlyPunchAlert=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const DAY=86400000,HOUR=3600000;
const id=v=>String(v??'').trim().replace(/\s+/g,'').toUpperCase();
const att=v=>{const x=id(v).replace(/^0+/,'');return x||id(v)};
const personName=v=>String(v||'').trim().replace(/\s*[（(]\s*AQC\s*[)）]\s*$/i,'').replace(/\s+/g,'').toUpperCase();
const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const taipeiToday=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
const shiftDay=s=>String(s?.accountingDateKey||s?.dateKey||'').replace(/\//g,'-');
// Match the scheduling system's own shift periods. Late duty belongs to the
// previous roster workday even though IN/OUT may occur on the next civil date.
function rosterHours(code){
 const c=String(code||'').replace(/\s+/g,'').trim();
 if(['早','早班'].includes(c)||/^0?8(?::00)?[-~～至]16(?::00)?$/.test(c))return {label:'早',start:8,end:16};
 if(['中','中班'].includes(c)||/^16(?::00)?[-~～至](?:24|00)(?::00)?$/.test(c))return {label:'中',start:16,end:24};
 if(['晚','晚班'].includes(c)||/^(?:24|00)(?::00)?[-~～至]0?8(?::00)?$/.test(c))return {label:'晚',start:24,end:32};
 return null;
}
function dateKey(value){
 const m=String(value||'').match(/^(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})/);
 return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):'';
}
function at(value){
 const m=String(value||'').match(/^(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
 return m?Date.parse(m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0')+'T'+m[4].padStart(2,'0')+':'+m[5]+':'+(m[6]||'00')+'+08:00'):NaN;
}
const leaveInvalid=r=>r?.deleted===true||r?.isDeleted===true||r?.cancelled===true||
 r?.canceled===true||r?.revoked===true||r?.deletedAt||r?.cancelledAt||r?.canceledAt;
const leaveConfirmed=r=>['已核准','核准','approved'].includes(String(r?.status||'').trim().toLowerCase());
function leaveEvidence(person,date,scheduleData,leaveData){
 const key=id(person.empId||person.id);
 const recs=[...(scheduleData?.leaveRecords||[]),...(leaveData?.leaveRecords||[])];
 let found=false,full=false;
 for(const r of recs){
  if(leaveInvalid(r)||!leaveConfirmed(r)||!key||id(r.empId||r.employeeId)!==key)continue;
  const start=dateKey(r.startDate||r.startTime),end=dateKey(r.endDate||r.endTime)||start;
  if(!start||!end||date<start||date>end)continue;
  found=true;
  const perDay=r.approvedDailyDays||r.dailyDays;
  if(perDay&&typeof perDay==='object'&&!Array.isArray(perDay)){
   if(Number(perDay[date])>=1)full=true;
  }else{
   const total=Number(r.approvedDays??r.days??r.dayCount);
   const expected=1+(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/DAY;
   if(Number.isFinite(total)&&total>=expected&&expected>0)full=true;
  }
 }
 return full?'full':found?'partial-or-unspecified':'none';
}
function excused(meta){
 return !!(meta&&(meta.approvedLeave===true||meta.leaveApproved===true||
  meta.leaveRecord?.approved===true||meta.leave?.approved===true||
  meta.absenceApproved===true||meta.restDay===true));
}
function sameEmployee(roster,punch,uniqueName){
 const a=id(roster.empId||roster.id),b=id(punch.empId||punch.employeeId);
 const x=att(roster.attNo||roster.attendanceNo||roster.attendanceId);
 const y=att(punch.attNo||punch.attendanceNo);
 if(a&&b&&a===b)return true;
 if(x&&y&&x===y)return !a||!b||a===b;
 if(a&&b||x&&y)return false;
 const n=personName(roster.name||roster.empName);
 return !!n&&uniqueName.has(n)&&n===personName(punch.name);
}
function overtimeFinish(meta,start,end){
 if(!(meta&&(meta.overtime===true||meta.overtimeReport||meta.restQuotaOvertime||meta.forEmpId)))return end;
 const value=String(meta.overtimeEnd||meta.overtimeReport?.endTime||'');
 const m=value.match(/^(\d{1,2}):(\d{2})$/);
 if(!m||Number(m[1])>24||Number(m[2])>=60)return end;
 let n=Number(m[1])+Number(m[2])/60;
 while(n<start)n+=24;
 // Early (08-16) overtime may run into next day; middle and late likewise.
 if(n<end&&n+24<=end+16)n+=24;
 return n>end&&n<=end+16?n:end;
}
function analyze(attendanceData,scheduleData,month,options={}){
 if(!Array.isArray(attendanceData?.records)||!Array.isArray(scheduleData?.schedules))
  return {count:null,details:null,unknownDays:0,reason:'正式考勤或班表資料尚未讀齊'};
 const leaveData=options.leaveData;
 if(!Array.isArray(leaveData?.leaveRecords))
  return {count:null,details:null,unknownDays:0,reason:'正式核准請假資料尚未核對，不顯示漏卡結論'};
 const build=options.buildShifts||root.P79AttendanceV6?.buildShifts;
 if(typeof build!=='function')
  return {count:null,details:null,unknownDays:0,reason:'打卡配對資料尚未準備完成'};
 const now=Number.isFinite(options.now)?options.now:Date.now(),today=taipeiToday(now);
 const punches=build(attendanceData.records),coverage=new Set();
 for(const p of attendanceData.records){
  const d=dateKey(p?.timeStr||p?.['出勤時間']||p?.datetime);
  if(d)coverage.add(d);
 }
 const nameCounts=new Map(),roster=scheduleData.schedules;
 for(const r of roster){const n=personName(r.name||r.empName);if(n)nameCounts.set(n,(nameCounts.get(n)||0)+1);}
 const uniqueName=new Set([...nameCounts].filter(([,n])=>n===1).map(([n])=>n));
 const details=[],seen=new Set();let unknownDays=0;
 for(const person of roster){
  const dates=person?.schedule||{};
  const workerId=id(person.empId||person.id)||(att(person.attNo||person.attendanceNo)?'ATT:'+att(person.attNo||person.attendanceNo):'')||(personName(person.name)?'NAME:'+personName(person.name):'');
  if(!workerId||workerId==='ATT:'||workerId==='NAME:')continue;
  for(const [date,code] of Object.entries(dates)){
   const period=rosterHours(code);
   if(!period||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!date.startsWith(month+'-')||date>today)continue;
   const meta=dates.__meta?.[date]||{},identity=workerId+'|'+date;
   if(seen.has(identity))continue;seen.add(identity);
   if(excused(meta))continue;
   const leave=leaveEvidence(person,date,scheduleData,leaveData);
   if(leave==='full')continue;
   if(leave==='partial-or-unspecified'){unknownDays++;continue;} // Never label approved leave as missing punches.
   const base=Date.parse(date+'T00:00:00+08:00');
   if(!Number.isFinite(base))continue;
   const started=base+period.start*HOUR,finished=base+overtimeFinish(meta,period.start,period.end)*HOUR;
   const startGrace=started+30*60000,endGrace=finished+HOUR;
   if(now<startGrace)continue;
   // Match work-date sessions by actual punch timestamps; the canonical paired
   // dateKey for a 00:00-08:00 late shift may be the following civil date.
   const matched=punches.filter(shift=>{
    if(!sameEmployee(person,shift,uniqueName))return false;
    const first=at(shift.clockIn?.timeStr),last=at(shift.clockOut?.timeStr);
    const nearFirst=Number.isFinite(first)&&first>=started-2*HOUR&&first<finished;
    const nearLast=Number.isFinite(last)&&last>=started-2*HOUR&&last<=finished+3*HOUR;
    return nearFirst||nearLast;
   });
   const ins=matched.filter(s=>s.clockIn),outs=matched.filter(s=>s.clockOut);
   const hasIn=ins.length>0,hasOut=outs.length>0;
   if(hasIn&&hasOut)continue;
   const startDay=taipeiToday(started),finishDay=taipeiToday(finished);
   const hasCoverage=coverage.has(startDay)||(coverage.has(date)&&period.start<24);
   if(!hasCoverage&&!hasIn&&!hasOut){unknownDays++;continue;}
   if(now>=endGrace&&finishDay!==date&&!coverage.has(finishDay)&&!hasOut){
    // A missing next-day feed cannot prove that a valid checkout did not happen.
    unknownDays++;continue;
   }
   const missingIn=!hasIn,missingOut=now>=endGrace&&!hasOut;
   if(!missingIn&&!missingOut)continue;
   const reason=missingIn&&missingOut?'上下班皆無卡':missingIn?'缺少上班卡':'缺少下班卡';
   details.push({
    date,name:String(person.name||person.empName||'姓名未提供').trim(),
    empId:String(person.empId||person.id||''),attNo:String(person.attNo||person.attendanceNo||''),
    dept:String(person.dept||person.department||''),group:String(dates.__personnel?.group||person.group||''),
    shift:period.label,scheduled:period.label==='早'?'08:00–16:00':period.label==='中'?'16:00–24:00':'00:00–08:00（次日）',
    clockIn:ins.map(s=>String(s.clockIn.timeStr||'')).filter(Boolean).join('／'),
    clockOut:outs.map(s=>String(s.clockOut.timeStr||'')).filter(Boolean).join('／'),
    reason,stage:now>=endGrace?'班次已結束':period.label+'班已開始',
    explanation:'已核對正式班表、打卡配對與核准請假；此項為待人工確認，不代表認定缺勤。'
   });
  }
 }
 details.sort((a,b)=>b.date.localeCompare(a.date)||a.shift.localeCompare(b.shift,'zh-TW')||a.name.localeCompare(b.name,'zh-TW'));
 return {count:details.length,details,unknownDays,reason:unknownDays?'部分日期、核准部分請假或跨日考勤資料不足，未列入漏卡人數':''};
}
let last=null,refresh=null,bound=false;
const $=key=>root.document?.getElementById(key);
function status(message){const el=$('p79EarlyPunchDialogStatus');if(el)el.textContent=message;}
function renderDialog(){
 const host=$('p79EarlyPunchRows');if(!host)return;
 if(!last||!Array.isArray(last.details)){host.innerHTML='<p>目前無法確認班表出勤待核人數，請重新讀取正式考勤與排班。</p>';return;}
 if(!last.details.length){host.innerHTML='<p>目前沒有可確認的班表出勤待核紀錄。</p>';return;}
 host.innerHTML='<div class="p79-early-table-scroll"><table><thead><tr><th>日期</th><th>姓名</th><th>工號／考勤號</th><th>組別</th><th>班別</th><th>應出勤時段</th><th>上班卡</th><th>下班卡</th><th>待核原因</th></tr></thead><tbody>'+
  last.details.slice(0,200).map(r=>'<tr><td>'+html(r.date)+'</td><td>'+html(r.name)+'</td><td>'+html(r.empId||r.attNo||'—')+'</td><td>'+html(r.group||'—')+'</td><td>'+html(r.shift)+'</td><td>'+html(r.scheduled)+'</td><td>'+html(r.clockIn||'—')+'</td><td>'+html(r.clockOut||'—')+'</td><td class="p79-early-reason">'+html(r.reason)+'</td></tr>').join('')+
 '</tbody></table></div>';
 if(last.details.length>200)host.insertAdjacentHTML('beforeend','<p>畫面先顯示前 200 筆，完整資料請至考勤系統核對。</p>');
}
function render(attendanceData,scheduleData,month,options={}){
 last=analyze(attendanceData,scheduleData,month,options);
 const btn=$('p79DashEarlyPunchTrigger'),value=$('p79DashEarlyPunchCount'),hint=$('p79DashEarlyPunchHint');
 if(!btn)return last;
 const mode=last.count===null?'unverified':last.count>0?'pending':last.unknownDays?'unverified':'clear';
 btn.dataset.alertState=mode;
 if(value)value.textContent=last.count===null||last.count===0&&last.unknownDays?'—':String(last.count);
 if(hint)hint.textContent=last.count===null?'資料待核對 ›':last.count>0?'點擊核對人員 ›':last.unknownDays?'部分日期待核 ›':'目前無漏卡待核 ›';
 btn.setAttribute('aria-label','班表出勤待核：'+(last.count===null?'尚未確認':last.count+' 筆待核')+'，點擊查看明細');
 if($('p79DashEarlyPunchDialog')?.open){status(last.reason||'已核對正式班表、考勤與已核准請假');renderDialog();}
 return last;
}
function reset(){
 last=null;
 const btn=$('p79DashEarlyPunchTrigger');
 if(btn)btn.dataset.alertState='unverified';
 if($('p79DashEarlyPunchCount'))$('p79DashEarlyPunchCount').textContent='—';
 if($('p79DashEarlyPunchHint'))$('p79DashEarlyPunchHint').textContent='等待考勤資料 ›';
}
function bind(recheck){
 refresh=recheck;
 const btn=$('p79DashEarlyPunchTrigger'),dialog=$('p79DashEarlyPunchDialog');
 if(bound||!btn||!dialog)return;
 bound=true;
 btn.addEventListener('click',async()=>{
  if(dialog.open)return;
  dialog.showModal();status('正在核對早／中／晚班表、正式考勤及核准請假…');
  const host=$('p79EarlyPunchRows');if(host)host.textContent='雲端核對中…';
  try{
   if(typeof refresh!=='function')throw Error('目前無法重新核對資料');
   const next=await refresh();
   if(!dialog.open)return;
   if(!next||!Array.isArray(next.attendance?.records)||!Array.isArray(next.schedule?.schedules)||!Array.isArray(next.leaveData?.leaveRecords))
     throw Error('正式考勤、排班或核准請假資料未讀齊');
   render(next.attendance,next.schedule,next.month,{leaveData:next.leaveData});
   status(last?.reason||'最新正式資料核對完成；所有紀錄僅供人工確認。');
  }catch(e){
   if(!dialog.open)return;
   status('最新雲端核對未完成：'+String(e?.message||e));
   if(host)host.textContent='請確認連線後重新點選卡片。未驗證資料不會顯示為已漏卡。';
  }
 });
 dialog.querySelectorAll('[data-early-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
 dialog.querySelector('[data-early-attendance]')?.addEventListener('click',()=>{
  dialog.close();
  if(typeof root.launchSystem==='function')root.launchSystem('attendance');
 });
}
return {analyze,render,reset,bind};
});

/* 79 號碼頭首頁：早班漏卡唯讀警示。不得修改考勤、排班或判定缺勤。 */
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
function earlyShift(code){
 const s=String(code||'').trim().replace(/\s+/g,'');
 return s==='早'||s==='早班'||/^0?8(?::00)?[-~～至]16(?::00)?$/.test(s);
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
 if(a&&b&&a===b)return !x||!y||x===y;
 if(x&&y&&x===y)return !a||!b||a===b;
 if(a&&b||x&&y)return false;
 const n=personName(roster.name||roster.empName);
 return !!n&&uniqueName.has(n)&&n===personName(punch.name);
}
function overtimeFinish(meta,startHour,endHour){
 if(!(meta&&(meta.overtime===true||meta.overtimeReport||meta.restQuotaOvertime||meta.forEmpId)))return endHour;
 const value=String(meta.overtimeEnd||meta.overtimeReport?.endTime||'');
 const m=value.match(/^(\d{1,2}):(\d{2})$/);
 if(!m)return endHour;
 let n=Number(m[1])+Number(m[2])/60;
 if(n<=startHour)n+=24;
 return n>endHour&&n<=48?n:endHour;
}
function analyze(attendanceData,scheduleData,month,options={}){
 if(!Array.isArray(attendanceData?.records)||!Array.isArray(scheduleData?.schedules))
  return {count:null,details:null,unknownDays:0,reason:'正式考勤或排班資料尚未讀取完成'};
 const build=options.buildShifts||root.P79AttendanceV6?.buildShifts;
 if(typeof build!=='function')
  return {count:null,details:null,unknownDays:0,reason:'打卡配對資料尚未準備完成'};
 const now=Number.isFinite(options.now)?options.now:Date.now(),today=taipeiToday(now);
 const punches=build(attendanceData.records),byDay=new Map(),dayCoverage=new Set();
 for(const r of attendanceData.records){
  const raw=String(r?.timeStr||r?.['出勤時間']||r?.datetime||'');
  const m=raw.match(/^(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if(m)dayCoverage.add(m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'));
 }
 for(const s of punches){
  const d=shiftDay(s);
  if(!byDay.has(d))byDay.set(d,[]);
  byDay.get(d).push(s);
 }
 const nameCounts=new Map(),roster=scheduleData.schedules;
 for(const r of roster){const n=personName(r.name||r.empName);if(n)nameCounts.set(n,(nameCounts.get(n)||0)+1);}
 const uniqueName=new Set([...nameCounts].filter(([,n])=>n===1).map(([n])=>n));
 const details=[],seen=new Set();let unknownDays=0;
 for(const person of roster){
  const dates=person?.schedule||{};
  const workerId=id(person.empId||person.id)||'ATT:'+att(person.attNo||person.attendanceNo)||'NAME:'+personName(person.name);
  if(!workerId||workerId==='ATT:'||workerId==='NAME:')continue;
  for(const [date,code] of Object.entries(dates)){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!date.startsWith(month+'-')||date>today||!earlyShift(code))continue;
   const meta=dates.__meta?.[date]||{};
   if(excused(meta))continue;
   const key=workerId+'|'+date;
   if(seen.has(key))continue;seen.add(key);
   const base=Date.parse(date+'T00:00:00+08:00');
   if(!Number.isFinite(base))continue;
   const startGrace=base+8.5*HOUR,endGrace=base+(overtimeFinish(meta,8,16)+1)*HOUR;
   if(now<startGrace)continue;
   const matched=(byDay.get(date)||[]).filter(shift=>sameEmployee(person,shift,uniqueName));
   const hasIn=matched.some(s=>!!s.clockIn),hasOut=matched.some(s=>!!s.clockOut);
   if(hasIn&&hasOut)continue;
   // Empty day feeds cannot prove everybody absent. Keep the status unverified,
   // not an alarming mass-zero-punch notification.
   if(!dayCoverage.has(date)&&!hasIn&&!hasOut){unknownDays++;continue;}
   const missingIn=!hasIn,missingOut=now>=endGrace&&!hasOut;
   if(!missingIn&&!missingOut)continue;
   const reason=missingIn&&missingOut?'上下班皆無卡':missingIn?'缺少上班卡':'缺少下班卡';
   const inTimes=matched.filter(s=>s.clockIn).map(s=>String(s.clockIn.timeStr||'')).filter(Boolean);
   const outTimes=matched.filter(s=>s.clockOut).map(s=>String(s.clockOut.timeStr||'')).filter(Boolean);
   details.push({
    date,name:String(person.name||person.empName||'姓名未提供').trim(),empId:String(person.empId||person.id||''),
    attNo:String(person.attNo||person.attendanceNo||''),dept:String(person.dept||person.department||''),
    group:String(dates.__personnel?.group||person.group||''),shift:'早',
    clockIn:inTimes.join('／'),clockOut:outTimes.join('／'),
    reason,stage:now>=endGrace?'班次已結束':'早班已開始',
    explanation:'系統依正式早班排班（08:00–16:00）及目前已讀取的打卡配對，尚未找到完整打卡。這是待核提醒，不代表認定缺勤。'
   });
  }
 }
 details.sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,'zh-TW'));
 return {count:details.length,details,unknownDays,reason:unknownDays?'部分日期的雲端打卡資料不足，已避免直接判定漏卡':''};
}
let last=null,refresh=null,bound=false;
const $=key=>root.document?.getElementById(key);
function status(message){const el=$('p79EarlyPunchDialogStatus');if(el)el.textContent=message;}
function renderDialog(){
 const host=$('p79EarlyPunchRows');if(!host)return;
 if(!last||!Array.isArray(last.details)){host.innerHTML='<p>目前無法確認早班漏卡人數，請重新讀取正式考勤與排班。</p>';return;}
 if(!last.details.length){host.innerHTML='<p>目前沒有可確認的早班漏卡待核紀錄。</p>';return;}
 host.innerHTML='<div class="p79-early-table-scroll"><table><thead><tr><th>日期</th><th>姓名</th><th>工號／考勤號</th><th>組別</th><th>班別</th><th>上班卡</th><th>下班卡</th><th>待核原因</th></tr></thead><tbody>'+
  last.details.slice(0,200).map(r=>'<tr><td>'+html(r.date)+'</td><td>'+html(r.name)+'</td><td>'+html(r.empId||r.attNo||'—')+'</td><td>'+html(r.group||'—')+'</td><td>早</td><td>'+html(r.clockIn||'—')+'</td><td>'+html(r.clockOut||'—')+'</td><td class="p79-early-reason">'+html(r.reason)+'</td></tr>').join('')+
 '</tbody></table></div>';
 if(last.details.length>200)host.insertAdjacentHTML('beforeend','<p>畫面先顯示前 200 筆，完整資料請至考勤系統核對。</p>');
}
function render(attendanceData,scheduleData,month,options={}){
 last=analyze(attendanceData,scheduleData,month,options);
 const btn=$('p79DashEarlyPunchTrigger'),value=$('p79DashEarlyPunchCount'),hint=$('p79DashEarlyPunchHint');
 if(!btn)return last;
 const mode=last.count===null?'unverified':last.count>0?'pending':last.unknownDays?'unverified':'clear';
 btn.dataset.alertState=mode;
 if(value)value.textContent=last.count===null?'—':String(last.count);
 if(hint)hint.textContent=last.count===null?'資料待核對 ›':last.count>0?'點擊核對人員 ›':last.unknownDays?'部分日期待核 ›':'目前無漏卡待核 ›';
 btn.setAttribute('aria-label','早班漏卡警示：'+(last.count===null?'尚未確認':last.count+' 筆待核')+'，點擊查看明細');
 if($('p79DashEarlyPunchDialog')?.open){status(last.reason||'依已讀取的正式考勤及排班比對');renderDialog();}
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
  dialog.showModal();status('正在讀取最新考勤與排班，核對早班漏卡…');
  const host=$('p79EarlyPunchRows');if(host)host.textContent='雲端核對中…';
  try{
   if(typeof refresh!=='function')throw Error('目前無法重新核對資料');
   const next=await refresh();
   if(!dialog.open)return;
   if(!next||!Array.isArray(next.attendance?.records)||!Array.isArray(next.schedule?.schedules))
     throw Error('正式考勤或排班資料未讀齊');
   render(next.attendance,next.schedule,next.month);
   status(last?.reason||'最新正式資料核對完成；所有紀錄僅供人工確認。');
  }catch(e){
   if(!dialog.open)return;
   status('最新雲端核對未完成：'+String(e?.message||e));
   if(host)host.textContent='請確認連線後重新點選卡片。未驗證資料不會顯示為已漏卡。';
  }
 });
 dialog.querySelector('[data-early-close]')?.addEventListener('click',()=>dialog.close());
 dialog.querySelector('[data-early-attendance]')?.addEventListener('click',()=>{
  dialog.close();
  if(typeof root.launchSystem==='function')root.launchSystem('attendance');
 });
}
return {analyze,render,reset,bind};
});

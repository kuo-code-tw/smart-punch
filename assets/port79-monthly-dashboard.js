/* 79號碼頭 2026-10-30 管理首頁：本月船舶＋考勤唯讀分析。
   不修改打卡、排班、資料庫、後端、既有登入事件。 */
(function(root){
'use strict';
const $=id=>root.document?.getElementById(id);
const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const first=(obj,keys)=>{for(const k of keys){if(obj?.[k]!==undefined&&obj[k]!==null&&obj[k]!=='')return obj[k]}return null};
const numberFrom=(obj,keys)=>num(first(obj,keys));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=0)=>v===null||v===undefined||!Number.isFinite(v)?'—':v.toLocaleString('zh-TW',{minimumFractionDigits:d,maximumFractionDigits:d});
// Text after an employee's name is a job title, not part of the name or a roster group.
function displayPersonName(value){return String(value||'').trim().replace(/\s*[（(]\s*AQC\s*[)）]\s*$/i,'').trim()}
function rosterGroup(value){const v=String(value||'').trim().replace(/\s/g,'').toUpperCase();const m=v.match(/^([ABCD])(?:組)?$/);return m?m[1]+'組':''}
// Group membership must come from a named roster group or an explicit ship-detail group.
// An AQC suffix is a role label and must never be taken as an A/B/C/D group.
function assignPersonGroups(people,scheduleData){
 const idMap=new Map(),nameMap=new Map();
 for(const e of scheduleData?.employees||[]){
  const group=rosterGroup(e.group||e.team||'');
  if(!group)continue;
  const keys=[e.empId,e.id,e.attendanceNo,e.attNo,e.attendanceId].filter(Boolean);
  for(const key of keys)idMap.set(String(key).trim().toUpperCase(),group);
  const name=displayPersonName(e.name||e.empName||'');
  if(name){const old=nameMap.get(name);nameMap.set(name,old&&old!==group?null:group)}
 }
 for(const row of scheduleData?.schedules||[]){
  const group=rosterGroup(row.schedule?.__personnel?.group||row.group||'');
  if(!group)continue;
  const id=String(row.empId||row.id||'').trim().toUpperCase();
  if(id)idMap.set(id,group);
  const name=displayPersonName(row.name||row.empName||'');
  if(name){const old=nameMap.get(name);nameMap.set(name,old&&old!==group?null:group)}
 }
 return (people||[]).map(p=>{
  const id=String(p.id||'').trim().toUpperCase(),name=displayPersonName(p.name);
  return {...p,name,group:idMap.get(id)||nameMap.get(name)||rosterGroup(p.group)||''};
 });
}
const isoMonth=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
function importTimestamp(master){
 const values=[master?.workingSheetImportedAt,master?.workingSheetSource?.importedAt].filter(v=>Number.isFinite(Date.parse(String(v||''))));
 return values.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||'';
}
function taipeiDay(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function weeklyWindow(month,today=taipeiDay()){
 const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
 const end=month===today.slice(0,7)?today:last;
 const start=new Date(Date.parse(end+'T12:00:00Z')-6*86400000).toISOString().slice(0,10);
 return {start,end,future:month>today.slice(0,7)};
}
function weeklyEfficiency(vessels,month,today=taipeiDay()){
 const window=weeklyWindow(month,today),days=Array.from({length:7},(_,i)=>({date:new Date(Date.parse(window.start+'T12:00:00Z')+i*86400000).toISOString().slice(0,10),quantity:0,hours:0,count:0,gph:null})),byDate=new Map(days.map(d=>[d.date,d]));
 for(const s of vessels){const day=byDate.get(s.date),qty=s.containers??s.moves;if(!day||s.deleted||!(qty>0)||!(s.rate>0))continue;day.quantity+=qty;day.hours+=qty/s.rate;day.count++;}
 for(const day of days)if(day.hours>0)day.gph=day.quantity/day.hours;
 return {...window,days};
}
function latestImportedVessels(vessels,limit=5){
 const jobs=new Map();for(const v of vessels){if(v.deleted||!Number.isFinite(Date.parse(String(v.importedAt||''))))continue;const key=v.workingNo||v.name+'|'+v.voyage;const previous=jobs.get(key);if(!previous||Date.parse(v.importedAt)>Date.parse(previous.importedAt))jobs.set(key,v);}
 return [...jobs.values()].sort((a,b)=>Date.parse(b.importedAt)-Date.parse(a.importedAt)||String(a.workingNo).localeCompare(String(b.workingNo))).slice(0,limit);
}
function analyzeVessels(data){
 if(!data||!Array.isArray(data.shipMasters))throw Error('船舶月份資料不完整');
 const versionView=root.P79VesselVersionView||
  (typeof module==='object'&&module.exports&&typeof require==='function'?require('./port79-vessel-versions.js'):null);
 const active=versionView?.collapse?.(data.shipMasters);
 const masters=active?.rows||data.shipMasters;
 const excluded=new Set(active?.excludedWorkingNos||[]);
 const details=(Array.isArray(data.records)?data.records:[]).filter(r=>
  !excluded.has(String(r?.workingNo||'').trim().toUpperCase()));
 let totalMoves=0,validMoves=0,containers=0,validContainers=0,weight=0,weighted=0,rateSum=0,rateCount=0;
 const vessels=masters.map(m=>{
  const moves=numberFrom(m,['totalMoves','sheetTotalMoves'])??(
    (numberFrom(m,['disc'])!==null&&numberFrom(m,['load'])!==null)?
    numberFrom(m,['disc'])+numberFrom(m,['load']):null
  );
  const boxes=numberFrom(m,['totalContainers','ttlCtnr','TTLCtnr','containerCount']);
  const rate=numberFrom(m,['gph','shipGph']);
  if(moves!==null){totalMoves+=moves;validMoves++}
  if(boxes!==null){containers+=boxes;validContainers++}
  if(rate!==null&&rate>=0){rateSum+=rate;rateCount++;if(moves!==null&&moves>0){weight+=moves;weighted+=rate*moves}}
  return {name:String(first(m,['vesselName','shipName','vessel','name'])||'未填船名'),
   workingNo:String(m.workingNo||''),voyage:String(first(m,['voyageE','voyageI','voyage'])||''),
   moves,containers:boxes,rate,importedAt:importTimestamp(m),deleted:m.deleted===true||m.isDeleted===true||!!m.deletedAt,date:attendanceDate({date:first(m,['_cloudLastDate','lastDate','endDate','finishTime'])}),hours:null,status:String(m.status||'')};
 });
 vessels.sort((a,b)=>(b.moves??-1)-(a.moves??-1));
 const people=new Map(),jobHours=new Map();let workHours=0,timedRows=0;
 for(const r of details){
  if(!r||typeof r!=='object')continue;
  const hours=numberFrom(r,['timeHours','workingHours','effectiveHours']);
  if(hours!==null&&hours>0){workHours+=hours;timedRows++;const job=String(r.workingNo||'');jobHours.set(job,(jobHours.get(job)||0)+hours)}
  const id=String(first(r,['empId','employeeId','attNo'])||'').trim();
  const name=displayPersonName(first(r,['name','employeeName']));
  if(!id&&!name)continue;
  const key=id||'NAME:'+name;
  const p=people.get(key)||{name:name||id,id,dept:String(first(r,['dept','department','unit'])||'—'),group:rosterGroup(first(r,['group','employeeGroup','team'])),moves:0,validMoves:0,timedMoves:0,hours:0,hatches:0,validHatches:0};
  if(!p.group)p.group=rosterGroup(first(r,['group','employeeGroup','team']));
  // Hatch covers (H/C) are a separate measure from container Moves.
  // An absent hatch field is unknown, not an invented zero.
  const hatchCount=numberFrom(r,['hatches','hatchCover','hatchCovers','hatchCoverCount','hc']);
  if(hatchCount!==null&&hatchCount>=0){p.hatches+=hatchCount;p.validHatches++;}
  const moves=numberFrom(r,['totalMoves','moves','containers'])??(
   numberFrom(r,['disc'])!==null&&numberFrom(r,['load'])!==null?
   numberFrom(r,['disc'])+numberFrom(r,['load']):null);
  if(moves!==null&&moves>=0){p.moves+=moves;p.validMoves++;if(hours!==null&&hours>0){p.hours+=hours;p.timedMoves+=moves}}
  people.set(key,p);
 }
 for(const v of vessels)v.hours=jobHours.get(v.workingNo)??null;
 const personRows=[...people.values()].filter(p=>p.validMoves>0).map(p=>({...p,hatches:p.validHatches>0?p.hatches:null,efficiency:p.hours>0?p.timedMoves/p.hours:null})).sort((a,b)=>(b.efficiency??-1)-(a.efficiency??-1)||b.moves-a.moves);
 return {count:masters.length,moves:validMoves?totalMoves:null,containers:validContainers?containers:null,
  averageGph:weight>0?weighted/weight:rateCount?rateSum/rateCount:null,
  vessels,people:personRows,workHours:timedRows?workHours:null,timedRows,detailCount:details.length,completeness:{moves:validMoves,containers:validContainers,total:masters.length}};
}
function attendanceDate(r){
 const raw=first(r,['timeStr','datetime','dateTime','timestamp','attendanceTime','clockTime','workDate','date']);
 if(typeof raw==='number')return new Date(raw).toISOString().slice(0,10);
 const m=String(raw??'').match(/(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
 return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):'';
}
function analyzeAttendance(data,month){
 if(!data||!Array.isArray(data.records))throw Error('考勤月份資料不完整');
 const records=data.records,uniquePeople=new Set(),peopleDays=new Set(),weeks=[0,0,0,0,0],seenWeeks=Array.from({length:5},()=>new Set());
 let punchIn=0,punchOut=0,other=0;const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),todayPeople=new Set(),todayLatest=new Map();
 for(const r of records){
  const id=String(first(r,['empId','employeeId','attNo','name','employeeName'])||'').trim();
  if(id)uniquePeople.add(id);
  const day=attendanceDate(r);if(day.startsWith(month)){
   if(id&&/上班|簽到|clock.?in|check.?in/i.test(String(first(r,['type','action','status'])||'')))peopleDays.add(id+'|'+day);
   const week=Math.min(4,Math.max(0,Math.floor((Number(day.slice(8,10))-1)/7)));
   weeks[week]++;
   if(id&&/上班|簽到|clock.?in|check.?in/i.test(String(first(r,['type','action','status'])||'')))seenWeeks[week].add(id);
  }
  const status=String(first(r,['type','action','status'])||'');
  if(day===today&&id){if(/上班|簽到|clock.?in|check.?in/i.test(status))todayPeople.add(id);const stamp=String(first(r,['timeStr','datetime','dateTime','timestamp'])||'');if(!todayLatest.has(id)||stamp>todayLatest.get(id).stamp)todayLatest.set(id,{stamp,status})}
  if(/上班|簽到|clock.?in|check.?in/i.test(status))punchIn++;
  else if(/下班|簽退|clock.?out|check.?out/i.test(status))punchOut++;
  else other++;
 }
 return {recordCount:records.length,peopleCount:uniquePeople.size,personDays:peopleDays.size,
   punchIn,punchOut,other,weeks,today,todayCount:todayPeople.size,todayOnDuty:[...todayPeople].filter(id=>/上班|簽到|clock.?in|check.?in/i.test(todayLatest.get(id)?.status||'')).length,weeklyPeople:seenWeeks.map(s=>s.size),pendingShifts:root.P79AttendanceV6?.buildShifts?root.P79AttendanceV6.buildShifts(records).filter(s=>{const date=String(s.accountingDateKey||s.dateKey||'').replaceAll('/','-');return date.startsWith(month+'-')&&date<today&&(!s.clockIn||!s.clockOut||s.timePrecisionIssue)}).length:null};
}
function analyzeOvertime(data,month){
 if(!data||!Array.isArray(data.schedules))throw Error('排班月份資料不完整');
 const seen=new Set();let hours=0,count=0;
 for(const row of data.schedules)for(const [date,meta] of Object.entries(row.schedule?.__meta||{})){
  if(!date.startsWith(month+'-'))continue;const r=meta?.overtimeReport;
  if(!r?.id||seen.has(String(r.id))||r.deleted===true||r.revoked===true||/撤銷|刪除|取消|revoked|cancel/i.test(String(r.status||'')))continue;
  seen.add(String(r.id));const h=num(r.declaredHours??r.rule?.declaredHours);if(h!==null&&h>=0){hours+=h;count++;}
 }
 return {hours,count};
}
const api={analyzeVessels,analyzeAttendance,analyzeOvertime,attendanceDate,importTimestamp,weeklyWindow,weeklyEfficiency,latestImportedVessels,displayPersonName,rosterGroup,assignPersonGroups};
if(typeof module==='object'&&module.exports)module.exports=api;
root.P79MonthlyDashboard=api;
if(!root.document)return;
let loadedKey='',loading=false,sessionStamp='';
function session(){try{return JSON.parse(root.sessionStorage.getItem('port79_user_session')||'null')}catch(_){return null}}
function permissions(){
 const s=session(),role=String(s?.adminRole||s?.role||'').toLowerCase();
 if(!s||s.punchOnly||!['admin','superadmin'].includes(role))return {vessel:false,attendance:false,schedule:false};
 if(role==='superadmin')return {vessel:true,attendance:true,schedule:true};
 const fine=s.finePermissions?.history||{};
 const allow=String(s.systemPermissions?.history||'none')!=='none';
 return {vessel:allow&&fine['vessel.view']===true,attendance:allow&&fine['attendance.view']===true,schedule:allow&&fine['schedule.view']===true};
}
function statusText(id,value){const e=$(id);if(e)e.textContent=value}
function setMetric(id,value){statusText(id,value)}
function options(){return new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'long'}).format(new Date((month()||isoMonth())+'-01T00:00:00'))}
function month(){return $('p79DashMonth')?.value||isoMonth()}
function selectedMonthTitle(){const [y,m]=(month()||isoMonth()).split('-');return y+'年'+Number(m)+'月'}
function checkMonth(){const m=month();if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(m))throw Error('請選擇正確月份');return m}
function formatBars(id,values,labels){
 const container=$(id);if(!container)return;
 if(!values||!values.length||values.every(n=>n===0)){container.replaceChildren();container.textContent='這個月份沒有可繪製的資料';return}
 const max=Math.max(1,...values);
 container.innerHTML=values.map((v,i)=>'<div class="p79d-bar-col"><span class="p79d-bar-value">'+fmt(v)+'</span><span class="p79d-bar" style="height:'+Math.max(3,Math.round(90*v/max))+'px"></span><span class="p79d-bar-label">'+esc(labels[i]||'')+'</span></div>').join('');
}
function vesselTrend(v){
 const ranked=[...v.vessels].filter(x=>x.moves!==null).sort((a,b)=>b.moves-a.moves).slice(0,12).reverse();
 formatBars('p79DashShipBars',ranked.map(x=>x.moves),ranked.map(x=>x.name.length>8?x.name.slice(0,8)+'…':x.name));
}
function vesselTable(v){
 const el=$('p79DashShipRanking');if(!el)return;
 if(!v.vessels.length){el.innerHTML='<tr><td colspan="6">本月沒有船舶資料</td></tr>';return}
 el.innerHTML=v.vessels.slice(0,6).map((s,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.workingNo)+'</td><td>'+fmt(s.moves)+'</td><td>'+fmt(s.rate,2)+'</td></tr>').join('');
}
function peopleTable(v){
 const el=$('p79DashPeopleRanking');if(!el)return;
 if(!v.people.length){el.innerHTML='<tr><td colspan="5">本月尚無可核對的個人作業明細</td></tr>';return}
 el.innerHTML=v.people.map((p,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(p.name)+'</td><td>'+fmt(p.moves)+'</td><td>'+fmt(p.hatches)+'</td><td>'+fmt(p.efficiency,2)+'</td></tr>').join('');
}
function showVessels(v){
 setMetric('p79DashShipCount',fmt(v.count));setMetric('p79DashMoves',fmt(v.moves));
 setMetric('p79DashContainers',fmt(v.containers));setMetric('p79DashGph',fmt(v.averageGph,2));setMetric('p79DashWorkHours',fmt(v.workHours,1));
 statusText('p79DashWorkHoursNote',v.timedRows<v.detailCount?'部分明細有有效工時':'依有效作業明細');
 vesselTable(v);vesselTrend(v);peopleTable(v);
 statusText('p79DashShipSource','已載入本月船舶歷史資料｜作業量為 Moves；效率為既有 GPH 欄位平均；缺少的欄位不以 0 代替。');
 root.P79ReferenceDashboard?.vessels(v);
 statusText('p79DashPersonSource','個人效率＝有有效工時的作業明細 Moves ÷ 對應工時（參考值）；未提供工時者顯示「—」。');
}
function showOvertime(a){setMetric('p79DashOvertimeHours',fmt(a.hours,1));statusText('p79DashScheduleSource','· 加班依正式申報紀錄統計');}
function showAttendance(a){
 setMetric('p79DashAttendancePeople',fmt(a.peopleCount));
 setMetric('p79DashPunchRecords',fmt(a.recordCount));
 setMetric('p79DashPersonDays',fmt(a.personDays));
 setMetric('p79DashPunchIns',fmt(a.punchIn));setMetric('p79DashAnomalies',fmt(a.pendingShifts));
 const total=a.punchIn+a.punchOut+a.other;
 const percentage=total?Math.round(100*a.punchIn/total):null;
 const donut=$('p79DashDonut');
 if(donut)donut.style.setProperty('--p79d-donut-angle',String(percentage??0)+'%');
 setMetric('p79DashDonutRate',percentage===null?'—':percentage+'%');
 setMetric('p79DashPunchLegend','上班卡 '+fmt(a.punchIn)+' 筆／下班卡 '+fmt(a.punchOut)+' 筆／其他 '+fmt(a.other)+' 筆');
 formatBars('p79DashAttendanceBars',a.weeks,['第1週','第2週','第3週','第4週','第5週']);
 statusText('p79DashAttendanceSource','依正式打卡紀錄統計；出勤人日以有上班卡的日期計算。');
 root.P79ReferenceDashboard?.attendance(a,month());
}
function reset(){
 for(const id of ['p79DashOvertimeHours','p79DashAnomalies','p79DashWorkHours','p79DashShipCount','p79DashMoves','p79DashContainers','p79DashGph','p79DashAttendancePeople','p79DashPunchRecords','p79DashPersonDays','p79DashPunchIns','p79DashDonutRate'])setMetric(id,'—');
 for(const id of ['p79DashShipRanking','p79DashPeopleRanking']){const el=$(id);if(el)el.innerHTML='<tr><td colspan="5">等待月份資料</td></tr>'}
 for(const id of ['p79DashShipBars','p79DashAttendanceBars']){const el=$(id);if(el)el.textContent='等待載入'}
 setMetric('p79DashPunchLegend','尚未讀取考勤資料');
 const donut=$('p79DashDonut');if(donut)donut.style.setProperty('--p79d-donut-angle','0%');
 root.P79ReferenceDashboard?.reset();
}
function accessError(){return '目前登入身分沒有此類歷史資料的檢視權限，請由權限管理員確認。'}
async function request(kind,ym,token,forceCloud){
 const base=String(root.sessionStorage.getItem('port79_gas_url')||'').trim();
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(base))throw Error('尚未取得已驗證的資料服務網址');
 const url=new URL(base);url.searchParams.set('action','historyGetMonthData');url.searchParams.set('type',kind);url.searchParams.set('month',ym);
 url.searchParams.set('token',token);url.searchParams.set('gcToken',token);
 if(!root.P79HistoryRead?.read)throw Error('歷史資料唯讀模組尚未載入');
 return root.P79HistoryRead.read(url.toString(),{forceCloud:forceCloud===true}).then(data=>{
  if(data.month&&String(data.month)!==ym)throw Error('雲端回傳月份與選取月份不同，已拒絕顯示');
  return data;
 });
}
async function load(forceCloud=false){
 if(loading)return;
 const s=session(),p=permissions();if(!s||(!p.vessel&&!p.attendance))return;
 const ym=checkMonth(),token=root.sessionStorage.getItem('port79_user_token')||root.sessionStorage.getItem('port79_admin_token')||'';
 if(!token){statusText('p79DashMessage','沒有管理員登入權杖，請重新登入');return}
 loading=true;const button=$('p79DashRefresh');
 if(button)button.disabled=true;
 reset();root.P79ReferenceDashboard?.setGroupRoster(null,ym);statusText('p79DashMonthLabel',selectedMonthTitle());statusText('p79DashMonthLabel2',selectedMonthTitle());
 statusText('p79DashMessage','正在唯讀查詢 '+selectedMonthTitle()+' 的船舶與考勤資料…');
 const failures=[];
 try{
  for(const [kind,allowed,captionId,render] of [['vessel',p.vessel,'p79DashShipSource',showVessels],['attendance',p.attendance,'p79DashAttendanceSource',showAttendance],['schedule',p.schedule,'p79DashScheduleSource',showOvertime]]){
   if(!allowed){statusText(captionId,accessError());continue}
   try{
    const data=await request(kind,ym,token,forceCloud);
    if(month()!==ym||!$('systems')?.classList.contains('show')||!permissions()[kind])return;
    if(kind==='vessel'&&Array.isArray(data.shipMasters)){
     const report=analyzeVessels(data),range=weeklyWindow(ym);
     if(!range.future&&range.start.slice(0,7)!==ym){
      try{const previous=await request('vessel',range.start.slice(0,7),token,forceCloud);report.weekVessels=[...analyzeVessels(previous).vessels,...report.vessels];}
      catch(error){report.weekError='跨月船舶資料尚未讀齊，請重新讀取';failures.push(report.weekError);}
      if(month()!==ym||!$('systems')?.classList.contains('show')||!permissions().vessel)return;
     }
     render(report);
    }
    else if(kind==='attendance'&&Array.isArray(data.records))render(analyzeAttendance(data,ym));
    else if(kind==='schedule'&&Array.isArray(data.schedules)){
      render(analyzeOvertime(data,ym));
      // Read-only roster grouping for the people-efficiency leaderboard.
      root.P79ReferenceDashboard?.setGroupRoster(data,ym);
    }
    else throw Error('該月份資料結構不完整');
   }catch(error){const message=error?.message||String(error);failures.push((kind==='vessel'?'船舶':kind==='schedule'?'加班':'考勤')+'：'+message);statusText(captionId,'無法載入：'+message); }
  }
  loadedKey=ym;
  statusText('p79DashMessage',failures.length?failures.join('；'):'已讀取 '+selectedMonthTitle()+' 的可用歷史資料。');
 }finally{loading=false;if(button)button.disabled=false;if(month()!==ym&&$('systems')?.classList.contains('show')){loadedKey='';root.setTimeout(()=>load(false).catch(()=>{}),0);}}
}
function showWhenAdmin(){
 const el=$('systems'),s=session(),role=String(s?.adminRole||s?.role||'').toLowerCase();
 const allow=el?.classList.contains('show')&&['admin','superadmin'].includes(role)&&!s?.punchOnly;
 if(!allow){if(sessionStamp||loadedKey){sessionStamp='';loadedKey='';reset();}return;}
 if(sessionStamp===String(s.empId||'')&&loadedKey===month())return;
 sessionStamp=String(s.empId||'');
 if(!loadedKey){root.setTimeout(()=>load(false).catch(e=>{statusText('p79DashMessage',String(e?.message||e))}),150);}
}
function init(){
 if(!$('p79Dashboard'))return;
 const selector=$('p79DashMonth');if(selector&&!selector.value)selector.value=isoMonth();
 statusText('p79DashMonthLabel',selectedMonthTitle());statusText('p79DashMonthLabel2',selectedMonthTitle());
 selector?.addEventListener('change',()=>{loadedKey='';reset();statusText('p79DashMessage','正在準備所選月份資料…');statusText('p79DashMonthLabel',selectedMonthTitle());statusText('p79DashMonthLabel2',selectedMonthTitle());showWhenAdmin()});
 $('p79DashRefresh')?.addEventListener('click',()=>{loadedKey='';load(true).catch(e=>statusText('p79DashMessage',String(e?.message||e)))});
 const el=$('systems');if(el&&root.MutationObserver){const obs=new root.MutationObserver(showWhenAdmin);obs.observe(el,{attributes:true,attributeFilter:['class']})}
 showWhenAdmin();
}
if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);

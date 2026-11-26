/* User-selected dashboard for work-hours only. Official data, read-only.
 * All original workflow functions, HR permissions, attendance pairing and
 * overtime report writes remain in work-hours/index.html unchanged. */
(function(){
 'use strict';
 if(typeof window==='undefined'||typeof document==='undefined')return;
 const id=x=>document.getElementById(x), em='—';
 const say=(x,v)=>{const e=id(x);if(e)e.textContent=String(v===null||v===undefined?em:v)};
 const format=n=>Number.isFinite(n)?new Intl.NumberFormat('zh-TW',{maximumFractionDigits:1}).format(n):em;
 const round=n=>Math.round(n*10)/10;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dateTaipei=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const state={tab:'all',page:1,all:[],current:null};
 // Read-only, same-account local snapshots. Never inject preview rows into
 // the authoritative ledger or grant write/export permission from a cache.
 const localDisplay={key:'',month:'',roster:null,raw:null,loading:false,done:false,revision:0,generation:0};
 function localIdentity(month){
  try{
   const token=typeof currentPort79SsoToken==='function'?currentPort79SsoToken():'';
   const viewer=window.Port79DataCache?.viewerKey?.()||'';
   if(!token||!viewer||!hasValidHomepageAdminSession()||!window.P79WorkhoursCache?.enabled?.())return '';
   const session=JSON.parse(window.sessionStorage?.getItem?.('port79_user_session')||'null');
   return JSON.stringify([token,viewer,typeof getActiveGasUrl==='function'?getActiveGasUrl():'',
    session?.systemPermissions||{},session?.dataScope||{},session?.dataScopeJobs||{},session?.finePermissions||{},
    window.sessionStorage?.getItem?.('port79_cache_mutated_at')||'',month]);
  }catch(_){return '';}
 }
 function readLocalDisplay(month){
  const key=localIdentity(month);
  if(localDisplay.key!==key||localDisplay.month!==month){
   Object.assign(localDisplay,{key,month,roster:null,raw:null,loading:false,done:false,revision:localDisplay.revision+1,generation:localDisplay.generation+1});
  }
  if(!key||localDisplay.loading||localDisplay.done)return localDisplay;
  localDisplay.loading=true;
  const generation=localDisplay.generation;
  const current=()=>localDisplay.generation===generation&&localDisplay.key===key&&localDisplay.month===month&&localIdentity(month)===key&&
    !(typeof p79WorkOvertimeMonths!=='undefined'&&p79WorkOvertimeMonths.get(month)?.previewInvalidated);
  const onLocal=()=>{localDisplay.revision++;if(id('viewAdmin')?.classList.contains('p79-ref-active')&&!document.hidden)refresh();};
  const cache=window.Port79DataCache;
  const roster=Promise.resolve().then(()=>cache?.getSchedulePreview?.(month,{strict:true})).then(x=>{
   if(current()&&Array.isArray(x?.data?.schedules)){localDisplay.roster=x.data.schedules;onLocal();}
  }).catch(()=>{});
  const raw=Promise.resolve().then(()=>cache?.getDisplaySnapshot?.('workhours',{timeoutMs:10000})).then(x=>{
   const d=x?.data;
   if(current()&&d?.fullDatabase===true&&Array.isArray(d.records)&&Array.isArray(d.monthStats)&&
       d.monthStats.some(m=>m.month===month&&m.ok===true)){
    localDisplay.raw=d.records;onLocal();
   }
  }).catch(()=>{});
  void Promise.all([roster,raw]).finally(()=>{
   if(localDisplay.generation===generation&&localDisplay.key===key){localDisplay.loading=false;localDisplay.done=true;localDisplay.revision++;}
  });
  return localDisplay;
 }
 function cachedReportRows(rosterRows,month,allow){
  const out=[];
  if(!Array.isArray(rosterRows)||typeof p79WorkOvertimeOfficialReport!=='function')return out;
  for(const entry of rosterRows){
   const who=empId(entry);if(!allow.has(who))continue;
   for(const [day,meta] of Object.entries(entry.schedule?.__meta||{})){
    const report=meta?.overtimeReport;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!p79WorkOvertimeOfficialReport(report,meta))continue;
    const credit=String(report.overtimeDate||meta.overtimeDate||day).slice(0,10);
    if(credit.slice(0,7)!==month)continue;
    // reportVerified here means stored report ID, not current cloud freshness.
    out.push({empId:who,rosterDate:day,dateKey:day,monthKey:month,overtimeDate:credit,
     overtimeReport:report,reportVerified:true,planned:report.planned===true,timeCheckRequired:!!report.attendanceReview});
   }
  }
  return out;
 }
 // The authoritative attendance source is getAttendanceMonthRaw, reused through
 // the application's original validated month loader. Never sum local preview
 // records and claim a full payroll month was fetched.
 const rawCloud={month:'',token:'',revision:'',rows:null,fingerprint:'',readAt:0,attemptAt:0,inflight:null,error:''};
 // The response timestamp/order must not cause a new dashboard paint.
 function recordFingerprint(rows){
  let sum=0,xor=0,length=0;
  for(const row of rows){
   const raw=JSON.stringify(row);let hash=2166136261;
   for(let i=0;i<raw.length;i++)hash=Math.imul(hash^raw.charCodeAt(i),16777619)>>>0;
   sum=(sum+hash)>>>0;xor=(xor^hash)>>>0;length+=raw.length;
  }
  return rows.length+':'+length+':'+sum+':'+xor;
 }
 function verifiedAttendance(month){
  if(typeof currentPort79SsoToken!=='function'||typeof p79ReadWorkRestMonth!=='function'||
     typeof p79WorkRestMonths!=='function'||typeof mergeAttendanceRecordCollections!=='function')return null;
  const token=currentPort79SsoToken();
  if(!token)return null;
  // A new official revision or confirmed edit must invalidate the local hours view.
  const official=typeof p79WorkOvertimeMonths!=='undefined'?p79WorkOvertimeMonths.get(month):null;
  const revision=JSON.stringify([official?.appliedCacheBundle||official?.revision||'',
    typeof lastAttendanceCloudRevision==='undefined'?'':lastAttendanceCloudRevision,
    window.sessionStorage?.getItem?.('port79_cache_mutated_at')||'']);
  if(rawCloud.month!==month||rawCloud.token!==token||rawCloud.revision!==revision){
    rawCloud.month=month;rawCloud.token=token;rawCloud.revision=revision;rawCloud.rows=null;rawCloud.fingerprint='';
    rawCloud.readAt=0;rawCloud.attemptAt=0;rawCloud.inflight=null;rawCloud.error='';
  }
  if(Array.isArray(rawCloud.rows)&&Date.now()-rawCloud.readAt<300000)return rawCloud.rows;
  // The main loader has already fetched and version-verified these adjacent raw
  // months; reusing them avoids three redundant GAS reads.
  const cached=window.P79WorkhoursCache?.verifiedRawMonths?.(month,token);
  if(Array.isArray(cached)&&cached.length&&cached.every(x=>Array.isArray(x.records))){
   const rows=cached.reduce((all,data)=>mergeAttendanceRecordCollections(all,data.records),[]);
   rawCloud.rows=rows;rawCloud.fingerprint=recordFingerprint(rows);
   rawCloud.readAt=Date.now();rawCloud.error='';return rawCloud.rows;
  }
  if(rawCloud.inflight||Date.now()-rawCloud.attemptAt<15000)return rawCloud.rows;
  // Keep confirmed rows visible while refreshing the same official revision.
  rawCloud.attemptAt=Date.now();
  const requestedMonth=month,requestedToken=token,requestedRevision=revision;
  const pending=Promise.all(p79WorkRestMonths(month).map(m=>p79ReadWorkRestMonth(m,token)));
  rawCloud.inflight=pending;
  void pending.then(batches=>{
    if(currentPort79SsoToken()!==requestedToken||rawCloud.month!==requestedMonth||rawCloud.token!==requestedToken||rawCloud.revision!==requestedRevision)return;
    if(batches.some(x=>!Array.isArray(x?.records)))throw Error('正式原始打卡月份資料缺失');
    const rows=batches.reduce((all,data)=>mergeAttendanceRecordCollections(all,data.records),[]);
    const fingerprint=recordFingerprint(rows),changed=fingerprint!==rawCloud.fingerprint||!!rawCloud.error;
    rawCloud.rows=rows;rawCloud.fingerprint=fingerprint;
    rawCloud.readAt=Date.now();rawCloud.error='';
    if(changed)refresh();
  }).catch(err=>{
    if(rawCloud.month!==requestedMonth||rawCloud.token!==requestedToken||rawCloud.revision!==requestedRevision)return;
    const message=String(err?.message||err);
    if(message!==rawCloud.error){rawCloud.error=message;if(!Array.isArray(rawCloud.rows))refresh();}
  }).finally(()=>{
    if(rawCloud.inflight===pending)rawCloud.inflight=null;
  });
  return rawCloud.rows;
 }
 const job=e=>String(e?.jobTitle||e?.deptDetail||'未設定職稱').trim();
 const empId=e=>String(e?.empId||'').trim().toUpperCase();
 const unit=e=>String(typeof p79OvertimeUnitOfPerson==='function'?p79OvertimeUnitOfPerson(e):'').trim();
 const verifiedPolicy=()=>window.Port79JobTitleVisibility?.ready?.()===true;
 const visibleJob=x=>verifiedPolicy()&&window.Port79JobTitleVisibility.isVisible(x);
 const currentFilter=()=>({unit:id('prUnit')?.value||'ALL',job:id('prJob')?.value||'ALL',person:id('prPerson')?.value||'ALL',start:id('prStart')?.value||'',end:id('prEnd')?.value||''});
 const stroke=new Intl.Collator('zh-Hant-u-co-stroke',{numeric:true});
 function options(el,values,placeholder){
  if(!el)return;
  const signature=JSON.stringify([values,placeholder]);
  if(el.dataset.signature!==signature){
   const old=el.value;
   el.replaceChildren();
   [{value:'ALL',label:placeholder},...values].forEach(x=>{
    const op=document.createElement('option');op.value=x.value;op.textContent=x.label;el.appendChild(op)});
   el.value=values.some(x=>x.value===old)?old:'ALL';
   el.dataset.signature=signature;
  }
 }
 function attendanceSessions(recordsSource,scope,from,to){
  if(typeof buildDailyAttendanceRows!=='function'||typeof getAttendanceTimestamp!=='function')return[];
  const allow=new Set(scope.map(empId));
  // The original attendance database can have older rows with an attendance
  // number but no employee ID. Resolve only an unambiguous number in the FULL
  // HR roster. Explicit but disallowed employee IDs may never be rescued.
  const normalize=x=>typeof normalizeAttendanceStatsAttNo==='function'
   ?normalizeAttendanceStatsAttNo(x):String(x||'').trim().replace(/^0+/,'');
  const byAtt=new Map();
  const roster=typeof employees!=='undefined'&&Array.isArray(employees)?employees:[];
  for(const e of roster){
   const key=normalize(e.attNo);if(!key)continue;
   byAtt.set(key,byAtt.has(key)?null:e);
  }
  const owner=r=>{
    const direct=empId(r);
    if(direct)return allow.has(direct)?direct:null;
    const unique=byAtt.get(normalize(r.attNo));
    return unique&&allow.has(empId(unique))?empId(unique):null;
  };
  const filtered=recordsSource.filter(owner).map(r=>{
    const resolved=owner(r);
    return empId(r)?r:{...r,empId:resolved};
  });
  const result=[],seen=new Set();
  for(const row of buildDailyAttendanceRows(filtered)){
   if(!row.clockIn||!row.clockOut)continue;
   const employee=empId(row.clockIn)||empId(row);
   if(!allow.has(employee))continue;
   const date=String(row.accountingDateKey||row.dateKey||'').replaceAll('/','-').slice(0,10);
   if(date<from||date>to)continue;
   const a=getAttendanceTimestamp(row.clockIn),b=getAttendanceTimestamp(row.clockOut);
   const minutes=Math.floor((b-a)/60000);
   // The official pairing method refuses shifts longer than 24h; do not guess.
   if(!Number.isFinite(minutes)||minutes<=0||minutes>1440)continue;
   const key=employee+'|'+String(row.clockIn.id||row.clockIn.timeStr||a)+'|'+String(row.clockOut.id||row.clockOut.timeStr||b);
   if(seen.has(key))continue;seen.add(key);
   result.push({empId:employee,date,minutes});
  }
  return result;
 }
 function status(report,row){
  if(row?.timeCheckRequired||report?.attendanceReview||report?.attendanceState==='rest'||
     (typeof p79WorkOvertimeIsUnconfirmedPlan==='function'&&p79WorkOvertimeIsUnconfirmedPlan(row)))return'review';
  const raw=String(report?.status||'').trim();
  if(/已核准|已核準|approved/i.test(raw))return'approved';
  if(/駁回|退回|reject/i.test(raw))return'rejected';
  if(/待審|待核准|審核中|pending/i.test(raw))return'review';
  return'applied'; // Official report ID does NOT imply approval.
 }
 // Operational KPIs only use official, already de-duplicated, permission-scoped
 // applications from compute(). No punch statistics or planned overtime.
 function applicationMetrics(reports){
  const completed=reports.filter(r=>r.status==='approved'||r.status==='rejected').length;
  const restApplicants=new Set(reports.filter(r=>r.category==='休').map(r=>r.empId).filter(Boolean)).size;
  return{applications:reports.length,reviewRate:reports.length?round(completed/reports.length*100):null,restApplicants};
 }
 function compute(force=false){
  if(typeof hasValidHomepageAdminSession!=='function'||!hasValidHomepageAdminSession()||
     typeof p79WorkhoursEligibleEmployees!=='function')
    return{ok:false,reason:'尚未完成工時系統登入及權限核對'};
  const f=currentFilter(),month=f.start.slice(0,7);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(f.start)||!/^\d{4}-\d{2}-\d{2}$/.test(f.end)||f.end<f.start||
     f.start.slice(0,7)!==f.end.slice(0,7))
    return{ok:false,reason:'請選擇同一月份的有效日期，跨月時需分月核對申報歸屬'};
  if(!verifiedPolicy())
    return{ok:false,reason:window.Port79JobTitleVisibility?.status?.()==='error'?
      '人資隱藏職稱設定讀取失敗，請確認權限與正式雲端連線':'正在核對人資隱藏職稱設定'};
  const roster=p79WorkhoursEligibleEmployees().filter(e=>empId(e)&&empId(e)!=='ADMIN'&&visibleJob(job(e)));
  const units=[...new Set(roster.map(unit).filter(Boolean))].sort(stroke.compare);
  options(id('prUnit'),units.map(x=>({value:x,label:x})),'全部單位');
  const fUnit=id('prUnit').value;
  const inUnit=roster.filter(e=>fUnit==='ALL'||unit(e)===fUnit);
  const jobs=[...new Set(inUnit.map(job).filter(Boolean))].sort(stroke.compare);
  options(id('prJob'),jobs.map(x=>({value:x,label:x})),'全部職稱');
  const fJob=id('prJob').value;
  const matches=inUnit.filter(e=>fJob==='ALL'||job(e)===fJob);
  const names=fUnit==='ALL'?[]:matches.slice().sort((a,b)=>stroke.compare(a.name||'',b.name||'')||stroke.compare(empId(a),empId(b)));
  options(id('prPerson'),names.map(e=>({value:empId(e),label:String(e.name||'未命名')+'（'+empId(e)+'）'})),
    fUnit==='ALL'?'請先選擇單位':'全部姓名');
  id('prPerson').disabled=fUnit==='ALL';
  const person=id('prPerson').value;
  const scoped=matches.filter(e=>person==='ALL'||empId(e)===person);
  const allow=new Set(scoped.map(empId)),byId=new Map(scoped.map(e=>[empId(e),e]));
  const verified=()=>typeof p79WorkOvertimeMonthVerified==='function'&&p79WorkOvertimeMonthVerified(month);
  const getOfficialMonth=()=>typeof p79WorkOvertimeMonths==='undefined'?null:p79WorkOvertimeMonths.get(month);
  const token=typeof currentPort79SsoToken==='function'?currentPort79SsoToken():'';
  if(!token)return{ok:false,reason:'尚未確認登入'};
  // Query is local-first. Do not start another full month read for filtering,
  // and throttle explicit retry after a lock/timeout instead of piling up GAS calls.
  const before=getOfficialMonth();
  const retry=force&&before&&!before.pending&&Date.now()-Number(before.at||0)>=(before.error?10000:30000);
  if((retry||(!verified()&&!before?.error&&!before?.pending))&&typeof p79LoadWorkOvertimeMonths==='function'&&
      typeof records!=='undefined'&&Array.isArray(records))
   p79LoadWorkOvertimeMonths(records,month,!!retry);
  const official=getOfficialMonth(),isVerified=verified();
  const sameAccount=official?.token===token;
  const invalidated=sameAccount&&official.previewInvalidated===true;
  const local=!invalidated?readLocalDisplay(month):null;
  const rosterAvailable=sameAccount&&official?.ready&&official.source!=='2026-10-provisional'&&Array.isArray(official.rows);
  const rosterRows=rosterAvailable?official.rows:Array.isArray(local?.roster)?local.roster:null;
  const reportsAvailable=isVerified||Array.isArray(rosterRows);
  // Keep using the native verified ledger for a confirmed month. While waiting
  // or after a transient read failure, build a separate DISPLAY-ONLY snapshot.
  const verifiedRows=isVerified&&typeof buildOvertimeStatisticsRows==='function'?buildOvertimeStatisticsRows():[];
  const source=isVerified?[...(Array.isArray(verifiedRows)?verifiedRows:[]),...(p79OvertimeCalculationCache?.plannedRows||[])]:
    cachedReportRows(rosterRows,month,allow);
  const reports=[],seen=new Set();
  for(const row of source){
   const report=row?.overtimeReport,who=empId(row),idKey=String(report?.id||'').trim();
   if(!idKey||!allow.has(who)||row.reportVerified!==true||
      typeof p79WorkOvertimeOfficialReport!=='function'||!p79WorkOvertimeOfficialReport(report))continue;
   if(typeof p79WorkOvertimeLedgerMonth!=='function'||String(p79WorkOvertimeLedgerMonth(row))!==month)continue;
   const credit=String(report.overtimeDate||row.overtimeDate||row.rosterDate||row.dateKey||'').slice(0,10);
   if(credit<f.start||credit>f.end)continue;
   const unique=who+'|'+idKey+'|'+String(row.rosterDate||row.dateKey||'');
   if(seen.has(unique))continue;seen.add(unique);
   const stat=status(report,row),h=Number(report.declaredHours);
   const countable=stat!=='review'&&stat!=='rejected'&&[4,8].includes(h);
   const ref=byId.get(who);
   reports.push({id:idKey,empId:who,name:String(ref?.name||row.name||''),unit:unit(ref||row),job:job(ref||row),
    submitDate:String(report.submittedAt||report.createdAt||'').slice(0,10),
    workDate:String(row.rosterDate||row.dateKey||''),creditDate:credit,category:String(report.category||''),
    reason:String(report.reason||report.note||''),rawHours:countable?h:null,unverified:stat!=='review'&&stat!=='rejected'&&!countable,
    status:stat});
  }
  const active=reports.filter(r=>r.rawHours!=null);
  const invalid=reports.filter(r=>r.unverified).length;
  const overtime=active.reduce((sum,r)=>sum+r.rawHours,0);
  const freshRaw=isVerified?verifiedAttendance(month):null;
  // Use the already loaded local raw data first, but do not turn a missing
  // month into a false zero. A locally available subset is labeled a preview.
  const localLoaded=!invalidated&&rosterAvailable&&window.P79WorkhoursCache?.enabled?.()&&typeof records!=='undefined'&&Array.isArray(records)
   ?records.filter(r=>String(r.timeStr||r.dateKey||'').replaceAll('/','-').slice(0,7)===month):[];
  const sourceRecords=Array.isArray(freshRaw)?freshRaw:Array.isArray(local?.raw)?local.raw:localLoaded.length?records:null;
  if(!reportsAvailable&&!Array.isArray(sourceRecords)){
   return{ok:false,reason:invalidated?'權限或資料範圍已變更，舊快取已停止顯示':
    official?.error?'本機尚無此月份可用快取；雲端讀取失敗：'+official.error+'。請按查詢重試。':
    '正在讀取本機資料，雲端在背景同步；此月份尚無可顯示快取'};
  }
  const sessions=sourceRecords?attendanceSessions(sourceRecords,scoped,f.start,f.end):[];
  const rawHours=round(sessions.reduce((sum,s)=>sum+s.minutes,0)/60);
  const dates=[],today=dateTaipei();
  // Date-only keys are UTC calendar dates here. Using +08:00 then slicing
  // toISOString would shift the trend labels back one calendar day.
  const startDate=Date.parse(f.start+'T00:00:00Z'),endDate=Date.parse(f.end+'T00:00:00Z');
  const allDays=Math.floor((endDate-startDate)/86400000)+1;
  for(let i=Math.max(0,allDays-30);i<allDays;i++){
   const d=new Date(startDate+i*86400000).toISOString().slice(0,10);
   dates.push({date:d,hours:round(sessions.filter(r=>r.date===d).reduce((a,r)=>a+r.minutes,0)/60),
    overtime:round(active.filter(r=>r.creditDate===d).reduce((a,r)=>a+r.rawHours,0))});
  }
  return{ok:true,month,scope:scoped,selectedPerson:person,reportsAvailable,preview:!isVerified||!Array.isArray(freshRaw),
   reportPreview:!isVerified,attendancePreview:!Array.isArray(freshRaw),syncError:sameAccount?official?.error||'':'',
   attendanceAvailable:Array.isArray(sourceRecords),attendanceError:rawCloud.error,
   sessions,rawHours,overtime,invalid,reports:reports.sort((a,b)=>b.creditDate.localeCompare(a.creditDate)||b.id.localeCompare(a.id)),
   trend:dates,attenders:new Set(sessions.map(s=>s.empId)).size,
   pending:reports.filter(r=>r.status==='review').length};
 }
 function trendSvg(points,includeAttendance=true,includeOvertime=true){
  if(!points.length)return'<div class="pr-message">這個期間沒有可核對的日期</div>';
  const w=670,h=202,L=48,R=14,T=15,B=29,max=Math.max(1,...points.flatMap(p=>[includeAttendance?p.hours:0,includeOvertime?p.overtime:0]));
  const ceil=Math.ceil(max/5)*5,ww=w-L-R,hh=h-T-B;
  const x=i=>L+((points.length===1?.5:i/(points.length-1))*ww);
  const y=val=>T+hh*(1-val/ceil);
  const line=k=>points.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p[k]).toFixed(1)).join(' ');
  let body='';
  for(let i=0;i<=4;i++){const value=ceil*i/4;body+='<line x1="'+L+'" x2="'+(w-R)+'" y1="'+y(value)+'" y2="'+y(value)+'" stroke="#e1eaf5"/><text x="'+(L-7)+'" y="'+(y(value)+4)+'" text-anchor="end" font-size="11" fill="#496b90">'+format(value)+'</text>'}
  if(includeAttendance)body+='<path fill="none" stroke="#087efa" stroke-width="3" d="'+line('hours')+'"/>';
  if(includeOvertime)body+='<path fill="none" stroke="#11a442" stroke-width="3" d="'+line('overtime')+'"/>';
  points.forEach((p,i)=>{if(i%Math.max(1,Math.ceil(points.length/7))===0||i===points.length-1)body+='<text x="'+x(i)+'" y="'+(h-6)+'" font-size="11" text-anchor="middle">'+esc(p.date.slice(5))+'</text>';if(includeOvertime)body+='<circle r="3" fill="white" stroke="#11a442" stroke-width="2" cx="'+x(i)+'" cy="'+y(p.overtime)+'"><title>'+esc(p.date)+'：加班申報 '+p.overtime+' 小時</title></circle>'});
  return'<svg class="pr-svg" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="目前可用資料的工時趨勢">'+body+'</svg>';
 }
 function paint(data){
  state.current=data;
  const ok=data.ok,attendance=ok&&data.attendanceAvailable,hasReports=ok&&data.reportsAvailable!==false;
  const preview=ok&&data.preview;
  const message=preview?'已顯示'+(data.reportPreview?'本機／最近加班資料':'已核對加班資料')+
    (attendance?'、'+(data.attendancePreview?'本機打卡資料（可能未完整）':'已核對打卡資料'):'；打卡尚無快取')+
    (!hasReports?'；本機尚無此月份加班快取':'')+
    (data.syncError?'；雲端同步未完成：'+data.syncError+'，保留目前資料，可按查詢重試。':'；雲端背景核對中，非最新結算資料。'):
    '資料來源：正式原始打卡月份及加班申報已核對；打卡區間時數不等於薪資結算工時。';
  say('prDataStatus',ok?message:'資料狀態：'+data.reason);
  id('prDataStatus').dataset.error=!ok||!!data.syncError?'true':'false';
  const metrics=hasReports?applicationMetrics(data.reports):null;
  const label=data.reportPreview?'快取資料，待雲端核對':'依正式申報';
  say('prKpiApplications',hasReports?format(metrics.applications):em);
  say('prKpiReviewRate',hasReports&&metrics.reviewRate!==null?format(metrics.reviewRate):em);
  say('prKpiRestApplicants',hasReports?format(metrics.restApplicants):em);
  say('prKpiPending',hasReports?data.pending:em);
  say('prKpiApplicationsNote',hasReports?label:'本機尚無加班資料');
  say('prKpiReviewRateNote',hasReports?(data.reportPreview?label:metrics.applications?'核准及駁回件數 ÷ 正式申請':'本期間尚無正式申請'):'審核狀態尚未核對');
  say('prKpiRestApplicantsNote',hasReports?(data.reportPreview?label:'正式休息日加班申請，依人員去重'):'休息日申請尚未核對');
  say('prKpiPendingNote',hasReports?label:'申報狀態待核對');
  id('prTrend').innerHTML=attendance||hasReports?trendSvg(data.trend,attendance,hasReports):'<div class="pr-message">本機尚無可顯示資料</div>';
  // A report can be credited to a different month than the physical punch.
  // Do not subtract such hours from this month's clock intervals or label
  // the remainder as normal hours unless every report has local punch evidence.
  const reportSums=new Map();if(ok)for(const r of data.reports){
    if(r.rawHours==null)continue;
    const k=r.empId+'|'+r.creditDate;
    reportSums.set(k,(reportSums.get(k)||0)+r.rawHours);
  }
  const sessionSums=new Map();if(ok)for(const r of data.sessions){
    const k=r.empId+'|'+r.date;
    sessionSums.set(k,(sessionSums.get(k)||0)+r.minutes/60);
  }
  const matched=ok&&[...reportSums].every(([k,h])=>sessionSums.has(k)&&h<=sessionSums.get(k));
  const ratio=attendance&&hasReports&&!preview&&!data.invalid&&matched&&data.rawHours>0&&data.overtime<=data.rawHours?
    Math.min(100,Math.max(0,data.overtime/data.rawHours*100)):null;
  id('prDonut').style.background=ratio===null?'conic-gradient(#dbe7f6 0 100%)':
    'conic-gradient(#087efa 0 '+(100-ratio)+'%,#18ae66 '+(100-ratio)+'% 100%)';
  say('prDonutTotal',attendance?format(data.rawHours):em);
  say('prNormal',ratio===null?em:format(round(data.rawHours-data.overtime))+' 小時');
  say('prOvertimeComposition',ratio===null?em:format(round(data.overtime))+' 小時');
  say('prOvertimePercent',ratio===null?em:format(round(ratio))+'%');
  const names=[{label:'平日加班',categories:['延'],hours:0},{label:'休息日加班',categories:['休'],hours:0},
   {label:'例假日加班',categories:['例','國'],hours:0},{label:'其他加班',categories:[],hours:0}];
  if(hasReports)for(const report of data.reports){
   if(report.rawHours===null)continue;
   const cat=names.find(c=>c.categories.includes(report.category))||names[3];cat.hours+=report.rawHours;
  }
  const display=names.filter(c=>c!==names[3]||c.hours>0);
  const max=Math.max(1,...display.map(c=>c.hours));
  id('prBreakdown').innerHTML=display.map(c=>'<div class="pr-breakdown-row"><span>'+esc(c.label)+'</span><div class="pr-bar"><span style="width:'+(hasReports?round(c.hours/max*100):0)+'%"></span></div><span>'+((hasReports&&!data.invalid)?format(c.hours)+' 小時':em)+'</span><span>'+((hasReports&&!data.invalid&&data.overtime>0)?format(round(c.hours/data.overtime*100))+'%':em)+'</span></div>').join('')+
   '<div class="pr-breakdown-total"><span>合計</span><strong>'+(hasReports&&!data.invalid?format(data.overtime)+' 小時':em)+'</strong></div>';
  const person=ok&&data.selectedPerson!=='ALL'?data.scope.find(e=>empId(e)===data.selectedPerson):null;
  say('prPersonalTitle',person?.name||'請選擇姓名');
  const personalSessions=person?data.sessions.filter(s=>s.empId===empId(person)):[];
  const personalOt=person?data.reports.filter(r=>r.empId===empId(person)&&r.rawHours!=null):[];
  say('prPersonalScheduled',em); // cannot assert expected hours without official shift length.
  say('prPersonalActual',personalSessions.length?format(round(personalSessions.reduce((s,r)=>s+r.minutes,0)/60))+' 小時':em);
  say('prPersonalOT',personalOt.length?format(round(personalOt.reduce((s,r)=>s+r.rawHours,0)))+' 小時':em);
  say('prPersonalMissing',em); // never invent absences from raw punch intervals.
  drawTable(hasReports?data.reports:[]);
 }
 function listCategory(r){
  return r.category==='延'?'平日加班':r.category==='休'?'休息日加班':r.category==='例'?'例假日加班':r.category==='國'?'國定假日加班':'其他加班';
 }
 function listPeople(rows,unit,job){
  const people=new Map();
  for(const r of rows){
   if((unit!=='ALL'&&r.unit!==unit)||(job!=='ALL'&&r.job!==job)||!r.empId||!r.name)continue;
   if(!people.has(r.empId))people.set(r.empId,{value:r.empId,label:r.name});
  }
  const names=new Map();
  for(const p of people.values())names.set(p.label,(names.get(p.label)||0)+1);
  return [...people.values()].sort((a,b)=>stroke.compare(a.label,b.label)||stroke.compare(a.value,b.value))
   .map(p=>({value:p.value,label:names.get(p.label)>1?p.label+'（'+p.value+'）':p.label}));
 }
 function filterApplications(rows,f){
  return rows.filter(r=>(f.unit==='ALL'||r.unit===f.unit)&&(f.job==='ALL'||r.job===f.job)&&
   (f.name==='ALL'||r.empId===f.name)&&
   (f.type==='ALL'||listCategory(r)===f.type));
 }
 function listFilters(rows){
  const choices=values=>[...new Set(values.filter(Boolean))].sort(stroke.compare).map(x=>({value:x,label:x}));
  const unitControl=id('prListUnit'),jobControl=id('prListJob'),typeControl=id('prListType');
  options(unitControl,choices(rows.map(r=>r.unit)),'全部單位');
  const unit=unitControl?.value||'ALL';
  options(jobControl,choices(rows.filter(r=>unit==='ALL'||r.unit===unit).map(r=>r.job)),'全部職稱');
  const job=jobControl?.value||'ALL',nameControl=id('prListName');
  options(nameControl,listPeople(rows,unit,job),'全部姓名');
  options(typeControl,choices(rows.map(listCategory)),'全部類型');
  return {unit,job,name:nameControl?.value||'ALL',type:typeControl?.value||'ALL'};
 }
 function drawTable(rows){
  state.all=rows;
  const filters=listFilters(rows);
  const filtered=filterApplications(rows,filters);
  for(const [key,label]of [['all','全部'],['review','待審核'],['approved','已核准'],['rejected','已駁回']]){
   const button=id('prTab'+key);
   button.textContent=label+' ('+(state.current?.ok&&state.current.reportsAvailable!==false?filtered.filter(r=>key==='all'||r.status===key).length:em)+')';
   button.classList.toggle('is-current',state.tab===key);
  }
  const selected=filtered.filter(r=>state.tab==='all'||r.status===state.tab);
  const pages=Math.max(1,Math.ceil(selected.length/5));state.page=Math.min(pages,Math.max(1,state.page));
  const shown=selected.slice((state.page-1)*5,state.page*5);
  const body=id('prTableBody');body.replaceChildren();
  if(!shown.length){const r=body.insertRow(),c=r.insertCell();c.colSpan=11;c.textContent=state.current?.ok&&state.current.reportsAvailable!==false?(state.current.reportPreview?'本機快取沒有符合條件的申報，雲端尚未核對':'沒有符合條件的正式申報'):'本機尚無此月份加班資料';}
  for(const r of shown){
   const tr=body.insertRow();
   const cells=['□',r.submitDate||em,r.name,r.unit||em,r.job,r.workDate,
    r.rawHours==null?em:format(r.rawHours)+' 小時',
    listCategory(r),
    r.reason||em];
   for(const label of cells){tr.insertCell().textContent=label}
   const badge=document.createElement('span');badge.className='pr-chip';badge.dataset.status=r.status;
   badge.textContent=({applied:'已申報',approved:'已核准',review:'待核對',rejected:'已駁回'})[r.status];
   tr.insertCell().append(badge);
   const action=document.createElement('button');action.type='button';action.className='pr-action';action.textContent='詳情';action.addEventListener('click',()=>legacy('overtime'));
   tr.insertCell().append(action);
  }
  say('prShown','顯示 '+(selected.length?(state.page-1)*5+1:0)+' - '+Math.min(state.page*5,selected.length)+' 筆，共 '+selected.length+' 筆');
  const nav=id('prPages');nav.replaceChildren();
  const pageButton=(label,p)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.classList.toggle('is-current',p===state.page&&label===String(p));b.disabled=p<1||p>pages;b.addEventListener('click',()=>{state.page=p;drawTable(state.all)});nav.append(b)};
  pageButton('‹',state.page-1);for(let p=Math.max(1,state.page-2);p<=Math.min(pages,state.page+2);p++)pageButton(String(p),p);pageButton('›',state.page+1);
 }
 function legacy(target){
  const view=id('viewAdmin');if(!view)return;
  view.classList.remove('p79-ref-active');id('prReturn').hidden=false;
  window.P79OvertimeTabs?.syncTo?.('overview');
  if(typeof switchAdminTab==='function')switchAdminTab(['stats','records','live'].includes(target)?target:'overtime');
  if(target==='report'&&typeof p79CanReportOvertime==='function'&&p79CanReportOvertime())window.P79Overtime?.openReport?.();
  if(target==='audit'&&typeof p79CanExportOvertimeApplication==='function'&&p79CanExportOvertimeApplication())window.P79OvertimeStatus?.open?.();
 }
 function autoSignature(){
  const month=String(id('prStart')?.value||'').slice(0,7);
  const official=typeof p79WorkOvertimeMonths!=='undefined'?p79WorkOvertimeMonths.get(month):null;
  return JSON.stringify([typeof currentPort79SsoToken==='function'?currentPort79SsoToken():'',
   id('prStart')?.value||'',id('prEnd')?.value||'',official?.revision||'',
   official?.appliedCacheBundle||'',official?.pending||false,official?.ready||false,
   official?.cachePreview||false,official?.error||'',
   typeof lastAttendanceCloudRevision==='undefined'?'':lastAttendanceCloudRevision,
   window.sessionStorage?.getItem?.('port79_cache_mutated_at')||'',
   window.Port79JobTitleVisibility?.status?.()||'',window.Port79JobTitleVisibility?.revision?.()||0,
    recordFingerprint(official?.rows||[]),official?.previewInvalidated||false,localDisplay.revision,
   typeof records!=='undefined'&&Array.isArray(records)?records.length:0,rawCloud.fingerprint,rawCloud.error]);
 }
 let lastAutoSignature='';
 function refreshOnChange(){
  if(!id('viewAdmin')?.classList.contains('p79-ref-active')||document.hidden)return;
  const signature=autoSignature();
  if(signature===lastAutoSignature)return;
  lastAutoSignature=signature;refresh();
 }
 function refresh(force=false){if(!id('p79WorkhoursReference'))return;try{paint(compute(force))}
  catch(e){say('prDataStatus','無法核對正式資料：'+String(e?.message||e));id('prDataStatus').dataset.error='true'}}
 // The default overview is a genuine page in the same navigation, not a
 // separate destination that must be reached via an extra back button.
 function showReference(){
  const view=id('viewAdmin');if(!view||!id('p79WorkhoursReference'))return false;
  view.classList.add('p79-ref-active');
  const back=id('prReturn');if(back)back.hidden=true;
  refresh();return true;
 }
 window.P79WorkhoursReferenceNav={show:showReference};
 async function mount(){
  const host=id('viewAdmin')?.querySelector('.admin-desktop-content');
  if(!host||id('p79WorkhoursReference'))return;
  let markup;
  try{const resp=await fetch('../assets/port79-workhours-reference-dashboard.html?v=20261117-approved-v1&columns=20261118-no-id-v1&kpis=20261118-ops-v1&listFilters=20261126-inline-v4',{cache:'default'});
   if(!resp.ok)throw Error('HTTP '+resp.status);markup=await resp.text();
   if(!markup.includes('id="p79WorkhoursReference"')||!markup.includes('id="prTableBody"'))throw Error('版型檔格式錯誤');
  }catch(e){console.warn('工時版型尚未讀取完成，保留原本功能',e);return}
  const template=document.createElement('template');template.innerHTML=markup.trim();host.prepend(template.content);
  // Both scripts can initialize in either order (the HTML template is async).
  // The navigation must always be the FIRST child of the real work-hours
  // homepage, above the reference dashboard, not below it or in a hidden pane.
  const tabs=id('p79-overtime-approved-tabs');
  if(tabs)host.insertBefore(tabs,id('p79WorkhoursReference'));
  const back=document.createElement('button');back.type='button';back.id='prReturn';back.hidden=true;back.textContent='返回工時與加班總覽';
  back.style.cssText='border:0;border-radius:8px;padding:7px 12px;background:#087afa;color:white;font-weight:900;margin:8px 0';
  back.addEventListener('click',()=>{if(showReference())window.P79OvertimeTabs?.syncTo?.('home')});
  host.insertBefore(back,id('p79WorkhoursReference').nextSibling);
  id('prStart').value=dateTaipei().slice(0,7)+'-01';
  const now=dateTaipei();const [y,m]=now.slice(0,7).split('-').map(Number);
  id('prEnd').value=y+'-'+String(m).padStart(2,'0')+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0');
  id('prForm').addEventListener('submit',event=>{event.preventDefault();state.page=1;refresh(true)});
  for(const key of ['prListUnit','prListJob','prListType','prListName']){
   id(key)?.addEventListener('change',()=>{
    if(key==='prListUnit'&&id('prListJob'))id('prListJob').value='ALL';
    if((key==='prListUnit'||key==='prListJob')&&id('prListName'))id('prListName').value='ALL';
    state.page=1;drawTable(state.all);
   });
  }
  id('prListReset')?.addEventListener('click',()=>{
   for(const key of ['prListUnit','prListJob','prListType','prListName'])if(id(key))id(key).value='ALL';
   state.page=1;drawTable(state.all);
  });
  document.querySelectorAll('#p79WorkhoursReference [data-pr-tab]').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.prTab;state.page=1;drawTable(state.all)}));
  document.querySelectorAll('#p79WorkhoursReference [data-pr-open]').forEach(b=>b.addEventListener('click',()=>legacy(b.dataset.prOpen)));
  for(const filter of ['prUnit','prJob','prPerson'])id(filter).addEventListener('change',()=>{
   if(filter==='prUnit'){id('prJob').value='ALL';id('prPerson').value='ALL'}
   if(filter==='prJob')id('prPerson').value='ALL';
   state.page=1;refresh()
  });
  showReference();window.P79OvertimeTabs?.syncTo?.('home');
  lastAutoSignature=autoSignature();
 }
 function init(){
  let attempts=0;
  const handle=setInterval(()=>{
   if(id('p79WorkhoursReference')){clearInterval(handle);return}
   if(id('viewAdmin')?.querySelector('.admin-desktop-content')){clearInterval(handle);void mount()}
   else if(++attempts>=50)clearInterval(handle)
  },600);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshOnChange()});
  window.addEventListener('focus',refreshOnChange);
  window.addEventListener('p79-workhours-data-changed',event=>{
   if(event?.detail?.invalidated&&event.detail.month===localDisplay.month){
    Object.assign(localDisplay,{key:'',roster:null,raw:null,loading:false,done:false,revision:localDisplay.revision+1,generation:localDisplay.generation+1});
    Object.assign(rawCloud,{rows:null,fingerprint:'',readAt:0,attemptAt:0,inflight:null,error:'',revision:''});
   }
   refreshOnChange();
  });
  // A changed official revision triggers paint; unchanged snapshots stay put.
  setInterval(refreshOnChange,12000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
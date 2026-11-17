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
 function attendanceSessions(recordsSource,allow,from,to){
  if(typeof buildDailyAttendanceRows!=='function'||typeof getAttendanceTimestamp!=='function')return[];
  const filtered=recordsSource.filter(x=>allow.has(empId(x)));
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
 function compute(){
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
  const verified=typeof p79WorkOvertimeMonthVerified==='function'&&p79WorkOvertimeMonthVerified(month);
  if(!verified){
   // Official original month loader only reads; never calls save.
   if(typeof p79LoadWorkOvertimeMonths==='function'&&typeof records!=='undefined'&&Array.isArray(records))
      p79LoadWorkOvertimeMonths(records,month);
   return{ok:false,reason:'正式雲端加班及班表月份尚未核對完成，不能顯示推估數字'};
  }
  // Derived from the same native, authorized overtime calculation cache.
  if(!p79OvertimeCalculationCache&&typeof buildOvertimeStatisticsRows==='function')buildOvertimeStatisticsRows();
  const source=[...(p79OvertimeCalculationCache?.rows||[]),...(p79OvertimeCalculationCache?.plannedRows||[])];
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
  const sourceRecords=typeof records!=='undefined'&&Array.isArray(records)?records:[];
  const sessions=attendanceSessions(sourceRecords,allow,f.start,f.end);
  const rawHours=round(sessions.reduce((sum,s)=>sum+s.minutes,0)/60);
  const dates=[],today=dateTaipei();
  const startDate=Date.parse(f.start+'T00:00:00+08:00'),endDate=Date.parse(f.end+'T00:00:00+08:00');
  const allDays=Math.floor((endDate-startDate)/86400000)+1;
  for(let i=Math.max(0,allDays-30);i<allDays;i++){
   const d=new Date(startDate+i*86400000).toISOString().slice(0,10);
   dates.push({date:d,hours:round(sessions.filter(r=>r.date===d).reduce((a,r)=>a+r.minutes,0)/60),
    overtime:round(active.filter(r=>r.creditDate===d).reduce((a,r)=>a+r.rawHours,0))});
  }
  return{ok:true,month,scope:scoped,selectedPerson:person,attendanceAvailable:sourceRecords.length>0,
   sessions,rawHours,overtime,invalid,reports:reports.sort((a,b)=>b.creditDate.localeCompare(a.creditDate)||b.id.localeCompare(a.id)),
   trend:dates,attenders:new Set(sessions.map(s=>s.empId)).size,
   pending:reports.filter(r=>r.status==='review').length};
 }
 function trendSvg(points){
  if(!points.length)return'<div class="pr-message">這個期間沒有可核對的日期</div>';
  const w=670,h=202,L=48,R=14,T=15,B=29,max=Math.max(1,...points.flatMap(p=>[p.hours,p.overtime]));
  const ceil=Math.ceil(max/5)*5,ww=w-L-R,hh=h-T-B;
  const x=i=>L+((points.length===1?.5:i/(points.length-1))*ww);
  const y=val=>T+hh*(1-val/ceil);
  const line=k=>points.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p[k]).toFixed(1)).join(' ');
  let body='';
  for(let i=0;i<=4;i++){const value=ceil*i/4;body+='<line x1="'+L+'" x2="'+(w-R)+'" y1="'+y(value)+'" y2="'+y(value)+'" stroke="#e1eaf5"/><text x="'+(L-7)+'" y="'+(y(value)+4)+'" text-anchor="end" font-size="11" fill="#496b90">'+format(value)+'</text>'}
  body+='<path fill="none" stroke="#087efa" stroke-width="3" d="'+line('hours')+'"/><path fill="none" stroke="#11a442" stroke-width="3" d="'+line('overtime')+'"/>';
  points.forEach((p,i)=>{if(i%Math.max(1,Math.ceil(points.length/7))===0||i===points.length-1)body+='<text x="'+x(i)+'" y="'+(h-6)+'" font-size="11" text-anchor="middle">'+esc(p.date.slice(5))+'</text>';body+='<circle r="3" fill="white" stroke="#11a442" stroke-width="2" cx="'+x(i)+'" cy="'+y(p.overtime)+'"><title>'+esc(p.date)+'：正式加班 '+p.overtime+' 小時</title></circle>'});
  return'<svg class="pr-svg" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="依正式資料統計的工時趨勢">'+body+'</svg>';
 }
 function paint(data){
  state.current=data;
  const ok=data.ok,attendance=ok&&data.attendanceAvailable;
  say('prDataStatus',ok?'資料來源：已核對的正式加班申報與目前已同步打卡配對。區間時數不是薪資結算工時。':'資料狀態：'+data.reason);
  id('prDataStatus').dataset.error=ok?'false':'true';
  say('prKpiWork',attendance?format(data.rawHours):em);
  say('prKpiOvertime',ok&&!data.invalid?format(round(data.overtime)):em);
  say('prKpiPeople',attendance?format(data.attenders):em);
  say('prKpiPending',ok?data.pending:em);
  say('prKpiWorkNote',attendance?'已完成簽退的打卡區間時數':'打卡資料待核對');
  say('prKpiOtNote',ok&&!data.invalid?'正式申報，未核實預排不計入':'有申報時數待核對');
  say('prKpiPeopleNote',attendance?'區間內有完整打卡的人數':'完整打卡待核對');
  say('prKpiPendingNote',ok?'正式申報狀態（非預估）':'申報狀態待核對');
  id('prTrend').innerHTML=attendance?trendSvg(data.trend):'<div class="pr-message">正式資料尚未讀齊</div>';
  const ratio=attendance&&!data.invalid&&data.rawHours>0&&data.overtime<=data.rawHours?
    Math.min(100,Math.max(0,data.overtime/data.rawHours*100)):null;
  id('prDonut').style.background=ratio===null?'conic-gradient(#dbe7f6 0 100%)':
    'conic-gradient(#087efa 0 '+(100-ratio)+'%,#18ae66 '+(100-ratio)+'% 100%)';
  say('prDonutTotal',attendance?format(data.rawHours):em);
  say('prNormal',ratio===null?em:format(round(data.rawHours-data.overtime))+' 小時');
  say('prOvertimeComposition',ratio===null?em:format(round(data.overtime))+' 小時');
  say('prOvertimePercent',ratio===null?em:format(round(ratio))+'%');
  const names=[{label:'平日加班',categories:['延'],hours:0},{label:'休息日加班',categories:['休'],hours:0},
   {label:'例假日加班',categories:['例','國'],hours:0},{label:'其他加班',categories:[],hours:0}];
  if(ok)for(const report of data.reports){
   if(report.rawHours===null)continue;
   const cat=names.find(c=>c.categories.includes(report.category))||names[3];cat.hours+=report.rawHours;
  }
  const display=names.filter(c=>c!==names[3]||c.hours>0);
  const max=Math.max(1,...display.map(c=>c.hours));
  id('prBreakdown').innerHTML=display.map(c=>'<div class="pr-breakdown-row"><span>'+esc(c.label)+'</span><div class="pr-bar"><span style="width:'+(ok?round(c.hours/max*100):0)+'%"></span></div><span>'+((ok&&!data.invalid)?format(c.hours)+' 小時':em)+'</span><span>'+((ok&&!data.invalid&&data.overtime>0)?format(round(c.hours/data.overtime*100))+'%':em)+'</span></div>').join('')+
   '<div class="pr-breakdown-total"><span>合計</span><strong>'+(ok&&!data.invalid?format(data.overtime)+' 小時':em)+'</strong></div>';
  const person=ok&&data.selectedPerson!=='ALL'?data.scope.find(e=>empId(e)===data.selectedPerson):null;
  say('prPersonalTitle',person?.name||'請選擇姓名');
  const personalSessions=person?data.sessions.filter(s=>s.empId===empId(person)):[];
  const personalOt=person?data.reports.filter(r=>r.empId===empId(person)&&r.rawHours!=null):[];
  say('prPersonalScheduled',em); // cannot assert expected hours without official shift length.
  say('prPersonalActual',personalSessions.length?format(round(personalSessions.reduce((s,r)=>s+r.minutes,0)/60))+' 小時':em);
  say('prPersonalOT',personalOt.length?format(round(personalOt.reduce((s,r)=>s+r.rawHours,0)))+' 小時':em);
  say('prPersonalMissing',em); // never invent absences from raw punch intervals.
  drawTable(ok?data.reports:[]);
 }
 function drawTable(rows){
  state.all=rows;
  for(const [key,label]of [['all','全部'],['review','待審核'],['approved','已核准'],['rejected','已駁回']]){
   const button=id('prTab'+key);
   button.textContent=label+' ('+rows.filter(r=>key==='all'||r.status===key).length+')';
   button.classList.toggle('is-current',state.tab===key);
  }
  const selected=rows.filter(r=>state.tab==='all'||r.status===state.tab);
  const pages=Math.max(1,Math.ceil(selected.length/5));state.page=Math.min(pages,Math.max(1,state.page));
  const shown=selected.slice((state.page-1)*5,state.page*5);
  const body=id('prTableBody');body.replaceChildren();
  if(!shown.length){const r=body.insertRow(),c=r.insertCell();c.colSpan=12;c.textContent=state.current?.ok?'沒有符合條件的正式申報':'雲端資料尚未確認';}
  for(const r of shown){
   const tr=body.insertRow();
   const cells=['□',r.id,r.submitDate||em,r.name,r.unit||em,r.job,r.workDate,
    r.rawHours==null?em:format(r.rawHours)+' 小時',
    r.category==='延'?'平日加班':r.category==='休'?'休息日加班':r.category==='例'?'例假日加班':r.category==='國'?'國定假日加班':'其他加班',
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
  if(typeof switchAdminTab==='function')switchAdminTab(['stats','records','live'].includes(target)?target:'overtime');
  if(target==='report'&&typeof p79CanReportOvertime==='function'&&p79CanReportOvertime())window.P79Overtime?.openReport?.();
  if(target==='audit'&&typeof p79CanExportOvertimeApplication==='function'&&p79CanExportOvertimeApplication())window.P79OvertimeStatus?.open?.();
 }
 function refresh(){if(!id('p79WorkhoursReference'))return;try{paint(compute())}
  catch(e){say('prDataStatus','無法核對正式資料：'+String(e?.message||e));id('prDataStatus').dataset.error='true'}}
 async function mount(){
  const host=id('viewAdmin')?.querySelector('.admin-desktop-content');
  if(!host||id('p79WorkhoursReference'))return;
  let markup;
  try{const resp=await fetch('../assets/port79-workhours-reference-dashboard.html?v=20261117-approved-v1',{cache:'no-store'});
   if(!resp.ok)throw Error('HTTP '+resp.status);markup=await resp.text();
   if(!markup.includes('id="p79WorkhoursReference"')||!markup.includes('id="prTableBody"'))throw Error('版型檔格式錯誤');
  }catch(e){console.warn('工時版型尚未讀取完成，保留原本功能',e);return}
  const template=document.createElement('template');template.innerHTML=markup.trim();host.prepend(template.content);
  const back=document.createElement('button');back.type='button';back.id='prReturn';back.hidden=true;back.textContent='返回工時與加班總覽';
  back.style.cssText='border:0;border-radius:8px;padding:7px 12px;background:#087afa;color:white;font-weight:900;margin:8px 0';
  back.addEventListener('click',()=>{id('viewAdmin').classList.add('p79-ref-active');back.hidden=true;refresh()});
  host.insertBefore(back,id('p79WorkhoursReference').nextSibling);
  id('prStart').value=dateTaipei().slice(0,7)+'-01';
  const now=dateTaipei();const [y,m]=now.slice(0,7).split('-').map(Number);
  id('prEnd').value=y+'-'+String(m).padStart(2,'0')+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0');
  id('prForm').addEventListener('submit',event=>{event.preventDefault();state.page=1;refresh()});
  document.querySelectorAll('#p79WorkhoursReference [data-pr-tab]').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.prTab;state.page=1;drawTable(state.all)}));
  document.querySelectorAll('#p79WorkhoursReference [data-pr-open]').forEach(b=>b.addEventListener('click',()=>legacy(b.dataset.prOpen)));
  for(const filter of ['prUnit','prJob','prPerson'])id(filter).addEventListener('change',()=>{
   if(filter==='prUnit'){id('prJob').value='ALL';id('prPerson').value='ALL'}
   if(filter==='prJob')id('prPerson').value='ALL';
   state.page=1;refresh()
  });
  id('viewAdmin').classList.add('p79-ref-active');
  refresh();
 }
 function init(){
  let attempts=0;
  const handle=setInterval(()=>{
   if(id('p79WorkhoursReference')){clearInterval(handle);return}
   if(id('viewAdmin')?.querySelector('.admin-desktop-content')){clearInterval(handle);void mount()}
   else if(++attempts>=50)clearInterval(handle)
  },600);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  window.addEventListener('focus',refresh);
  setInterval(()=>{if(id('viewAdmin')?.classList.contains('p79-ref-active')&&!document.hidden)refresh()},12000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
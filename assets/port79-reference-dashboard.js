/* Match the approved dashboard composition. Presentation only; source reads and
   permission checks remain owned by the monthly dashboard. */
(function(g){
'use strict';
const d=g.document,$=id=>d.getElementById(id);
const paths={ship:'<path d="M4 12 12 9l8 3-3 7H7zM7 10V5h10v5M10 5V2h4v3M2 21q3-2 5 0t5 0 5 0 5 0"/>',boxes:'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M7 7v10m5-10v10m5-10v10"/>',chart:'<path d="M3 20V11h4v9m3 0V7h4v13m3 0V3h4v17M3 7l7-4 5 2 6-4"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v7h5"/>',people:'<circle cx="10" cy="7" r="3"/><path d="M3 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6m2 4a6 6 0 0 1 3 6"/>',calendar:'<rect x="4" y="4" width="16" height="18" rx="2"/><path d="M8 2v5m8-5v5M4 9h16M8 13h8m-8 4h5"/>',shield:'<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6zM12 7v6m0 3v1"/>',bell:'<path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9M10 22h4"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 0v4m0 16v4M0 12h4m16 0h4M3 3l3 3m12 12 3 3M3 21l3-3M18 6l3-3"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',check:'<path d="m5 12 5 5L20 6"/>',chevron:'<path d="m6 9 6 6 6-6"/>'};
const icon=k=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[k]||paths.info)+'</svg>';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,n=0)=>Number.isFinite(v)?v.toLocaleString('zh-TW',{maximumFractionDigits:n,minimumFractionDigits:n}):'—';
const badge=i=>'<span class="p79r-rank rank-'+i+'">'+i+'</span>';
const detailBtn=()=>d.getElementById('cardEfficiency')?.click();
let attendancePage=0,attendanceReport=null,leaveReport=null,attendanceMonth='';
let peopleGroup='ALL',peopleReport=null,groupRoster=null,groupRosterMonth='';
let scheduleRows=[],scheduleMonth='',scheduleDialog=null,scheduleSelected=-1;
function renderPeople(){
 const table=$('p79DashPeopleRanking'),model=g.P79MonthlyDashboard;if(!table||!model)return;
 const source=peopleReport?.people||[];
 const activeMonth=$('p79DashMonth')?.value||'';
 const matched=model.assignPersonGroups(source,groupRosterMonth===activeMonth?groupRoster:null);
 const rows=peopleGroup==='ALL'?matched:matched.filter(p=>p.group===peopleGroup);
 const noGroups=source.length>0&&!matched.some(p=>p.group);
 const message=peopleGroup!=='ALL'&&noGroups
   ?'尚無可核對的組別資料，請確認排班月份與人員組別權限'
   :peopleGroup!=='ALL'?'本月'+peopleGroup+'尚無可核對的人員效率資料':'本月尚無可核對的個人作業明細';
 table.innerHTML=rows.length?rows.map((r,i)=>'<tr><td>'+badge(i+1)+'</td><td>'+esc(model.displayPersonName(r.name))+'</td><td>'+fmt(r.moves)+'</td><td>'+fmt(r.hatches)+'</td><td>'+fmt(r.efficiency,2)+'</td></tr>').join('')
  :'<tr><td colspan="5">'+esc(message)+'</td></tr>';
}
function setGroupRoster(data,month){groupRoster=Array.isArray(data?.schedules)?data:null;groupRosterMonth=String(month||'');renderPeople();}
function choosePeopleGroup(group){
 if(!['ALL','A組','B組','C組','D組'].includes(group))return;
 peopleGroup=group;
 $('p79DashPeopleGroupFilters')?.querySelectorAll('[data-people-group]').forEach(b=>{
  const active=b.dataset.peopleGroup===group;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
 });
 renderPeople();
}
function empty(id,text){const e=$(id);if(e)e.innerHTML='<div class="p79r-empty">'+esc(text)+'</div>'}
function svgChart(id,values,labels,rates,label='本月各週出勤人數'){
 const el=$(id);if(!el)return;
 if(!values.length){empty(id,'這個月份尚無可繪製的資料');return}
 const w=480,h=190,left=38,right=rates?32:12,top=20,bottom=30,pw=w-left-right,ph=h-top-bottom;
 const max=Math.max(1,...values),step=Math.pow(10,Math.floor(Math.log10(max))),ceiling=Math.ceil(max/step)*step;
 const rateMax=Math.max(40,...(rates||[]).filter(Number.isFinite)),gap=pw/values.length,bw=Math.max(2,Math.min(34,gap*.65));
 let grid='',bars='',points=[];
 for(let i=0;i<=4;i++){const y=top+ph-i*ph/4;grid+='<path d="M'+left+' '+y+'H'+(w-right)+'" class="p79r-gridline"/><text x="'+(left-7)+'" y="'+(y+4)+'" text-anchor="end">'+fmt(ceiling*i/4)+'</text>';if(rates)grid+='<text x="'+(w-right+7)+'" y="'+(y+4)+'">'+fmt(rateMax*i/4)+'</text>'}
 values.forEach((v,i)=>{const x=left+gap*(i+.5),bh=v/ceiling*ph;bars+='<rect x="'+(x-bw/2)+'" y="'+(top+ph-bh)+'" width="'+bw+'" height="'+bh+'" rx="'+Math.min(5,bw/5)+'" fill="url(#'+id+'Gradient)"><title>'+esc(labels[i])+': '+fmt(v,Number.isInteger(v)?0:2)+'</title></rect>';if(values.length<=6)bars+='<text x="'+x+'" y="'+(top+ph-bh-7)+'" text-anchor="middle" class="p79r-bar-number">'+fmt(v,Number.isInteger(v)?0:2)+'</text>';if(values.length<=6||i===0||i===values.length-1||(i+1)%5===0)bars+='<text x="'+x+'" y="'+(h-8)+'" text-anchor="middle">'+esc(labels[i])+'</text>';if(rates&&Number.isFinite(rates[i]))points.push([x,top+ph-rates[i]/rateMax*ph]);});
 const line=points.length?'<polyline points="'+points.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="#12b88e" stroke-width="2.5"/>'+points.map(p=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="3.2" fill="white" stroke="#12b88e" stroke-width="2"/>').join(''):'';
 el.innerHTML='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(id==='p79DashShipBars'?'依船舶完工日統計的本月作業量與效率':label)+'"><defs><linearGradient id="'+id+'Gradient" x2="0" y2="1"><stop stop-color="#5baaff"/><stop offset="1" stop-color="#1684ff"/></linearGradient></defs>'+grid+bars+line+'</svg>';
}
function weeklyChart(report){
 const el=$('p79DashShipBars'),caption=el?.closest('article')?.querySelector('.p79d-panel-title>span');if(!el)return;
 if(caption)caption.textContent=report.start.slice(5).replace('-','/')+'–'+report.end.slice(5).replace('-','/')+' · GPH';
 if(report.future){empty('p79DashShipBars','所選月份尚未開始');return}
 if(report.days.every(d=>d.gph===null)){empty('p79DashShipBars','這七天沒有可核對的船舶效率');return}
 const w=480,h=190,left=35,right=16,top=24,bottom=28,pw=w-left-right,ph=h-top-bottom;
 const max=Math.max(...report.days.map(d=>d.gph||0)),ceiling=Math.max(5,Math.ceil(max/5)*5),gap=pw/7;
 let grid='',points='',segments=[],current=[];
 for(let i=0;i<=4;i++){const y=top+ph-i*ph/4;grid+='<path class="p79r-gridline" d="M'+left+' '+y+'H'+(w-right)+'"/><text x="'+(left-7)+'" y="'+(y+4)+'" text-anchor="end">'+fmt(ceiling*i/4,1)+'</text>';}
 report.days.forEach((d,i)=>{const x=left+gap*(i+.5),label=Number(d.date.slice(5,7))+'/'+Number(d.date.slice(-2));points+='<text x="'+x+'" y="'+(h-7)+'" text-anchor="middle">'+label+'</text>';
  if(d.gph===null){if(current.length)segments.push(current);current=[];points+='<text x="'+x+'" y="'+(top+ph-6)+'" text-anchor="middle">—<title>'+label+' 無可核對效率</title></text>';return}
  const y=top+ph-d.gph/ceiling*ph;current.push([x,y]);points+='<circle cx="'+x+'" cy="'+y+'" r="4" fill="white" stroke="#1687ff" stroke-width="2.5"><title>'+esc(label+'：'+fmt(d.gph,2)+' GPH / '+d.count+' 艘船舶')+'</title></circle><text class="p79r-bar-number" x="'+x+'" y="'+(y-10)+'" text-anchor="middle">'+fmt(d.gph,2)+'</text>';
 });if(current.length)segments.push(current);
 const lines=segments.map(s=>'<polyline points="'+s.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="#1687ff" stroke-width="2.5"/>').join('');
 el.innerHTML='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="最近七天船舶效率（GPH），'+esc(report.start+' 至 '+report.end)+'">'+grid+lines+points+'</svg>';
}
// Ship schedule only uses the authenticated monthly vessel snapshot. No polling or new API.
function scheduleClock(v){return v?v.slice(5).replace('-', '/').replace(' ', '　'):'—';}
function renderShipSchedule(v,ym){
 scheduleRows=Array.isArray(v.scheduleRows)?v.scheduleRows:[];scheduleMonth=ym;
 const host=$('p79DashVesselNotices');if(!host)return;
 host.className='p79-schedule-board';
 if(!scheduleRows.length){empty('p79DashVesselNotices','所選月份尚無船期或船舶作業資料');return;}
 host.innerHTML='<div class="p79-schedule-list" role="list">'+scheduleRows.slice(0,4).map((s,i)=>
  '<button type="button" role="listitem" class="p79-schedule-row" data-ship-schedule-index="'+i+'" aria-label="查看'+esc(s.name)+' '+esc(s.voyage)+' 船期">'+
  '<span class="p79-schedule-time"><b>'+esc(scheduleClock(s.primary))+'</b><small>'+esc(s.dateLabel)+'</small></span>'+
  '<span class="p79-schedule-info"><strong>'+esc(s.name)+'</strong><small>'+esc('航次 '+s.voyage+(s.wharf==='—'?'':' · '+s.wharf))+'</small></span>'+
  '<span class="p79-schedule-status">'+esc(s.status)+'</span></button>'
 ).join('')+'</div>'+
 '<div class="p79-schedule-footnote">預計時間與已記錄作業日分別標示，未提供 ETA/ETD 不會推估。</div>';
}
function ensureScheduleDialog(){
 if(scheduleDialog)return scheduleDialog;
 scheduleDialog=d.createElement('dialog');scheduleDialog.id='p79ShipScheduleDialog';
 scheduleDialog.setAttribute('aria-labelledby','p79ShipScheduleDialogTitle');
 scheduleDialog.innerHTML='<section class="p79-schedule-dialog-inner"><header class="p79-schedule-dialog-header"><div><h2 id="p79ShipScheduleDialogTitle">船期看板</h2><p id="p79ShipScheduleDialogNote"></p></div><button type="button" data-close-ship-schedule aria-label="關閉船期看板">✕</button></header><div id="p79ShipScheduleDialogBody"></div></section>';
 d.body.appendChild(scheduleDialog);
 scheduleDialog.addEventListener('click',e=>{
  if(e.target===scheduleDialog||e.target.closest('[data-close-ship-schedule]')){scheduleDialog.close();return;}
  if(e.target.closest('[data-ship-schedule-detail]')){scheduleDialog.close();detailBtn();}
 });
 return scheduleDialog;
}
function openShipSchedule(index=-1){
 const dlg=ensureScheduleDialog();scheduleSelected=Number.isInteger(index)?index:-1;
 const [y,m]=scheduleMonth.split('-');
 $('p79ShipScheduleDialogTitle').textContent=Number(y)+'年'+Number(m)+'月船期看板';
 $('p79ShipScheduleDialogNote').textContent='資料來源：正式船舶月份主檔｜共 '+scheduleRows.length+' 艘｜只在首次載入或手動更新時同步';
 const host=$('p79ShipScheduleDialogBody');
 if(!scheduleRows.length){host.innerHTML='<div class="p79r-empty">本月沒有可顯示的船期資料</div>';}
 else{
  const rows=scheduleSelected>=0&&scheduleSelected<scheduleRows.length?[scheduleRows[scheduleSelected]]:scheduleRows;
  host.innerHTML='<div class="p79-schedule-table-scroll"><table class="p79-schedule-table"><thead><tr>'+
   ['船名','航次','碼頭','預計抵港 ETA','預計離港 ETD','作業首日','作業末日','狀態'].map(x=>'<th>'+x+'</th>').join('')+
   '</tr></thead><tbody>'+rows.map(r=>'<tr><td><strong>'+esc(r.name)+'</strong></td><td>'+esc(r.voyage)+'</td><td>'+esc(r.wharf)+'</td><td>'+esc(r.eta||'未提供')+'</td><td>'+esc(r.etd||'未提供')+'</td><td>'+esc(r.workStart||'—')+'</td><td>'+esc(r.workEnd||'—')+'</td><td>'+esc(r.status)+'</td></tr>').join('')+'</tbody></table></div>'+
   '<p class="p79-schedule-dialog-disclaimer">「作業首日／末日」是歷史作業資料，不代表預計靠泊或離港；沒有正式船期的欄位會顯示「未提供」。</p>'+
   '<div class="p79-schedule-dialog-actions">'+(scheduleSelected>=0?'<button type="button" data-show-all-ships>查看全部 '+scheduleRows.length+' 艘</button>':'')+'<button type="button" data-ship-schedule-detail>前往船舶作業明細 ›</button></div>';
 }
 if(!dlg.open)dlg.showModal();
 dlg.querySelector('[data-show-all-ships]')?.addEventListener('click',()=>openShipSchedule(-1),{once:true});
}

function vessels(v){
 const table=$('p79DashShipRanking'),model=g.P79MonthlyDashboard,latest=model.latestImportedVessels(v.vessels,5);
 const importLabel=s=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(s));
 if(table)table.innerHTML=latest.length?latest.map((s,i)=>'<tr><td>'+badge(i+1)+'</td><td title="'+esc(s.name+' / '+s.workingNo)+'">'+esc(s.name)+'</td><td>'+fmt(s.moves)+'</td><td title="'+esc(s.importedAt)+'">'+esc(importLabel(s.importedAt))+'</td><td>'+fmt(s.rate,2)+'</td><td><span class="p79r-state '+(s.date?'done':'neutral')+'">'+esc(s.status||(s.date?'已完工':'待核對'))+'</span></td></tr>').join(''):'<tr><td colspan="6">本月份尚無附匯入時間的船舶資料</td></tr>';
 const ym=$('p79DashMonth')?.value||'';
 if(v.weekError)empty('p79DashShipBars',v.weekError);else weeklyChart(model.weeklyEfficiency(v.weekVessels||v.vessels,ym));
 peopleReport=v;renderPeople();
 renderShipSchedule(v,ym);
 if($('p79rHeroShipCount'))$('p79rHeroShipCount').textContent=fmt(v.count);
 if($('p79rHeroMonth'))$('p79rHeroMonth').textContent=Number(ym.slice(5))+' 月作業船舶';
}
function attendance(a,ym){
 const current=ym===a.today.slice(0,7),on=current?a.todayOnDuty:a.punchIn,total=current?a.todayCount:a.recordCount;
 $('p79DashPeopleLabel').textContent=current?'今日出勤人數':'本月有打卡人數';$('p79DashAttendancePeople').textContent=fmt(current?a.todayCount:a.peopleCount);
 $('p79DashDonutLabel').textContent=current?'今日出勤':'本月打卡人數';$('p79DashDonutRate').innerHTML=fmt(current?a.todayCount:a.peopleCount)+'<small>人</small>';
 $('p79DashAttendancePeriod').textContent=current?'依今日打卡':'依所選月份';
 $('p79DashDonut').style.setProperty('--p79d-donut-angle',(total?100*on/total:0)+'%');
 $('p79DashPunchLegend').innerHTML=current?'<div><i></i>目前在崗 <b>'+fmt(a.todayOnDuty)+' 人</b></div><div><i></i>已簽退 <b>'+fmt(Math.max(0,a.todayCount-a.todayOnDuty))+' 人</b></div><small>依今日上班卡與最新打卡狀態</small>':'<div><i></i>上班卡 <b>'+fmt(a.punchIn)+' 筆</b></div><div><i></i>下班卡 <b>'+fmt(a.punchOut)+' 筆</b></div><small>打卡事件分布，非出勤率</small>';
 attendanceReport=a;attendanceMonth=ym;renderAttendancePage();
}
function renderAttendancePage(){
 const title=$('p79DashAttendanceChartTitle');if(!title)return;
 title.innerHTML='<span class="p79r-panel-mark">↥</span>'+(attendancePage?'各職稱當月請假天數':'本月出勤人數趨勢');
 $('p79DashChartPage').textContent='第'+(attendancePage+1)+'頁／共2頁';
 $('p79DashChartPrevious').disabled=attendancePage===0;$('p79DashChartNext').disabled=attendancePage===1;
 const el=$('p79DashAttendanceBars');el.classList.toggle('p79r-leave-chart',attendancePage===1);
 if(!attendancePage){if(attendanceReport)svgChart(el.id,attendanceReport.weeklyPeople,attendanceReport.weeklyPeople.map((x,i)=>'第'+(i+1)+'週'));else empty(el.id,'正在讀取考勤資料…');return;}
 if(!leaveReport||leaveReport.month!==attendanceMonth){empty(el.id,'正在讀取正式核准請假與人資職稱…');return;}
 if(leaveReport.error){empty(el.id,leaveReport.error);return;}
 const rows=leaveReport.rows,caption=leaveReport.issues.length?'（'+leaveReport.issues.length+' 筆資料待核，未計入）':'';
 if(!rows.length){empty(el.id,'本月無可核對的核准請假'+caption);return;}
 const max=Math.max(1,...rows.map(r=>r.days));
 el.innerHTML='<div class="p79r-leave-bars" role="img" aria-label="'+esc(attendanceMonth+'各職稱當月核准請假天數'+caption)+'">'+rows.map(r=>'<div class="p79r-leave-row"><span title="'+esc(r.title)+'">'+esc(r.title)+'</span><div><i style="width:'+r.days/max*100+'%"></i></div><b>'+fmt(r.days,Number.isInteger(r.days)?0:2)+' 天</b></div>').join('')+(caption?'<small>'+esc(caption)+'</small>':'')+'</div>';
}
function setLeaveReport(report){leaveReport=report;attendanceMonth=report.month;renderAttendancePage();}
function chrome(){
 if(!d.body.classList.contains('p79-workspace')||!$('p79Dashboard'))return;
 const intro=d.querySelector('.p79-modern-home-intro');if(!intro||!intro.querySelector('.p79-hero-greeting')||intro.dataset.referenceReady)return;
 intro.dataset.referenceReady='1';
 intro.querySelector('h2').innerHTML='<b>79號碼頭</b> 船舶作業 × 考勤人力 智慧管理中心';intro.querySelector('p').textContent='即時掌握船舶作業與人力出勤，提升碼頭營運效率';
 const greet=intro.querySelector('.p79-hero-greeting');const name=d.querySelector('.p79-user-name')?.textContent||'';
 greet.innerHTML='<div><strong><span class="p79r-sun">'+icon('sun')+'</span>您好，'+esc(name)+'</strong><span class="p79-home-date">'+new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date())+'</span></div><div class="p79r-hero-summary"><span id="p79rHeroMonth">本月作業船舶</span><b id="p79rHeroShipCount">'+esc($('p79DashShipCount')?.textContent||'—')+'</b><small>艘船舶</small></div>';
 const nav=$('p79SevenNav');if(nav)nav.querySelectorAll('a').forEach(a=>{if(a.dataset.p79Alias==='integration')a.classList.add('p79r-secondary');a.querySelector('.p79-nav-arrow')?.replaceChildren(d.createTextNode('›'));});
 const mark=d.querySelector('.p79-port-mark');if(mark){mark.setAttribute('viewBox','0 0 24 24');mark.setAttribute('fill','none');mark.setAttribute('stroke','#0888ff');mark.setAttribute('stroke-width','1.8');mark.innerHTML=paths.ship;}
 const tools=$('p79WorkspaceTopbar')?.querySelector('.p79-toolbar-tools');if(tools&&!$('p79rNotifications')){const b=d.createElement('button');b.id='p79rNotifications';b.type='button';b.setAttribute('aria-label','查看船期看板');b.innerHTML=icon('bell');b.onclick=()=>$('p79DashVesselNotices')?.scrollIntoView({behavior:'smooth',block:'center'});tools.prepend(b);}
}
function init(){
 if(!$('p79Dashboard'))return;
 $('p79ShipScheduleAll')?.addEventListener('click',()=>openShipSchedule(-1));
 $('p79DashVesselNotices')?.addEventListener('click',event=>{const btn=event.target.closest('[data-ship-schedule-index]');if(btn)openShipSchedule(Number(btn.dataset.shipScheduleIndex));});
 $('p79DashChartPrevious')?.addEventListener('click',()=>{attendancePage=0;renderAttendancePage();});
 $('p79DashChartNext')?.addEventListener('click',()=>{attendancePage=1;renderAttendancePage();});
 $('p79DashPeopleGroupFilters')?.addEventListener('click',event=>{
  const btn=event.target.closest('button[data-people-group]');
  if(btn)choosePeopleGroup(btn.dataset.peopleGroup);
 });
 d.querySelectorAll('.p79d-kpis').forEach((row,section)=>row.querySelectorAll('.p79d-kpi-icon').forEach((e,i)=>e.innerHTML=icon((section?['people','calendar','calendar','shield']:['ship','boxes','chart','clock'])[i])));
 ['p79dShipHeading','p79dAttendanceHeading'].forEach(id=>{const h=$(id);h.firstChild.textContent=id==='p79dShipHeading'?'船舶作業總覽 ':'考勤人力總覽 ';h.insertAdjacentHTML('afterbegin',icon('ship'));});
 d.querySelectorAll('.p79d-panel-title>b').forEach(e=>{e.textContent=e.textContent.replace(/^[▤▥◉]\s*/, '');e.insertAdjacentHTML('afterbegin','<span class="p79r-panel-mark">↥</span>')});
 chrome();new MutationObserver(chrome).observe(d.body,{attributes:true,attributeFilter:['class']});
}
function reset(){scheduleRows=[];scheduleMonth='';scheduleSelected=-1;if(scheduleDialog?.open)scheduleDialog.close();attendancePage=0;attendanceReport=null;leaveReport=null;attendanceMonth=$('p79DashMonth')?.value||'';renderAttendancePage();peopleReport=null;groupRoster=null;groupRosterMonth='';if($('p79DashVesselNotices'))empty('p79DashVesselNotices','正在讀取本月船期資料…');if($('p79rHeroShipCount'))$('p79rHeroShipCount').textContent='—';}
g.P79ReferenceDashboard={vessels,attendance,reset,setGroupRoster,choosePeopleGroup,setLeaveReport};
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);

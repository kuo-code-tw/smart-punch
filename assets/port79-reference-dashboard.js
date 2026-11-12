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
let chartPage=0,overtimeChartMode='actual',attendanceReport=null,overtimeReport=null,leaveReport=null,attendanceMonth='';
let peopleGroup='ALL',peopleReport=null,groupRoster=null,groupRosterMonth='';

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
 let grid='',points='',connected=[];
 for(let i=0;i<=4;i++){const y=top+ph-i*ph/4;grid+='<path class="p79r-gridline" d="M'+left+' '+y+'H'+(w-right)+'"/><text x="'+(left-7)+'" y="'+(y+4)+'" text-anchor="end">'+fmt(ceiling*i/4,1)+'</text>';}
 report.days.forEach((d,i)=>{const x=left+gap*(i+.5),label=Number(d.date.slice(5,7))+'/'+Number(d.date.slice(-2));points+='<text x="'+x+'" y="'+(h-7)+'" text-anchor="middle">'+label+'</text>';
  if(d.gph===null){points+='<text x="'+x+'" y="'+(top+ph-6)+'" text-anchor="middle">—<title>'+label+' 無可核對效率</title></text>';return}
  const y=top+ph-d.gph/ceiling*ph;connected.push([x,y]);points+='<circle cx="'+x+'" cy="'+y+'" r="4" fill="white" stroke="#1687ff" stroke-width="2.5"><title>'+esc(label+'：'+fmt(d.gph,2)+' GPH / '+d.count+' 艘船舶')+'</title></circle><text class="p79r-bar-number" x="'+x+'" y="'+(y-10)+'" text-anchor="middle">'+fmt(d.gph,2)+'</text>';
 });
 // Connect only measured days; missing daily GPH stays unmeasured (shown as —).
 const lines=connected.length>1?'<polyline points="'+connected.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="#1687ff" stroke-width="2.5"/>':'';
 el.innerHTML='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="最近七天船舶效率（GPH），'+esc(report.start+' 至 '+report.end)+'">'+grid+lines+points+'</svg>';
}
// Homepage ship timetable is a separate outside-website source, not the vessel historical snapshot.

function p79ImportedChineseShipName(ship){
 const own=[ship?.chineseName,ship?.vesselChineseName,ship?.localName]
  .find(value=>/[\u3400-\u9fff]/u.test(String(value||'')));
 if(own)return String(own).trim();
 const official=g.P79VesselNameDirectory?.getChineseName?.(ship?.name,ship?.imo||ship?.imoNumber)||g.P79ManualShipSchedule?.getChineseName?.(ship?.name);
 return /[\u3400-\u9fff]/u.test(String(official||''))?String(official).trim():'';
}

let lastVesselsForChineseNames=null;
function vessels(v){
 lastVesselsForChineseNames=v;
 const table=$('p79DashShipRanking'),model=g.P79MonthlyDashboard;
 // 依正式 WORKING SHEET LASHING 完工時刻排序；缺少時刻只使用有根據的日期。
 const source=Array.isArray(v.vessels)?v.vessels:[];
 const latest=model.latestCompletedVessels(source,Number.MAX_SAFE_INTEGER);
 const countLabel=$('p79DashShipRankingCount');
 if(countLabel)countLabel.textContent='本月完工資料 '+latest.length+' 艘 · 依完工時間排序';
 const completionLabel=s=>{
  const full=String(s.completedAt||'').match(/^20\d{2}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if(full)return full[1]+'/'+full[2]+' '+full[3]+':'+full[4];
  const day=String(s.completionDate||'').match(/^20\d{2}-(\d{2})-(\d{2})$/);
  return day?day[1]+'/'+day[2]+'（時間未記錄）':'—';
 };
 if(table)table.innerHTML=latest.length?latest.map((s,i)=>{
  const chinese=p79ImportedChineseShipName(s)||'未提供';
  return '<tr><td>'+badge(i+1)+'</td>'+
   '<td title="'+esc(s.name+' / '+chinese+' / '+s.workingNo)+'"><span class="p79r-vessel-one-line">'+esc(s.name)+'<span class="p79r-vessel-chinese-name">（'+esc(chinese)+'）</span></span></td>'+
   '<td title="'+esc(s.wharf||'—')+'">'+esc(s.wharf||'—')+'</td>'+
   '<td>'+fmt(s.moves)+'</td>'+
   '<td title="'+esc(s.completedAt?'WORKING SHEET LASHING 完工：'+s.completedAt.replace('T',' ').slice(0,16):(s.completionDate?'僅記錄完工日期：'+s.completionDate+'；完工時刻未記錄':'正式船舶資料沒有完工日期與時刻'))+'">'+esc(completionLabel(s))+'</td>'+
   '<td>'+fmt(s.rate,2)+'</td></tr>';
 }).join(''):'<tr><td colspan="6">本月份尚無船舶資料</td></tr>';
 const ym=$('p79DashMonth')?.value||'';
 // The weekly/monthly pager owns this chart when available. Do not overwrite its selected view on vessel refresh or name updates.
 if(!g.P79EfficiencyPager?.active){
  if(v.weekError)empty('p79DashShipBars',v.weekError);else weeklyChart(model.weeklyEfficiency(v.weekVessels||v.vessels,ym));
 }
 peopleReport=v;renderPeople();
 g.P79ManualShipSchedule?.render?.();
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

/* 首頁加班職稱圖只呈現一般員工；主管及系統管理員的正式加班資料仍保留於總工時和原始紀錄。 */
function p79IsEmployeeOvertimeTitle(value){
 const title=String(value??'').replace(/\s+/g,'');
 if(!title||title==='未設定職稱')return false;
 return !/(?:系統管理員|主任|課長|科長|副理|襄理|經理|協理|處長|部長|總監|總裁|副總|董事|執行長|廠長|所長|股長|主管)/.test(title);
}
function p79EmployeeOvertimeRows(rows){
 // 只有真正有加班申報時數的職稱才繪圖；零筆人資職稱不能誤作統計。
 return rows.filter(row=>p79IsEmployeeOvertimeTitle(row?.title)&&Number(row?.hours)>0&&Number(row?.count)>0);
}
/* Donut visualization of the existing, permission-scoped employee overtime rows.
 * The source's approval, exclusion and historical-fallback rules stay untouched. */
function p79OvertimeDonutGroups(rows){
 const byTitle=new Map();
 for(const row of rows||[]){
  const title=String(row?.title||'').trim(),hours=Number(row?.hours);
  if(title&&Number.isFinite(hours)&&hours>0)byTitle.set(title,(byTitle.get(title)||0)+hours);
 }
 const ranked=[...byTitle].map(([title,hours])=>({title,hours}))
  .sort((a,b)=>b.hours-a.hours||a.title.localeCompare(b.title,'zh-Hant',{numeric:true}));
 const shown=ranked.slice(0,5),rest=ranked.slice(5),total=ranked.reduce((sum,r)=>sum+r.hours,0);
 if(rest.length)shown.push({title:'其他',hours:rest.reduce((sum,r)=>sum+r.hours,0),members:rest.map(r=>r.title)});
 const palette=['#147dff','#19b9eb','#36c638','#ff9900','#8b5cf6','#94a3b8'];
 return {total,groups:shown.map((r,i)=>({...r,color:rest.length&&i===shown.length-1?'#94a3b8':palette[i],percent:total?r.hours/total*100:0}))};
}
function p79RenderOvertimeDonut(rows,summary,options={}){
 const model=p79OvertimeDonutGroups(rows),total=model.total,groups=model.groups;
 const unit=options.unit||'小時',metric=options.metric||'換算時數',
       centerFirst=options.centerFirst||'本月換算',centerSecond=options.centerSecond||'加班工時',
       chartTitle=options.chartTitle||'本月員工職稱加班時數統計';
 const hours=v=>fmt(v,Number.isInteger(v)?0:2),length=2*Math.PI*70;
 let offset=0;
 const pieces=groups.map(r=>{
  const size=length*r.hours/total,dash=Math.max(0,size-Math.min(1.1,size/6)),start=-offset;
  offset+=size;
  const tip=r.title+'：'+hours(r.hours)+' '+unit+'（'+r.percent.toFixed(1)+'%）';
  return '<circle cx="100" cy="100" r="70" fill="none" stroke="'+r.color+'" stroke-width="35" stroke-dasharray="'+dash.toFixed(4)+' '+(length-dash).toFixed(4)+'" stroke-dashoffset="'+start.toFixed(4)+'" transform="rotate(-90 100 100)" tabindex="0" aria-label="'+esc(tip)+'"><title>'+esc(tip)+'</title></circle>';
 }).join('');
 let midpoint=0;
 const labels=groups.map(r=>{
  const angle=(midpoint+r.percent/2)/100*2*Math.PI-Math.PI/2;
  midpoint+=r.percent;
  if(r.percent<6||(groups.length>4&&r.percent<12))return '';
  return '<text x="'+(100+70*Math.cos(angle)).toFixed(2)+'" y="'+(100+70*Math.sin(angle)).toFixed(2)+'" text-anchor="middle" dominant-baseline="middle" fill="white" font-weight="800" font-size="'+(r.percent<10?9:11)+'" pointer-events="none">'+r.percent.toFixed(1)+'%</text>';
 }).join('');
 const ring='<div class="p79r-ot-ring"><svg class="p79r-ot-ring-svg" viewBox="0 0 200 200" role="img" aria-label="'+esc(chartTitle+' '+hours(total)+' '+unit)+'"><circle cx="100" cy="100" r="70" fill="none" stroke="#e7eff8" stroke-width="35"/>'+pieces+labels+'</svg><div class="p79r-ot-center"><span>'+esc(centerFirst)+'</span><span>'+esc(centerSecond)+'</span><strong>'+hours(total)+'</strong><small>'+esc(unit)+'</small></div></div>';
 const legend=groups.length?'<div class="p79r-ot-legend" aria-label="職稱加班時數占比"><div class="p79r-ot-legend-head"><span>職稱</span><span>'+esc(metric)+'</span><span>占比</span></div>'+
  groups.map(r=>'<div class="p79r-ot-legend-row" title="'+esc(r.title+'：'+hours(r.hours)+' '+unit+'（'+r.percent.toFixed(1)+'%）')+'"><span class="p79r-ot-title"><i style="background:'+r.color+'"></i>'+esc(r.title)+'</span><b>'+hours(r.hours)+' '+esc(unit)+'</b><b>'+r.percent.toFixed(1)+'%</b></div>').join('')+'</div>':
  '<div class="p79r-ot-no-data">'+esc(options.empty||'本月尚無有效加班資料')+'</div>';
 return '<div class="p79r-ot-donut" role="group" aria-label="'+esc(chartTitle)+'"><div class="p79r-ot-donut-layout">'+ring+legend+'</div><div class="p79r-ot-note">'+esc(summary)+'</div></div>';
}
function p79RenderLeaveDonut(rows,summary){
 return p79RenderOvertimeDonut((rows||[]).map(row=>({title:row.title,hours:Number(row.days)||0,count:1})),summary,{
  unit:'天',metric:'核准請假天數',centerFirst:'本月核准',centerSecond:'請假天數',
  chartTitle:'本月各職稱核准請假天數',empty:'本月尚無已核准請假'
 });
}
function renderAttendancePage(){
 const ot=chartPage===0;
 const title=$('p79DashAttendanceChartTitle');
 if(title)title.innerHTML='<span class="p79r-panel-mark">↥</span>'+(ot?'本月員工職稱加班時數統計（'+(overtimeChartMode==='actual'?'實際':'換算')+'）':'本月各職稱核准請假天數');
 const pageLabel=$('p79DashChartPage');
 if(pageLabel)pageLabel.textContent='第'+(chartPage+1)+'頁／共2頁';
 const previous=$('p79DashChartPrevious'),next=$('p79DashChartNext');
 if(previous)previous.disabled=chartPage===0;
 if(next)next.disabled=chartPage===1;
 const el=$('p79DashAttendanceBars');if(!el)return;
 el.classList.add('p79r-leave-chart');
 const report=ot?overtimeReport:leaveReport;
 if(!report||report.month!==attendanceMonth){empty(el.id,ot?'正在讀取正式加班申報與職稱資料…':'正在讀取已核准請假與職稱資料…');return;}
 if(report.error){empty(el.id,report.error);return;}
 if(!Array.isArray(report.rows)){empty(el.id,ot?'職稱加班資料尚未讀齊':'職稱請假資料尚未讀齊');return;}
 const rows=ot?p79EmployeeOvertimeRows(overtimeChartMode==='actual'?(report.actualRows||report.rows):(report.convertedRows||report.rows)):report.rows;
 const pending=!ot?(report.issues||[]).length:0;
 const overtimeSummary=ot?(report.sourceWarning?'目前為歷史月份快照；即時班表尚未核對完成，時數僅供參考':
  '依正式申報'+(overtimeChartMode==='actual'?'實際':'已儲存換算')+'時數統計（含待審核、不含預排），非薪資結算工時；未申報／預排另計') :'';
 if(ot&&overtimeChartMode==='converted'&&report.missingConversion>0){empty(el.id,'本月有 '+report.missingConversion+' 筆正式申報尚無已儲存換算值，總數待換算；避免顯示不完整的職稱占比。');return;}
 if(!rows.length){
  if(ot){
   const count=Number(report.officialCount??report.count)||0,hours=Number((overtimeChartMode==='actual'?report.declaredSubmittedHours:report.convertedHours)??report.hours)||0;
   const msg=report.sourceWarning
    ?'本月即時加班來源尚未核對完成；歷史快照目前沒有可確認的一般員工職稱時數。請重新整理首頁，或至加班管理核對正式申報。'
    :count>0
      ?'已讀取 '+fmt(count)+' 筆加班申報（'+fmt(hours,2)+' 小時），但沒有符合本圖的一般員工職稱。請核對職稱是否未設定或被歸為主管。'
      :'本月正式班表尚無有效加班申報；如果加班管理已有資料，請重新整理並核對首頁資料來源。';
   if(!report.sourceWarning&&count===0&&hours===0)el.innerHTML=p79RenderOvertimeDonut([],overtimeSummary);
   else empty(el.id,msg);
   return;
  }
  if(pending){empty(el.id,'目前有 '+pending+' 筆核准請假資料待核對，請假職稱比例暫無法完整確認');return;}
  el.innerHTML=p79RenderLeaveDonut([],'本月無已核准請假');return;
 }
 if(ot){
  const options=overtimeChartMode==='actual'
   ?{metric:'實際時數',centerFirst:'本月已申報',centerSecond:'實際時數'}
   :{metric:'換算時數',centerFirst:'本月已申報',centerSecond:'換算時數'};
  el.innerHTML=p79RenderOvertimeDonut(rows,overtimeSummary,options);return;
 }
 el.innerHTML=p79RenderLeaveDonut(rows,pending?pending+' 筆核准請假資料待核，暫不列入已核准天數合計':'僅統計已核准請假');
}
function setOvertimeReport(report){overtimeReport=report;renderAttendancePage();}
function setOvertimeMode(mode){if(!['actual','converted'].includes(mode))return;overtimeChartMode=mode;renderAttendancePage();}
function setLeaveReport(report){leaveReport=report;renderAttendancePage();}
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
 $('p79DashChartPrevious')?.addEventListener('click',()=>{chartPage=0;renderAttendancePage();});
 $('p79DashChartNext')?.addEventListener('click',()=>{chartPage=1;renderAttendancePage();});
 $('p79DashPeopleGroupFilters')?.addEventListener('click',event=>{
  const btn=event.target.closest('button[data-people-group]');
  if(btn)choosePeopleGroup(btn.dataset.peopleGroup);
 });
 d.querySelectorAll('.p79d-kpis').forEach((row,section)=>row.querySelectorAll('.p79d-kpi-icon').forEach((e,i)=>e.innerHTML=icon((section?['people','calendar','calendar','shield']:['ship','boxes','chart','clock'])[i])));
 ['p79dShipHeading','p79dAttendanceHeading'].forEach(id=>{const h=$(id);h.firstChild.textContent=id==='p79dShipHeading'?'船舶作業總覽 ':'考勤人力總覽 ';h.insertAdjacentHTML('afterbegin',icon('ship'));});
 d.querySelectorAll('.p79d-panel-title>b').forEach(e=>{e.textContent=e.textContent.replace(/^[▤▥◉]\s*/, '');e.insertAdjacentHTML('afterbegin','<span class="p79r-panel-mark">↥</span>')});
 chrome();new MutationObserver(chrome).observe(d.body,{attributes:true,attributeFilter:['class']});
}
function reset(){chartPage=0;attendanceReport=null;overtimeReport=null;leaveReport=null;attendanceMonth=$('p79DashMonth')?.value||'';renderAttendancePage();peopleReport=null;groupRoster=null;groupRosterMonth='';if($('p79DashVesselNotices'))g.P79ManualShipSchedule?.render?.();if($('p79rHeroShipCount'))$('p79rHeroShipCount').textContent='—';}
d.addEventListener('p79:wanhai-names-updated',()=>{if(lastVesselsForChineseNames)vessels(lastVesselsForChineseNames);});
g.P79ReferenceDashboard={vessels,attendance,reset,setGroupRoster,choosePeopleGroup,setOvertimeReport,setOvertimeMode,setLeaveReport};
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);

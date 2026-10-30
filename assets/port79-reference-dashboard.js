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
function empty(id,text){const e=$(id);if(e)e.innerHTML='<div class="p79r-empty">'+esc(text)+'</div>'}
function svgChart(id,values,labels,rates){
 const el=$(id);if(!el)return;
 if(!values.length){empty(id,'這個月份尚無可繪製的資料');return}
 const w=480,h=190,left=38,right=rates?32:12,top=20,bottom=30,pw=w-left-right,ph=h-top-bottom;
 const max=Math.max(1,...values),step=Math.pow(10,Math.floor(Math.log10(max))),ceiling=Math.ceil(max/step)*step;
 const rateMax=Math.max(40,...(rates||[]).filter(Number.isFinite)),gap=pw/values.length,bw=Math.max(2,Math.min(34,gap*.65));
 let grid='',bars='',points=[];
 for(let i=0;i<=4;i++){const y=top+ph-i*ph/4;grid+='<path d="M'+left+' '+y+'H'+(w-right)+'" class="p79r-gridline"/><text x="'+(left-7)+'" y="'+(y+4)+'" text-anchor="end">'+fmt(ceiling*i/4)+'</text>';if(rates)grid+='<text x="'+(w-right+7)+'" y="'+(y+4)+'">'+fmt(rateMax*i/4)+'</text>'}
 values.forEach((v,i)=>{const x=left+gap*(i+.5),bh=v/ceiling*ph;bars+='<rect x="'+(x-bw/2)+'" y="'+(top+ph-bh)+'" width="'+bw+'" height="'+bh+'" rx="'+Math.min(5,bw/5)+'" fill="url(#'+id+'Gradient)"><title>'+esc(labels[i])+': '+fmt(v)+'</title></rect>';if(values.length<=6)bars+='<text x="'+x+'" y="'+(top+ph-bh-7)+'" text-anchor="middle" class="p79r-bar-number">'+fmt(v)+'</text>';if(values.length<=6||i===0||i===values.length-1||(i+1)%5===0)bars+='<text x="'+x+'" y="'+(h-8)+'" text-anchor="middle">'+esc(labels[i])+'</text>';if(rates&&Number.isFinite(rates[i]))points.push([x,top+ph-rates[i]/rateMax*ph]);});
 const line=points.length?'<polyline points="'+points.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="#12b88e" stroke-width="2.5"/>'+points.map(p=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="3.2" fill="white" stroke="#12b88e" stroke-width="2"/>').join(''):'';
 el.innerHTML='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(id==='p79DashShipBars'?'依船舶完工日統計的本月作業量與效率':'本月各週出勤人數')+'"><defs><linearGradient id="'+id+'Gradient" x2="0" y2="1"><stop stop-color="#5baaff"/><stop offset="1" stop-color="#1684ff"/></linearGradient></defs>'+grid+bars+line+'</svg>';
}
function vessels(v){
 const table=$('p79DashShipRanking');
 if(table)table.innerHTML=v.vessels.length?v.vessels.slice(0,5).map((s,i)=>'<tr><td>'+badge(i+1)+'</td><td title="'+esc(s.name+' / '+s.workingNo)+'">'+esc(s.name)+'</td><td>'+fmt(s.moves)+'</td><td>'+fmt(s.hours,1)+'</td><td>'+fmt(s.rate,2)+'</td><td><span class="p79r-state '+(s.date?'done':'neutral')+'">'+esc(s.status||(s.date?'已完工':'待核對'))+'</span></td></tr>').join(''):'<tr><td colspan="6">本月沒有船舶資料</td></tr>';
 const ym=$('p79DashMonth')?.value||'',days=new Date(Number(ym.slice(0,4)),Number(ym.slice(5)),0).getDate();
 const buckets=Array.from({length:days},()=>({moves:0,weight:0,rate:0,known:false}));
 for(const s of v.vessels){if(!s.date.startsWith(ym+'-')||s.moves===null)continue;const b=buckets[Number(s.date.slice(-2))-1];if(!b)continue;b.known=true;b.moves+=s.moves;if(s.rate!==null&&s.moves>0){b.weight+=s.moves;b.rate+=s.rate*s.moves}}
 if(buckets.some(b=>b.known))svgChart('p79DashShipBars',buckets.map(b=>b.moves),buckets.map((b,i)=>Number(ym.slice(5))+'/'+(i+1)),buckets.map(b=>b.weight?b.rate/b.weight:null));else empty('p79DashShipBars','船舶完工日期不足，請至船舶明細核對');
 const p=$('p79DashPeopleRanking');if(p)p.innerHTML=v.people.length?v.people.slice(0,5).map((r,i)=>'<tr><td>'+badge(i+1)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.dept||'—')+'</td><td>'+fmt(r.moves)+'</td><td>'+fmt(r.efficiency,2)+'</td></tr>').join(''):'<tr><td colspan="5">本月尚無可核對的個人作業明細</td></tr>';
 const missing=v.vessels.filter(x=>x.moves===null||x.rate===null).length,untimed=v.detailCount-v.timedRows;
 const notices=[{kind:missing?'warning':'success',glyph:missing?'info':'check',title:missing?missing+' 艘船舶統計欄位待核':'本月船舶資料已載入',text:missing?'請確認作業量與 GPH 資料':'共 '+fmt(v.count)+' 艘船舶，依完工月份彙整'}, {kind:'blue',glyph:'boxes',title:'本月請款櫃數 '+fmt(v.containers)+' 櫃',text:'作業量 '+fmt(v.moves)+' Moves，請款櫃數分別呈現'}, {kind:untimed?'amber':'blue',glyph:'clock',title:untimed?fmt(untimed)+' 筆作業明細缺少有效工時':'作業工時已彙整',text:untimed?'個人效率僅採用有有效工時的明細':'共 '+fmt(v.workHours,1)+' 小時，可查詢個人效率'}, {kind:'blue',glyph:'people',title:'本月 '+fmt(v.people.length)+' 位人員有作業紀錄',text:'查看船舶明細核對人員與派工作業'}];
 $('p79DashVesselNotices').innerHTML=notices.map(n=>'<button type="button" class="p79r-notice '+n.kind+'"><span class="p79r-notice-icon">'+icon(n.glyph)+'</span><span><strong>'+esc(n.title)+'</strong><small>'+esc(n.text)+'</small></span><span class="p79r-notice-arrow">›</span></button>').join('');
 $('p79DashVesselNotices').querySelectorAll('button').forEach(b=>b.addEventListener('click',detailBtn));
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
 svgChart('p79DashAttendanceBars',a.weeklyPeople,a.weeklyPeople.map((x,i)=>'第'+(i+1)+'週'));
}
function chrome(){
 if(!d.body.classList.contains('p79-workspace')||!$('p79Dashboard'))return;
 const intro=d.querySelector('.p79-modern-home-intro');if(!intro||!intro.querySelector('.p79-hero-greeting')||intro.dataset.referenceReady)return;
 intro.dataset.referenceReady='1';
 intro.querySelector('h2').innerHTML='<b>79號碼頭</b> 船舶作業 × 考勤人力 智慧管理中心';intro.querySelector('p').textContent='即時掌握船舶作業與人力出勤，提升碼頭營運效率';
 const greet=intro.querySelector('.p79-hero-greeting');const name=d.querySelector('.p79-user-name')?.textContent||'';
 greet.innerHTML='<div><strong><span class="p79r-sun">'+icon('sun')+'</span>您好，'+esc(name)+'</strong><span class="p79-home-date">'+new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date())+'</span></div><div class="p79r-hero-summary"><span id="p79rHeroMonth">本月作業船舶</span><b id="p79rHeroShipCount">'+esc($('p79DashShipCount')?.textContent||'—')+'</b><small>艘船舶</small></div>';
 const nav=$('p79SevenNav');if(nav)nav.querySelectorAll('a').forEach(a=>{if(a.dataset.p79Alias==='integration')a.classList.add('p79r-secondary');a.querySelector('.p79-nav-arrow')?.replaceChildren(d.createTextNode('›'));});
 const mark=d.querySelector('.p79-port-mark');if(mark){mark.setAttribute('viewBox','0 0 24 24');mark.setAttribute('fill','none');mark.setAttribute('stroke','#0888ff');mark.setAttribute('stroke-width','1.8');mark.innerHTML=paths.ship;}
 const tools=$('p79WorkspaceTopbar')?.querySelector('.p79-toolbar-tools');if(tools&&!$('p79rNotifications')){const b=d.createElement('button');b.id='p79rNotifications';b.type='button';b.setAttribute('aria-label','查看船舶作業提醒');b.innerHTML=icon('bell');b.onclick=()=>$('p79DashVesselNotices')?.scrollIntoView({behavior:'smooth',block:'center'});tools.prepend(b);}
}
function init(){
 if(!$('p79Dashboard'))return;
 d.querySelectorAll('.p79d-kpis').forEach((row,section)=>row.querySelectorAll('.p79d-kpi-icon').forEach((e,i)=>e.innerHTML=icon((section?['people','calendar','calendar','shield']:['ship','boxes','chart','clock'])[i])));
 ['p79dShipHeading','p79dAttendanceHeading'].forEach(id=>{const h=$(id);h.firstChild.textContent=id==='p79dShipHeading'?'船舶作業總覽 ':'考勤人力總覽 ';h.insertAdjacentHTML('afterbegin',icon('ship'));});
 d.querySelectorAll('.p79d-panel-title>b').forEach(e=>{e.textContent=e.textContent.replace(/^[▤▥◉]\s*/, '');e.insertAdjacentHTML('afterbegin','<span class="p79r-panel-mark">↥</span>')});
 chrome();new MutationObserver(chrome).observe(d.body,{attributes:true,attributeFilter:['class']});
}
function reset(){if($('p79DashVesselNotices'))empty('p79DashVesselNotices','正在核對本月資料…');if($('p79rHeroShipCount'))$('p79rHeroShipCount').textContent='—';}
g.P79ReferenceDashboard={vessels,attendance,reset};
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);

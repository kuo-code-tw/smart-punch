/* PORT79 HR visual dashboard: authoritative HR headcounts; other-system figures remain unfilled until linked. */
(function(){
'use strict';
var mounted=false;
var currentView='dashboard';
var lastCloudRefresh='';
function byId(id){return document.getElementById(id)}
function text(id,value){var el=byId(id);if(el)el.textContent=String(value)}
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]})}
function n(value){return new Intl.NumberFormat('zh-TW').format(Number(value)||0)}
function ymd(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')}
function parseDate(raw){
  if(raw instanceof Date)return isNaN(raw.getTime())?'':ymd(raw);
  var s=String(raw||'').trim().replace(/^民國\s*/,'').replace(/年/g,'/').replace(/月/g,'/').replace(/日/g,'').replace(/[.]/g,'/');
  var m=s.match(/^(\d{2,4})[-/](\d{1,2})[-/](\d{1,2})/);
  if(!m)return '';
  var year=Number(m[1]); if(year<1911)year+=1911;
  var month=Number(m[2]),day=Number(m[3]),date=new Date(year,month-1,day);
  if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return '';
  return ymd(date);
}
function status(e,asOf){
  var raw=String(e.employmentStatus||'').trim().toLowerCase();
  var st=['resigned','離職','terminated','inactive'].includes(raw)?'resigned':
    ['leave','留職停薪','留停','loa'].includes(raw)?'leave':'active';
  var termination=parseDate(e.terminationDate);
  if(st==='active'&&termination&&termination<=asOf)return 'resigned';
  return st;
}
function readEmployees(){try{return typeof employees!=='undefined'&&Array.isArray(employees)?employees:[]}catch(e){return []}}
function isCloudReady(){try{return typeof p79HrCloudDataReady!=='undefined'&&p79HrCloudDataReady}catch(e){return false}}
function authorized(action){try{return typeof canHr==='function'&&canHr(action)}catch(e){return false}}
function warnUnavailable(name){
 alert(name+'：目前的人資主檔未提供此功能所需的正式資料來源、計算規則和操作權限，暫不開放直接操作；不會產生虛構資料或異動既有資料。');
}
function header(){
 var shell=byId('p79HrShellV103');if(!shell)return false;
 shell.innerHTML=[
 '<div class="p79r-top">',
 '<a class="p79r-brand" href="../" aria-label="返回碼頭營運系統首頁"><span class="p79r-symbol">🚢</span><span class="p79r-name">碼頭營運統計</span></a>',
 '<nav class="p79r-nav" aria-label="人資管理功能">',
 '<button type="button" class="active" data-hr-view="dashboard">人資管理</button>',
 '<button type="button" data-hr-view="employees">員工資料</button>',
 '<a href="../attendance/" data-route="attendance">考勤管理</a>',
 '<a href="../schedule/" data-route="schedule">排班管理</a>',
 '<a href="../leave/" data-route="leave">請假管理</a>',
 '<a href="../work-hours/" data-route="workhours">加班管理</a>',
 '<button type="button" data-hr-view="payroll" title="授權薪資試算（尚非正式結算）">薪資作業</button>',
 '<a href="../aqc-efficiency/" data-route="efficiency" title="現有船舶與人員作業效率系統">績效管理</a>',
 '<button type="button" data-hr-view="training" title="教育訓練暫存台帳與 CSV 匯入匯出">教育訓練</button>',
 '</nav>',
 '<div class="p79r-controls">',
 '<span class="p79r-sync" id="p79rUpdated">資料待同步</span>',
 '<label class="p79r-date" title="日期用於到離職月份與趨勢；在職人數為目前主檔">作業日期 <input id="p79rWorkDate" type="date" aria-label="到離職月份的參考日期"></label>',
 '<div class="p79v103-menu-wrap p79r-more">',
 '<button type="button" onclick="window.p79HrToggleMenu(event)" aria-label="其他人資功能">☰ 更多</button>',
 '<div id="p79HrSystemMenu" class="p79v103-menu">',
 '<button type="button" onclick="window.p79HrMenuAction(\'refresh\')">↻ 重新同步</button>',
 '<button type="button" onclick="window.p79HrMenuAction(\'add\')">＋ 新增員工</button>',
 '<button type="button" onclick="window.p79HrMenuAction(\'org\')">⚙️ 部門／單位／職稱</button>',
 '<button type="button" onclick="window.p79HrMenuAction(\'permissions\')">🔐 權限總覽</button>',
 '<button type="button" onclick="window.p79HrMenuAction(\'logs\')">🧾 登入紀錄</button>',
 '<button type="button" onclick="window.p79HrMenuAction(\'export\')">📥 匯出人資名冊</button>',
 '<button type="button" onclick="window.p79HrMenuAction(\'theme\')">◐ 深淺色</button>',
 '<button type="button" onclick="window.p79HrMenuAction(\'home\')">⌂ 返回首頁</button>',
 '<button type="button" class="danger" onclick="window.p79HrMenuAction(\'logout\')">↪ 登出</button>',
 '</div></div></div></div>'
 ].join('');
 var date=byId('p79rWorkDate'); if(date){date.value=ymd(new Date());date.addEventListener('change',renderDashboard)}
 shell.querySelectorAll('[data-hr-view]').forEach(function(b){
   b.addEventListener('click',function(){window.p79HrDashboardGo(b.dataset.hrView)})
 });
 shell.querySelectorAll('[data-not-ready]').forEach(function(b){
   b.addEventListener('click',function(){warnUnavailable(b.textContent.trim())})
 });
 // Existing system pages enforce their own role and fine-grained permissions.
 shell.querySelectorAll('a[data-route]').forEach(function(a){
   a.addEventListener('click',function(){window.p79HrCloseMenu&&window.p79HrCloseMenu()})
 });
 return true;
}
function card(icon,title,id,sub,cls){
 return '<div class="p79r-kpi '+(cls||'')+'"><div class="head"><span class="ico">'+icon+'</span><span>'+title+'</span></div><div class="val" id="'+id+'">—</div><div class="sub" id="'+id+'Sub">'+sub+'</div></div>';
}
function panel(title,content){
 return '<section class="p79r-panel"><div class="p79r-title"><span class="glyph">▥</span>'+title+'</div>'+content+'</section>';
}
function mountDashboard(){
 var main=document.querySelector('main.wrap');
 if(!main)return false;
 if(byId('p79rDashboard'))return true;
 var d=document.createElement('div');d.id='p79rDashboard';
 d.innerHTML=[
 '<div class="p79r-kpis">',
 card('👥','在職人數','p79rActive','正式人資主檔',''),
 card('👤＋','本月到職','p79rHires','依到職日期',''),
 card('👤−','本月離職','p79rLeavers','依生效離職日期','purple'),
 card('☑','今日出勤率','p79rAttendance','以考勤系統為準',''),
 card('📅','本月請假人次','p79rLeaves','以請假系統為準','green'),
 card('◷','本月加班時數','p79rOvertime','以加班核定為準','purple'),
 card('↪','本月離職率','p79rTurnover','需正式期初人數','amber'),
 '</div>',
 '<div class="p79r-grid-top">',
 panel('各單位人員統計（在職）','<table aria-label="各部門在職人數"><thead><tr><th>單位</th><th>正式</th><th>約聘</th><th>派遣</th><th>合計</th><th>占比</th></tr></thead><tbody id="p79rDepts"><tr><td colspan="6">讀取人資主檔中…</td></tr></tbody></table>'),
 panel('今日出勤狀態（全公司）','<div class="p79r-donut"><div><span>在職人數<br><b id="p79rActiveDonut">—</b></span></div></div><div class="p79r-note" style="text-align:center">出勤／請假／未出勤人數需要考勤即時資料，不能以在職人數推估。<a class="p79r-link" href="../attendance/">查看考勤</a></div>'),
 panel('出勤率趨勢（近7日）','<div class="p79r-empty"><div class="big">—</div><div>尚未接入考勤日結數據</div><a class="p79r-link" href="../attendance/">前往考勤管理查看正式統計 ›</a></div>'),
 '</div>',
 '<div class="p79r-grid-mid">',
 panel('今日人員出勤明細','<div class="p79r-panel-head"><span class="p79r-note">完整打卡與核准資料由考勤系統提供</span><a class="p79r-link" href="../attendance/">查看出勤明細 ›</a></div><div class="p79r-empty"><div class="big">☑</div><div>請從考勤管理讀取真實打卡及補登資料</div></div>'),
 panel('本月請假統計（人次）','<div class="p79r-empty"><div class="big">—</div><div>請假核准資料尚未接入</div><a class="p79r-link" href="../leave/">查看請假管理 ›</a></div>'),
 panel('本月加班統計（小時）','<div class="p79r-empty"><div class="big">—</div><div>加班資料尚未接入</div><a class="p79r-link" href="../work-hours/">查看加班管理 ›</a></div>'),
 '</div>',
 '<div class="p79r-grid-bottom">',
 panel('重要提醒','<div id="p79rAlerts" role="status">正在核對人員資料…</div>'),
 panel('近30日到／離職趨勢','<div class="p79r-note">以人資主檔中有效的到職日、離職日計算</div><div class="p79r-chart" id="p79rHistoryChart"></div><div class="p79r-note" style="text-align:center;padding-top:8px">藍色：到職　紫色：離職</div>'),
 panel('快速功能','<div class="p79r-quick"><button type="button" data-hr-view="employees"><span class="icon">👤</span>員工資料</button><a href="../attendance/"><span class="icon">☑</span>考勤管理</a><a href="../schedule/"><span class="icon">♧</span>排班管理</a><a href="../leave/"><span class="icon">▣</span>請假管理</a><a href="../work-hours/"><span class="icon">◷</span>加班管理</a><button type="button" data-hr-command="add"><span class="icon">＋</span>員工新增</button><button type="button" data-hr-command="org"><span class="icon">♙</span>組織管理</button><button type="button" data-hr-command="report"><span class="icon">▥</span>人資報表</button></div><div class="p79r-note">所有人數皆以人資主檔及目前權限範圍為準；未串接的跨系統數據以「—」顯示，避免誤導。</div>'),
 '</div>'
 ].join('');
 var stats=main.querySelector(':scope>.stats');if(stats)main.insertBefore(d,stats);else main.appendChild(d);
 d.querySelectorAll('[data-hr-view]').forEach(function(b){b.addEventListener('click',function(){window.p79HrDashboardGo(b.dataset.hrView)})});
 d.querySelectorAll('[data-hr-command]').forEach(function(b){
  b.addEventListener('click',function(){
    var action=b.dataset.hrCommand;
    if(action==='add'){if(authorized('people.create'))window.openEditor&&window.openEditor();else alert('目前帳號沒有新增員工權限');return}
    if(action==='org'){window.openOrgSettings&&window.openOrgSettings();return}
    if(action==='report'){if(authorized('people.export'))window.exportEmployees&&window.exportEmployees();else alert('目前帳號沒有匯出人資資料權限')}
  });
 });
 return true;
}
function periodDate(){var el=byId('p79rWorkDate');return parseDate(el&&el.value)||ymd(new Date())}
function updateCounts(records,anchor,ready){
 var month=anchor.slice(0,7);
 var today=ymd(new Date());
 var active=records.filter(function(e){return status(e,today)==='active'});
 var resigned=records.filter(function(e){return status(e,today)==='resigned'});
 var hires=records.filter(function(e){var date=parseDate(e.startDate);return date&&date.slice(0,7)===month});
 var leavers=resigned.filter(function(e){var date=parseDate(e.terminationDate);return date&&date.slice(0,7)===month&&date<=anchor});
 text('p79rActive',ready||records.length?n(active.length):'—');
 text('p79rActiveDonut',ready||records.length?n(active.length):'—');
 text('p79rHires',ready||records.length?n(hires.length):'—');
 text('p79rLeavers',ready||records.length?n(leavers.length):'—');
 text('p79rActiveSub',isCloudReady()?'雲端主檔已核對':'快取／待雲端核對');
 text('p79rHiresSub',month+' 到職紀錄');
 text('p79rLeaversSub',month+' 生效離職');
 text('p79rAttendance','—');text('p79rLeaves','—');text('p79rOvertime','—');text('p79rTurnover','—');
 return {active:active,resigned:resigned,hires:hires,leavers:leavers};
}
function workerKind(e){
 var value=String(e.employmentType||e.contractType||e.staffType||'').trim().toLowerCase();
 if(/^(正職|正式|正社員|regular|permanent|full.time)$/.test(value))return 'regular';
 if(/^(約聘|契約|合約|contract|contractor|fixed.term)$/.test(value))return 'contract';
 if(/^(派遣|外包|dispatch|agency|temporary)$/.test(value))return 'dispatch';
 return '';
}
function updateDepartments(active){
 var byDept={};
 active.forEach(function(e){
   var name=String(e.dept||'未設定部門').trim()||'未設定部門';
   if(!byDept[name])byDept[name]={total:0,regular:0,contract:0,dispatch:0,unknown:0};
   var obj=byDept[name];obj.total++;var kind=workerKind(e);if(kind)obj[kind]++;else obj.unknown++;
 });
 var departments=Object.entries(byDept).sort(function(a,b){return b[1].total-a[1].total||a[0].localeCompare(b[0],'zh-TW')});
 var tbody=byId('p79rDepts');if(!tbody)return;
 if(!departments.length){tbody.innerHTML='<tr><td colspan="6">目前沒有可核對的在職員工</td></tr>';return}
 var visible=departments.slice(0,8);
 function typeCell(o,k){return o.unknown?'—':n(o[k])}
 tbody.innerHTML=visible.map(function(item){
   var o=item[1],pct=(o.total/active.length*100).toFixed(1)+'%';
   return '<tr><td>'+esc(item[0])+'</td><td>'+typeCell(o,'regular')+'</td><td>'+typeCell(o,'contract')+'</td><td>'+typeCell(o,'dispatch')+'</td><td><b>'+n(o.total)+'</b></td><td>'+pct+'</td></tr>';
 }).join('')+'<tr style="background:#e4f1ff;font-weight:900"><td>合計'+(departments.length>8?'（前8單位）':'')+'</td><td colspan="3">'+(active.some(function(e){return !workerKind(e)})?'類別資料未完整提供':'全部類別已核對')+'</td><td>'+n(visible.reduce(function(sum,item){return sum+item[1].total},0))+'</td><td>'+(visible.reduce(function(sum,item){return sum+item[1].total},0)/active.length*100).toFixed(1)+'%</td></tr>';
}
function updateAlerts(records,anchor,data){
 var recent=records.filter(function(e){var date=parseDate(e.terminationDate);return status(e,anchor)==='resigned'&&date&&date<=anchor&&date>=ymd(new Date(new Date(anchor+'T12:00:00').getTime()-6*86400000))}).length;
 var missingStart=data.active.filter(function(e){return !parseDate(e.startDate)}).length;
 var missingTermination=data.resigned.filter(function(e){return !parseDate(e.terminationDate)}).length;
 var inconsistent=records.filter(function(e){var raw=String(e.employmentStatus||'').toLowerCase();var term=parseDate(e.terminationDate);return !['resigned','離職','terminated','inactive','leave','留職停薪','留停','loa'].includes(raw)&&term&&term<=anchor}).length;
 var alerts=[
  ['離職','近7日已生效離職',recent],
  ['資料','在職人員缺少到職日',missingStart],
  ['核對','離職狀態缺少離職日',missingTermination],
  ['注意','離職日已到但狀態仍在職',inconsistent]
 ];
 text('p79rAlerts','');var target=byId('p79rAlerts');if(!target)return;
 target.innerHTML=alerts.map(function(row){
  return '<div class="p79r-reminder"><span><span class="p79r-pill">'+row[0]+'</span> '+row[1]+'</span><b>'+n(row[2])+' 人</b></div>';
 }).join('');
}
function updateHistory(records,anchor){
 var chart=byId('p79rHistoryChart');if(!chart)return;
 var end=new Date(anchor+'T12:00:00');
 var periods=[];
 for(var idx=3;idx>=0;idx--){
   var last=new Date(end.getTime()-idx*7*86400000);
   var first=new Date(last.getTime()-6*86400000),from=ymd(first),to=ymd(last);
   var joined=0,left=0;
   records.forEach(function(e){
     var start=parseDate(e.startDate),term=parseDate(e.terminationDate);
     if(start&&start>=from&&start<=to)joined++;
     if(status(e,anchor)==='resigned'&&term&&term>=from&&term<=to)left++;
   });
   periods.push({from:from,to:to,joined:joined,left:left});
 }
 var max=Math.max(1,...periods.map(function(p){return Math.max(p.joined,p.left)}));
 chart.innerHTML=periods.map(function(p){
   var h=Math.round(p.joined/max*93),h2=Math.round(p.left/max*93);
   return '<div class="p79r-chartcol"><div class="p79r-chartnum">'+p.joined+' / '+p.left+'</div><div style="display:flex;align-items:flex-end;gap:3px;height:96px;width:100%;justify-content:center"><div class="p79r-chartbar" style="height:'+Math.max(h,2)+'px;width:29%"></div><div class="p79r-chartbar rose" style="height:'+Math.max(h2,2)+'px;width:24%"></div></div><div class="p79r-chartlabel">'+p.from.slice(5)+'~'+p.to.slice(5)+'</div></div>';
 }).join('');
}
function renderDashboard(){
 if(!mounted)return;
 var records=readEmployees(),ready=isCloudReady(),anchor=periodDate();
 var data=updateCounts(records,anchor,ready);
 updateDepartments(data.active);
 updateAlerts(records,anchor,data);
 updateHistory(records,anchor);
 var now=new Date(),source=ready?'雲端已同步':records.length?'本機資料待核對':'資料待同步';
 if(ready)lastCloudRefresh=ymd(now)+' '+now.toLocaleTimeString('zh-TW',{hour12:false});
 text('p79rUpdated',source+(lastCloudRefresh?'｜'+lastCloudRefresh:''));
}
window.p79HrDashboardGo=function(view){
 currentView=view==='employees'?'employees':'dashboard';
 document.body.dataset.p79HrView=currentView;
 document.querySelectorAll('#p79HrShellV103 [data-hr-view]').forEach(function(el){
  el.classList.toggle('active',el.dataset.hrView===currentView);
 });
 if(currentView==='employees'&&byId('fStatus')){byId('fStatus').value='active';if(typeof render==='function')render()}
 window.scrollTo({top:0,behavior:'auto'});
};
window.p79HrDashRender=renderDashboard;
function mount(){
 if(mounted)return;
 document.getElementById('p79UnifiedShell')?.remove();
 document.getElementById('p79UnifiedShellV102')?.remove();
 document.getElementById('p79UnifiedShellV103')?.remove();
 if(!header()||!mountDashboard())return;
 mounted=true;
 document.body.classList.add('p79r-ready');
 window.p79HrDashboardGo(location.hash==='#employee-data'?'employees':'dashboard');
 renderDashboard();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
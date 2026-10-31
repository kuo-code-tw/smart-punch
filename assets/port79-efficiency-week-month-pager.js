/* PORT79 2026-10-31: 首頁船舶效率週（日～六）／年度逐月翻頁（唯讀）。
   週期固定星期日到星期六；沿用船舶主檔 GPH 與櫃量加權算法。
   不修改船舶、考勤、排班、請假、權限或 GAS 資料。 */
(function(g){
'use strict';
var d=g.document;
if(!d||!g.P79ReferenceDashboard||!g.P79MonthlyDashboard)return;
var $=id=>d.getElementById(id);
var base=g.P79ReferenceDashboard;
var model=g.P79MonthlyDashboard;
var originalVessels=base.vessels,originalReset=base.reset;
var mode='week',cursor='',selectedMonth='',sessionKey='',seq=0;
var cache=new Map(),inflight=new Map();
var style=d.createElement('style');
style.id='p79-efficiency-week-month-pager-style';
style.textContent=[
 '.p79-eff-pager{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:7px 1px 9px}',
 '.p79-eff-pager button{appearance:none;border:1px solid #dbe6f3;background:#fff;color:#356994;border-radius:9px;cursor:pointer;font-size:12px;font-weight:800;line-height:1.2;padding:7px 10px;min-height:32px}',
 '.p79-eff-pager button:hover{border-color:#83b9ef;background:#eff7ff}',
 '.p79-eff-pager button[aria-pressed="true"]{background:#1687e8;border-color:#1687e8;color:white}',
 '.p79-eff-pager button:focus-visible{outline:3px solid #9ecfff;outline-offset:2px}',
 '.p79-eff-pager .p79-eff-modes,.p79-eff-pager .p79-eff-arrows{display:flex;align-items:center;gap:5px}',
 '.p79-eff-pager .p79-eff-arrows button{font-size:19px;padding:3px 9px;min-width:30px}',
 '.p79-eff-pager .p79-eff-period{font-size:12px;color:#587493;font-weight:800;text-align:center;min-width:125px;font-variant-numeric:tabular-nums}',
 '.p79-eff-summary{font-size:11px;color:#66809a;padding:4px 1px 2px;text-align:right;line-height:1.5}',
 // 原首頁全站 CSS 把每張卡片鎖在 213/230px 並 overflow:hidden，
 // 加入週月控制列後就裁掉日期；只解除船舶效率趨勢卡片的固定高度。
 'html body.p79-workspace:has(#systems.show):has(#p79Dashboard) #p79Dashboard .p79d-panel.p79d-trend{height:auto!important;min-height:310px!important;max-height:none!important;overflow:hidden!important;align-self:start!important}',
 'html body.p79-workspace:has(#systems.show):has(#p79Dashboard) #p79Dashboard #p79DashShipBars.p79d-bars{height:185px!important;min-height:185px!important;overflow:visible!important;flex:none!important}',
 'html body.p79-workspace:has(#systems.show):has(#p79Dashboard) #p79Dashboard .p79d-trend .p79-eff-pager{padding:5px 1px 8px!important}',
 '@media(max-width:540px){.p79-eff-pager{justify-content:center}.p79-eff-pager .p79-eff-period{min-width:135px}html body.p79-workspace:has(#systems.show):has(#p79Dashboard) #p79Dashboard .p79d-panel.p79d-trend{min-height:345px!important}}'
].join('\n');
d.head.appendChild(style);
var periodEl=$('p79EffPeriod'),summaryEl=$('p79EffSummary'),chartEl=$('p79DashShipBars');
if(!periodEl||!chartEl)return;
function iso(d){return d.toISOString().slice(0,10);}
function date(s){return new Date(String(s)+'T12:00:00Z');}
function plus(d,n){var v=new Date(d.getTime());v.setUTCDate(v.getUTCDate()+n);return v;}
function taipeiToday(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function endOfMonth(ym){return iso(new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5)),0,12)));}
function mondayIndependentWeekStart(s){var v=date(s);return iso(plus(v,-v.getUTCDay()));}
function period(){
 var today=taipeiToday(),start,end;
 if(mode==='week'){start=mondayIndependentWeekStart(cursor);end=iso(plus(date(start),6));}
 else{start=cursor.slice(0,4)+'-01-01';end=cursor.slice(0,4)+'-12-31';}
 var months=new Set(),day=date(start);
 while(iso(day)<=end){months.add(iso(day).slice(0,7));day=plus(day,1);}
 return {start,end,months:[...months],future:start>today};
}
function fmtPeriod(p){
 var a=p.start.replaceAll('-','/'),b=p.end.slice(5).replace('-','/');
 return mode==='week'?a+'（日）～'+b+'（六）':p.start.slice(0,4)+' 年';
}
function cleanSession(){
 var user=null;try{user=JSON.parse(g.sessionStorage.getItem('port79_user_session')||'null');}catch(_){}
 var role=String(user?.adminRole||user?.role||'').toLowerCase(),fine=user?.finePermissions?.history||{};
 var allowed=!!user&&!user.punchOnly&&(role==='superadmin'||(role==='admin'&&String(user?.systemPermissions?.history||'none')!=='none'&&fine['vessel.view']===true));
 var token=g.sessionStorage.getItem('port79_user_token')||g.sessionStorage.getItem('port79_admin_token')||'';
 var gas=String(g.sessionStorage.getItem('port79_gas_url')||'').trim();
 var next=(user?.empId||'')+'|'+token+'|'+gas;
 if(next!==sessionKey){sessionKey=next;cache.clear();inflight.clear();seq++;}
 return {allowed,token,gas};
}
async function fetchMonth(ym,session){
 if(cache.has(ym))return cache.get(ym);
 if(inflight.has(ym))return inflight.get(ym);
 if(!session.allowed||!session.token||!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(session.gas))
  throw Error('沒有權限或尚未連接正式船舶資料');
 if(!g.P79HistoryRead?.read)throw Error('歷史船舶資料讀取模組未載入');
 var u=new URL(session.gas);
 u.searchParams.set('action','historyGetMonthData');
 u.searchParams.set('type','vessel');
 u.searchParams.set('month',ym);
 u.searchParams.set('token',session.token);
 u.searchParams.set('gcToken',session.token);
 var expected=sessionKey;
 var promise=g.P79HistoryRead.read(u.toString(),{forceCloud:false}).then(data=>{
  if(sessionKey!==expected)throw Error('登入狀態已更新');
  if(data?.month&&String(data.month)!==ym)throw Error('回傳月份不符');
  if(!Array.isArray(data?.shipMasters))throw Error('船舶月份資料不完整');
  var result=model.analyzeVessels(data).vessels;
  cache.set(ym,result);
  return result;
 }).finally(()=>inflight.delete(ym));
 inflight.set(ym,promise);
 return promise;
}
function daily(p){
 var all=[],seen=new Set();
 for(var ym of p.months)for(var v of cache.get(ym)||[]){
  if(!v||v.deleted||!v.date||v.date<p.start||v.date>p.end)continue;
  var id=String(v.workingNo||v.name+'|'+v.voyage)+'|'+v.date;
  if(seen.has(id))continue;
  seen.add(id);all.push(v);
 }
 var days=[],totalQuantity=0,totalHours=0;
 for(var dt=date(p.start);iso(dt)<=p.end;dt=plus(dt,1)){
  var dateKey=iso(dt),quantity=0,hours=0,count=0;
  for(var v of all){
   if(v.date!==dateKey)continue;
   var q=v.containers??v.moves,rate=v.rate;
   if(!(q>0)||!(rate>0))continue;
   quantity+=q;hours+=q/rate;count++;
  }
  if(hours>0){totalQuantity+=quantity;totalHours+=hours;}
  days.push({date:dateKey,gph:hours>0?quantity/hours:null,count});
 }
 return {days,average:totalHours>0?totalQuantity/totalHours:null,valid:days.filter(x=>x.gph!==null).length};
}
// 每月效率是一年 12 個月，每個月僅一筆船舶完工效率；不以當月每日數值作圖。
function monthly(p,failures){
 var series=[],allQuantity=0,allHours=0;
 for(var ym of p.months){
  var quantity=0,hours=0,count=0,seen=new Set();
  for(var v of cache.get(ym)||[]){
   if(!v||v.deleted||!v.date||v.date.slice(0,7)!==ym)continue;
   var id=String(v.workingNo||v.name+'|'+v.voyage)+'|'+v.date;
   if(seen.has(id))continue;
   seen.add(id);
   var q=v.containers??v.moves,rate=v.rate;
   if(!(q>0)||!(rate>0))continue;
   quantity+=q;hours+=q/rate;count++;
  }
  if(hours>0){allQuantity+=quantity;allHours+=hours;}
  series.push({date:ym,gph:hours>0?quantity/hours:null,count,failed:failures.has(ym)});
 }
 return {days:series,average:allHours>0?allQuantity/allHours:null,valid:series.filter(x=>x.gph!==null).length,failures:failures.size};
}
function draw(p,report){
 var days=report.days;
 if(summaryEl){
  var suffix=mode==='week'?'天':'個月',errorText=report.failures?' · '+report.failures+' 個月份讀取失敗（未計入）':'';
  summaryEl.textContent=(report.average===null?'沒有有效 GPH 資料':(report.failures?'已取得月份加權效率 ':'期間加權效率 ')+report.average.toFixed(2)+' GPH')+' · 有效 '+report.valid+' '+suffix+errorText;
 }
 var w=480,h=190,left=35,right=16,top=26,bottom=31,pw=w-left-right,ph=h-top-bottom;
 // 左側 GPH 刻度：一般週期固定顯示 15、20、25、30；
 // 若實際效率超出這個範圍，按每 5 GPH 自動延伸，避免折線被截斷。
 var validValues=days.filter(v=>Number.isFinite(v.gph)).map(v=>v.gph);
 var floor=validValues.length?Math.max(0,Math.min(15,Math.floor(Math.min(...validValues)/5)*5)):15;
 var ceiling=validValues.length?Math.max(30,Math.ceil(Math.max(...validValues)/5)*5):30;
 var range=ceiling-floor;
 var gap=pw/days.length,grid='',texts='',segments=[],part=[];
 var escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 for(var tick=floor;tick<=ceiling;tick+=5){
  var y0=top+ph-(tick-floor)/range*ph;
  grid+='<path class="p79r-gridline" d="M'+left+' '+y0+'H'+(w-right)+'"/><text x="'+(left-7)+'" y="'+(y0+4)+'" text-anchor="end">'+tick+'</text>';
 }
 for(var i=0;i<days.length;i++){
  var x=left+gap*(i+.5),row=days[i],label=mode==='week'?Number(row.date.slice(5,7))+'/'+Number(row.date.slice(-2)):Number(row.date.slice(5,7))+'月';
  texts+='<text x="'+x+'" y="'+(h-8)+'" text-anchor="middle">'+label+'</text>';
  if(row.gph===null){
   if(part.length)segments.push(part);part=[];
   texts+='<text x="'+x+'" y="'+(top+ph-9)+'" text-anchor="middle" opacity=".45" font-size="11">'+(row.failed?'!':'—')+'</text>';
   continue;
  }
  var y=top+ph-(row.gph-floor)/range*ph;part.push([x,y]);
  texts+='<circle cx="'+x+'" cy="'+y+'" r="4" fill="white" stroke="#1687ff" stroke-width="2.5"><title>'+escape(row.date+(mode==='week'?'':' 月')+'：'+row.gph.toFixed(2)+' GPH / '+row.count+' 艘船舶')+'</title></circle>';
  if(mode==='week')texts+='<text class="p79r-bar-number" x="'+x+'" y="'+(y-10)+'" text-anchor="middle">'+row.gph.toFixed(2)+'</text>';
 }
 if(part.length)segments.push(part);
 var lines=segments.map(s=>'<polyline points="'+s.map(x=>x.join(',')).join(' ')+'" fill="none" stroke="#1687ff" stroke-width="2.5"/>').join('');
 chartEl.innerHTML='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+escape((mode==='week'?'每週每日':'年度逐月')+'船舶效率，'+p.start+' 至 '+p.end)+'">'+grid+lines+texts+'</svg>';
}
// 年度月份資料讀取限制並行，避免同時向 GAS 發送 12 個請求。
async function loadYear(p,session,requestId){
 var todayMonth=taipeiToday().slice(0,7);
 var queue=p.months.filter(ym=>ym<=todayMonth&&!cache.has(ym));
 var total=queue.length,done=0,errors=new Set();
 if(!total)return errors;
 var workers=Array.from({length:Math.min(3,total)},async()=>{
  while(queue.length){
   var ym=queue.shift();
   try{await fetchMonth(ym,session);}catch(error){errors.add(ym);console.warn('[PORT79 月效率] '+ym+' 資料讀取失敗',error);}
   done++;
   if(requestId===seq){
    chartEl.textContent='正在彙整 '+p.start.slice(0,4)+' 年各月份船舶效率（'+done+'/'+total+'）';
    if(summaryEl)summaryEl.textContent='依船舶完工月份統計 · 不拆分跨日船舶';
   }
  }
 });
 await Promise.all(workers);
 return errors;
}
async function render(){
 var p=period(),session=cleanSession(),requestId=++seq;
 periodEl.textContent=fmtPeriod(p);
 ['p79EffWeek','p79EffMonth'].forEach(id=>{
  var b=$(id);if(b)b.setAttribute('aria-pressed',String((id==='p79EffWeek')===(mode==='week')));
 });
 $('p79EffPrevious')?.setAttribute('aria-label',mode==='week'?'上一週':'上一年');
 $('p79EffNext')?.setAttribute('aria-label',mode==='week'?'下一週':'下一年');
 var caption=chartEl.closest('article')?.querySelector('.p79d-panel-title>span');
 if(caption)caption.textContent=mode==='week'?'依船舶完工日 · GPH':'依船舶完工月份 · GPH';
 if(!session.allowed){chartEl.textContent='目前登入身分沒有船舶歷史資料的檢視權限';if(summaryEl)summaryEl.textContent='';return;}
 if(p.future){chartEl.textContent='所選期間尚未開始';if(summaryEl)summaryEl.textContent='';return;}
 chartEl.innerHTML='<div class="p79r-empty">正在讀取 '+(mode==='week'?'每週':'年度逐月')+'船舶效率…</div>';
 if(summaryEl)summaryEl.textContent='';
 try{
  if(mode==='week'){
   await Promise.all(p.months.map(ym=>fetchMonth(ym,session)));
   if(requestId!==seq)return;
   draw(p,daily(p));
  }else{
   var failures=await loadYear(p,session,requestId);
   if(requestId!==seq)return;
   draw(p,monthly(p,failures));
  }
 }catch(error){
  if(requestId!==seq)return;
  chartEl.textContent='尚無法讀取：'+String(error?.message||error);
 }
}
function latestDateForMonth(month){
 var now=taipeiToday();
 return month===now.slice(0,7)?now:endOfMonth(month);
}
function setMode(next){
 if(next===mode)return;
 mode=next;render();
}
function move(n){
 if(mode==='week')cursor=iso(plus(date(cursor),7*n));
 else{
  cursor=String(Number(cursor.slice(0,4))+n)+'-01-01';
 }
 render();
}
function onVessels(v){
 originalVessels.call(base,v);
 var now=$('p79DashMonth')?.value||taipeiToday().slice(0,7);
 var s=cleanSession();
 if(!s.allowed)return;
 cache.set(now,v.vessels||[]);
 var range=model.weeklyWindow(now),previous=range.start.slice(0,7);
 if(previous!==now&&Array.isArray(v.weekVessels)&&!v.weekError){
  cache.set(previous,v.weekVessels.filter(x=>x.date?.startsWith(previous)));
 }
 if(now!==selectedMonth){selectedMonth=now;cursor=latestDateForMonth(now);}
 if(!cursor)cursor=latestDateForMonth(now);
 render();
}
base.vessels=onVessels;
base.reset=function(){originalReset.call(base);seq++;};
$('p79EffWeek')?.addEventListener('click',()=>setMode('week'));
$('p79EffMonth')?.addEventListener('click',()=>setMode('month'));
$('p79EffPrevious')?.addEventListener('click',()=>move(-1));
$('p79EffNext')?.addEventListener('click',()=>move(1));
cursor=latestDateForMonth($('p79DashMonth')?.value||taipeiToday().slice(0,7));
})(window);

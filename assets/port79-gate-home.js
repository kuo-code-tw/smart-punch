/* PORT79 homepage | read-only monthly / annual gate-volume tab.
 * No private gate.xlsx data is embedded in the public static site.
 * Real figures require the authenticated GAS action gateStatsReadYear to return:
 * {ok:true,source:"port79-gate-daily",year:"2026",rows:[
 *  {date:"2026-11-01",deliverEmpty:2,pickupEmpty:37,
 *   deliverLoaded:213,pickupLoaded:122,truckEntries:263}
 * ]}
 * The Gate Excel import entry is at ./gate-import/.
 * A future importer can call P79GateStatsHome.setYearRows(year, dailyRows)
 * after the official cloud save. Never use browser-local figures as the source of truth.
 */
(function(g){
 'use strict';
 var d=g.document;if(!d)return;
 var $=id=>d.getElementById(id);
 var names=['deliverEmpty','pickupEmpty','deliverLoaded','pickupLoaded','truckEntries'];
 var ids=['p79GateDeliverEmpty','p79GatePickupEmpty','p79GateDeliverLoaded','p79GatePickupLoaded','p79GateTruckEntries'];
 var fmt=n=>Number(n).toLocaleString('zh-TW');
 var mode='month',month='',year='',day='',active='operations',generation=0;
 var memory=new Map(),authStamp='',initialized=false;
 function taipeiToday(){
  var parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  var part=type=>parts.find(p=>p.type===type)?.value||'';
  return part('year')+'-'+part('month')+'-'+part('day');
 }
 function auth(){
  var s=null;
  try{s=JSON.parse(g.sessionStorage?.getItem('port79_user_session')||'null')}catch(_){}
  var token=String(g.sessionStorage?.getItem('port79_user_token')||g.sessionStorage?.getItem('port79_admin_token')||'').trim();
  var role=String(s?.adminRole||s?.role||'').toLowerCase();
  var fine=s?.finePermissions?.history||{};
  var allowed=!!s&&!s.punchOnly&&(role==='superadmin'||(
   role==='admin'&&String(s?.systemPermissions?.history||'none')!=='none'&&fine['vessel.view']===true
  ));
  var url=String(g.sessionStorage?.getItem('port79_gas_url')||'').trim();
  return {token,allowed,url,stamp:token+'|'+String(s?.empId||s?.id||'')};
 }
 function validateCount(v){
  if(v===null||v===undefined||String(v).trim()==='')return null;
  var n=Number(v);
  return Number.isSafeInteger(n)&&n>=0?n:null;
 }
 function normalize(raw,yr){
  if(!Array.isArray(raw))return [];
  var byDate=new Map();
  raw.forEach(function(r){
   if(!r||typeof r!=='object')return;
   var date=String(r.date||'').trim().replace(/\//g,'-');
   if(!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)||date.slice(0,4)!==yr)return;
   var dd=new Date(date+'T00:00:00Z');
   if(!Number.isFinite(dd.getTime())||dd.toISOString().slice(0,10)!==date)return;
   var counts=names.map(k=>validateCount(r[k]));
   if(counts.some(v=>v===null))return;
   byDate.set(date,Object.assign({date},Object.fromEntries(names.map((k,i)=>[k,counts[i]]))));
  });
  return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
 }
 function shiftDate(value,amount){
  var dt=new Date(value+'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate()+amount);
  return dt.toISOString().slice(0,10);
 }
 function rangeFor(which,anchor){
  var date=anchor||day;
  var yr=date.slice(0,4),mo=date.slice(0,7);
  if(which==='day')return {start:date,end:date,label:date.replace(/-/g,'/')};
  if(which==='week'){
   var weekday=new Date(date+'T00:00:00Z').getUTCDay();
   var monday=shiftDate(date,-((weekday+6)%7));
   var sunday=shiftDate(monday,6);
   return {start:monday,end:sunday,label:monday.slice(5).replace('-','/')+'－'+sunday.slice(5).replace('-','/')+' 週'};
  }
  if(which==='month'){
   var last=new Date(Date.UTC(Number(yr),Number(mo.slice(5)),0)).getUTCDate();
   return {start:mo+'-01',end:mo+'-'+String(last).padStart(2,'0'),label:yr+' 年 '+Number(mo.slice(5))+' 月'};
  }
  return {start:yr+'-01-01',end:yr+'-12-31',label:yr+' 年'};
 }
 function periodYears(range){
  return [...new Set([range.start.slice(0,4),range.end.slice(0,4)])];
 }
 function sumRows(rows,range){
  var subset=rows.filter(r=>r.date>=range.start&&r.date<=range.end);
  if(!subset.length)return {days:0,totals:null};
  var sums=Object.fromEntries(names.map(k=>[k,0]));
  subset.forEach(r=>names.forEach(k=>{sums[k]+=r[k];}));
  return {days:subset.length,totals:sums};
 }
 function setStats(totals){
  ids.forEach((id,i)=>{var el=$(id);if(el)el.textContent=totals?fmt(totals[names[i]]):'—';});
  var total=$('p79GateTotalContainers');
  if(total)total.textContent=totals?
   fmt(totals.deliverEmpty+totals.pickupEmpty+totals.deliverLoaded+totals.pickupLoaded):'—';
 }
 function status(message,detail){
  var el=$('p79GateStatus');if(el){el.textContent=message;el.title=detail||'';}
 }
 function render(){
  var range=rangeFor(mode,day),period=$('p79GatePeriod');
  if(period)period.textContent=range.label;
  for(var kind of ['day','week','month','year']){
   var button=$('p79Gate'+kind[0].toUpperCase()+kind.slice(1));
   if(button)button.setAttribute('aria-pressed',String(mode===kind));
  }
  var captions={day:['前一天','後一天'],week:['上一週','下一週'],month:['上一個月','下一個月'],year:['上一年','下一年']};
  $('p79GatePrev')?.setAttribute('aria-label',captions[mode][0]);
  $('p79GateNext')?.setAttribute('aria-label',captions[mode][1]);
  if(!periodYears(range).every(yr=>memory.has(yr))){setStats(null);return;}
  var rows=periodYears(range).flatMap(yr=>memory.get(yr));
  var result=sumRows(rows,range);
  setStats(result.totals);
  status(result.days?'已記錄 '+result.days+' 天 · 本期合計':'此期間尚無 Gate 資料');
 }
 function updateAuth(){
  var current=auth();
  if(authStamp!==current.stamp){authStamp=current.stamp;memory.clear();}
  return current;
 }
 async function loadPeriod(){
  var current=updateAuth(),requestId=++generation,range=rangeFor(mode,day);
  render();
  if(!current.allowed||!current.token){status('請登入有權限的帳號查看');return;}
  var missing=periodYears(range).filter(yr=>!memory.has(yr));
  if(!missing.length){render();return;}
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(current.url)||!g.P79HistoryRead?.read){
   status('Gate 正式資料服務尚未就緒');return;
  }
  status('正在讀取正式 Gate 資料…');
  try{
   await Promise.all(missing.map(async function(yr){
    var u=new URL(current.url);
    u.searchParams.set('action','gateStatsReadYear');
    u.searchParams.set('year',yr);
    u.searchParams.set('gcToken',current.token);
    u.searchParams.set('token',current.token);
    var data=await g.P79HistoryRead.read(u.toString(),{forceCloud:true});
    if(data?.ok!==true||data?.source!=='port79-gate-daily'||String(data?.year)!==yr||!Array.isArray(data?.rows))
     throw Error('正式 Gate 資料查詢格式不符');
    if(requestId===generation&&auth().stamp===current.stamp&&active==='gate')
     memory.set(yr,normalize(data.rows,yr));
   }));
   if(requestId!==generation||auth().stamp!==current.stamp||active!=='gate')return;
   render();
  }catch(error){
   if(requestId!==generation||active!=='gate')return;
   setStats(null);
   status('正式 Gate 資料暫時無法取得',String(error?.message||error).slice(0,140));
  }
 }
 function chooseMode(next){
  if(!['day','week','month','year'].includes(next))return;
  // On first daily view, show the newest confirmed day within the selected month,
  // rather than a blank current date while today's report has not been imported.
  if(next==='day'&&mode!=='day'&&memory.has(day.slice(0,4))){
   var candidates=memory.get(day.slice(0,4)).filter(r=>r.date.slice(0,7)===day.slice(0,7)&&r.date<=day);
   if(candidates.length)day=candidates[candidates.length-1].date;
  }
  mode=next;month=day.slice(0,7);year=day.slice(0,4);
  if(active==='gate')void loadPeriod();else render();
 }
 function move(step){
  if(mode==='day')day=shiftDate(day,step);
  else if(mode==='week')day=shiftDate(day,step*7);
  else if(mode==='month'){
   var parts=day.split('-').map(Number);
   var dt=new Date(Date.UTC(parts[0],parts[1]-1+step,1));
   day=dt.toISOString().slice(0,7)+'-01';
  }else day=String(Math.max(2000,Math.min(2099,Number(day.slice(0,4))+step)))+'-01-01';
  month=day.slice(0,7);year=day.slice(0,4);
  if(active==='gate')void loadPeriod();else render();
 }
 // The vessel dashboard's base stylesheet fixes *both* the grid row (260/275px)
// and each article's max-height. The Gate six-tile panel must release both.
// Inline important values take precedence over late-injected dashboard CSS;
// they are removed when returning to the original vessel ranking.
/* Size belongs to the CSS ship-row breakpoints (260px desktop, 275px phone).
 * Never set inline important max-content/auto here: it overrules the matching
 * trend card and leaves Gate taller on desktop. Clean up previous inline rules
 * when switching tabs; the scoped CSS performs the equal-height layout. */
function gateNaturalHeight(){
 var panel=$('p79HomeGatePanel');
 var card=panel?.closest?.('article.p79d-gate-flip');
 var grid=card?.closest?.('.p79d-ship-panels');
 var metric=panel?.querySelector?.('.p79-gate-metrics');
 [
  [grid,['grid-auto-rows','align-items']],
  [card,['height','min-height','max-height','overflow','overflow-y','align-self']],
  [panel,['height','min-height','max-height','overflow','overflow-y','flex']],
  [metric,['height','min-height','max-height','overflow','overflow-y']]
 ].forEach(function(item){
  if(!item[0]?.style)return;
  item[1].forEach(function(key){item[0].style.removeProperty(key);});
 });
}
function switchTab(which){
  // The two tabs flip only this one small ranking card, never the whole homepage.
  if(which!=='operations'&&which!=='gate')return;
  active=which;
  var isGate=which==='gate';
  $('p79Dashboard')?.classList?.toggle('p79-gate-view-active',isGate);
  gateNaturalHeight(isGate);
  $('p79HomeOperationsTab')?.setAttribute('aria-selected',String(!isGate));
  $('p79HomeGateTab')?.setAttribute('aria-selected',String(isGate));
  var ranking=$('p79RankingView'),section=$('p79HomeGatePanel');
  if(ranking)ranking.hidden=isGate;
  if(section)section.hidden=!isGate;
  var count=$('p79DashShipRankingCount');
  if(count)count.hidden=isGate;
  if(isGate)void loadPeriod();
 }
 // This read-only injection point is for a future authenticated cloud importer.
 // Never persist business figures in localStorage or ship them in public source code.
 function setYearRows(yr,raw){
  yr=String(yr);
  if(!/^20\d{2}$/.test(yr))throw Error('Invalid gate statistic year');
  memory.set(yr,normalize(raw,yr));
  if(yr===year)render();
 }
 function init(){
  if(initialized||!$('p79HomeGatePanel'))return;
  initialized=true;day=taipeiToday();month=day.slice(0,7);year=day.slice(0,4);
  $('p79HomeOperationsTab')?.addEventListener('click',()=>switchTab('operations'));
  $('p79HomeGateTab')?.addEventListener('click',()=>switchTab('gate'));
  $('p79GateDay')?.addEventListener('click',()=>chooseMode('day'));
  $('p79GateWeek')?.addEventListener('click',()=>chooseMode('week'));
  $('p79GateMonth')?.addEventListener('click',()=>chooseMode('month'));
  $('p79GateYear')?.addEventListener('click',()=>chooseMode('year'));
  $('p79GatePrev')?.addEventListener('click',()=>move(-1));
  $('p79GateNext')?.addEventListener('click',()=>move(1));
  d.addEventListener('keydown',function(e){
   var t=e.target,tabIds=['p79HomeOperationsTab','p79HomeGateTab'];
   if(!t||!tabIds.includes(t.id)||!['ArrowLeft','ArrowRight'].includes(e.key))return;
   e.preventDefault();
   var next=t.id==='p79HomeOperationsTab'?'gate':'operations';
   switchTab(next);
   $(next==='gate'?'p79HomeGateTab':'p79HomeOperationsTab')?.focus();
  });
  // Ordinary administrator phones no longer show the Gate panel.
  // Keep the default operations tab without requesting Gate data in the background.
  render();
 }
 g.P79GateStatsHome={setYearRows,normalize,rangeFor,aggregateFor:function(rows,yr,selectedMode,selectedAnchor){
  var anchor=String(selectedAnchor||yr+'-01-01');
  if(/^\d{4}-\d{2}$/.test(anchor))anchor+='-01';
  return sumRows(normalize(rows,String(yr)),rangeFor(['day','week','month','year'].includes(selectedMode)?selectedMode:'month',anchor));
 },chooseMode,move,switchTab};
 if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);

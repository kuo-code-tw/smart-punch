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
 var mode='month',month='',year='',active='operations',generation=0;
 var memory=new Map(),authStamp='';
 var initialized=false;
 function taipeiMonth(){
  var parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).formatToParts(new Date());
  var y=parts.find(v=>v.type==='year')?.value||String(new Date().getUTCFullYear());
  var m=parts.find(v=>v.type==='month')?.value||'01';
  return y+'-'+m.padStart(2,'0');
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
 function setStats(totals){
  ids.forEach((id,i)=>{var el=$(id);if(el)el.textContent=totals?fmt(totals[names[i]]):'—';});
  var total=$('p79GateTotalContainers');
  if(total)total.textContent=totals?
   fmt(totals.deliverEmpty+totals.pickupEmpty+totals.deliverLoaded+totals.pickupLoaded):'—';
 }
 function status(message,detail){var el=$('p79GateStatus');if(el){el.textContent=message;el.title=detail||'';}}
 function monthText(m){return m.slice(0,4)+' 年 '+Number(m.slice(5,7))+' 月'}
 function aggregate(rows){
  var subset=mode==='month'?rows.filter(r=>r.date.slice(0,7)===month):rows;
  if(!subset.length)return {days:0,totals:null};
  var sums=Object.fromEntries(names.map(k=>[k,0]));
  subset.forEach(r=>names.forEach(k=>{sums[k]+=r[k];}));
  return {days:subset.length,totals:sums};
 }
 function render(){
  var m=$('p79GatePeriod');if(m)m.textContent=mode==='month'?monthText(month):year+' 年度累計';
  var b1=$('p79GateMonth'),b2=$('p79GateYear');
  if(b1)b1.setAttribute('aria-pressed',String(mode==='month'));
  if(b2)b2.setAttribute('aria-pressed',String(mode==='year'));
  var previous=$('p79GatePrev'),next=$('p79GateNext');
  if(previous)previous.setAttribute('aria-label',mode==='month'?'上一個月':'上一年');
  if(next)next.setAttribute('aria-label',mode==='month'?'下一個月':'下一年');
  var stored=memory.get(year);
  if(!stored){setStats(null);return;}
  var result=aggregate(stored);
  setStats(result.totals);
  status(result.days?'累計 '+result.days+' 個作業日':'本期尚無統計資料');
 }
 function updateAuth(){
  var current=auth();
  if(authStamp!==current.stamp){authStamp=current.stamp;memory.clear();}
  return current;
 }
 async function loadYear(yr){
  var current=updateAuth(),requestId=++generation;
  render();
  if(!current.allowed||!current.token){status('登入後即可查看累計');return;}
  if(memory.has(yr)){render();return;}
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(current.url)||!g.P79HistoryRead?.read){
   status('累計資料尚未同步');return;
  }
  status('讀取累計資料中…');
  try{
   var u=new URL(current.url);
   u.searchParams.set('action','gateStatsReadYear');
   u.searchParams.set('year',yr);
   u.searchParams.set('gcToken',current.token);
   u.searchParams.set('token',current.token);
   var data=await g.P79HistoryRead.read(u.toString(),{forceCloud:true});
   if(requestId!==generation||auth().stamp!==current.stamp||yr!==year||active!=='gate')return;
   if(data?.ok!==true||data?.source!=='port79-gate-daily'||String(data?.year)!==yr||!Array.isArray(data?.rows))
    throw Error('進出站櫃量服務尚未啟用或回傳格式不符');
   memory.set(yr,normalize(data.rows,yr));
   render();
  }catch(error){
   if(requestId!==generation||yr!==year||active!=='gate')return;
   setStats(null);
   status('累計資料暫時無法取得',String(error?.message||error).slice(0,140));
  }
 }
 function chooseMode(next){
  if(next!=='month'&&next!=='year')return;
  mode=next;
  year=month.slice(0,4);
  if(active==='gate')void loadYear(year);else render();
 }
 function move(step){
  if(mode==='month'){
   var parts=month.split('-').map(Number);
   var dt=new Date(Date.UTC(parts[0],parts[1]-1+step,1));
   month=dt.getUTCFullYear()+'-'+String(dt.getUTCMonth()+1).padStart(2,'0');
   year=month.slice(0,4);
  }else{
   year=String(Number(year)+step);
   if(!/^20\d{2}$/.test(year)){year=String(Math.max(2000,Math.min(2099,Number(year))));}
   month=year+month.slice(4);
  }
  if(active==='gate')void loadYear(year);else render();
 }
 // The vessel dashboard's base stylesheet fixes *both* the grid row (260/275px)
// and each article's max-height. The Gate six-tile panel must release both.
// Inline important values take precedence over late-injected dashboard CSS;
// they are removed when returning to the original vessel ranking.
function gateNaturalHeight(open){
 var panel=$('p79HomeGatePanel');
 var card=panel?.closest?.('article.p79d-gate-flip');
 var grid=card?.closest?.('.p79d-ship-panels');
 function props(el,values){
  if(!el?.style)return;
  Object.keys(values).forEach(function(key){
   if(open)el.style.setProperty(key,values[key],'important');
   else el.style.removeProperty(key);
  });
 }
 props(grid,{'grid-auto-rows':'max-content','align-items':'start'});
 props(card,{'height':'auto','min-height':'0','max-height':'none',
   'overflow':'visible','overflow-y':'visible','align-self':'start'});
 props(panel,{'height':'auto','min-height':'0','max-height':'none',
   'overflow':'visible','overflow-y':'visible','flex':'0 0 auto'});
 // Old dashboard CSS also fixes children to a scrollable height: remove
 // those constraints on the Gate side, but not on the ship-ranking side.
 var metric=panel?.querySelector?.('.p79-gate-metrics');
 props(metric,{'height':'auto','max-height':'none','min-height':'0',
   'overflow':'visible','overflow-y':'visible'});
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
  if(isGate)void loadYear(year);
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
  initialized=true;month=taipeiMonth();year=month.slice(0,4);
  $('p79HomeOperationsTab')?.addEventListener('click',()=>switchTab('operations'));
  $('p79HomeGateTab')?.addEventListener('click',()=>switchTab('gate'));
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
  render();
 }
 g.P79GateStatsHome={setYearRows,normalize,aggregateFor:function(rows,yr,selectedMode,selectedMonth){
  var prevMode=mode,prevMonth=month;
  mode=selectedMode==='year'?'year':'month';month=selectedMonth;
  var result=aggregate(normalize(rows,String(yr)));
  mode=prevMode;month=prevMonth;
  return result;
 },chooseMode,move,switchTab};
 if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);

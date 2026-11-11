/* PORT79 vessel-system Gate dashboard: authenticated read-only daily/week/month/year.
 * Reads only official gateStatsReadYear data; never ships private Gate figures.
 */
(function(g){
 'use strict';
 var d=g.document;if(!d)return;
 var $=id=>d.getElementById(id);
 var fields=['deliverEmpty','pickupEmpty','deliverLoaded','pickupLoaded','truckEntries'];
 var ids=['gateLiveDe','gateLivePe','gateLiveDl','gateLivePl','gateLiveTruck'];
 var mode='month',anchor='',cache=new Map(),stamp='',requestId=0,page=0,ready=false;
 var fmt=n=>Number(n).toLocaleString('zh-TW');
 function today(){
  var parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  var part=key=>parts.find(p=>p.type===key)?.value||'';
  return part('year')+'-'+part('month')+'-'+part('day');
 }
 function shift(date,n){
  var dt=new Date(date+'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate()+n);
  return dt.toISOString().slice(0,10);
 }
 function range(which,date){
  var year=date.slice(0,4),month=date.slice(0,7);
  if(which==='day')return {start:date,end:date,label:date.replace(/-/g,'/')};
  if(which==='week'){
   var monday=shift(date,-((new Date(date+'T00:00:00Z').getUTCDay()+6)%7));
   return {start:monday,end:shift(monday,6),label:monday.replace(/-/g,'/')+' ～ '+shift(monday,6).replace(/-/g,'/')};
  }
  if(which==='month'){
   var last=new Date(Date.UTC(Number(year),Number(month.slice(5)),0)).getUTCDate();
   return {start:month+'-01',end:month+'-'+String(last).padStart(2,'0'),label:year+' 年 '+Number(month.slice(5))+' 月'};
  }
  return {start:year+'-01-01',end:year+'-12-31',label:year+' 年度'};
 }
 function years(r){return [...new Set([r.start.slice(0,4),r.end.slice(0,4)])];}
 function creds(){
  var s=null;
  try{s=JSON.parse(g.sessionStorage?.getItem('port79_user_session')||'null')}catch(_){}
  var role=String(s?.adminRole||s?.role||'').toLowerCase();
  var allowed=!!s&&!s.punchOnly&&(role==='superadmin'||(role==='admin'&&
    String(s?.systemPermissions?.history||'none')!=='none'&&
    s?.finePermissions?.history?.['vessel.view']===true));
  var token=String(g.sessionStorage?.getItem('port79_user_token')||
    g.sessionStorage?.getItem('port79_admin_token')||'').trim();
  var url=String(g.sessionStorage?.getItem('port79_gas_url')||'').trim();
  return {allowed,token,url,stamp:token+'|'+String(s?.empId||s?.id||'')};
 }
 function cleanRows(input,year){
  if(!Array.isArray(input))return [];
  var dates=new Map();
  input.forEach(function(row){
   if(!row||typeof row!=='object')return;
   var date=String(row.date||'').replace(/\//g,'-').trim();
   if(!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)||date.slice(0,4)!==year)return;
   var dt=new Date(date+'T00:00:00Z');
   if(!Number.isFinite(dt.getTime())||dt.toISOString().slice(0,10)!==date)return;
   var record={date},valid=true;
   fields.forEach(function(key){
    var value=row[key],n=Number(value);
    if(value===null||value===undefined||String(value).trim()===''||!Number.isSafeInteger(n)||n<0)valid=false;
    record[key]=n;
   });
   if(valid)dates.set(date,record);
  });
  return [...dates.values()].sort((a,b)=>a.date.localeCompare(b.date));
 }
 function summarize(rows){
  var sums=Object.fromEntries(fields.map(key=>[key,0]));
  rows.forEach(row=>fields.forEach(key=>{sums[key]+=row[key];}));
  return sums;
 }
 function total(sums){return sums.deliverEmpty+sums.pickupEmpty+sums.deliverLoaded+sums.pickupLoaded;}
 function state(message,kind){
  var status=$('gateLiveStatus');
  if(status){status.textContent=message;status.dataset.state=kind||'info';}
 }
 function showCards(sums){
  ids.forEach((id,i)=>{if($(id))$(id).textContent=sums?fmt(sums[fields[i]]):'—';});
  if($('gateLiveTotal'))$('gateLiveTotal').textContent=sums?fmt(total(sums)):'—';
 }
 function detailRows(rows,which){
  if(which!=='year')return rows;
  var grouped=new Map();
  rows.forEach(function(row){
   var key=row.date.slice(0,7);
   if(!grouped.has(key))grouped.set(key,{date:key,deliverEmpty:0,pickupEmpty:0,deliverLoaded:0,pickupLoaded:0,truckEntries:0});
   var sum=grouped.get(key);fields.forEach(f=>{sum[f]+=row[f];});
  });
  return [...grouped.values()].sort((a,b)=>a.date.localeCompare(b.date));
 }
 function render(){
  var r=range(mode,anchor);
  if($('gateLivePeriod'))$('gateLivePeriod').textContent=r.label;
  if($('gateLiveMonth'))$('gateLiveMonth').value=anchor.slice(0,7);
  for(var kind of ['day','week','month','year']){
   $('gateLiveMode'+kind[0].toUpperCase()+kind.slice(1))?.setAttribute('aria-pressed',String(mode===kind));
  }
  var labels={day:['前一天','後一天'],week:['上一週','下一週'],month:['上一個月','下一個月'],year:['上一年','下一年']};
  $('gateLivePrev')?.setAttribute('aria-label',labels[mode][0]);
  $('gateLiveNext')?.setAttribute('aria-label',labels[mode][1]);
  var tbody=$('gateLiveRows');if(tbody)tbody.textContent='';
  if(!years(r).every(y=>cache.has(y))){
   showCards(null);
   if($('gateLiveDayCount'))$('gateLiveDayCount').textContent='等待正式資料';
   if($('gateLivePageLabel'))$('gateLivePageLabel').textContent='';
   return;
  }
  var rows=years(r).flatMap(y=>cache.get(y)).filter(v=>v.date>=r.start&&v.date<=r.end);
  var sums=rows.length?summarize(rows):null;showCards(sums);
  var view=detailRows(rows,mode),pages=Math.max(1,Math.ceil(view.length/8));
  page=Math.min(page,pages-1);
  view.slice(page*8,(page+1)*8).forEach(function(row){
   var tr=d.createElement('tr');
   var values=[mode==='year'?row.date.replace('-',' / '):row.date,
    row.deliverEmpty,row.pickupEmpty,row.deliverLoaded,row.pickupLoaded,total(row),row.truckEntries];
   ['期間','交空','領空','交重','領重','總櫃量','拖車車次'].forEach(function(label,i){
    var cell=d.createElement('td');
    cell.textContent=typeof values[i]==='number'?fmt(values[i]):values[i];
    cell.dataset.label=label;tr.appendChild(cell);
   });
   tbody.appendChild(tr);
  });
  if($('gateLiveDayCount'))$('gateLiveDayCount').textContent='已記錄 '+rows.length+' 天';
  if($('gateLiveDetailHeading'))$('gateLiveDetailHeading').textContent=mode==='year'?'每月明細':'每日明細';
  if($('gateLivePageLabel'))$('gateLivePageLabel').textContent='第 '+(page+1)+' / '+pages+' 頁';
  if($('gateLivePagePrev'))$('gateLivePagePrev').disabled=page===0;
  if($('gateLivePageNext'))$('gateLivePageNext').disabled=page>=pages-1;
  state(rows.length?'已同步正式 Google 資料庫':'所選期間尚無正式紀錄',rows.length?'success':'info');
 }
 async function load(force){
  var key=creds(),id=++requestId;
  if(key.stamp!==stamp){stamp=key.stamp;cache.clear();}
  if(force)cache.clear();
  render();
  if(!key.allowed||!key.token){state('請先以具有 Gate 查看權限的管理員帳號登入');return;}
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(key.url)){state('正式 Gate 資料服務尚未設定');return;}
  var missing=years(range(mode,anchor)).filter(y=>!cache.has(y));
  if(!missing.length){render();return;}
  state('正在讀取正式 Gate 每日資料…');
  try{
   await Promise.all(missing.map(async function(yr){
    var u=new URL(key.url);
    u.searchParams.set('action','gateStatsReadYear');u.searchParams.set('year',yr);
    u.searchParams.set('token',key.token);u.searchParams.set('gcToken',key.token);
    var response=await g.fetch(u.toString(),{cache:'no-store',redirect:'follow',credentials:'omit'});
    if(!response.ok)throw Error('HTTP '+response.status);
    var data=await response.json();
    if(data?.ok!==true||data?.source!=='port79-gate-daily'||String(data.year)!==yr||!Array.isArray(data.rows))
     throw Error(data?.error||'Gate 正式查詢接口尚未部署');
    if(id===requestId&&creds().stamp===key.stamp)cache.set(yr,cleanRows(data.rows,yr));
   }));
   if(id!==requestId||creds().stamp!==key.stamp)return;
   render();
  }catch(error){
   if(id!==requestId)return;
   showCards(null);
   state('讀取失敗：'+String(error?.message||error).slice(0,120),'error');
  }
 }
 function changeMode(next){
  if(!['day','week','month','year'].includes(next))return;
  if(next==='day'&&mode!=='day'&&cache.has(anchor.slice(0,4))){
   var candidates=cache.get(anchor.slice(0,4)).filter(row=>row.date.slice(0,7)===anchor.slice(0,7)&&row.date<=anchor);
   if(candidates.length)anchor=candidates[candidates.length-1].date;
  }
  mode=next;page=0;void load(false);
 }
 function move(amount){
  if(mode==='day')anchor=shift(anchor,amount);
  else if(mode==='week')anchor=shift(anchor,7*amount);
  else if(mode==='month'){
   var d=new Date(Date.UTC(Number(anchor.slice(0,4)),Number(anchor.slice(5,7))-1+amount,1));
   anchor=d.toISOString().slice(0,7)+'-01';
  }else anchor=String(Math.max(2000,Math.min(2099,Number(anchor.slice(0,4))+amount)))+'-01-01';
  page=0;void load(false);
 }
 function init(){
  if(ready||!$('gateLivePanel'))return;
  // The official management dashboard is now rendered above the collapsed importer.
  if(d.documentElement?.getAttribute?.('data-gate-embed')==='1')return;
  ready=true;anchor=today();
  Object.entries({Day:'day',Week:'week',Month:'month',Year:'year'}).forEach(([title,key])=>{
   $('gateLiveMode'+title)?.addEventListener('click',()=>changeMode(key));
  });
  $('gateLivePrev')?.addEventListener('click',()=>move(-1));
  $('gateLiveNext')?.addEventListener('click',()=>move(1));
  $('gateLivePagePrev')?.addEventListener('click',()=>{if(page>0){page--;render();}});
  $('gateLivePageNext')?.addEventListener('click',()=>{
   var current=range(mode,anchor),rows=years(current).flatMap(y=>cache.get(y)||[]).filter(v=>v.date>=current.start&&v.date<=current.end);
   if((page+1)*8<detailRows(rows,mode).length){page++;render();}
  });
  $('gateLiveMonth')?.addEventListener('change',function(){
   var value=String(this.value||'');
   if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value))return;
   anchor=value+'-01';mode='month';page=0;void load(false);
  });
  $('gateLiveRefresh')?.addEventListener('click',()=>void load(true));
  render();void load(false);
 }
 g.P79GateLive={range,cleanRows,detailRows,changeMode,move,refresh:function(importedDate){
  if(typeof importedDate==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(importedDate)){
   var parsed=new Date(importedDate+'T00:00:00Z');
   if(Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===importedDate){anchor=importedDate;mode='month';page=0;}
  }
  return load(true);
 }};
 if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);

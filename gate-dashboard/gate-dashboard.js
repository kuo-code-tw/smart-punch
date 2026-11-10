/* 79碼頭進出站櫃量管理｜正式 Gate 每日紀錄唯讀彙總。
 * 交空/交重＝進站；領空/領重＝出站。不得在正式環境顯示造假的範例數字。
 * GAS gateStatsReadYear 回傳 {ok:true,source:'port79-gate-daily',year:'2026',rows:[...]}。
 */
(function(g){
'use strict';
var doc=g.document;if(!doc)return;
var $=function(id){return doc.getElementById(id);};
var keys=['deliverEmpty','pickupEmpty','deliverLoaded','pickupLoaded','truckEntries'];
var cache=new Map(),anchor=today(),mode='day',version=0,stamp='';
var nf=new Intl.NumberFormat('zh-TW');
function fmt(n){return n===null||n===undefined?'—':nf.format(n);}
function show(id,value){var e=$(id);if(e)e.textContent=value;}
function textStatus(msg,kind){var el=$('status');if(el){el.textContent=msg;el.dataset.kind=kind||'info';}}
function today(){var parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());var value=function(type){return (parts.find(function(p){return p.type===type;})||{}).value||'';};return value('year')+'-'+value('month')+'-'+value('day');}
function validDate(s){if(!/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s))return false;var d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;}
function dateAdd(s,days){var dt=new Date(s+'T00:00:00Z');dt.setUTCDate(dt.getUTCDate()+days);return dt.toISOString().slice(0,10);}
function monthAdd(s,n){var y=Number(s.slice(0,4)),m=Number(s.slice(5,7))-1;var first=new Date(Date.UTC(y,m+n,1));var last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();first.setUTCDate(Math.min(Number(s.slice(8,10)),last));return first.toISOString().slice(0,10);}
function yearAdd(s,n){var y=Math.max(2000,Math.min(2099,Number(s.slice(0,4))+n));var m=s.slice(5,7),d=s.slice(8,10);return y+'-'+m+'-'+(m==='02'&&d==='29'&&!validDate(y+'-02-29')?'28':d);}
function moveAnchor(which,n){return which==='day'?dateAdd(anchor,n):which==='month'?monthAdd(anchor,n):yearAdd(anchor,n);}
function period(which,s){if(which==='day')return {start:s,end:s};if(which==='month'){var p=s.slice(0,7);var last=new Date(Date.UTC(Number(s.slice(0,4)),Number(s.slice(5,7)),0)).getUTCDate();return {start:p+'-01',end:p+'-'+String(last).padStart(2,'0')};}return {start:s.slice(0,4)+'-01-01',end:s.slice(0,4)+'-12-31'};}
function auth(){
 var s=null;try{s=JSON.parse(g.sessionStorage.getItem('port79_user_session')||'null');}catch(_){}
 var token=String(g.sessionStorage.getItem('port79_user_token')||g.sessionStorage.getItem('port79_admin_token')||'').trim();
 var role=String((s&& (s.adminRole||s.role))||'').toLowerCase();
 var allowed=!!s&&!s.punchOnly&&(role==='superadmin'||(role==='admin'&&String((s.systemPermissions||{}).history||'none')!=='none'&&((s.finePermissions||{}).history||{})['vessel.view']===true));
 var url=String(g.sessionStorage.getItem('port79_gas_url')||'').trim();
 return {token:token,allowed:allowed,url:url,stamp:token+'|'+String((s&&(s.empId||s.id))||'')};
}
function cleanRows(raw,year){
 if(!Array.isArray(raw))return [];
 var byDate=new Map();
 raw.forEach(function(r){if(!r||typeof r!=='object')return;var date=String(r.date||'').replace(/\//g,'-').trim();if(!validDate(date)||date.slice(0,4)!==year)return;
 var obj={date:date},valid=true;keys.forEach(function(k){var val=r[k],n=Number(val);if(val===null||val===undefined||String(val).trim()===''||!Number.isSafeInteger(n)||n<0)valid=false;obj[k]=n;});if(valid)byDate.set(date,obj);
 });
 return Array.from(byDate.values()).sort(function(a,b){return a.date.localeCompare(b.date);});
}
function getRows(p){var ys=[p.start.slice(0,4),p.end.slice(0,4)];if(ys.some(function(y){return !cache.has(y);})){return null;}return Array.from(new Set(ys)).flatMap(function(y){return cache.get(y)||[];}).filter(function(r){return r.date>=p.start&&r.date<=p.end;});}
function sum(p){var rows=getRows(p);if(!rows||rows.length===0)return null;var a={deliverEmpty:0,pickupEmpty:0,deliverLoaded:0,pickupLoaded:0,truckEntries:0};rows.forEach(function(r){keys.forEach(function(k){a[k]+=r[k];});});a.in=a.deliverEmpty+a.deliverLoaded;a.out=a.pickupEmpty+a.pickupLoaded;a.loaded=a.deliverLoaded+a.pickupLoaded;a.empty=a.deliverEmpty+a.pickupEmpty;a.total=a.in+a.out;a.net=a.in-a.out;a.days=rows.length;return a;}
function pct(a,b){return b>0?(100*a/b).toFixed(1)+'%':'0.0%';}
function setPeriod(){
 var labels={day:'本日',month:'本月',year:'本年'};show('headingTotal',labels[mode]+'總櫃量');show('tablePeriod',labels[mode]);
 ['Day','Month','Year'].forEach(function(key){var btn=$('mode'+key),on=key.toLowerCase()===mode;if(btn){btn.classList.toggle('selected',on);btn.setAttribute('aria-pressed',String(on));}});
 if($('periodDate'))$('periodDate').value=anchor;if($('topDate'))$('topDate').value=anchor;
}
function previousStat(){return sum(period(mode,moveAnchor(mode,-1)));}
function comparison(current,previous,label){
 if(!current||!previous)return {text:label+' —',kind:'neutral'};
 if(previous===0)return {text:label+(current===0?' 0.0%':' 新增'),kind:current?'up':'neutral'};
 var diff=100*(current-previous)/previous;
 return {text:label+' '+(diff>0?'▲ +':diff<0?'▼ ':'')+diff.toFixed(1)+'%',kind:diff<0?'down':diff>0?'up':'neutral'};
}
function comparisonNode(id,data){
 var el=$(id);if(!el)return;el.textContent=data.text;el.classList.toggle('down',data.kind==='down');el.classList.toggle('neutral',data.kind==='neutral');
}
function setMetric(a,prev){
 ['Total','In','Out','Loaded','Empty','Net'].forEach(function(key){var map={Total:'total',In:'in',Out:'out',Loaded:'loaded',Empty:'empty',Net:'net'};show('kpi'+key,a?fmt(a[map[key]]):'—');});
 var lbl=mode==='day'?'較前日':mode==='month'?'較前月':'較前年';
 comparisonNode('comparisonTotal',comparison(a&&a.total,prev&&prev.total,lbl));
 comparisonNode('comparisonIn',comparison(a&&a.in,prev&&prev.in,lbl));
 comparisonNode('comparisonOut',comparison(a&&a.out,prev&&prev.out,lbl));
 show('loadedRatio',a?'占比 '+pct(a.loaded,a.total):'占比 —');
 show('emptyRatio',a?'占比 '+pct(a.empty,a.total):'占比 —');
 var net=$('kpiNet');if(net){net.classList.toggle('down',!!a&&a.net<0);net.classList.toggle('positive',!!a&&a.net>=0);}
}
function setMainTable(a){
 var ids={tableTotal:'total',rowLoadedIn:'deliverLoaded',rowLoadedOut:'pickupLoaded',rowLoadedTotal:'loaded',rowEmptyIn:'deliverEmpty',rowEmptyOut:'pickupEmpty',rowEmptyTotal:'empty',rowTotalIn:'in',rowTotalOut:'out',rowTotalAll:'total'};
 Object.keys(ids).forEach(function(id){show(id,a?fmt(a[ids[id]]):'—');});
 show('rowLoadedPct',a?pct(a.loaded,a.total):'—');show('rowEmptyPct',a?pct(a.empty,a.total):'—');show('rowTotalPct',a?'100.0%':'—');
 show('donutTotal',a?fmt(a.total):'—');show('donutLoaded',a?fmt(a.loaded):'—');show('donutEmpty',a?fmt(a.empty):'—');show('donutLoadedPct',a?pct(a.loaded,a.total):'—');show('donutEmptyPct',a?pct(a.empty,a.total):'—');
 var donut=$('donut');if(donut)donut.style.background=a&&a.total>0?'conic-gradient(#1395f2 0% '+(100*a.loaded/a.total)+'%,#4ac849 '+(100*a.loaded/a.total)+'% 100%)':'#c7d8eb';
}
function trendGroups(){
 var result=[],d,i;
 if(mode==='day'){for(i=6;i>=0;i--){d=dateAdd(anchor,-i);result.push({range:period('day',d),label:d.slice(5).replace('-','/'),title:d});}}
 else if(mode==='month'){for(i=6;i>=0;i--){d=monthAdd(anchor,-i);result.push({range:period('month',d),label:d.slice(2,7).replace('-','/'),title:d.slice(0,7)});}}
 else{for(i=1;i<=12;i++){d=anchor.slice(0,4)+'-'+String(i).padStart(2,'0')+'-01';result.push({range:period('month',d),label:i+'月',title:d.slice(0,7)});}}
 return result;
}
function svgChild(root,tag,attrs,value){
 var el=doc.createElementNS('http://www.w3.org/2000/svg',tag);
 Object.keys(attrs||{}).forEach(function(k){el.setAttribute(k,String(attrs[k]));});
 if(value!==undefined)el.textContent=String(value);root.appendChild(el);return el;
}
function chart(){
 var groups=trendGroups(),values=groups.map(function(p){return sum(p.range);}),target=$('trendChart');if(!target)return;
 show('trendTitle','進出站櫃量趨勢（'+(mode==='day'?'近 7 日':mode==='month'?'近 7 月':'本年各月')+'）');
 target.replaceChildren();
 if(values.every(function(p){return p===null;})){target.textContent='所選期間尚無可繪製的正式櫃量資料';return;}
 var svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 740 245');svg.setAttribute('role','img');svg.setAttribute('aria-label','進站、出站及總櫃量折線長條趨勢圖');
 var left=44,right=722,top=22,base=204,plot=base-top;
 var topValue=Math.max(1,...values.filter(Boolean).map(function(v){return v.total;}));
 var axis=Math.ceil(topValue/1000)*1000;if(axis<topValue)axis+=1000;if(axis<5)axis=5;
 for(var j=0;j<=4;j++){var y=base-j*plot/4;svgChild(svg,'line',{x1:left,y1:y,x2:right,y2:y,stroke:'#d6e4f2','stroke-width':1});svgChild(svg,'text',{x:left-8,y:y+4,'text-anchor':'end','font-size':13,fill:'#43566f','font-weight':700},fmt(Math.round(axis*j/4)));}
 var step=(right-left)/groups.length,barWidth=Math.min(19,Math.max(7,step*.23));var path='',lastKnown=false;
 values.forEach(function(v,i){
  var x=left+step*(i+.5),textY=235;
  svgChild(svg,'text',{x:x,y:textY,'text-anchor':'middle','font-size':groups.length>8?11:14,fill:'#1c3358','font-weight':700},groups[i].label);
  if(!v){lastKnown=false;return;}
  [['in','#48c746',-barWidth-1],['out','#159bf4',1]].forEach(function(item){var h=Math.max(v[item[0]]>0?1:0,plot*v[item[0]]/axis),barX=x+item[2];svgChild(svg,'rect',{x:barX,y:base-h,width:barWidth,height:h,fill:item[1],rx:1});});
  var py=base-plot*v.total/axis;
  path+=(lastKnown?' L ':' M ')+x.toFixed(1)+' '+py.toFixed(1);lastKnown=true;
 });
 svgChild(svg,'path',{d:path,stroke:'#072e67','stroke-width':2.5,fill:'none','stroke-linecap':'round','stroke-linejoin':'round'});
 values.forEach(function(v,i){if(!v)return;var x=left+step*(i+.5),py=base-plot*v.total/axis;
  svgChild(svg,'circle',{cx:x,cy:py,r:4.5,fill:'#073770'});
  svgChild(svg,'text',{x:x,y:Math.max(12,py-11),'text-anchor':'middle','font-size':groups.length>8?10:13,fill:'#092e65','font-weight':800},fmt(v.total));
 });
 target.appendChild(svg);
}
function dailyTable(){
 var body=$('dailyRows');if(!body)return;body.replaceChildren();
 for(var i=0;i<5;i++){
  var date=dateAdd(anchor,-i),v=sum(period('day',date)),p=sum(period('day',dateAdd(date,-1))),tr=doc.createElement('tr');
  var values=[date,v?fmt(v.in):'—',v?fmt(v.out):'—',v?fmt(v.total):'—',comparison(v&&v.total,p&&p.total,'').text.trim()];
  values.forEach(function(item,col){var td=doc.createElement('td');td.textContent=item;if(col===4){var result=comparison(v&&v.total,p&&p.total,'');td.className=result.kind==='down'?'down':'number-positive';}tr.appendChild(td);});
  body.appendChild(tr);
 }
}
function overview(prefix,which){
 var a=sum(period(which,anchor));
 show('summary'+prefix,a?fmt(a.total):'—');
 ['In','Out','Loaded','Empty'].forEach(function(k){var name=k.toLowerCase();show(prefix.toLowerCase()+k,a?fmt(a[name]):'—');});
}
function summary(){
 show('overviewDate',anchor);show('overviewMonth',anchor.slice(0,7));show('overviewYear',anchor.slice(0,4));
 overview('Day','day');overview('Month','month');overview('Year','year');
}
function render(){
 setPeriod();
 var v=sum(period(mode,anchor)),prev=previousStat();
 setMetric(v,prev);setMainTable(v);chart();dailyTable();summary();
 var all=Array.from(cache.values()).flat(),latest=all.map(function(r){return r.date;}).sort().pop();
 show('freshness',latest?'↻ 最新紀錄：'+latest:'↻ 尚無正式資料');
}
function neededYears(){
 var periods=[period(mode,anchor),period(mode,moveAnchor(mode,-1)),period('day',anchor),period('month',anchor),period('year',anchor)];
 trendGroups().forEach(function(v){periods.push(v.range);});
 for(var i=0;i<6;i++)periods.push(period('day',dateAdd(anchor,-i)));
 var ys=new Set();periods.forEach(function(r){ys.add(r.start.slice(0,4));ys.add(r.end.slice(0,4));});
 return Array.from(ys).filter(function(y){return /^20\d{2}$/.test(y);});
}
async function load(force){
 var current=auth(),id=++version;
 if(current.stamp!==stamp){cache.clear();stamp=current.stamp;}
 if(force)cache.clear();
 render();
 if(!current.allowed||!current.token){textStatus('請從79碼頭管理首頁登入具有 Gate 統計查看權限的管理員帳號。','error');return;}
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(current.url)){textStatus('正式 Gate 雲端服務尚未設定，請先確認原系統的 GAS 連線。','error');return;}
 var missing=neededYears().filter(function(y){return !cache.has(y);});
 if(!missing.length){textStatus('已顯示正式 Gate 已記錄的資料；空白期間以「—」顯示。','success');return;}
 textStatus('正在讀取79碼頭正式 Gate 每日紀錄…','info');
 try{
  await Promise.all(missing.map(async function(year){
   var url=new URL(current.url);url.searchParams.set('action','gateStatsReadYear');url.searchParams.set('year',year);url.searchParams.set('token',current.token);url.searchParams.set('gcToken',current.token);url.searchParams.set('_',String(Date.now()));
   var response=await g.fetch(url.toString(),{method:'GET',cache:'no-store',redirect:'follow',credentials:'omit'});
   if(!response.ok)throw Error('正式資料服務 HTTP '+response.status);
   var data=await response.json();
   if(data?.ok!==true||data?.source!=='port79-gate-daily'||String(data.year)!==year||!Array.isArray(data.rows))
    throw Error(String(data&&data.error||'正式 Gate API 格式不符，或 gateStatsReadYear 尚未部署'));
   if(id===version&&auth().stamp===current.stamp)cache.set(year,cleanRows(data.rows,year));
  }));
  if(id!==version||auth().stamp!==current.stamp)return;
  render();textStatus('已同步正式 Gate 資料（'+missing.join('、')+' 年）；僅加總來源有紀錄的日期，不以示範資料補值。','success');
 }catch(error){if(id!==version)return;render();textStatus('正式資料讀取失敗：'+String(error&&error.message||error).slice(0,160),'error');}
}
function choose(which){if(['day','month','year'].indexOf(which)<0)return;mode=which;void load(false);}
function handleDate(v){if(!validDate(v))return;anchor=v;void load(false);}
function attach(){
 ['Day','Month','Year'].forEach(function(x){$('mode'+x)?.addEventListener('click',function(){choose(x.toLowerCase());});});
 ['periodDate','topDate'].forEach(function(x){$(x)?.addEventListener('change',function(){handleDate(this.value);});});
 $('previous')?.addEventListener('click',function(){anchor=moveAnchor(mode,-1);void load(false);});
 $('next')?.addEventListener('click',function(){anchor=moveAnchor(mode,1);void load(false);});
 $('refresh')?.addEventListener('click',function(){void load(true);});
 render();void load(false);
}
if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
})(window);
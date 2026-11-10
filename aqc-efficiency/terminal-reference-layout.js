/* Port 79 monthly terminal dashboard reference layout: derived metrics only, read-only. */
(function(root){
'use strict';
const node=id=>document.getElementById(id);
const fmt=n=>Number(n).toLocaleString('zh-TW',{maximumFractionDigits:2});
const num=n=>Number.isFinite(Number(n))&&n!==null&&n!==''?Math.max(0,Number(n)):0;
const isoDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))?String(d):'';
const metricCatalog=[
 {key:'ships',label:'本月船數',icon:'🚢',sub:'按完工月份／WORKING NO. 去重',tone:'navy'},
 {key:'disc',label:'卸船 DISC',icon:'▥',sub:'WORKING SHEET 原始卸船量',tone:'sky'},
 {key:'load',label:'裝船 LOAD',icon:'▥',sub:'WORKING SHEET 原始裝船量',tone:'sky'},
 {key:'bundle',label:'Bundle 扣除',icon:'▧',sub:'依正式 Bundle 欄位',tone:'purple'},
 {key:'billed',label:'作業量',icon:'🏗',sub:'船舶主檔正式作業量',tone:'sky'},
 {key:'moves',label:'總 Moves',icon:'▤',sub:'船舶主檔總作業次數',tone:'mint'},
 {key:'shift',label:'SHIFT',icon:'♧',sub:'船舶主檔 SHIFT 數量',tone:'sky'},
 {key:'hc',label:'H/C',icon:'▥',sub:'船舶主檔 H/C 數量',tone:'sky'}
];
function calculate(stats){
 const t=stats?.vesselTotals||{};
 const hasShips=Array.isArray(stats?.ships)&&stats.ships.length>0;
 const values={ships:num(t.ships),disc:num(t.disc),load:num(t.load),
  bundle:num(t.bundle),billed:num(t.billed),moves:num(t.moves),
  shift:num(t.shift),hc:num(t.hc)};
 const metrics=metricCatalog.map(info=>{
  let sub=info.sub;
  if(info.key==='bundle'&&t.bundleUnknown)sub+='｜'+fmt(t.bundleUnknown)+' 艘待核';
  if(info.key==='bundle'&&t.bundleMismatch)sub+='｜差額待核對';
  if(['disc','load','billed','moves'].includes(info.key)&&t.missing)sub+='｜'+fmt(t.missing)+' 艘欄位不完整';
  return {...info,value:hasShips?fmt(values[info.key]):'—',sub};
 });
 const days=(stats?.byDay||[]).filter(d=>isoDate(d.day))
  .map(d=>({day:isoDate(d.day),billed:num(d.billed),moves:num(d.moves)}))
  .sort((a,b)=>a.day.localeCompare(b.day));
 return {hasShips,metrics,days:days.slice(-7),disc:values.disc,load:values.load,
  ships:values.ships,month:stats?.month||'',hasDays:days.length>0};
}
function trendSVG(days){
 if(!days.length)return '<div class="p79-ref-no-data">所選月份沒有可顯示的每日完工資料</div>';
 const width=480,height=222,left=40,right=13,top=17,bottom=36;
 const iw=width-left-right,ih=height-top-bottom;
 const max=Math.max(1,...days.map(d=>Math.max(d.billed,d.moves)));
 const ceiling=Math.ceil(max/500)*500||1;
 const group=iw/days.length,bar=Math.min(33,group*.48);
 const y=v=>top+ih-(v/ceiling)*ih;
 const grid=Array.from({length:5},(_,i)=>{
  const val=ceiling*i/4,yy=y(val);
  return '<line x1="'+left+'" y1="'+yy.toFixed(2)+'" x2="'+(width-right)+'" y2="'+yy.toFixed(2)+'" stroke="#e3eaf5"/>'+
   '<text x="'+(left-7)+'" y="'+(yy+3.5).toFixed(2)+'" fill="#6a7b91" text-anchor="end" font-size="10">'+fmt(Math.round(val))+'</text>';
 }).join('');
 const bars=days.map((d,i)=>{
  const cx=left+(i+.5)*group,bh=ih*(d.billed/ceiling);
  return '<rect x="'+(cx-bar/2).toFixed(2)+'" y="'+(top+ih-bh).toFixed(2)+'" width="'+bar.toFixed(2)+'" height="'+Math.max(0,bh).toFixed(2)+'" rx="2" fill="#68b7f1"/>'+
   '<text x="'+cx.toFixed(2)+'" y="'+(height-15)+'" text-anchor="middle" font-size="11" fill="#425778">'+d.day.slice(5)+'</text>';
 }).join('');
 const pts=days.map((d,i)=>({x:left+(i+.5)*group,y:y(d.moves)}));
 const path=pts.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+','+p.y.toFixed(2)).join(' ');
 const dots=pts.map(p=>'<circle cx="'+p.x.toFixed(2)+'" cy="'+p.y.toFixed(2)+'" r="4" fill="#fff" stroke="#008c3f" stroke-width="2.5"/>').join('');
 return '<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="最近'+days.length+'個有完工紀錄的日期，藍色長條代表作業量，綠色折線代表總 Moves" xmlns="http://www.w3.org/2000/svg">'+grid+bars+
  '<path d="'+path+'" fill="none" stroke="#078d42" stroke-width="3" stroke-linejoin="round"/>'+dots+'</svg>';
}
function donutSVG(disc,load,has){
 if(!has)return '<div class="p79-ref-no-data">尚無完整卸／裝統計</div>';
 const total=disc+load;
 if(total<=0)return '<div class="p79-ref-no-data">當月卸／裝紀錄沒有可繪製的櫃數</div>';
 const ratio=disc/total,percent=ratio*100,other=100-percent;
 const radius=60,c=2*Math.PI*radius;
 return '<svg class="p79-ref-donut-svg" viewBox="0 0 180 180" role="img" aria-label="原始卸裝占比：卸船'+percent.toFixed(1)+'%，裝船'+other.toFixed(1)+'%" xmlns="http://www.w3.org/2000/svg">'+
  '<circle cx="90" cy="90" r="'+radius+'" stroke="#32cd53" stroke-width="24" fill="none"/>'+
  '<circle cx="90" cy="90" r="'+radius+'" stroke="#238ce5" stroke-width="24" fill="none" stroke-dasharray="'+(c*ratio).toFixed(3)+' '+c.toFixed(3)+'" transform="rotate(-90 90 90)"/>'+
  '<circle cx="90" cy="90" r="44" fill="#fff"/><text x="90" y="79" text-anchor="middle" font-size="11" fill="#38506f" font-weight="800">原始卸裝合計</text>'+
  '<text x="90" y="104" text-anchor="middle" font-size="19" fill="#12264c" font-weight="900">'+fmt(total)+'</text></svg>';
}
function render(stats,state){
 const mount=node('terminalReferenceKpis'),trends=node('terminalReferenceTrend');
 if(!mount||!trends)return;
 const d=calculate(stats);
 mount.innerHTML=d.metrics.map(m=>'<article class="p79-ref-metric '+m.tone+'">'+
  '<div class="p79-ref-metric-icon" aria-hidden="true">'+m.icon+'</div>'+
  '<div class="p79-ref-metric-body"><div class="p79-ref-metric-title">'+m.label+'</div>'+
  '<strong class="p79-ref-metric-value">'+m.value+'</strong>'+
  '<div class="p79-ref-metric-foot">'+m.sub+'</div></div></article>').join('');
 const legend='<div class="p79-ref-trend-legend"><span><i class="bar"></i>作業量</span><span><i class="line"></i>總 Moves</span></div>';
 trends.innerHTML='<div class="p79-ref-trend-chart">'+legend+trendSVG(d.days)+'</div>'+
  '<div class="p79-ref-mix"><div class="p79-ref-mix-plot">'+donutSVG(d.disc,d.load,d.hasShips)+'</div>'+
  '<div class="p79-ref-mix-legend"><div><span class="swatch disc"></span><span>卸船 DISC</span><b>'+ (d.hasShips?fmt(d.disc):'—') +'</b></div>'+
  '<div><span class="swatch load"></span><span>裝船 LOAD</span><b>'+ (d.hasShips?fmt(d.load):'—') +'</b></div></div></div>';
 const stamp=node('terminalReferenceUpdatedAt');
 if(stamp)stamp.textContent=state?.loadedMonth===d.month&&state?.loadedAt?
  '↻ 最後更新：'+new Date(state.loadedAt).toLocaleString('zh-TW',{hour12:false}):
  '↻ 本機快取／雲端更新時間未確認';
}
root.P79TerminalReference={render,calculate,trendSVG,donutSVG};
})(window);
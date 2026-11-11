/* 2026-11-11: daily distinct working AQC by physical unit, NOT concurrent peak or reported count. */
(function(g){
'use strict';
const ALLOWED={79:['7901','7902','7903','7905'],80:['8001','8002','8003','8005','8006']};
const PORT_OF=new Map(Object.entries(ALLOWED).flatMap(([port,units])=>units.map(unit=>[unit,port])));
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt=n=>Number(n||0).toLocaleString('zh-TW');
const taipeiDate=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
const dayMs=date=>Date.parse(date+'T00:00:00+08:00');
const dateOk=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&taipeiDate(dayMs(s))===s;
function unitOf(value){
 const cleaned=String(value??'').trim().toUpperCase().replace(/^(?:AQC|GC)\s*[.#:\-]?\s*/,'');
 return /^\d+$/.test(cleaned)?String(Number(cleaned)):'';
}
function calculate(raw,start,end){
 if(!dateOk(start)||!dateOk(end)||start>end)throw Error('請選擇正確的起訖日期');
 const first=dayMs(start),last=dayMs(end);if((last-first)/86400000>92)throw Error('單次最多查詢 93 天，避免畫面過大');
 const days=[],dayMap=new Map(),distinct={79:new Set(),80:new Set()};
 for(let time=first;time<=last;time+=86400000){const day=taipeiDate(time);const row={date:day,ports:{79:new Set(),80:new Set()},sources:new Set()};days.push(row);dayMap.set(day,row);}
 let intervalCount=0;
 for(const item of Array.isArray(raw)?raw:[]){
  const unit=unitOf(item?.unit),port=PORT_OF.get(unit);if(!port)continue;
  const begin=Number(item?.start),finish=Number(item?.end);
  if(!Number.isFinite(begin)||!Number.isFinite(finish)||finish<=begin)continue;
  if(finish<=first||begin>=last+86400000)continue;
  intervalCount++;
  const clippedStart=Math.max(first,begin),clippedEnd=Math.min(last+86400000,finish);
  const firstDay=dayMs(taipeiDate(clippedStart));
  // Intervals are half-open: an AQC finishing exactly at midnight does not count on the new date.
  for(let t=firstDay;t<clippedEnd;t+=86400000){
   const row=dayMap.get(taipeiDate(t));if(!row)continue;
   row.ports[port].add(unit);row.sources.add(String(item.source||'作業區間'));
   distinct[port].add(unit);
  }
 }
 return {days:days.map(d=>({date:d.date,p79:[...d.ports[79]].sort(),p80:[...d.ports[80]].sort(),n79:d.ports[79].size,n80:d.ports[80].size,total:d.ports[79].size+d.ports[80].size,sources:[...d.sources]})),
  distinct79:[...distinct[79]].sort(),distinct80:[...distinct[80]].sort(),activeDays:days.filter(d=>d.ports[79].size+d.ports[80].size>0).length,intervalCount};
}
function monthWindow(date){
 if(!dateOk(date))throw Error('無效的月份日期');
 const month=date.slice(0,7),[year,m]=month.split('-').map(Number);
 return {start:month+'-01',end:new Date(Date.UTC(year,m,0)).toISOString().slice(0,10)};
}
function windowDefault(){return monthWindow(taipeiDate(Date.now()));}
function chart(rows,port){
 const list=rows.slice(-31),w=640,h=280,l=38,r=13,t=24,b=44,iw=w-l-r,ih=h-t-b;
 if(!list.length)return '<div class="p79-daily-empty">沒有可繪製的日期</div>';
 const cap=port==='79'?4:port==='80'?5:9,max=cap;
 const unit=iw/list.length,bw=Math.max(3,Math.min(34,unit*.68));
 const y=n=>t+ih-ih*n/max;
 const grid=Array.from({length:max+1},(_,i)=>i).filter(n=>n===0||n===max||n%2===0).map(n=>'<line x1="'+l+'" y1="'+y(n)+'" x2="'+(w-r)+'" y2="'+y(n)+'" stroke="#e1eaf5"/><text x="'+(l-10)+'" y="'+(y(n)+4)+'" text-anchor="end" fill="#587491" font-size="11">'+n+'</text>').join('');
 const bars=list.map((d,i)=>{
  const x=l+unit*(i+.5)-bw/2,base=y(0),n79=port==='80'?0:d.n79,n80=port==='79'?0:d.n80;
  const h79=ih*n79/max,h80=ih*n80/max;
  const r79='<rect x="'+x+'" y="'+(base-h79)+'" width="'+bw+'" height="'+h79+'" rx="2" fill="#0756a5"/>';
  const r80='<rect x="'+x+'" y="'+(base-h79-h80)+'" width="'+bw+'" height="'+h80+'" rx="2" fill="#36b9f3"/>';
  const label=(list.length<=12||i%Math.ceil(list.length/10)===0)?'<text x="'+(x+bw/2)+'" y="'+(h-15)+'" text-anchor="middle" font-size="11" fill="#355679">'+esc(d.date.slice(5).replace('-','/'))+'</text>':'';
  return r79+r80+label;
 }).join('');
 const points=list.map((d,i)=>{const count=port==='79'?d.n79:port==='80'?d.n80:d.total;return [l+unit*(i+.5),y(count),count]}),line=points.map((p,i)=>(i?'L':'M')+p[0].toFixed(2)+','+p[1].toFixed(2)).join(' ');
 const curve='<path d="'+line+'" fill="none" stroke="#f2b800" stroke-width="3" stroke-linejoin="round"/>' + points.map(p=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="4" fill="#ffcc30" stroke="white" stroke-width="1.5"/>'+ (list.length<=12?'<text x="'+p[0]+'" y="'+Math.max(12,p[1]-11)+'" text-anchor="middle" fill="#0d3263" font-size="13" font-weight="800">'+p[2]+'</text>':'')).join('');
 return '<svg role="img" aria-label="每日使用 AQC 桿數趨勢" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMidYMid meet">'+grid+bars+curve+'</svg>';
}
function currentSource(){
 try{
  if(!g.P79AqcConcurrent?.index)return [];
  return g.P79AqcConcurrent.index(typeof records!=='undefined'&&Array.isArray(records)?records:[],typeof shipMasters!=='undefined'&&Array.isArray(shipMasters)?shipMasters:[]).raw||[];
 }catch(_){return []}
}
function canView(){return typeof g.requireEfficiencyAccess==='function'&&!!g.requireEfficiencyAccess()}
function canExport(){
 if(!canView())return false;
 let s=null;try{s=JSON.parse(sessionStorage.getItem('admin_session')||sessionStorage.getItem('port79_user_session')||'null')}catch(_){}
 return String(s?.adminRole||'').toLowerCase()==='superadmin'||s?.finePermissions?.efficiency?.['records.export']!==false;
}
let latest=null,fetching=false;
function monthsBetween(start,end){
 const out=[];if(!dateOk(start)||!dateOk(end)||start>end)return out;
 let y=Number(start.slice(0,4)),m=Number(start.slice(5,7));const stop=end.slice(0,7);
 while(y+'-'+String(m).padStart(2,'0')<=stop&&out.length<4){out.push(y+'-'+String(m).padStart(2,'0'));m++;if(m>12){m=1;y++;}}
 return out;
}
async function refreshRange(){
 if(fetching||!canView())return;
 const start=$('dailyAqcStart').value,end=$('dailyAqcEnd').value,button=$('dailyAqcSearch');
 try{calculate([],start,end);}catch(err){$('dailyAqcStatus').textContent=err.message;return;}
 if(typeof apiGetQuick!=='function'||typeof mergeEfficiencyCloudData!=='function'){
  $('dailyAqcStatus').textContent='本頁尚未提供正式雲端資料介面，先使用已載入的作業快取。';render();return;
 }
 fetching=true;button.disabled=true;
 const scope=sessionStorage.getItem('admin_session')||sessionStorage.getItem('port79_user_session')||'';
 const token=typeof gcToken!=='undefined'?String(gcToken):'';
 const current=()=>scope===(sessionStorage.getItem('admin_session')||sessionStorage.getItem('port79_user_session')||'')&&token===(typeof gcToken!=='undefined'?String(gcToken):'')&&start===$('dailyAqcStart').value&&end===$('dailyAqcEnd').value;
 let fetched=0,failures=[];
 try{
  for(const month of monthsBetween(start,end)){
   if(!current())throw Error('查詢期間或登入身分已變更，已停止載入');
   $('dailyAqcStatus').textContent='正在核對 '+month+' 正式雲端作業資料…';
   try{
    const result=await apiGetQuick('gcGetData',{month},25000);
    if(!current())throw Error('查詢期間或登入身分已變更，已停止載入');
    const valid=Array.isArray(result?.records)||Array.isArray(result?.shipMasters);
    if(valid){mergeEfficiencyCloudData(result);fetched++;}
    if(!valid||!(g.P79AqcConcurrent?.index(typeof records!=='undefined'?records:[],typeof shipMasters!=='undefined'?shipMasters:[])?.raw||[]).some(x=>x.start<dayMs(monthEnd(month))&&x.end>dayMs(month+'-01'))){
     const fallback=await apiGetQuick('historyGetMonthData',{type:'vessel',month},25000);
     if(!current())throw Error('查詢期間或登入身分已變更，已停止載入');
     if(Array.isArray(fallback?.records)||Array.isArray(fallback?.shipMasters)){mergeEfficiencyCloudData(fallback);fetched++;}
    }
   }catch(err){if(!current())throw err;failures.push(month+'：'+String(err?.message||err));}
  }
  if(current()){
   if(typeof saveLocal==='function')saveLocal();g.P79AqcConcurrent?.invalidate();
   if(typeof g.P79AqcMultiRod?.render==='function')g.P79AqcMultiRod.render();else render();
   $('dailyAqcStatus').textContent=failures.length?'部分月份核對失敗（'+failures.join('；')+'），仍顯示已載入來源，不可將空白當作停工。':'已核對選定期間的雲端來源，資料依實際 AQC 桿號去重。';
  }
 }catch(err){$('dailyAqcStatus').textContent=String(err?.message||err);}finally{fetching=false;button.disabled=false;}
}
function monthEnd(month){const [year,m]=month.split('-').map(Number);return new Date(Date.UTC(year,m,1)).toISOString().slice(0,10)}
function mount(){
 const root=$('view-multi-rod');if(!root||$('p79DailyActive'))return;
 const old=root.querySelector('.card');if(!old)return;
 const area=document.createElement('div');area.id='p79DailyActive';area.className='p79-daily';
 const defaults=windowDefault();
 area.innerHTML=`
 <div class="p79-daily-header"><div><span class="p79-daily-symbol">⚓</span><strong>AQC 多桿作業（每日作業桿數統計）</strong></div><span>▰ 碼頭營運統計</span></div>
 <div class="p79-daily-filters"><label>統計期間 <input type="date" id="dailyAqcStart" value="${defaults.start}"></label><span>～</span><label><input type="date" id="dailyAqcEnd" value="${defaults.end}" aria-label="結束日期"></label><label>碼頭<select id="dailyAqcPort"><option value="all">全部</option><option value="79">79 碼頭</option><option value="80">80 碼頭</option></select></label><button type="button" id="dailyAqcSearch">⌕ 查詢</button><button type="button" id="dailyAqcExport">匯出 CSV</button></div>
 <div id="dailyAqcStatus" class="p79-daily-status" role="status">等待作業紀錄載入…</div>
 <div class="p79-daily-kpis">
  <article class="p79-daily-kpi"><span class="p79-daily-ico">▣</span><div><div>有作業日期</div><b id="dailyAqcDays">—</b><small>天｜有確認來源時段</small></div></article>
  <article class="p79-daily-kpi"><span class="p79-daily-ico">▤</span><div><div>動到的桿數（全碼頭）</div><b id="dailyAqcTotal">—</b><small>支｜期間內不同 AQC 去重</small></div></article>
  <article class="p79-daily-kpi pale"><span class="p79-daily-bubble">79</span><div><div>79 碼頭動到桿數</div><b id="dailyAqc79">—</b><small>最多 4 支</small></div></article>
  <article class="p79-daily-kpi pale"><span class="p79-daily-bubble">80</span><div><div>80 碼頭動到桿數</div><b id="dailyAqc80">—</b><small>最多 5 支</small></div></article>
 </div>
 <div class="p79-daily-panels">
  <section class="p79-daily-panel"><h3>☷　每日作業桿數明細（有動到的桿數）</h3><div class="p79-daily-table-scroll"><table><thead><tr><th>日期</th><th>79 碼頭（桿數／桿號）</th><th>80 碼頭（桿數／桿號）</th><th>全碼頭合計</th></tr></thead><tbody id="dailyAqcRows"></tbody></table></div></section>
  <section class="p79-daily-panel"><h3>▥　每日動到桿數趨勢</h3><div class="p79-daily-legend"><span><i class="navy"></i>79 碼頭</span><span><i class="sky"></i>80 碼頭</span><span><i class="yellow"></i>合計</span></div><div class="p79-daily-chart" id="dailyAqcChart"></div></section>
 </div>
 <section class="p79-daily-panel p79-daily-roster"><h3>♜　期間內動到的桿號總覽（去重）</h3><div class="p79-daily-roster-row"><b>79 碼頭</b><span id="dailyAqc79Summary"></span><div id="dailyAqc79Units"></div></div><div class="p79-daily-roster-row"><b>80 碼頭</b><span id="dailyAqc80Summary"></span><div id="dailyAqc80Units"></div></div></section>
 <p class="p79-daily-note">統計口徑：每日依 WORKING SHEET／WORKING REPORT 有 AQC 編號及起訖時間的作業區間，按實體吊桿去重；同桿多班、多船只計一次。跨午夜作業計入實際涵蓋日期。人工只填「幾桿」而沒有 AQC 編號，不推定是哪一桿；未載入資料的日期不能視為確定停工。</p>`;
 root.insertBefore(area,old);
 const legacy=document.createElement('details');legacy.id='p79DailyLegacy';legacy.className='p79-daily-legacy';
 const summary=document.createElement('summary');summary.textContent='進階來源核對／原同時多桿作業及人工修正';legacy.appendChild(summary);
 root.insertBefore(legacy,old);legacy.appendChild(old);
 $('dailyAqcSearch').addEventListener('click',()=>{
  const end=$('dailyAqcEnd').value,oldDate=$('multiRodDate');
  if(dateOk(end)&&oldDate){oldDate.value=end;oldDate.dispatchEvent(new Event('change'));}
  render();void refreshRange();
 });
 $('dailyAqcStart').addEventListener('change',render);
 $('dailyAqcEnd').addEventListener('change',render);
 $('dailyAqcPort').addEventListener('change',render);
 $('dailyAqcExport').addEventListener('click',exportCsv);
}
function render(){
 mount();if(!$('p79DailyActive'))return;
 if(!canView()){$('dailyAqcStatus').textContent='目前帳號無權查看 AQC 作業資料';$('dailyAqcRows').innerHTML='';return;}
 const start=$('dailyAqcStart').value,end=$('dailyAqcEnd').value,port=$('dailyAqcPort').value;
 try{
  latest=calculate(currentSource(),start,end);
  const display=latest.days.map(row=>({...row,visible:port==='79'?row.n79:port==='80'?row.n80:row.total}));
  const distinct79=port==='80'?[]:latest.distinct79,distinct80=port==='79'?[]:latest.distinct80;
  $('dailyAqcDays').textContent=fmt(display.filter(row=>row.visible>0).length);
  $('dailyAqcTotal').textContent=fmt(distinct79.length+distinct80.length);
  $('dailyAqc79').textContent=port==='80'?'—':fmt(distinct79.length);
  $('dailyAqc80').textContent=port==='79'?'—':fmt(distinct80.length);
  const zero=row=>row?'': '<span class="p79-daily-unverified">— 尚無可驗證紀錄</span>';
  $('dailyAqcRows').innerHTML=display.map(row=>'<tr><td>'+esc(row.date)+'</td><td>'+(port==='80'?'—':row.n79?'<b>'+row.n79+' 桿</b><small>（'+esc(row.p79.join('、'))+'）</small>':zero(false))+'</td><td>'+(port==='79'?'—':row.n80?'<b>'+row.n80+' 桿</b><small>（'+esc(row.p80.join('、'))+'）</small>':zero(false))+'</td><td class="total">'+(row.visible?row.visible+' 桿':'—')+'</td></tr>').join('');
  $('dailyAqcChart').innerHTML=chart(latest.days,port);
  for(const p of ['79','80']){
   const arr=p==='79'?distinct79:distinct80;
   $('dailyAqc'+p+'Summary').textContent=arr.length+' 支';
   $('dailyAqc'+p+'Units').innerHTML=arr.length?arr.map(n=>'<span class="p79-daily-unit">'+esc(n)+'</span>').join(''):'<span class="p79-daily-unverified">目前沒有足夠來源確認桿號</span>';
  }
  $('dailyAqcStatus').textContent='資料口徑：有明確桿號與作業時間的來源區間；已辨識 '+fmt(latest.intervalCount)+' 段。無紀錄的日期顯示「—」，不推定為 0 支。';
  $('dailyAqcStatus').className='p79-daily-status';
 }catch(err){latest=null;$('dailyAqcStatus').textContent=err.message;$('dailyAqcStatus').className='p79-daily-status error';}
}
function exportCsv(){
 if(!canExport()){$('dailyAqcStatus').textContent='目前帳號沒有匯出權限';return;}
 if(!latest){render();if(!latest)return;}
 const port=$('dailyAqcPort').value;
 const values=[['日期','79碼頭動用桿數','79碼頭AQC桿號','80碼頭動用桿數','80碼頭AQC桿號','全碼頭合計（當日去重）'],...latest.days.map(d=>[d.date,port==='80'?'':d.n79||'',port==='80'?'':d.p79.join('、'),port==='79'?'':d.n80||'',port==='79'?'':d.p80.join('、'),(port==='79'?d.n79:port==='80'?d.n80:d.total)||''])];
 const csv='\uFEFF'+values.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AQC每日動用桿數_'+$('dailyAqcStart').value+'_'+$('dailyAqcEnd').value+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
g.P79AqcDaily={calculate,unitOf,monthWindow,mount,render};
})(window);
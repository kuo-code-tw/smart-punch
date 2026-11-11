/* Personnel statistics reference dashboard. Data comes solely from the existing canonical WORKING REPORT renderer. */
(function(){
  'use strict';
  const fmt=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0});
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const put=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=String(value)};
  const h=v=>n(v).toFixed(1);
  const f=v=>n(v).toFixed(2);
  const kpis=[['p79prPeople','作業人數'],['p79prCount','作業筆數'],['p79prHours','總作業時數'],['p79prDisc','卸櫃 DISC'],['p79prLoad','裝櫃 LOAD'],['p79prHC','H/C'],['p79prContainers','作業櫃數'],['p79prEff','整體效率']];
  function rank(list){
    const sorted=[...list].sort((a,b)=>{
      const x=n(a.hours)>0?Number(n(a.eff).toFixed(2)):-Infinity;
      const y=n(b.hours)>0?Number(n(b.eff).toFixed(2)):-Infinity;
      return y-x||String(a.name||'').localeCompare(String(b.name||''),'zh-Hant');
    });
    let rankValue=0,last=null;
    return sorted.map((p,i)=>{
      const score=n(p.hours)>0?Number(n(p.eff).toFixed(2)):null;
      if(score===null)return {...p,refRank:null};
      if(score!==last)rankValue=i+1;
      last=score;return {...p,refRank:rankValue};
    });
  }
  function renderGroups(persons,groupCode){
    const host=document.getElementById('p79prGroups');if(!host)return;
    const groups=['A','B','C','D'];
    // Keep each group's independent scroll position when filters or live data re-render.
    const scrollPositions=new Map(Array.from(host.querySelectorAll('.p79pr-group-scroll')).map(el=>[el.dataset.group,el.scrollTop]));
    host.innerHTML=groups.map((g,idx)=>{
      const list=rank(persons.filter(p=>groupCode(p.group)===g));
      const total=list.reduce((a,p)=>{a.hours+=n(p.hours);a.containers+=n(p.containers);a.hc+=n(p.hc);return a},{hours:0,containers:0,hc:0});
      const eff=total.hours>0?(total.containers+total.hc)/total.hours:null;
      // Display every matching employee, not only the top three; keep ranking order.
      return '<section class="p79pr-group" aria-label="'+g+' 組">'+
        '<header class="p79pr-group-head"><b>♟ '+g+' 組</b><span>'+list.length+' 人</span></header>'+
        '<div class="p79pr-gstats"><div><div class="num">'+fmt.format(total.containers)+'</div><div class="lbl">櫃數</div></div>'+
        '<div><div class="num">'+h(total.hours)+'</div><div class="lbl">時數</div></div>'+
        '<div><div class="num">'+fmt.format(total.hc)+'</div><div class="lbl">H/C</div></div></div>'+
        '<div class="p79pr-eff"><span>組別平均效率</span><strong>'+(eff===null?'—':f(eff))+'</strong></div>'+
        '<div class="p79pr-group-scroll" data-group="'+g+'" role="region" tabindex="0" aria-label="'+g+' 組完整人員名單，可使用滑鼠滾輪上下捲動">'+
        '<table><thead><tr><th>姓名</th><th>櫃數</th><th>時數</th><th>效率</th></tr></thead><tbody>'+
        (list.length?list.map(p=>'<tr><td title="'+safe(p.name)+'">'+safe(p.name)+'</td><td>'+fmt.format(p.containers)+'</td><td>'+h(p.hours)+'</td><td>'+(n(p.hours)>0?f(p.eff):'—')+'</td></tr>').join(''):'<tr><td colspan="4">此條件沒有作業人員資料</td></tr>')+
        '</tbody></table></div><div class="p79pr-scroll-hint">↕ 往下捲動查看全部 '+list.length+' 人</div></section>';
    }).join('');
    host.querySelectorAll('.p79pr-group-scroll').forEach(el=>{el.scrollTop=scrollPositions.get(el.dataset.group)||0;});
    const extra=persons.filter(p=>!groupCode(p.group));
    const warning=document.getElementById('p79prGroupWarning');
    if(warning){warning.hidden=!extra.length;warning.textContent=extra.length?'組別待核對：'+extra.length+' 人尚未能對應正式 A／B／C／D 排班組別，仍納入上方總數與作業明細。':'';}
  }
  function renderTrend(rows,metric){
    const host=document.getElementById('p79prDailyChart');if(!host)return;
    const days=new Map();
    rows.forEach(r=>{const day=String(r.workDate||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;
      const v=metric(r);if(!days.has(day))days.set(day,{day,containers:0,hc:0,hours:0});
      const d=days.get(day);d.containers+=n(v.containers);d.hc+=n(v.hc);d.hours+=n(v.hours);
    });
    const sorted=[...days.values()].sort((a,b)=>a.day.localeCompare(b.day));
    const data=sorted.slice(-12).map(x=>({...x,eff:x.hours>0?(x.containers+x.hc)/x.hours:0}));
    if(!data.length){host.innerHTML='<div class="p79pr-chart" style="text-align:center;color:#8aa0b7;padding:70px 12px">此日期區間尚無 WORKING REPORT 作業資料</div>';return;}
    const W=520,H=205,L=37,R=12,T=19,B=28,w=W-L-R,h=H-T-B;
    const maxC=Math.max(1,...data.map(d=>d.containers)),maxE=Math.max(1,...data.map(d=>d.eff)),step=w/data.length,barW=Math.min(27,step*.55);
    let svg='<svg viewBox="0 0 '+W+' '+H+'" aria-label="每日櫃數與人員效率趨勢" role="img">';
    for(let j=0;j<=4;j++){const yy=T+h*j/4;svg+='<line x1="'+L+'" y1="'+yy+'" x2="'+(W-R)+'" y2="'+yy+'" stroke="#e5edf7"/><text x="'+(L-6)+'" y="'+(yy+3)+'" fill="#8496ae" font-size="10" text-anchor="end">'+fmt.format(Math.round(maxC*(1-j/4)))+'</text>';}
    const points=[];
    data.forEach((d,i)=>{const x=L+(i+.5)*step,barH=d.containers/maxC*h;const y=T+h-d.eff/maxE*h;
      svg+='<rect x="'+(x-barW/2).toFixed(1)+'" y="'+(T+h-barH).toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+Math.max(0,barH).toFixed(1)+'" rx="3" fill="#86bceb"><title>'+safe(d.day)+'：'+d.containers+' 櫃</title></rect>';
      svg+='<text x="'+x.toFixed(1)+'" y="'+(H-8)+'" fill="#72859c" text-anchor="middle" font-size="'+(data.length>9?9:10)+'">'+safe(d.day.slice(5).replace('-','/'))+'</text>';
      points.push({x,y,eff:d.eff,day:d.day});
    });
    svg+='<polyline points="'+points.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ')+'" fill="none" stroke="#13a36d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
    points.forEach(p=>{svg+='<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3.3" fill="#12a16a" stroke="#fff" stroke-width="1.2"><title>'+safe(p.day)+'：效率 '+f(p.eff)+'</title></circle>';});
    host.innerHTML='<div class="p79pr-legend"><span><i></i>作業櫃數</span><span><i class="line"></i>效率（含 H/C）</span></div><div class="p79pr-chart">'+svg+'</svg></div>';
  }
  function renderCompare(persons,groupCode){
    const host=document.getElementById('p79prCompareChart');if(!host)return;
    const groups=['A','B','C','D'].map(g=>{const list=persons.filter(p=>groupCode(p.group)===g),hours=list.reduce((v,p)=>v+n(p.hours),0),containers=list.reduce((v,p)=>v+n(p.containers),0),hc=list.reduce((v,p)=>v+n(p.hc),0);return {g,hours,eff:hours>0?(containers+hc)/hours:null};});
    const max=Math.max(1,...groups.map(x=>x.eff||0));
    const colors=['#368bd7','#26ad9a','#9161bf','#e6a14b'];
    let svg='<svg viewBox="0 0 350 220" role="img" aria-label="A 至 D 組別加權效率比較">';
    for(let i=0;i<=4;i++){const yy=190-i*38;svg+='<line x1="34" x2="332" y1="'+yy+'" y2="'+yy+'" stroke="#e9eff6"/><text x="30" y="'+(yy+3)+'" font-size="10" fill="#7f91a9" text-anchor="end">'+f(max*i/4)+'</text>';}
    groups.forEach((d,i)=>{const bh=(d.eff||0)/max*138,x=65+i*76,y=190-bh;svg+='<rect x="'+x+'" y="'+y.toFixed(1)+'" width="39" height="'+bh.toFixed(1)+'" rx="4" fill="'+colors[i]+'"/><text x="'+(x+19.5)+'" y="'+(y-7).toFixed(1)+'" font-size="12" font-weight="800" text-anchor="middle" fill="#215478">'+(d.eff===null?'—':f(d.eff))+'</text><text x="'+(x+19.5)+'" y="209" text-anchor="middle" font-size="12" fill="#536d89">'+d.g+' 組</text>';});
    host.innerHTML='<div class="p79pr-chart">'+svg+'</svg></div>';
  }
  function renderRanking(persons,groupCode){
    const body=document.getElementById('p79prRankBody');if(!body)return;
    const list=rank(persons).filter(p=>p.refRank!==null&&p.refRank<=5);
    body.innerHTML=list.length?list.map(p=>'<tr><td><span class="p79pr-rank '+(p.refRank===1?'gold':'')+'">'+p.refRank+'</span></td><td>'+safe(p.name)+'</td><td>'+safe(groupCode(p.group)||'待核')+'</td><td>'+fmt.format(p.containers)+'</td><td>'+f(p.eff)+'</td></tr>').join(''):'<tr><td colspan="5">沒有具有效時數的排名資料</td></tr>';
  }
  function render({rows,persons,metrics,groupCode}={}){
    if(!document.getElementById('p79prGroups'))return;
    const rs=Array.isArray(rows)?rows:[],ps=Array.isArray(persons)?persons:[],metric=typeof metrics==='function'?metrics:()=>({}),code=typeof groupCode==='function'?groupCode:()=>''; 
    const total=rs.reduce((a,r)=>{const m=metric(r);a.hours+=n(m.hours);a.disc+=n(m.disc);a.load+=n(m.load);a.hc+=n(m.hc);return a;},{hours:0,disc:0,load:0,hc:0});
    const containers=total.disc+total.load,eff=total.hours>0?(containers+total.hc)/total.hours:null;
    put('p79prPeople',fmt.format(ps.length));
    put('p79prCount',fmt.format(rs.length));
    put('p79prHours',h(total.hours));
    put('p79prDisc',fmt.format(total.disc));
    put('p79prLoad',fmt.format(total.load));
    put('p79prHC',fmt.format(total.hc));
    put('p79prContainers',fmt.format(containers));
    put('p79prEff',eff===null?'—':f(eff));
    renderGroups(ps,code);renderTrend(rs,metric);renderCompare(ps,code);renderRanking(ps,code);
    const now=document.getElementById('p79prFreshness');
    if(now)now.textContent=rs.length?'依目前已載入的 WORKING REPORT 正式資料計算':'尚未載入符合條件的 WORKING REPORT 明細';
  }
  window.P79PersonnelReference={render};
  window.addEventListener('load',function(){
    if(document.querySelector('#view-weekly:not(.hidden)') && typeof window.renderWeeklyEfficiency==='function')
      window.renderWeeklyEfficiency();
  });
})();


(function(global){
'use strict';
const WEEK=['日','一','二','三','四','五','六'];
const instances=[];

function pad(n){return String(n).padStart(2,'0')}
function iso(y,m,d){return `${y}-${pad(m)}-${pad(d)}`}
function parseIso(v){
  const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return null;
  return {y:+m[1],m:+m[2],d:+m[3],iso:m[0]};
}
function todayIso(){
  const d=new Date();
  return iso(d.getFullYear(),d.getMonth()+1,d.getDate());
}
function monthOf(v){
  const p=parseIso(v);
  const d=p?new Date(p.y,p.m-1,1):new Date();
  return {y:d.getFullYear(),m:d.getMonth()+1};
}
function fmt(v){return String(v||'').replaceAll('-','/')}
function daysInMonth(y,m){return new Date(y,m,0).getDate()}
function cmp(a,b){return String(a||'').localeCompare(String(b||''))}
function emit(el){
  if(!el)return;
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
}
function closeOthers(keep){
  instances.forEach(x=>{if(x!==keep&&x.close)x.close()});
}
function replaceHost(host){
  if(!host)return null;
  if(host.tagName==='DETAILS'){
    const div=document.createElement('div');
    div.id=host.id;
    div.className='p79-ucr-host';
    host.replaceWith(div);
    return div;
  }
  host.classList.add('p79-ucr-host');
  host.innerHTML='';
  return host;
}
function hideField(input){
  const box=input?.closest?.('.field');
  if(box){box.classList.add('p79-ucr-field-hidden');return box}
  input?.classList?.add('p79-ucr-native-hidden');
  return input?.parentElement||null;
}
function compatNode(id,span=false){
  if(!id)return null;
  const el=document.createElement('div');
  el.id=id;el.className='p79-ucr-compat';
  if(span)el.innerHTML='<span></span>';
  return el;
}

function mountRange(opts){
  const start=document.getElementById(opts.startId);
  const end=document.getElementById(opts.endId);
  if(!start||!end||start.dataset.p79CalendarMounted==='1')return null;
  start.dataset.p79CalendarMounted='1';
  end.dataset.p79CalendarMounted='1';

  let host=null;
  if(opts.hostId){
    host=replaceHost(document.getElementById(opts.hostId));
  }else{
    host=document.createElement('div');
    host.className='p79-ucr-host p79-ucr-inline-field';
    const firstBox=start.closest?.('.field')||start.parentElement;
    if(firstBox?.parentElement)firstBox.parentElement.insertBefore(host,firstBox);
    if(opts.hideFieldParents!==false){
      hideField(start);hideField(end);
    }else{
      start.classList.add('p79-ucr-native-hidden');
      end.classList.add('p79-ucr-native-hidden');
    }
  }
  if(!host)return null;

  if(opts.label){
    const lab=document.createElement('label');
    lab.className='p79-ucr-field-label';
    lab.textContent=opts.label;
    host.appendChild(lab);
  }

  start.classList.add('p79-ucr-native-hidden');
  end.classList.add('p79-ucr-native-hidden');
  host.appendChild(start);
  host.appendChild(end);

  const trigger=document.createElement('button');
  trigger.type='button';trigger.className='p79-ucr-trigger';
  trigger.innerHTML='<span class="p79-ucr-trigger-text"></span><span class="p79-ucr-trigger-icon">📅</span>';
  host.appendChild(trigger);

  if(opts.compatSummaryId){
    host.appendChild(compatNode(opts.compatSummaryId,opts.compatSummaryHasSpan===true));
  }

  const pop=document.createElement('div');
  pop.className='p79-ucr-pop';pop.hidden=true;
  pop.innerHTML=`
    <div class="p79-ucr-head">
      <button type="button" class="p79-ucr-navbtn p79-prev" aria-label="上一個月">‹</button>
      <div class="p79-ucr-month"></div>
      <button type="button" class="p79-ucr-navbtn p79-next" aria-label="下一個月">›</button>
    </div>
    <div class="p79-ucr-hint">第一次點開始日期，第二次點結束日期</div>
    <div class="p79-ucr-week">${WEEK.map(x=>`<span>${x}</span>`).join('')}</div>
    <div class="p79-ucr-grid"></div>
    <div class="p79-ucr-actions">
      <button type="button" class="p79-ucr-action p79-clear">${opts.allowClear===false?'重新選擇':'清除'}</button>
      <button type="button" class="p79-ucr-action primary p79-today">今天</button>
    </div>`;
  host.appendChild(pop);

  let view=monthOf(start.value||end.value||todayIso());
  let phase='start';

  function values(){
    return {a:start.value||'',b:end.value||''};
  }
  function syncTrigger(){
    const {a,b}=values();
    const txt=trigger.querySelector('.p79-ucr-trigger-text');
    txt.textContent=!a&&!b?(opts.emptyText||'全部日期'):a&&b?`${fmt(a)} ～ ${fmt(b)}`:fmt(a||b);
  }
  function setBoth(a,b,fire=true){
    start.value=a||'';
    end.value=b||'';
    syncTrigger();
    render();
    if(fire){emit(start);emit(end)}
    if(typeof opts.onChange==='function')try{opts.onChange(a,b)}catch(e){}
  }
  function render(){
    pop.querySelector('.p79-ucr-month').textContent=`${view.y} 年 ${view.m} 月`;
    const grid=pop.querySelector('.p79-ucr-grid');
    grid.innerHTML='';
    const first=new Date(view.y,view.m-1,1).getDay();
    const total=daysInMonth(view.y,view.m);
    const {a,b}=values();
    const lo=a&&b?(cmp(a,b)<=0?a:b):(a||b);
    const hi=a&&b?(cmp(a,b)<=0?b:a):(a||b);
    for(let i=0;i<first;i++){
      const x=document.createElement('button');x.type='button';x.className='p79-ucr-day p79-empty';grid.appendChild(x);
    }
    for(let d=1;d<=total;d++){
      const val=iso(view.y,view.m,d);
      const btn=document.createElement('button');
      btn.type='button';btn.className='p79-ucr-day';btn.textContent=String(d);btn.dataset.date=val;
      if(val===todayIso())btn.classList.add('p79-today');
      if(lo&&hi&&val>=lo&&val<=hi)btn.classList.add('p79-range');
      if(a&&val===a)btn.classList.add('p79-start');
      if(b&&val===b)btn.classList.add('p79-end');
      if(a&&b&&a===b&&val===a)btn.classList.add('p79-single');
      btn.addEventListener('click',()=>{
        if(phase==='start'){
          setBoth(val,val,true);
          phase='end';
          pop.querySelector('.p79-ucr-hint').textContent='再點一次選擇結束日期';
        }else{
          const cur=start.value||val;
          const aa=cmp(val,cur)<0?val:cur;
          const bb=cmp(val,cur)<0?cur:val;
          setBoth(aa,bb,true);
          phase='start';
          pop.querySelector('.p79-ucr-hint').textContent='第一次點開始日期，第二次點結束日期';
          setTimeout(()=>close(),120);
        }
      });
      grid.appendChild(btn);
    }
  }
  function open(){
    closeOthers(api);
    const basis=start.value||end.value||todayIso();
    view=monthOf(basis);phase='start';
    syncTrigger();render();pop.hidden=false;
  }
  function close(){pop.hidden=true}
  trigger.addEventListener('click',()=>pop.hidden?open():close());
  pop.querySelector('.p79-prev').addEventListener('click',()=>{view.m--;if(view.m<1){view.m=12;view.y--}render()});
  pop.querySelector('.p79-next').addEventListener('click',()=>{view.m++;if(view.m>12){view.m=1;view.y++}render()});
  pop.querySelector('.p79-today').addEventListener('click',()=>{const d=todayIso();setBoth(d,d,true);close()});
  pop.querySelector('.p79-clear').addEventListener('click',()=>{
    if(opts.allowClear===false){
      phase='start';
      pop.querySelector('.p79-ucr-hint').textContent='請重新選擇開始日期';
      return;
    }
    setBoth('','',true);phase='start';close();
  });
  start.addEventListener('change',syncTrigger);end.addEventListener('change',syncTrigger);
  document.addEventListener('pointerdown',e=>{if(!host.contains(e.target))close()},{capture:true});
  const api={close,sync:syncTrigger,open};
  instances.push(api);syncTrigger();
  return api;
}

function installMonthJump(pop,getView,render){
  const heading=pop.querySelector('.p79-ucr-month');
  heading.style.cssText='display:flex;justify-content:center;align-items:center;gap:6px;min-width:0';
  const year=document.createElement('select'),month=document.createElement('select');
  year.className='p79-ucr-year-select';year.setAttribute('aria-label','直接選擇年份');
  month.className='p79-ucr-month-select';month.setAttribute('aria-label','直接選擇月份');
  [year,month].forEach(el=>el.style.cssText='width:auto;min-width:0;max-width:100%;padding:6px 3px;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;background:var(--panel,#fff);color:inherit');
  month.innerHTML=Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1} 月</option>`).join('');
  heading.replaceChildren(year,month);
  function sync(){const view=getView(),current=new Date().getFullYear(),first=Math.min(1900,view.y),last=Math.max(current+10,view.y);if(year.dataset.range!==first+':'+last){year.innerHTML=Array.from({length:last-first+1},(_,i)=>{const y=first+i;return `<option value="${y}">${y>=1912?'民國 '+(y-1911)+'（'+y+'）':'西元 '+y}</option>`}).join('');year.dataset.range=first+':'+last;}year.value=String(view.y);month.value=String(view.m);}
  year.onchange=()=>{getView().y=Number(year.value);render();};month.onchange=()=>{getView().m=Number(month.value);render();};
  return sync;
}

function mountSingle(opts){
  const input=document.getElementById(opts.inputId);
  if(!input||input.dataset.p79CalendarMounted==='1')return null;
  input.dataset.p79CalendarMounted='1';
  const host=document.createElement('div');
  host.className='p79-ucr-host';
  input.parentElement?.insertBefore(host,input.nextSibling);
  input.classList.add('p79-ucr-native-hidden');

  const trigger=document.createElement('button');
  trigger.type='button';trigger.className='p79-ucr-trigger';
  trigger.innerHTML='<span class="p79-ucr-trigger-text"></span><span class="p79-ucr-trigger-icon">📅</span>';
  host.appendChild(trigger);
  const pop=document.createElement('div');pop.className='p79-ucr-pop';pop.hidden=true;
  pop.innerHTML=`
    <div class="p79-ucr-head"><button type="button" class="p79-ucr-navbtn p79-prev">‹</button><div class="p79-ucr-month"></div><button type="button" class="p79-ucr-navbtn p79-next">›</button></div>
    <div class="p79-ucr-hint">點選日期</div><div class="p79-ucr-week">${WEEK.map(x=>`<span>${x}</span>`).join('')}</div><div class="p79-ucr-grid"></div>
    <div class="p79-ucr-actions"><span></span><button type="button" class="p79-ucr-action primary p79-today">今天</button></div>`;
  host.appendChild(pop);
  let view=monthOf(input.value||todayIso());

  function sync(){trigger.querySelector('.p79-ucr-trigger-text').textContent=input.value?fmt(input.value):(opts.emptyText||'選擇日期')}
  const syncMonthJump=installMonthJump(pop,()=>view,render);
  function render(){
    syncMonthJump();
    const grid=pop.querySelector('.p79-ucr-grid');grid.innerHTML='';
    const first=new Date(view.y,view.m-1,1).getDay(),total=daysInMonth(view.y,view.m);
    for(let i=0;i<first;i++){const x=document.createElement('button');x.type='button';x.className='p79-ucr-day p79-empty';grid.appendChild(x)}
    for(let d=1;d<=total;d++){
      const val=iso(view.y,view.m,d),b=document.createElement('button');b.type='button';b.className='p79-ucr-day';b.textContent=d;
      if(val===todayIso())b.classList.add('p79-today');
      if(val===input.value)b.classList.add('p79-start','p79-single');
      b.onclick=()=>{input.value=val;sync();emit(input);close()};grid.appendChild(b);
    }
  }
  function open(){closeOthers(api);sync();view=monthOf(input.value||todayIso());render();pop.hidden=false}
  function close(){pop.hidden=true}
  trigger.onclick=()=>pop.hidden?open():close();
  pop.querySelector('.p79-prev').onclick=()=>{view.m--;if(view.m<1){view.m=12;view.y--}render()};
  pop.querySelector('.p79-next').onclick=()=>{view.m++;if(view.m>12){view.m=1;view.y++}render()};
  pop.querySelector('.p79-today').onclick=()=>{input.value=todayIso();sync();emit(input);close()};
  input.addEventListener('change',sync);
  document.addEventListener('pointerdown',e=>{if(!host.contains(e.target))close()},{capture:true});
  const api={close,sync,open};instances.push(api);sync();return api;
}

function mountMonth(opts){
  const input=document.getElementById(opts.inputId);
  if(!input||input.dataset.p79MonthMounted==='1')return null;
  input.dataset.p79MonthMounted='1';
  input.classList.add('p79-ucr-native-hidden');
  const nav=document.createElement('div');nav.className='p79-umnav';
  nav.innerHTML='<button type="button" class="p79-mprev">‹</button><div class="p79-umnav-label"></div><button type="button" class="p79-mnext">›</button>';
  input.parentElement?.insertBefore(nav,input.nextSibling);
  function parseMonth(v){
    const m=String(v||'').match(/^(\d{4})-(\d{2})$/);
    if(m)return {y:+m[1],m:+m[2]};
    const d=new Date();return {y:d.getFullYear(),m:d.getMonth()+1};
  }
  function sync(){const x=parseMonth(input.value);nav.querySelector('.p79-umnav-label').textContent=`${x.y} 年 ${x.m} 月`}
  function shift(n){
    let x=parseMonth(input.value);x.m+=n;
    while(x.m<1){x.m+=12;x.y--}while(x.m>12){x.m-=12;x.y++}
    input.value=`${x.y}-${pad(x.m)}`;sync();emit(input);
    if(opts.autoClickId){setTimeout(()=>document.getElementById(opts.autoClickId)?.click(),0)}
  }
  nav.querySelector('.p79-mprev').onclick=()=>shift(-1);
  nav.querySelector('.p79-mnext').onclick=()=>shift(1);
  input.addEventListener('change',sync);sync();return {sync};
}

global.Port79CalendarRange={mountRange,mountSingle,mountMonth,syncAll:()=>instances.forEach(api=>api.sync?.())};
})(window);


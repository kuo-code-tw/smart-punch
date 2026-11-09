/* PORT79 Terminal Operations prototype v1 — read-only. */
(function(root){
'use strict';
const fmt=n=>Number(n||0).toLocaleString('zh-TW');
const decimal=n=>Number(n||0).toLocaleString('zh-TW',{minimumFractionDigits:0,maximumFractionDigits:2});
const safe=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function measure(...candidates){
  for(const raw of candidates){
    if(raw===null||raw===undefined||String(raw).trim()==='')continue;
    const n=Number(String(raw).replace(/,/g,''));
    if(Number.isFinite(n)&&n>=0)return n;
  }
  return null;
}
function monthOfShip(s,month){
  if(typeof shipMasterDateMatchesMonth==='function')return shipMasterDateMatchesMonth(s,month);
  return [s._cloudLastDate,s.lastDate,s.compareMonth,s.firstDate].some(d=>String(d||'').startsWith(month));
}
function makeUniqueShips(ships,month){
  const out=new Map();
  for(const s of ships||[]){
    if(!s||!monthOfShip(s,month))continue;
    const no=String(s.workingNo||s.sourceWorkingNo||'').trim();
    const key=no||[s.vessel,s.voyageI,s.voyageE,s.lastDate].join('|');
    const ws=s.workingSheetSource||{};
    const score=Number(!!s.wharf)+Number(!!s.lastDate)+Number(measure(ws.disc,s.importAudit?.disc,s.disc)!==null)+Number(measure(ws.load,s.importAudit?.load,s.load)!==null)+Number(measure(s.totalMoves)!==null);
    if(!out.has(key)||score>out.get(key).score)out.set(key,{ship:s,score});
  }
  return [...out.values()].map(x=>x.ship);
}
function makeUniqueRecords(rows,month){
  const raw=(rows||[]).filter(r=>r&&String(r.workDate||'').slice(0,7)===month);
  const explicit=raw.filter(r=>['working-report','gc-driver-efficiency'].includes(String(r.source||'')));
  const preferred=new Set(explicit.filter(r=>r.source==='working-report').map(r=>String(r.workingNo||'').trim()).filter(Boolean));
  const considered=explicit.filter(r=>r.source!=='gc-driver-efficiency'||!preferred.has(String(r.workingNo||'').trim()));
  const out=new Map();
  for(const r of considered){
    const no=String(r.workingNo||'').trim();
    if(!no)continue;
    const key=String(r.id||'').trim()||[no,r.workDate,r.number||r.gcNo,r.name,r.startTime,r.endTime].map(x=>String(x||'').trim()).join('|');
    const score=Number(measure(r.disc)!==null)+Number(measure(r.load)!==null)+Number(measure(r.timeHours)!==null)+[1,2,3].filter(i=>measure(r['stopTime'+i])>0).length;
    if(!out.has(key)||score>out.get(key).score)out.set(key,{row:r,score});
  }
  return [...out.values()].map(x=>x.row);
}
function shiftOf(t){
  const m=String(t||'').trim().match(/^(\d{1,2}):([0-5]\d)/);
  if(!m)return '時間未提供';
  const hh=Number(m[1]),mm=Number(m[2]);
  if(hh>23||mm>59)return '時間未提供';
  return hh<8?'24–08':hh<16?'08–16':'16–24';
}
function timeHours(r){
  const fromValue=measure(r.timeHours);
  if(fromValue!==null&&fromValue>0)return fromValue;
  const parse=t=>{const m=String(t||'').match(/^(\d{1,2}):([0-5]\d)/);return m?Number(m[1])*60+Number(m[2]):null};
  const a=parse(r.startTime),b=parse(r.endTime);
  if(a===null||b===null)return null;
  const span=b<a?b+1440-a:b-a;
  const deducted=[r.deduct1,r.deduct2,r.deduct3,r.deduct4].reduce((sum,v)=>sum+(measure(v)||0),0);
  return Math.max(0,(span-deducted)/60);
}
function spansShiftBoundary(r){
  const parse=t=>{const m=String(t||'').match(/^(\d{1,2}):([0-5]\d)/);return m?Number(m[1])*60+Number(m[2]):null};
  const start=parse(r.startTime),end=parse(r.endTime);
  if(start===null||end===null)return false;
  const finish=end<start?end+1440:end;
  for(const b of [480,960,1440,1920])if(start<b&&finish>b)return true;
  return false;
}
function stopDuration(value){
 if(value===null||value===undefined||String(value).trim()==='')return null;
 const m=String(value).trim().match(/^(\d{1,2}):([0-5]\d)$/);
 if(m)return Number(m[1])*60+Number(m[2]);
 return measure(value);
}
function build(month,ships,rows){
  const masters=makeUniqueShips(ships,month);
  const byWharf=new Map(),byDay=new Map(),byShift=new Map(),byStop=new Map();
  const wharfByNo=new Map();
  const vesselTotals={ships:0,disc:0,load:0,billed:0,moves:0,shift:0,hc:0,missing:0,undated:0};
  const work=(map,key,init)=>{if(!map.has(key))map.set(key,init());return map.get(key)};
  for(const s of masters){
    const ws=s.workingSheetSource||{};
    const no=String(s.workingNo||s.sourceWorkingNo||'').trim();
    const wharf=String(s.wharf||'').trim().toUpperCase()||'未指定碼頭';
    if(no)wharfByNo.set(no,wharf);
    const disc=measure(ws.disc,s.importAudit?.disc,s.disc),load=measure(ws.load,s.importAudit?.load,s.load);
    const bill=measure(s.totalContainers,ws.totalContainers),moves=measure(s.totalMoves,ws.totalMoves);
    const shift=measure(s.shiftMoves,ws.shiftMoves),hc=measure(s.hatches,ws.hatches);
    if(disc===null||load===null||bill===null||moves===null)vesselTotals.missing++;
    const add=(target)=>{target.ships++;target.disc+=(disc||0);target.load+=(load||0);target.billed+=(bill||0);target.moves+=(moves||0);target.shift+=(shift||0);target.hc+=(hc||0);};
    add(vesselTotals);
    const berth=work(byWharf,wharf,()=>({wharf,ships:0,disc:0,load:0,billed:0,moves:0,shift:0,hc:0}));
    add(berth);
    const dates=[s._cloudLastDate,s.lastDate,s.workingSheetSource?.compareDate,s.compareDate,s.firstDate].map(v=>String(v||'').slice(0,10));
    const day=dates.find(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&v.startsWith(month));
    if(day)add(work(byDay,day,()=>({day,ships:0,disc:0,load:0,billed:0,moves:0,shift:0,hc:0})));
    else vesselTotals.undated++;
  }
  const records=makeUniqueRecords(rows,month);
  let crossShift=0,missingTime=0,unmatchedWharf=0,stoppedRows=0;
  let totalStopMinutes=0,totalStopEvents=0;
  for(const r of records){
    const no=String(r.workingNo||'').trim();
    const wharf=String(r.wharf||'').trim().toUpperCase()||wharfByNo.get(no)||'未指定碼頭';
    if(wharf==='未指定碼頭')unmatchedWharf++;
    const day=String(r.workDate||'').slice(0,10);
    const shift=shiftOf(r.startTime);
    const h=timeHours(r);
    if(shift==='時間未提供')missingTime++;
    if(spansShiftBoundary(r))crossShift++;
    const key=day+'|'+shift;
    const item=work(byShift,key,()=>({day,shift,records:0,disc:0,load:0,hc:0,hours:0}));
    item.records++;item.disc+=measure(r.disc)||0;item.load+=measure(r.load)||0;item.hc+=measure(r.hatches)||0;
    if(h!==null)item.hours+=h;
    let hadStop=false;
    for(let i=1;i<=3;i++){
      const mins=stopDuration(r['stopTime'+i]);
      if(mins===null||mins<=0)continue;
      const label=String(r['stopItem'+i]||'').trim()||'原因未填';
      const reason=work(byStop,label,()=>({reason:label,events:0,minutes:0,wharfs:new Set(),aqcs:new Set()}));
      reason.events++;reason.minutes+=mins;reason.wharfs.add(wharf);
      if(r.number||r.gcNo)reason.aqcs.add(String(r.number||r.gcNo).trim());
      hadStop=true;totalStopMinutes+=mins;totalStopEvents++;
    }
    if(hadStop)stoppedRows++;
  }
  return {
    month,ships:masters,records,
    vesselTotals,byWharf:[...byWharf.values()].sort((a,b)=>b.moves-a.moves||a.wharf.localeCompare(b.wharf)),
    byDay:[...byDay.values()].sort((a,b)=>a.day.localeCompare(b.day)),
    byShift:[...byShift.values()].sort((a,b)=>a.day.localeCompare(b.day)||['24–08','08–16','16–24','時間未提供'].indexOf(a.shift)-['24–08','08–16','16–24','時間未提供'].indexOf(b.shift)),
    byStop:[...byStop.values()].map(s=>({...s,wharfs:[...s.wharfs].sort(),aqcs:s.aqcs.size})).sort((a,b)=>b.minutes-a.minutes||a.reason.localeCompare(b.reason,'zh-Hant')),
    crossShift,missingTime,unmatchedWharf,stoppedRows,totalStopMinutes,totalStopEvents
  };
}
const state={loadedMonth:'',loadedAt:0,ships:[],records:[],mode:'local',message:'',error:'',requestSeq:0,inFlight:''};
function el(id){return document.getElementById(id)}
function options(){
 const select=el('terminalMonth');
 if(!select)return '';
 const year=String(getPort79Year());
 if(select.dataset?.p79Year!==year||!/^\d{4}-\d{2}$/.test(String(select.value||''))){
   const now=new Date();
   const previous=String(select.value||'');
   const mm=String(now.getMonth()+1).padStart(2,'0');
   const chosen=previous.startsWith(year+'-')?previous:(year===String(now.getFullYear())?year+'-'+mm:year+'-12');
   select.innerHTML=Array.from({length:12},(_,i)=>{
     const n=12-i,m=String(n).padStart(2,'0');
     return '<option value="'+year+'-'+m+'">'+year+' 年 '+n+' 月</option>';
   }).join('');
   select.value=chosen;
   if(select.dataset)select.dataset.p79Year=year;
 }
 return String(select.value||'');
}
function localSources(month){
 return {
  ships:(typeof shipMasters!=='undefined'?shipMasters:[]).filter(s=>monthOfShip(s,month)),
  records:(typeof records!=='undefined'?records:[]).filter(r=>String(r?.workDate||'').startsWith(month))
 };
}
function currentSources(month){
 if(state.loadedMonth===month)return{ships:state.ships,records:state.records};
 return localSources(month);
}
function rowMessage(count,text){return '<tr><td colspan="'+count+'" class="p79-terminal-empty">'+text+'</td></tr>'}
function render(){
 const rootNode=el('terminalDashboardRoot');if(!rootNode)return;
 const month=options(),src=currentSources(month),stats=build(month,src.ships,src.records);
 const total=stats.vesselTotals,hasShips=stats.ships.length>0;
 const htmlMetric=(label,value,sub,tone)=>'<div class="p79-terminal-kpi '+tone+'"><div class="kpi-label">'+label+'</div><div class="kpi-value">'+value+'</div><div class="kpi-sub">'+sub+'</div></div>';
 const kpi=el('terminalKpi');
 if(kpi)kpi.innerHTML=[
  htmlMetric('本月完工船舶',hasShips?fmt(total.ships):'—','依船舶完成月份計','tone-blue'),
  htmlMetric('本月卸船櫃數',hasShips?fmt(total.disc):'—','WORKING SHEET 原始 DISC','tone-cyan'),
  htmlMetric('本月裝船櫃數',hasShips?fmt(total.load):'—','WORKING SHEET 原始 LOAD','tone-orange'),
  htmlMetric('本月總 Moves',hasShips?fmt(total.moves):'—','船舶主檔總作業量','tone-green'),
  htmlMetric('AQC 作業明細',stats.records.length?fmt(stats.records.length):'—','按作業日期統計','tone-purple'),
  htmlMetric('停工填報',stats.totalStopEvents?fmt(stats.totalStopMinutes)+' 分':'—',stats.totalStopEvents?fmt(stats.totalStopEvents)+' 筆停工事件':'目前無有效停工填報','tone-rose')
 ].join('');
 const wharfBody=el('terminalWharfBody');
 if(wharfBody)wharfBody.innerHTML=stats.byWharf.length?stats.byWharf.map(s=>
  '<tr><td class="p79-terminal-wharf">'+safe(s.wharf)+'</td><td>'+fmt(s.ships)+'</td><td>'+fmt(s.disc)+'</td><td>'+fmt(s.load)+'</td><td>'+fmt(s.billed)+'</td><td class="em">'+fmt(s.moves)+'</td><td>'+fmt(s.shift)+'</td><td>'+fmt(s.hc)+'</td></tr>').join(''):rowMessage(8,'本月沒有可統計的完工船舶');
 const dayBody=el('terminalDayBody');
 if(dayBody)dayBody.innerHTML=stats.byDay.length?stats.byDay.map(s=>
  '<tr><td>'+safe(s.day)+'</td><td>'+fmt(s.ships)+'</td><td>'+fmt(s.disc)+'</td><td>'+fmt(s.load)+'</td><td>'+fmt(s.billed)+'</td><td class="em">'+fmt(s.moves)+'</td></tr>').join(''):rowMessage(6,'目前無可歸入本月完工日期的船舶資料');
 const shiftBody=el('terminalShiftBody');
 if(shiftBody)shiftBody.innerHTML=stats.byShift.length?stats.byShift.map(s=>
  '<tr><td>'+safe(s.day)+'</td><td><span class="p79-terminal-shift">'+safe(s.shift)+'</span></td><td>'+fmt(s.records)+'</td><td>'+fmt(s.disc)+'</td><td>'+fmt(s.load)+'</td><td>'+fmt(s.hc)+'</td><td>'+decimal(s.hours)+'</td></tr>').join(''):rowMessage(7,'尚未取得當月 AQC／WORKING REPORT 作業明細');
 const stopBody=el('terminalStopBody');
 if(stopBody)stopBody.innerHTML=stats.byStop.length?stats.byStop.map(s=>
  '<tr><td>'+safe(s.reason)+'</td><td>'+fmt(s.events)+'</td><td class="em">'+decimal(s.minutes)+'</td><td>'+safe(s.wharfs.join('、'))+'</td><td>'+fmt(s.aqcs)+'</td></tr>').join(''):rowMessage(5,stats.records.length?'目前沒有有效的停工項目與停工時間填報，不能據此判定零停工':'尚未取得作業明細，無法統計停工原因');
 const status=el('terminalDataStatus');
 if(status){
  const cloudForMonth=state.loadedMonth===month,kind=state.inFlight===month?'loading':cloudForMonth?state.mode:'local';
  status.dataset.state=kind;
  status.textContent=kind==='loading'?'⏳ 正在讀取 '+month+' 的雲端船舶及作業資料…':
    kind==='cloud'?'✓ 本月雲端資料已讀取｜船舶 '+fmt(stats.ships.length)+' 艘／明細 '+fmt(stats.records.length)+' 筆':
    kind==='mixed'?'⚠ 雲端船舶已讀取，作業明細'+(stats.records.length?'以當月本機快取補足':'尚未取得')+'（請核對）':
    '⚠ 僅顯示當月本機快取'+(state.error?'｜'+state.error:'');
 }
 const warnings=el('terminalWarnings');
 if(warnings){
  const list=[];
  if(total.missing)list.push('有 '+fmt(total.missing)+' 艘船缺少部分數值，相關加總可能不完整');
  if(total.undated)list.push('有 '+fmt(total.undated)+' 艘船缺少可辨識的當月完工日期，未列入每日表');
  if(!stats.records.length)list.push('班別與停工分析尚無 AQC 明細；船舶月統計不受影響');
  if(stats.crossShift)list.push('有 '+fmt(stats.crossShift)+' 筆明細跨越班別邊界，整筆櫃數暫歸開始班別，不代表逐櫃精確分攤');
  if(stats.missingTime)list.push('有 '+fmt(stats.missingTime)+' 筆明細沒有可辨識的開始時間');
  if(stats.unmatchedWharf)list.push('有 '+fmt(stats.unmatchedWharf)+' 筆作業明細找不到碼頭對應');
  if(stats.records.length&&!stats.totalStopEvents)list.push('沒有有效的停工填報，不等同於確定沒有停工');
  warnings.innerHTML=list.map(s=>'<div>• '+safe(s)+'</div>').join('');
 }
 const label=el('terminalMonthCaption');
 if(label)label.textContent=month.replace('-',' 年 ')+' 月';
}
async function load(force=false){
 const month=options();
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return false;
 if(state.inFlight===month)return false;
 if(!force&&state.loadedMonth===month&&Date.now()-state.loadedAt<180000){render();return true;}
 const ticket=++state.requestSeq;
 state.inFlight=month;state.error='';render();
 try{
  const reply=await apiGetQuick('gcGetData',{month},GC_FULL_READ_TIMEOUT_MS);
  if(!reply?.ok||!Array.isArray(reply.shipMasters))throw Error(reply?.error||'當月雲端船舶資料格式不完整');
  if(ticket!==state.requestSeq||month!==options())return false;
  const local=localSources(month);
  const localByNo=new Map(local.ships.map(s=>[String(s.workingNo||'').trim(),s]));
  const fetchedShips=reply.shipMasters.filter(s=>monthOfShip(s,month)).map(s=>{
   const prior=localByNo.get(String(s.workingNo||'').trim());
   if(!prior)return s;
   return {...prior,...s,workingSheetSource:{...(prior.workingSheetSource||{}),...(s.workingSheetSource||{})}};
  });
  const fetchedRecords=(Array.isArray(reply.records)?reply.records:[]).filter(r=>String(r?.workDate||'').startsWith(month));
  state.ships=fetchedShips.length?fetchedShips:local.ships;
  state.records=fetchedRecords.length?fetchedRecords:local.records;
  state.mode=fetchedShips.length&&fetchedRecords.length?'cloud':
             fetchedShips.length?'mixed':'local';
  state.message='';state.loadedMonth=month;state.loadedAt=Date.now();
  if(!fetchedShips.length&&local.ships.length)state.error='雲端沒有回傳當月船舶，顯示本機快取';
  if(!fetchedRecords.length&&local.records.length)state.error='雲端沒有回傳當月作業明細，顯示本機快取';
  return true;
 }catch(error){
  if(ticket!==state.requestSeq)return false;
  state.error=String(error?.message||error||'讀取未完成');
  state.mode='local';
  state.loadedMonth='';
  console.warn('碼頭統計當月雲端讀取未完成，保留本機資料',month,error);
  return false;
 }finally{
  if(ticket===state.requestSeq){state.inFlight='';render();}
 }
}
root.P79TerminalOps={render,load,build,options,shiftOf,makeUniqueRecords,makeUniqueShips};
})(window);

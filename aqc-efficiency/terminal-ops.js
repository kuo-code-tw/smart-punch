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
    const score=Number(!!s.wharf)+Number(!!s.lastDate)+Number(measure(ws.disc,s.importAudit?.disc,s.disc)!==null)+Number(measure(ws.load,s.importAudit?.load,s.load)!==null)+Number(measure(s.totalMoves)!==null)+0.1*Number(measure(ws.bundleDeduct,s.bundleDeduct)!==null)+0.1*Number((Array.isArray(s.bundleInfo)?s.bundleInfo:ws.bundleInfo||[]).length>0);
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
  return hh<8?'晚班':hh<16?'早班':'中班';
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

const STOP_CATEGORIES=[
  {label:'設備故障',tone:'tone-rose',icon:'🛠️'},
  {label:'系統異常',tone:'tone-purple',icon:'💻'},
  {label:'鎖具問題',tone:'tone-orange',icon:'🔗'},
  {label:'等待作業',tone:'tone-blue',icon:'⏳'},
  {label:'天候因素',tone:'tone-cyan',icon:'🌧️'},
  {label:'其他異常',tone:'tone-green',icon:'⚠️'},
  {label:'原因未填',tone:'tone-gray',icon:'❔'}
];
const STOP_INTERVAL=/((?:[01]?\d|2[0-3]):?[0-5]\d)\s*(?:-|－|–|—|~|～|至|到)\s*((?:[01]?\d|2[0-3]):?[0-5]\d)/;
function remarkCategory(raw){
  const s=String(raw||'').trim();
  if(!s)return '';
  if(/(?:系統故障|系統異常|系統更新|CMS|當機|程式異常|電腦故障|資料系統)/i.test(s))return '系統異常';
  if(/(?:鎖具|卡鐳|撿鐳|鎖頭|鎖銷|twist.?lock|lock.?pin)/i.test(s))return '鎖具問題';
  if(/(?:天候|天氣|颱風|大雨|強風|風速|雷雨|濃霧)/i.test(s))return '天候因素';
  if(/(?:等待|待機|待料|等.{0,18}(?:車|作業|吊|AQC|退車|靠泊|指示)|等AQC|等\d{4}退車|移車等待)/i.test(s))return '等待作業';
  if(/(?:AQC故障|機故|設備故障|機械故障|故障|跳電|吊架下降失速|失速|查修|維修|保養廠|吊具異常|吊具損壞|電力中斷)/i.test(s))return '設備故障';
  // H/C, OOG, 單吊、Bundle 是正常作業說明，不代表停工。
  if(/(?:^|[\s\d])(?:H\/?C|OOG)\s*\*\s*\d+/i.test(s)||/(?:單吊|艙蓋|畸零地|BN\/\d+FR)/i.test(s))return '';
  if(/(?:停工|中斷|異常|延誤|作業問題(?!#\d+$)|壅塞)/i.test(s))return '其他異常';
  return '';
}
function clockMinutes(raw){
  const s=String(raw||'').replace(':','');
  if(s.length<3||s.length>4||!/^\d+$/.test(s))return null;
  const hour=Number(s.slice(0,-2)),minute=Number(s.slice(-2));
  return hour<=23&&minute<=59?hour*60+minute:null;
}
function intervalInRemark(raw){
  const m=String(raw||'').match(STOP_INTERVAL);
  if(!m)return null;
  const from=clockMinutes(m[1]),to=clockMinutes(m[2]);
  if(from===null||to===null)return null;
  let minutes=to-from;
  if(minutes<=0)minutes+=1440;
  // Very long intervals are ambiguous in free-text Remark; review rather than inflate time.
  if(minutes>720)return {start:m[1],end:m[2],minutes:null};
  return {start:m[1],end:m[2],minutes};
}
function remarkSegments(row){
  const source=[row.note,row.remark,row.Remark,row.REMARK,
    row.stopRemark1,row.stopRemark2,row.stopRemark3,row.stopRemark,
    row.stopReason,row.stopNote];
  const unique=new Set();
  for(const text of source){
    for(const segment of String(text||'').split(/[｜|；;\n\r]+/)){
      const s=segment.trim().replace(/\s+/g,' ');
      if(s)unique.add(s);
    }
  }
  return [...unique];
}
function stopEventsForRecord(r){
  const notes=remarkSegments(r),parsed=[];
  for(const segment of notes){
    const category=remarkCategory(segment);
    if(!category)continue;
    const interval=intervalInRemark(segment);
    parsed.push({category,reason:segment,minutes:interval?.minutes??null,
      start:interval?.start||'',end:interval?.end||'',source:'Remark'});
  }
  const timedCategories=new Set(parsed.filter(e=>e.start&&e.end).map(e=>e.category));
  const events=parsed.filter(e=>e.start||!timedCategories.has(e.category));
  for(let i=1;i<=3;i++){
    const label=String(r['stopItem'+i]||'').trim();
    const detail=String(r['stopRemark'+i]||'').trim();
    const minutes=stopDuration(r['stopTime'+i]);
    if(minutes===null||minutes<=0)continue;
    const category=remarkCategory(label+' '+detail)||'原因未填';
    const matched=events.some(e=>e.category===category&&e.minutes!==null&&Math.abs(e.minutes-minutes)<1);
    if(!matched)events.push({category,reason:label||detail||'原因未填',minutes,
      start:'',end:'',source:'停工填報'});
  }
  return events;
}

function shipBundleMetrics(ship){
 const ws=ship.workingSheetSource||{};
 const master=measure(ship.bundleDeduct),sheet=measure(ws.bundleDeduct),audit=measure(ship.importAudit?.bundleDeduct);
 const hasManual=!!(ship.manualOverrides&&Object.prototype.hasOwnProperty.call(ship.manualOverrides,'bundleDeduct'));
 const direct=hasManual?master:(master===0&&sheet!==null&&sheet>0?sheet:measure(master,sheet,audit));
 const bn=measure(ship.bundleBn,ws.bundleBn),fl=measure(ship.bundleFl,ws.bundleFl);
 const detail=Array.isArray(ship.bundleInfo)?ship.bundleInfo:Array.isArray(ws.bundleInfo)?ws.bundleInfo:[];
 const fromDetail=detail.reduce((sum,x)=>sum+Math.max(0,(measure(x.fl,x.FL)||0)-(measure(x.bn,x.BN)||0)),0);
 const calculated=bn!==null&&fl!==null?Math.max(0,fl-bn):detail.length?fromDetail:null;
 const bundle=hasManual?direct:(direct!==null&&direct>0?direct:(calculated!==null&&calculated>0?calculated:direct??calculated));
 return {bundle,bn,fl,declared:bundle!==null};
}
const REASON_OVERRIDE_KEY='p79_terminal_reason_overrides_v1';
let cachedReasonOverrides=null;
function reasonOverrides(){
 if(cachedReasonOverrides!==null)return cachedReasonOverrides;
 cachedReasonOverrides={};
 try{
  if(typeof localStorage==='undefined')return cachedReasonOverrides;
  const obj=JSON.parse(localStorage.getItem(REASON_OVERRIDE_KEY)||'{}');
  if(obj&&typeof obj==='object'&&!Array.isArray(obj))
   for(const [key,value] of Object.entries(obj))if(STOP_CATEGORIES.some(c=>c.label===value))cachedReasonOverrides[key]=value;
 }catch(err){console.warn('手動異常分類讀取失敗，保留自動分類',err)}
 return cachedReasonOverrides;
}
function eventManualCategory(key){return reasonOverrides()[key]||''}
function setReasonCategory(encodedKey,category){
 let key='';
 try{key=decodeURIComponent(String(encodedKey||''))}catch(e){return false}
 if(!key||!(category===''||STOP_CATEGORIES.some(c=>c.label===category)))return false;
 const map=reasonOverrides();
 if(category)map[key]=category;
 else delete map[key];
 let saved=true;
 try{
  if(typeof localStorage==='undefined')saved=false;
  else localStorage.setItem(REASON_OVERRIDE_KEY,JSON.stringify(map));
 }catch(error){saved=false;console.warn('手動原因分類無法保存在此瀏覽器',error)}
 state.categorySaveWarning=saved?'':'⚠ 此瀏覽器無法保存手動分類，重新登入或換裝置可能恢復自動判讀';
 render();
 return saved;
}

function buildStopSummary(records,wharfByNo,masters){
  const vesselByNo=new Map(masters.map(s=>[String(s.workingNo||s.sourceWorkingNo||'').trim(),String(s.vessel||'').trim()]));
  const byStop=new Map(),unique=new Map(),affected=new Set();
  const work=(key)=>{if(!byStop.has(key))byStop.set(key,{reason:key,events:0,minutes:0,unknown:0,wharfs:new Set(),aqcs:new Set()});return byStop.get(key)};
  for(const r of records){
    const no=String(r.workingNo||'').trim(),day=String(r.workDate||'').slice(0,10);
    const aqc=String(r.number||r.gcNo||'').trim();
    const wharf=String(r.wharf||'').trim().toUpperCase()||wharfByNo.get(no)||'未指定碼頭';
    const vessel=String(r.shipName||r.vessel||vesselByNo.get(no)||no).trim();
    for(const entry of stopEventsForRecord(r)){
      const period=entry.start&&entry.end?[entry.start,entry.end].join('-'):
        entry.source==='停工填報'?'填報:'+entry.minutes+':'+entry.reason:
        '未註時間:'+entry.reason.replace(/\s+/g,'').toLowerCase();
      const key=[no,day,aqc,entry.category,period].join('|');
      if(unique.has(key))continue;
      const event={...entry,date:day,workingNo:no,aqc,wharf,vessel,eventKey:key,automaticCategory:entry.category};
      event.category=eventManualCategory(key)||entry.category;
      unique.set(key,event);
      affected.add(String(r.id||[no,day,aqc,r.startTime,r.endTime].join('|')));
      const group=work(event.category);
      group.events++;
      if(event.minutes!==null)group.minutes+=event.minutes;
      else group.unknown++;
      group.wharfs.add(wharf);
      if(aqc)group.aqcs.add(aqc);
    }
  }
  const details=[...unique.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.workingNo.localeCompare(b.workingNo)||a.aqc.localeCompare(b.aqc)||a.category.localeCompare(b.category,'zh-Hant'));
  const categories=STOP_CATEGORIES.filter(c=>byStop.has(c.label)).map(c=>({
    ...byStop.get(c.label),wharfs:[...byStop.get(c.label).wharfs].sort(),aqcs:byStop.get(c.label).aqcs.size
  }));
  return {byStop:categories,stopDetails:details,totalStopEvents:details.length,
    totalStopMinutes:details.reduce((sum,e)=>sum+(e.minutes||0),0),
    unknownStopEvents:details.filter(e=>e.minutes===null).length,stoppedRows:affected.size};
}

function build(month,ships,rows){
  const masters=makeUniqueShips(ships,month);
  const byWharf=new Map(),byDay=new Map(),byShift=new Map();
  const wharfByNo=new Map();
  const vesselTotals={ships:0,disc:0,load:0,billed:0,moves:0,shift:0,hc:0,bundle:0,bundleKnown:0,bundleUnknown:0,bundleMismatch:0,bundleUnexplained:0,missing:0,undated:0};
  const work=(map,key,init)=>{if(!map.has(key))map.set(key,init());return map.get(key)};
  for(const s of masters){
    const ws=s.workingSheetSource||{};
    const no=String(s.workingNo||s.sourceWorkingNo||'').trim();
    const wharf=String(s.wharf||'').trim().toUpperCase()||'未指定碼頭';
    if(no)wharfByNo.set(no,wharf);
    const disc=measure(ws.disc,s.importAudit?.disc,s.disc),load=measure(ws.load,s.importAudit?.load,s.load);
    const bill=measure(s.totalContainers,ws.totalContainers),moves=measure(s.totalMoves,ws.totalMoves);
    const shift=measure(s.shiftMoves,ws.shiftMoves),hc=measure(s.hatches,ws.hatches);
    const {bundle,bn,fl,declared}=shipBundleMetrics(s);
    const rawDiff=disc!==null&&load!==null&&bill!==null?Math.round((disc+load-bill)*100)/100:null;
    const bundleDifference=rawDiff!==null&&bundle!==null?Math.round((rawDiff-bundle)*100)/100:null;
    if(disc===null||load===null||bill===null||moves===null)vesselTotals.missing++;
    const add=(target)=>{
      target.ships++;target.disc+=(disc||0);target.load+=(load||0);target.billed+=(bill||0);
      target.moves+=(moves||0);target.shift+=(shift||0);target.hc+=(hc||0);
      if(declared){target.bundle+=bundle;target.bundleKnown++;}
      else if(rawDiff!==null&&Math.abs(rawDiff)>0.01)target.bundleUnknown++;
      if(bundleDifference!==null&&Math.abs(bundleDifference)>0.01){target.bundleMismatch++;target.bundleUnexplained+=bundleDifference;}
    };
    add(vesselTotals);
    const berth=work(byWharf,wharf,()=>({wharf,ships:0,disc:0,load:0,billed:0,moves:0,shift:0,hc:0,bundle:0,bundleKnown:0,bundleUnknown:0,bundleMismatch:0,bundleUnexplained:0}));
    add(berth);
    const dates=[s._cloudLastDate,s.lastDate,s.workingSheetSource?.compareDate,s.compareDate,s.firstDate].map(v=>String(v||'').slice(0,10));
    const day=dates.find(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&v.startsWith(month));
    if(day)add(work(byDay,day,()=>({day,ships:0,disc:0,load:0,billed:0,moves:0,shift:0,hc:0,bundle:0,bundleKnown:0,bundleUnknown:0,bundleMismatch:0,bundleUnexplained:0,bundleList:[]})));
    else vesselTotals.undated++;
    if(day)byDay.get(day).bundleList.push({no,bundle,bn,fl,rawDiff,bundleDifference});
  }
  const records=makeUniqueRecords(rows,month);
  let crossShift=0,missingTime=0,unmatchedWharf=0;
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

  }
  const stops=buildStopSummary(records,wharfByNo,masters);
  return {
    month,ships:masters,records,
    vesselTotals,byWharf:[...byWharf.values()].sort((a,b)=>b.moves-a.moves||a.wharf.localeCompare(b.wharf)),
    byDay:[...byDay.values()].sort((a,b)=>b.day.localeCompare(a.day)),
    byShift:[...byShift.values()].sort((a,b)=>b.day.localeCompare(a.day)||['早班','中班','晚班','時間未提供'].indexOf(a.shift)-['早班','中班','晚班','時間未提供'].indexOf(b.shift)),
    byStop:stops.byStop,stopDetails:stops.stopDetails,
    crossShift,missingTime,unmatchedWharf,...stops
  };
}
const state={loadedMonth:'',loadedAt:0,ships:[],records:[],mode:'local',message:'',error:'',requestSeq:0,inFlight:'',stopCategory:'',categorySaveWarning:''};
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
function labelCompactTables(){
 const host=el('terminalDashboardRoot');
 if(!host||typeof host.querySelectorAll!=='function')return;
 host.querySelectorAll('.p79-ter-table').forEach(table=>{
   const labels=[...table.querySelectorAll('thead th')].map(node=>String(node.textContent||'').trim());
   table.querySelectorAll('tbody tr').forEach(row=>{
     [...row.querySelectorAll('td')].forEach((cell,i)=>{
       if(!cell.hasAttribute('colspan'))cell.setAttribute('data-label',labels[i]||'');
     });
   });
 });
}
// Match the shift-detail scroll viewport to the naturally sized daily-completion table.
// A ResizeObserver keeps them in sync as the selected month and viewport change.
let terminalTableResizeObserver=null;
function alignTerminalDailyTables(){
 const day=el('terminalDayTableWrap'),shift=el('terminalShiftTableWrap');
 if(!day||!shift)return;
 if(!terminalTableResizeObserver&&typeof ResizeObserver==='function'){
  terminalTableResizeObserver=new ResizeObserver(()=>alignTerminalDailyTables());
  terminalTableResizeObserver.observe(day);
 }
 const height=typeof day.getBoundingClientRect==='function'?day.getBoundingClientRect().height:day.offsetHeight;
 if(Number.isFinite(height)&&height>0&&shift.style)shift.style.height=Math.round(height)+'px';
}

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
  htmlMetric('停工與異常',stats.totalStopEvents?fmt(stats.totalStopEvents)+' 件':'—',stats.totalStopEvents?'可確認 '+fmt(stats.totalStopMinutes)+' 分／未定時 '+fmt(stats.unknownStopEvents)+' 件':'尚無可判讀事件，不能視為零停工','tone-rose')
 ].join('');
 const wharfBody=el('terminalWharfBody');
 if(wharfBody)wharfBody.innerHTML=stats.byWharf.length?stats.byWharf.map(s=>
  '<tr><td class="p79-terminal-wharf">'+safe(s.wharf)+'</td><td>'+fmt(s.ships)+'</td><td>'+fmt(s.disc)+'</td><td>'+fmt(s.load)+'</td><td class="p79-ter-bundle">'+fmt(s.bundle)+(s.bundleUnknown?' <small>('+fmt(s.bundleUnknown)+' 艘待核)</small>':'')+'</td><td>'+fmt(s.billed)+'</td><td class="em">'+fmt(s.moves)+'</td><td>'+fmt(s.shift)+'</td><td>'+fmt(s.hc)+'</td></tr>').join(''):rowMessage(9,'本月沒有可統計的完工船舶');
 const dayBody=el('terminalDayBody');
 if(dayBody)dayBody.innerHTML=stats.byDay.length?stats.byDay.map(s=>
  '<tr><td>'+safe(s.day)+'</td><td>'+fmt(s.ships)+'</td><td>'+fmt(s.disc)+'</td><td>'+fmt(s.load)+'</td>'+
   '<td class="p79-ter-bundle"><span class="p79-ter-bundle-value" tabindex="0" title="'+safe(s.bundleList.filter(x=>x.bundle!==null&&x.bundle>0).map(x=>x.no+'：扣 '+fmt(x.bundle)+(x.bn!==null&&x.fl!==null?'（'+fmt(x.bn)+'BN／'+fmt(x.fl)+'FL）':'')).join('；')||'本日無 Bundle 扣除明細')+'">'+fmt(s.bundle)+'</span>'+(s.bundleUnknown?' <small>('+fmt(s.bundleUnknown)+' 艘待核)</small>':'')+'</td>'+
   '<td>'+fmt(s.billed)+'</td><td class="em">'+fmt(s.moves)+'</td>'+
   '<td class="'+(s.bundleMismatch||s.bundleUnknown?'p79-ter-check':'')+'">'+
   (s.bundleUnknown?'待核對':s.bundleMismatch?(Math.abs(s.bundleUnexplained)>0.01?(s.bundleUnexplained>0?'+':'')+decimal(s.bundleUnexplained):'待核對'):'—')+'</td></tr>').join(''):rowMessage(8,'目前無可歸入本月完工日期的船舶資料');
 const shiftBody=el('terminalShiftBody');
 if(shiftBody)shiftBody.innerHTML=stats.byShift.length?stats.byShift.map(s=>
  '<tr><td>'+safe(s.day)+'</td><td><span class="p79-terminal-shift '+(s.shift==='早班'?'shift-early':s.shift==='中班'?'shift-middle':s.shift==='晚班'?'shift-night':'shift-unknown')+'">'+safe(s.shift)+'</span></td><td>'+fmt(s.records)+'</td><td>'+fmt(s.disc)+'</td><td>'+fmt(s.load)+'</td><td>'+fmt(s.hc)+'</td><td>'+decimal(s.hours)+'</td></tr>').join(''):rowMessage(7,'尚未取得當月 AQC／WORKING REPORT 作業明細');
 const reasonFilter=el('terminalReasonFilter');
 if(reasonFilter){
  reasonFilter.innerHTML='<option value="">全部原因（'+fmt(stats.totalStopEvents)+' 件）</option>'+
   STOP_CATEGORIES.map(c=>{
    const grouped=stats.byStop.find(g=>g.reason===c.label);
    return '<option value="'+safe(c.label)+'">'+safe(c.label)+'（'+fmt(grouped?.events||0)+' 件）</option>';
   }).join('');
  reasonFilter.value=state.stopCategory;
 }
 const categories=el('terminalStopCategoryKpis');
 if(categories)categories.innerHTML=STOP_CATEGORIES.filter(c=>c.label!=='原因未填'||stats.byStop.some(s=>s.reason==='原因未填')).map(c=>{
   const s=stats.byStop.find(item=>item.reason===c.label);
   const count=s?.events||0,minutes=s?.minutes||0,unknown=s?.unknown||0;
   return '<button type="button" class="p79-ter-stop-kpi '+c.tone+(state.stopCategory===c.label?' active':'')+'" aria-pressed="'+(state.stopCategory===c.label)+'" onclick="P79TerminalOps.selectCategory(\''+c.label+'\')"><span class="stop-kpi-name">'+c.icon+' '+safe(c.label)+'</span><strong>'+fmt(count)+' 件</strong><small>確認 '+fmt(minutes)+' 分'+(unknown?'／'+fmt(unknown)+' 件待核對':'')+'</small></button>';
 }).join('');
 const stopBody=el('terminalStopBody');
 if(stopBody)stopBody.innerHTML=stats.byStop.length?stats.byStop.map(s=>
  '<tr><td>'+safe(s.reason)+'</td><td>'+fmt(s.events)+'</td><td class="em">'+decimal(s.minutes)+'</td><td>'+fmt(s.unknown)+'</td><td>'+safe(s.wharfs.join('、'))+'</td><td>'+fmt(s.aqcs)+'</td></tr>').join(''):rowMessage(6,stats.records.length?'目前未辨識到有註記的停工或異常，不能據此判定零停工':'尚未取得作業明細，無法統計停工原因');
 const visible=state.stopCategory?stats.stopDetails.filter(s=>s.category===state.stopCategory):stats.stopDetails;
 const detailBody=el('terminalStopDetailBody');
 if(detailBody)detailBody.innerHTML=visible.length?visible.slice(0,160).map(e=>{
  const manuallyChosen=eventManualCategory(e.eventKey);
  const encoded=encodeURIComponent(e.eventKey).replace(/'/g,'%27');
  const reasonOptions='<option value=""'+(!manuallyChosen?' selected':'')+'>自動：'+safe(e.automaticCategory)+'</option>'+
   STOP_CATEGORIES.map(c=>'<option value="'+safe(c.label)+'"'+(manuallyChosen===c.label?' selected':'')+'>'+c.icon+' '+safe(c.label)+'</option>').join('');
  return '<tr><td>'+safe(e.date)+'</td><td>'+safe(e.vessel)+'</td><td>'+safe(e.aqc||'—')+'</td><td>'+safe(e.category)+'</td><td class="p79-ter-remark">'+safe(e.reason)+'</td><td>'+safe(e.start&&e.end?e.start+'–'+e.end:'未註明')+'</td><td class="em">'+(e.minutes===null?'待核對':fmt(e.minutes))+'</td><td><select class="p79-ter-reason-select" aria-label="選擇 '+safe(e.date+' '+e.aqc)+' 的異常分類" onchange="P79TerminalOps.setReasonCategory(\''+encoded+'\',this.value)">'+reasonOptions+'</select></td></tr>';
 }).join(''):rowMessage(8,stats.records.length?'此分類沒有可辨識的異常紀錄':'尚未取得 WORKING REPORT 明細');
 const detailCaption=el('terminalStopDetailCaption');
 if(detailCaption)detailCaption.textContent=(state.stopCategory||'全部原因')+'｜共 '+fmt(visible.length)+' 件'+(visible.length>160?'，僅列最近 160 件':'');
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
  if(stats.unknownStopEvents)list.push('有 '+fmt(stats.unknownStopEvents)+' 件 Remark 異常沒有可確認的起訖時間，只計次數、不計分鐘');
  if(stats.records.length&&!stats.totalStopEvents)list.push('尚未識別異常註記，不等於確定沒有停工');
  if(total.bundleUnknown)list.push('有 '+fmt(total.bundleUnknown)+' 艘船的卸船＋裝船與作業量不同，但沒有已知 Bundle 扣除數，請核對來源 WORKING SHEET');
  if(total.bundleMismatch)list.push('有已填報 Bundle 仍無法完全解釋的櫃數差異；每日表「待核差額」可查看');
  if(state.categorySaveWarning)list.push(state.categorySaveWarning);
  warnings.innerHTML=list.map(s=>'<div>• '+safe(s)+'</div>').join('');
 }
 root.P79TerminalRodOverview?.render(stats,state);
 labelCompactTables();
 alignTerminalDailyTables();
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
function filterReason(category){
 if(category&&!STOP_CATEGORIES.some(c=>c.label===category))return;
 state.stopCategory=category;
 render();
}
function selectCategory(category){filterReason(state.stopCategory===category?'':category);}
root.P79TerminalOps={render,load,build,options,shiftOf,makeUniqueRecords,makeUniqueShips,remarkCategory,stopEventsForRecord,selectCategory,filterReason,setReasonCategory,shipBundleMetrics};
})(window);

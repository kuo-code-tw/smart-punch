/* Port79 AQC concurrent operations: port-wide overlap of operating crane intervals.
 * No network calls. Caller supplies existing WORKING SHEET / REPORT caches.
 */
(function(g){
'use strict';
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s);
const normalizeDate=v=>{const m=String(v||'').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):''};
const dayStart=s=>Date.parse(s+'T00:00:00+08:00');
const taiwanDate=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
const taiwanStamp=ms=>{
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(ms).map(a=>[a.type,a.value]));
 return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;
};
const instant=v=>{
 if(v instanceof Date)return Number.isFinite(v.getTime())?v.getTime():NaN;
 if(typeof v==='number')return v>100000000000?v:NaN;
 const s=String(v||'').trim();if(!s)return NaN;
 const local=/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;
 const m=s.match(local);
 if(m)return Date.parse(m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0')+'T'+m[4].padStart(2,'0')+':'+m[5]+':'+(m[6]||'00')+'+08:00');
 const ms=Date.parse(s);return Number.isFinite(ms)?ms:NaN;
};
const physical=v=>{
 const s=String(v??'').trim().toUpperCase().replace(/^(?:AQC|GC)\s*[.#:\-]?\s*/,'');
 const m=s.match(/^0*(\d{1,6})$/);return m?String(Number(m[1])):'';
};
const baseKey=(ship,voyage,no)=>no?'NO:'+no:'SHIP:'+String(ship).trim().toUpperCase()+'|'+String(voyage).trim().toUpperCase();
let memo=null;
function invalidate(){memo=null}
function index(records,masters,now=Date.now()){
 const r=Array.isArray(records)?records:[],m=Array.isArray(masters)?masters:[];
 const tick=Math.floor(now/60000);
 if(memo&&memo.records===r&&memo.masters===m&&memo.rlen===r.length&&memo.mlen===m.length&&memo.tick===tick)return memo;
 const raw=[],byNo=new Map(),pending=[];
 m.forEach(s=>{const no=String(s.workingNo||'').trim();if(no)byNo.set(no,s)});
 function add(ship,voyage,no,unit,start,end,source){
  if(!ship||!unit||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return;
  if(end-start>21*86400000)return; // suspicious timestamp: never infer weeks of operation.
  raw.push({ship,voyage,no,unit,start,end,source,key:baseKey(ship,voyage,no)});
 }
 for(const s of m){
  const ship=String(s.vessel||'').trim(),no=String(s.workingNo||'').trim(),voyage=String(s.voyageE||s.voyageI||'').trim();
  if(!ship)continue;
  const aqcs=Array.isArray(s.aqcs)&&s.aqcs.length?s.aqcs:(Array.isArray(s.workingSheetSource?.aqcs)?s.workingSheetSource.aqcs:[]);
  const anyReal=aqcs.some(a=>Number.isFinite(instant(a.commence||a.start)));
  if(!anyReal&&Number(s.aqcCount||aqcs.length)>=4)pending.push({ship,voyage,no,aqcCount:Number(s.aqcCount||aqcs.length),from:normalizeDate(s.firstDate||s.compareDate||''),to:normalizeDate(s.lastDate||s.firstDate||s.compareDate||'')});
  for(const a of aqcs){
   const start=instant(a.commence||a.start),completed=instant(a.complete||a.end),unit=physical(a.number||a.gcNo);
   // A live, unfinished crane may be counted only during its current <=24h session.
   const end=Number.isFinite(completed)&&completed>start?completed:
     Number.isFinite(start)&&start<=now&&start>=now-86400000?now:NaN;
   add(ship,voyage,no,unit,start,end,'WORKING SHEET');
  }
 }
 for(const x of r){
  if(String(x?.source||'')!=='working-report')continue;
  const date=normalizeDate(x.workDate),no=String(x.workingNo||x.workNo||'').trim(),master=byNo.get(no);
  const ship=String(x.shipName||master?.vessel||x.vessel||'').trim(),voyage=String(x.voyageE||x.voyageI||x.voyage||master?.voyageE||master?.voyageI||'').trim();
  const unit=physical(x.number||x.gcNo);
  const time=v=>{const t=String(v||'').match(/^(\d{1,2}):(\d{2})/);return t&&+t[1]<24&&+t[2]<60?(+t[1]*60+ +t[2]):null};
  const a=time(x.startTime),b=time(x.endTime);
  if(!date||a===null||b===null)continue;
  const begin=dayStart(date)+a*60000;
  const end=dayStart(date)+(b<a?86400000:0)+b*60000;
  add(ship,voyage,no,unit,begin,end,'WORKING REPORT');
 }
 const result={records:r,masters:m,rlen:r.length,mlen:m.length,tick,raw,pending,reportCount:r.filter(x=>String(x?.source||'')==='working-report').length};
 memo=result;return result;
}
function compute(indexed,manual,query={}){
 const threshold=Math.max(1,Math.floor(Number(query.min)||4));
 const date=validDate(query.date)?query.date:taiwanDate(Date.now()),mode=query.mode||'day';
 const first=mode==='all'?-Infinity:mode==='month'?dayStart(date.slice(0,7)+'-01'):dayStart(date);
 const last=mode==='all'?Infinity:mode==='month'?Date.parse(new Date(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),1)).toISOString().slice(0,10)+'T00:00:00+08:00'):first+86400000;
 const source=[],unmatched=[];
 for(const x of indexed.raw){
  if(x.end<=first||x.start>=last)continue;
  source.push({...x,start:Math.max(first,x.start),end:Math.min(last,x.end),kind:'auto'});
 }
 const manualRows=Array.isArray(manual)?manual:[];
 const now=Date.now();
 for(const m of manualRows){
  const begin=instant(m.start),completed=instant(m.end),ship=String(m.ship||'').trim(),voyage=String(m.voyage||'').trim(),no=String(m.workingNo||'').trim();
  const end=Number.isFinite(completed)&&completed>begin?completed:(Number.isFinite(begin)&&begin<=now&&begin>=now-86400000?now:NaN);
  const rods=Number(m.rods);
  if(!ship||!Number.isSafeInteger(rods)||rods<1||!Number.isFinite(end)||!Number.isFinite(begin))continue;
  if(end<=first||begin>=last)continue;
  source.push({ship,voyage,no,key:baseKey(ship,voyage,no),unit:'',start:Math.max(first,begin),end:Math.min(last,end),source:'人工登錄',kind:'manual',rods,row:m});
 }
 const eventMap=new Map();
 for(let i=0;i<source.length;i++){
  const row=source[i];
  for(const [time,type] of [[row.start,'start'],[row.end,'end']]){
   if(!eventMap.has(time))eventMap.set(time,{start:[],end:[]});
   eventMap.get(time)[type].push(i);
  }
 }
 const times=[...eventMap.keys()].sort((a,b)=>a-b),active=new Set(),segments=[];
 let peak=0,seen=0,conflict=0;
 for(let i=0;i<times.length-1;i++){
  const t=times[i],ev=eventMap.get(t);
  // End at t is not concurrently running with a new start at t.
  ev.end.forEach(k=>active.delete(k));ev.start.forEach(k=>active.add(k));
  const following=times[i+1];if(following<=t||!active.size)continue;
  const boats=new Map();
  for(const n of active){
   const a=source[n],k=a.key;
   if(!boats.has(k))boats.set(k,{key:k,ship:a.ship,voyage:a.voyage,no:a.no,manual:[],auto:[]});
   boats.get(k)[a.kind==='manual'?'manual':'auto'].push(a);
  }
  // A manual vessel entry may omit WORKING NO while the imported report has it.
  // Merge it with that vessel's cached crane group before applying manual priority.
  const manualGroups=[...boats.values()].filter(b=>b.manual.length);
  for(const target of manualGroups){
   for(const other of [...boats.values()]){
    if(other.key===target.key||!other.auto.length)continue;
    const sameNo=target.no&&other.no&&target.no===other.no;
    const sameVessel=String(target.ship).trim().toUpperCase()===String(other.ship).trim().toUpperCase()&&
     (!target.voyage||!other.voyage||String(target.voyage).trim().toUpperCase()===String(other.voyage).trim().toUpperCase());
    if(sameNo||sameVessel){
     target.auto.push(...other.auto);target.manual.push(...other.manual);
     boats.delete(other.key);
    }
   }
  }
  const chosen=new Map(),units=new Map();
  for(const boat of [...boats.values()].sort((a,b)=>a.key.localeCompare(b.key))){
   if(boat.manual.length){
    boat.manual.sort((a,b)=>String(b.row.updatedAt||'').localeCompare(String(a.row.updatedAt||''))||String(a.row.id||'').localeCompare(String(b.row.id||'')));
    const m=boat.manual[0];chosen.set(boat.key,{boat,rods:m.rods,aqcs:[],manual:m.row,source:'人工登錄'});continue;
   }
   const byUnit=new Map();
   for(const a of boat.auto){
    const prev=byUnit.get(a.unit);
    if(!prev||a.source==='WORKING SHEET'&&prev.source!=='WORKING SHEET')byUnit.set(a.unit,a);
   }
   chosen.set(boat.key,{boat,rods:0,aqcs:[],byUnit,source:'船舶快取'});
  }
  const sorted=[...chosen.values()].sort((a,b)=>a.boat.key.localeCompare(b.boat.key));
  for(const s of sorted){
   if(!s.byUnit)continue;
   for(const [unit,row] of s.byUnit){
    if(units.has(unit)){conflict++;continue;} // A physical crane cannot be on two ships simultaneously.
    units.set(unit,s.boat.key);s.rods++;s.aqcs.push(unit);
   }
  }
  const ships=sorted.filter(s=>s.rods>0).map(s=>({
   ship:s.boat.ship,voyage:s.boat.voyage,workingNo:s.boat.no,rods:s.rods,
   aqcNumbers:s.aqcs,source:s.source,
   containers:s.manual?Number(s.manual.containers??0):null,
   hatches:s.manual?Number(s.manual.hatches??0):null,
   shiftMoves:s.manual?Number(s.manual.shiftMoves??0):null,
   manualStart:s.manual?instant(s.manual.start):null,manualEnd:s.manual?instant(s.manual.end):null
  }));
  const total=ships.reduce((a,s)=>a+s.rods,0);peak=Math.max(peak,total);seen++;
  if(total<threshold)continue;
  const signature=JSON.stringify([total,ships.map(s=>[s.ship,s.voyage,s.workingNo,s.rods,s.aqcNumbers.join(',')])]);
  const prev=segments.at(-1);
  if(prev&&prev._end===t&&prev.signature===signature){prev._end=following;prev.end=taiwanStamp(following);continue}
  segments.push({_start:t,_end:following,start:taiwanStamp(t),end:taiwanStamp(following),
   date:taiwanDate(t),ships,totalRods:total,shipCount:ships.length,signature,source:'同時作業判讀',id:'OVERLAP:'+t+'-'+following});
 }
 const rows=segments.map(x=>{
  const known= x.ships.length>0&&x.ships.every(s=>s.manualStart===x._start&&s.manualEnd===x._end&&s.containers!==null);
  return {...x,containers:known?x.ships.reduce((v,s)=>v+s.containers,0):null,
   hatches:known?x.ships.reduce((v,s)=>v+s.hatches,0):null,
   shiftMoves:known?x.ships.reduce((v,s)=>v+s.shiftMoves,0):null,
   durationMinutes:Math.round((x._end-x._start)/60000)};
 });
 return {rows,peak,rawIntervals:source.length,sourceReportCount:indexed.reportCount,
  pending: indexed.pending.filter(x=>mode==='all'||(mode==='month'?(x.from||'').slice(0,7)<=date.slice(0,7)&&(x.to||x.from||'').slice(0,7)>=date.slice(0,7):x.from<=date&&(x.to||x.from)>=date)),
  duplicateCraneConflicts:conflict,slotsChecked:seen,
  intervalCount:indexed.raw.length};
}
g.P79AqcConcurrent={index,compute,invalidate,normalizeDate,instant};
})(window);
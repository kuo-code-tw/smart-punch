(function(g){
'use strict';
const TYPHOON_KEY='p79-manual-typhoon-days-v1';
const ELECTION_KEY='p79-manual-election-days-v1';
const OFFICIAL_ELECTION_DATES=new Set(['2026-11-28']);
const DAY_MS=86400000;
const taipeiDate=(value)=>{
 const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
 const get=type=>parts.find(part=>part.type===type)?.value||'';
 return get('year')+'-'+get('month')+'-'+get('day');
};
const normalizeDate=value=>{
 const raw=String(value||'').trim().replace(/\//g,'-'),m=raw.match(/^(\d{3,4})-(\d{1,2})-(\d{1,2})$/);
 if(!m)return '';
 let year=Number(m[1]);if(year<1911)year+=1911;
 return String(year).padStart(4,'0')+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0');
};
const readDays=key=>{try{const v=JSON.parse(g.localStorage?.getItem(key)||'[]');return new Set(Array.isArray(v)?v.map(normalizeDate).filter(Boolean):[])}catch(_){return new Set()}};
function kindsForDate(value){
 const date=normalizeDate(value);if(!date)return [];
 const out=[];
 if(readDays(TYPHOON_KEY).has(date))out.push({code:'颱',kind:'typhoon',category:'國',name:'颱風停班日'});
 const official=g.P79OfficialCalendar?.get?.(date);
 const officialName=String(official?.name||'');
 if(OFFICIAL_ELECTION_DATES.has(date)||readDays(ELECTION_KEY).has(date)||/選舉|投票/.test(officialName))out.push({code:'選',kind:'election',category:'國',name:officialName||'選舉日'});
 return out;
}
function overlap(startMs,endMs){
 const start=Number(startMs),end=Number(endMs);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return [];
 const first=taipeiDate(start),last=taipeiDate(end),out=[];
 let day=first;
 for(let guard=0;day<=last&&guard<370;guard++){
  const midnight=Date.parse(day+'T00:00:00+08:00'),next=midnight+DAY_MS,left=Math.max(start,midnight),right=Math.min(end,next),minutes=Math.floor(Math.max(0,right-left)/60000);
  if(right>left){const kinds=kindsForDate(day);if(kinds.length)out.push({date:day,minutes,kinds,hours:Math.round(minutes/60*100)/100});}
  const nextDate=new Date(Date.parse(day+'T00:00:00Z')+DAY_MS);day=nextDate.toISOString().slice(0,10);
 }
 return out;
}
function forShift(startMs,endMs,clockInText=''){
 const start=Number(startMs);if(!Number.isFinite(start))return [];
 const pending=endMs===null||endMs===undefined||endMs===''||!Number.isFinite(Number(endMs)),time=String(clockInText||'').match(/(?:\s|T)(\d{1,2}):/),hour=time?Number(time[1]):-1;
 let end=pending?start+1:Number(endMs);
 if(pending&&hour>=22){const nextDate=new Date(Date.parse(taipeiDate(start)+'T00:00:00Z')+DAY_MS).toISOString().slice(0,10);end=Date.parse(nextDate+'T00:00:00+08:00')+1;}
 return overlap(start,end).map(item=>({...item,pending,hours:pending?null:item.hours}));
}
g.P79SpecialOvertime={normalizeDate,kindsForDate,overlap,forShift,signature:()=>JSON.stringify([[...OFFICIAL_ELECTION_DATES],g.localStorage?.getItem(TYPHOON_KEY)||'',g.localStorage?.getItem(ELECTION_KEY)||'',g.localStorage?.getItem('p79_official_calendar_annotations_v1')||''])};
})(window);

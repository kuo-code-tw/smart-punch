(function(g){
'use strict';
const TYPHOON_KEY='p79-manual-typhoon-days-v1';
const ELECTION_KEY='p79-manual-election-days-v1';
const SCHEDULE_OVERTIME_CHANGED_KEY='p79_schedule_overtime_changed_v1';
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

function installWorkhoursAttendanceBridge(){
 const doc=g.document;
 if(!doc||!g.addEventListener)return;
 const start=()=>{
  const isWorkhoursPage=()=>doc.body?.dataset?.p79System==='workhours'||/\/work-hours\/?$/.test(String(g.location?.pathname||''));
  const isAttendancePage=()=>doc.body?.dataset?.p79System==='attendance'||/\/attendance\/?$/.test(String(g.location?.pathname||''));
  if(isAttendancePage()){
   g.addEventListener('storage',event=>{
    if(event.key!==SCHEDULE_OVERTIME_CHANGED_KEY||!event.newValue)return;
    let change;try{change=JSON.parse(event.newValue)}catch(_){return}
    try{
     const CustomEventCtor=g.CustomEvent;
     if(typeof CustomEventCtor==='function')g.dispatchEvent(new CustomEventCtor('p79:schedule-overtime-changed',{detail:change}));
    }catch(_){}
   });
  }
  if(!isWorkhoursPage())return;
  const handoffUrl=()=>{
   try{
    const url=new URL(g.location.href);
    if(url.searchParams.get('attendanceOvertimeReport')!=='1')return;
    const key='port79_attendance_overtime_request_v1';
    let request=null;
    try{request=JSON.parse(g.sessionStorage?.getItem(key)||'null')}catch(_){}
    if(!request?.empId||!/^\d{4}-\d{2}-\d{2}$/.test(String(request.date||''))){
     const empId=String(url.searchParams.get('empId')||'').trim(),date=String(url.searchParams.get('date')||'').trim();
     if(empId&&/^\d{4}-\d{2}-\d{2}$/.test(date)){
      request={empId,date,name:String(url.searchParams.get('name')||'')};
      try{g.sessionStorage?.setItem(key,JSON.stringify(request))}catch(_){}
     }
    }
    const clean=()=>{
     try{
      const next=new URL(g.location.href);
      ['attendanceOvertimeReport','empId','date','name'].forEach(name=>next.searchParams.delete(name));
      g.history?.replaceState(g.history.state,'',next.pathname+next.search+next.hash);
     }catch(_){}
    };
    if(request?.empId&&/^\d{4}-\d{2}-\d{2}$/.test(String(request.date||'')))g.setTimeout(clean,0);
    else{
     clean();
     g.setTimeout(()=>g.showToast?.('申報連結資料已失效，請從考勤紀錄重新點選。', 'warning'),0);
    }
   }catch(_){}
  };
  handoffUrl();
  let refreshTimer=0,refreshBusy=false,refreshAgain=false;
  const hasPendingAttendanceWrites=()=>{
   try{
    const queue=JSON.parse(g.localStorage?.getItem('sp_cloud_outbox_v1')||'[]');
    return Array.isArray(queue)&&queue.some(item=>['addRecord','updateRecord','editRecord','deleteRecord','persistEmployeePunch'].includes(String(item?.payload?.action||'')));
   }catch(_){return false}
  };
  const refresh=()=>{
   if(hasPendingAttendanceWrites())return;
   if(refreshBusy){refreshAgain=true;return}
   if(refreshTimer)clearTimeout(refreshTimer);
   refreshTimer=setTimeout(async()=>{
    refreshTimer=0;
    if(doc.visibilityState==='hidden'||hasPendingAttendanceWrites())return;
    refreshBusy=true;
    try{
     let ok=false;
     if(typeof g.p79StartupAttendanceCurrentMonthSync==='function')ok=await g.p79StartupAttendanceCurrentMonthSync(false);
     if(!ok&&typeof g.p79PollAttendanceDelta==='function')await g.p79PollAttendanceDelta(true);
     if(ok&&typeof g.renderOvertimeStats==='function')g.renderOvertimeStats();
    }catch(_){}
    finally{
     refreshBusy=false;
     if(refreshAgain){refreshAgain=false;refresh()}
    }
   },250);
  };
  g.addEventListener('storage',event=>{
   if(event.key==='sp_records_v5')refresh();
   if(event.key==='sp_cloud_outbox_v1'&&!hasPendingAttendanceWrites())refresh();
  });
  g.addEventListener('focus',refresh);
  doc.addEventListener('visibilitychange',()=>{if(doc.visibilityState==='visible')refresh()});
  const generatedOnly=cell=>{
   const text=String(cell?.textContent||'');
   return text.includes('國定假日自動加班')&&!/(申報|已安排|設定換算)/.test(text);
  };
  const cleanGeneratedDeleteButtons=()=>{
   const table=doc.getElementById('overtimeTableBody');
   if(!table)return;
   table.querySelectorAll('tr').forEach(row=>{
    const cell=row.querySelectorAll('td')[7];
    if(!generatedOnly(cell))return;
    cell.querySelectorAll('button').forEach(button=>{
     if(String(button.textContent||'').includes('刪除加班'))button.remove();
    });
   });
  };
  doc.addEventListener('click',event=>{
   const button=event.target?.closest?.('button');
   if(!button||!String(button.textContent||'').includes('刪除加班'))return;
   if(!generatedOnly(button.closest('td')))return;
   event.preventDefault();
   event.stopImmediatePropagation();
   g.alert?.('這筆是依考勤時間自動計算的假日加班，請修改考勤時間；沒有獨立加班申報可刪除。');
  },true);
  if(typeof g.MutationObserver==='function'){
   const observer=new g.MutationObserver(cleanGeneratedDeleteButtons);
   observer.observe(doc.body,{childList:true,subtree:true});
   cleanGeneratedDeleteButtons();
  }
 };
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
installWorkhoursAttendanceBridge();
})(window);

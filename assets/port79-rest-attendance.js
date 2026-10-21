(function(g){
'use strict';
const DAY=86400000,HOUR=3600000,id=x=>String(x||'').trim().toUpperCase();
function shiftDate(date,n){return new Date(Date.parse(date+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);}
const leaveCodes=new Set(['年','年假','特','特休','事','事假','病','病假','公','公假','喪','喪假','婚','婚假','產','產假','陪產','生理假']);
function isLeaveDay(snapshot,emp,date,roster={}){
 const key=id(emp)+'|'+date;
 return snapshot?.attendanceEvidence?.days?.[key]?.leave===true||leaveCodes.has(String(roster[date]||'').trim())||(snapshot?.leaveDates||[]).some(k=>String(k).toUpperCase()===key)||(snapshot?.approvedLeaves||[]).some(l=>id(l.empId)===id(emp)&&date>=l.start&&date<=l.end);
}
function period(date,roster){
 const meta=roster.__meta?.[date]||{},report=meta.overtimeReport||{},shift=meta.reportOriginalShift??meta.overtimeOriginalShift??roster[date];
 let hours=({早:[8,16],中:[16,24],晚:[24,32]})[shift];
 if(!hours&&report.overtimeStart!=null&&report.overtimeEnd!=null){
  const minute=x=>{const m=String(x).match(/^(\d{1,2})(?::(\d{2}))?$/);return m?Number(m[1])+Number(m[2]||0)/60:NaN};
  const a=minute(report.overtimeStart),b=minute(report.overtimeEnd);if(Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&a<=24&&b>=0&&b<=24)hours=[a,b<=a?b+24:b];
 }
 const base=Date.parse(date+'T00:00:00+08:00');
 return hours?{start:base+hours[0]*HOUR,end:base+hours[1]*HOUR,known:true}:{start:base,end:base+32*HOUR,known:false};
}
function build(input){
 if(input?.complete!==true)return{complete:false,days:{}};
 const now=Number(input.now??Date.now()),rosters=new Map((input.schedules||[]).map(r=>[id(r.empId),r.schedule||{}])),days={},marks=new Map(),sessionDates=[];
 const mark=(emp,date,kind)=>{const key=id(emp)+'|'+date;if(!marks.has(key))marks.set(key,[]);marks.get(key).push(kind)};
 for(const [index,session] of (input.sessions||[]).entries()){
  const emp=id(session.empId),roster=rosters.get(emp);if(!roster)continue;
  const start=Number(session.start),end=Number(session.end),hasIn=session.start!=null&&Number.isFinite(start),hasOut=session.end!=null&&Number.isFinite(end);
  const at=hasIn?start:hasOut?end:Number(session.time);if(!Number.isFinite(at))continue;
  const date=new Date(at+8*HOUR).toISOString().slice(0,10),candidates=[],paired=hasIn&&hasOut&&end>start;
  for(const offset of [-1,0,1]){
   const d=shiftDate(date,offset);if(!roster[d])continue;const p=period(d,roster);if(!p.known)continue;
   const distance=Math.abs(at-(hasIn?p.start:p.end));
   const overlap=paired?Math.max(0,Math.min(end,p.end)-Math.max(start,p.start)):0;
   const inside=hasIn?at>=p.start&&at<p.end:at>p.start&&at<=p.end;
   // A late/partial shift still proves attendance: use actual overlap, not a
   // four-hour distance from the planned start. Keep single punches unresolved.
   if(paired?overlap>0:inside||distance<=4*HOUR)candidates.push({date:d,distance,overlap});
  }
  candidates.sort((a,b)=>b.overlap-a.overlap||a.distance-b.distance||a.date.localeCompare(b.date));
  const target=candidates[0]?.date||(!hasIn&&hasOut&&new Date(at+8*HOUR).getUTCHours()<9?shiftDate(date,-1):date);
  sessionDates[index]=target;
  mark(emp,target,paired?'worked':'missing');
  // One unpaired punch may fit adjacent shifts; neither is proven wholly absent.
  if(!paired)for(const candidate of candidates)if(candidate.date!==target)mark(emp,candidate.date,'missing');
  if(!candidates.length&&!hasIn&&hasOut&&target!==date&&roster[date])mark(emp,date,'missing');
  const previous=shiftDate(date,-1);
  if(!candidates.length&&hasIn&&new Date(at+8*HOUR).getUTCHours()<8&&roster[previous]&&!period(previous,roster).known)mark(emp,previous,'missing');
 }
 for(const [emp,roster] of rosters)for(const date of Object.keys(roster)){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!date.startsWith(input.month+'-'))continue;
  const p=period(date,roster),events=marks.get(emp+'|'+date)||[];
  const state=events.length?(events.length===1&&events[0]==='worked'?'worked':'missing'):(now>=p.end?'rest':'open');
  days[emp+'|'+date]={state,shiftEnd:p.end,leave:isLeaveDay(input,emp,date,roster)};
 }
 return{complete:true,month:input.month,checkedAt:now,days,sessionDates};
}
function state(snapshot,emp,date){return snapshot?.attendanceEvidence?.complete===true?snapshot.attendanceEvidence.days?.[id(emp)+'|'+date]?.state||'unknown':'unknown'}
function reportIssue(snapshot,emp,date){const s=state(snapshot,emp,date);return s==='rest'?'整班無上下班卡，按休假處理，原申報不列有效加班':s==='missing'?'只有單邊打卡或配對不明，保留原申報待補卡核對':'';}
g.P79RestAttendance={build,state,reportIssue,period,isLeaveDay};
})(window);

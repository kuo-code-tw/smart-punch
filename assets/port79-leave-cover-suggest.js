(function(global){
 'use strict';
 const DAY=86400000,HOUR=3600000;
 const norm=v=>String(v||'').trim().toUpperCase();
 function addDays(date,days){const ms=Date.parse(date+'T12:00:00Z');return Number.isFinite(ms)?new Date(ms+days*DAY).toISOString().slice(0,10):'';}
 function midnight(date){return Date.parse(date+'T00:00:00+08:00');}
 const shifts={早:[8,16],中:[16,24],晚:[24,32]};
 function shiftName(value){const v=String(value||'').trim();return shifts[v]?v:/^(早班|中班|晚班)$/.test(v)?v[0]:'';}
 function interval(date,shift){const range=shifts[shiftName(shift)];if(!range)return null;const t=midnight(date);return [t+range[0]*HOUR,t+range[1]*HOUR];}
 function mergeRosters(payloads){
  const map=new Map();
  for(const data of payloads){
   if(data?.ok!==true||!Array.isArray(data.schedules))throw Error('正式班表讀取不完整');
   const month=String(data.month||'').slice(0,7).replace('/','-');
   for(const item of data.schedules){
    const id=norm(item.empId),schedule=item.schedule;
    if(!id||!schedule||typeof schedule!=='object')continue;
    const prior=map.get(id)||{};
    for(const [raw,value] of Object.entries(schedule)){
     const date=/^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:
       /^\d{4}\/\d{2}\/\d{2}$/.test(raw)?raw.replaceAll('/','-'):
       /^\d{1,2}$/.test(raw)&&/^\d{4}-\d{2}$/.test(month)?month+'-'+raw.padStart(2,'0'):'';
     if(date)prior[date]=value;
    }
    map.set(id,prior);
   }
  }
  return map;
 }
 function monthsFor(date){
  const months=new Set();
  for(const days of [-3,0,3])months.add(addDays(date,days).slice(0,7));
  return [...months];
 }
 function overlaps(a,b){return a[0]<b[1]&&b[0]<a[1];}
 function workdayCovered(date,start,end){return !!date&&date>=start&&date<=end;}
 function leaveOn(personId,date,leaves){
  return leaves.some(l=>norm(l.empId)===norm(personId)&&!/駁回|取消|撤銷|作廢/.test(String(l.status||''))&&
   workdayCovered(date,String(l.startDate||l.startTime||'').slice(0,10).replaceAll('/','-'),
                  String(l.endDate||l.endTime||l.startDate||l.startTime||'').slice(0,10).replaceAll('/','-')));
 }
 function covered(personId,date,covers){
  return covers.some(c=>(c.workerIds||[]).some(id=>norm(id)===norm(personId))&&workdayCovered(date,String(c.startDate||''),String(c.endDate||'')));
 }
 function sameScope(person,target){
  if(norm(person.empId)===norm(target.empId)||!norm(target.dept)||norm(person.dept)!==norm(target.dept))return false;
  const title=p=>String(p.jobTitle||p.deptDetail||'').trim();
  if(!title(target)||title(person)!==title(target))return false;
  for(const key of ['company','companyName','unit','group','groupName','team','teamName']){
   const expected=String(target[key]||'').trim(),actual=String(person[key]||'').trim();
   if(expected&&actual&&expected!==actual)return false;
  }
  return !/^(resigned|terminated|inactive|leave|loa|離職|留停)$/.test(String(person.employmentStatus||'active').toLowerCase());
 }
 function restEligible(person,shiftDate,expectedShift,full,rosters,leaves,covers){
  const id=norm(person.empId),roster=rosters.get(id);
  if(!roster||shiftName(roster[shiftDate])!==expectedShift||!interval(shiftDate,expectedShift))return false;
  // Check every other verified scheduled shift in the surrounding 3-day window.
  // Exclude the original shift which is being extended, never ignore other work.
  const anchor=interval(shiftDate,expectedShift);
  if(full[0]>anchor[0]||full[1]<anchor[1]||full[1]-full[0]>12*HOUR)return false;
  for(let offset=-3;offset<=3;offset++){
   const date=addDays(shiftDate,offset),other=interval(date,roster[date]);
   if(!other)continue;
   if(date===shiftDate)continue;
   if(overlaps(full,other))return false;
   if(other[1]<=full[0]&&full[0]-other[1]<12*HOUR)return false;
   if(other[0]>=full[1]&&other[0]-full[1]<12*HOUR)return false;
  }
  if(leaveOn(id,shiftDate,leaves)||covered(id,shiftDate,covers))return false;
  const next=addDays(shiftDate,1);
  if(full[1]>midnight(next)&&(leaveOn(id,next,leaves)||covered(id,next,covers)))return false;
  return true;
 }
 // A leave night starts on its original workday, but the second cover
 // extends the following day's EARLY shift. Never book both on leaveDate.
 function coverWorkday(leaveDate,leaveShift,mode,workerIndex){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(leaveDate||''))||mode!=='two'||![0,1].includes(workerIndex))return null;
  let p;
  if(shiftName(leaveShift)==='晚'){
   p=workerIndex===0?
    {workDate:leaveDate,normalShift:'中',normalStart:'16',normalEnd:'24',overtimeStart:'24',overtimeEnd:'04',period:'16-04',code:'延16-04',position:'after'}:
    {workDate:addDays(leaveDate,1),normalShift:'早',normalStart:'08',normalEnd:'16',overtimeStart:'04',overtimeEnd:'08',period:'04-16',code:'延04-16',position:'before'};
  }else if(shiftName(leaveShift)==='早'){
   p=workerIndex===0?
    {workDate:addDays(leaveDate,-1),normalShift:'晚',normalStart:'24',normalEnd:'08',overtimeStart:'08',overtimeEnd:'12',period:'24-12',code:'延24-12',position:'after'}:
    {workDate:leaveDate,normalShift:'中',normalStart:'16',normalEnd:'24',overtimeStart:'12',overtimeEnd:'16',period:'12-24',code:'延12-24',position:'before'};
  }else return null;
  return {...p,leaveDate,category:'延',declaredHours:4};
 }
 function suggest({people=[],rosters=new Map(),leaves=[],covers=[],leaveEmpId,date}={}){
  const target=people.find(e=>norm(e.empId)===norm(leaveEmpId)),schedule=rosters.get(norm(leaveEmpId));
  if(!target||!schedule||!/\d{4}-\d{2}-\d{2}/.test(String(date||'')))return {reason:'請先確認請假人員、日期與正式班表',slots:[]};
  const leaveShift=shiftName(schedule[date]);
  if(!['晚','早'].includes(leaveShift))return {reason:leaveShift?'目前僅對早班／大夜班請假自動推薦兩位支援；其他班別仍可手動安排':'請假當日班別未能確認，暫不自動指定',slots:[],leaveShift};
  const d=midnight(date),prev=addDays(date,-1),next=addDays(date,1);
  const scenarios=leaveShift==='晚'?
    [{shiftDate:date,shift:'中',from:d+16*HOUR,to:d+28*HOUR,period:'16–04',overtime:'24–04'},
     {shiftDate:next,shift:'早',from:d+28*HOUR,to:d+40*HOUR,period:'04–16',overtime:'04–08'}]:
    [{shiftDate:prev,shift:'晚',from:d,to:d+12*HOUR,period:'24–12',overtime:'08–12'},
     {shiftDate:date,shift:'中',from:d+12*HOUR,to:d+24*HOUR,period:'12–24',overtime:'12–16'}];
  const scoped=people.filter(p=>sameScope(p,target));
  const slots=scenarios.map(plan=>({...plan,candidates:scoped.filter(p=>restEligible(p,plan.shiftDate,plan.shift,[plan.from,plan.to],rosters,leaves,covers))}));
  if(slots.some(s=>s.candidates.length===0))return {leaveShift,slots,reason:'同部門同職稱沒有足夠人員通過班別與前後12小時休息核對，請檢查班表並手動安排'};
  const first=slots[0].candidates[0],second=slots[1].candidates.find(p=>norm(p.empId)!==norm(first.empId));
  if(!second)return {leaveShift,slots,reason:'兩段支援沒有兩位不同的合格人員，請核對班表後手動安排'};
  return {leaveShift,slots,first,second,reason:''};
 }
 global.P79LeaveCoverSuggest={suggest,coverWorkday,mergeRosters,monthsFor,interval,addDays};
})(typeof window==='undefined'?globalThis:window);

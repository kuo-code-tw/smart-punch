(function(g){
'use strict';
const reports=new Map(),ready=new Set(),id=x=>String(x||'').trim().toUpperCase();
function clear(){reports.clear();ready.clear();}
function acceptRows(rows,month=null){
 if(!month)clear();else{for(const key of reports.keys())if(key.split('|')[1]?.startsWith(month+'-'))reports.delete(key);ready.add(month);}
 for(const row of rows){
  for(const date of Object.keys(row.schedule||{}))if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&(!month||date.startsWith(month+'-')))ready.add(date.slice(0,7));
  for(const [date,meta] of Object.entries(row.schedule?.__meta||{})){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||month&&!date.startsWith(month+'-'))continue;
   const report=meta?.overtimeReport;if(!String(report?.id??'').trim())continue;
   reports.set(id(row.empId)+'|'+date,JSON.parse(JSON.stringify(report)));
  }
 }
}
function summary(emp,schedule,allocated,month,snapshot,start=''){
 const roster={...schedule,__meta:JSON.parse(JSON.stringify(allocated||{}))};
 for(const meta of Object.values(roster.__meta))if(meta)delete meta.overtimeReport;
 for(const [key,report] of reports){const [employee,date]=key.split('|');if(employee!==id(emp.id)||!date.startsWith(month+'-'))continue;roster.__meta[date]={...(roster.__meta[date]||{}),overtimeReport:report};}
 try{
  const result=g.P79MonthlyRest.balance({...emp,empId:emp.id},roster,month,snapshot,start);
  return ready.has(month)?result:{...result,remaining:null,error:'尚未完成雲端申報核對'};
 }catch(error){
  const quota={例:0,休:0,國:0},end=Object.keys(schedule).filter(d=>['離','離職'].includes(schedule[d])).sort()[0]||'';
  for(const slot of g.p79RestQuota(month).slots)if((!start||slot.sourceDate>=start)&&(!end||slot.sourceDate<end))quota[slot.category]++;
  return{quota,remaining:null,error:String(error.message||error)};
 }
}
g.P79ScheduleRestSummary={clear,acceptRows,summary};
})(window);

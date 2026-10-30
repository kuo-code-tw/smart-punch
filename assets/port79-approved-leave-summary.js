/* Approved leave only. HR titles and explicit per-day allocations take priority. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.P79ApprovedLeaveSummary=api;})(typeof window==='undefined'?null:window,function(){
'use strict';
const text=v=>String(v??'').trim(),id=v=>text(v).toUpperCase();
function date(v){const m=text(v).match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);if(!m)return '';const key=m.slice(1).join('-');const t=Date.parse(key+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===key?key:'';}
function aggregate({employees=[],leaveRecords=[],month}={}){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))throw Error('請假統計月份無效');
 const people=new Map(employees.map(e=>[id(e.empId||e.id),e])),records=new Map(),issues=[],totals=new Map();
 for(const r of leaveRecords){const key=text(r.id);if(!key){issues.push('請假紀錄缺少編號');continue;}
  const prior=records.get(key);if(!prior){records.set(key,r);continue;}
  if(JSON.stringify(prior)===JSON.stringify(r))continue;
  const stamp=x=>Date.parse(x.updatedAt||x.modifiedAt||x.approvedAt||'');const a=stamp(prior),b=stamp(r);
  if(Number.isFinite(a)&&Number.isFinite(b)&&a!==b)records.set(key,b>a?r:prior);
  else records.set(key,{id:key,status:'資料版本待核'});
 }
 for(const r of records.values()){
  if(r.status==='資料版本待核'){issues.push(r.id+'：重複版本無法確認');continue;}
  if(text(r.status)!=='已核准'||r.deleted===true||r.isDeleted===true||r.cancelled===true||r.canceled===true||r.revoked===true||r.deletedAt||r.cancelledAt||r.canceledAt)continue;
  const start=date(r.startDate||r.startTime),end=date(r.endDate||r.endTime)||start;
  if(!start||!end||end<start){issues.push(r.id+'：請假日期待核');continue;}
  if(end<month+'-01'||start.slice(0,7)>month)continue;
  const person=people.get(id(r.empId||r.employeeId));
  if(!person){issues.push(r.id+'：無法對應人資人員');continue;}
  const title=text(person.jobTitle||person.deptDetail)||'未設定職稱';
  const count=(Date.parse(end)-Date.parse(start))/86400000+1,total=Number(r.approvedDays??r.days??r.dayCount);
  const daily=r.approvedDailyDays||r.dailyDays;let days=0;
  if(daily&&typeof daily==='object'&&!Array.isArray(daily)){
   let sum=0,valid=true;for(const [d,n]of Object.entries(daily)){const value=Number(n);if(date(d)!==d||d<start||d>end||!Number.isFinite(value)||value<0||value>1){valid=false;break;}sum+=value;if(d.startsWith(month+'-'))days+=value;}
   if(!valid||!Number.isFinite(total)||Math.abs(sum-total)>1e-7){issues.push(r.id+'：每日核准天數待核');continue;}
  }else if(Number.isFinite(total)&&total>0&&total<=count){
   if(start.slice(0,7)===month&&end.slice(0,7)===month)days=total;
   else if(Math.abs(total-count)<1e-7){
    for(let t=Date.parse(start);t<=Date.parse(end);t+=86400000)if(new Date(t).toISOString().startsWith(month+'-'))days++;
   }else {issues.push(r.id+'：跨月半日需每日核准天數');continue;}
  }else {issues.push(r.id+'：核准天數待核');continue;}
  totals.set(title,(totals.get(title)||0)+days);
 }
 return{month,rows:[...totals].filter(([,days])=>days>0).map(([title,days])=>({title,days:Math.round(days*10000)/10000})).sort((a,b)=>b.days-a.days||a.title.localeCompare(b.title,'zh-TW')),issues};
}
return{aggregate};
});

/* Pure, read-only checks for existing HR, attendance, leave and scheduling records. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.P79HrVerifiedMetrics=api;
})(typeof window==='undefined'?null:window,function(){
'use strict';
const norm=v=>String(v??'').trim(),id=v=>norm(v).toUpperCase();
const validMonth=v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
function date(raw){
 const s=norm(raw).replace(/^民國\s*/,'').replace(/年/g,'/').replace(/月/g,'/').replace(/日/g,'');
 const m=s.match(/^(\d{2,4})[-/](\d{1,2})[-/](\d{1,2})/);
 if(!m)return '';
 const year=Number(m[1])<1911?Number(m[1])+1911:Number(m[1]),mo=Number(m[2]),day=Number(m[3]);
 const d=new Date(Date.UTC(year,mo-1,day));
 return d.getUTCFullYear()===year&&d.getUTCMonth()===mo-1&&d.getUTCDate()===day
 ?year+'-'+String(mo).padStart(2,'0')+'-'+String(day).padStart(2,'0'):'';
}
function isResigned(e,day){
 const s=norm(e.employmentStatus||e.status).toLowerCase();
 const termination=date(e.terminationDate);
 return ['resigned','離職','terminated','inactive'].includes(s)||!!(termination&&termination<=day);
}
function isWorking(e,day){
 const s=norm(e.employmentStatus||e.status).toLowerCase(),started=date(e.startDate||e.reportingDate);
 return (!started||started<=day)&&!isResigned(e,day)&&!['leave','留職停薪','留停','loa'].includes(s);
}
function approvedLeaveCount(rows,month,staffIds){
 if(!validMonth(month)||!Array.isArray(rows))return{ready:false,reason:'請假月份或資料格式不完整'};
 const byId=new Map(),issues=[],allow=new Set(staffIds||[]);
 for(const row of rows){
  const key=norm(row?.id);
  if(!key){issues.push('請假紀錄缺少編號');continue}
  const prev=byId.get(key);
  if(!prev){byId.set(key,row);continue}
  if(JSON.stringify(prev)===JSON.stringify(row))continue;
  const stamp=x=>Date.parse(x.updatedAt||x.modifiedAt||x.approvedAt||'');
  const a=stamp(prev),b=stamp(row);
  if(Number.isFinite(a)&&Number.isFinite(b)&&b!==a)byId.set(key,b>a?row:prev);
  else issues.push(key+' 版本無法核對');
 }
 let count=0;const typeCounts={};
 for(const r of byId.values()){
  if(norm(r.status)!=='已核准'||r.deleted===true||r.isDeleted===true||r.cancelled===true||r.canceled===true||r.revoked===true||r.deletedAt||r.cancelledAt||r.canceledAt)continue;
  const start=date(r.startDate||r.startTime),end=date(r.endDate||r.endTime)||start;
  if(!start||!end||end<start){issues.push(norm(r.id)+' 日期格式不完整');continue}
  if(end<month+'-01'||start>month+'-31')continue;
  const person=id(r.empId||r.employeeId);
  if(!person||!allow.has(person)){issues.push(norm(r.id)+' 人員無法對應');continue}
  count++;
  const code=norm(r.leaveType||r.type||r.typeName)||'其他';
  typeCounts[code]=(typeCounts[code]||0)+1;
 }
 return issues.length?{ready:false,issues}:{ready:true,count,typeCounts,issues:[]};
}
function officialOvertime(scheduleRows,month,staffIds){
 if(!validMonth(month)||!Array.isArray(scheduleRows))return{ready:false,reason:'班表月份或資料格式不完整'};
 const allow=new Set(staffIds||[]),seen=new Map(),issues=[];
 let hours=0,count=0,planned=0;
 for(const row of scheduleRows){
  const person=id(row.empId||row.id);
  if(!person||!allow.has(person))continue;
  const schedule=row.schedule;
  if(!schedule||typeof schedule!=='object'||Array.isArray(schedule)){issues.push('班表資料格式不完整');continue}
  for(const [raw,meta] of Object.entries(schedule.__meta||{})){
   const r=meta?.overtimeReport;
   if(!r||meta?.overtimeExcluded===true||r.deleted===true||r.revoked===true||
       /撤銷|刪除|取消|revoked|cancel/i.test(norm(r.status)))continue;
   const d=date(r.overtimeDate||raw);
   if(!d||!d.startsWith(month+'-'))continue;
   const recordId=norm(r.id);
   if(!recordId){issues.push(person+' 加班申報缺少ID');continue}
   const fingerprint=JSON.stringify({person,day:d,planned:r.planned===true,hours:r.declaredHours??r.rule?.declaredHours,status:norm(r.status)});
   if(seen.has(recordId)){
    if(seen.get(recordId)!==fingerprint)issues.push(recordId+' 加班申報內容不一致');
    continue;
   }
   seen.set(recordId,fingerprint);
   if(r.planned===true||/預排|待排|尚未申報/.test(norm(r.status))){planned++;continue}
   const value=Number(r.declaredHours??r.rule?.declaredHours);
   if(!Number.isFinite(value)||value<0||value>24){issues.push(recordId+' 時數待核');continue}
   hours+=value;count++;
  }
 }
 return issues.length?{ready:false,issues}:{ready:true,count,hours:Math.round(hours*100)/100,planned,issues:[]};
}
function attendanceRate({records=[],schedules=[],leaveRecords=[],employees=[],day}={}){
 if(!date(day)||date(day)!==day||![records,schedules,leaveRecords,employees].every(Array.isArray))
   return{ready:false,reason:'考勤資料格式或日期無效'};
 const active=employees.filter(e=>isWorking(e,day));
 const byEmp=new Map(),byAtt=new Map();
 active.forEach(e=>{
  if(id(e.empId))byEmp.set(id(e.empId),e);
  if(norm(e.attNo))byAtt.set(norm(e.attNo).replace(/^0+/,''),e);
 });
 // Do not assume the schedule is whole-company if any active employee lacks a row.
 const scheduleByEmp=new Map();
 for(const row of schedules){
  const key=id(row.empId||row.id);
  if(key&&byEmp.has(key)&&!scheduleByEmp.has(key))scheduleByEmp.set(key,row);
 }
 if(active.some(e=>!scheduleByEmp.has(id(e.empId))))
   return{ready:false,reason:'正式班表未包含所有授權範圍的在職人員'};
 const approved=new Set();
 for(const r of leaveRecords){
  if(norm(r.status)!=='已核准'||r.deleted||r.cancelled||r.canceled||r.revoked||r.deletedAt||r.cancelledAt||r.canceledAt)continue;
  const start=date(r.startDate||r.startTime),end=date(r.endDate||r.endTime)||start;
  if(!start||!end){return{ready:false,reason:'核准請假日期待核'}}
  if(start<=day&&day<=end){
   let taken;
   const daily=r.approvedDailyDays||r.dailyDays;
   if(daily&&typeof daily==='object'&&!Array.isArray(daily)){
    taken=Number(daily[day]??0);
    if(!Number.isFinite(taken)||taken<0||taken>1)return{ready:false,reason:'每日核准請假時數不完整'};
   }else{
    const days=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000+1;
    const total=Number(r.approvedDays??r.days??r.dayCount);
    if(!Number.isFinite(total)||total<=0||total>days)return{ready:false,reason:'核准請假天數尚未確認'};
    if(days>1&&total!==days)return{ready:false,reason:'跨日半日請假缺少每日明細'};
    taken=total/days;
   }
   if(taken===1)approved.add(id(r.empId||r.employeeId));
  }
 }
 const expected=new Set();
 for(const e of active){
  const row=scheduleByEmp.get(id(e.empId)),schedule=row?.schedule;
  if(!schedule||typeof schedule!=='object')return{ready:false,reason:'員工班別資料格式不完整'};
  const code=norm(schedule[day]);
  const duty=/^(早|中|晚)(班)?$/.test(code)||/^\d{1,2}:\d{2}\s*[-~～]\s*\d{1,2}:\d{2}$/.test(code);
  if(duty&&!approved.has(id(e.empId)))expected.add(id(e.empId));
 }
 const clocked=new Set();
 for(const r of records){
  const v=norm(r.type||r.action||r.status);
  if(!/上班|簽到|clock.?in|check.?in/i.test(v))continue;
  const recordDate=date(r.timeStr||r.datetime||r.dateTime||r.timestamp||r.attendanceTime||r.clockTime||r.date);
  if(recordDate!==day)continue;
  const e=byEmp.get(id(r.empId||r.employeeId))||byAtt.get(norm(r.attNo||r.attendanceNo).replace(/^0+/,''));
  if(e&&expected.has(id(e.empId)))clocked.add(id(e.empId));
 }
 if(!expected.size)return{ready:true,expected:0,clocked:0,percent:null,reason:'該日無應出勤人員'};
 return{ready:true,expected:expected.size,clocked:clocked.size,percent:Math.round(clocked.size/expected.size*1000)/10};
}
return{date,isWorking,isResigned,approvedLeaveCount,officialOvertime,attendanceRate};
});
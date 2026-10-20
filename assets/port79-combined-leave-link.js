(function(root){
'use strict';
// Read-only roster/leave linkage. Never infer a leave requester merely because
// someone in the same department is absent on the same date.
function resolve(input){
 const empId=String(input?.empId||'').trim().toUpperCase();
 const date=String(input?.date||'').replace(/\//g,'-').slice(0,10);
 const meta=input?.meta||{}, report=meta.overtimeReport||{};
 const assignments=Array.isArray(input?.assignments)?input.assignments:[];
 const leaves=Array.isArray(input?.leaveRecords)?input.leaveRecords:[];
 const employees=Array.isArray(input?.employees)?input.employees:[];
 const norm=x=>String(x||'').trim().toUpperCase();
 const iso=x=>String(x||'').replace(/\//g,'-').slice(0,10);
 const requester=x=>norm(x?.empId||x?.employeeId);
 const recordId=x=>String(x?.id||'').trim();
 const recordName=x=>String(x?.name||x?.employeeName||'').trim();
 const pending=[];
 for(const a of assignments){
  if(!a||date<iso(a.startDate)||date>iso(a.endDate))continue;
  if(!(Array.isArray(a.workerIds)&&a.workerIds.some(id=>norm(id)===empId)))continue;
  const targetId=norm(a.leaveEmpId);
  if(targetId)pending.push({targetId,leaveId:String(a.leaveId||'').trim(),source:'正式代班安排',start:iso(a.startDate),end:iso(a.endDate)});
 }
 const targetId=norm(meta.forEmpId||report.forEmpId),leaveId=String(report.leaveId||meta.leaveHandoffId||'').trim();
 if(targetId||leaveId){
  const matched=pending.find(item=>item.targetId===targetId&&(item.leaveId===leaveId||!leaveId||!item.leaveId));
  if(matched){if(!matched.leaveId)matched.leaveId=leaveId;}
  else pending.push({targetId,leaveId,source:'加班申報指定',start:date,end:date});
 }
 const linked=[];
 for(const item of pending){
  let targetId=item.targetId;
  const matchedById=item.leaveId?leaves.filter(l=>recordId(l)===item.leaveId&&String(l.status||'')==='已核准'):[];
  // A mismatched reference must never silently attribute someone else's leave.
  const conflict=matchedById.some(l=>targetId&&requester(l)&&requester(l)!==targetId);
  const candidates=conflict?[]:matchedById.length?matchedById:leaves.filter(l=>{
   if(String(l?.status||'')!=='已核准'||!targetId||requester(l)!==targetId)return false;
   const start=iso(l.startTime||l.startDate),end=iso(l.endTime||l.endDate);
   return Boolean(start&&end&&start<=item.end&&end>=item.start);
  });
  const record=candidates.length===1?candidates[0]:null;
  if(!targetId&&record)targetId=requester(record);
  const person=employees.find(e=>norm(e?.id||e?.empId)===targetId);
  const name=String(person?.name||recordName(record)||'').trim();
  let status='請假單尚未核對';
  if(conflict)status='請假單與代班對象不一致，待核對';
  else if(candidates.length>1)status='符合多筆請假單，待核對';
  else if(record)status='已核對核准請假單';
  const key=targetId+'|'+item.leaveId+'|'+item.source;
  if(linked.some(v=>v.key===key))continue;
  linked.push({key,targetId,name:name||'姓名未確認',source:item.source,status,
    leaveType:record?String(record.leaveType||record.type||record.category||'請假'):'',
    leaveStart:record?iso(record.startTime||record.startDate):'',
    leaveEnd:record?iso(record.endTime||record.endDate):'',
    coverStart:item.start,coverEnd:item.end});
 }
 const distinct=[...new Set(linked.map(x=>x.targetId).filter(Boolean))];
 return {links:linked,conflict:distinct.length>1||linked.some(x=>x.status.includes('不一致'))};
}
root.P79CombinedLeaveLink={resolve};
if(typeof module!=='undefined'&&module.exports)module.exports={resolve};
})(typeof window!=='undefined'?window:globalThis);

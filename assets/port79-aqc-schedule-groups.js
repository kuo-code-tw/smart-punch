/* Read-only monthly AQC group lookup, using the schedule page's __personnel rules. */
(function(root){
'use strict';
function createStore(normalizeName=v=>String(v||'').replace(/\s+/g,'')){
 const months=new Map();let owner='';
 function setOwner(value){const next=String(value||'');if(next!==owner){months.clear();owner=next;}return owner;}
 function apply(month,data){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||data?.ok!==true||!Array.isArray(data.employees)||!Array.isArray(data.schedules))throw Error('排班月份資料不完整');
  const byId=new Map(),overrides=new Map(),conflicts=new Set();
  data.schedules.filter(row=>String(row.month||'')===month).forEach(row=>{
   const id=String(row.empId||'').trim().toUpperCase();if(!id)return;
   const personnel=row.schedule?.__personnel||{};
   const value={role:String(personnel.role||row.role||'').trim(),group:String(personnel.group||row.group||'不分組').trim()};
   const previous=overrides.get(id);
   if(previous&&(previous.role!==value.role||previous.group!==value.group))conflicts.add(id);
   overrides.set(id,value);
  });
  for(const employee of data.employees){
   const id=String(employee.empId||employee.id||'').trim().toUpperCase();if(!id||id==='ADMIN')continue;
   const base={id,name:String(employee.name||'').trim(),role:String(employee.jobTitle||employee.deptDetail||employee.role||employee.dept||'AQC').trim(),group:String(employee.group||'不分組').trim()};
   const override=overrides.get(id),person=override?{...base,role:override.role||base.role,group:override.group||base.group}:base;
   const previous=byId.get(id);
   if(previous){
    if(normalizeName(previous.name)!==normalizeName(person.name)||previous.role!==person.role||previous.group!==person.group)conflicts.add(id);
    continue;
   }
   byId.set(id,person);
  }
  const byName=new Map();
  byId.forEach(person=>{const name=normalizeName(person.name);if(!name)return;if(!byName.has(name))byName.set(name,[]);byName.get(name).push(person);});
  months.set(month,{byId,byName,conflicts});return byId.size;
 }
 function lookup(month,person){
  const snapshot=months.get(month);if(!snapshot)return {group:'未取得排班組別',status:'unavailable'};
  const id=String(person?.empId||person?.id||'').trim().toUpperCase(),name=normalizeName(person?.name);
  let match=id?snapshot.byId.get(id):null;
  // Real employee IDs are authoritative; name fallback is only for name-only report records.
  if(!match&&(!id||id.startsWith('NAME:'))){const candidates=snapshot.byName.get(name)||[];if(candidates.length===1)match=candidates[0];else if(candidates.length>1)return {group:'姓名重複，待核對工號',status:'ambiguous'};}
  if(!match)return {group:'排班無此司機',status:'missing'};
  if(snapshot.conflicts.has(match.id))return {group:'排班分組重複，待核對',status:'conflict'};
  if(match.role.toUpperCase()!=='AQC')return {group:'排班非 AQC',status:'not-aqc'};
  return {group:match.group||'不分組',status:'ok',empId:match.id};
 }
 return {setOwner,apply,lookup,has:month=>months.has(month),invalidate:month=>months.delete(month),clear:()=>months.clear()};
}
const api={createStore};
if(typeof module==='object'&&module.exports)module.exports=api;else {root.P79AqcScheduleGroups=api;root.dispatchEvent?.(new Event('p79-aqc-schedule-groups-ready'));}
})(typeof window!=='undefined'?window:globalThis);

/* Read-only monthly AQC group lookup, using the schedule page's __personnel rules. */
(function(root){
'use strict';
function createStore(normalizeName=v=>String(v||'').replace(/\s+/g,'')){
 const months=new Map();let owner='';
 function setOwner(value){const next=String(value||'');if(next!==owner){months.clear();owner=next;}return owner;}
 function apply(month,data){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||data?.ok!==true||!Array.isArray(data.employees)||!Array.isArray(data.schedules))throw Error('排班月份資料不完整');
  const byId=new Map(),overrides=new Map(),conflicts=new Set(),aliases=new Map(),ambiguousAliases=new Set();
  const normId=v=>String(v||'').trim().toUpperCase();
  const employeeIds=e=>[e?.empId,e?.employeeId,e?.id,e?.['工號'],e?.attNo,e?.attendanceNo,e?.attendanceId,e?.['考勤號碼']].map(normId).filter(Boolean);
  data.schedules.filter(row=>{
   const rowMonth=String(row.month||row.schedule?.month||'');
   return rowMonth===month||(!rowMonth&&String(data.month||'')===month);
  }).forEach(row=>{
   const id=normId(row.empId||row.employeeId||row['工號']);if(!id)return;
   const personnel=row.schedule?.__personnel||{};
   const value={role:String(personnel.role||row.role||'').trim(),group:String(personnel.group||row.group||'不分組').trim()};
   const previous=overrides.get(id);
   if(previous&&(previous.role!==value.role||previous.group!==value.group))conflicts.add(id);
   overrides.set(id,value);
  });
  for(const employee of data.employees){
   const id=normId(employee.empId||employee.employeeId||employee.id||employee['工號']);if(!id||id==='ADMIN')continue;
   const base={id,name:String(employee.name||'').trim(),role:String(employee.jobTitle||employee.deptDetail||employee.role||employee.dept||'AQC').trim(),group:String(employee.group||'不分組').trim()};
   const override=overrides.get(id),person=override?{...base,role:override.role||base.role,group:override.group||base.group}:base;
   const previous=byId.get(id);
   if(previous){
    if(normalizeName(previous.name)!==normalizeName(person.name)||previous.role!==person.role||previous.group!==person.group)conflicts.add(id);
    continue;
   }
   byId.set(id,person);
  }
  // Employee master and attendance IDs can identify the same verified person.
  // Map only explicit aliases; never infer an identity from an unrelated name.
  for(const employee of data.employees){
   const id=normId(employee.empId||employee.employeeId||employee.id||employee['工號']);
   if(!id||!byId.has(id))continue;
   for(const alias of employeeIds(employee)){
    if(alias===id)continue;
    if((byId.has(alias)&&alias!==id)||(aliases.has(alias)&&aliases.get(alias)!==id)){
     ambiguousAliases.add(alias);aliases.delete(alias);
    }else if(!ambiguousAliases.has(alias))aliases.set(alias,id);
   }
  }
  const byName=new Map();
  byId.forEach(person=>{const name=normalizeName(person.name);if(!name)return;if(!byName.has(name))byName.set(name,[]);byName.get(name).push(person);});
  // Schedule rows remain searchable by their verified ID even when the employee
  // array returned by this monthly API omitted that row. This does NOT add them
  // to the current AQC personnel list (which still comes from HR).
  months.set(month,{byId,byName,overrides,aliases,ambiguousAliases,conflicts});return byId.size;
 }
 function lookup(month,person){
  const snapshot=months.get(month);if(!snapshot)return {group:'未取得排班組別',status:'unavailable'};
  const id=String(person?.empId||person?.employeeId||person?.id||'').trim().toUpperCase(),name=normalizeName(person?.name);
  const direct=id?snapshot.byId.get(id):null;
  if(id&&!direct&&snapshot.ambiguousAliases.has(id))return {group:'工號對應重複，待核對',status:'ambiguous'};
  const canonicalId=direct?id:(id?(snapshot.aliases.get(id)||id):'');
  let match=direct||(canonicalId?snapshot.byId.get(canonicalId):null);
  // A schedule assignment with an explicit AQC role can be used to label
  // historical work, even if this month's employee list omitted that ID.
  if(!match&&canonicalId&&snapshot.overrides.has(canonicalId)){
   const assignment=snapshot.overrides.get(canonicalId);
   if(assignment.role&&assignment.group)match={id:canonicalId,name:'',role:assignment.role,group:assignment.group};
  }
  // Name fallback is restricted to name-only report records. Never merge two
  // different real employee IDs just because their names happen to match.
  if(!match&&(!id||id.startsWith('NAME:'))){const candidates=snapshot.byName.get(name)||[];if(candidates.length===1)match=candidates[0];else if(candidates.length>1)return {group:'姓名重複，待核對工號',status:'ambiguous'};}
  if(!match)return {group:'排班身分／組別待核對',status:'missing'};
  if(snapshot.conflicts.has(match.id))return {group:'排班分組重複，待核對',status:'conflict'};
  const role=String(match.role||'').normalize('NFKC').trim().toUpperCase();
  if(!/^AQC(?:$|[\s(（／/・·:\-]|司機|操作|人員)/.test(role))return {group:'排班非 AQC',status:'not-aqc'};
  return {group:match.group||'不分組',status:'ok',empId:match.id};
 }
 return {setOwner,apply,lookup,personnel:month=>[...(months.get(month)?.byId.values()||[])].filter(p=>p.role.toUpperCase()==='AQC').map(p=>({empId:p.id,name:p.name,group:lookup(month,{empId:p.id}).group})),has:month=>months.has(month),invalidate:month=>months.delete(month),clear:()=>months.clear()};
}
const api={createStore};
if(typeof module==='object'&&module.exports)module.exports=api;else {root.P79AqcScheduleGroups=api;root.dispatchEvent?.(new Event('p79-aqc-schedule-groups-ready'));}
})(typeof window!=='undefined'?window:globalThis);

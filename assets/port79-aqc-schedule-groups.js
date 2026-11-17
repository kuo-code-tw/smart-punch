/* Read-only monthly AQC group lookup, using the schedule page's __personnel rules. */
(function(root){
'use strict';
function createStore(normalizeName=v=>String(v||'').replace(/\s+/g,'')){
 const months=new Map();let owner='';
 const meaningfulGroup=g=>{const v=String(g||'').trim();return !!v&&v!=='不分組'&&v!=='不輪班';};
 const aqcRole=value=>/^AQC(?:$|[\s(（／/・·:\-]|司機|操作|人員)/.test(String(value||'').normalize('NFKC').trim().toUpperCase());
 function isLiveEmployee(e){
  const state=String(e?.employmentStatus||e?.employeeStatus||e?.employment_status||e?.['在職狀態']||e?.['員工狀態']||e?.status||'').trim().normalize('NFKC').toLowerCase();
  if(/^(resigned|terminated|retired|inactive|quit|leave|loa|離職|已離職|退休|退職|資遣|解雇|解僱|留職停薪|留停)$/.test(state))return false;
  const terminated=String(e?.terminationDate||e?.lastWorkDate||'').trim().slice(0,10);
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});
  if(/^\d{4}-\d{2}-\d{2}$/.test(terminated)&&terminated<today)return false;
  return true;
 }
 // Match the schedule page: month-specific A-D group > most recent meaningful
 // previous-month schedule assignment > this month's stored default.
 // Explicit unassignment is a barrier; it must not be overwritten by history.
 function effectiveGroup(snapshot,id,baseGroup){
  const current=snapshot.overrides.get(id);
  const committed=ov=>ov&&(meaningfulGroup(ov.group)||ov.group==='不輪班'||ov.groupExplicit===true);
  if(committed(current))return {group:current.group||'不分組',terminal:true};
  const history=[...snapshot.history.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
  for(const [,overrides] of history){
   const prior=overrides.get(id);
   if(committed(prior))return {group:prior.group||'不分組',terminal:true};
  }
  return {group:String(current?.group||baseGroup||'不分組').trim()||'不分組',terminal:false};
 }
 function needsHistory(month){
  const snapshot=months.get(month);
  if(!snapshot)return false;
  return [...snapshot.byId.values()].some(person=>
   aqcRole(person.role)&&!meaningfulGroup(effectiveGroup(snapshot,person.id,person.baseGroup).group)&&
   !effectiveGroup(snapshot,person.id,person.baseGroup).terminal
  );
 }
 function applyHistory(month,priorMonth,data){
  const snapshot=months.get(month);
  if(!snapshot||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(priorMonth)||priorMonth>=month||
     data?.ok!==true||!Array.isArray(data.schedules)||
     (data.month&&String(data.month)!==priorMonth))
   throw Error('歷史排班月份資料不完整');
  const prior=new Map(),conflicts=new Set();
  for(const row of data.schedules){
   const rowMonth=String(row.month||data.month||'');
   if(rowMonth!==priorMonth)continue;
   const id=String(row.empId||row.employeeId||row['工號']||'').trim().toUpperCase();
   if(!id)continue;
   const personnel=row.schedule?.__personnel||{};
   const value={role:String(personnel.role||row.role||'').trim(),
    group:String(personnel.group||row.group||'不分組').trim()||'不分組',
    groupExplicit:personnel.groupExplicit===true};
   const old=prior.get(id);
   if(old&&(old.group!==value.group||old.role!==value.role||old.groupExplicit!==value.groupExplicit))
    conflicts.add(id);
   prior.set(id,value);
  }
  // An inconsistent historical month is never permitted to assign a group.
  for(const id of conflicts)prior.delete(id);
  snapshot.history.set(priorMonth,prior);
  return !needsHistory(month);
 }
 function setOwner(value){const next=String(value||'');if(next!==owner){months.clear();owner=next;}return owner;}
 function apply(month,data){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||data?.ok!==true||!Array.isArray(data.employees)||!Array.isArray(data.schedules)||(data.month&&String(data.month)!==month))throw Error('排班月份資料不完整');
  const byId=new Map(),overrides=new Map(),conflicts=new Set(),aliases=new Map(),ambiguousAliases=new Set();
  const normId=v=>String(v||'').trim().toUpperCase();
  const employeeIds=e=>[e?.empId,e?.employeeId,e?.id,e?.['工號'],e?.attNo,e?.attendanceNo,e?.attendanceId,e?.['考勤號碼']].map(normId).filter(Boolean);
  data.schedules.filter(row=>{
   const rowMonth=String(row.month||row.schedule?.month||'');
   return rowMonth===month||(!rowMonth&&String(data.month||'')===month);
  }).forEach(row=>{
   const id=normId(row.empId||row.employeeId||row['工號']);if(!id)return;
   const personnel=row.schedule?.__personnel||{};
   const value={role:String(personnel.role||row.role||'').trim(),group:String(personnel.group||row.group||'不分組').trim(),groupExplicit:personnel.groupExplicit===true};
   const previous=overrides.get(id);
   if(previous&&(previous.role!==value.role||previous.group!==value.group||previous.groupExplicit!==value.groupExplicit))conflicts.add(id);
   overrides.set(id,value);
  });
  for(const employee of data.employees){
   const id=normId(employee.empId||employee.employeeId||employee.id||employee['工號']);if(!id||id==='ADMIN')continue;
   const base={id,name:String(employee.name||'').trim(),role:String(employee.jobTitle||employee.deptDetail||employee.role||employee.dept||'AQC').trim(),group:String(employee.group||'不分組').trim(),active:isLiveEmployee(employee)};
   const override=overrides.get(id),person=override?{...base,role:override.role||base.role,group:override.group||base.group,baseGroup:base.group}:{...base,baseGroup:base.group};
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
  months.set(month,{byId,byName,overrides,aliases,ambiguousAliases,conflicts,history:new Map()});return byId.size;
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
  if(!aqcRole(match.role))return {group:'排班非 AQC',status:'not-aqc'};
  const resolved=effectiveGroup(snapshot,match.id,match.baseGroup||match.group);
  return {group:resolved.group,status:'ok',empId:match.id};
 }
 return {setOwner,apply,applyHistory,needsHistory,lookup,personnel:month=>[...(months.get(month)?.byId.values()||[])].filter(p=>p.active&&aqcRole(p.role)).map(p=>({empId:p.id,name:p.name,group:lookup(month,{empId:p.id}).group})),has:month=>months.has(month),invalidate:month=>months.delete(month),clear:()=>months.clear()};
}
const api={createStore};
if(typeof module==='object'&&module.exports)module.exports=api;else {root.P79AqcScheduleGroups=api;root.dispatchEvent?.(new Event('p79-aqc-schedule-groups-ready'));}
})(typeof window!=='undefined'?window:globalThis);

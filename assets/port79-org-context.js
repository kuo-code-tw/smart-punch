/* Shared organization view. Reads existing authorized rosters; never rewrites personnel or historical rows. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.Port79OrgContext=api;})(typeof window==='undefined'?null:window,function(){
'use strict';
const levels=[['headquarters','總公司'],['divisions','事業部'],['offices','事業處'],['sections','單位']];
const fields={headquarters:['headquarters','headquarter','headOffice'],divisions:['division','businessDivision','divisions'],offices:['office','businessOffice','offices'],sections:['section','orgUnit','sections','unit']};
const norm=v=>String(v??'').trim(),key=v=>norm(v).toUpperCase(),att=v=>norm(v).replace(/^0+/,'');
function value(e,kind){
 // Read the official four-level organization first. An explicit blank means
 // "not assigned" and must not resurrect a stale legacy unit/department.
 const person=e&&typeof e==='object'?e:{};
 const sources=[person,person.orgHierarchy,person.organization,person.orgPath]
   .filter(v=>v&&typeof v==='object'&&!Array.isArray(v));
 const official=kind==='sections'?fields.sections.filter(k=>k!=='unit'):(fields[kind]||[]);
 let explicitlyDefined=false;
 for(const source of sources)for(const field of official){
  if(!Object.prototype.hasOwnProperty.call(source,field))continue;
  explicitlyDefined=true;
  const result=typeof source[field]==='string'?norm(source[field]):'';
  if(result){
   // Values clearly identifying a parent organization are not units.
   if(kind==='sections'&&/(?:總公司|事業部|事業處)$/.test(result))continue;
   return result;
  }
 }
 if(explicitlyDefined)return '';
 if(kind==='sections'){
  // Read a legacy unit only when no official unit field was ever supplied.
  for(const source of sources){
   const legacyUnit=typeof source.unit==='string'?norm(source.unit):'';
   if(legacyUnit&&!/(?:總公司|事業部|事業處)$/.test(legacyUnit))return legacyUnit;
  }
  return '';
 }
 // A legacy department may only identify a parent if its full suffix is explicit.
 const legacy=norm(person.dept);
 return kind==='headquarters'&&/總公司$/.test(legacy)||kind==='divisions'&&/事業部$/.test(legacy)||kind==='offices'&&/事業處$/.test(legacy)?legacy:'';
}
function index(people){const ids=new Map(),numbers=new Map();for(const e of people||[]){const id=key(e.empId||e.employeeId||e.id);if(id)ids.set(id,ids.has(id)?null:e);const no=att(e.attNo||e.attendanceNo);if(no)numbers.set(no,numbers.has(no)?null:e)}return{ids,numbers};}
function resolve(row,lookup){row=row||{};const id=key(row.empId||row.employeeId);if(id)return lookup.ids.get(id)||null;const own=lookup.ids.get(key(row.id));if(own)return own;return lookup.numbers.get(att(row.attNo||row.attendanceNo))||null;}
function matches(row,selection,lookup){if(!levels.some(([k])=>selection?.[k]))return true;const person=resolve(row,lookup);if(!person)return false;return levels.every(([k])=>!selection[k]||value(person,k)===selection[k]);}
function organization(e){return Object.fromEntries(levels.map(([k])=>[k,value(e,k)]));}
// The hierarchy helpers remain shared by HR, scheduling, leave, efficiency and
// history, but the former full-width organization filter is no longer mounted.
// Retain a live authorized-roster lookup for dependent code such as history views.
function configure(config){
 const win=window,doc=document;
 const selection=Object.fromEntries(levels.map(([kind])=>[kind,'']));
 const getPeople=()=>{
  try{const rows=config.people?.();return Array.isArray(rows)?rows:[]}
  catch(e){return []}
 };
 let lookup=index([]);
 function sync(){lookup=index(getPeople())}
 const context={
  matches:row=>matches(row,selection,lookup),
  person:row=>resolve(row,lookup),
  value:(row,kind)=>value(resolve(row,lookup)||row,kind),
  filter:rows=>(rows||[]).filter(row=>matches(row,selection,lookup)),
  sync,
  selection:()=>({...selection}),
  organization:row=>organization(resolve(row,lookup)||row)
 };
 win.p79OrgScope=context;
 sync();
 // Follow roster refreshes without creating controls or mutating source records.
 const timer=setInterval(()=>{if(doc.visibilityState!=='hidden')sync()},1500);
 win.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 return context;
}
return{levels,fields,value,index,resolve,matches,organization,configure};
});

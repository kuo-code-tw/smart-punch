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
function configure(config){
 const win=window,doc=document,selection={},getPeople=()=>{const rows=config.people?.();return Array.isArray(rows)?rows:[]};let lookup=index([]),signature='',viewer='',bar;
 const esc=v=>norm(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function session(){try{const u=JSON.parse(sessionStorage.getItem('port79_user_session')||'null'),a=JSON.parse(sessionStorage.getItem('admin_session')||'null');if(u?.punchOnly||sessionStorage.getItem('port79_entry_mode')==='punch')return u;if(['admin','superadmin'].includes(norm(u?.adminRole||u?.role).toLowerCase()))return u;return sessionStorage.getItem('aqc_admin_logged_in')==='1'&&['admin','superadmin'].includes(norm(a?.adminRole||a?.role).toLowerCase())?a:u}catch(e){return null}}
 function permitted(){const s=session();return s&&!s.punchOnly&&['admin','superadmin'].includes(norm(s.adminRole||s.role).toLowerCase())}
 function render(){config.render?.();win.dispatchEvent(new CustomEvent('p79:org-filter',{detail:{system:config.system,selection:{...selection}}}));}
 function sync(){
  const s=session(),who=key(s?.empId)+'|'+String(sessionStorage.getItem('port79_user_token')||sessionStorage.getItem('port79_admin_token')||'');
  if(viewer!==who){viewer=who;for(const [k]of levels)selection[k]='';signature=''}
  if(!bar)return;
  bar.hidden=!permitted();if(bar.hidden)return;
  const people=getPeople();lookup=index(people);
  const next=JSON.stringify(people.map(e=>[key(e.empId||e.id),...levels.map(([k])=>value(e,k))]));if(next===signature)return;signature=next;
  levels.forEach(([kind,label],i)=>{
   const select=bar.querySelector('[data-org-level="'+kind+'"]');
   const pool=people.filter(e=>levels.slice(0,i).every(([parent])=>!selection[parent]||value(e,parent)===selection[parent]));
   const options=[...new Set(pool.map(e=>value(e,kind)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-Hant',{numeric:true}));
   if(selection[kind]&&!options.includes(selection[kind]))selection[kind]='';
   select.innerHTML='<option value="">全部'+label+'</option>'+options.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');select.value=selection[kind]||'';
  });
  const incomplete=people.filter(e=>levels.some(([k])=>!value(e,k))).length;
  bar.querySelector('[data-org-summary]').textContent=(config.historical?'依歷史快照歸屬':'依人資主檔歸屬')+'｜'+people.length+' 位授權人員｜符合篩選 '+people.filter(e=>matches(e,selection,lookup)).length+' 位'+(incomplete?'｜'+incomplete+' 位組織層級未完整設定':'');
 }
 function mount(){
  if(bar)return;const host=config.container?.()||doc.querySelector('main');if(!host)return;
  bar=doc.createElement('section');bar.id='p79OrganizationScope';bar.className='p79-org-scope';bar.setAttribute('aria-label','四層組織篩選');
  bar.innerHTML='<div class="p79-org-controls">'+levels.map(([k,label])=>'<label>'+label+'<select data-org-level="'+k+'" aria-label="組織篩選：'+label+'"><option value="">全部'+label+'</option></select></label>').join('')+'<button type="button" data-org-clear>清除篩選</button></div><div data-org-summary class="p79-org-note"></div>';
  host.prepend(bar);
  bar.querySelectorAll('[data-org-level]').forEach(el=>el.addEventListener('change',()=>{const at=levels.findIndex(([k])=>k===el.dataset.orgLevel);selection[el.dataset.orgLevel]=el.value;levels.slice(at+1).forEach(([k])=>selection[k]='');signature='';sync();render()}));
  bar.querySelector('[data-org-clear]').addEventListener('click',()=>{for(const[k]of levels)selection[k]='';signature='';sync();render()});sync();
 }
 const context={matches:row=>matches(row,selection,lookup),person:row=>resolve(row,lookup),value:(row,k)=>value(resolve(row,lookup)||row,k),filter:rows=>(rows||[]).filter(row=>matches(row,selection,lookup)),sync,selection:()=>({...selection}),organization:row=>organization(resolve(row,lookup)||row)};
 win.p79OrgScope=context;
 if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
 const timer=setInterval(()=>{if(doc.visibilityState!=='hidden')sync()},1500);win.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 return context;
}
return{levels,fields,value,index,resolve,matches,organization,configure};
});

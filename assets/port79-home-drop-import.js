/* PORT79 homepage import navigation.
 * Home only opens the existing authenticated management system.
 * It does not parse, upload, save, or host any Excel importer.
 */
(function(w){
'use strict';
const d=w.document;
const root=d?.getElementById('p79HomeDropImport');
if(!root)return;
function canUse(){
 let s;
 try{s=JSON.parse(w.sessionStorage.getItem('port79_user_session')||'null');}catch(_){return false;}
 const role=String(s?.adminRole||s?.role||'').toLowerCase();
 const token=String(w.sessionStorage.getItem('port79_user_token')||
   w.sessionStorage.getItem('port79_admin_token')||
   w.sessionStorage.getItem('port79_gc_superadmin_token')||'').trim();
 return !!s&&!s.punchOnly&&role==='superadmin'&&!!token;
}
function refresh(){root.hidden=!canUse();}
function navigate(kind){
 if(!canUse())return;
 // Vessel and Yard already have the homepage's permission-aware navigation.
 // Reuse that exact route/SSO flow; no separate homepage importer.
 if(kind==='vessel'&&typeof w.launchSystem==='function'){
  w.launchSystem('efficiency');return;
 }
 if(kind==='yard'&&typeof w.launchSystem==='function'){
  w.launchSystem('yard');return;
 }
 const path=kind==='gate'?'./gate-import/':
   kind==='yard'?'./yard-dashboard/':
   kind==='vessel'?'./aqc-efficiency/':null;
 if(!path)return;
 if(typeof w.p79NavigateWhileBackingUp==='function')
  w.p79NavigateWhileBackingUp(path);
 else w.location.assign(path);
}
root.querySelectorAll('[data-p79-drop-kind]').forEach(zone=>{
 const kind=zone.dataset.p79DropKind;
 zone.addEventListener('click',()=>navigate(kind));
 zone.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===' '){e.preventDefault();navigate(kind);}
 });
 // Never accept the file on the homepage. Prevent the browser from opening a
 // dropped Excel as a page; users choose their file in the real import screen.
 zone.addEventListener('dragover',e=>{e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='none';});
 zone.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();navigate(kind);});
});
w.Port79HomeDropImport={refresh,canUse};
refresh();
})(window);

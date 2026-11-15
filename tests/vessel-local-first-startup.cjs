'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
function fn(name){const a=html.indexOf('function '+name+'('),b=html.indexOf('\n}',a);assert(a>=0&&b>a,name);return html.slice(a,b+2);}
const session={empId:'FIXTURE',adminRole:'superadmin'},store=new Map(),calls=[];
const receipt={empId:'FIXTURE',token:'fixture-token',at:Date.now()};
store.set('p79_efficiency_verified_preview',JSON.stringify(receipt));store.set('port79_user_session',JSON.stringify(session));
const c={Date,JSON,String,Number,URLSearchParams,location:{search:''},p79EfficiencyLocalPreview:false,p79EfficiencyAuthReady:false,sessionStorage:{getItem:k=>store.get(k)||null},getHomeAdminSession:()=>session,currentPort79SsoToken:()=> 'fixture-token',efficiencyPermissionFromData:d=>d.adminRole==='superadmin'?'manage':'none',normalizeEfficiencyPermissionLevel:v=>v,loadGcSession:()=>{calls.push('session');return 'fixture-token';},loadLocal:()=>calls.push('local'),hasLocalVesselData:()=>true,updateLatestVesselSummaryFromMasters:()=>calls.push('summary'),renderVesselSummary(){},invalidateWorkloadIndex(){},renderEfficiencyTabFast:()=>calls.push('paint'),cloudStatus:()=>calls.push('status')};
vm.createContext(c);for(const name of ['p79CanPreviewEfficiencyLocal','p79ShowVerifiedLocalPreview','canManageEfficiency'])vm.runInContext(fn(name),c);
assert(c.p79ShowVerifiedLocalPreview());assert(calls.indexOf('local')<calls.indexOf('paint'));assert.equal(c.canManageEfficiency(),false,'local preview cannot authorize writes');
c.p79EfficiencyAuthReady=true;assert.equal(c.canManageEfficiency(),true,'fresh remote verification restores original management permission');
c.location.search='?homeImport=1';assert.equal(c.p79CanPreviewEfficiencyLocal(),false,'embedded importer must retain full preflight');c.location.search='';
for(const changes of [{token:'other'},{empId:'OTHER'},{at:Date.now()-31*60*1000},{at:Date.now()+60000}]){
 store.set('p79_efficiency_verified_preview',JSON.stringify({...receipt,...changes}));assert.equal(c.p79CanPreviewEfficiencyLocal(),false,'mismatched or expired receipts cannot preview');
}
store.set('p79_efficiency_verified_preview',JSON.stringify(receipt));store.set('port79_user_session',JSON.stringify({...session,empId:'OTHER'}));assert.equal(c.p79CanPreviewEfficiencyLocal(),false,'account switching cannot reveal prior account data');
const boot=html.slice(html.indexOf("document.addEventListener('DOMContentLoaded',async()=>{\n  // Only a same-account"));assert(boot.indexOf('p79ShowVerifiedLocalPreview();')<boot.indexOf('await consumePort79SsoHandoff();'),'local paint must precede network verification');
const init=html.slice(html.indexOf('async function initGcPage(){'));assert(init.indexOf("renderEfficiencyTabFast('dashboard');")<init.indexOf('await window.Port79DataCache'),'local paint precedes IndexedDB snapshot wait');
console.log('PASS vessel local-first: local paint before network/cache waits, same-account token-bound receipts, expiry, import preflight and write gate');

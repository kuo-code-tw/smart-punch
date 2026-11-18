/* 同源公開目錄自動補全航線；不修改 WORKING SHEET、雲端或船舶統計。 */
(function(root){
'use strict';
if(!root)return;
const CACHE='port79_route_names_verified_v1',DAY=24*60*60*1000;
const validCode=code=>/^[A-Z0-9]{2,8}$/.test(String(code||''));
const names=Object.create(null),unresolved=Object.create(null);
let checkedAt=0,loading=null,loaded=false;
function apply(data){
 if(!data||data.schema_version!==1||!data.routes||typeof data.routes!=='object')return false;
 let changed=false;
 for(const [key,record] of Object.entries(data.routes)){
  const code=String(key||'').trim().toUpperCase();
  const zh=String(record?.zh||'').trim();
  if(!validCode(code)||zh.length<2||zh.length>90||!/[\u3400-\u9fff]/.test(zh)||/[<>]/.test(zh))continue;
  if(names[code]!==zh){names[code]=zh;changed=true;}
 }
 for(const [key,record] of Object.entries(data.unresolved||{})){
  const code=String(key||'').trim().toUpperCase();
  const en=String(record?.english||'').trim();
  if(validCode(code)&&en.length>2&&en.length<100&&/^[A-Za-z0-9 .,&\/-]+$/.test(en))
    unresolved[code]=en;
 }
 return changed;
}
try{
 const saved=JSON.parse(root.localStorage?.getItem(CACHE)||'null');
 if(saved&&typeof saved.at==='number'&&saved.data){apply(saved.data);checkedAt=saved.at;}
}catch(_){}
function lookup(code){const key=String(code||'').trim().toUpperCase();return validCode(key)?(names[key]||''):'';}
function english(code){const key=String(code||'').trim().toUpperCase();return validCode(key)?(unresolved[key]||''):'';}
function ensure(force=false){
 const now=Date.now();
 if(loading)return loading;
 if(!force&&checkedAt&&now-checkedAt<DAY)return Promise.resolve(false);
 if(typeof root.fetch!=='function')return Promise.resolve(false);
 checkedAt=now;
 loading=Promise.resolve().then(()=>root.fetch('../data-sources/route-service-names.json?day='+new Date().toISOString().slice(0,10),{cache:'no-cache',credentials:'same-origin'}))
  .then(response=>{if(!response?.ok)throw Error('航線名稱目錄暫不可用');return response.json()})
  .then(data=>{
    if(!data||data.schema_version!==1)throw Error('航線目錄格式不正確');
    const changed=apply(data);
    loaded=true;
    try{root.localStorage?.setItem(CACHE,JSON.stringify({at:Date.now(),data}));}catch(_){}
    if(changed&&typeof root.dispatchEvent==='function'&&typeof root.Event==='function')
      root.dispatchEvent(new root.Event('p79-route-name-updated'));
    return changed;
  }).catch(error=>{console.warn('航線中文目錄本次更新未完成，保留已確認名稱',error);return false})
  .finally(()=>{loading=null;});
 return loading;
}
root.P79RouteNameAuto={lookup,english,ensure,isLoaded:()=>loaded,_apply:apply};
})(typeof window!=='undefined'?window:globalThis);

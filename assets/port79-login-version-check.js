/* Public, read-only version check displayed at login; no private data or blocking. */
(function(root){
'use strict';
const LOCAL='./port79-version.json';
const WEB='https://kuo-code-tw.github.io/smart-punch/port79-version.json';
const LATEST='https://api.github.com/repos/kuo-code-tw/smart-punch/releases/latest';
const INTERVAL=300000,EXPIRE=6000;
const $=id=>root.document?.getElementById(id);
let busy=false,lastChecked=0;
function normalized(v){
 const version=String(v?.version||'').trim(),commit=String(v?.commit||'').trim();
 if(!/^V\d{6}\.\d{5}$/.test(version)||!/^[a-f0-9]{40}$/.test(commit))return null;
 const expected=(Number.parseInt(commit.slice(0,8),16)%100000).toString().padStart(5,'0');
 if(!version.endsWith('.'+expected))return null;
 return {version,commit};
}
function releaseVersion(release){
 const m=/^port79-windows-lite-(\d{4})(\d{2})(\d{2})-([a-f0-9]{12})$/.exec(String(release?.tag_name||''));
 if(!m||release.draft)return '';
 return 'V'+m[1].slice(2)+m[2]+m[3]+'.'+(Number.parseInt(m[4].slice(0,8),16)%100000).toString().padStart(5,'0');
}
async function read(url){
 const controller=new AbortController(),timer=root.setTimeout(()=>controller.abort(),EXPIRE);
 try{
  const res=await root.fetch(url+(url.includes('?')?'&':'?')+'_='+Date.now(),{
   method:'GET',cache:'no-store',credentials:'omit',signal:controller.signal,
   headers:{Accept:'application/json'}
  });
  if(!res.ok)throw Error('HTTP '+res.status);
  return await res.json();
 }finally{root.clearTimeout(timer);}
}
function write(message){
 const el=$('p79LoginVersionStatus');
 if(el)el.textContent=message;
}
function compactStatus(native,localVersion,web,release,time){
 const version=localVersion||'版本待核';
 let state='更新待核';
 if(native){
  if(release&&localVersion)state=release===localVersion?'已是最新版':'有新版';
 }else if(web&&localVersion){
  state=web.version===localVersion?'已是最新版':'有新版';
 }
 return '🔎 '+version+'｜'+state+'｜'+time;
}
function isNative(){
 try{return new URL(root.location.href).searchParams.has('windowsBundle');}
 catch(_){return false;}
}
async function check(force=false){
 if(busy||!force&&Date.now()-lastChecked<60000)return;
 busy=true;lastChecked=Date.now();
 write('🔎 正在檢查更新…');
 const [localResult,webResult,releaseResult]=await Promise.allSettled([
  read(LOCAL),read(WEB),read(LATEST)
 ]);
 const local=localResult.status==='fulfilled'?normalized(localResult.value):null;
 const web=webResult.status==='fulfilled'?normalized(webResult.value):null;
 const release=releaseResult.status==='fulfilled'?releaseVersion(releaseResult.value):'';
 const native=isNative();
 const installedFromUrl=(()=>{
  try{return new URL(root.location.href).searchParams.get('windowsBundle')||'';}catch(_){return '';}
 })();
 const localVersion=local?.version||
  (/^V\d{6}\.\d{5}$/.test(installedFromUrl)?installedFromUrl:'');
 if(localVersion&&typeof root.p79ApplyBuildVersion==='function')
  root.p79ApplyBuildVersion(localVersion);
 const label=$('p79MainVersion');
 if(label)label.textContent=(native?'Windows 本機版：':'網頁版：')+(localVersion||'版本尚未驗證');
 const time=new Intl.DateTimeFormat('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Taipei'}).format(new Date());
 const brief=compactStatus(native,localVersion,web,release,time);
 const details=[
  (native?'本機':'目前網站')+'：'+(localVersion||'未驗證'),
  '線上網站：'+(web?.version||'未核對'),
  'Windows 最新發布：'+(release||'未核對'),
  '檢查時間：'+time
 ].join('｜');
 const field=$('p79LoginVersionStatus');
 if(field)field.title=details;
 write(brief);
 busy=false;
 return {local,web,release};
}
function init(){
 if(!$('p79LoginVersionStatus'))return;
 $('p79LoginCheckNow')?.addEventListener('click',()=>void check(true));
 root.addEventListener('pageshow',()=>void check(true));
 root.document.addEventListener('visibilitychange',()=>{
  if(!root.document.hidden)void check();
 });
 root.setInterval(()=>{
  if(!root.document.hidden&&!$('sessionBar')?.classList.contains('show'))void check();
 },INTERVAL);
 void check(true);
}
if(root.document?.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
if(typeof module==='object'&&module.exports)module.exports={normalized,releaseVersion,compactStatus,check};
})(typeof window!=='undefined'?window:globalThis);

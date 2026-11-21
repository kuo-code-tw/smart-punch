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
function isNative(){
 try{return new URL(root.location.href).searchParams.has('windowsBundle');}
 catch(_){return false;}
}
async function check(force=false){
 if(busy||!force&&Date.now()-lastChecked<60000)return;
 busy=true;lastChecked=Date.now();
 write('🔎 正在檢查網站與 Windows 正式版本…（不影響登入）');
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
 const parts=[];
 if(native){
  parts.push('本機：'+(localVersion||'未取得版本'));
  if(web)parts.push('網站：'+web.version);
  if(release)parts.push('Windows 最新發布：'+release);
  if(release&&localVersion&&release!==localVersion)
   parts.push('已偵測到不同版本；Windows 會檢查更新，安裝完成後版本才會一致');
  else if(release&&localVersion===release)parts.push('Windows 已符合最新正式發布版');
 }else{
  parts.push('目前網站：'+(localVersion||'尚未驗證'));
  if(web&&local&&web.commit!==local.commit)
   parts.push('網站有新版本可重新載入');
  if(release)parts.push('Windows 下載版：'+release);
  if(web&&release&&web.version!==release)
   parts.push('網頁及 Windows 發布時間不同，版本號可能暫時不一樣');
 }
 if(!local&&!web&&!release)parts.push('更新來源暫時無法連線，仍可正常登入');
 const time=new Intl.DateTimeFormat('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Taipei'}).format(new Date());
 write('🔎 '+parts.join('｜')+'｜檢查 '+time);
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
if(typeof module==='object'&&module.exports)module.exports={normalized,releaseVersion,check};
})(typeof window!=='undefined'?window:globalThis);

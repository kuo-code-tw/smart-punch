/* Homepage version check plus safe auto-refresh and native Windows update handoff. */
(function(root){
'use strict';
const LOCAL='./port79-version.json';
const WEB='https://kuo-code-tw.github.io/smart-punch/port79-version.json';
const LATEST='https://api.github.com/repos/kuo-code-tw/smart-punch/releases/latest';
const INTERVAL=300000,EXPIRE=6000,STORED_BUILD='p79_loaded_home_build_v1';
const $=id=>root.document?.getElementById(id);
let lastChecked=0,activeCheck=null,lastResult=null,nativeUpdateRunning=false;
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
function nativeBridge(){
 return isNative()&&typeof root.chrome?.webview?.postMessage==='function';
}
// A browser session remembers the build it first displayed, rather than
// comparing two URLs that point to the same newly-published manifest.
function browserLoadedBuild(published){
 if(!published)return '';
 try{
  const url=new URL(root.location.href);
  const refreshed=url.searchParams.get('_homeUpdated');
  if(refreshed===published){
   root.sessionStorage?.setItem(STORED_BUILD,published);
   return published;
  }
  const prior=root.sessionStorage?.getItem(STORED_BUILD);
  if(prior)return prior;
  root.sessionStorage?.setItem(STORED_BUILD,published);
 }catch(_){}
 return published;
}
function homepageBusy(){
 if(root.document?.hidden||$('sessionBar')?.classList?.contains('show'))return true;
 const focused=root.document?.activeElement;
 return !!focused&&(/^(INPUT|TEXTAREA|SELECT)$/.test(String(focused.tagName||''))||
  focused.isContentEditable===true);
}
function refreshBrowser(version,force=false){
 if(isNative()||!/^V\d{6}\.\d{5}$/.test(String(version||'')))return false;
 if(!force&&homepageBusy())return false;
 try{
  const url=new URL(root.location.href);
  if(!force&&url.searchParams.get('_homeUpdated')===version)return false;
  url.searchParams.set('_homeUpdated',version);
  url.searchParams.set('_updateAt',String(Date.now()));
  write('🔄 正在更新79號碼頭網頁版…');
  root.location.replace(url.href);
  return true;
 }catch(_){return false;}
}
async function check(force=false){
 if(activeCheck)return activeCheck;
 if(!force&&Date.now()-lastChecked<60000)return lastResult;
 lastChecked=Date.now();
 const work=(async()=>{
  if(!nativeUpdateRunning)write('🔎 正在檢查更新…');
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
  const pageVersion=native?localVersion:browserLoadedBuild(localVersion);
  if(pageVersion&&typeof root.p79ApplyBuildVersion==='function')
   root.p79ApplyBuildVersion(pageVersion);
  const label=$('p79MainVersion');
  if(label)label.textContent=(native?'79號碼頭電腦版：':'79號碼頭網頁版：')+(pageVersion||'版本尚未驗證');
  const time=new Intl.DateTimeFormat('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Taipei'}).format(new Date());
  const brief=compactStatus(native,pageVersion,web,release,time);
  const details=[
   (native?'本機':'目前網站')+'：'+(pageVersion||'未驗證'),
   '線上網站：'+(web?.version||'未核對'),
   '79號碼頭電腦版最新發布：'+(release||'未核對'),
   '檢查時間：'+time
  ].join('｜');
  const field=$('p79LoginVersionStatus');
  if(field)field.title=details;
  if(!nativeUpdateRunning)write(brief);
  const result={local,web,release,pageVersion};
  lastResult=result;
  // Never interrupt a signed-in dashboard, password entry or an open editor.
  if(!native&&web&&pageVersion&&web.version!==pageVersion){
   if(homepageBusy())write('🔄 79號碼頭網頁版有更新｜閒置時自動更新｜'+time);
   else refreshBrowser(web.version);
  }
  return result;
 })();
 activeCheck=work;
 try{return await work;}finally{activeCheck=null;}
}
async function startUpdate(){
 if(nativeBridge()){
  try{
   nativeUpdateRunning=true;
   write('🔄 正在下載並更新79號碼頭電腦版…');
   root.chrome.webview.postMessage(JSON.stringify({
    kind:'port79-system-update-command-v1',action:'install'
   }));
  }catch(_){
   nativeUpdateRunning=false;
   write('⚠ 無法啟動79號碼頭電腦版更新，請使用系統匣的「檢查79號碼頭電腦版更新」');
  }
  return;
 }
 const result=await check(true);
 if(!result?.web?.version){
  write('⚠ 暫時無法核對79號碼頭網頁版最新版本');
  return;
 }
 if(!refreshBrowser(result.web.version,true))write('⚠ 79號碼頭網頁版更新未啟動，請稍後再試');
}
function init(){
 if(!$('p79LoginVersionStatus'))return;
 const button=$('p79LoginCheckNow');
 if(button){
  button.textContent=nativeBridge()?'更新電腦版':'更新網頁版';
  button.title=nativeBridge()?'下載、驗證並安裝79號碼頭電腦版與網頁版更新，保留本機資料':'將79號碼頭網頁版更新為最新正式版本';
  button.addEventListener('click',()=>void startUpdate());
 }
 root.addEventListener('port79-system-update-status',event=>{
  if(!isNative())return;
  const message=String(event?.detail?.message||'').trim().slice(0,160);
  if(!message)return;
  nativeUpdateRunning=!/已是|未完成|失敗|等待下次|保持不變/.test(message);
  write((nativeUpdateRunning?'🔄 ':'ℹ️ ')+message);
 });
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
if(typeof module==='object'&&module.exports)module.exports={
 normalized,releaseVersion,compactStatus,check,startUpdate,refreshBrowser,browserLoadedBuild,homepageBusy
};
})(typeof window!=='undefined'?window:globalThis);

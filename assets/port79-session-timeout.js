/* PORT79 | Shared inactive-session logout and HR security settings | 2026-11-11 */
(function(){
'use strict';
if(window.Port79IdleLogout) return;
const DEFAULT_MINUTES=5, MIN=1, MAX=120;
const REQUEST_TIMEOUT_MS=60000;
const BUSY_RETRY_DELAYS_MS=[700,1500,3000,5000];
function isCloudBusy(error){
 const message=String(error?.message||error||'');
 return /雲端目前正在(?:寫入資料|處理其他資料)|(?:資料鎖|寫入鎖).*(?:忙碌|占用|佔用)|(?:LOCK_BUSY|WRITE_LOCK_BUSY|ORG_CONFIG_BUSY)/i.test(message);
}
function waitForCloud(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
let saving=false;
const CONFIG_FIELD='p79_hr_idle_logout_minutes_v1';
const CACHE_KEY='port79_idle_logout_config_v1';
const ACTIVITY_KEY='port79_idle_last_activity_v1';
const FINGERPRINT_KEY='port79_idle_login_fingerprint_v1';
const GAS_FALLBACK='https://script.google.com/macros/s/AKfycbzPD0v8QQol_7cMuMUFGnjHxo-9jFnRLEwoWQhW-n3g5GlbbHnaL7EhRAtcymUcdYOEzg/exec';
const scriptUrl=document.currentScript?.src || new URL('assets/port79-session-timeout.js',location.href).href;
const HOME=new URL('../',scriptUrl).href;
const isHome=(new URL(HOME).pathname.replace(/\/+$/,'/')===location.pathname.replace(/\/+$/,'/')) || location.pathname.endsWith('/index.html')&&!location.pathname.includes('/hr/')&&location.pathname===new URL('index.html',HOME).pathname;
const isHr=/\/hr\/(?:index\.html)?$/i.test(location.pathname);
const AUTH_KEYS=[
 'port79_user_session','port79_user_token','port79_admin_token','port79_gc_token','port79_gc_superadmin_token',
 'admin_session','aqc_admin_logged_in','aqc_admin_id','aqc_admin_role','aqc_admin_name','aqc_admin_active_tab',
 'port79_sso_verified','port79_home_emp_id','port79_leave_emp_id','port79_entry_mode','p79_workhours_permission'
];
let minutes=DEFAULT_MINUTES, fetching=false, lastFetch=0, observedFingerprint='', expiring=false, lastEventWrite=0;
function number(v){const n=Number(v?.minutes??v);return Number.isInteger(n)&&n>=MIN&&n<=MAX?n:null;}
function readCache(){
 try{const value=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');const n=number(value);if(n!==null)minutes=n;}catch(e){}
}
function remember(n){if(number(n)===null)return;minutes=n;try{localStorage.setItem(CACHE_KEY,JSON.stringify({minutes:n,updatedAt:Date.now()}));}catch(e){} refreshPreview();}
function getToken(){
 try{return String(sessionStorage.getItem('port79_user_token')||sessionStorage.getItem('port79_admin_token')||
 sessionStorage.getItem('port79_gc_superadmin_token')||sessionStorage.getItem('port79_gc_token')||'').trim();}catch(e){return '';}
}
function getSession(){
 try{return JSON.parse(sessionStorage.getItem('port79_user_session')||sessionStorage.getItem('admin_session')||'null');}catch(e){return null;}
}
function fingerprint(){
 const token=getToken(),s=getSession();
 if(!token&&!s)return '';
 const identity=token||[s?.empId,s?.loginAt,s?.adminRole,s?.punchOnly].join('|');
 let hash=2166136261;
 for(let i=0;i<identity.length;i++){hash^=identity.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return (hash>>>0).toString(36)+':'+String(s?.empId||'');
}
function timestamp(){try{return Number(sessionStorage.getItem(ACTIVITY_KEY)||0);}catch(e){return 0;}}
function setTimestamp(t){try{sessionStorage.setItem(ACTIVITY_KEY,String(t));}catch(e){}}
function observeLogin(){
 const next=fingerprint();
 if(!next){observedFingerprint='';return false;}
 if(observedFingerprint!==next){
  observedFingerprint=next;
  let previous='';try{previous=sessionStorage.getItem(FINGERPRINT_KEY)||'';}catch(e){}
  if(previous!==next){try{sessionStorage.setItem(FINGERPRINT_KEY,next);}catch(e){}setTimestamp(Date.now());}
  else if(!timestamp())setTimestamp(Date.now());
 }
 return true;
}
function activity(event){
 if(expiring||!observeLogin())return;
 if(event?.isTrusted===false)return;
 const now=Date.now();
 if(now-lastEventWrite<750)return;
 lastEventWrite=now;setTimestamp(now);
}
function getGas(){
 const raw=String(sessionStorage.getItem('port79_gas_url')||GAS_FALLBACK).trim();
 try{const url=new URL(raw);return url.origin==='https://script.google.com'&&/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)?url.href:GAS_FALLBACK;}catch(e){return GAS_FALLBACK;}
}
async function request(url,options={},timeoutMs=REQUEST_TIMEOUT_MS){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const res=await fetch(url,{cache:'no-store',redirect:'follow',...options,signal:controller.signal});
  if(!res.ok)throw new Error('網路服務異常（'+res.status+'）');
  const data=await res.json();
  if(!data?.ok)throw new Error(data?.error||'雲端設定讀取失敗');
  return data;
 }catch(e){
  if(controller.signal.aborted||e?.name==='AbortError'||e instanceof TypeError){
   const error=new Error(controller.signal.aborted?'雲端連線逾時（'+Math.round(timeoutMs/1000)+' 秒）':'雲端連線中斷，請檢查網路');
   error.uncertain=true;throw error;
  }
  throw e;
 }finally{clearTimeout(timer);}
}
async function readCloud({maxBusyRetries=BUSY_RETRY_DELAYS_MS.length,timeoutMs=REQUEST_TIMEOUT_MS}={}){
 const token=getToken();if(!token)throw new Error('登入憑證不存在，請重新登入');
 const url=getGas(),query=url+'?action=getData&token='+encodeURIComponent(token)+'&t='+Date.now();
 let data;
 for(let attempt=0;attempt<=maxBusyRetries;attempt++){
  try{data=await request(query,{},timeoutMs);break;}
  catch(e){
   const busy=isCloudBusy(e);
   if((!busy&&!e.uncertain)||attempt>=(busy?maxBusyRetries:1))throw e;
   if(busy)await waitForCloud(BUSY_RETRY_DELAYS_MS[attempt]);
  }
 }
 if(!data.config||typeof data.config!=='object')throw new Error('雲端共用設定格式不完整');
 return data.config;
}
async function syncCloud(force=false){
 if(saving||fetching||!observeLogin())return;
 if(!force&&Date.now()-lastFetch<110000)return;
 fetching=true;lastFetch=Date.now();
 try{
  const cfg=await readCloud(),found=cfg[CONFIG_FIELD];
  const n=number(found);
  if(found!==undefined&&n===null)throw new Error('雲端登出時間格式錯誤');
  if(saving)return;
  remember(n??DEFAULT_MINUTES);
  setStatus('雲端設定已同步',false);
 }catch(e){if(!saving)setStatus('使用上次設定；雲端同步待確認',false);console.warn('自動登出設定同步未完成：',e);}
 finally{fetching=false;}
}
function role(){
 const s=getSession()||{};
 return String(s.adminRole||s.role||s.actualAdminRole||sessionStorage.getItem('aqc_admin_role')||'').toLowerCase();
}
function canManage(){return role()==='superadmin';}
function clearIdentity(){
 AUTH_KEYS.forEach(k=>{try{sessionStorage.removeItem(k);}catch(e){}try{localStorage.removeItem(k);}catch(e){}});
 try{sessionStorage.removeItem(ACTIVITY_KEY);sessionStorage.removeItem(FINGERPRINT_KEY);sessionStorage.setItem('port79_idle_expired_notice','1');}catch(e){}
}
function expire(){
 if(expiring||!fingerprint())return;
 expiring=true;clearIdentity();
 location.replace(HOME+'?logout=1&idle=1&t='+Date.now());
}
function tick(){
 if(!observeLogin())return;
 const last=timestamp();
 if(last&&Date.now()-last>=minutes*60000)expire();
}
function makeUI(){
 if(!isHr||document.getElementById('p79IdleSettingsDialog'))return;
 const dialog=document.createElement('dialog');dialog.id='p79IdleSettingsDialog';dialog.setAttribute('aria-label','自動登出時間設定');
 dialog.innerHTML="<form method=\"dialog\" class=\"p79-idle-form\">\n  <div class=\"p79-idle-title\">\n    <span class=\"p79-idle-lock\" aria-hidden=\"true\">🔒</span>\n    <div class=\"p79-idle-heading\"><h2>閒置自動登出</h2><p>人資管理 › 功能選單 › 系統與安全</p></div>\n    <button type=\"submit\" class=\"p79-idle-close\" aria-label=\"關閉\">×</button>\n  </div>\n  <div class=\"p79-idle-body\">\n    <div class=\"p79-idle-control\">\n      <label for=\"p79IdleMinutes\"><span class=\"p79-idle-clock\" aria-hidden=\"true\">◷</span>閒置登出時間</label>\n      <div class=\"p79-idle-field\">\n        <select id=\"p79IdleMinutes\"><option value=\"5\">5 分鐘（預設）</option><option value=\"10\">10 分鐘</option><option value=\"15\">15 分鐘</option><option value=\"20\">20 分鐘</option><option value=\"30\">30 分鐘</option><option value=\"60\">60 分鐘</option><option value=\"120\">120 分鐘</option><option value=\"custom\">自訂時間</option></select>\n        <div id=\"p79IdleCustomRow\" hidden><label for=\"p79IdleCustom\">自訂分鐘數（1～120 分鐘）</label><input id=\"p79IdleCustom\" type=\"number\" min=\"1\" max=\"120\" step=\"1\" value=\"5\" inputmode=\"numeric\"></div>\n        <p class=\"p79-idle-hint\"><span aria-hidden=\"true\">ⓘ</span>滑鼠、鍵盤、捲動、觸控操作會重新計時；系統背景資料更新不列入操作。</p>\n      </div>\n    </div>\n    <div class=\"p79-idle-summary\"><span class=\"p79-idle-people\" aria-hidden=\"true\">👥</span><span id=\"p79IdlePreview\">全部公司、全部單位、全部人員：連續 5 分鐘未操作，自動登出並返回首頁。</span></div>\n  </div>\n  <div class=\"p79-idle-actions\">\n    <p id=\"p79IdleStatus\" role=\"status\" aria-live=\"polite\" class=\"p79-idle-status\"></p>\n    <div class=\"p79-idle-buttons\"><button type=\"button\" id=\"p79IdleSave\" class=\"p79-idle-save\">✓ 儲存設定</button><button type=\"submit\" class=\"p79-idle-cancel\">取消</button></div>\n  </div>\n</form>"
 const style=document.createElement('style');style.textContent="\n#p79IdleSettingsDialog{\n  box-sizing:border-box!important;width:min(680px,calc(100vw - 32px))!important;\n  max-width:680px!important;max-height:min(86dvh,680px)!important;margin:auto!important;\n  padding:0!important;border:1px solid rgba(191,219,254,.5)!important;\n  border-radius:22px!important;background:#fff!important;color:#142d52!important;\n  box-shadow:0 26px 80px rgba(15,35,70,.3)!important;overflow:auto!important;\n}\n#p79IdleSettingsDialog::backdrop{background:rgba(20,40,73,.56);backdrop-filter:blur(4px)}\n#p79IdleSettingsDialog,#p79IdleSettingsDialog *{box-sizing:border-box}\n#p79IdleSettingsDialog .p79-idle-form{margin:0;width:100%;max-width:none;display:block;background:#fff;color:#142d52}\n#p79IdleSettingsDialog .p79-idle-title{\n  display:flex;align-items:center;gap:14px;padding:18px 22px;\n  background:linear-gradient(115deg,#fff7ea 0%,#edf7ff 34%,#dfefff 100%);\n  border-bottom:1px solid #d9e8f7\n}\n#p79IdleSettingsDialog .p79-idle-lock{\n  flex:0 0 54px;width:54px;height:54px;border-radius:15px;display:grid;place-items:center;\n  font-size:27px;background:linear-gradient(135deg,#fff0d2,#ffdca0);color:#ee9413;\n}\n#p79IdleSettingsDialog .p79-idle-heading{min-width:0;flex:1}\n#p79IdleSettingsDialog .p79-idle-heading h2{margin:0;font-size:21px;line-height:1.25;font-weight:850;color:#142d52}\n#p79IdleSettingsDialog .p79-idle-heading p{margin:5px 0 0;color:#657e9e;font-size:12px;line-height:1.4}\n#p79IdleSettingsDialog .p79-idle-close{\n  flex:0 0 30px;width:30px;height:30px;border:0;border-radius:50%;\n  display:grid;place-items:center;padding:0;background:#dce5ef;color:#6c829c;\n  font-size:24px;line-height:1;cursor:pointer\n}\n#p79IdleSettingsDialog .p79-idle-close:hover{background:#cbd8e8;color:#24436d}\n#p79IdleSettingsDialog .p79-idle-body{display:grid;gap:16px;padding:20px 22px 18px}\n#p79IdleSettingsDialog .p79-idle-control{display:grid;grid-template-columns:175px minmax(0,1fr);align-items:start;gap:16px}\n#p79IdleSettingsDialog .p79-idle-control>label{\n  display:flex;align-items:center;gap:9px;min-height:44px;\n  font-size:15px;font-weight:800;color:#19345d\n}\n#p79IdleSettingsDialog .p79-idle-clock{font-size:27px;color:#2588f6;line-height:1}\n#p79IdleSettingsDialog .p79-idle-field{min-width:0;display:grid;gap:8px}\n#p79IdleSettingsDialog select,#p79IdleSettingsDialog input{\n  width:100%;min-height:44px;padding:9px 12px;margin:0;\n  border:1px solid #c9def5;border-radius:11px;background:#fff;color:#142d52;\n  font-size:15px;font-weight:700;box-shadow:0 2px 7px rgba(47,97,150,.11)\n}\n#p79IdleSettingsDialog select:focus-visible,#p79IdleSettingsDialog input:focus-visible{\n  outline:2px solid #409aff;outline-offset:1px\n}\n#p79IdleSettingsDialog #p79IdleCustomRow{display:grid;gap:6px}\n#p79IdleSettingsDialog #p79IdleCustomRow[hidden]{display:none!important}\n#p79IdleSettingsDialog #p79IdleCustomRow label{font-size:12px;font-weight:700;color:#617998}\n#p79IdleSettingsDialog .p79-idle-hint{\n  margin:0;color:#637b99;font-size:12px;line-height:1.6;\n  display:flex;align-items:flex-start;gap:7px\n}\n#p79IdleSettingsDialog .p79-idle-hint>span{color:#409aff;font-size:17px;line-height:1.2}\n#p79IdleSettingsDialog .p79-idle-summary{\n  display:flex;align-items:center;gap:12px;\n  padding:13px 15px;border-radius:13px;border:1px solid #c6e2ff;\n  background:linear-gradient(110deg,#e6f3ff,#dbeaff);\n  color:#173e74;line-height:1.6;font-size:13px;font-weight:750\n}\n#p79IdleSettingsDialog .p79-idle-people{\n  flex:0 0 34px;width:34px;font-size:24px;text-align:center;\n  padding-right:10px;border-right:2px solid #a5cdf7\n}\n#p79IdleSettingsDialog .p79-idle-actions{\n  display:flex;justify-content:space-between;align-items:center;gap:14px;\n  min-height:73px;padding:13px 22px;border-top:1px solid #e1eaf5;background:#fcfdff\n}\n#p79IdleSettingsDialog .p79-idle-status{\n  margin:0;flex:1;min-width:0;font-size:12px;line-height:1.5;font-weight:700;color:#167340;\n}\n#p79IdleSettingsDialog .p79-idle-buttons{display:flex;align-items:center;gap:9px;flex-shrink:0}\n#p79IdleSettingsDialog .p79-idle-save,#p79IdleSettingsDialog .p79-idle-cancel{\n  min-height:40px;border-radius:10px;padding:9px 15px;\n  font-size:13px;font-weight:800;cursor:pointer\n}\n#p79IdleSettingsDialog .p79-idle-save{\n  border:1px solid #0b78ed;background:linear-gradient(120deg,#0879f4,#288efa);\n  box-shadow:0 3px 9px rgba(20,115,235,.18);color:#fff\n}\n#p79IdleSettingsDialog .p79-idle-save:hover:not(:disabled){background:#0568d3}\n#p79IdleSettingsDialog .p79-idle-save:disabled{opacity:.48;cursor:not-allowed}\n#p79IdleSettingsDialog .p79-idle-cancel{border:1px solid #d4deec;background:#fff;color:#38506f}\n#p79IdleSettingsDialog .p79-idle-cancel:hover{background:#f0f5fb}\n@media(max-width:620px){\n #p79IdleSettingsDialog{width:calc(100vw - 22px)!important;max-height:90dvh!important;border-radius:16px!important}\n #p79IdleSettingsDialog .p79-idle-title{padding:15px;gap:10px}\n #p79IdleSettingsDialog .p79-idle-lock{flex-basis:43px;width:43px;height:43px;font-size:21px}\n #p79IdleSettingsDialog .p79-idle-heading h2{font-size:18px}\n #p79IdleSettingsDialog .p79-idle-body{padding:16px 15px;gap:13px}\n #p79IdleSettingsDialog .p79-idle-control{grid-template-columns:1fr;gap:6px}\n #p79IdleSettingsDialog .p79-idle-control>label{min-height:26px}\n #p79IdleSettingsDialog .p79-idle-summary{padding:12px;font-size:12px}\n #p79IdleSettingsDialog .p79-idle-actions{padding:12px 15px;align-items:stretch;flex-direction:column;gap:10px}\n #p79IdleSettingsDialog .p79-idle-buttons{justify-content:flex-end}\n}\n"
 document.head.append(style);document.body.append(dialog);
 const select=dialog.querySelector('#p79IdleMinutes'),custom=dialog.querySelector('#p79IdleCustom'),save=dialog.querySelector('#p79IdleSave');
 select.addEventListener('change',refreshPreview);custom.addEventListener('input',refreshPreview);
 window.Port79IdleLogout.openSettings=async()=>{
  select.value=[5,10,15,20,30,60,120].includes(minutes)?String(minutes):'custom';
  custom.value=String(minutes);save.disabled=!canManage();
  setStatus(canManage()?'正在確認雲端時間設定…':'只有超級管理員能調整全系統自動登出時間',false);
  refreshPreview();dialog.showModal();
  if(canManage()){await syncCloud(true);select.value=[5,10,15,20,30,60,120].includes(minutes)?String(minutes):'custom';custom.value=String(minutes);refreshPreview();}
 };
 save.addEventListener('click',saveUI);
}
function chosen(){
 const select=document.getElementById('p79IdleMinutes');
 if(!select)return minutes;
 const n=number(select.value==='custom'?document.getElementById('p79IdleCustom')?.value:select.value);
 return n;
}
function refreshPreview(){
 const select=document.getElementById('p79IdleMinutes'),preview=document.getElementById('p79IdlePreview');
 if(!select||!preview)return;
 const custom=document.getElementById('p79IdleCustomRow');custom.hidden=select.value!=='custom';
 const n=chosen();preview.textContent=n===null?'請輸入 1～120 的整數分鐘數。':'全部公司、全部單位、全部人員：連續 '+n+' 分鐘未操作，自動登出並返回首頁。';
}
function setStatus(message,error){const el=document.getElementById('p79IdleStatus');if(el){el.textContent=message;el.style.color=error?'#dc2626':'#047857';}}
async function saveUI(){
 if(saving)return;
 if(!canManage())return setStatus('只有超級管理員可以儲存全系統設定',true);
 const n=chosen();if(n===null)return setStatus('請輸入 1～120 的整數分鐘數',true);
 saving=true;
 const btn=document.getElementById('p79IdleSave');btn.disabled=true;setStatus('正在儲存到雲端共用設定…',false);
 try{
  let config=await readCloud({maxBusyRetries:2,timeoutMs:15000});
  const token=getToken();
  let writeError;
  for(let attempt=0;attempt<=BUSY_RETRY_DELAYS_MS.length;attempt++){
   const merged={...config,[CONFIG_FIELD]:n};
   if(new TextEncoder().encode(JSON.stringify(merged)).length>8800)throw new Error('雲端設定容量不足，尚未儲存');
   try{
    await request(getGas(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'saveConfig',config:merged,token,userToken:token})},30000);
    break;
   }catch(e){
    if(e.uncertain){writeError=e;setStatus('儲存回應中斷，正在讀回雲端確認結果…',false);break;}
    if(!isCloudBusy(e)||attempt===BUSY_RETRY_DELAYS_MS.length)throw e;
    setStatus('雲端正在處理其他資料，正在自動重試（'+(attempt+1)+'/'+BUSY_RETRY_DELAYS_MS.length+'）…',false);
    await waitForCloud(BUSY_RETRY_DELAYS_MS[attempt]);
    // Before resending, re-read shared config so unrelated settings are not overwritten.
    // If the earlier write actually succeeded, do not send a duplicate.
    config=await readCloud({maxBusyRetries:1,timeoutMs:15000});
    if(number(config[CONFIG_FIELD])===n)break;
   }
  }
  let confirmed;
  try{confirmed=await readCloud({maxBusyRetries:1,timeoutMs:15000});}
  catch(e){throw new Error('尚未確認儲存結果：'+e.message+'；請重新開啟設定核對，勿連續重送');}
  if(number(confirmed[CONFIG_FIELD])!==n)throw new Error((writeError?writeError.message+'；':'')+'雲端目前尚未確認本次時間，請稍後重新開啟設定核對');
  remember(n);lastFetch=Date.now();
  setStatus('✅ 設定已儲存，即將自動關閉視窗',false);
  const dialog=document.getElementById('p79IdleSettingsDialog');
  if(dialog?.open)setTimeout(()=>{if(dialog.open&&!saving)dialog.close();},800);
  tick();
 }catch(e){setStatus('❌ '+(e?.message||e),true);}
 finally{saving=false;btn.disabled=!canManage();}
}
function idleNotice(){
 if(!isHome)return;
 try{
  if(sessionStorage.getItem('port79_idle_expired_notice')!=='1')return;
  sessionStorage.removeItem('port79_idle_expired_notice');
  const status=document.getElementById('status');
  if(status){status.textContent='因連續 '+minutes+' 分鐘沒有操作，系統已自動登出。請重新登入。';status.classList.add('warning');}
 }catch(e){}
}
window.Port79IdleLogout={currentMinutes:()=>minutes,sync:()=>syncCloud(true),openSettings:()=>{if(!isHr)return;makeUI();return window.Port79IdleLogout.openSettings();}};
function start(){
 readCache();idleNotice();makeUI();
 ['pointerdown','keydown','wheel','touchstart','scroll','input'].forEach(type=>window.addEventListener(type,activity,{passive:true,capture:true}));
 window.addEventListener('focus',()=>{tick();void syncCloud();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){tick();void syncCloud();}});
 window.addEventListener('pageshow',tick);
 window.addEventListener('storage',e=>{if(e.key===CACHE_KEY){readCache();tick();}});
 setInterval(()=>{tick();if(fingerprint())void syncCloud();},1000);
 observeLogin();void syncCloud();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
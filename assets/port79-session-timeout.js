/* PORT79 | Shared inactive-session logout and HR security settings | 2026-11-11 */
(function(){
'use strict';
if(window.Port79IdleLogout) return;
const DEFAULT_MINUTES=5, MIN=1, MAX=120;
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
async function request(url,options={},timeoutMs=14000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const res=await fetch(url,{cache:'no-store',redirect:'follow',...options,signal:controller.signal});
  if(!res.ok)throw new Error('網路服務異常（'+res.status+'）');
  const data=await res.json();
  if(!data?.ok)throw new Error(data?.error||'雲端設定讀取失敗');
  return data;
 }finally{clearTimeout(timer);}
}
async function readCloud(){
 const token=getToken();if(!token)throw new Error('登入憑證不存在，請重新登入');
 const url=getGas(),query=url+'?action=getData&token='+encodeURIComponent(token)+'&t='+Date.now();
 const data=await request(query,{},18000);
 if(!data.config||typeof data.config!=='object')throw new Error('雲端共用設定格式不完整');
 return data.config;
}
async function syncCloud(force=false){
 if(fetching||!observeLogin())return;
 if(!force&&Date.now()-lastFetch<110000)return;
 fetching=true;lastFetch=Date.now();
 try{
  const cfg=await readCloud(),found=cfg[CONFIG_FIELD];
  const n=number(found);
  if(found!==undefined&&n===null)throw new Error('雲端登出時間格式錯誤');
  remember(n??DEFAULT_MINUTES);
  setStatus('雲端設定已同步',false);
 }catch(e){setStatus('使用上次設定；雲端同步待確認',false);console.warn('自動登出設定同步未完成：',e);}
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
 dialog.innerHTML='<form method="dialog" class="p79-idle-form"><div class="p79-idle-title"><div><h2>🔒 閒置自動登出</h2><p>人資管理 → 功能選單 → 系統與安全</p></div><button type="submit" class="p79-idle-close" aria-label="關閉">✕</button></div><div class="p79-idle-body"><label for="p79IdleMinutes">連續沒有操作時，自動登出</label><select id="p79IdleMinutes"><option value="5">5 分鐘（預設）</option><option value="10">10 分鐘</option><option value="15">15 分鐘</option><option value="20">20 分鐘</option><option value="30">30 分鐘</option><option value="60">60 分鐘</option><option value="120">120 分鐘</option><option value="custom">自訂時間</option></select><div id="p79IdleCustomRow" hidden><label for="p79IdleCustom">自訂分鐘數（1～120 分鐘）</label><input id="p79IdleCustom" type="number" min="1" max="120" step="1" value="5" inputmode="numeric"></div><div class="p79-idle-summary" id="p79IdlePreview">全部公司、全部單位、全部人員：連續 5 分鐘未操作，自動登出並返回首頁。</div><p class="p79-idle-hint">滑鼠、鍵盤、捲動、觸控操作會重新計時；系統背景資料更新不列入操作。</p><p id="p79IdleStatus" role="status" class="p79-idle-status"></p></div><div class="p79-idle-actions"><button type="button" id="p79IdleSave" class="btn primary">儲存設定</button><button type="submit" class="btn">取消</button></div></form>';
 const style=document.createElement('style');style.textContent='#p79IdleSettingsDialog{border:0;border-radius:18px;max-width:min(520px,calc(100vw - 24px));width:100%;padding:0;background:var(--panel,#fff);color:var(--text,#111827);box-shadow:0 25px 70px #0005}#p79IdleSettingsDialog::backdrop{background:#0f172a88}.p79-idle-form{margin:0}.p79-idle-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px 22px;border-bottom:1px solid #cbd5e1}.p79-idle-title h2{margin:0;font-size:20px}.p79-idle-title p{margin:6px 0 0;color:var(--muted,#64748b);font-size:12px}.p79-idle-close{border:0;background:none;color:inherit;font-size:22px;cursor:pointer}.p79-idle-body{padding:22px;display:grid;gap:12px}.p79-idle-body label{font-size:14px;font-weight:800}.p79-idle-body select,.p79-idle-body input{width:100%;padding:11px;border:1px solid #94a3b8;border-radius:9px;background:var(--card,#fff);color:inherit;font-size:15px}.p79-idle-summary{padding:15px;border:1px solid #bfdbfe;border-radius:12px;background:#eff6ff;color:#1e40af;line-height:1.6;font-weight:750}.p79-idle-hint{margin:0;color:var(--muted,#64748b);font-size:12px;line-height:1.7}.p79-idle-status{min-height:19px;margin:0;font-size:12px}.p79-idle-actions{padding:16px 22px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid #cbd5e1}@media(prefers-color-scheme:dark){#p79IdleSettingsDialog .p79-idle-summary{background:#172554;color:#bfdbfe;border-color:#1e40af}}';
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
 if(!canManage())return setStatus('只有超級管理員可以儲存全系統設定',true);
 const n=chosen();if(n===null)return setStatus('請輸入 1～120 的整數分鐘數',true);
 const btn=document.getElementById('p79IdleSave');btn.disabled=true;setStatus('正在儲存到雲端共用設定…',false);
 try{
  const config=await readCloud(),merged={...config,[CONFIG_FIELD]:n};
  if(new TextEncoder().encode(JSON.stringify(merged)).length>8800)throw new Error('雲端設定容量不足，尚未儲存');
  const token=getToken();
  await request(getGas(),{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'saveConfig',config:merged,token,userToken:token})},20000);
  const confirmed=await readCloud();
  if(number(confirmed[CONFIG_FIELD])!==n)throw new Error('雲端讀回時間與本次修改不一致，請重試');
  remember(n);lastFetch=Date.now();
  setStatus('✅ 已儲存到雲端；其他人員重新同步後生效',false);
  tick();
 }catch(e){setStatus('❌ 尚未儲存：'+(e?.message||e),true);}
 finally{btn.disabled=!canManage();}
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
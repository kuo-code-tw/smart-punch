/* Actual cloud-config-backed notice: never claim it is a push notification. */
(function(w,d){
'use strict';
var DEFAULT='https://script.google.com/macros/s/AKfycbzPD0v8QQol_7cMuMUFGnjHxo-9jFnRLEwoWQhW-n3g5GlbbHnaL7EhRAtcymUcdYOEzg/exec';
var CACHE='p79_settings_notice_cache_v1',booted=false,loading=false;
function session(){try{return JSON.parse(sessionStorage.getItem('port79_user_session')||'null')}catch(e){return null}}
function token(){return String(sessionStorage.getItem('port79_admin_token')||sessionStorage.getItem('port79_gc_superadmin_token')||sessionStorage.getItem('port79_gc_token')||'').trim()}
function endpoint(){var u=String(sessionStorage.getItem('port79_gas_url')||DEFAULT);return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(u)?u:DEFAULT;}
function enabled(){var x=session();return x&&['admin','superadmin'].includes(String(x.adminRole||x.role||'').toLowerCase())&&!!token()&&d.getElementById('systems')?.classList.contains('show')}
function display(notice){
 var root=d.getElementById('systems');if(!root)return;
 var box=d.getElementById('p79VerifiedSystemNotice');
 if(!notice||notice.enabled!==true||!String(notice.text||'').trim()){if(box)box.remove();return}
 if(!box){box=d.createElement('aside');box.id='p79VerifiedSystemNotice';box.setAttribute('role','note');
 box.style.cssText='padding:13px 18px;margin:11px 0;border:1px solid #9cbeec;border-radius:12px;background:#eaf3ff;color:#173c6a;line-height:1.7;white-space:pre-wrap;font-size:14px;font-weight:700';
 var heading=d.createElement('strong');heading.textContent='📢 系統公告';heading.style.cssText='display:block;margin-bottom:4px';box.append(heading);
 var body=d.createElement('div');body.className='p79-system-notice-text';box.append(body);
 root.insertBefore(box,root.firstChild);}
 box.querySelector('.p79-system-notice-text').textContent=String(notice.text).slice(0,180);
}
async function read(){
 if(loading||!enabled())return;loading=true;
 var cached;try{cached=JSON.parse(localStorage.getItem(CACHE)||'null')}catch(e){}
 if(cached&&cached.notice&&Date.now()-cached.at<30000){display(cached.notice);loading=false;return}
 var controller=new AbortController(),timer=setTimeout(function(){controller.abort()},12000),t=token();
 try{
  // Read a protected, already supported config endpoint. No write and no fake local success.
  var url=endpoint()+'?action=hrGetOrgOptions&token='+encodeURIComponent(t)+'&t='+Date.now();
  var response=await fetch(url,{cache:'no-store',signal:controller.signal});
  if(!response.ok)throw Error('HTTP '+response.status);
  var data=await response.json();if(data.ok===false||!data.config)throw Error(data.error||'配置讀取失敗');
  if(t!==token()||!enabled())return;
  var config=data.config.p79SystemSettingsV1||{},notice=config.notice||{enabled:false,text:''};
  display(notice);localStorage.setItem(CACHE,JSON.stringify({at:Date.now(),notice:notice}));
 }catch(error){console.warn('系統公告雲端驗證暫時不可用，保留既有資料；不顯示未核實的新公告',error);}
 finally{clearTimeout(timer);loading=false;}
}
function check(){if(!enabled())return;var box=d.getElementById('p79VerifiedSystemNotice');if(!booted||!box){booted=true;setTimeout(read,1200)}}
function init(){var sys=d.getElementById('systems');if(!sys)return;
 new MutationObserver(check).observe(sys,{attributes:true,attributeFilter:['class']});
 check();
}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init);else init();
})(window,document);

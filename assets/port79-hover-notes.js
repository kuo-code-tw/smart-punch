/* PORT79 | Shared compact interface: suppress explanatory UI only, never data cells. */
(function(){
'use strict';
const d=document;
if(window.P79HoverNotes)return;
window.P79HoverNotes=true;
const SELECTOR=[
 '.note','.help-text','.hint','.employee-login-note','.login-action-help',
 '.p79u-context-hint','.p79d-early-note','.schedule-editor-sub',
 '.p79-rm-footnote','.p79-ter-hint','.p79-ref-panel-note','.p79pr-hint',
 '.p79pr-detail-description','.p79d-group-hint','.p79d-table-caption',
 '.yard-kpi-tip','.yard-panel-note','.yard-allowed-note','.p79-yard-kpi-foot',
 '.p79r-kpi-note','.p79r-ot-note','.p79r-note','.p79d-optimization-note',
 '.p79-preview-note','.attendance-drawer-subtitle','#idleHint','[data-p79-static-help]'
].join(',');
const PROTECTED='button,a,input,select,textarea,label,summary,[role="button"],[contenteditable]:not([contenteditable="false"]),[role="alert"],[role="status"],[aria-live]:not([aria-live="off"]),[data-kind="error"],[data-kind="warning"],[data-kind="failed"],[data-status="error"],.error,.warning,.alert,.danger,.text-danger,.text-red-500,.text-red-600,.text-amber-600';
const INSIDE='script,style,template,pre,code,button,a,label,summary,[role="button"],[contenteditable]:not([contenteditable="false"]),[role="alert"],[role="status"],[aria-live]:not([aria-live="off"]),[data-kind="error"],[data-kind="warning"],.error,.warning,.alert,.danger,td,th';
const ALERT=/錯誤|失敗|逾時|警告|異常|未完成|未確認|未儲存|尚未|未下載|未同步|待核|待確認|待更新|處理中|下載中|讀取中|正在|禁止|權限不足|無權|拒絕|不可復原|無法|缺漏|缺少|未取得|資料不足|請先|必須|不可刪|覆蓋正式|正式儲存仍須|❌|⚠|🚨|error|failed|timeout/i;
const HIDDEN='p79-ui-explanation-hidden';
const records=new Set();
let queued=false;
function clean(s){return String(s||'').replace(/\s+/g,' ').trim();}
function safeText(s){const text=clean(s);return text.length>=4&&text.length<=4000&&!ALERT.test(text)&&!/^[-—–·\s]+$/.test(text);}
function isPlain(el){
 return [...el.children].every(n=>/^(?:SPAN|B|STRONG|SMALL|EM|I|BR)$/.test(n.tagName)&&!n.id&&!n.matches(PROTECTED)&&!n.querySelector(PROTECTED));
}
function safeCandidate(el){
 if(!el?.isConnected||!['DIV','P','SPAN','SMALL','ASIDE'].includes(el.tagName))return false;
 if(el.matches(PROTECTED)||el.getAttribute('aria-hidden')==='true'||el.hasAttribute('tabindex'))return false;
 if(el.closest('td,th'))return false;
 const inside=el.closest(INSIDE);
 if(inside&&!(el.matches('.p79pr-detail-description')&&inside.tagName==='SUMMARY'))return false;
 if(el.id&&el.id!=='idleHint'&&!el.hasAttribute('data-p79-static-help'))return false;
 if(!isPlain(el)||el.querySelector(SELECTOR))return false;
 return safeText(el.textContent);
}
function scan(){
 queued=false;
 const next=new Set();
 d.querySelectorAll(SELECTOR).forEach(el=>{
  if(safeCandidate(el)){
   next.add(el);
   if(!el.classList.contains(HIDDEN))el.classList.add(HIDDEN);
  }else if(el.classList.contains(HIDDEN))el.classList.remove(HIDDEN);
 });
 for(const el of records)if(!next.has(el))el.classList.remove(HIDDEN);
 records.clear();for(const el of next)records.add(el);
}
function queue(){if(queued)return;queued=true;window.setTimeout(scan,80);}
function boot(){
 if(!d.body||!d.head)return;
 const style=d.createElement('style');
 style.textContent='.'+HIDDEN+'{display:none!important}';
 d.head.appendChild(style);
 scan();
 new MutationObserver(queue).observe(d.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden','aria-hidden','aria-live','role','data-kind','data-status']});
}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

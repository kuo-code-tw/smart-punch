/* PORT79 | Compact display-only notes: keep the original DOM text and business data. */
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
 '.yard-kpi-tip','.yard-panel-note','#idleHint','[data-p79-static-help]'
].join(',');
const PROTECTED='button,a,input,select,textarea,label,summary,[role="button"],[contenteditable]:not([contenteditable="false"]),[role="alert"],[role="status"],[aria-live]:not([aria-live="off"]),[data-kind="error"],[data-kind="warning"],[data-kind="failed"],[data-status="error"],.error,.warning,.alert,.danger,.text-danger,.text-red-500,.text-red-600,.text-amber-600';
const INSIDE='script,style,template,pre,code,button,a,label,summary,[role="button"],[contenteditable]:not([contenteditable="false"]),[role="alert"],[role="status"],[aria-live]:not([aria-live="off"]),[data-kind="error"],[data-kind="warning"],.error,.warning,.alert,.danger';
const ALERT=/錯誤|失敗|逾時|警告|異常|未完成|未確認|未儲存|尚未|未下載|未同步|待核|待確認|待更新|處理中|下載中|讀取中|正在|禁止|權限不足|無權|拒絕|不可復原|無法|缺漏|缺少|未取得|資料不足|請先|必須|不可刪|覆蓋正式|正式儲存仍須|❌|⚠|🚨|error|failed|timeout/i;
const HEADER=/^(?:備註(?:說明)?|remarks?|notes?)$/i;
const records=new Map();
let tip=null,active=null,queued=false;
function clean(s){return String(s||'').replace(/\s+/g,' ').trim();}
function safeText(s,cell=false){const text=clean(s);return text.length>=(cell?1:4)&&text.length<=1600&&!ALERT.test(text)&&!/^[-—–·\s]+$/.test(text);}
function headerIsRemark(s){return HEADER.test(clean(s));}
function isPlain(el,existingButton){
 return [...el.children].every(n=>n===existingButton||(/^(?:SPAN|B|STRONG|SMALL|EM|I|BR)$/.test(n.tagName)&&!n.id&&!n.matches(PROTECTED)&&!n.querySelector(PROTECTED)));
}
function safeCandidate(el,cell=false){
 if(!el?.isConnected||!['DIV','P','SPAN','SMALL','ASIDE','TD'].includes(el.tagName))return '';
 if(el.matches(PROTECTED)||el.closest(INSIDE)||el.getAttribute('aria-hidden')==='true'||el.hasAttribute('tabindex'))return '';
 if(!cell&&el.id&&el.id!=='idleHint'&&!el.hasAttribute('data-p79-static-help'))return '';
 if(!cell&&el.closest('td,th'))return '';
 if(!isPlain(el,records.get(el)?.button))return '';
 if(!cell&&el.querySelector(SELECTOR))return '';
 const style=window.getComputedStyle(el);
 if(style.display==='none'||style.visibility==='hidden')return '';
 const raw=String(el.textContent||'').trim();
 return safeText(raw,cell)?raw:'';
}
function css(){
 const style=d.createElement('style');
 style.textContent=
 '.p79-hover-help-source{position:absolute!important;width:1px!important;height:1px!important;min-height:0!important;min-width:0!important;max-width:1px!important;max-height:1px!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important;clip-path:inset(50%)!important;white-space:nowrap!important;pointer-events:none!important}'+
 '.p79-hover-help-cell,.p79-hover-help-cell>span:not(.p79-hover-help-icon),.p79-hover-help-cell>b,.p79-hover-help-cell>strong,.p79-hover-help-cell>small,.p79-hover-help-cell>em,.p79-hover-help-cell>i{font-size:0!important;line-height:1!important}'+
 'button.p79-hover-help-icon{display:inline-flex!important;align-items:center!important;justify-content:center!important;vertical-align:middle!important;width:20px!important;height:20px!important;min-width:20px!important;min-height:20px!important;max-width:20px!important;max-height:20px!important;box-sizing:border-box!important;border:1px solid #a9c4df!important;border-radius:50%!important;background:#eaf4ff!important;color:#225b95!important;font:700 13px/1 system-ui,sans-serif!important;padding:0!important;margin:2px 5px!important;box-shadow:none!important;cursor:help!important;flex:0 0 auto!important}'+
 'button.p79-hover-help-icon:before{content:"i";font-family:Georgia,serif;font-weight:700}button.p79-hover-help-icon:hover,button.p79-hover-help-icon:focus-visible{background:#d3e8ff!important;outline:2px solid #4886d1!important;outline-offset:2px!important}'+
 '#p79HoverNoteTooltip{position:fixed!important;z-index:2147483647!important;inset:auto!important;margin:0!important;box-sizing:border-box!important;max-width:min(420px,calc(100vw - 24px))!important;max-height:55vh!important;overflow:auto!important;padding:11px 14px!important;border:1px solid #8cadd1!important;border-radius:10px!important;background:#173655!important;color:#fff!important;box-shadow:0 8px 26px #102b4c45!important;font:500 13px/1.65 system-ui,"Microsoft JhengHei",sans-serif!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;text-align:left!important;pointer-events:none!important}'+
 '#p79HoverNoteTooltip[hidden]{display:none!important}';
 d.head.appendChild(style);
}
function tooltip(){
 if(tip)return tip;
 tip=d.createElement('div');tip.id='p79HoverNoteTooltip';tip.setAttribute('role','tooltip');tip.hidden=true;
 if(typeof tip.showPopover==='function')tip.setAttribute('popover','manual');
 d.body.appendChild(tip);return tip;
}
function position(button){
 if(!tip||tip.hidden)return;
 const r=button.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight;
 const x=Math.max(8,Math.min(window.innerWidth-w-8,r.left+r.width/2-w/2));
 const y=r.bottom+8+h<=window.innerHeight-8?r.bottom+8:Math.max(8,r.top-h-8);
 tip.style.setProperty('left',x+'px','important');tip.style.setProperty('top',y+'px','important');
}
function hide(){
 if(active)active.removeAttribute('aria-describedby');
 active=null;if(!tip)return;
 try{if(tip.matches(':popover-open'))tip.hidePopover();}catch(_){}
 tip.hidden=true;
}
function show(button){
 const text=button.getAttribute('data-p79-help-text');
 if(!text||!button.isConnected)return;
 if(active&&active!==button)active.removeAttribute('aria-describedby');
 active=button;const el=tooltip();el.textContent=text;el.hidden=false;
 try{if(el.hasAttribute('popover')&&!el.matches(':popover-open'))el.showPopover();}catch(_){}
 button.setAttribute('aria-describedby',el.id);position(button);
}
function remove(el){
 const r=records.get(el);if(!r)return;
 if(active===r.button)hide();
 r.button.remove();el.classList.remove('p79-hover-help-source','p79-hover-help-cell');records.delete(el);
}
function decorate(el,cell=false){
 const text=safeCandidate(el,cell);
 if(!text){remove(el);return;}
 let r=records.get(el);
 if(r&&(r.cell!==cell||!r.button.isConnected||(cell?r.button.parentElement!==el:r.button.previousElementSibling!==el))){remove(el);r=null;}
 if(!r){
  const b=d.createElement('button');b.type='button';b.className='p79-hover-help-icon';b.setAttribute('data-p79-hover-icon','1');
  b.addEventListener('pointerenter',()=>show(b));
  b.addEventListener('pointerleave',()=>{if(active===b)hide();});
  b.addEventListener('focus',()=>show(b));b.addEventListener('blur',()=>{if(active===b)hide();});
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();show(b);});
  // The icon is CSS generated; button adds no text to exportable table cells.
  if(cell)el.appendChild(b);else el.after(b);
  r={button:b,cell};records.set(el,r);
  el.classList.add(cell?'p79-hover-help-cell':'p79-hover-help-source');
 }
 if(r.button.getAttribute('data-p79-help-text')!==text){
  r.button.setAttribute('data-p79-help-text',text);r.button.setAttribute('aria-label','查看備註：'+text);r.button.title=text;
  if(active===r.button)show(r.button);
 }
}
function tableCells(table){
 // Only simple, unambiguous pure remark columns. Mixed status/source/reason
 // columns and input fields are always left alone.
 const header=table.tHead?.rows;
 if(!header?.length||header.length!==1)return [];
 const heads=[...header[0].cells];
 if(heads.some(c=>c.colSpan!==1||c.rowSpan!==1))return [];
 const indexes=heads.map((c,i)=>headerIsRemark(c.textContent)?i:-1).filter(i=>i>=0);
 if(!indexes.length)return [];
 const out=[];
 for(const body of table.tBodies)for(const r of body.rows){
  if(r.cells.length!==heads.length||[...r.cells].some(c=>c.colSpan!==1||c.rowSpan!==1))continue;
  for(const i of indexes)if(r.cells[i]?.tagName==='TD')out.push(r.cells[i]);
 }
 return out;
}
function scan(){
 queued=false;const next=new Set();
 d.querySelectorAll(SELECTOR).forEach(el=>{next.add(el);decorate(el,false);});
 d.querySelectorAll('table').forEach(table=>tableCells(table).forEach(el=>{next.add(el);decorate(el,true);}));
 for(const el of records.keys())if(!el.isConnected||!next.has(el))remove(el);
}
function queue(){if(queued)return;queued=true;window.setTimeout(scan,160);}
function boot(){
 if(!d.body||!d.head)return;
 css();scan();
 new MutationObserver(ms=>{
  if(ms.some(m=>{
   const el=m.target.nodeType===1?m.target:m.target.parentElement;
   if(el?.closest?.('#p79HoverNoteTooltip,[data-p79-hover-icon]'))return false;
   if(m.type==='childList'){
    const nodes=[...m.addedNodes,...m.removedNodes];
    if(nodes.length&&nodes.every(n=>n.nodeType===1&&n.matches?.('[data-p79-hover-icon],#p79HoverNoteTooltip')))return false;
   }
   return true;
  }))queue();
 }).observe(d.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden','aria-live','role','data-kind','data-status']});
 d.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
 d.addEventListener('pointerdown',e=>{if(active&&!e.target.closest?.('[data-p79-hover-icon]'))hide();},true);
 window.addEventListener('scroll',()=>{if(active)position(active);},true);
 window.addEventListener('resize',()=>{if(active)position(active);queue();});
}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
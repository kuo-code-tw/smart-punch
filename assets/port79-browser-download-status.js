/* Across-system browser download progress; never stores credentials or record payloads. */
(function(){
 'use strict';
 if(window.__p79BrowserBackgroundWorker||window.__p79BrowserProgressUI)return;
 window.__p79BrowserProgressUI=true;
 const KEY='p79BrowserCacheProgressV1';
 let panel=null,visibleCompletion='',dismissedJob='',currentRecord=null,pinned=false,hovered=false,focusOpen=false;
 const NOTICE_KEY='p79BrowserCacheNoticeV2:';
 function noticeKey(record){return NOTICE_KEY+encodeURIComponent(String(record.viewer||''))}
 function jobKey(record){return String(record.startedAt)+'|'+String(record.phase)}
 function readNotice(record){try{return JSON.parse(localStorage.getItem(noticeKey(record))||'null')||{}}catch(_){return {}}}
 function saveNotice(record,patch){try{localStorage.setItem(noticeKey(record),JSON.stringify({...readNotice(record),...patch}))}catch(_){}}
 function read(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(_){return null}}
 function build(){
  if(panel||!document.body)return;
  const style=document.createElement('style');
  style.textContent='#p79BrowserBgProgress{position:fixed;right:15px;bottom:15px;z-index:15000;width:max-content;max-width:calc(100vw - 30px);color:#153956;font:700 12px/1.6 system-ui,"Microsoft JhengHei",sans-serif}'+
   '#p79BrowserBgProgress [data-p79-compact]{display:flex;align-items:center;gap:6px;border:1px solid #9abfda;border-radius:999px;padding:6px 10px;background:#f5faff;color:#153956;box-shadow:0 3px 12px #123b662b;white-space:nowrap}'+
   '#p79BrowserBgProgress [data-p79-popover]{position:absolute;right:0;bottom:100%;width:min(335px,calc(100vw - 30px));max-height:calc(100dvh - 70px);overflow:auto;box-sizing:border-box;border:1px solid #9abfda;border-radius:13px;padding:11px 13px;background:#f5faff;color:#153956;box-shadow:0 8px 28px #123b662b}'+
   '#p79BrowserBgProgress[hidden],#p79BrowserBgProgress [hidden]{display:none!important}'+
   '#p79BrowserBgProgress .p79-head{font-size:13px;font-weight:900}'+
   '#p79BrowserBgProgress progress{width:100%;height:9px;vertical-align:middle}'+
   '#p79BrowserBgProgress button{background:transparent;color:#075c9d;border:0;cursor:pointer;font:inherit;padding:3px 6px 0 0}'+
   '#p79BrowserBgProgress .p79-detail{font-weight:500;white-space:pre-wrap;word-break:break-word}'+
   '.dark #p79BrowserBgProgress [data-p79-compact],.dark #p79BrowserBgProgress [data-p79-popover]{background:#1c3249;color:#e8f5ff;border-color:#4c7397}';
  (document.head||document.body).appendChild(style);
  panel=document.createElement('aside');panel.id='p79BrowserBgProgress';panel.hidden=true;
  panel.setAttribute('aria-label','背景資料下載進度');
  panel.innerHTML='<button type="button" data-p79-compact aria-expanded="false" aria-controls="p79BrowserBgPopover" aria-label="背景資料下載進度">☁ <span data-p79-compact-text>下載中</span></button><div id="p79BrowserBgPopover" data-p79-popover hidden><div class="p79-head" data-p79-title>☁ 背景資料下載</div><div><span data-p79-count>0/6</span> <progress data-p79-bar max="1" value="0"></progress></div><div data-p79-systems></div><div data-p79-month hidden><span data-p79-month-count></span><progress data-p79-month-bar max="1" value="0"></progress></div><div data-p79-summary></div><button type="button" data-p79-toggle aria-expanded="false">查看下載明細</button><div class="p79-detail" data-p79-detail hidden></div><button type="button" data-p79-retry hidden>補抓未完成資料</button><button type="button" data-p79-dismiss hidden>關閉完成通知</button></div>';
  document.body.appendChild(panel);
  const compact=panel.querySelector('[data-p79-compact]');
  const popover=panel.querySelector('[data-p79-popover]');
  const sync=()=>{const open=!panel.hidden&&(hovered||pinned||focusOpen);popover.hidden=!open;compact.setAttribute('aria-expanded',String(open));};
  panel.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'){hovered=true;sync();}});
  panel.addEventListener('pointerleave',()=>{hovered=false;sync();});
  compact.addEventListener('click',()=>{pinned=!pinned;sync();});
  panel.addEventListener('focusin',()=>{if(!hovered&&panel.matches(':focus-within')&&document.activeElement?.matches(':focus-visible')){focusOpen=true;sync();}});
  panel.addEventListener('focusout',e=>{if(!panel.contains(e.relatedTarget)){focusOpen=false;sync();}});
  document.addEventListener('pointerdown',e=>{if(!panel.contains(e.target)){pinned=false;focusOpen=false;sync();}});
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();compact.focus();pinned=false;hovered=false;focusOpen=false;sync();}});
  panel.p79Collapse=()=>{pinned=false;hovered=false;focusOpen=false;sync();};
  const detail=panel.querySelector('[data-p79-detail]'),toggle=panel.querySelector('[data-p79-toggle]');
  toggle.addEventListener('click',()=>{detail.hidden=!detail.hidden;toggle.textContent=detail.hidden?'查看下載明細':'收合下載明細';toggle.setAttribute('aria-expanded',String(!detail.hidden))});
  panel.querySelector('[data-p79-retry]').addEventListener('click',()=>window.Port79DataCache?.startBackgroundDownload?.());
  panel.querySelector('[data-p79-dismiss]').addEventListener('click',()=>{if(currentRecord){dismissedJob=jobKey(currentRecord);saveNotice(currentRecord,{dismissed:dismissedJob});}panel.hidden=true;panel.p79Collapse()});
 }
 function update(record){
  build();if(!panel)return;
  record=record||read();
  const user=window.Port79DataCache?.viewerKey?.();
  if(!record||!user||record.viewer!==user||!record.startedAt||
     Date.now()-Number(record.updatedAt||0)>3600000){currentRecord=null;panel.hidden=true;panel.p79Collapse();return}
  if(currentRecord&&(currentRecord.viewer!==record.viewer||currentRecord.startedAt!==record.startedAt))panel.p79Collapse();
  currentRecord=record;
  const key=jobKey(record),notice=readNotice(record);
  if(!['starting','downloading'].includes(record.phase)&&(notice.dismissed===key||dismissedJob===key)){panel.hidden=true;panel.p79Collapse();return}
  const active=['downloading','starting'].includes(record.phase),stalled=active&&Date.now()-record.updatedAt>90000;
  const state=active?(stalled?'進度暫未更新':record.phase==='starting'?'準備中':'下載中'):
    ({complete:'已完成',partial:'部分完成',failed:'失敗',interrupted:'已中斷'})[record.phase]||'待確認';
  const completed=Math.max(0,Number(record.completed)||0),total=Math.max(0,Number(record.total)||0);
  // Completion time belongs to the shared job, not to the page displaying it.
  if(record.phase==='complete'){
   if(Date.now()-Number(record.updatedAt||0) >=8000){panel.hidden=true;panel.p79Collapse();return;}
   if(visibleCompletion!==key){
    if(notice.seen===key){panel.hidden=true;panel.p79Collapse();return;}
    visibleCompletion=key;saveNotice(record,{seen:key});
   }
  }else visibleCompletion='';
  const names={attendance:'考勤',workhours:'工時統計',leave:'請假',schedule:'排班',efficiency:'效率',hr:'人資',history:'歷史資料'};
  panel.querySelector('[data-p79-title]').textContent='☁ 背景資料下載｜'+state;
  const short=active?(total?Math.round(Math.min(1,completed/total)*100)+'%':'準備中'):state;
  panel.querySelector('[data-p79-compact-text]').textContent=short;
  panel.querySelector('[data-p79-compact]').setAttribute('aria-label','背景資料下載｜'+state+(total?' '+completed+'/'+total:''));
  panel.querySelector('[data-p79-count]').textContent=total?completed+'/'+total+'（'+Math.round(Math.min(1,completed/total)*100)+'%）':'預載中';
  panel.querySelector('[data-p79-bar]').value=total?Math.min(1,completed/total):0;
  panel.querySelector('[data-p79-summary]').textContent=(record.system?'目前：'+(names[record.system]||record.system):'')+
    (record.monthTotal?'　月份 '+record.monthCompleted+'/'+record.monthTotal:'')+
    (stalled?'｜請查看下載分頁':'');
  const systemText={waiting:'等待',loading:'下載中',done:'已下載',reused:'沿用本機',deferred:'按需讀取',error:'失敗',skipped:'未下載'};
  const statuses=Object.entries(record.states||{}).map(([sys,state])=>(names[sys]||sys)+'：'+(systemText[state]||state));
  if(record.historyOnDemand===true)statuses.push('歷史資料：按月讀取（未預載）');
  panel.querySelector('[data-p79-systems]').textContent=statuses.join('　');
  const month=panel.querySelector('[data-p79-month]');month.hidden=!record.monthTotal;
  panel.querySelector('[data-p79-month-count]').textContent='考勤月份 '+(record.monthCompleted||0)+'/'+(record.monthTotal||0);
  panel.querySelector('[data-p79-month-bar]').value=record.monthTotal?Math.min(1,(record.monthCompleted||0)/record.monthTotal):0;
  panel.querySelector('[data-p79-detail]').textContent=String(record.detail||'');
  panel.querySelector('[data-p79-dismiss]').hidden=active;
  panel.querySelector('[data-p79-retry]').hidden=active||!['partial','failed','interrupted'].includes(record.phase);
  panel.hidden=false;
 }
 function start(){
  build();update();
  window.addEventListener('storage',e=>{if(e.key===KEY||e.key?.startsWith(NOTICE_KEY))update()});
  try{if(typeof BroadcastChannel==='function'){const channel=new BroadcastChannel('p79-browser-cache-progress');channel.onmessage=e=>update(e.data)}}catch(_){}
  window.setInterval?.(()=>update(),5000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

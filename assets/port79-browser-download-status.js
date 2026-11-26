/* Across-system browser download progress; never stores credentials or record payloads. */
(function(){
 'use strict';
 if(window.__p79BrowserBackgroundWorker||window.__p79BrowserProgressUI)return;
 window.__p79BrowserProgressUI=true;
 const KEY='p79BrowserCacheProgressV1';
 let panel=null,lastDismissed=0,completedAt=0,completedJob=0;
 function read(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(_){return null}}
 function build(){
  if(panel||!document.body)return;
  const style=document.createElement('style');
  style.textContent='#p79BrowserBgProgress{position:fixed;right:15px;bottom:15px;z-index:15000;width:min(335px,calc(100vw - 30px));border:1px solid #9abfda;border-radius:13px;padding:11px 13px;background:#f5faff;color:#153956;box-shadow:0 8px 28px #123b662b;font:700 12px/1.6 system-ui,"Microsoft JhengHei",sans-serif}'+
   '#p79BrowserBgProgress[hidden],#p79BrowserBgProgress [hidden]{display:none!important}'+
   '#p79BrowserBgProgress .p79-head{font-size:13px;font-weight:900}'+
   '#p79BrowserBgProgress progress{width:100%;height:9px;vertical-align:middle}'+
   '#p79BrowserBgProgress button{background:transparent;color:#075c9d;border:0;cursor:pointer;font:inherit;padding:3px 6px 0 0}'+
   '#p79BrowserBgProgress .p79-detail{font-weight:500;white-space:pre-wrap;word-break:break-word}'+
   '.dark #p79BrowserBgProgress{background:#1c3249;color:#e8f5ff;border-color:#4c7397}';
  (document.head||document.body).appendChild(style);
  panel=document.createElement('aside');panel.id='p79BrowserBgProgress';panel.hidden=true;
  panel.setAttribute('role','status');
  panel.innerHTML='<div class="p79-head" data-p79-title>☁ 背景資料下載</div><div><span data-p79-count>0/6</span> <progress data-p79-bar max="1" value="0"></progress></div><div data-p79-systems></div><div data-p79-month hidden><span data-p79-month-count></span><progress data-p79-month-bar max="1" value="0"></progress></div><div data-p79-summary></div><button type="button" data-p79-toggle aria-expanded="false">查看下載明細</button><div class="p79-detail" data-p79-detail hidden></div><button type="button" data-p79-retry hidden>補抓未完成資料</button><button type="button" data-p79-dismiss hidden>關閉完成通知</button>';
  document.body.appendChild(panel);
  const detail=panel.querySelector('[data-p79-detail]'),toggle=panel.querySelector('[data-p79-toggle]');
  toggle.addEventListener('click',()=>{detail.hidden=!detail.hidden;toggle.textContent=detail.hidden?'查看下載明細':'收合下載明細';toggle.setAttribute('aria-expanded',String(!detail.hidden))});
  panel.querySelector('[data-p79-retry]').addEventListener('click',()=>window.Port79DataCache?.startBackgroundDownload?.());
  panel.querySelector('[data-p79-dismiss]').addEventListener('click',()=>{lastDismissed=Date.now();panel.hidden=true});
 }
 function update(record){
  build();if(!panel)return;
  record=record||read();
  const user=window.Port79DataCache?.viewerKey?.();
  if(!record||record.viewer!==user||!record.startedAt||record.startedAt<=lastDismissed||
     Date.now()-Number(record.updatedAt||0)>3600000){panel.hidden=true;return}
  const active=['downloading','starting'].includes(record.phase),stalled=active&&Date.now()-record.updatedAt>90000;
  const state=active?(stalled?'進度暫未更新':record.phase==='starting'?'準備中':'下載中'):
    ({complete:'已完成',partial:'部分完成',failed:'失敗',interrupted:'已中斷'})[record.phase]||'待確認';
  const completed=Math.max(0,Number(record.completed)||0),total=Math.max(0,Number(record.total)||0);
  if(record.phase==='complete'){if(completedJob!==record.startedAt){completedJob=record.startedAt;completedAt=Date.now();}if(Date.now()-completedAt>8000){panel.hidden=true;return;}}
  const names={attendance:'考勤',workhours:'工時統計',leave:'請假',schedule:'排班',efficiency:'效率',hr:'人資',history:'歷史資料'};
  panel.querySelector('[data-p79-title]').textContent='☁ 背景資料下載｜'+state;
  panel.querySelector('[data-p79-count]').textContent=total?completed+'/'+total+'（'+Math.round(Math.min(1,completed/total)*100)+'%）':'預載中';
  panel.querySelector('[data-p79-bar]').value=total?Math.min(1,completed/total):0;
  panel.querySelector('[data-p79-summary]').textContent=(record.system?'目前：'+(names[record.system]||record.system):'')+
    (record.monthTotal?'　月份 '+record.monthCompleted+'/'+record.monthTotal:'')+
    (stalled?'｜請查看下載分頁':'');
  const systemText={waiting:'等待',loading:'下載中',done:'已下載',reused:'沿用本機',error:'失敗',skipped:'未下載'};
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
  window.addEventListener('storage',e=>{if(e.key===KEY)update()});
  try{if(typeof BroadcastChannel==='function'){const channel=new BroadcastChannel('p79-browser-cache-progress');channel.onmessage=e=>update(e.data)}}catch(_){}
  window.setInterval?.(()=>update(),5000);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

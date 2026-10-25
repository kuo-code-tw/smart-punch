/* 統一匯入／匯出中文名稱：保留子節點、事件、檔案選擇器及原本功能。 */
(function(){
'use strict';
const MODULES=[
  [/leave|balance|請假|可休|特休/i,'請假'],
  [/attendance|punch|考勤/i,'考勤'],
  [/schedule|roster|班表|排班/i,'排班'],
  [/vessel|ship|efficiency|aqc|船舶|月報/i,'船舶'],
  [/hr|employee|people|人資|名冊/i,'人資'],
  [/overtime|bonus|workhours|加班|工時/i,'加班'],
  [/history|歷史/i,'歷史資料']
];
function getModule(el){
  const info=[el.id,el.getAttribute('onclick'),el.getAttribute('data-action'),
    el.closest('[id]')?.id].filter(Boolean).join(' ');
  for(const [re,name] of MODULES){if(re.test(info))return name;}
  const path=location.pathname.toLowerCase();
  if(path.includes('/work-hours/'))return '加班';
  if(path.includes('/attendance/'))return '考勤';
  if(path.includes('/schedule/'))return '排班';
  if(path.includes('/leave/'))return '請假';
  if(path.includes('/hr/'))return '人資';
  if(path.includes('/aqc-efficiency/'))return '船舶';
  if(path.includes('/history-data/'))return '歷史資料';
  return '資料';
}
function apply(root=document){
  const selector='button,a,[role="button"],summary,label';
  const nodes=[];
  if(root.matches?.(selector))nodes.push(root);
  if(root.querySelectorAll)nodes.push(...root.querySelectorAll(selector));
  for(const el of nodes){
    const raw=String(el.textContent||'').replace(/\s+/g,' ').trim();
    if(!raw)continue;
    if(/^(?:↻|⟳|🔄)?\s*(重新整理|重新更新|更新資料)\s*$/.test(raw)){
      el.style.setProperty('display','none','important');
      el.setAttribute('data-port79-hidden-refresh','1');
      continue;
    }
    if(!/excel/i.test(raw))continue;
    // 僅修改原始文字節點，不能覆寫 textContent，否則會刪掉檔案 input、圖示與事件所需 DOM。
    const noun=getModule(el);
    for(const node of el.childNodes){
      if(node.nodeType!==3||!/excel/i.test(node.nodeValue))continue;
      let value=node.nodeValue.replace(/\bexcel\b/gi,'').replace(/\(\s*\)/g,'').replace(/\s{2,}/g,' ');
      if(/(?:匯入|匯出)/.test(value)&&!/考勤|請假|排班|人資|加班|船舶|歷史|效率|月報|可休|名冊|統計|明細|項目|資料|範本|清單|紀錄/.test(value)){
        value=value.replace(/(匯入|匯出)/, '$1'+noun);
      }
      if(value!==node.nodeValue)node.nodeValue=value;
    }
  }
}
function boot(){
  apply();
  new MutationObserver(ms=>{
    for(const m of ms)for(const n of m.addedNodes){
      if(n.nodeType===1)apply(n);
    }
  }).observe(document.documentElement,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();

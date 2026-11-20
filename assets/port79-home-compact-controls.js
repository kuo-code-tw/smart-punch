/* 79 Port | Homepage controls layout only. Existing buttons keep their own listeners. */
(function(){
 'use strict';
 if(window.__p79CompactHomeControls)return;
 window.__p79CompactHomeControls=true;
 const d=document;
 let hideTimer=null,previousPhase='',dismissed=false;
 const active=new Set(['downloading','stalled','complete','partial','failed','interrupted']);
 function homeReady(){
  return d.body?.classList.contains('p79-workspace')&&
   d.getElementById('systems')?.classList.contains('show');
 }
 function makeProgress(){
  let item=d.getElementById('p79HomeDownloadProgress');
  if(item)return item;
  item=d.createElement('div');
  item.id='p79HomeDownloadProgress';item.setAttribute('role','status');
  item.setAttribute('aria-label','Windows 本機資料下載進度');
  item.hidden=true;
  const line=d.createElement('div');line.className='p79-compact-progress-line';
  const label=d.createElement('span');label.className='p79-compact-progress-label';label.textContent='☁ 下載中';
  const count=d.createElement('span');count.className='p79-compact-progress-count';count.textContent='0/7';
  const close=d.createElement('button');close.type='button';close.className='p79-compact-progress-close';
  close.textContent='×';close.setAttribute('aria-label','隱藏下載進度');
  close.addEventListener('click',()=>{dismissed=true;item.hidden=true;});
  line.append(label,count,close);
  const track=d.createElement('div');track.className='p79-compact-progress-track';
  const fill=d.createElement('div');fill.className='p79-compact-progress-fill';track.append(fill);
  item.append(line,track);
  return item;
 }
 function place(){
  if(!homeReady())return;
  const tray=d.getElementById('p79WorkspaceStatus');
  const statuses=d.getElementById('p79SevenStatus');
  const toolbar=d.querySelector('#p79WorkspaceTopbar .p79-toolbar-tools');
  if(!tray||!statuses||!toolbar)return;
  let compact=d.getElementById('p79HomeCompactActions');
  if(!compact){
   compact=d.createElement('div');compact.id='p79HomeCompactActions';
   compact.setAttribute('aria-label','系統下載及常用顯示工具');
   tray.append(compact);
  }
  const progress=makeProgress();
  if(progress.parentNode!==compact)compact.prepend(progress);
  // Reparent existing controls; do not clone, rebind or replace their handlers.
  const download=d.getElementById('p79WindowsDownloadLink');
  const menu=d.getElementById('p79HomeFunctionMenu');
  const theme=toolbar.querySelector('.p79-toolbar-theme')||compact.querySelector('.p79-toolbar-theme');
  if(download&&download.parentNode!==compact)compact.append(download);
  if(menu&&menu.parentNode!==compact)compact.append(menu);
  if(theme&&theme.parentNode!==compact)compact.append(theme);
  return compact;
 }
 function progress(event){
  const info=event?.detail||{};
  if(!homeReady()||typeof window.chrome?.webview?.postMessage!=='function')return;
  const holder=place(),item=holder?.querySelector('#p79HomeDownloadProgress');
  if(!item)return;
  const phase=String(info.phase||''),rawTotal=Number(info.total),rawCount=Number(info.completed);
  const total=Number.isFinite(rawTotal)?Math.max(1,Math.min(7,rawTotal)):7;
  const count=Number.isFinite(rawCount)?Math.max(0,Math.min(total,rawCount)):0;
  if(hideTimer!==null){clearTimeout(hideTimer);hideTimer=null;}
  if(phase==='downloading'&&previousPhase!=='downloading')dismissed=false;
  previousPhase=phase;
  if(!active.has(phase)){item.hidden=true;return;}
  const names={
   downloading:'☁ 下載中',stalled:'☁ 連線中',complete:'✓ 已完成',
   partial:'⚠ 未完成',failed:'⚠ 失敗',interrupted:'⏸ 已中斷'
  };
  item.querySelector('.p79-compact-progress-label').textContent=names[phase];
  item.querySelector('.p79-compact-progress-count').textContent=count+'/'+total;
  item.querySelector('.p79-compact-progress-fill').style.width=(count/total*100)+'%';
  item.title=String(info.title||names[phase])+'｜'+String(info.detail||'').slice(0,170);
  item.hidden=dismissed;
  if(phase==='complete'){
   hideTimer=setTimeout(()=>{item.hidden=true;hideTimer=null;},6000);
  }
 }
 window.addEventListener('port79-desktop-progress',progress);
 function start(){
  const home=d.getElementById('systems');
  if(home)new MutationObserver(place).observe(home,{attributes:true,attributeFilter:['class']});
  // The workspace header and status tray are built after successful login.
  new MutationObserver(place).observe(d.body,{childList:true});
  place();
 }
 if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

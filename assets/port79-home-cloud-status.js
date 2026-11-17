/* Homepage live cloud activity.
   Uses the same getCloudActivity source and state semantics as port79-seven-top.js.
   Never simulates remote work or changes any management-system permissions. */
(function(){
'use strict';
if(window.__port79HomeCloudStatusLive)return;
window.__port79HomeCloudStatusLive=true;
const d=document;
const keys=['attendance','workhours','leave','schedule','efficiency','hr','history'];
let busy=false,computerBusy=false,started=false,lastValid=false,consecutivePollFailures=0;
function visibleHost(){
 if(d.visibilityState==='hidden'||!d.body?.classList.contains('p79-workspace')||
    !d.getElementById('systems')?.classList.contains('show'))return null;
 return d.getElementById('p79SevenStatus');
}
function gasUrl(){
 try{if(typeof GAS_URL!=='undefined'&&GAS_URL)return String(GAS_URL)}catch(_){}
 try{if(window.GAS_URL)return String(window.GAS_URL)}catch(_){}
 try{
  for(const k of ['port79_gas_url','gasUrl','GAS_URL']){
   const u=sessionStorage.getItem(k)||localStorage.getItem(k);
   if(u&&/script\.google\.com/i.test(u))return u;
  }
 }catch(_){}
 return '';
}
function currentNode(key){
 const host=visibleHost();
 if(!host)return null;
 const item=host.querySelector('[data-sys="'+key+'"]');
 return item&&!item.classList.contains('is-unavailable')?item:null;
}
function updateChip(item,state,label,details,operation=''){
 if(!item)return;
 item.dataset.state=state;item.dataset.operation=operation;
 const el=item.querySelector('.p79-sys-state');
 if(el&&el.textContent!==label)el.textContent=label;
 const name=item.querySelector('b')?.textContent||'系統';
 item.title=name+'｜'+label+(details?.length?'\n'+details.join('\n'):'');
 item.setAttribute('aria-label',item.title);
}
function describe(job){
 const v=String(job?.label||job?.action||'雲端資料');
 try{return String(window.P79Messages?.operation?.(v)||v)}catch(_){return v}
}
function render(data){
 if(!data?.ok)return false;
 const systems={...(data.systems||{})};
 if(!systems.workhours)systems.workhours={active:[],passive:true};
 for(const key of keys){
  const node=currentNode(key);
  if(!node)continue;
  const info=systems[key]||{},jobs=Array.isArray(info.active)?info.active:[],last=info.lastCompleted;
  let state='idle',label=info.passive?'被動待命':'待命',operation='',details=[];
  if(jobs.length){
   const write=jobs.find(j=>j.operation==='write');
   const job=write||jobs.find(j=>j.operation==='read')||jobs[0];
   operation=write?'write':job?.operation==='read'?'read':(job?.operation||'process');
   state='busy';label=write?'寫入中':operation==='read'?'讀取中':(job?.operationLabel||'處理中');
   details=jobs.map(j=>(j.operation==='write'?'寫入：':'讀取：')+describe(j));
  }else if(last){
   if(Number(last.ageMs||0)<15000){
    state=last.ok===false?'error':'done';
    label=last.ok===false?'工作失敗':'工作完成';
   }
   details.push('最近工作：'+describe(last)+'（'+(last.ok===false?'失敗':'完成')+'）');
   if(Number.isFinite(Number(last.ageMs)))details.push('最近完成時間：'+new Date(Date.now()-Number(last.ageMs)).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}));
   if(last.error||last.message)details.push(String(last.error||last.message));
  }else{
   details.push(info.passive?'依其他系統資料更新，目前無主動工作':'目前沒有進行中的工作');
  }
  updateChip(node,state,label,details,operation);
 }
 lastValid=true;
 return true;
}
function signalUnavailable(label){
 for(const key of keys)updateChip(currentNode(key),'offline',label,['無法確認即時雲端工作狀態']);
}
async function poll(){
 if(busy||!visibleHost())return;
 const url=gasUrl();
 if(!url){signalUnavailable('狀態未連線');return}
 busy=true;
 const ctrl=new AbortController();
 const stop=setTimeout(()=>ctrl.abort(),4500);
 try{
  const res=await fetch(url+(url.includes('?')?'&':'?')+'action=getCloudActivity&_='+Date.now(),{
   cache:'no-store',signal:ctrl.signal
  });
  if(!res.ok)throw new Error('HTTP '+res.status);
  const data=await res.json();
  if(!render(data))throw new Error('無效的雲端狀態回應');
  consecutivePollFailures=0;
 }catch(_){
  // Keep the last confirmed state on a brief network failure; transient GAS timeouts
  // must not make every status chip flash offline and then return on the next poll.
  consecutivePollFailures++;
  if(!lastValid || consecutivePollFailures>=3){
   signalUnavailable(lastValid?'雲端狀態暫時無法確認':'狀態查詢失敗');
  }
 }finally{clearTimeout(stop);busy=false}
}
function ensureComputer(host){
 let chip=host.querySelector('#p79ComputerSync');
 if(chip)return chip;
 chip=d.createElement('button');chip.id='p79ComputerSync';chip.type='button';chip.className='sys p79-computer-status';
 chip.dataset.state='waiting';chip.title='讀取電腦資料夾狀態';
 const icon=d.createElement('span');icon.className='p79-sys-icon';icon.textContent='💻';icon.setAttribute('aria-hidden','true');
 const name=d.createElement('b');name.textContent='電腦';
 const lamp=d.createElement('i');lamp.className='p79-status-light';lamp.setAttribute('aria-hidden','true');
 const text=d.createElement('span');text.className='p79-sys-state';text.textContent='檢查中';
 chip.append(icon,name,lamp,text);
 chip.addEventListener('click',()=>window.Port79DataCache?.openCenter?.());
 host.insertBefore(chip,host.querySelector('[data-sys]'));
 return chip;
}
async function refreshComputer(){
 const host=visibleHost();
 if(!host||computerBusy)return;
 computerBusy=true;
 const node=ensureComputer(host);
 try{
  const api=window.Port79DataCache;
  if(!api?.getFolderSyncStatus){
   updateChip(node,'waiting','待載入',['電腦資料夾狀態服務尚未就緒']);
  }else{
   const model=await api.getFolderSyncStatus();
   if(!visibleHost())return;
   const state=['idle','busy','done','error','permission'].includes(model?.state)?model.state:'idle';
   const label=String(model?.label||'待命');
   const notes=[model?.folder?'資料夾：'+model.folder:'',model?.savedAt?'最近成功保存：'+new Date(model.savedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'',model?.error||''].filter(Boolean);
   updateChip(node,state,label,notes);
  }
 }catch(_){updateChip(node,'offline','狀態讀取失敗',['電腦資料夾狀態讀取失敗'])}
 finally{computerBusy=false}
}
function refresh(){poll();refreshComputer()}
function start(){
 if(started)return;started=true;
 window.addEventListener('p79-home-status-ready',refresh);
 window.addEventListener('focus',refresh);
 window.addEventListener('p79-folder-sync-changed',refreshComputer);
 d.addEventListener('visibilitychange',()=>{if(d.visibilityState==='visible')refresh()});
 setInterval(poll,15000);
 setInterval(refreshComputer,60000);
 refresh();
}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

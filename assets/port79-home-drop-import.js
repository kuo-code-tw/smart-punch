/* PORT79 homepage quick drag-and-drop imports.
 * Use only same-origin, authenticated, existing Gate/Yard/Vessel importers.
 * No duplicate parser or new cloud write endpoint is introduced.
 */
(function(w){
'use strict';
var d=w.document;
if(!d)return;
var root=d.getElementById('p79HomeDropImport');
var dialog=d.getElementById('p79HomeImportDialog');
if(!root||!dialog)return;
var frame=d.getElementById('p79HomeImportFrame');
var label=d.getElementById('p79HomeImportTitle');
var status=d.getElementById('p79HomeImportStatus');
var close=d.getElementById('p79HomeImportClose');
var specs={
 gate:{name:'Gate 進出站',url:'./gate-import/?embed=1&homeImport=1',ext:/\.(xlsx|xls|csv)$/i,maxFiles:1,maxBytes:10*1024*1024},
 yard:{name:'Yard 儲量',url:'./yard-dashboard/?embed=1&homeImport=1',ext:/\.(xlsx|xls)$/i,maxFiles:1,maxBytes:12*1024*1024},
 vessel:{name:'船舶作業',url:'./aqc-efficiency/?homeImport=1',ext:/\.(xlsx|xls)$/i,maxFiles:30,maxBytes:30*1024*1024}
};
var active='',working=false,sequence=0,dispatched=0,watcher=null;
var $=id=>d.getElementById(id);
function session(){
 try{return JSON.parse(w.sessionStorage.getItem('port79_user_session')||'null');}catch(e){return null;}
}
function canUse(){
 var s=session();
 var role=String(s?.adminRole||s?.role||'').toLowerCase();
 var token=String(w.sessionStorage.getItem('port79_user_token')||
   w.sessionStorage.getItem('port79_admin_token')||
   w.sessionStorage.getItem('port79_gc_superadmin_token')||'').trim();
 return !!s&&!s.punchOnly&&role==='superadmin'&&!!token;
}
function refresh(){root.hidden=!canUse();}
function notify(value,tone){
 status.textContent=String(value||'');
 status.dataset.tone=tone||'info';
}
function finish(value,tone){
 working=false;
 notify(value,tone);
}
function guardFiles(kind,fileList){
 var spec=specs[kind];
 if(!spec)throw Error('未知匯入類型');
 var files=Array.from(fileList||[]);
 if(!files.length)throw Error('請先選擇檔案');
 if(files.length>spec.maxFiles)throw Error(spec.name+' 單次最多 '+spec.maxFiles+' 個檔案');
 files.forEach(function(file){
  if(!spec.ext.test(String(file.name||'')))throw Error(file.name+'：檔案格式不符合 '+spec.name+' 匯入規定');
  if(file.size>spec.maxBytes)throw Error(file.name+'：檔案超過限制');
  if(typeof file.arrayBuffer!=='function')throw Error('瀏覽器無法讀取 '+file.name);
 });
 return files;
}
function gateStatus(){
 if(active!=='gate'||!working)return;
 try{
  var doc=frame.contentDocument;
  var msg=doc?.getElementById('gateMessage');
  if(!msg)return;
  var txt=String(msg.textContent||'').trim();
  if(!txt)return;
  if(/已寫入正式資料庫/.test(txt)){finish(txt,'success');return;}
  if(msg.dataset.kind==='error'){finish(txt,'error');return;}
  notify(txt,'info');
 }catch(e){}
}
function watchGate(){
 if(watcher){watcher.disconnect();watcher=null;}
 var el=frame.contentDocument?.getElementById('gateMessage');
 if(!el)return;
 watcher=new MutationObserver(gateStatus);
 watcher.observe(el,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['data-kind']});
 gateStatus();
}
async function deliver(kind,files,id){
 if(id!==sequence||!canUse())throw Error('登入狀態已變更，已取消這次匯入');
 var child=frame.contentWindow;
 if(!child||child.location.origin!==w.location.origin)throw Error('匯入頁面來源不符');
 if(kind==='gate'){
  if(typeof child.P79GateImport?.chooseFile!=='function')throw Error('Gate 匯入服務沒有正常載入');
  watchGate();
  await child.P79GateImport.chooseFile(files[0]);
  if(id===sequence&&working)gateStatus();
  return;
 }
 if(kind==='yard'){
  if(typeof child.P79YardDashboard?.importFile!=='function')throw Error('Yard 匯入服務沒有正常載入');
  await child.P79YardDashboard.importFile(files[0]);
  if(id!==sequence)return;
  var el=frame.contentDocument?.getElementById('yardStatus');
  var txt=String(el?.textContent||'').trim();
  var ok=el?.dataset.tone==='success';
  finish(txt||(ok?'Yard 已保存於此登入帳號的瀏覽器':'Yard 匯入未完成'),ok?'success':'error');
  return;
 }
 if(kind==='vessel'){
  if(typeof child.P79VesselHomeImport?.importFiles!=='function')throw Error('船舶匯入服務沒有正常載入');
  var result=await child.P79VesselHomeImport.importFiles(files);
  if(id!==sequence)return;
  var summary='已處理 '+Number(result?.processed||0)+' 個檔案，完成解析 '+Number(result?.success||0)+' 個，失敗 '+Number(result?.failed||0)+' 個。雲端同步狀態請核對下方船舶匯入畫面。';
  finish(summary,result?.failed?'error':'success');
 }
}
function start(kind,list){
 if(!canUse()){return;}
 if(working){if(!dialog.open)dialog.showModal();notify('前一批檔案仍在處理中，請先核對結果','error');return;}
 var files;
 try{files=guardFiles(kind,list);}catch(e){
  var spec=specs[kind];label.textContent=spec?.name||'匯入資料';
  if(!dialog.open)dialog.showModal();
  notify(String(e.message||e),'error');
  return;
 }
 active=kind;working=true;
 var id=++sequence;
 if(watcher){watcher.disconnect();watcher=null;}
 label.textContent=specs[kind].name+' · 匯入';
 notify('已接收 '+files.length+' 個檔案，正在啟動原系統核對流程…');
 if(!dialog.open)dialog.showModal();
 frame.hidden=false;
 frame.onload=function(){
  if(id!==sequence)return;
  try{
   if(frame.contentWindow?.location?.origin!==w.location.origin)return;
   var part=kind==='gate'?'/gate-import/':kind==='yard'?'/yard-dashboard/':'/aqc-efficiency/';
   if(!String(frame.contentWindow?.location?.pathname||'').includes(part))return;
   if(dispatched===id)return;
   dispatched=id;
   notify('正在核對 '+files.map(function(x){return x.name;}).join('、')+' …');
   Promise.resolve(deliver(kind,files,id)).catch(function(error){
    if(id===sequence)finish('匯入無法完成：'+String(error?.message||error),'error');
   });
  }catch(error){if(id===sequence)finish('匯入頁面載入失敗：'+String(error?.message||error),'error');}
 };
 frame.src=specs[kind].url+'&homeDropVersion=20261114-v1';
}
root.querySelectorAll('[data-p79-drop-kind]').forEach(function(zone){
 var kind=zone.dataset.p79DropKind;
 var file=zone.querySelector('input[type=file]');
 zone.addEventListener('click',function(event){
  if(event.target===file)return;
  if(canUse())file.click();
 });
 zone.addEventListener('keydown',function(event){
  if(event.key==='Enter'||event.key===' '){event.preventDefault();if(canUse())file.click();}
 });
 file.addEventListener('click',function(event){event.stopPropagation();});
 file.addEventListener('change',function(){
  if(file.files?.length)start(kind,file.files);
  file.value='';
 });
 zone.addEventListener('dragenter',function(event){event.preventDefault();zone.classList.add('p79-import-over');});
 zone.addEventListener('dragover',function(event){event.preventDefault();event.dataTransfer.dropEffect=canUse()?'copy':'none';zone.classList.add('p79-import-over');});
 zone.addEventListener('dragleave',function(event){if(!zone.contains(event.relatedTarget))zone.classList.remove('p79-import-over');});
 zone.addEventListener('drop',function(event){
  event.preventDefault();event.stopPropagation();zone.classList.remove('p79-import-over');
  if(event.dataTransfer?.files?.length)start(kind,event.dataTransfer.files);
 });
});
d.addEventListener('dragover',function(event){
 if(!root.hidden&&Array.from(event.dataTransfer?.types||[]).includes('Files'))event.preventDefault();
});
d.addEventListener('drop',function(event){
 if(!root.hidden&&Array.from(event.dataTransfer?.types||[]).includes('Files'))event.preventDefault();
});
w.addEventListener('message',function(event){
 if(event.origin!==w.location.origin||event.source!==frame.contentWindow||active!=='gate')return;
 if(event.data?.type==='p79-gate-data-updated'){
  finish('Gate 進出站資料已由正式雲端確認寫入。','success');
  try{w.P79GateStatsHome?.refresh?.();}catch(e){}
 }
});
function dismiss(){
 if(working&& !w.confirm('這次匯入可能仍在進行，關閉視窗不一定會停止雲端操作。確定關閉？'))return;
 dialog.close();
}
close.addEventListener('click',dismiss);
dialog.addEventListener('cancel',function(event){
 if(working){event.preventDefault();dismiss();}
});
w.Port79HomeDropImport={refresh:refresh,canUse:canUse};
refresh();
})(window);

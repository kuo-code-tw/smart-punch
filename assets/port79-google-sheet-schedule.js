/* PORT79 V76 shared public WAN HAI website sailing board.
   Public official data only; shown to EVERY employee on the login page and
   administrators in the dashboard. No private HR data or login tokens read.
   The server refreshes its Google Sheet snapshot automatically. The display
   refreshes only on initial visit or a deliberate user click. */
(function(g){
'use strict';
const ACTION='publicShipSchedule',SOURCE='萬海航運｜網站船期';
const DASH_ID='p79DashVesselNotices',STAFF_ID='p79PublicShipBoard';
const $=id=>g.document.getElementById(id);
const str=v=>String(v??'').trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const short=v=>str(v).slice(0,180);
let rows=[],lastSync=0,state='idle',error='',notice='',loaded=false,request=null,dialog=null;
function parseRows(data){
 if(!Array.isArray(data))return [];
 const seen=new Set();
 return data.slice(0,2000).map(v=>{
  const r=v&&typeof v==='object'?v:{};
  return {name:short(r.name||r.englishName),localName:short(r.localName||r.chineseName),
   inVoyage:short(r.inVoyage),outVoyage:short(r.outVoyage),eta:short(r.eta),
   etb:short(r.etb),etd:short(r.etd),berth:short(r.berth),
   status:short(r.status),source:short(r.source),updatedAt:short(r.updatedAt)};
 }).filter(r=>{
  if(!r.name&&!r.localName)return false;
  if(!r.etb&&!r.etd&&!r.berth&&!r.inVoyage&&!r.outVoyage)return false;
  const key=[r.name,r.localName,r.etb,r.etd,r.berth].join('|');
  if(seen.has(key))return false;seen.add(key);return true;
 }).sort((a,b)=>{
  const sortTime=r=>str(r.etb||r.etd||r.eta).replace(/\//g,'-');
  const x=sortTime(a),y=sortTime(b);
  if(!x)return 1;if(!y)return -1;return x.localeCompare(y);
 });
}
function timeLabel(){
 if(!lastSync)return '尚未成功同步';
 return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(lastSync));
}
function shipTimeMarkup(value){
 const raw=str(value);
 if(!raw)return '未提供';
 // Present the provider's local timestamp exactly, without timezone conversion.
 const match=/^(\d{4}[/-]\d{1,2}[/-]\d{1,2})[ T](\d{1,2}:\d{2}(?::\d{2})?)$/.exec(raw);
 if(!match)return '<span class="p79-wanhai-raw-time">'+esc(raw)+'</span>';
 return '<span class="p79-wanhai-date">'+esc(match[1])+'</span><span class="p79-wanhai-clock">'+esc(match[2])+'</span>';
}
function line(r,i){
 return '<button class="p79-schedule-row p79-wanhai-row" type="button" data-public-ship-index="'+i+'" role="listitem">'+
 '<span class="p79-wanhai-top"><strong class="p79-wanhai-name">'+esc(r.name||r.localName)+'</strong></span>'+
 '<span class="p79-wanhai-detail"><span><small>靠泊時間 ETB</small><b title="'+esc(r.etb||'未提供')+'">'+shipTimeMarkup(r.etb)+'</b></span>'+
 '<span><small>離岸時間 ETD</small><b title="'+esc(r.etd||'未提供')+'">'+shipTimeMarkup(r.etd)+'</b></span></span>'+
 '<span class="p79-wanhai-berth"><small>靠泊碼頭</small><strong>'+esc(r.berth||'未提供')+'</strong></span></button>';
}
function renderOne(host){
 if(!host)return;
 host.className='p79-schedule-board p79-schedule-remote p79-public-sailing-board';
 if(state==='loading'){
  host.innerHTML='<div class="p79-schedule-remote-msg"><strong>正在讀取萬海網站船期…</strong><small>首次開啟及手動更新時讀取</small></div>';return;
 }
 if(state==='ready'&&rows.length){
  host.innerHTML='<div class="p79-schedule-remote-caption">萬海網站船期 · '+esc(timeLabel())+' 同步 · 共 '+rows.length+' 艘'+(notice?' · 更新提醒':'')+'</div>'+
    '<div class="p79-schedule-list" role="list">'+rows.slice(0,host.id===STAFF_ID?3:4).map(line).join('')+'</div>'+
    '<div class="p79-schedule-footnote">'+(notice?'來源最近同步失敗，保留上次成功資料。':'靠泊及離岸時間依萬海原始船期。')+'</div>';return;
 }
 const headline=state==='error'?'目前無法取得萬海船期':state==='ready'?'萬海網站尚無船期資料':'尚未讀取萬海船期';
 host.innerHTML='<div class="p79-schedule-remote-msg"><strong>'+esc(headline)+'</strong>'+
  '<small>'+esc(error||notice||'資料來源為萬海航運船期網站，同步失敗不會使用港務公司資料。')+'</small>'+
  '<div class="p79-schedule-remote-actions"><button type="button" data-public-ship-retry>重新讀取</button><a class="p79-schedule-external-link" href="https://khhtml.wanhai.com/web/SailingScheduleList" target="_blank" rel="noopener noreferrer">開啟萬海網站</a></div></div>';
}
function render(){renderOne($(STAFF_ID));renderOne($(DASH_ID));}
function readJsonp(url){
 return new Promise((resolve,reject)=>{
  if(!g.document?.head)return reject(Error('無法建立船期讀取連線'));
  const nonce=g.crypto?.getRandomValues?(()=>{
   const array=new Uint32Array(4);g.crypto.getRandomValues(array);
   return Array.from(array,n=>n.toString(36).padStart(7,'0')).join('');
  })():Math.random().toString(36).slice(2).padEnd(18,'0')+Date.now().toString(36);
  const callback='P79ShipCb_'+nonce.slice(0,42);
  const src=new URL(url);
  src.searchParams.set('action',ACTION);src.searchParams.set('callback',callback);
  src.searchParams.set('_',String(Date.now()));
  const script=g.document.createElement('script');
  let done=false;
  const finish=(err,data)=>{
   if(done)return;done=true;g.clearTimeout(timer);
   script.remove();try{delete g[callback];}catch(e){g[callback]=undefined;}
   if(err)reject(err);else resolve(data);
  };
  const timer=g.setTimeout(()=>finish(Error('萬海船期連線逾時；請檢查 GAS 是否已部署 V76')),25000);
  g[callback]=data=>finish(null,data);
  script.async=true;script.referrerPolicy='no-referrer';
  script.onerror=()=>finish(Error('無法載入 GAS 船期；請確認正式部署版本與存取設定'));
  script.src=src.toString();g.document.head.appendChild(script);
 });
}
async function refresh(){
 if(request)return request;
 const base=str(g.sessionStorage?.getItem('port79_gas_url'))||str($('p79PublicShipBoard')?.dataset.gasUrl);
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(base)){
  state='error';error='尚未設定正式 GAS 網址';render();return;
 }
 state='loading';render();
 request=(async()=>{
  try{
   const data=await readJsonp(base);
   if(data?.ok!==true)throw Error(str(data?.error)||'官方船期服務回傳失敗');
   if(data?.source!=='port79-wanhai-vessel'||!Array.isArray(data.rows))
    throw Error('目前 GAS 尚未部署 V76 萬海船期讀取入口');
   rows=parseRows(data.rows);
   lastSync=Number(data.lastSync)||0;notice=str(data.error);
   state='ready';error='';
  }catch(e){state='error';error=str(e?.message||e);}
  finally{request=null;render();}
 })();
 return request;
}
function ensureDialog(){
 if(dialog)return dialog;
 dialog=g.document.createElement('dialog');dialog.id='p79PublicShipScheduleDialog';
 dialog.innerHTML='<div class="p79-schedule-dialog-inner"><header class="p79-schedule-dialog-header">'+
  '<div><h2>萬海網站船期｜全員可看</h2><p>資料來源：萬海航運網站；不可混用港務公司資料。</p></div>'+
  '<button type="button" data-public-ship-close aria-label="關閉">✕</button></header>'+
  '<div id="p79PublicShipDialogBody"></div></div>';
 g.document.body.appendChild(dialog);
 dialog.addEventListener('click',e=>{if(e.target===dialog||e.target.closest('[data-public-ship-close]'))dialog.close();});
 return dialog;
}
function showDialog(index=-1){
 const dlg=ensureDialog(),body=$('p79PublicShipDialogBody');
 if(!body)return;
 const showing=index>=0&&index<rows.length?[rows[index]]:rows;
 if(!showing.length){
  body.innerHTML='<p>目前沒有可顯示的萬海船期，請確認 GAS 已啟用同步且來源有效。</p><p><a href="https://khhtml.wanhai.com/web/SailingScheduleList" target="_blank" rel="noopener noreferrer">前往萬海航運網站查看原始船期</a></p>';
 }else{
  body.innerHTML='<p class="p79-schedule-dialog-disclaimer">資料同步：'+esc(timeLabel())+'｜ETA、ETB、ETD 依萬海原始欄位，不補造缺少資料。</p>'+
   '<div class="p79-schedule-table-scroll"><table class="p79-schedule-table"><thead><tr>'+
   ['英文船名','中文船名','進港航次','出港航次','ETA 抵港','ETB 靠泊','ETD 離港','靠泊碼頭','狀態'].map(h=>'<th>'+h+'</th>').join('')+
   '</tr></thead><tbody>'+showing.map(r=>'<tr>'+[r.name,r.localName,r.inVoyage,r.outVoyage,r.eta,r.etb,r.etd,r.berth,r.status].map(v=>'<td>'+esc(v||'未提供')+'</td>').join('')+'</tr>').join('')+
   '</tbody></table></div>'+
   (showing.length===1?'<div class="p79-schedule-dialog-actions"><button type="button" data-public-show-all>查看全部 '+rows.length+' 艘</button></div>':'');
 }
 if(!dlg.open)dlg.showModal();
 const all=body.querySelector('[data-public-show-all]');if(all)all.addEventListener('click',()=>showDialog(-1),{once:true});
}
function init(){
 const staff=$(STAFF_ID),admin=$(DASH_ID);
 [staff,admin].filter(Boolean).forEach(el=>el.addEventListener('click',e=>{
  if(e.target.closest('[data-public-ship-retry]')){refresh();return;}
  const item=e.target.closest('[data-public-ship-index]');
  if(item)showDialog(Number(item.dataset.publicShipIndex));
 }));
 $('p79PublicShipRefresh')?.addEventListener('click',refresh);
 $('p79PublicShipAll')?.addEventListener('click',()=>showDialog(-1));
 $('p79ShipScheduleAll')?.addEventListener('click',()=>showDialog(-1));
 $('p79DashRefresh')?.addEventListener('click',refresh);
 render();refresh();
}
g.P79ManualShipSchedule={render,refresh,parseRows,source:SOURCE};
if(g.document.readyState==='loading')g.document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);

/* PORT79 manual Google Sheet sailing board.
 * No Wan Hai requests. Read-only, authenticated via the existing GAS route.
 * First entry loads once, further updates are manual via the homepage refresh.
 */
(function(g){
'use strict';
const SHEET_ID='1AjgCs8QvADWYjJeWzJCEDsUaKtKlflNTI4ZQEK14Ipo';
const SHEET_URL='https://docs.google.com/spreadsheets/d/'+SHEET_ID+'/edit';
const ACTION='wanHaiSailingSchedule'; // existing GAS doGet route; now backed by our own Sheet
const $=id=>g.document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=s=>String(s??'').trim();
let rows=[],state='idle',lastRead='',errorMessage='',dialog=null,loading=null,hasLoaded=false;
function editLink(label='開啟 Google 船期表'){
 return '<a class="p79-schedule-external-link" href="'+SHEET_URL+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>';
}
function visible(){return !!($('systems')?.classList.contains('show')&&$('p79Dashboard'));}
function parseRows(items){
 if(!Array.isArray(items))return [];
 const unique=new Set();
 return items.slice(0,1000).map(value=>{
  const r=value&&typeof value==='object'?value:{};
  return {
   name:text(r.name||r.englishName),localName:text(r.localName||r.chineseName),
   inVoyage:text(r.inVoyage),outVoyage:text(r.outVoyage),
   eta:text(r.eta),etb:text(r.etb),etd:text(r.etd),
   berth:text(r.berth),status:text(r.status),note:text(r.note),updatedAt:text(r.updatedAt)
  };
 }).filter(r=>{
  if(!r.name&&!r.localName)return false;
  if(!r.inVoyage&&!r.outVoyage)return false;
  const key=[r.name,r.localName,r.inVoyage,r.outVoyage,r.eta,r.etb,r.etd,r.berth].join('|');
  if(unique.has(key))return false;
  unique.add(key);return true;
 }).sort((a,b)=>{
  const date=r=>String(r.eta||r.etb||r.etd||'').replace(/\//g,'-').replace('T',' ').trim();
  const x=date(a),y=date(b);
  if(!x)return 1;if(!y)return -1;
  return x.localeCompare(y);
 });
}
function render(){
 const host=$('p79DashVesselNotices');if(!host)return;
 host.className='p79-schedule-board p79-schedule-remote';
 if(state==='loading'){
  host.innerHTML='<div class="p79-schedule-remote-msg"><strong>正在讀取 Google 船期表…</strong><small>只在首次登入及手動更新時讀取</small></div>';return;
 }
 if(state==='ready'&&rows.length){
  host.innerHTML='<div class="p79-schedule-remote-caption">自訂 Google 船期表 · '+esc(lastRead)+' 更新 · '+rows.length+' 筆</div>'+
  '<div class="p79-schedule-list" role="list">'+rows.slice(0,4).map((r,i)=>
   '<button type="button" role="listitem" class="p79-schedule-row p79-wanhai-row" data-manual-ship-index="'+i+'" aria-label="'+esc((r.name||r.localName)+' 航次 '+(r.inVoyage||r.outVoyage)+' 靠泊碼頭 '+(r.berth||'未提供'))+'">'+
   '<span class="p79-wanhai-top"><strong class="p79-wanhai-name">'+esc(r.name||r.localName)+'</strong><small class="p79-wanhai-voyage">'+esc((r.localName&&r.localName!==r.name?r.localName+' · ':'')+'進 '+(r.inVoyage||'—')+'／出 '+(r.outVoyage||'—'))+'</small></span>'+
   '<span class="p79-wanhai-detail"><span><small>ETA 抵港</small><b>'+esc(r.eta||'未提供')+'</b></span><span><small>ETB 靠泊</small><b>'+esc(r.etb||'未提供')+'</b></span><span><small>ETD 離港</small><b>'+esc(r.etd||'未提供')+'</b></span></span>'+
   '<span class="p79-wanhai-berth"><small>靠泊碼頭</small><strong>'+esc(r.berth||'未提供')+'</strong></span>'+
   (r.status?'<span class="p79-wanhai-state">'+esc(r.status)+'</span>':'')+'</button>').join('')+'</div>'+
  '<div class="p79-schedule-footnote">資料由 PORT79 自行維護，按手動更新才重新讀取。</div>';
  return;
 }
 const title=state==='error'?'Google 船期資料尚未連線':state==='ready'?'目前尚未在 Google 表格填入船期':'尚未讀取 Google 船期表';
 const sub=state==='error'?(errorMessage||'請確認現有 GAS 已更新為 Google 表格讀取版。'):'由管理人員在 Google 表格編輯船期。';
 host.innerHTML='<div class="p79-schedule-remote-msg"><strong>'+esc(title)+'</strong><small>'+esc(sub)+'</small>'+
  '<div class="p79-schedule-remote-actions">'+(state==='error'?'<button type="button" class="p79-schedule-retry" data-manual-ship-retry>重新讀取</button>':'')+editLink()+'</div></div>';
}
async function refresh(){
 if(!visible()||loading)return loading;
 const base=text(g.sessionStorage?.getItem('port79_gas_url'));
 const token=text(g.sessionStorage?.getItem('port79_user_token')||g.sessionStorage?.getItem('port79_admin_token'));
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(base)||!token){
  state='error';errorMessage='尚未登入或 GAS 網址無效';render();return;
 }
 state='loading';errorMessage='';render();
 loading=(async()=>{
  try{
   const url=new URL(base);
   url.searchParams.set('action',ACTION);
   url.searchParams.set('token',token);
   url.searchParams.set('gcToken',token);
   // Use the same proven read-only GAS transport as the rest of the PORT79 homepage.
   // This helper handles GAS redirects, response validation, timeouts and retries.
   const reader=g.P79HistoryRead?.read;
   if(typeof reader!=='function')throw Error('PORT79 雲端唯讀連線模組尚未載入');
   const result=await reader(url.toString(),{forceCloud:true,timeoutMs:45000});
   if(result.source!=='port79-google-sheet'||result.sheetId!==SHEET_ID||!Array.isArray(result.rows))
    throw Error('目前 GAS 船期入口尚未切換到 Google 表格讀取版');
   rows=parseRows(result.rows);
   lastRead=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
   state='ready';
  }catch(error){
   rows=[];state='error';
   errorMessage=error?.kind==='network'?'目前無法連到 GAS，請稍後按「重新讀取」；如其他首頁雲端資料也失敗，請檢查 GAS 部署存取設定':
    error?.kind==='timeout'?'讀取逾時，請手動重試':
    text(error?.message||error);
  }finally{loading=null;render();}
 })();
 return loading;
}
function ensureDialog(){
 if(dialog)return dialog;
 dialog=g.document.createElement('dialog');dialog.id='p79WanHaiScheduleDialog';
 dialog.setAttribute('aria-labelledby','p79ManualShipTitle');
 dialog.innerHTML='<div class="p79-schedule-dialog-inner"><header class="p79-schedule-dialog-header"><div><h2 id="p79ManualShipTitle">PORT79 自訂船期看板</h2><p>資料來源：專用 Google 表格，不使用外部船公司網站。</p></div><button type="button" data-manual-close aria-label="關閉船期">✕</button></header><div id="p79ManualShipBody"></div></div>';
 g.document.body.appendChild(dialog);
 dialog.addEventListener('click',e=>{
  if(e.target===dialog||e.target.closest('[data-manual-close]')){dialog.close();return;}
  if(e.target.closest('[data-manual-all]'))showAll(-1);
 });
 return dialog;
}
function showAll(selected=-1){
 const box=ensureDialog(),body=$('p79ManualShipBody');if(!body)return;
 if(state==='ready'&&rows.length){
  const arr=selected>=0&&selected<rows.length?[rows[selected]]:rows;
  body.innerHTML='<p class="p79-schedule-dialog-disclaimer">此資料由 Google 表格維護；時間、靠泊碼頭以最後一次人工確認輸入為準。</p>'+
  '<div class="p79-schedule-table-scroll"><table class="p79-schedule-table"><thead><tr>'+['英文船名','中文船名','進港航次','出港航次','ETA','ETB','ETD','靠泊碼頭','狀態','備註'].map(k=>'<th>'+k+'</th>').join('')+'</tr></thead><tbody>'+
  arr.map(r=>'<tr>'+[r.name,r.localName,r.inVoyage,r.outVoyage,r.eta,r.etb,r.etd,r.berth,r.status,r.note].map(v=>'<td>'+esc(v||'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+
  '<div class="p79-schedule-dialog-actions">'+(selected>=0?'<button type="button" data-manual-all>查看全部 '+rows.length+' 筆</button>':'')+editLink('編輯 Google 船期表 ›')+'</div>';
 }else body.innerHTML='<p class="p79-schedule-dialog-disclaimer">'+esc(state==='error'?'GAS 船期資料尚未連線。':'Google 表格目前沒有可顯示的船期。')+'</p>'+
  '<div class="p79-schedule-dialog-actions">'+editLink('開啟 Google 船期表 ›')+'</div>';
 if(!box.open)box.showModal();
}
function init(){
 const host=$('p79DashVesselNotices');if(!host)return;
 $('p79ShipScheduleAll')?.addEventListener('click',()=>showAll(-1));
 host.addEventListener('click',e=>{if(e.target.closest('[data-manual-ship-retry]')){refresh();return;}const row=e.target.closest('[data-manual-ship-index]');if(row)showAll(Number(row.dataset.manualShipIndex));});
 $('p79DashRefresh')?.addEventListener('click',refresh);
 const container=$('systems');if(!container)return;
 const check=()=>{if(visible()&&!hasLoaded){hasLoaded=true;refresh();}};
 if(g.MutationObserver)new g.MutationObserver(check).observe(container,{attributes:true,attributeFilter:['class']});
 check();render();
}
g.P79ManualShipSchedule={render,refresh,parseRows,sheetUrl:SHEET_URL};
if(g.document.readyState==='loading')g.document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);

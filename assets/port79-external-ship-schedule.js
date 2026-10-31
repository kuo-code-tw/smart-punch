/* PORT79 external sailing schedule — Wan Hai public website only.
   Uses browser CORS when permitted. Cross-origin HTML is never claimed to be
   readable when the provider blocks it; the original page stays one click away.
   No background polling, no proxy credentials, no mixing with historical jobs. */
(function(g){
'use strict';
const SOURCE='https://khhtml.wanhai.com/web/SailingScheduleList';
const d=g.document,$=id=>d.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const trimmed=s=>String(s??'').replace(/\s+/g,' ').trim();
let rows=[],status='idle',statusMessage='',lastRead='',seenHome=false,running=null,dialog=null,requestSeq=0;
function visible(){return !!($('systems')?.classList.contains('show')&&$('p79Dashboard'))}
function link(label='開啟萬海原始船期網站 ›'){
 return '<a class="p79-schedule-external-link" href="'+SOURCE+'" target="_blank" rel="noopener noreferrer">'+esc(label)+'</a>';
}
function findColumn(headers,re){return headers.findIndex(x=>re.test(x));}
// Only map a real berth/terminal header; general loading/discharge port is not a berth.
function findBerthColumn(headers){
 const excluded=/(?:起運|起始|目的|目的地|裝港|卸港|pol|pod|loading\s*port|discharge\s*port|port\s*of)/i;
 const candidates=[
  /(?:靠泊碼頭|預計靠泊|靠泊船席|泊靠碼頭|berthing\s*(?:terminal|berth))/i,
  /(?:碼頭(?:名稱|編號)?|船席(?:號碼|編號)?|泊位(?:號碼|編號)?|berth|wharf|terminal|pier)/i
 ];
 for(const re of candidates){
  const index=headers.findIndex(h=>re.test(h)&&!excluded.test(h));
  if(index>=0)return index;
 }
 return -1;
}
function parseSailingTables(doc){
 const found=[],seen=new Set();
 for(const table of [...doc.querySelectorAll('table')].slice(0,40)){
  const lines=[...table.querySelectorAll('tr')].slice(0,700);
  let header=-1,columns=null;
  for(let i=0;i<Math.min(7,lines.length);i++){
   const values=[...lines[i].querySelectorAll('th,td')].map(cell=>trimmed(cell.textContent).toLowerCase());
   const name=findColumn(values,/(?:船名|船舶名稱|vessel(?:\s*name)?|ship\s*name)/i);
   const voyage=findColumn(values,/(?:航次|voyage|voy\.?|航班)/i);
   if(name>=0&&voyage>=0){header=i;columns={
     name,voyage,
     eta:findColumn(values,/(?:預計抵|預定抵|到港|抵港|eta|etb|預計靠)/i),
     etd:findColumn(values,/(?:預計離|預定離|離港|開航|etd|預計開)/i),
     berth:findBerthColumn(values),
     status:findColumn(values,/(?:狀態|status|remark|備註)/i)
    };break;}
  }
  if(header<0)continue;
  for(const line of lines.slice(header+1)){
   const cells=[...line.querySelectorAll('td')].map(c=>trimmed(c.textContent));
   if(cells.length<=Math.max(columns.name,columns.voyage))continue;
   const name=trimmed(cells[columns.name]),voyage=trimmed(cells[columns.voyage]);
   if(!name||!voyage||/^(船名|vessel|total|合計)$/i.test(name)||name.length>130||voyage.length>90)continue;
   const row={name,voyage,eta:cells[columns.eta]||'',etd:cells[columns.etd]||'',
    berth:cells[columns.berth]||'',state:cells[columns.status]||''};
   const key=name+'|'+voyage+'|'+row.eta+'|'+row.etd+'|'+row.berth;
   if(!seen.has(key)){seen.add(key);found.push(row);}
   if(found.length>=250)break;
  }
  if(found.length>=250)break;
 }
 return found;
}
function render(){
 const host=$('p79DashVesselNotices');
 if(!host)return;
 host.className='p79-schedule-board p79-schedule-remote';
 if(status==='loading'){
  host.innerHTML='<div class="p79-schedule-remote-msg"><strong>正在查詢萬海網站船期…</strong><small>僅在首次開啟或手動更新時讀取</small></div>';
  return;
 }
 if(status==='ok'&&rows.length){
  const count=rows.length;
  host.innerHTML='<div class="p79-schedule-remote-caption">萬海網站公開船期 · '+esc(lastRead)+' 讀取 · '+count+' 筆</div>'+
    '<div class="p79-schedule-list" role="list">'+rows.slice(0,4).map((r,i)=>
      '<button type="button" role="listitem" class="p79-schedule-row p79-wanhai-row" data-wanhai-index="'+i+'" aria-label="'+esc(r.name+' 航次 '+r.voyage+' 靠泊碼頭 '+(r.berth||'未提供'))+'">'+
      '<span class="p79-wanhai-top"><strong class="p79-wanhai-name">'+esc(r.name)+'</strong><small class="p79-wanhai-voyage">'+esc('航次 '+r.voyage)+'</small></span>'+
      '<span class="p79-wanhai-detail"><span><small>預計抵港</small><b>'+esc(r.eta||'未提供')+'</b></span>'+
      '<span><small>預計離港</small><b>'+esc(r.etd||'未提供')+'</b></span></span>'+
      '<span class="p79-wanhai-berth"><small>靠泊碼頭</small><strong>'+esc(r.berth||'未提供')+'</strong></span>'+
      (r.state?'<span class="p79-wanhai-state">'+esc(r.state)+'</span>':'')+'</button>').join('')+
    '</div><div class="p79-schedule-footnote">靠泊碼頭及時間均來自萬海原站，未提供的欄位不推估。</div>';
 }else{
  const message=status==='idle'?'尚未讀取萬海網站船期':status==='empty'?
   '萬海網站已回應，但未取得可辨識的船期表格。':
   status==='error'?'目前無法取得可辨識的萬海船期資料。':'尚無網站船期資料';
  host.innerHTML='<div class="p79-schedule-remote-msg"><strong>'+esc(message)+'</strong>'+
   '<small>'+esc(status==='error'?(statusMessage||'來源網站可能有限制，並不代表沒有船舶。'):statusMessage)+'</small>'+
   '<div class="p79-schedule-remote-actions">'+link()+'</div></div>';
 }
}
async function loadSourceHtml(signal){
 const base=trimmed(g.sessionStorage?.getItem('port79_gas_url'));
 const token=trimmed(g.sessionStorage?.getItem('port79_user_token')||g.sessionStorage?.getItem('port79_admin_token'));
 let backendError='';
 if(/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(base)&&token){
  try{
   const uri=new URL(base);
   uri.searchParams.set('action','wanHaiSailingSchedule');
   uri.searchParams.set('token',token);
   uri.searchParams.set('gcToken',token);
   const response=await g.fetch(uri.toString(),{method:'GET',cache:'no-store',signal});
   if(!response.ok)throw Error('船期中介服務 HTTP '+response.status);
   const result=await response.json();
   if(result?.ok!==true||result?.source!==SOURCE||typeof result.html!=='string')throw Error(String(result?.error||'船期中介服務尚未啟用'));
   if(result.html.length>2500000)throw Error('船期資料超出安全大小');
   return result.html;
  }catch(error){
   if(signal.aborted)throw error;
   backendError=String(error?.message||error).slice(0,160);
  }
 }
 try{
  const response=await g.fetch(SOURCE,{method:'GET',mode:'cors',credentials:'omit',cache:'no-store',signal});
  if(!response.ok)throw Error('萬海網站 HTTP '+response.status);
  const type=String(response.headers?.get('content-type')||'');
  if(type&&!/html|text\/plain/i.test(type))throw Error('網站未回傳 HTML 船期表格');
  const html=await response.text();
  if(!html||html.length>2500000)throw Error('船期網頁為空或內容過大');
  return html;
 }catch(error){
  throw Error(backendError?'萬海後端讀取失敗：'+backendError+'；網頁直接讀取也遭拒絕':'萬海網頁無法直接讀取：'+String(error?.message||error));
 }
}
async function refresh(){
 if(!visible())return;
 if(running)return running;
 const seq=++requestSeq;
 status='loading';statusMessage='';render();
 const controller=new AbortController();
 const timeout=g.setTimeout(()=>controller.abort(),18000);
 running=(async()=>{
  try{
   const html=await loadSourceHtml(controller.signal);
   if(seq!==requestSeq)return;
   const doc=new g.DOMParser().parseFromString(html,'text/html');
   rows=parseSailingTables(doc);
   status=rows.length?'ok':'empty';
   lastRead=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
  }catch(error){
   if(seq!==requestSeq)return;
   rows=[];status='error';
   statusMessage=error?.name==='AbortError'?'網站查詢逾時':String(error?.message||error);
  }finally{
   g.clearTimeout(timeout);running=null;render();
  }
 })();
 return running;
}
function ensureDialog(){
 if(dialog)return dialog;
 dialog=d.createElement('dialog');dialog.id='p79WanHaiScheduleDialog';
 dialog.setAttribute('aria-labelledby','p79WanHaiScheduleTitle');
 dialog.innerHTML='<div class="p79-schedule-dialog-inner"><header class="p79-schedule-dialog-header">'+
  '<div><h2 id="p79WanHaiScheduleTitle">萬海航運｜網站船期</h2><p>來源：萬海航運公布的船期網頁，與本系統歷史作業資料分開。</p></div>'+
  '<button type="button" data-wanhai-close aria-label="關閉船期視窗">✕</button></header>'+
  '<div id="p79WanHaiScheduleBody"></div></div>';
 d.body.appendChild(dialog);
 dialog.addEventListener('click',e=>{
  if(e.target===dialog||e.target.closest('[data-wanhai-close]'))dialog.close();
  const all=e.target.closest('[data-wanhai-all]');
  if(all)showDialog(-1);
 });
 return dialog;
}
function showDialog(index=-1){
 const dlg=ensureDialog(),body=$('p79WanHaiScheduleBody');
 if(!body)return;
 if(status==='ok'&&rows.length){
  const selected=Number.isInteger(index)&&index>=0&&index<rows.length?[rows[index]]:rows;
  body.innerHTML='<p class="p79-schedule-dialog-disclaimer">讀取時間：'+esc(lastRead)+'｜以下欄位直接來自網站表格，請以原站為準。</p>'+
   '<div class="p79-schedule-table-scroll"><table class="p79-schedule-table"><thead><tr><th>船名</th><th>航次</th><th>預計抵達</th><th>預計離開</th><th>靠泊碼頭</th><th>狀態</th></tr></thead><tbody>'+
   selected.map(r=>'<tr><td>'+esc(r.name)+'</td><td>'+esc(r.voyage)+'</td><td>'+esc(r.eta||'未提供')+'</td><td>'+esc(r.etd||'未提供')+'</td><td>'+esc(r.berth||'未提供')+'</td><td>'+esc(r.state||'—')+'</td></tr>').join('')+'</tbody></table></div>'+
   '<div class="p79-schedule-dialog-actions">'+(selected.length===1?'<button type="button" data-wanhai-all>查看全部 '+rows.length+' 筆</button>':'')+link('前往萬海原網站核對 ›')+'</div>';
 }else{
  body.innerHTML='<p class="p79-schedule-dialog-disclaimer">來源網站若限制跨網站讀取或禁止嵌入，請直接按下方連結在原站查看。不會以歷史作業紀錄取代網站船期。</p>'+
    '<div class="p79-schedule-website-preview"><iframe title="萬海航運船期網站預覽" loading="lazy" referrerpolicy="no-referrer" src="'+SOURCE+'" sandbox="allow-forms allow-scripts allow-same-origin allow-popups"></iframe></div>'+
    '<div class="p79-schedule-dialog-actions">'+link('於萬海原網站查看完整船期 ›')+'</div>';
 }
 if(!dlg.open)dlg.showModal();
}
function init(){
 const host=$('p79DashVesselNotices');
 if(!host)return;
 $('p79ShipScheduleAll')?.addEventListener('click',()=>showDialog(-1));
 host.addEventListener('click',e=>{const row=e.target.closest('[data-wanhai-index]');if(row)showDialog(Number(row.dataset.wanhaiIndex));});
 $('p79DashRefresh')?.addEventListener('click',refresh);
 const systems=$('systems');
 if(!systems)return;
 const check=()=>{if(visible()&&!seenHome){seenHome=true;refresh();}else if(!visible())seenHome=false;};
 if(g.MutationObserver)new g.MutationObserver(check).observe(systems,{attributes:true,attributeFilter:['class']});
 check();
}
g.P79ExternalShipSchedule={render,refresh,parseSailingTables,source:SOURCE};
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);

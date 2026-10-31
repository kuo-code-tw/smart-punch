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
     berth:findColumn(values,/(?:碼頭|船席|泊位|berth|wharf)/i),
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
   const key=name+'|'+voyage+'|'+row.eta+'|'+row.etd;
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
      '<button type="button" role="listitem" class="p79-schedule-row" data-wanhai-index="'+i+'">'+
      '<span class="p79-schedule-time"><b>'+esc(r.eta||r.etd||'—')+'</b><small>'+esc(r.eta?'預計到港':r.etd?'預計離港':'時間未提供')+'</small></span>'+
      '<span class="p79-schedule-info"><strong>'+esc(r.name)+'</strong><small>'+esc('航次 '+r.voyage+(r.berth?' · '+r.berth:''))+'</small></span>'+
      '<span class="p79-schedule-status">'+esc(r.state||'船期')+'</span></button>').join('')+
    '</div><div class="p79-schedule-footnote">資料源：萬海網站，實際船期請以原站公告為準。</div>';
 }else{
  const message=status==='idle'?'尚未讀取萬海網站船期':status==='empty'?
   '萬海網站已回應，但未取得可辨識的船期表格。':
   status==='error'?'萬海網站目前無法跨網域讀取，不能在首頁顯示即時清單。':'尚無網站船期資料';
  host.innerHTML='<div class="p79-schedule-remote-msg"><strong>'+esc(message)+'</strong>'+
   '<small>'+esc(status==='error'?'這可能是來源網站的 CORS／存取限制，不是沒有船舶。':statusMessage)+'</small>'+
   '<div class="p79-schedule-remote-actions">'+link()+'</div></div>';
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
   const response=await g.fetch(SOURCE,{method:'GET',mode:'cors',credentials:'omit',cache:'no-store',signal:controller.signal});
   if(!response.ok)throw new Error('HTTP '+response.status);
   const type=String(response.headers?.get('content-type')||'');
   if(type&&!/html|text\/plain/i.test(type))throw new Error('來源不是可辨識的 HTML 表格');
   const html=await response.text();
   if(html.length>5e6)throw new Error('網站回應過大');
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
   '<div class="p79-schedule-table-scroll"><table class="p79-schedule-table"><thead><tr><th>船名</th><th>航次</th><th>預計抵達</th><th>預計離開</th><th>碼頭</th><th>狀態</th></tr></thead><tbody>'+
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

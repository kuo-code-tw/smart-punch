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
let rows=[],images=[],status='idle',statusMessage='',lastRead='',seenHome=false,running=null,dialog=null,requestSeq=0,sourceDiagnosis='';
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


/* Wan Hai's Eways_GetVesselSchedule XHR returns JSON records, not an HTML table.
 * Column names are verified from the live response screenshot.
 * The API URL/method must be verified separately before a backend request is added. */
function parseWanHaiScheduleJson(payload){
 const found=[],seen=new Set(),visited=new Set();
 let nodes=0;
 function add(r){
  if(!r||typeof r!=='object'||Array.isArray(r))return;
  const val=key=>trimmed(r[key]);
  if(!('VesselEName' in r||'VesselName' in r)||!('InVoyage' in r||'OutVoyage' in r||'ETA' in r||'ETB' in r||'ETD' in r))return;
  const name=val('VesselEName')||val('VesselName')||val('VesselSName');
  if(!name||name.length>130)return;
  const inVoyage=val('InVoyage'),outVoyage=val('OutVoyage');
  const row={
   name,localName:val('VesselName'),shortName:val('VesselSName'),
   voyage:inVoyage||outVoyage||'—',inVoyage,outVoyage,
   eta:val('ETA'),etb:val('ETB'),etd:val('ETD'),
   berth:val('Berth'),state:val('Status')||val('Remark')
  };
  const key=[row.name,row.inVoyage,row.outVoyage,row.eta,row.etb,row.etd,row.berth].join('|');
  if(!seen.has(key)){seen.add(key);found.push(row);}
 }
 function walk(obj,depth){
  if(depth>6||++nodes>12000||found.length>=500)return;
  if(typeof obj==='string'&&depth<3&&/^\s*[\[{]/.test(obj)){
   try{walk(JSON.parse(obj),depth+1);}catch(ignore){}return;
  }
  if(!obj||typeof obj!=='object'||visited.has(obj))return;
  visited.add(obj);
  if(Array.isArray(obj)){for(const item of obj.slice(0,1200))walk(item,depth+1);return;}
  add(obj);
  for(const [key,value] of Object.entries(obj).slice(0,75)){
   if(value&&typeof value==='object'||typeof value==='string'&&/^(data|result|rows|list|records|content|payload|d)$/i.test(key))
    walk(value,depth+1);
  }
 }
 walk(payload,0);
 return found.slice(0,250);
}

function parseSailingImages(doc){
 // Only actual schedule notices from the trusted Wan Hai host. Never display logo images.
 const pictures=[],seen=new Set(),base=new URL(SOURCE);
 const objects=[...doc.querySelectorAll('img,a[href]')].slice(0,260);
 for(const el of objects){
  const src=trimmed(el.getAttribute?.('data-src')||el.getAttribute?.('src')||el.getAttribute?.('href'));
  if(!src||src.startsWith('data:')||src.startsWith('blob:'))continue;
  let parsed;
  try{parsed=new URL(src,SOURCE);}catch(ignore){continue;}
  if(parsed.protocol!=='https:'||parsed.hostname!==base.hostname)continue;
  if(!/\.(?:png|jpe?g|webp|gif)$/i.test(parsed.pathname)&&el.tagName?.toLowerCase()!=='img')continue;
  const label=trimmed([el.getAttribute?.('alt'),el.getAttribute?.('title'),
   el.getAttribute?.('aria-label'),el.parentElement?.textContent?.slice(0,120),
   parsed.pathname].join(' '));
  if(!/(?:船期|船班|船舶動態|sailing.?schedule|vessel.?schedule|ship.?schedule)/i.test(label))continue;
  if(/(?:logo|favicon|avatar|icon|profile|banner)/i.test(parsed.pathname))continue;
  const url=parsed.toString();
  if(!seen.has(url)){seen.add(url);pictures.push({url,label:label.slice(0,100)});}
  if(pictures.length>=8)break;
 }
 return pictures;
}
function diagnoseSource(doc){
 const hasScripts=doc.querySelectorAll('script[src],script:not([src])').length>0;
 const text=trimmed(doc.body?.textContent?.slice(0,350)||'');
 if(/(?:login|sign in|登[入錄]|請先登入|驗證身分)/i.test(text))
  return '來源網站可能要求萬海帳號登入；GAS 無法共用你在瀏覽器中的登入狀態。';
 return hasScripts?'來源頁面沒有直接包含船期表格或圖片，可能要由 JavaScript 額外取得船期資料。':
  '來源頁面沒有可辨識的船期表格或船期圖片。';
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
      '<span class="p79-wanhai-top"><strong class="p79-wanhai-name">'+esc(r.name)+'</strong><small class="p79-wanhai-voyage">'+esc((r.localName&&r.localName!==r.name?r.localName+' · ':'')+'進 '+(r.inVoyage||r.voyage)+'／出 '+(r.outVoyage||'—'))+'</small></span>'+
      '<span class="p79-wanhai-detail"><span><small>ETA 抵港</small><b>'+esc(r.eta||'未提供')+'</b></span>'+
      '<span><small>ETB 靠泊</small><b>'+esc(r.etb||'未提供')+'</b></span><span><small>ETD 離港</small><b>'+esc(r.etd||'未提供')+'</b></span></span>'+
      '<span class="p79-wanhai-berth"><small>靠泊碼頭</small><strong>'+esc(r.berth||'未提供')+'</strong></span>'+
      (r.state?'<span class="p79-wanhai-state">'+esc(r.state)+'</span>':'')+'</button>').join('')+
    '</div><div class="p79-schedule-footnote">靠泊碼頭及時間均來自萬海原站，未提供的欄位不推估。</div>';
 }else if(status==='image'&&images.length){
  host.innerHTML='<div class="p79-schedule-remote-caption">萬海船期圖像 · '+esc(lastRead)+' 讀取 · '+images.length+' 張</div>'+
   '<div class="p79-schedule-image-preview" role="list">'+images.slice(0,2).map((pic,i)=>
    '<button type="button" role="listitem" data-wanhai-image-index="'+i+'" aria-label="查看萬海船期圖片 '+(i+1)+'">'+
    '<img loading="lazy" referrerpolicy="no-referrer" src="'+esc(pic.url)+'" alt="萬海網站船期公告圖片"></button>').join('')+'</div>'+
   '<div class="p79-schedule-footnote">船期原站以圖片公布；點擊查看大圖，不顯示未經確認的文字船期。</div>';
 }else{
  const message=status==='idle'?'尚未讀取萬海網站船期':status==='empty'?
   '來源已回應，但沒有取得實際船期內容。':
   status==='error'?'目前無法取得可辨識的萬海船期資料。':'尚無網站船期資料';
  host.innerHTML='<div class="p79-schedule-remote-msg"><strong>'+esc(message)+'</strong>'+
   '<small>'+esc(status==='error'?(statusMessage||'來源網站可能有限制，並不代表沒有船舶。'):(sourceDiagnosis||statusMessage))+'</small>'+
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
   if(result?.ok!==true||result?.source!==SOURCE)throw Error(String(result?.error||'船期中介服務尚未啟用'));
   if(typeof result.html==='string'){
    if(result.html.length>2500000)throw Error('船期資料超出安全大小');
    return result.html;
   }
   const structured=result.rows??result.records??result.data??result.payload;
   if(structured!=null){
    if(JSON.stringify(structured).length>2500000)throw Error('船期資料超出安全大小');
    return structured;
   }
   throw Error('尚未收到可辨識的船期 JSON 資料');
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
   const payload=await loadSourceHtml(controller.signal);
   if(seq!==requestSeq)return;
   rows=parseWanHaiScheduleJson(payload);
   images=[];
   if(!rows.length&&typeof payload==='string'){
    const doc=new g.DOMParser().parseFromString(payload,'text/html');
    rows=parseSailingTables(doc);
    images=rows.length?[]:parseSailingImages(doc);
    sourceDiagnosis=rows.length||images.length?'':diagnoseSource(doc);
   }else if(!rows.length)sourceDiagnosis='資料已回應，但尚未找到 VesselEName、ETA、ETB、ETD、Berth 等船期欄位。';
   else sourceDiagnosis='';
   status=rows.length?'ok':images.length?'image':'empty';
   lastRead=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
  }catch(error){
   if(seq!==requestSeq)return;
   rows=[];images=[];status='error';sourceDiagnosis='';
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
  body.innerHTML='<p class="p79-schedule-dialog-disclaimer">讀取時間：'+esc(lastRead)+'｜以下欄位直接來自萬海船期資料，請以原站為準。</p>'+
   '<div class="p79-schedule-table-scroll"><table class="p79-schedule-table"><thead><tr><th>船名</th><th>中文船名</th><th>進港航次</th><th>出港航次</th><th>ETA 抵港</th><th>ETB 靠泊</th><th>ETD 離港</th><th>靠泊碼頭</th><th>狀態</th></tr></thead><tbody>'+
   selected.map(r=>'<tr><td>'+esc(r.name)+'</td><td>'+esc(r.localName||'—')+'</td><td>'+esc(r.inVoyage||r.voyage)+'</td><td>'+esc(r.outVoyage||'—')+'</td><td>'+esc(r.eta||'未提供')+'</td><td>'+esc(r.etb||'未提供')+'</td><td>'+esc(r.etd||'未提供')+'</td><td>'+esc(r.berth||'未提供')+'</td><td>'+esc(r.state||'—')+'</td></tr>').join('')+'</tbody></table></div>'+
   '<div class="p79-schedule-dialog-actions">'+(selected.length===1?'<button type="button" data-wanhai-all>查看全部 '+rows.length+' 筆</button>':'')+link('前往萬海原網站核對 ›')+'</div>';
 }else if(status==='image'&&images.length){
  const selected=Number.isInteger(index)&&index>=0&&index<images.length?[images[index]]:images;
  body.innerHTML='<p class="p79-schedule-dialog-disclaimer">以下為來源網站公布的船期圖片；圖片內文字未經自動辨識，請以萬海原站為準。</p>'+
   '<div class="p79-schedule-images">'+selected.map(pic=>
    '<img loading="lazy" referrerpolicy="no-referrer" src="'+esc(pic.url)+'" alt="萬海網站船期公告圖片">').join('')+'</div>'+
   '<div class="p79-schedule-dialog-actions">'+(selected.length===1?'<button type="button" data-wanhai-all>查看全部船期圖片</button>':'')+
    link('前往萬海原站核對 ›')+'</div>';
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
 host.addEventListener('click',e=>{const row=e.target.closest('[data-wanhai-index]');if(row)showDialog(Number(row.dataset.wanhaiIndex));const img=e.target.closest('[data-wanhai-image-index]');if(img)showDialog(Number(img.dataset.wanhaiImageIndex));});
 $('p79DashRefresh')?.addEventListener('click',refresh);
 const systems=$('systems');
 if(!systems)return;
 const check=()=>{if(visible()&&!seenHome){seenHome=true;refresh();}else if(!visible())seenHome=false;};
 if(g.MutationObserver)new g.MutationObserver(check).observe(systems,{attributes:true,attributeFilter:['class']});
 check();
}
g.P79ExternalShipSchedule={render,refresh,parseSailingTables,parseWanHaiScheduleJson,parseSailingImages,diagnoseSource,source:SOURCE};
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);

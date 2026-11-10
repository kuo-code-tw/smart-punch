/* PORT79 V76 shared public WAN HAI website sailing board.
   Public official data only; shown to EVERY employee on the login page and
   administrators in the dashboard. No private HR data or login tokens read.
   The server refreshes its Google Sheet snapshot automatically. The display
   refreshes at most once per hour, reusing recent public data on reload. */
(function(g){
'use strict';
const ACTION='publicShipSchedule',SOURCE='萬海航運｜網站船期';
const REFRESH_INTERVAL_MS=60*60*1000;
const PUBLIC_SCHEDULE_CACHE='p79_public_ship_schedule_hourly_v1';
const DASH_ID='p79DashVesselNotices',STAFF_ID='p79PublicShipBoard';
const $=id=>g.document.getElementById(id);
const str=v=>String(v??'').trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const short=v=>str(v).slice(0,180);
// Keep the provider's own Chinese name. Never translate or guess vessel identities.
function officialChineseShipName(record){
 const candidates=[record.localName,record.chineseName,record.VesselName,record.VesselSName];
 const name=candidates.map(short).find(value=>/[\u3400-\u9fff]/u.test(value));
 return name||g.P79VesselNameDirectory?.getChineseName?.(record.name||record.englishName||record.VesselEName,record.imo||record.imoNumber)||'';
}
// WAN HAI API dates are Taiwan-local wall times (UTC+08), not browser-local times.
// Only suppress a row when its own published ETD has already passed.
// Preserve it in the source Sheet for auditing; do not infer actual departure.
function parseTaipeiTime(value){
 const m=/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(str(value));
 if(!m)return NaN;
 const y=Number(m[1]),mon=Number(m[2]),day=Number(m[3]),h=Number(m[4]),min=Number(m[5]),sec=Number(m[6]||0);
 const local=Date.UTC(y,mon-1,day,h,min,sec),d=new Date(local);
 if(d.getUTCFullYear()!==y||d.getUTCMonth()+1!==mon||d.getUTCDate()!==day||
    d.getUTCHours()!==h||d.getUTCMinutes()!==min||d.getUTCSeconds()!==sec)return NaN;
 return local-8*60*60*1000;
}
function selectCurrentRows(parsed,now=Date.now()){
 const current=[];let expiredCount=0;
 parsed.forEach(r=>{
  const etd=parseTaipeiTime(r.etd);
  if(Number.isFinite(etd)&&etd<now){expiredCount++;return;}
  current.push(r);
 });
 return {rows:current,expiredCount};
}
let rows=[],expiredCount=0,lastSync=0,state='idle',error='',notice='',loaded=false,request=null,dialog=null;
let lastAutoReadAt=0,refreshTimer=null;
// Shared verified names also cover completed imported ships no longer in the current ETD board.
const CHINESE_NAME_CACHE='p79_official_vessel_names';
let verifiedShipNames=Object.create(null);
const vesselNameKey=name=>str(name).toUpperCase().replace(/[^A-Z0-9]/g,'');
function readOfficialNameCache(){
 try{
  const value=JSON.parse(g.localStorage?.getItem(CHINESE_NAME_CACHE)||'{}');
  return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 }catch(_){return {};}
}
function rememberOfficialChineseNames(allRows,directory){
 const byName=Object.create(null);
 for(const [raw,name] of Object.entries(directory||{})){
  const key=vesselNameKey(raw),chinese=officialChineseShipName({localName:name});
  if(key&&chinese)byName[key]=chinese;
 }
 for(const r of allRows){
  const key=vesselNameKey(r.name);
  const chinese=officialChineseShipName(r);
  if(!key||!chinese)continue;
  if(byName[key]!==undefined&&byName[key]!==chinese)byName[key]=null;
  else if(byName[key]!==null)byName[key]=chinese;
 }
 verifiedShipNames=byName;
 const cache=readOfficialNameCache();
 for(const [key,name] of Object.entries(byName)){
  if(name)cache[key]=name;else delete cache[key];
 }
 try{g.localStorage?.setItem(CHINESE_NAME_CACHE,JSON.stringify(cache));}catch(_){}
}
function getChineseName(englishName){
 const key=vesselNameKey(englishName);
 if(!key||verifiedShipNames[key]===null)return '';
 const registered=g.P79VesselNameDirectory?.getChineseName?.(englishName);
 const name=verifiedShipNames[key]||registered||readOfficialNameCache()[key]||'';
 return /[\u3400-\u9fff]/u.test(String(name))?short(name):'';
}
function parseRows(data){
 if(!Array.isArray(data))return [];
 const seen=new Set();
 return data.slice(0,2000).map(v=>{
  const r=v&&typeof v==='object'?v:{};
  return {name:short(r.name||r.englishName||r.VesselEName),localName:officialChineseShipName(r),
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
 '<span class="p79-wanhai-top"><strong class="p79-wanhai-name">'+esc(r.name||r.localName)+'</strong>'+
// The compact board stays short; show the separate official Chinese name if provided.
 (r.localName&&r.name!==r.localName?'<small class="p79-wanhai-voyage">中文：'+esc(r.localName)+'</small>':'')+'</span>'+
 '<span class="p79-wanhai-detail"><span><small>靠泊時間 ETB</small><b title="'+esc(r.etb||'未提供')+'">'+shipTimeMarkup(r.etb)+'</b></span>'+
 '<span><small>離岸時間 ETD</small><b title="'+esc(r.etd||'未提供')+'">'+shipTimeMarkup(r.etd)+'</b></span></span>'+
 '<span class="p79-wanhai-berth"><small>靠泊碼頭</small><strong>'+esc(r.berth||'未提供')+'</strong></span></button>';
}
function renderOne(host){
 if(!host)return;
 host.className='p79-schedule-board p79-schedule-remote p79-public-sailing-board';
 if(state==='loading'){
  host.innerHTML='<div class="p79-schedule-remote-msg"><strong>正在讀取萬海網站船期…</strong><small>每小時自動更新一次</small></div>';return;
 }
 if(state==='ready'&&rows.length){
  host.innerHTML='<div class="p79-schedule-remote-caption">萬海網站船期 · '+esc(timeLabel())+' 同步 · 共 '+rows.length+' 艘'+(expiredCount?' · 另 '+expiredCount+' 艘 ETD 已過未列入':'')+(notice?' · 更新提醒':'')+'</div>'+
    '<div class="p79-schedule-list" role="list">'+rows.slice(0,host.id===STAFF_ID?3:4).map(line).join('')+'</div>'+
    (notice?'<div class="p79-schedule-footnote">來源最近同步失敗，保留上次成功資料。</div>':'');return;
 }
 const headline=state==='error'?'目前無法取得萬海船期':state==='ready'?(expiredCount?'目前沒有可確認的近期船期':'萬海網站尚無船期資料'):'尚未讀取萬海船期';
 host.innerHTML='<div class="p79-schedule-remote-msg"><strong>'+esc(headline)+'</strong>'+
  '<small>'+esc(error||notice||(expiredCount?'另有 '+expiredCount+' 艘已過預計離港時間，原始船期仍保留供核對。':'資料來源為萬海航運船期網站，同步失敗不會使用港務公司資料。'))+'</small>'+
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
function scheduleNextRead(){
 if(refreshTimer!==null){g.clearTimeout(refreshTimer);refreshTimer=null;}
 if(g.document.visibilityState==='hidden')return;
 const nextAt=lastAutoReadAt?lastAutoReadAt+REFRESH_INTERVAL_MS:Date.now()+REFRESH_INTERVAL_MS;
 const wait=Math.max(1000,nextAt-Date.now());
 refreshTimer=g.setTimeout(()=>{
  refreshTimer=null;
  if(g.document.visibilityState!=='hidden')void refresh();
 },wait);
}
function officialScheduleBase(){
 return str(g.sessionStorage?.getItem('port79_gas_url'))||str($('p79PublicShipBoard')?.dataset.gasUrl);
}
function applyOfficialSchedule(data){
 if(data?.ok!==true)throw Error(str(data?.error)||'官方船期服務回傳失敗');
 if(data?.source!=='port79-wanhai-vessel'||!Array.isArray(data.rows))
  throw Error('目前 GAS 尚未部署 V76 萬海船期讀取入口');
 const parsed=parseRows(data.rows);
 rememberOfficialChineseNames(parsed,data.chineseNames);
 const filtered=selectCurrentRows(parsed);
 rows=filtered.rows;expiredCount=filtered.expiredCount;
 lastSync=Number(data.lastSync)||0;notice=str(data.error);
 state='ready';error='';
 try{g.document?.dispatchEvent(new g.CustomEvent('p79:wanhai-names-updated'));}catch(_){}
}
function restoreRecentSchedule(base){
 try{
  const stored=JSON.parse(g.localStorage?.getItem(PUBLIC_SCHEDULE_CACHE)||'null');
  if(!stored||stored.base!==base||!Number.isFinite(stored.checkedAt)||
     stored.checkedAt>Date.now()||Date.now()-stored.checkedAt>=REFRESH_INTERVAL_MS)return false;
  applyOfficialSchedule(stored.data);
  lastAutoReadAt=stored.checkedAt;
  return true;
 }catch(_){return false;}
}
function cacheOfficialSchedule(base,data,checkedAt){
 try{
  g.localStorage?.setItem(PUBLIC_SCHEDULE_CACHE,JSON.stringify({
   base,checkedAt,data:{
    ok:true,source:'port79-wanhai-vessel',lastSync:data.lastSync,
    rows:data.rows.slice(0,2000),chineseNames:data.chineseNames,error:data.error
   }
  }));
 }catch(_){}
}
async function refresh(force=false){
 if(request)return request;
 const now=Date.now();
 if(!force&&lastAutoReadAt&&now-lastAutoReadAt<REFRESH_INTERVAL_MS){
  scheduleNextRead();
  return;
 }
 lastAutoReadAt=now; // automatic checks stay hourly even after a connection failure
 scheduleNextRead();
 const base=officialScheduleBase();
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(base)){
  state='error';error='尚未設定正式 GAS 網址';render();return;
 }
 if(state!=='ready'){state='loading';render();}
 request=(async()=>{
  try{
   const data=await readJsonp(base);
   applyOfficialSchedule(data);
   cacheOfficialSchedule(base,data,now);
  }catch(e){
   error=str(e?.message||e);
   if(rows.length){state='ready';notice=error;}else state='error';
  }finally{request=null;render();}
 })();
 return request;
}
function ensureDialog(){
 if(dialog)return dialog;
 dialog=g.document.createElement('dialog');dialog.id='p79PublicShipScheduleDialog';
 dialog.innerHTML='<div class="p79-schedule-dialog-inner"><header class="p79-schedule-dialog-header">'+
  '<div><h2>萬海網站船期</h2><p>資料來源：萬海航運網站；不可混用港務公司資料。</p></div>'+
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
  body.innerHTML='<p class="p79-schedule-dialog-disclaimer">資料同步：'+esc(timeLabel())+'</p>'+
   '<div class="p79-schedule-table-scroll"><table class="p79-schedule-table"><thead><tr>'+
   ['英文船名','中文船名','靠泊碼頭','靠泊時間 ETB','離岸時間 ETD'].map(h=>'<th>'+h+'</th>').join('')+
   '</tr></thead><tbody>'+showing.map(r=>'<tr>'+[r.name,r.localName,r.berth,r.etb,r.etd].map(v=>'<td>'+esc(v||'未提供')+'</td>').join('')+'</tr>').join('')+
   '</tbody></table></div>'+
   (showing.length===1?'<div class="p79-schedule-dialog-actions"><button type="button" data-public-show-all>查看全部 '+rows.length+' 艘</button></div>':'');
 }
 if(!dlg.open)dlg.showModal();
 const all=body.querySelector('[data-public-show-all]');if(all)all.addEventListener('click',()=>showDialog(-1),{once:true});
}
function init(){
 const staff=$(STAFF_ID),admin=$(DASH_ID);
 [staff,admin].filter(Boolean).forEach(el=>el.addEventListener('click',e=>{
  if(e.target.closest('[data-public-ship-retry]')){void refresh(true);return;}
  const item=e.target.closest('[data-public-ship-index]');
  if(item)showDialog(Number(item.dataset.publicShipIndex));
 }));
 $('p79PublicShipRefresh')?.addEventListener('click',()=>void refresh(true));
 $('p79PublicShipAll')?.addEventListener('click',()=>showDialog(-1));
 $('p79ShipScheduleAll')?.addEventListener('click',()=>showDialog(-1));
 $('p79DashRefresh')?.addEventListener('click',()=>void refresh(true));
 // Recent verified public records keep the page usable without re-fetching on
 // every reload. On expiry, the next visible-page check retrieves fresh data.
 restoreRecentSchedule(officialScheduleBase());
 render();
 void refresh();
 g.document.addEventListener('visibilitychange',()=>{
  if(g.document.visibilityState==='visible')void refresh();
  else scheduleNextRead();
 });
 g.addEventListener?.('online',()=>void refresh());
}
g.P79ManualShipSchedule={render,refresh,parseRows,selectCurrentRows,parseTaipeiTime,getChineseName,source:SOURCE};
if(g.document.readyState==='loading')g.document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window!=='undefined'?window:globalThis);

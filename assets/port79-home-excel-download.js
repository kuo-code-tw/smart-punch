/* PORT79 homepage read-only download strip.
 * Gate: authenticated official yearly rows; Yard: account-owned browser data;
 * Vessel: the original guarded export dialog. Never invokes any import/write.
 */
(function(w){
'use strict';
const d=w.document,root=d.getElementById('p79HomeDropImport');
if(!root||root.dataset?.p79Mode!=='download')return;
const $=id=>d.getElementById(id);
const gateKeys=['date','deliverEmpty','pickupEmpty','deliverLoaded','pickupLoaded','truckEntries'];
const gateNames=['日期','交空櫃','領空櫃','交重櫃','領重櫃','本日進站卡車數'];
// Same original fields exported by P79YardDashboard.exportCsv().
const yardKeys=['imp20','imp40','impTeu','exp20','exp40','expTeu',
 'trans20','trans40','transTeu','reefer20','reefer40','reeferTeu',
 'heavyTotal','heavyCap','heavyPct',
 'heavyPlug20Cap','heavyPlug40Cap','heavyPlug20Pct','heavyPlug40Pct',
 'genEmpty20','genEmpty40','genEmptyTeu','pti20Cap','pti40Cap',
 'reeferEmpty20','reeferEmpty40','reeferEmptyTeu','pti20','pti40',
 'emptyPlug20Pct','emptyPlug40Pct','emptyTotal','emptyCap','emptyPct',
 'specialEmpty20','specialEmpty40','specialEmptyTeu','specialHeavy20',
 'specialHeavy40','specialHeavyCount','specialHeavyTeu',
 'longImp20','longImp40','longImpTeu','longExp20','longExp40',
 'longExpTeu','longTrans20','longTrans40','longTransTeu','longTotal'];
let busy=false,lastContext='';
const nodes=Array.from(root.querySelectorAll('[data-p79-drop-kind]'));
const messageNode=d.createElement('p');messageNode.id='p79HomeDownloadStatus';
messageNode.setAttribute('role','status');messageNode.setAttribute('aria-live','polite');
messageNode.hidden=true;
root.insertAdjacentElement('afterend',messageNode);
function session(){
 let user=null,admin=null;
 try{user=JSON.parse(w.sessionStorage.getItem('port79_user_session')||'null')}catch(_){}
 try{admin=JSON.parse(w.sessionStorage.getItem('admin_session')||'null')}catch(_){}
 const role=s=>String(s?.adminRole||s?.role||'').toLowerCase();
 const actor=['superadmin','admin'].includes(role(user))?user:['superadmin','admin'].includes(role(admin))?admin:null;
 const token=String(w.sessionStorage.getItem('port79_user_token')||
  w.sessionStorage.getItem('port79_admin_token')||
  w.sessionStorage.getItem('port79_gc_superadmin_token')||'').trim();
 if(!actor||actor.punchOnly||!token)return null;
 return {actor,role:role(actor),token,identity:JSON.stringify([
  actor.empId||actor.employeeId||actor.id||actor.accountId||actor.email||actor.username||'',token,role(actor)])};
}
function permission(kind,c){
 if(!c)return false;
 if(c.role==='superadmin')return true;
 const s=c.actor;
 if(kind==='gate')return String(s.systemPermissions?.history||'none')!=='none'&&
  s.finePermissions?.history?.['vessel.view']===true;
 if(kind==='yard')return ['view','edit','manage'].includes(String(s.systemPermissions?.efficiency||'').toLowerCase());
 return c.role==='admin'&&String(s.systemPermissions?.efficiency||'').toLowerCase()==='manage'; // Original vessel export guard
}
function refresh(){
 const c=session();root.hidden=!c||!nodes.some(node=>permission(node.dataset.p79DropKind,c));
 for(const node of nodes){
  const kind=node.dataset.p79DropKind,allowed=permission(kind,c);
  node.dataset.p79DownloadAllowed=String(allowed);
  node.setAttribute('aria-disabled',String(!allowed));
  if('disabled'in node)node.disabled=busy||!allowed;
  node.title=allowed?
   (kind==='gate'?'下載本年度正式 Gate 進出站 Excel':kind==='yard'?'下載此帳號在本瀏覽器儲存的 Yard Excel':'進入船舶管理的正式 Excel 匯出視窗'):
   '目前帳號沒有這一項下載權限';
 }
 if(c?.identity!==lastContext){lastContext=c?.identity||'';messageNode.hidden=true;}
}
function message(text,kind='info'){
 messageNode.hidden=false;messageNode.dataset.tone=kind;
 messageNode.textContent=String(text||'');
}
function assertSame(c){
 const now=session();
 if(!now||now.identity!==c.identity)throw Error('登入身分已變更，停止下載');
}
function excel(rows,filename,sheet,c){
 assertSame(c);
 const XLSX=w.XLSX;
 if(!XLSX?.utils?.book_new||!XLSX.utils.aoa_to_sheet||!XLSX.writeFile)
  throw Error('Excel 下載元件尚未載入，請檢查網路連線');
 if(!Array.isArray(rows)||rows.length<2)throw Error('目前沒有可下載的正式資料');
 const book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),sheet);
 assertSame(c);
 XLSX.writeFile(book,filename,{bookType:'xlsx',compression:true});
}
function validDate(x){
 const date=String(x||'').replaceAll('/','-');
 if(!/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date))return false;
 const d=new Date(date+'T00:00:00Z');
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===date;
}
async function gate(c){
 const raw=String(w.sessionStorage.getItem('port79_gas_url')||'').trim();
 if(!raw)throw Error('尚未取得正式 Gate 雲端連線設定，不能下載未經核對的資料');
 const url=new URL(raw);
 if(url.origin!=='https://script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname))
  throw Error('正式 Gate 雲端網址尚未設定，不能提供不明來源的檔案');
 const year=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric'}).format(new Date());
 url.searchParams.set('action','gateStatsReadYear');url.searchParams.set('year',year);
 url.searchParams.set('token',c.token);url.searchParams.set('gcToken',c.token);
 url.searchParams.set('_',String(Date.now()));
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),45000);
 let data;
 try{
  const res=await w.fetch(url.toString(),{method:'GET',cache:'no-store',signal:ctl.signal});
  data=await res.json();
  if(!res.ok||data?.ok!==true||data.source!=='port79-gate-daily'||String(data.year)!==year||!Array.isArray(data.rows))
   throw Error(String(data?.error||'Gate 正式年度查詢尚未部署或資料格式不正確'));
 }catch(error){
  if(error?.name==='AbortError')throw Error('Gate 雲端查詢逾時，沒有下載未經核對的資料');
  throw error;
 }finally{clearTimeout(timer)}
 assertSame(c);
 const indexed=new Map();
 for(const rawRow of data.rows){
  const date=String(rawRow?.date||'').replaceAll('/','-');
  if(!validDate(date)||date.slice(0,4)!==year)throw Error('Gate 雲端有日期不符或無法確認的資料，已停止下載');
  const values=gateKeys.slice(1).map(k=>Number(rawRow[k]));
  if(gateKeys.slice(1).some(k=>rawRow[k]===null||rawRow[k]===undefined||String(rawRow[k]).trim()==='')||
     values.some(v=>!Number.isSafeInteger(v)||v<0))
   throw Error(date+' Gate 原始櫃量或車次無效，已停止下載');
  indexed.set(date,[date,...values]);
 }
 if(!indexed.size)throw Error(year+' 年尚無正式 Gate 進出站資料可下載');
 const rows=[gateNames,...Array.from(indexed.values()).sort((a,b)=>a[0].localeCompare(b[0]))];
 excel(rows,'PORT79_Gate進出站_'+year+'.xlsx','Gate 進出站',c);
 return 'Gate｜'+year+' 年已送出 '+indexed.size+' 天正式資料的 Excel 下載';
}
function yard(c){
 const account=String(c.actor.empId||c.actor.employeeId||c.actor.id||c.actor.accountId||
  c.actor.email||c.actor.username||'').trim();
 if(!account)throw Error('無法辨識目前的 Yard 帳號，不能跨帳號下載');
 const key='p79_yard_private_v1_'+encodeURIComponent(account.slice(0,120));
 const stored=w.localStorage.getItem(key);
 if(!stored)throw Error('此帳號在目前電腦尚無 Yard 儲量資料，沒有可下載的內容');
 let snapshot;try{snapshot=JSON.parse(stored)}catch(_){throw Error('本機 Yard 資料無法解析，未下載錯誤檔案')}
 if(!Array.isArray(snapshot?.rows)||snapshot.rows.length===0||snapshot.rows.length>3000)
  throw Error('目前 Yard 資料為空或超出可驗證上限，沒有產生下載檔');
 const seen=new Set();
 const rows=snapshot.rows.map(r=>{
  if(!validDate(r?.date)||seen.has(r.date))throw Error('Yard 日期資料不正確或重複，已停止下載');
  seen.add(r.date);
  const values=yardKeys.map(k=>r[k]);
  if(values.some(v=>v===null||v===undefined||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<0))
   throw Error('Yard 原始數值有缺漏，未產生不完整 Excel');
  const near=(a,b)=>Math.abs(Number(a)-Number(b))<=0.065;
  if(!near(r.heavyTotal,Number(r.impTeu)+Number(r.expTeu)+Number(r.transTeu)+Number(r.reeferTeu))||
     !near(r.emptyTotal,Number(r.genEmptyTeu)+Number(r.reeferEmptyTeu))||
     !near(r.longTotal,Number(r.longImpTeu)+Number(r.longExpTeu)+Number(r.longTransTeu))||
     !near(r.specialHeavyCount,Number(r.specialHeavy20)+Number(r.specialHeavy40)))
   throw Error(r.date+' Yard 分類小計與原始資料不符，已停止下載');
  return [r.date,...values.map(v=>Number(v))];
 }).sort((a,b)=>a[0].localeCompare(b[0]));
 assertSame(c);
 excel([['日期',...yardKeys],...rows],
  'PORT79_Yard儲量_'+rows[0][0]+'_'+rows[rows.length-1][0]+'.xlsx','Yard 儲量',c);
 return 'Yard｜已送出 '+rows.length+' 天此帳號本機資料的 Excel 下載（非雲端資料）';
}
async function start(kind){
 const c=session();
 if(!permission(kind,c)){message('目前帳號沒有 '+kind+' 下載權限，資料不會提供下載','error');return false;}
 if(busy)return false;
 if(kind==='vessel'){
  // Original module owns the Excel selection, complete cloud scope and the
  // audit of cross-month vessel records. Never export a guessed home snapshot.
  w.location.assign('./aqc-efficiency/?homeDownload=1');
  return true;
 }
 busy=true;refresh();message('正在核對 '+(kind==='gate'?'Gate 正式雲端':'Yard 本機')+'資料並產生 Excel…');
 try{
  const result=kind==='gate'?await gate(c):await yard(c);
  message(result+'；如未看到檔案，請檢查瀏覽器下載設定','success');return true;
 }catch(error){
  message(String(error?.message||error),'error');return false;
 }finally{busy=false;refresh()}
}
for(const zone of nodes){
 const kind=zone.dataset.p79DropKind;
 zone.addEventListener('click',()=>void start(kind));
 zone.addEventListener('keydown',event=>{
  if(event.key==='Enter'||event.key===' '){event.preventDefault();void start(kind);}
 });
 zone.addEventListener('dragover',event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='none';});
 zone.addEventListener('drop',event=>{event.preventDefault();event.stopPropagation();
  message('這排已改為 Excel 資料下載。若要上傳，請進入原 Gate、Yard 或船舶管理頁面','info');
 });
}
w.Port79HomeExcelDownload={start,refresh};
w.Port79HomeDropImport={refresh,canUse:()=>!!session()};
w.addEventListener?.('focus',refresh);
refresh();
})(window);

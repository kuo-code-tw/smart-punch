(function(g){
'use strict';
var d=g.document,$=id=>d.getElementById(id);
if(!d||!$('gateFile'))return;
var book=null,sourceFile=null,days=[],serviceCheck=0,serviceReady=false;
var names={deliverEmpty:'交空櫃',pickupEmpty:'領空櫃',deliverLoaded:'交重櫃',
 pickupLoaded:'領重櫃',truckEntries:'拖車車次'};
function message(text,kind){
 var el=$('gateMessage');el.textContent=String(text);el.dataset.kind=kind||'info';
}
function text(v){return String(v??'').trim();}
function amount(raw,label){
 var s=text(raw).replace(/,/g,'');
 if(!/^\d+$/.test(s))throw Error(label+' 不是有效非負整數：'+String(raw));
 var n=Number(s);
 if(!Number.isSafeInteger(n)||n>1000000)throw Error(label+' 數值超出範圍');
 return n;
}
function day(v){
 if(typeof v==='number'&&g.XLSX?.SSF?.parse_date_code){
  var p=g.XLSX.SSF.parse_date_code(v);
  if(p)v=[p.y,String(p.m).padStart(2,'0'),String(p.d).padStart(2,'0')].join('-');
 }
 var s=text(v);
 var m=/^(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})/.exec(s);
 if(!m)throw Error('無法辨識日期 '+s);
 var iso=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
 var dt=new Date(iso+'T00:00:00Z');
 if(!Number.isFinite(dt.getTime())||dt.toISOString().slice(0,10)!==iso)throw Error('日期不存在 '+iso);
 return iso;
}
function findGateMatrix(name){
 var sheet=book.Sheets[name];
 if(!sheet)throw Error('找不到選擇的工作表');
 var data=g.XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:true});
 var label=(r,c)=>text(data[r]?.[c]).replace(/\s+/g,'');
 for(var pair of [[1,1,'交空櫃'],[2,1,'交重櫃'],[3,1,'交空櫃'],[4,1,'交重櫃'],
  [6,1,'領空櫃'],[7,1,'領重櫃'],[8,1,'領空櫃'],[9,1,'領重櫃']]){
  if(label(pair[0],pair[1])!==pair[2])throw Error('工作表「'+name+'」的分類列與 Gate 報表不符；第 '+(pair[0]+1)+' 列應為「'+pair[2]+'」');
 }
 if(!label(14,0).includes('本日進站卡車數'))throw Error('找不到第15列「本日進站卡車數」');
 var results=[],seen=new Set();
 for(var col=2;col<(data[0]?.length||0);col++){
  var header=data[0][col];
  if(text(header)==='')continue;
  var iso=day(header);
  if(seen.has(iso))throw Error('檔案內有重複日期 '+iso);
  seen.add(iso);
  function n(row){return amount(data[row]?.[col],iso+' 第 '+(row+1)+' 列')}
  var de=n(1)+n(3),dl=n(2)+n(4),pe=n(6)+n(8),pl=n(7)+n(9),
   truck=n(14),total=de+pe+dl+pl;
  if(de+dl!==n(5)||pe+pl!==n(10)||total!==n(11))
    throw Error(iso+' 的每日交櫃、領櫃或總櫃量與原 Excel 小計不符，已停止匯入');
  results.push({date:iso,deliverEmpty:de,pickupEmpty:pe,
   deliverLoaded:dl,pickupLoaded:pl,truckEntries:truck});
 }
 if(!results.length||results.length>366)throw Error('未找到有效日期，或單次超過366天');
 return results.sort((a,b)=>a.date.localeCompare(b.date));
}
function render(){
 var totals=Object.fromEntries(Object.keys(names).map(k=>[k,days.reduce((sum,r)=>sum+r[k],0)]));
 var table=$('gatePreviewRows');table.textContent='';
 days.forEach(function(row){
  var tr=d.createElement('tr');
  var cols=[row.date,row.deliverEmpty,row.pickupEmpty,row.deliverLoaded,row.pickupLoaded,
   row.deliverEmpty+row.pickupEmpty+row.deliverLoaded+row.pickupLoaded,row.truckEntries];
  cols.forEach(function(value){
   var td=d.createElement('td');td.textContent=typeof value==='number'?value.toLocaleString('zh-TW'):value;
   tr.appendChild(td);
  });
  table.appendChild(tr);
 });
 var display={gateDe:totals.deliverEmpty,gatePe:totals.pickupEmpty,
  gateDl:totals.deliverLoaded,gatePl:totals.pickupLoaded,
  gateTruck:totals.truckEntries,
  gateTotal:totals.deliverEmpty+totals.pickupEmpty+totals.deliverLoaded+totals.pickupLoaded};
 Object.keys(display).forEach(k=>$(k).textContent=display[k].toLocaleString('zh-TW'));
 $('gateRange').textContent=days.length+' 個日期：'+days[0].date+' ～ '+days[days.length-1].date+
  '。同日期重新匯入會覆寫，不會加進去第二次。';
 $('gateResult').hidden=false;
 // Never enable cloud save merely because a local Excel preview is valid.
 // A deployed and authenticated Gate read route must succeed first.
 $('gateSave').disabled=true;
 void verifyGateService();
}
async function chooseFile(){
 ++serviceCheck;serviceReady=false;
 sourceFile=$('gateFile').files?.[0]||null;book=null;days=[];
 $('gateResult').hidden=true;$('gateSave').disabled=true;$('gatePreview').disabled=true;
 $('gateSheet').disabled=true;$('gateSheet').textContent='';
 if(!sourceFile){message('請先選擇 Gate 檔案');return;}
 if(!/\.(xlsx|xls|csv)$/i.test(sourceFile.name))return message('只支援 xlsx、xls 或 csv','error');
 if(sourceFile.size>10*1024*1024)return message('檔案不能超過 10MB','error');
 if(!g.XLSX)return message('Excel 讀取元件無法載入，請檢查網路連線後重新整理','error');
 try{
  message('正在讀取 Excel 工作表…');
  var bytes=await sourceFile.arrayBuffer();
  book=g.XLSX.read(bytes,{type:'array',cellHTML:false,cellDates:false});
  if(!book.SheetNames?.length)throw Error('Excel 不含工作表');
  book.SheetNames.forEach(function(name){
   var option=d.createElement('option');option.value=name;option.textContent=name;
   $('gateSheet').appendChild(option);
  });
  var first=book.SheetNames.find(name=>{
   try{return text(g.XLSX.utils.sheet_to_json(book.Sheets[name],{header:1,defval:'',raw:false})?.[1]?.[1]).includes('交空櫃')}
   catch(_){return false}
  })||book.SheetNames[0];
  $('gateSheet').value=first;
  $('gateSheet').disabled=false;$('gatePreview').disabled=false;
  message('檔案已讀取，請按「讀取並預覽」檢查每天的數字。');
 }catch(err){message('讀取失敗：'+String(err.message||err),'error');}
}
function preview(){
 if(!book)return;
 try{
  days=findGateMatrix($('gateSheet').value);
  render();
  message('每日交領櫃分類、合計及拖車車次均已核對，共 '+days.length+' 天。');
 }catch(err){
  days=[];$('gateResult').hidden=true;$('gateSave').disabled=true;
  message('預覽失敗：'+String(err.message||err),'error');
 }
}
function csvExport(){
 if(!days.length)return;
 var headers=['日期','月份','年度','交空櫃','領空櫃','交重櫃','領重櫃','總櫃量','進站拖車車次','匯入來源'];
 var rows=[headers].concat(days.map(r=>[r.date,r.date.slice(0,7),Number(r.date.slice(0,4)),
  r.deliverEmpty,r.pickupEmpty,r.deliverLoaded,r.pickupLoaded,
  r.deliverEmpty+r.pickupEmpty+r.deliverLoaded+r.pickupLoaded,
  r.truckEntries,sourceFile?.name||'Gate.xlsx']));
 var data='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 var u=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));
 var a=d.createElement('a');a.href=u;a.download='PORT79-Gate-'+days[0].date+'-'+days[days.length-1].date+'.csv';
 d.body.appendChild(a);a.click();a.remove();g.setTimeout(()=>URL.revokeObjectURL(u),1000);
}
function gateServiceError(err){
 var raw=String(err&&err.message||err||'');
 if(/未知操作|unknown[ _-]*action|gateStats(ReadYear|Import)|未支援.*操作/i.test(raw))
  return '正式 PORT79 Google Apps Script 尚未部署 Gate 匯入服務（gateStatsReadYear／gateStatsImport）。這不是 Excel 格式或前端 action 參數錯誤。請先完成後端部署；現在可以下載整理 CSV，或在 Google 試算表按日期更新。';
 return '無法驗證正式 Gate 資料服務：'+raw.slice(0,180)+'。目前已保留預覽，並暫停雲端寫入。';
}
async function verifyGateService(){
 var id=++serviceCheck;
 serviceReady=false;
 $('gateSave').disabled=true;
 if(!days.length)return;
 var key;
 try{key=auth();}catch(err){
  if(id===serviceCheck)message(String(err.message||err),'error');
  return;
 }
 message('正在確認正式 Google Apps Script 是否已啟用 Gate 匯入服務…');
 try{
  var url=new URL(key.base);
  url.searchParams.set('action','gateStatsReadYear');
  url.searchParams.set('year',days[0].date.slice(0,4));
  url.searchParams.set('gcToken',key.token);
  url.searchParams.set('token',key.token);
  var response=await g.fetch(url.toString(),{cache:'no-store',redirect:'follow'});
  if(!response.ok)throw Error('HTTP '+response.status);
  var result=await response.json();
  if(result?.ok!==true||result?.source!=='port79-gate-daily'||
     String(result?.year)!==days[0].date.slice(0,4)||!Array.isArray(result?.rows))
    throw Error(result?.error||'gateStatsReadYear 回傳格式不符，後端尚未準備就緒');
  if(id!==serviceCheck||!days.length)return;
  serviceReady=true;
  $('gateSave').disabled=false;
  message('正式 Gate 雲端查詢服務已驗證，可以送出每日資料。相同日期會更新原紀錄，不會重複累加。','success');
 }catch(err){
  if(id!==serviceCheck)return;
  serviceReady=false;
  $('gateSave').disabled=true;
  message(gateServiceError(err),'error');
 }
}
function auth(){
 var base=text(g.sessionStorage?.getItem('port79_gas_url'));
 var token=text(g.sessionStorage?.getItem('port79_user_token')||g.sessionStorage?.getItem('port79_admin_token'));
 var session=null;
 try{session=JSON.parse(g.sessionStorage?.getItem('port79_user_session')||'null')}catch(_){}
 var role=text(session?.adminRole||session?.role).toLowerCase();
 var fine=session?.finePermissions?.history||{};
 var allowed=!!session&&!session.punchOnly&&(role==='superadmin'||(
  role==='admin'&&session?.systemPermissions?.history==='edit'&&fine['vessel.edit']===true));
 if(!allowed)throw Error('請用有 Gate 匯入權限的 PORT79 管理員帳號登入');
 if(!token)throw Error('找不到 PORT79 登入權杖，請先回首頁重新登入');
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(base))
  throw Error('找不到正式 Google Apps Script 資料服務網址');
 return {base,token};
}
async function save(){
 if(!days.length||!sourceFile||!serviceReady)return;
 var key;
 try{key=auth()}catch(err){message(String(err.message||err),'error');return;}
 var button=$('gateSave');
 button.disabled=true;button.textContent='正在傳送至正式資料庫…';
 message('正在傳送 Gate 資料到 PORT79 雲端資料庫，請勿關閉頁面。');
 try{
  var body=new URLSearchParams();
  body.set('action','gateStatsImport');
  body.set('token',key.token);body.set('gcToken',key.token);
  body.set('fileName',sourceFile.name);
  body.set('rows',JSON.stringify(days));
  var response=await fetch(key.base,{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
   body:body.toString(),redirect:'follow',credentials:'omit'});
  if(!response.ok)throw Error('HTTP '+response.status);
  var result=await response.json();
  if(result?.ok!==true||result?.source!=='port79-gate-daily')
   throw Error(result?.error||'正式 GAS Gate 匯入接口尚未部署');
  message('已寫入正式資料庫：新增 '+result.added+' 天、更新 '+result.updated+
   ' 天。月、年統計會從每日資料自動重新加總。','success');
 }catch(err){
  var raw=String(err.message||err);
  if(/未知操作|unknown[ _-]*action|gateStats(ReadYear|Import)/i.test(raw)){
   serviceReady=false;
   message(gateServiceError(err),'error');
  }else{
   message('目前無法確認雲端儲存結果：'+raw.slice(0,160)+
    '。請先開啟正式試算表核對日期，避免不確定時重複操作。','error');
  }
 }finally{button.disabled=!serviceReady;button.textContent='確認寫入正式資料庫';}
}
$('gateFile').addEventListener('change',chooseFile);
$('gateSheet').addEventListener('change',()=>{++serviceCheck;serviceReady=false;days=[];$('gateResult').hidden=true;$('gateSave').disabled=true});
$('gatePreview').addEventListener('click',preview);
$('gateDownload').addEventListener('click',csvExport);
$('gateSave').addEventListener('click',save);
})(window);

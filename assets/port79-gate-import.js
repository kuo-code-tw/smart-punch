(function(g){
'use strict';
var d=g.document,$=id=>d.getElementById(id);
if(!d||!$('gateFile'))return;
var book=null,sourceFile=null,days=[],serviceCheck=0,serviceReady=false,selectionId=0,saving=false;
var previewMode='day',previewPage=0,previewPageSize=8,skippedDates=[];
var names={deliverEmpty:'交空櫃',pickupEmpty:'領空櫃',deliverLoaded:'交重櫃',
 pickupLoaded:'領重櫃',truckEntries:'拖車車次'};
function parentDialog(){
 try{return g.parent&&g.parent!==g?g.parent.P79GateDialog:null;}catch(_){return null;}
}
function message(text,kind){
 if(skippedDates.length)text+='\n略過未填日期：'+skippedDates.join('、')+'（未寫入，也未覆蓋既有資料）';
 var bridge=parentDialog();if(bridge)bridge.update(g,String(text),kind||'info');
 var el=$('gateMessage');el.textContent=String(text);el.dataset.kind=kind||'info';
 var dialogStatus=$('gateImportDialogStatus');
 if(dialogStatus){dialogStatus.textContent=String(text);dialogStatus.dataset.kind=kind||'info';}
 if($('gateImportDialog'))$('gateImportDialog').dataset.kind=kind||'info';
}
function text(v){return String(v??'').trim();}
function amount(raw,label){
 // Excel caches often store whole counts as 166.0. Use the numeric cell value
 // instead of rejecting a harmless display format such as "166.00".
 var s=typeof raw==='number'?raw:text(raw).replace(/,/g,'');
 if(typeof s==='string'&&!/^\d+(?:\.0+)?$/.test(s))
  throw Error(label+' 不是有效非負整數：'+String(raw));
 var n=Number(s);
 if(!Number.isSafeInteger(n)||n<0||n>1000000)
  throw Error(label+' 數值超出有效整數範圍：'+String(raw));
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
// Preserve absolute Excel row/column coordinates even when the worksheet !ref
// begins at B2, C1, etc.  Gate signatures are defined in physical A1 positions.
function gateSheetRows(sheet){
 var utils=g.XLSX.utils;
 var options={header:1,defval:'',raw:true,blankrows:true};
 if(sheet['!ref']&&typeof utils.decode_range==='function'&&typeof utils.encode_range==='function'){
  var bounds=utils.decode_range(sheet['!ref']);
  bounds.s.r=0;bounds.s.c=0;
  options.range=utils.encode_range(bounds);
 }
 return utils.sheet_to_json(sheet,options);
}
function findGateMatrix(name){
 var sheet=book.Sheets[name];
 if(!sheet)throw Error('找不到選擇的工作表');
 var data=gateSheetRows(sheet);
 var label=(r,c)=>text(data[r]?.[c]).replace(/\s+/g,'');
 for(var pair of [[1,1,'交空櫃'],[2,1,'交重櫃'],[3,1,'交空櫃'],[4,1,'交重櫃'],
  [6,1,'領空櫃'],[7,1,'領重櫃'],[8,1,'領空櫃'],[9,1,'領重櫃']]){
  var found=label(pair[0],pair[1]);
  if(found!==pair[2]){
   var cell='B'+(pair[0]+1);
   var safe=found&&found.length<=24&&!/[\x00-\x1f\ufffd]/.test(found)&&/^[\p{L}\p{N}\s_.()/-]+$/u.test(found)?'「'+found+'」':'無法辨識的字元或空白';
   throw Error('工作表「'+name+'」不符合 Gate 原報表；'+cell+' 應為「'+pair[2]+'」，實際讀到 '+safe+'。未寫入任何資料，請核對報表格式');
  }
 }
 if(!label(14,0).includes('本日進站卡車數'))throw Error('找不到第15列「本日進站卡車數」');
 var results=[],seen=new Set();skippedDates=[];
 for(var col=2;col<(data[0]?.length||0);col++){
  var header=data[0][col];
  if(text(header)==='')continue;
  var iso=day(header);
  if(seen.has(iso))throw Error('檔案內有重複日期 '+iso);
  seen.add(iso);
  var countRows=[1,2,3,4,5,6,7,8,9,10,11,14];
  if(countRows.every(row=>text(data[row]?.[col])==='')){
   var letters='',column=col+1;
   while(column){column--;letters=String.fromCharCode(65+column%26)+letters;column=Math.floor(column/26);}
   if(countRows.some(row=>sheet[letters+(row+1)]?.f))throw Error(iso+' 的公式沒有計算結果，請先在 Excel 重新計算並儲存');
   skippedDates.push(iso);continue;
  }
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
function mondayOf(date){
 var d=new Date(date+'T00:00:00Z');
 d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
 return d.toISOString().slice(0,10);
}
function plusDays(date,offset){
 var d=new Date(date+'T00:00:00Z');
 d.setUTCDate(d.getUTCDate()+offset);
 return d.toISOString().slice(0,10);
}
function groupPreviewRows(source,period){
 var buckets=new Map();
 source.forEach(function(row){
  var key=period==='day'?row.date:period==='week'?mondayOf(row.date):
   period==='month'?row.date.slice(0,7):row.date.slice(0,4);
  if(!buckets.has(key))buckets.set(key,{date:key,deliverEmpty:0,pickupEmpty:0,
   deliverLoaded:0,pickupLoaded:0,truckEntries:0,days:0});
  var target=buckets.get(key);
  Object.keys(names).forEach(k=>{target[k]+=row[k];});
  target.days++;
 });
 return [...buckets.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function labelFor(date,period){
 if(period==='day')return date;
 if(period==='week')return date.slice(5).replace('-','/')+'－'+plusDays(date,6).slice(5).replace('-','/')+'（'+date.slice(0,4)+'）';
 if(period==='month')return date.slice(0,4)+' / '+date.slice(5);
 return date+' 年';
}
function renderPreviewTable(){
 var titles={day:'每日明細',week:'每週合計',month:'每月合計',year:'每年合計'};
 var headings={day:'日期',week:'週一～週日',month:'月份',year:'年度'};
 var groups=groupPreviewRows(days,previewMode);
 var pages=Math.max(1,Math.ceil(groups.length/previewPageSize));
 previewPage=Math.max(0,Math.min(previewPage,pages-1));
 var table=$('gatePreviewRows');table.textContent='';
 groups.slice(previewPage*previewPageSize,(previewPage+1)*previewPageSize).forEach(function(row){
  var tr=d.createElement('tr');
  var cols=[labelFor(row.date,previewMode),row.deliverEmpty,row.pickupEmpty,
   row.deliverLoaded,row.pickupLoaded,
   row.deliverEmpty+row.pickupEmpty+row.deliverLoaded+row.pickupLoaded,row.truckEntries];
  var labels=[headings[previewMode],'交空','領空','交重','領重','總櫃量','拖車車次'];
  cols.forEach(function(value,i){
   var td=d.createElement('td');
   td.textContent=typeof value==='number'?value.toLocaleString('zh-TW'):value;
   td.dataset.label=labels[i];tr.appendChild(td);
  });
  table.appendChild(tr);
 });
 Object.entries({Day:'day',Week:'week',Month:'month',Year:'year'}).forEach(function(pair){
  $('gateMode'+pair[0])?.setAttribute?.('aria-pressed',String(previewMode===pair[1]));
 });
 if($('gatePeriodHeading'))$('gatePeriodHeading').textContent=headings[previewMode];
 if($('gateDetailTitle'))$('gateDetailTitle').textContent=titles[previewMode];
 if($('gateDetailCount'))$('gateDetailCount').textContent='共 '+groups.length+' 筆期間合計';
 if($('gatePageLabel'))$('gatePageLabel').textContent='第 '+(previewPage+1)+' / '+pages+' 頁';
 if($('gatePagePrev'))$('gatePagePrev').disabled=previewPage===0;
 if($('gatePageNext'))$('gatePageNext').disabled=previewPage>=pages-1;
}
function changePreviewMode(next){
 if(!['day','week','month','year'].includes(next))return;
 previewMode=next;previewPage=0;renderPreviewTable();
}
function render(autoSave){
 var totals=Object.fromEntries(Object.keys(names).map(k=>[k,days.reduce((sum,r)=>sum+r[k],0)]));
 var display={gateDe:totals.deliverEmpty,gatePe:totals.pickupEmpty,
  gateDl:totals.deliverLoaded,gatePl:totals.pickupLoaded,
  gateTruck:totals.truckEntries,
  gateTotal:totals.deliverEmpty+totals.pickupEmpty+totals.deliverLoaded+totals.pickupLoaded};
 Object.keys(display).forEach(k=>$(k).textContent=display[k].toLocaleString('zh-TW'));
 $('gateRange').textContent='檔案日期 '+days[0].date+' ～ '+days[days.length-1].date+
  ' · 共 '+days.length+' 天 · 同日期寫入採覆蓋、不重複累加';
 $('gateResult').hidden=false;
 previewPage=0;renderPreviewTable();
 // Switching preview tabs never triggers uploads. New files always require a fresh
 // authenticated read-route verification before enabling a save.
 $('gateSave').disabled=true;
 void verifyGateService(!!autoSave);
}
async function chooseFile(droppedFile){
 if(saving){message('上一份 Gate 檔案正在寫入，完成後才能匯入下一份。','error');return;}
 var selection=++selectionId;
 ++serviceCheck;serviceReady=false;
 sourceFile=droppedFile&&typeof droppedFile.arrayBuffer==='function'?
  droppedFile:($('gateFile').files?.[0]||null);
 book=null;days=[];skippedDates=[];
 $('gateResult').hidden=true;$('gateSave').disabled=true;$('gatePreview').disabled=true;
 $('gateSheet').disabled=true;$('gateSheet').textContent='';
 if(!sourceFile){message('請先選擇 Gate 檔案');return;}
 var dialog=$('gateImportDialog');
 if($('gateImportDialogFile'))$('gateImportDialogFile').textContent=sourceFile.name;
 var bridge=parentDialog();
 if(bridge)bridge.open(g,sourceFile.name);
 else if(dialog&&!dialog.open)dialog.showModal?.();
 message('已收到檔案，正在準備讀取與核對…');
 if(!/\.(xlsx|xls|csv)$/i.test(sourceFile.name))return message('只支援 xlsx、xls 或 csv','error');
 if(sourceFile.size>10*1024*1024)return message('檔案不能超過 10MB','error');
 if(!g.XLSX)return message('Excel 讀取元件無法載入，請檢查網路連線後重新整理','error');
 try{
  message('正在讀取並核對 '+sourceFile.name+' …');
  var bytes=await sourceFile.arrayBuffer();
  if(selection!==selectionId)return;
  if(/\.xlsx$/i.test(sourceFile.name)){
   var sig=new Uint8Array(bytes,0,Math.min(bytes.byteLength,8));
   var zip=sig[0]===0x50&&sig[1]===0x4b&&(
    (sig[2]===3&&sig[3]===4)||(sig[2]===5&&sig[3]===6)||(sig[2]===7&&sig[3]===8));
   var ole=[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((n,i)=>sig[i]===n);
   if(!zip&&!ole)throw Error('檔案內容不是有效 Excel 活頁簿；雖然名為 .xlsx，檔案實際不是 ZIP/Excel 格式。請使用真正的 Excel 原始檔');
  }
  // Files passed by the homepage retain its ArrayBuffer realm. SheetJS
  // must receive a byte view created inside this importing page.
  book=g.XLSX.read(new Uint8Array(bytes),{type:'array',cellHTML:false,cellDates:false});
  if(!book.SheetNames?.length)throw Error('Excel 不含工作表');
  book.SheetNames.forEach(function(name){
   var option=d.createElement('option');option.value=name;option.textContent=name;
   $('gateSheet').appendChild(option);
  });
  var first=book.SheetNames.find(name=>{
   try{return text(gateSheetRows(book.Sheets[name])?.[1]?.[1]).replace(/\s+/g,'')==='交空櫃'}
   catch(_){return false}
  })||book.SheetNames[0];
  $('gateSheet').value=first;
  $('gateSheet').disabled=false;$('gatePreview').disabled=false;
  preview(true);
 }catch(err){
  if(selection===selectionId)message('讀取失敗：'+String(err.message||err),'error');
 }
}
function preview(autoSave){
 if(!book||saving)return;
 try{
  days=findGateMatrix($('gateSheet').value);
  message('每日交領櫃分類、合計及拖車車次均已核對，共 '+days.length+
   ' 天。'+(autoSave===true?'正在確認正式資料庫寫入權限…':''));
  render(autoSave===true);
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
async function verifyGateService(autoSave){
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
  if(autoSave===true)await save();
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
// Only a definitive server response stating Gate did not start writing can
// be retried safely. Never retry unknown HTTP failures, timeouts or partial writes.
function gateNotStartedBusy(result){
 if(result?.ok!==false)return false;
 var reason=String(result.error||'');
 return (/本次\s*Gate\s*尚未開始匯入/i.test(reason)&&/其他雲端寫入|正在處理/.test(reason))||
  /其他管理員正在匯入，請稍後重試/.test(reason);
}
async function save(){
 if(!days.length||!sourceFile||!serviceReady||saving)return;
 var key;
 try{key=auth()}catch(err){message(String(err.message||err),'error');return;}
 var button=$('gateSave');
 saving=true;
 button.disabled=true;button.textContent='正在傳送至正式資料庫…';
 message('正在傳送 Gate 資料到 PORT79 雲端資料庫，請勿關閉頁面。');
 try{
  var body=new URLSearchParams();
  body.set('action','gateStatsImport');
  body.set('token',key.token);body.set('gcToken',key.token);
  body.set('fileName',sourceFile.name);
  body.set('rows',JSON.stringify(days));
  var currentSelection=selectionId,currentFile=sourceFile;
  var result=null,attempt=0,delays=[5000,10000];
  while(true){
   // Never resubmit a previous session's data or another file.
   var live=auth();
   if(live.token!==key.token||live.base!==key.base||
      currentSelection!==selectionId||currentFile!==sourceFile)
    throw Error('帳號或 Gate 檔案已變更，已停止重送；請重新選檔');
   var response=await g.fetch(key.base,{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
    body:body.toString(),redirect:'follow',credentials:'omit'});
   if(!response.ok)throw Error('HTTP '+response.status);
   result=await response.json();
   if(result?.ok===true&&result.source==='port79-gate-daily')break;
   if(!gateNotStartedBusy(result))
    throw Error(result?.error||'正式 GAS Gate 匯入接口尚未部署');
   if(attempt===delays.length){
    message('Gate 雲端持續有其他寫入，已等待並重試 '+attempt+
     ' 次；伺服器確認本次 Gate 尚未開始匯入，原 Excel 與預覽保留。請稍後再操作。','error');
    return;
   }
   var delay=delays[attempt++];
   message('Gate 雲端正在處理其他資料，伺服器確認本次尚未開始寫入。'+
    '將於 '+delay/1000+' 秒後安全重試（'+attempt+'/'+delays.length+'），請勿關閉視窗。','info');
   await new Promise(resolve=>g.setTimeout(resolve,delay));
  }
  message('已寫入正式資料庫：新增 '+result.added+' 天、更新 '+result.updated+
   ' 天。日、週、月、年統計將自動重新加總。','success');
  // Only a confirmed backend success refreshes the official read-only view.
  void g.P79GateLive?.refresh?.(days[days.length-1].date);
  // Notify the approved dashboard in the parent vessel-system tab after confirmed cloud save.
  if(g.parent&&g.parent!==g){
   try{g.parent.postMessage({type:'p79-gate-data-updated'},g.location.origin);}catch(_){}
  }
  var completedSelection=selectionId;
  g.setTimeout(function(){
   if(selectionId!==completedSelection)return;
   var bridge=parentDialog();
   if(bridge)bridge.close(g);else $('gateImportDialog')?.close?.();
  },1000);
 }catch(err){
  var raw=String(err.message||err);
  if(/未知操作|unknown[ _-]*action|gateStats(ReadYear|Import)/i.test(raw)){
   serviceReady=false;
   message(gateServiceError(err),'error');
  }else{
   message('目前無法確認雲端儲存結果：'+raw.slice(0,160)+
    '。請先開啟正式試算表核對日期，避免不確定時重複操作。','error');
  }
 }finally{saving=false;button.disabled=!serviceReady;button.textContent='寫入正式資料';}
}
Object.entries({Day:'day',Week:'week',Month:'month',Year:'year'}).forEach(function(pair){
 $('gateMode'+pair[0])?.addEventListener('click',()=>changePreviewMode(pair[1]));
});
$('gatePagePrev')?.addEventListener('click',()=>{if(previewPage>0){previewPage--;renderPreviewTable();}});
$('gatePageNext')?.addEventListener('click',()=>{
 if((previewPage+1)*previewPageSize<groupPreviewRows(days,previewMode).length){previewPage++;renderPreviewTable();}
});
// Drag/drop works over the entire embedded Gate page; the compact bar is also a file picker.
var dropZone=$('gateDropZone');
function stopFileDrop(e){
 if(!e?.dataTransfer)return false;
 var types=Array.from(e.dataTransfer.types||[]);
 if(!types.includes('Files'))return false;
 e.preventDefault();return true;
}
function handleDrop(e){
 if(!stopFileDrop(e))return;
 e.stopPropagation?.();
 dropZone?.classList?.remove?.('is-dragover');
 var files=Array.from(e.dataTransfer.files||[]);
 if(files.length!==1){message('一次只能匯入一份 Gate Excel／CSV 檔案。','error');return;}
 void chooseFile(files[0]);
}
dropZone?.addEventListener('click',()=>$('gateFile').click());
dropZone?.addEventListener('keydown',e=>{
 if(e.key==='Enter'||e.key===' '){e.preventDefault();$('gateFile').click();}
});
dropZone?.addEventListener('dragover',e=>{
 if(stopFileDrop(e)){e.stopPropagation?.();dropZone?.classList?.add?.('is-dragover');}
});
dropZone?.addEventListener('dragleave',()=>dropZone?.classList?.remove?.('is-dragover'));
dropZone?.addEventListener('drop',handleDrop);
d.addEventListener?.('dragover',stopFileDrop);
d.addEventListener?.('drop',handleDrop);
$('gateImportDialogClose')?.addEventListener('click',()=>$('gateImportDialog')?.close?.());
g.P79GateImport={chooseFile:chooseFile};
$('gateFile').addEventListener('change',()=>chooseFile());
$('gateSheet').addEventListener('change',()=>{++serviceCheck;serviceReady=false;days=[];$('gateResult').hidden=true;$('gateSave').disabled=true});
$('gatePreview').addEventListener('click',()=>preview(false));
$('gateDownload').addEventListener('click',csvExport);
$('gateSave').addEventListener('click',save);
})(window);

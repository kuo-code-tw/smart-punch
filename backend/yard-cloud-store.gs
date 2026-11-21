/**
 * PORT79 Yard Cloud Storage V1.
 * Private, authenticated Apps Script module for existing production doPost.
 * Data is stored in the existing private Google Sheet, not in public JSON.
 * Route: yardAccountRead / yardAccountWrite -> p79YardAccountRequest_().
 */
var P79_YARD_MASTER_ID_='1kyWW6WDk_L39b92Wv0uk6MPiVak0gekKpKP-JgTnqsU';
var P79_YARD_TAB_='每日儲量';
var P79_YARD_COLUMNS_='date imp20 imp40 impTeu exp20 exp40 expTeu trans20 trans40 transTeu reefer20 reefer40 reeferTeu heavyTotal heavyCap heavyPct heavyPlug20Cap heavyPlug40Cap heavyPlug20Pct heavyPlug40Pct genEmpty20 genEmpty40 genEmptyTeu pti20Cap pti40Cap reeferEmpty20 reeferEmpty40 reeferEmptyTeu pti20 pti40 emptyPlug20Pct emptyPlug40Pct emptyTotal emptyCap emptyPct specialEmpty20 specialEmpty40 specialEmptyTeu specialHeavy20 specialHeavy40 specialHeavyCount specialHeavyTeu longImp20 longImp40 longImpTeu longExp20 longExp40 longExpTeu longTrans20 longTrans40 longTransTeu longTotal'.split(' ');
function p79YardPermission_(req,write){
 req=req||{};
 var token=String(req.token||req.gcToken||'').trim();
 if(!token)throw Error('請先登入 79號碼頭管理系統');
 var session=gcRequireSystemPermission_(getSpreadsheet_(true),token,'efficiency',write?'edit':'view');
 var role=String(session&&(session.adminRole||session.role)||'').toLowerCase();
 if(role!=='superadmin'&&role!=='admin')throw Error('無碼頭儲量檢視權限');
 var emp=String(session&&(session.empId||session.employeeId||session.id)||'').trim().toUpperCase();
 var account='';
 try{account=decodeURIComponent(String(req.account||'')).trim().toUpperCase();}
 catch(_){throw Error('帳號格式錯誤');}
 if(!emp||!account||emp!==account)throw Error('登入帳號和儲量資料權限不符');
 return session;
}
function p79YardDate_(value){
 var date=String(value||'').trim();
 if(!/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date))throw Error('無效的儲量日期');
 var p=date.split('-').map(Number),d=new Date(Date.UTC(p[0],p[1]-1,p[2]));
 if(d.toISOString().slice(0,10)!==date)throw Error('儲量日期不存在');
 return date;
}
function p79YardNumber_(value,name){
 if(value===null||value===undefined||value==='')throw Error('儲量缺少數值：'+name);
 var n=Number(value);
 if(!Number.isFinite(n)||n<0||n>1000000000)throw Error('儲量數值無效：'+name);
 return n;
}
function p79YardBook_(){
 var book=SpreadsheetApp.openById(P79_YARD_MASTER_ID_);
 var sheet=book.getSheetByName(P79_YARD_TAB_);
 if(!sheet)throw Error('正式雲端沒有每日儲量工作表');
 var header=sheet.getRange(1,1,1,P79_YARD_COLUMNS_.length).getDisplayValues()[0];
 for(var i=0;i<header.length;i++){
  if(header[i]!==P79_YARD_COLUMNS_[i])throw Error('正式儲量資料表欄位不符，停止讀寫，欄位 '+(i+1));
 }
 return sheet;
}
function p79YardToArray_(r){
 if(!r||typeof r!=='object'||Array.isArray(r))throw Error('每日儲量資料格式不符');
 return P79_YARD_COLUMNS_.map(function(key){return key==='date'?p79YardDate_(r[key]):p79YardNumber_(r[key],key);});
}
function p79YardFromArray_(values){
 if(!values||values.length!==P79_YARD_COLUMNS_.length)throw Error('儲量資料欄位長度不符');
 var out={};
 P79_YARD_COLUMNS_.forEach(function(key,i){out[key]=key==='date'?p79YardDate_(values[i]):p79YardNumber_(values[i],key);});
 return out;
}
function p79YardSnapshot_(sheet){
 var n=Math.max(0,sheet.getLastRow()-1);
 if(n>15000)throw Error('正式儲量資料量異常，已停止讀取');
 var data=n?sheet.getRange(2,1,n,P79_YARD_COLUMNS_.length).getValues():[];
 var dates={},rows=[];
 data.forEach(function(raw){
  if(raw.every(function(v){return v===''||v===null;}))return;
  var row=p79YardFromArray_(raw);
  if(dates[row.date])throw Error('正式儲量有重複日期：'+row.date);
  dates[row.date]=true;rows.push(row);
 });
 rows.sort(function(a,b){return a.date.localeCompare(b.date);});
 return rows;
}
function p79YardAccountRequest_(params){
 var req=params||{},action=String(req.action||'');
 if(action!=='yardAccountRead'&&action!=='yardAccountWrite')throw Error('不支援的儲量操作');
 var write=action==='yardAccountWrite';
 p79YardPermission_(req,write);
 var sheet=p79YardBook_();
 if(!write){
  var existing=p79YardSnapshot_(sheet);
  return {ok:true,version:1,source:'official-private-yard-sheet',rows:existing,
   latestDate:existing.length?existing[existing.length-1].date:null,readAt:new Date().toISOString()};
 }
 if(!Array.isArray(req.rows)||!req.rows.length||req.rows.length>366)throw Error('單次只能匯入 1～366 天儲量資料');
 var updates={},dates=[];
 req.rows.forEach(function(row){
  var values=p79YardToArray_(row),date=values[0];
  if(updates[date])throw Error('匯入資料有重複日期：'+date);
  updates[date]=values;dates.push(date);
 });
 var lock=LockService.getScriptLock();
 if(!lock.tryLock(30000))throw Error('另一位管理員正在儲存，請稍後重試');
 try{
  var current=p79YardSnapshot_(sheet),merged={};
  current.forEach(function(row){merged[row.date]=p79YardToArray_(row);});
  dates.forEach(function(date){merged[date]=updates[date];});
  var ordered=Object.keys(merged).sort().map(function(date){return merged[date];});
  if(ordered.length<current.length||ordered.length>15000)throw Error('儲量合併數量異常');
  if(ordered.length)sheet.getRange(2,1,ordered.length,P79_YARD_COLUMNS_.length).setValues(ordered);
  SpreadsheetApp.flush();
  var received=p79YardSnapshot_(sheet);
  if(received.length!==ordered.length)throw Error('雲端儲量寫入後核對筆數失敗');
  return {ok:true,version:1,source:'official-private-yard-sheet',rows:received,
   added:received.length-current.length,updated:dates.length-(received.length-current.length),
   latestDate:received.length?received[received.length-1].date:null,readAt:new Date().toISOString()};
 }finally{lock.releaseLock();}
}

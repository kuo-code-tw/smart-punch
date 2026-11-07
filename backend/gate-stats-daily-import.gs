/**
 * PORT79 Gate operation Excel import + monthly/yearly read-only data source.
 * Requires existing PORT79 GAS helpers getSpreadsheet_(true),
 * gcRequireSystemPermission_(), and jsonOutput().
 * This is a NEW module: do not replace production doGet/doPost.
 *
 * Google Sheet: PORT79｜Gate進出站櫃量統計資料庫 (private).
 * Sheets "每月累計" and "年度累計" use QUERY formulas to recompute after each save.
 */
var P79_GATE_STATS_SHEET_ID_='19umma1xq4XCLm68Wzkk-OvcRkKdZ1V88x238djXNiHc';
var P79_GATE_DAILY_TAB_='每日進出站';
var P79_GATE_IMPORT_TAB_='匯入紀錄';
var P79_GATE_HEADERS_=['日期','月份','年度','交空櫃','領空櫃','交重櫃','領重櫃','總櫃量','進站拖車車次','匯入來源'];

function p79GateValidatePermission_(params,write){
  params=params||{};
  var token=String(params.gcToken||params.token||'').trim();
  if(!token)throw new Error('請登入 PORT79 才能存取 Gate 進出站資料');
  var db=getSpreadsheet_(true);
  var session=gcRequireSystemPermission_(db,token,'history',write?'edit':'view');
  var role=String((session&&(session.adminRole||session.role))||'').toLowerCase();
  var fine=session&&session.finePermissions&&session.finePermissions.history||{};
  if(role!=='superadmin'&&
    !(role==='admin'&&fine[write?'vessel.edit':'vessel.view']===true))
    throw new Error(write?'此帳號沒有 Gate 匯入編輯權限':'此帳號沒有 Gate 資料檢視權限');
  return session;
}
function p79GateBook_(){
  var book=SpreadsheetApp.openById(P79_GATE_STATS_SHEET_ID_);
  var sheet=book.getSheetByName(P79_GATE_DAILY_TAB_);
  var log=book.getSheetByName(P79_GATE_IMPORT_TAB_);
  if(!sheet||!log)throw new Error('找不到 Gate 資料庫每日進出站或匯入紀錄工作表');
  var header=sheet.getRange(1,1,1,10).getDisplayValues()[0];
  for(var i=0;i<P79_GATE_HEADERS_.length;i++){
    if(String(header[i]||'').trim()!==P79_GATE_HEADERS_[i])
      throw new Error('Gate 資料庫每日進出站表頭不符：第 '+(i+1)+' 欄');
  }
  return {book:book,sheet:sheet,log:log};
}
function p79GateDate_(value){
  var t=String(value||'').trim();
  if(!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(t))
    throw new Error('Gate 日期格式不正確：'+t);
  var p=t.split('-').map(Number);
  var d=new Date(Date.UTC(p[0],p[1]-1,p[2]));
  if(d.toISOString().slice(0,10)!==t)throw new Error('Gate 日期不存在：'+t);
  return t;
}
function p79GateCount_(value,name){
  if(value===null||value===undefined||String(value).trim()==='')
    throw new Error('缺少 '+name+' 欄位數值');
  var n=Number(value);
  if(!Number.isSafeInteger(n)||n<0||n>1000000)
    throw new Error(name+' 必須是非負整數');
  return n;
}
function p79GateRecord_(row,fileName){
  if(!row||typeof row!=='object')throw new Error('Gate 明細格式不正確');
  var date=p79GateDate_(row.date);
  var de=p79GateCount_(row.deliverEmpty,'交空櫃');
  var pe=p79GateCount_(row.pickupEmpty,'領空櫃');
  var dl=p79GateCount_(row.deliverLoaded,'交重櫃');
  var pl=p79GateCount_(row.pickupLoaded,'領重櫃');
  var trucks=p79GateCount_(row.truckEntries,'進站拖車車次');
  return [date,date.slice(0,7),Number(date.slice(0,4)),de,pe,dl,pl,de+pe+dl+pl,trucks,fileName];
}
/** Route from existing doGet(e): action=gateStatsReadYear (read-only). */
function p79GateStatsReadYear_(params){
  p79GateValidatePermission_(params,false);
  var year=String(params&&params.year||'').trim();
  if(!/^20\d{2}$/.test(year))throw new Error('請指定正確年度');
  var sheet=p79GateBook_().sheet;
  var size=Math.max(0,sheet.getLastRow()-1);
  var source=size?sheet.getRange(2,1,size,10).getDisplayValues():[];
  var rows=[];
  for(var i=0;i<source.length;i++){
    var r=source[i],date=String(r[0]||'').trim();
    if(!date||date.slice(0,4)!==year)continue;
    rows.push({date:p79GateDate_(date),
      deliverEmpty:p79GateCount_(r[3],'交空櫃'),
      pickupEmpty:p79GateCount_(r[4],'領空櫃'),
      deliverLoaded:p79GateCount_(r[5],'交重櫃'),
      pickupLoaded:p79GateCount_(r[6],'領重櫃'),
      truckEntries:p79GateCount_(r[8],'進站拖車車次')
    });
  }
  return {ok:true,source:'port79-gate-daily',year:year,rows:rows,total:rows.length,
    readAt:new Date().toISOString()};
}
/**
 * Route from existing doPost(e): action=gateStatsImport.
 * Fields: gcToken/token, fileName, rows JSON string with normalized dates/counts.
 * Upsert by date, never increment data on repeated imports.
 */
function p79GateStatsImport_(params){
  var user=p79GateValidatePermission_(params,true);
  var fileName=String(params&&params.fileName||'Gate.xlsx').trim().slice(0,130);
  if(!/^[^\\/:*?"<>|]{1,130}\.(xlsx|xls|csv)$/i.test(fileName))
    throw new Error('Gate 匯入檔案名稱無效');
  var json=String(params&&params.rows||'');
  if(json.length>250000)throw new Error('Gate 匯入資料太大');
  var input;
  try{input=JSON.parse(json)}catch(_){throw new Error('Gate 匯入明細不是有效 JSON');}
  if(!Array.isArray(input)||!input.length||input.length>366)
    throw new Error('單次最多匯入 366 個日期，且不能為空');
  var incoming=new Map();
  for(var i=0;i<input.length;i++){
    var r=p79GateRecord_(input[i],fileName);
    if(incoming.has(r[0]))throw new Error('檔案出現重複日期：'+r[0]);
    incoming.set(r[0],r);
  }
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(30000))throw new Error('其他管理員正在匯入，請稍後重試');
  try{
    var b=p79GateBook_(),daily=b.sheet,oldCount=Math.max(0,daily.getLastRow()-1);
    var old=oldCount?daily.getRange(2,1,oldCount,10).getDisplayValues():[];
    var index=new Map();
    for(var j=0;j<old.length;j++){
      var day=String(old[j][0]||'').trim();
      if(day&&index.has(day))throw new Error('資料庫已有重複日期 '+day+'，請先人工檢查');
      if(day)index.set(day,j+2);
    }
    var add=[],update=[],earliest='',latest='';
    incoming.forEach(function(row,date){
      if(!earliest||date<earliest)earliest=date;
      if(!latest||date>latest)latest=date;
      var rowIndex=index.get(date);
      if(rowIndex)update.push({index:rowIndex,values:row});
      else add.push(row);
    });
    // Validated first; apply overwrite for matching dates instead of adding twice.
    update.forEach(function(item){
      daily.getRange(item.index,1,1,10).setValues([item.values]);
    });
    if(add.length)daily.getRange(daily.getLastRow()+1,1,add.length,10).setValues(add);
    var stamp=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd HH:mm:ss');
    var owner=String(user&&((user.empId||user.name||user.email))||'管理員').slice(0,80);
    b.log.appendRow([stamp,fileName,earliest,latest,add.length,update.length,owner+' 上傳；同日期覆寫，未重複累加']);
    SpreadsheetApp.flush();
    return {ok:true,source:'port79-gate-daily',added:add.length,updated:update.length,
      total:incoming.size,firstDate:earliest,lastDate:latest,at:stamp};
  }finally{lock.releaseLock();}
}
/**
 * Integration in the deployed production Code.gs:
 *
 * In doGet(e) (after var params=e.parameter||{} and action resolution):
 * if(action==='gateStatsReadYear') {
 *   try{return jsonOutput(p79GateStatsReadYear_(params));}
 *   catch(err){return jsonOutput({ok:false,error:String(err.message||err)});}
 * }
 *
 * In doPost(e) (after var params=e.parameter||{} and action resolution):
 * if(action==='gateStatsImport') {
 *   try{return jsonOutput(p79GateStatsImport_(params));}
 *   catch(err){return jsonOutput({ok:false,error:String(err.message||err)});}
 * }
 *
 * Keep the existing auth, doPost routes and deployment URL unchanged.
 * Updating GitHub static files does NOT deploy Google Apps Script.
 */

/**
 * PORT79 internal Google Sheet ship schedule.
 *
 * Drop-in replacement for the previously installed wanhai-sailing-readonly.gs.
 * Preserve existing doGet action 'wanHaiSailingSchedule' and the function name
 * p79WanHaiSailingGet_ so the user DOES NOT edit doGet again.
 * This implementation NEVER requests Wan Hai or another external website.
 * Read-only; no attendance/roster/historical ship data mutations.
 */
var P79_MANUAL_SHIP_SHEET_ID_='1AjgCs8QvADWYjJeWzJCEDsUaKtKlflNTI4ZQEK14Ipo';
var P79_MANUAL_SHIP_SHEET_TAB_='船期資料';

function p79WanHaiSailingGet_(params) {
 params=params||{};
 var token=String(params.gcToken||params.token||'').trim();
 if(!token)throw new Error('請使用具有船舶檢視權限的帳號登入 PORT79');
 var database=getSpreadsheet_(true);
 var session=gcRequireSystemPermission_(database,token,'history','view');
 var role=String(session&&(session.adminRole||session.role)||'').toLowerCase();
 var fine=session&&session.finePermissions&&session.finePermissions.history||{};
 if(role!=='superadmin'&&fine['vessel.view']!==true)
  throw new Error('目前登入帳號沒有船舶資料檢視權限');

 var spreadsheet=SpreadsheetApp.openById(P79_MANUAL_SHIP_SHEET_ID_);
 var sheet=spreadsheet.getSheetByName(P79_MANUAL_SHIP_SHEET_TAB_);
 if(!sheet)throw new Error('找不到 Google 船期資料表「船期資料」');
 var titles=['英文船名','中文船名','進港航次','出港航次','ETA 預計抵港','ETB 預計靠泊','ETD 預計離港','靠泊碼頭','船期狀態','備註','最後更新'];
 var head=sheet.getRange(1,1,1,11).getDisplayValues()[0];
 for(var h=0;h<titles.length;h++){
  if(String(head[h]||'').trim()!==titles[h])
   throw new Error('Google 船期資料第 '+(h+1)+' 欄標題不符，請勿修改第一列標題');
 }
 var count=Math.min(Math.max(0,sheet.getLastRow()-1),999);
 var data=count?sheet.getRange(2,1,count,11).getDisplayValues():[];
 var rows=[];
 for(var i=0;i<data.length;i++){
  var row=data[i].map(function(v){return String(v||'').trim();});
  if(!(row[0]||row[1])||!(row[2]||row[3]))continue;
  rows.push({
   name:row[0],localName:row[1],inVoyage:row[2],outVoyage:row[3],
   eta:row[4],etb:row[5],etd:row[6],berth:row[7],status:row[8],
   note:row[9],updatedAt:row[10]
  });
 }
 return {
  ok:true,action:'wanHaiSailingSchedule',source:'port79-google-sheet',
  sheetId:P79_MANUAL_SHIP_SHEET_ID_,readAt:new Date().toISOString(),
  rows:rows,total:rows.length
 };
}


/**
 * Route helper for the existing doGet(e). Only this one ship-schedule action
 * supports read-only JSONP fallback for browsers affected by GAS redirects.
 * Requires the same signed-in PORT79 session and vessel viewing permission
 * as the normal JSON route. JSONP must not be used for confidential notes.
 */
function p79ShipScheduleOutput_(params) {
 params=params||{};
 var result;
 try{result=p79WanHaiSailingGet_(params);}
 catch(error){result={ok:false,action:'wanHaiSailingSchedule',error:String(error&&error.message||error)};}
 var callback=String(params.callback||'').trim();
 if(!callback)return jsonOutput(result);
 if(!/^P79ShipCb_[A-Za-z0-9]{12,64}$/.test(callback))
  return jsonOutput({ok:false,error:'船期回傳格式無效'});
 // Keep JSONP limited to published operational schedule fields, never
 // exposing the freeform "note" field on this cross-origin script route.
 if(result.ok&&Array.isArray(result.rows)){
  result.rows=result.rows.map(function(r){
   return {name:r.name,localName:r.localName,
    inVoyage:r.inVoyage,outVoyage:r.outVoyage,
    eta:r.eta,etb:r.etb,etd:r.etd,berth:r.berth,status:r.status};
  });
 }
 var safeJson=JSON.stringify(result).replace(/</g,'\\u003c')
   .replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return ContentService.createTextOutput(callback+'('+safeJson+');')
   .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

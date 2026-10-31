/**
 * Read-only Wan Hai SailingScheduleList bridge for the existing PORT79 GAS.
 * Install in the SAME active Apps Script project as the main doGet handler.
 * The route must call p79WanHaiSailingGet_(e.parameter) and jsonOutput(...).
 *
 * Security: hardcoded source URL, authenticated historical-vessel view,
 * no credentials forwarded to the shipping website, no database mutations,
 * no background polling or write operations.
 */
var P79_WANHAI_SAILING_URL_='https://khhtml.wanhai.com/web/SailingScheduleList';

function p79WanHaiSailingGet_(params) {
  params=params||{};
  var token=String(params.gcToken||params.token||'').trim();
  if(!token)throw new Error('請登入具船舶資料檢視權限的管理帳號');
  var ss=getSpreadsheet_(true);
  var session=gcRequireSystemPermission_(ss,token,'history','view');
  var role=String(session && (session.adminRole||session.role)||'').toLowerCase();
  var fine=session && session.finePermissions && session.finePermissions.history||{};
  if(role!=='superadmin' && fine['vessel.view']!==true){
    throw new Error('目前帳號沒有船舶資料檢視權限');
  }

  var response=UrlFetchApp.fetch(P79_WANHAI_SAILING_URL_,{
    method:'get',followRedirects:true,muteHttpExceptions:true,
    headers:{Accept:'text/html,application/xhtml+xml'}
  });
  var http=Number(response.getResponseCode());
  if(http!==200)throw new Error('萬海船期來源網站回應 HTTP '+http);
  var body=String(response.getContentText('UTF-8')||'');
  if(!body||body.length>2500000)throw new Error('萬海回應內容為空或超過安全上限');
  if(!/(?:<table\b|船名|航次|vessel|voyage|SailingSchedule)/i.test(body)){
    throw new Error('萬海回應不包含可辨識的船期內容');
  }
  return {
    ok:true,action:'wanHaiSailingSchedule',source:P79_WANHAI_SAILING_URL_,
    html:body,readAt:new Date().toISOString(),size:body.length
  };
}

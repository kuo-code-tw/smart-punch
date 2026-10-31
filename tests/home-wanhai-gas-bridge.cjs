'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.join(__dirname,'..'),s=fs.readFileSync(path.join(base,'backend/wanhai-sailing-readonly.gs'),'utf8');
let authed=true,read=0;
const expectedHeaders=['英文船名','中文船名','進港航次','出港航次','ETA 預計抵港','ETB 預計靠泊','ETD 預計離港','靠泊碼頭','船期狀態','備註','最後更新'];
const vals=[expectedHeaders,['WAN HAI 178','萬春','N076','S077','2026/11/02 14:00','2026/11/02 15:00','2026/11/03 01:00','W80','預定','內部備註不可公開','']];
const scope={
 jsonOutput:obj=>({json:obj}),
 ContentService:{MimeType:{JAVASCRIPT:'JAVASCRIPT'},createTextOutput(content){return {content,setMimeType(type){this.type=type;return this;}}}},
 getSpreadsheet_:()=>({}),
 gcRequireSystemPermission_:()=>authed?{adminRole:'superadmin'}:{adminRole:'employee',finePermissions:{history:{}}},
 SpreadsheetApp:{openById(id){assert.equal(id,'1AjgCs8QvADWYjJeWzJCEDsUaKtKlflNTI4ZQEK14Ipo');read++;return {getSheetByName(name){assert.equal(name,'船期資料');return {getLastRow:()=>vals.length,getRange(r,c,n,w){assert.equal(w,11);return {getDisplayValues:()=>vals.slice(r-1,r-1+n)}}}}}}}
};
vm.runInNewContext(s,scope);
assert.throws(()=>scope.p79WanHaiSailingGet_({}),/登入/);
authed=false;assert.throws(()=>scope.p79WanHaiSailingGet_({gcToken:'TOKEN'}),/權限/);
assert.equal(read,0,'unauthorized request must not access the Sheet');
authed=true;
const result=scope.p79WanHaiSailingGet_({gcToken:'TOKEN'});
assert.equal(result.source,'port79-google-sheet');
assert.equal(result.rows.length,1);
assert.equal(result.rows[0].berth,'W80');
assert.equal(result.rows[0].etb,'2026/11/02 15:00');
assert(!s.includes('UrlFetchApp'),'GAS route must not fetch external web pages');
assert(s.includes('function p79WanHaiSailingGet_(params)'),'existing doGet route must still work');
const cb='P79ShipCb_1234567890123456';
const response=scope.p79ShipScheduleOutput_({gcToken:'TOKEN',callback:cb});
assert.equal(response.type,'JAVASCRIPT');
assert(response.content.startsWith(cb+'('));
assert(response.content.includes('W80'));
assert(!response.content.includes('內部備註不可公開'),'JSONP must omit freeform notes');
assert(!response.content.includes('gcToken'),'token must not appear in callback output');
const rejected=scope.p79ShipScheduleOutput_({gcToken:'TOKEN',callback:'alert(1)'});
assert.equal(rejected.json.ok,false,'arbitrary JavaScript callback names are refused');
authed=false;
const unauthorized=scope.p79ShipScheduleOutput_({gcToken:'TOKEN',callback:cb});
assert(unauthorized.content.includes('ok'));assert(!unauthorized.content.includes('W80'),'unauthorized user cannot read ship data');
authed=true;
console.log('PASS: private Google Sheet read-only GAS, history.vessel view permission, exact headers, existing route retained');
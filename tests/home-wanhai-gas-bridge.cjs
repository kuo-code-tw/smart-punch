'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),backend=fs.readFileSync(path.join(root,'backend/wanhai-sailing-readonly.gs'),'utf8');
const client=fs.readFileSync(path.join(root,'assets/port79-external-ship-schedule.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const SOURCE='https://khhtml.wanhai.com/web/SailingScheduleList';
let requests=0,lastUrl='',lastOptions=null,access=true;
const scope={
 getSpreadsheet_:()=>({}),
 gcRequireSystemPermission_(_ss,_token,system,permission){assert.equal(system,'history');assert.equal(permission,'view');if(!access)return {adminRole:'admin',finePermissions:{history:{'vessel.view':false}}};return {adminRole:'superadmin'};},
 UrlFetchApp:{fetch(url,options){requests++;lastUrl=url;lastOptions=options;return {getResponseCode:()=>200,getContentText:()=>'<html><table><tr><th>Vessel</th><th>Voyage</th></tr><tr><td>WAN HAI 101</td><td>N100</td></tr></table></html>';}}
};
vm.runInNewContext(backend,scope);
assert.throws(()=>scope.p79WanHaiSailingGet_({}),/登入/,'read requires a token');
access=false;
assert.throws(()=>scope.p79WanHaiSailingGet_({gcToken:'TOKEN'}),/權限/,'vessel permission required');
access=true;
const res=scope.p79WanHaiSailingGet_({gcToken:'TOKEN'});
assert.equal(res.ok,true);assert.equal(res.source,SOURCE);
assert(res.html.includes('WAN HAI 101'));assert.equal(requests,1);
assert.equal(lastUrl,SOURCE,'source URL is hardcoded, never controlled by user query');
assert.equal(lastOptions.method,'get');
assert(!JSON.stringify(lastOptions).includes('TOKEN'),'no PORT79 tokens forwarded to Wan Hai');
assert(client.includes("uri.searchParams.set('action','wanHaiSailingSchedule')"));
assert(client.includes("await loadSourceHtml(controller.signal)"),'real cloud fetch is preferred');
assert(client.includes("data?.source!==SOURCE"),'reject backend source substitution');
assert(client.includes("p79DashRefresh")&&client.includes("addEventListener('click',refresh)"));
assert(!client.includes('setInterval('),'homepage must remain manual refresh');
assert(html.includes('port79-external-ship-schedule.js?v=20261031-wanhai-image-source-v4'),'new URL invalidates old cached client');
new vm.Script(client);
console.log('PASS: Wan Hai backend auth, source allow-list, single read, browser bridge, no token leak, manual update and cache bust');

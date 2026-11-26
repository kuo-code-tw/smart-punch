'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const js=fs.readFileSync('aqc-efficiency/route-management-dashboard.js','utf8');
const a=html.indexOf('function p79RouteServiceCode('),b=html.indexOf("if(typeof window!=='undefined')window.addEventListener?.('p79-route-name-updated'",a);
assert(a>=0&&b>a,'main inline route map');
const c={window:{P79RouteNameAuto:{lookup:()=>''}}};
vm.createContext(c);
vm.runInContext(html.slice(a,b),c);
const names=vm.runInContext('P79_ROUTE_CHINESE_NAMES',c);
const backup=js.slice(js.indexOf('const names='),js.indexOf('const num='));
const d={root:{}};vm.createContext(d);vm.runInContext(backup+'\nthis._testNames=names;',d);
assert.deepEqual(JSON.parse(JSON.stringify(names)),JSON.parse(JSON.stringify(d._testNames)),
 'main and manager fallback remain identical');
for(const [code,name] of Object.entries({"AP1":"亞太一線（美西航線）","CI5":"中國－印度五線","JSH":"日本－華南－越南航線","JTS":"日本關東－東南亞航線","KVS":"韓國－越南－東南亞航線","NT2":"華北－台灣二線","TPS":"台灣－菲律賓航線"})){
 assert.equal(c.p79RouteChineseName(code),name);
 assert.equal(c.p79RouteChineseName(' '+code.toLowerCase()+' '),name);
}
assert.equal(c.p79RouteChineseName('XYY'),'XYY');
assert.equal(c.p79RouteChineseName(''),'未分類');
assert(!html.includes('中文名稱查詢中'));
assert(!js.includes('中文名稱查詢中'));
assert(html.includes('port79-route-name-autofill.js?v=20261118-v2'));
console.log('PASS screenshot route names, normalized codes, no placeholder, consistent fallback');

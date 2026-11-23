'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const cache=fs.readFileSync('assets/port79-data-cache.js','utf8');
const pages=['index.html','leave/index.html','schedule/index.html','aqc-efficiency/index.html','hr/index.html','history-data/index.html'];
for(const path of pages){
 const html=fs.readFileSync(path,'utf8');
 assert(html.includes('port79-data-cache.js?v=20261123-quick-preload-shared-v1'),path+' must bypass old cached 7-system script');
}
assert(cache.includes('data-cache-action="all">下載六項基本資料（歷史按月）'),
 'Cache center must not promise seven downloads including optional history catalog');
assert(cache.includes("if(sys==='history'){setProgress('歷史資料請在歷史資料中心選擇月份"),
 'Current-system action must not force a hanging historical directory request');
assert(cache.includes('},{quickFirst:true,historyOnDemand:true});'),
 'Browser and Windows both use six normal systems and history on demand');
assert(cache.includes('完成：${ok}/${res.length} 項基本資料；歷史月份按需讀取'),
 'Completion denominator is actual number of requested modules');
assert(cache.includes("action==='getHistoricalDataCatalog'"),
 'Explicit authenticated legacy historical catalog read remains available');
assert(cache.includes("fetchJson('historyGetMonthData'"),
 'Historical month cloud reads remain in the original client');
assert(!cache.includes('下載七大系統快取'),'Remove confusing old bulk action from the user-visible center');
console.log('PASS browser cache center: six core modules, versioned JS on every management page, historical months on demand');

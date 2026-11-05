'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const start=html.indexOf('<table id="summaryDashboardTable"');
const end=html.indexOf('<tbody id="summaryBody">',start);
assert(start>=0&&end>start,'ship job table exists');
const head=html.slice(start,end);
assert(!head.includes('dashboardFilterVessel'),'removed vessel dropdown in redundant row');
assert(!head.includes('dashboardFilterWharf'),'removed wharf input in redundant row');
assert(!head.includes('dashboardEfficiencyFilter'),'removed efficiency dropdown in redundant row');
assert(!head.includes('clearDashboardColumnFilters()'),'removed redundant clear control');
assert(head.includes("setDashboardSort('workingNo')"),'column sorting remains');
assert(head.includes("setDashboardSort('gph')"),'efficiency sorting remains');
assert(html.includes('id="filterMonth"'),'primary monthly filter remains');
assert(html.includes('id="dashboardSortField"'),'primary sort state remains');
assert(html.includes('id="summaryBody"'),'job data remains');
assert(html.includes('id="summaryPagination"'),'job pagination remains');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 if(!/\bsrc\s*=/.test(m[1]) && m[2].trim())new vm.Script(m[2]);
}
console.log('PASS redundant ship table filter row removed; primary month, sort, data, and paging preserved; scripts parse');

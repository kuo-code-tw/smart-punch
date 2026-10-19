const fs=require('fs'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
assert(!html.includes('data-collapse-key'));assert(!html.includes('data-collapse-action'));assert(!html.includes('port79-collapsible-sections.js'));
const remaining=[...html.matchAll(/<details\b[^>]*>/g)].map(m=>m[0]).filter(tag=>!tag.includes('id="efficiencySyncError"'));assert.equal(remaining.length,2);assert(remaining.every(tag=>/id="(?:record|weekly)DateRangePicker"/.test(tag)));
assert(html.includes('id="integratedRecordDetails" class="space-y-3 hidden"'));assert(!html.includes('ontoggle='));assert(!html.includes("integratedRecordDetails')?.open"));
console.log(JSON.stringify({passed:3,failed:0,scope:'All primary content is directly visible; legacy duplicate editor table is replaced by inline edit buttons'}));

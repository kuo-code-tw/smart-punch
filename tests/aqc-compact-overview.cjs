'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ui=fs.readFileSync(path.join(__dirname,'../assets/port79-aqc-multi-rod.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
new Function('window',ui);
const mount=ui.slice(ui.indexOf('function mount(){'),ui.indexOf("  $('view-dashboard').parentNode.insertBefore(section,"));
assert.ok(mount.startsWith('function mount(){'),'find AQC mount');
assert.ok(mount.includes('hidden space-y-2'),'AQC section spacing compact');
assert.ok(mount.includes('card p-3 sm:p-4 space-y-2'),'AQC main content padding compact');
assert.ok(mount.includes('id="multiRodToolbarScroll" class="overflow-x-auto"'),'toolbar scrolls horizontally on narrow screens');
assert.ok(mount.includes('id="multiRodToolbar" class="flex w-full min-w-max items-center gap-2 whitespace-nowrap"'),'one unwrapped AQC toolbar');
assert.ok(!mount.includes('grid grid-cols-2 lg:grid-cols-4'),'old multi-row grid removed');
assert.equal((mount.match(/id="multiRodToolbar"/g)||[]).length,1,'exactly one toolbar groups all header controls');
assert.equal((mount.match(/class="flex shrink-0 items-center gap-1 border-l border-slate-200 pl-2 text-xs"/g)||[]).length,4,'four stats inline in same horizontal toolbar');
assert.equal((mount.match(/class="font-semibold">0/g)||[]).length,4,'four compact inline values preserved');
for(const id of ['multiRodShips','multiRodEvents','multiRodContainers','multiRodHatches',
 'multiRodDate','multiRodMin','multiRodMode','multiRodRefresh','multiRodExport',
 'multiRodSourceAudit','multiRodSourcePreview','multiRodBody','multiRodNotice']){
 assert.ok(mount.includes('id="'+id+'"'),'important AQC UI is still present: '+id);
}
assert.ok(mount.includes('id="multiRodSourceState" class="hidden"'),'suppress big gray source explanation');
assert.ok(!mount.includes('rounded-xl bg-sky-50'),'oversized blue reminder banner removed');
assert.ok(!mount.includes('找出整個碼頭同一時段使用'),'gray subtitle removed');
assert.ok(!mount.includes('目前現場同時作業上限為'),'long help banner removed');
assert.ok(mount.includes('上限／來源'),'physical four-crane capacity remains visible in toolbar');
assert.ok(ui.includes('const totalHint=r.capacityConflict'),'unverified source overlaps still warned in row details');
assert.ok(ui.includes('multiRodSourceAudit'),'on-demand evidence remains accessible');
assert.ok(ui.includes('role="status" aria-live="polite"'),'save/export notices remain accessible');
assert.ok(html.includes('port79-aqc-multi-rod.js?v=20261028-one-line-toolbar-v11'),'updated UI loaded without stale cache');
assert.ok(html.includes('p79-aqc-multi-rod-table-compact-20261028'),'previous table fonts and centering retained');
assert.ok(html.includes('#view-multi-rod #multiRodToolbar{flex-wrap:nowrap!important;white-space:nowrap!important}'),'CSS prevents unintended wrapping');
console.log('PASS AQC single-line toolbar: all controls/stats inline; responsive scroll, compact text, audit and safety retained');

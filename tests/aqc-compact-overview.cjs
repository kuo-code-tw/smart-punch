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
assert.ok(mount.includes('grid grid-cols-2 lg:grid-cols-4 gap-2'),'compact statistic grid');
assert.equal((mount.match(/bg-white border border-slate-200 rounded-lg px-3 py-2/g)||[]).length,5,'four compact statistics and one compact details');
assert.equal((mount.match(/class="text-sm font-bold text-slate-900"/g)||[]).length,4,'four values use small bold font');
for(const id of ['multiRodShips','multiRodEvents','multiRodContainers','multiRodHatches',
 'multiRodDate','multiRodMin','multiRodMode','multiRodRefresh','multiRodExport',
 'multiRodSourceAudit','multiRodSourcePreview','multiRodBody','multiRodNotice']){
 assert.ok(mount.includes('id="'+id+'"'),'important AQC UI is still present: '+id);
}
assert.ok(mount.includes('id="multiRodSourceState" class="hidden"'),'suppress big gray source explanation');
assert.ok(!mount.includes('rounded-xl bg-sky-50'),'oversized blue reminder banner removed');
assert.ok(!mount.includes('找出整個碼頭同一時段使用'),'gray subtitle removed');
assert.ok(!mount.includes('目前現場同時作業上限為'),'long help banner removed');
assert.ok(mount.includes('現場上限／來源峰值'),'physical four-crane capacity remains visible in stats');
assert.ok(ui.includes('const totalHint=r.capacityConflict'),'unverified source overlaps still warned in row details');
assert.ok(ui.includes('multiRodSourceAudit'),'on-demand evidence remains accessible');
assert.ok(ui.includes('role="status" aria-live="polite"'),'save/export notices remain accessible');
assert.ok(html.includes('port79-aqc-multi-rod.js?v=20261028-compact-overview-v10'),'updated UI loaded without stale cache');
assert.ok(html.includes('p79-aqc-multi-rod-table-compact-20261028'),'previous table fonts and centering retained');
console.log('PASS AQC compact overview: no oversized info banner or gray hints; four small stats, controls, audit, safety retained');

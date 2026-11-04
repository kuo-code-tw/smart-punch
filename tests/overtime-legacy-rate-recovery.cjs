'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const global={};vm.runInNewContext(src,{window:global,Date,Intl,Set,Map,TextEncoder});
const api=global.P79Overtime;
const saved=[
 ['延','延04-16','4','6.02','08','16','04','08','before'],
 ['延','延24-12','4','6.02','24','08','08','12','after'],
 ['休','休08-16','8','12.70','','','08','16','full']
];
const legacy={overtimeConversionRowsV1:saved,overtimeReportTypesV1:[]};
const original=JSON.stringify(legacy);
assert.deepEqual([...api.typeOptions(legacy).map(x=>x.name)],['平日延時加班','休息日加班'],
 'original cloud-saved categories recover even when old type list was empty');
assert.equal(api.activeReportRows(saved,legacy).length,3,'all three original rules must be visible');
assert.equal(api.activeReportRows(saved,legacy)[0][3],'6.02','original conversion hours must not be rewritten');
assert.equal(api.activeReportRows(saved,legacy)[1][2],'4','original declared hours must remain');
assert.equal(JSON.stringify(legacy),original,'read-only recovery must not edit original cloud config');
assert.equal(api.typeOptions({},api.defaults()).length,0,'no newly installed builtin types without saved cloud rows');
const deleted={...legacy,overtimeDeletedBuiltinTypesV1:['平日延時加班']};
assert.equal(api.typeOptions(deleted).some(x=>x.name==='平日延時加班'),false,'explicit legacy deletion remains deleted');
assert.equal(api.activeReportRows(saved,deleted).length,1,'deleted extension rows are never displayed as new filing options');
const archived={...legacy,overtimeArchivedRuleKeysV1:[]};
assert.equal(api.typeOptions(archived).length,0,'new-format explicit empty type list is authoritative');
assert.equal(api.activeReportRows(saved,archived).length,0,'archived records never silently reactivate');
const selected={...legacy,overtimeArchivedRuleKeysV1:[],overtimeReportTypesV1:[['平日延時加班','延']]};
assert.equal(api.activeReportRows(saved,selected).length,2,'explicitly re-added type uses its matching saved rules');
assert(src.includes('customTypes=typeOptions(loaded.config,loaded.rows).map(t=>[t.name,t.category])'),
 'manager must show recovered types and give them real delete buttons');
assert(src.includes('loadedTypes=JSON.stringify(loaded.config[TYPECONFIG]||[])'),
 'concurrent admin modifications must be compared to real cloud setting, not the migration preview');
assert(src.includes('const archiveKeys=[...new Set(archived.map(ruleKey))]'),
 'deleting removes future filing options but preserves audit and historical conversion rows');
new vm.Script(src);
console.log('PASS legacy saved overtime periods/6.02 conversions recovered, deletion and archive guards retained, no built-in auto-install');

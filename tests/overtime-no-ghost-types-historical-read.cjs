'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-overtime-report.js','utf8'),global={};
vm.runInNewContext(source,{window:global,Date,Intl,Set,Map,TextEncoder});
const api=global.P79Overtime,rows=[
 ['延','延04-16','4','6.02','08','16','04','08','before'],
 ['延','延24-12','4','6.02','24','08','08','12','after']
];
const config={overtimeReportTypesV1:[],overtimeConversionRowsV1:rows,overtimeArchivedRuleKeysV1:[]};
const snapshot=JSON.stringify(config);
assert.equal(api.typeOptions(config).length,0,'unused classification names never become installed types');
assert.equal(api.activeReportRows(rows,config).length,0,'filed reports still obey the active type list');
assert.equal(api.managerVisibleRules(rows,config).length,2,'old cloud rates can be edited in the manager even when types are disabled');
assert.equal(api.managerVisibleRules(rows,config)[1][3],'6.02');
assert.equal(JSON.stringify(config),snapshot,'reading old cloud rates never writes back automatically');
assert(source.includes('id="p79NewTypeCategory"'),'new-type calculation basis remains available');
assert(source.includes("esc(typeLabel[c])+'</option>'"),'actual holiday classifications shown only in new-type selector');
assert(source.includes('function managerVisibleRules(rows,config={})'));
assert(source.includes('rows=managerVisibleRules(Object.prototype.hasOwnProperty.call(loaded.config,CONFIG)?loaded.rows:[],loaded.config)'));
assert(source.includes('loadedTypeDraft=JSON.stringify(customTypes)'),'unsaved draft guard preserved');
assert(source.includes('HIDDEN_MANAGER_RULES'),'deletions have permanent manager exclusion');
assert(!source.includes('p79OtBuiltinDelete'),'no fake builtin restore button');
new vm.Script(source);
console.log('PASS cloud-saved overtime rates editable without ghost installed types or automatic writes');

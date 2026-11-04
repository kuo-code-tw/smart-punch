'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const win={};vm.runInNewContext(source,{window:win,Date,Intl,Set,Map,TextEncoder});
const api=win.P79Overtime;
const archived=[['延','延04-16','4','6.02','08','16','04','08','before'],['延','延24-12','4','6.02','24','08','08','12','after']];
const config={overtimeReportTypesV1:[],overtimeConversionRowsV1:archived,overtimeArchivedRuleKeysV1:[]};
const before=JSON.stringify(config);
assert.equal(api.typeOptions(config,archived).length,0,'an explicitly empty active list cannot show ghost types');
assert.equal(api.activeReportRows(archived,config).length,0,'archived rates must never silently become new filing options');
assert.equal(archived[0][3],'6.02');assert.equal(archived[1][2],'4');
assert.equal(JSON.stringify(config),before,'read-only reporting must not mutate the saved records');
assert(source.includes('id="p79NewTypeCategory"'),'computation basis chooser remains available for actual new types');
assert(source.includes('display:none"><option value="">選擇計算方式</option>'),
 'when no new type name is entered, the basis selector must not display existing categories');
assert(!source.includes("esc(typeLabel[c])+'類別</option>'"),
 'old category labels cannot masquerade as installed overtime types');
assert(source.includes("categoryPicker.style.display=hasName?'':'none'"),
 'typing a NEW type is required before the computation basis appears');
assert(source.includes("if(!types.includes(category))"),'new type needs an explicit computation basis');
assert(source.includes('id="p79OtArchivedRules"'),'retained historical periods must be discoverable');
assert(source.includes('const archivedCount=renderArchivedRows(loaded.rows,loaded.config)'),
 'cloud reload must display preserved historical records even with no active types');
assert(source.includes("line.textContent=ruleType(row)+'｜'+row[1]+'｜實際 '+row[2]"),
 'read-only historical list shows actual and converted original hours');
assert(source.includes("loadedVisibleRows==='[]'&&loadedTypes==='[]'"),
 'blank unchanged settings must not overwrite stored history');
assert(!source.includes('p79OtBuiltinDelete'),'never expose a fake builtin delete or restore action');
new vm.Script(source);
console.log('PASS no ghost overtime types; explicit calculation basis; archived original 4 / 6.02 hours readable without cloud changes');

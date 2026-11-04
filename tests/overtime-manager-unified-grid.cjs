'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const win={};vm.runInNewContext(source,{window:win,Date,Intl,Set,Map,TextEncoder});
const api=win.P79Overtime;
const historical=[
 ['延','延04-16','4','6.02','08','16','04','08','before'],
 ['延','延24-12','4','6.02','24','08','08','12','after'],
 ['休','休08-16','8','12.70','','','08','16','full']
];
const cfg={overtimeReportTypesV1:[['平日延時加班','延'],['休息日加班','休']],overtimeArchivedRuleKeysV1:[
 'builtin:平日延時加班|延04-16','builtin:平日延時加班|延24-12','builtin:休息日加班|休08-16'
]};
assert.equal(api.activeReportRows(historical,cfg).length,0,'archived rates must remain inactive');
assert.equal(historical[0][2],'4');assert.equal(historical[0][3],'6.02');
assert(source.includes("['加班類型','出勤時段','實際時數','換算時數','正常班','加班時間','位置','狀態','操作']"),
 'consolidated nine-column table replaces large eleven-column editor');
assert(source.includes('id="p79OtRuleCount"'),'live active/historical row counts are present');
assert(source.includes("tr.setAttribute('data-ot-active','false')"),'historic rows cannot look active');
assert(source.includes("tr.className='p79-ot-historical'"),'historical rates visually distinguished');
assert(source.includes("const cells=[ruleType(row),row[1],row[2],row[3]===''?'—':row[3]"),
 'historical hours and conversion rates rendered visibly in same table');
assert(source.includes("tr.children[7].className='p79-ot-historical-label'"),'read-only archive status visible');
assert(source.includes('function editorRow(row){'),'active hours remain editable inline');
assert(source.includes("Array.from({length:10},(_,i)=>tr.querySelector('[data-col=\"'+i+'\"]')?.value??'')"),
 'edit payload restores 10 original fields in canonical index order');
assert(source.includes("body.querySelectorAll('tr[data-ot-active=\"true\"]')"),
 'historical rows are excluded from submitted data');
assert(source.includes("'<section id=\"p79RoleTypeDefaultsPanel\">'"),'job preset list always visible');
assert(!source.includes('點擊展開設定'),'old click-to-expand instruction removed');
assert(!source.includes("select[data-col=\"0\"]"),'no type selection dropdown in conversion table');
assert(source.includes('rows=validate(imported);'),'import does not hide saved hour rows by requiring an absent type config');
assert(source.includes('loadedTypeDraft=JSON.stringify(customTypes)'),
 'migrated type preview must not falsely signal unsaved changes');
assert(source.includes("body.insertAdjacentHTML('afterbegin',editorRow"),'new active periods appear before historical read-only rows');
new vm.Script(source);
console.log('PASS overtime manager direct-edit main table, 4/6.02 archived read-only rows, no click-expand, safe 10-field save');

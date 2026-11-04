'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-overtime-report.js','utf8'),win={};
vm.runInNewContext(source,{window:win,Date,Intl,Set,Map,TextEncoder});
const api=win.P79Overtime;
const rows=[
 ['延','延04-16','4','6.02','08','16','04','08','before'],
 ['延','延24-12','4','6.02','24','08','08','12','after'],
 ['休','休08-16','8','12.70','','','08','16','full']
],archived=rows.map(r=>'builtin:'+({延:'平日延時加班',休:'休息日加班'}[r[0]])+'|'+r[1]);
const config={overtimeReportTypesV1:[['平日延時加班','延'],['休息日加班','休']],overtimeArchivedRuleKeysV1:archived,overtimeConversionRowsV1:rows};
const before=JSON.stringify(config);
assert.equal(api.activeReportRows(rows,config).length,0,'old archived filing periods stay inactive until an explicit cloud save');
assert.equal(api.managerVisibleRules(rows,config).length,3,'historical cloud rows are available to edit immediately');
assert.equal(api.managerVisibleRules(rows,config)[0][3],'6.02','saved conversion must remain exact');
assert.equal(JSON.stringify(config),before,'opening the manager must not mutate cloud data');
const disabled={...config,[api.HIDDEN_MANAGER_RULES]:['builtin:平日延時加班|延04-16']};
assert.equal(api.managerVisibleRules(rows,disabled).length,2,'confirmed deleted periods do not reappear');
assert.equal(rows.length,3,'deleted periods are retained as raw historical audit records');
assert(source.includes("['假別','出勤時段','實際加班時數','換算時數','正常起','正常迄','加班起','加班迄','位置','加班類型名稱','操作']"));
assert(source.includes("const category='<select data-col=\"0\""),'editable category select restored');
assert(source.includes("const position='<select data-col=\"8\""),'editable position select restored');
assert(source.includes("const getRows=()=>[...body.querySelectorAll('tr[data-ot-active=\"true\"]')].map(readEditorRow)"));
assert(source.includes("tr.dataset.otLegacyBuiltin==='1'"),'old 9-field extension rule identity stays intact');
assert(source.includes("const hiddenManagerKeys=[...new Set("),'deletions persist explicitly');
assert(source.includes("[HIDDEN_MANAGER_RULES]:hiddenManagerKeys"),'cloud write includes explicit hidden list');
assert(source.includes("loadedHidden=JSON.stringify(check.config[HIDDEN_MANAGER_RULES]||[])"),'readback verifies deletion list');
assert(!source.includes("renderArchivedRows("),'no separate historical/read-only list');
const start=source.indexOf(' function editorRow('),end=source.indexOf(' async function openRules(){',start);
const typeLabel={休:'休息日加班',國:'國定假日加班',例:'例假加班',代:'休假代班加班',延:'平日延時加班'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ctx={inputStyle:'width:100%',typeLabel,types:['休','國','例','代','延'],ruleType:api.ruleType,ruleKey:r=>(r[9]?'named:'+r[9]:'builtin:'+typeLabel[r[0]])+'|'+r[1],esc};
vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
const html=ctx.editorRow(rows[0]);
assert.equal((html.match(/<td>/g)||[]).length,11,'each saved cloud period is one eleven-column editable row');
assert(html.includes('value="6.02"')&&html.includes('value="4"'),'numeric conversions carried into editable controls');
assert(html.includes('class="p79OtDelete"'),'every row has a delete button');
assert(html.includes('data-ot-legacy-builtin="1"'),'source identity retained');
assert(!html.includes('唯讀'),'no read-only historical class in restored period');
new vm.Script(source);
console.log('PASS matching editable 11-column manager; old 4/6.02 conversions visible; deletion does not damage audits');

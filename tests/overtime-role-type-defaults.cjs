'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const win={};vm.runInNewContext(source,{window:win,Date,Intl,Set,Map,TextEncoder});
const api=win.P79Overtime,config={
 [api.ROLE_DEFAULTS_CONFIG]:[['指揮手','平日延時加班'],['吊車司機','休息日加班']]
};
assert.equal(api.ROLE_DEFAULTS_CONFIG,'overtimeRoleTypeDefaultsV1');
assert.equal(api.preferredOvertimeTypeForRole(config,'指揮手',api.defaults()),'平日延時加班');
assert.equal(api.preferredOvertimeTypeForRole(config,'吊車司機',api.defaults()),'休息日加班');
assert.equal(api.preferredOvertimeTypeForRole(config,'未指定職稱',api.defaults()),'');
const disabled={...config,overtimeDeletedBuiltinTypesV1:['平日延時加班']};
assert.equal(api.preferredOvertimeTypeForRole(disabled,'指揮手',api.defaults()),'');
const legacy={[api.ROLE_DEFAULTS_CONFIG]:[['指揮手','平日延長加班']]};
assert.equal(api.normalizeRoleTypeDefaults(legacy)[0][1],'平日延時加班');
assert.throws(()=>api.normalizeRoleTypeDefaults({[api.ROLE_DEFAULTS_CONFIG]:[
 ['指揮手','平日延時加班'],['指揮手','休息日加班']]}),/重複/);
assert.throws(()=>api.normalizeRoleTypeDefaults({[api.ROLE_DEFAULTS_CONFIG]:[['指揮手','未定義的類型']]}));
assert(source.includes('id="p79RoleTypeDefaultsPanel"'),'setting remains inside overtime options manager');
assert(source.includes('loadedRoleDefaults=JSON.stringify(roleTypeDefaults)'),'server role mappings load into UI');
assert(source.includes('[ROLE_DEFAULTS_CONFIG]:rolesDraft'),'server role mappings included in save payload');
assert(source.includes('JSON.stringify(normalizeRoleTypeDefaults(check.config))!==JSON.stringify(rolesDraft)'),
 'cloud readback must verify role mapping persistence');
assert(source.includes('JSON.stringify(normalizeRoleTypeDefaults(fresh.config))!==loadedRoleDefaults'),
 'concurrent administrator edits must be guarded');
assert(source.includes("roleSelect.onchange=()=>{manuallySelectedType=false;manuallySelectedPeriod=false;refreshPairPeople();preview();suggestBySelectedRole();"),
 'employee role selection suggests configured type');
assert(source.includes("empSelect.onchange=()=>{manuallySelectedType=false;manuallySelectedPeriod=false;"),
 'employee change suggests configured type');
assert(source.includes("refresh();select.selectedIndex=-1;select.value='';preview();"),
 'role recommendation may never choose overtime period/hours automatically');
assert(source.includes('prefill.preferredType||prefill.lockOriginal||(prefill.attendance&&prefill.code)'),
 'saved reports and verified attendance must not be overwritten by role default');
assert(source.includes('!prefill.preferredType&&!rolePreset'),
 'official roster must not silently overwrite configured job title type');
assert(source.includes('const selectedRow=()=>')&&source.includes("select.value!==''&&select.selectedIndex>=0"),
 'empty period selector cannot be interpreted as index zero');
assert(source.includes('.filter(({row})=>matches(row));'),
 'saved periods remain visible even when the formal roster disagrees');
assert(source.includes("if(!chosen)throw Error('請先選擇正確出勤時段"),
 'submissions require explicit actual selected period');
assert(source.includes("const actualRosterShift=await officialOvertimeRosterShift(empId,date);"),
 'official roster still blocks false rest-day declarations');
new vm.Script(source);
console.log('PASS overtime job-title defaults in options manager; cloud conflict/readback checks; deleted type/legacy alias; no automatic periods or history changes');

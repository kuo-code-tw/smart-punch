const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const context=require('../assets/port79-org-context.js');

const shared=fs.readFileSync('assets/port79-seven-top.js','utf8');
const start=shared.indexOf('const P79_ORG_LEVELS=');
const end=shared.indexOf('const GLOBAL_THEME_KEY',start);
assert(start>=0&&end>start,'shared hierarchy must be available');
const win={};
vm.runInNewContext(shared.slice(start,end),{window:win,Array,Object,String});
const sharedValue=win.Port79OrgHierarchy.getValue;

const checks=[
 [{section:'',unit:'舊倉庫組',orgHierarchy:{section:'79W作業課'}},'79W作業課','prefer explicit nested unit to an empty root field'],
 [{section:'',unit:'舊倉庫組'},'','empty official unit must not restore a stale legacy unit'],
 [{section:null,unit:'舊倉庫組'},'','null official unit must not restore a stale legacy unit'],
 [{section:'79W作業課',unit:'舊倉庫組'},'79W作業課','official unit wins'],
 [{unit:'79W作業課'},'79W作業課','valid legacy-only unit stays readable'],
 [{unit:'第二事業處'},'','business office is not a unit'],
 [{section:'第二事業處',orgHierarchy:{section:'79W作業課'}},'79W作業課','skip mislabeled parent and use nested official unit'],
 [{section:'第二事業處',unit:'79W作業課'},'','badly classified official office is not a unit'],
 [{orgHierarchy:{section:'63W總務會計課'},dept:'第二事業處'},'63W總務會計課','nested official unit is respected']
];
for(const [person,wanted,why] of checks){
 assert.equal(context.value(person,'sections'),wanted,'filter: '+why);
 assert.equal(sharedValue(person,'sections'),wanted,'seven systems: '+why);
}

const people=[{empId:'001',section:'79W作業課'},{empId:'002',unit:'第二事業處'},{empId:'003',unit:'63W總務會計課'}];
const lookup=context.index(people);
assert.equal(context.matches({empId:'001'},{sections:'79W作業課'},lookup),true);
assert.equal(context.matches({empId:'002'},{sections:'79W作業課'},lookup),false);
assert.equal(context.matches({empId:'003'},{sections:'63W總務會計課'},lookup),true);
assert.equal(context.organization(people[1]).sections,'','higher levels must not enter unit selection');

const source=fs.readFileSync('assets/port79-org-context.js','utf8');
assert(!source.includes('<div class="p79-org-heading">'),'redundant hierarchy heading is not rendered');
assert(source.includes('data-org-level')&&source.includes('data-org-clear'),'all four filters and clear remain');
const hr=fs.readFileSync('hr/port79-hr-reference-dashboard.js','utf8');
assert(hr.includes("getValue(e,'sections')"),'HR dashboard grouping uses canonical unit');
assert(!hr.includes("||e.section||e.unit||'未設定單位'"),'canonical empty unit must not silently fall back');
for(const file of ['leave','schedule','aqc-efficiency','hr','history-data']){
 const page=fs.readFileSync(file+'/index.html','utf8');
 assert(page.includes('port79-org-context.js?v=20261112-unit-source-v2'),file+' loads updated organization filter');
 assert(page.includes('org=20261112-unit-source-v2'),file+' reloads shared organization reader');
}
console.log('PASS official unit precedence, legacy compatibility, no parent-as-unit, filter consistency, hidden heading and cross-system references');

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
assert(!source.includes('p79OrganizationScope')&&!source.includes('data-org-level')&&!source.includes('data-org-clear'),'shared organization scope UI must not be generated');
const rosters=[{empId:'A01',unit:'79W作業課'},{empId:'B02',unit:'63W總務會計課'}];
const timerCalls=[],listenerCalls=[],elements=[];
const originalWindow=global.window,originalDocument=global.document,originalSetInterval=global.setInterval,originalClearInterval=global.clearInterval;
try{
 global.window={addEventListener:(name,fn)=>listenerCalls.push([name,fn])};
 global.document={visibilityState:'visible',createElement:()=>{elements.push(true);throw Error('organization UI must not be mounted')}};
 global.setInterval=(fn)=>{timerCalls.push(fn);return 1};
 global.clearInterval=()=>{};
 const scope=context.configure({system:'schedule',people:()=>rosters});
 assert.deepEqual(scope.filter(rosters),rosters,'removing UI must not remove authorized employees');
 assert.deepEqual(Object.values(scope.selection()),['','','',''],'organization scope is inactive for every level');
 assert.equal(scope.person({empId:'A01'}).empId,'A01','roster lookup preserved');
 rosters.push({empId:'C03',unit:'新課'});
 scope.sync();
 assert.equal(scope.person({empId:'C03'}).empId,'C03','roster refresh preserved');
 assert.equal(elements.length,0,'no DOM elements created');
 assert.equal(timerCalls.length,1,'live lookup refresh remains');
 assert.equal(listenerCalls[0][0],'pagehide','interval cleanup remains');
}finally{
 global.window=originalWindow;global.document=originalDocument;
 global.setInterval=originalSetInterval;global.clearInterval=originalClearInterval;
}
const hr=fs.readFileSync('hr/port79-hr-reference-dashboard.js','utf8');
assert(hr.includes("getValue(e,'sections')"),'HR dashboard grouping uses canonical unit');
assert(!hr.includes("||e.section||e.unit||'未設定單位'"),'canonical empty unit must not silently fall back');
for(const file of ['leave','schedule','aqc-efficiency','hr','history-data']){
 const page=fs.readFileSync(file+'/index.html','utf8');
 assert(page.includes('port79-org-context.js?v=20261112-remove-scope-ui-v3'),file+' loads no-UI organization helper');
 assert(page.includes('org=20261112-unit-source-v2'),file+' retains shared hierarchy reader');
}
console.log('PASS hierarchy values, removed scope UI across systems, live organization lookup and cache-busting script references');

const fs=require('fs');
const vm=require('vm');
const assert=require('node:assert/strict');
const shared=fs.readFileSync('assets/port79-seven-top.js','utf8');
const start=shared.indexOf('const P79_ORG_LEVELS=');
const end=shared.indexOf('const GLOBAL_THEME_KEY',start);
assert(start>0&&end>start,'seven-system hierarchy reader exists');
const window={};
vm.runInNewContext(shared.slice(start,end),{window,Object,Array,String});
const org=window.Port79OrgHierarchy;
assert.equal(org.levels.length,5);
assert.deepEqual(Array.from(org.levels).map(x=>x[1]),['總公司','事業部','事業處','單位','職稱']);
const legacy={dept:'第二事業處',unit:'卸船組',jobTitle:'AQC'};
assert.equal(org.getValue(legacy,'headquarters'),'');
assert.equal(org.getValue(legacy,'divisions'),'','legacy office cannot become division');
assert.equal(org.getValue(legacy,'offices'),'第二事業處');
assert.equal(org.getValue(legacy,'sections'),'卸船組','unit is preferred for unit statistics');
assert.equal(org.getValue({dept:'一般管理部門',unit:''},'offices'),'');
assert.equal(org.getValue({dept:'一般管理部門',unit:''},'divisions'),'');
assert.equal(org.getValue({dept:'第二事業部',unit:''},'divisions'),'第二事業部');
const explicit={headquarters:'總公司',division:'第一事業部',office:'第一事業處',section:'裝卸中心',jobTitle:'指揮手'};
assert.deepEqual(['headquarters','divisions','offices','sections','jobTitles'].map(x=>org.getValue(explicit,x)),['總公司','第一事業部','第一事業處','裝卸中心','指揮手']);
assert.equal(org.getValue({orgHierarchy:{headquarters:'北區總公司',division:'物流事業部',office:'碼頭事業處',section:'碼頭課'}},'sections'),'碼頭課');

const hr=fs.readFileSync('hr/index.html','utf8');
for(const name of ['fHQ','fDivision','fOffice','fUnit','fDept','fJob'])
 assert(hr.includes('id="'+name+'"'),'missing HR filter: '+name);
for(const label of ['總公司','事業部','事業處','單位','原部門','職稱'])
 assert(hr.includes('<th><button class="thlink"')&&hr.includes('>'+label+' 🔎</button>'),'missing HR column: '+label);
assert(hr.includes("p79HrOrgValue(e,'sections')"));
assert(hr.includes('單位數'));
assert(hr.includes("事業處:p79HrOrgValue(e,'offices')"),'export includes official level');
const dash=fs.readFileSync('hr/port79-hr-reference-dashboard.js','utf8');
assert(dash.includes("getValue(e,'sections')"));
assert(!dash.includes("e.dept||e.unit||'未設定單位'"),'legacy department incorrectly used for unit statistics');
const importer=fs.readFileSync('assets/port79-hr-import.js','utf8');
assert(importer.includes("dept:['原部門','部門','dept']"));
assert(importer.includes('不會由舊部門自動猜測'));
console.log('PASS four-level hierarchy, safe legacy data mapping, HR filters, exports, stats and import compatibility');

const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const O=require('../assets/port79-org-context.js');
const people=[{empId:'A',attNo:'001',headquarters:'總公司甲',division:'事業部甲',office:'事業處甲',section:'作業課',dept:'舊部門'},{empId:'B',attNo:'002',headquarters:'總公司乙',division:'事業部乙',office:'事業處乙',section:'作業課'}];
const idx=O.index(people),before=JSON.stringify(people);
assert(O.matches({empId:'A'}, {headquarters:'總公司甲',sections:'作業課'},idx));assert(!O.matches({empId:'B'},{headquarters:'總公司甲',sections:'作業課'},idx));assert(!O.matches({name:'同名人員'},{sections:'作業課'},idx));assert(O.matches({attNo:'1'},{offices:'事業處甲'},idx));assert(!O.matches({empId:'X',attNo:'1'},{offices:'事業處甲'},idx));
assert.equal(O.value({section:'',unit:'舊單位'},'sections'),'');assert.equal(O.value({dept:'第二事業處'},'divisions'),'');assert.equal(O.value({dept:'第二事業處'},'offices'),'第二事業處');assert.equal(O.value({dept:'一般部門'},'sections'),'');assert.equal(JSON.stringify(people),before);
assert.equal(O.resolve({attNo:'1'},O.index([...people,{empId:'C',attNo:'01'}])),null);
const c={Date,Error,Object,JSON,String,Array};vm.createContext(c);vm.runInContext(fs.readFileSync('backend/employee-organization-preserve.gs','utf8'),c);
const old={empId:'A',headquarters:'HQ',division:'DIV',office:'OFF',section:'SEC',unit:'SEC',transferHistory:[]};
for(const authoritative of [false,true]){const r={unit:'STALE'};c.p79PreserveEmployeeOrganization_(r,{},old,authoritative);assert.equal(r.section,'SEC');assert.equal(r.unit,'SEC')}
let r={section:'',unit:'STALE'};c.p79PreserveEmployeeOrganization_(r,{section:''},old,true);assert.equal(r.section,'');assert.equal(r.unit,'');
r={headquarters:'NEW',section:'NEW'};c.p79PreserveEmployeeOrganization_(r,r,old,false);assert.equal(r.headquarters,'HQ');assert.equal(r.section,'SEC');
r={section:' ADMIN '};c.p79PreserveEmployeeOrganization_(r,r,old,true);assert.equal(r.section,'ADMIN');assert.equal(r.unit,'ADMIN');assert.equal(r.office,'OFF');c.p79RecordOrganizationChange_(r,old,'TEST');assert.equal(r.transferHistory.length,1);assert.equal(r.transferHistory[0].toOrganization[3],'ADMIN');
assert.throws(()=>c.p79PreserveEmployeeOrganization_({},{headquarters:{}},{},true));
for(const page of ['attendance','work-hours','leave','schedule','aqc-efficiency','history-data','hr']){const s=fs.readFileSync(page+'/index.html','utf8');assert(s.includes('port79-org-context.js'),page);if(page!=='hr')assert(s.includes('Port79OrgContext.configure'),page)}
const hr=fs.readFileSync('hr/index.html','utf8');for(const k of ['personHQ','personDivision','personOffice'])assert(hr.includes('id="'+k+'"'));assert(hr.includes('雲端組織歸屬讀回不一致'));
console.log('PASS unified organization: precise IDs, ambiguous IDs, four-level matching, legacy safety, explicit clearing, old-client preservation, HR audit and seven page integration');

// Both attendance-derived pages use a section rather than main; the toolbar must mount inside the authorized admin view.
for(const page of ['attendance','work-hours'])assert(fs.readFileSync(page+'/index.html','utf8').includes("container:()=>document.getElementById('viewAdmin')"));

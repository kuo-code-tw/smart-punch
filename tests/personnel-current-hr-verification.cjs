'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
const reference=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/personnel-reference-dashboard.js'),'utf8');
function fn(name){
  const start=html.indexOf('function '+name+'(');assert(start>=0,'missing '+name);
  const end=html.indexOf('\n}',start);assert(end>start,'incomplete '+name);
  return html.slice(start,end+2);
}
const employees=[
 {empId:'A1',name:'阿明',jobTitle:'AQC',employmentStatus:'active'},
 {empId:'B1',name:'阿華',jobTitle:'AQC',employmentStatus:'active'},
 {empId:'C1',name:'同名',jobTitle:'AQC',employmentStatus:'active'},
 {empId:'Z1',name:'同名',jobTitle:'AQC',employmentStatus:'resigned'},
 {empId:'L1',name:'離職甲',jobTitle:'AQC',employmentStatus:'resigned'},
 {empId:'T1',name:'留停乙',jobTitle:'AQC',employmentStatus:'leave'},
 {empId:'X1',name:'調職丙',jobTitle:'ARMG',employmentStatus:'active'}
];
const row=(name,empId,id)=>({id,name,empId,source:'working-report',workDate:'2026-11-07',disc:10,load:2,hatches:1});
const rows=[
 row('阿明','A1','r1'),row('阿明','NAME:阿明','r2'),row('阿華','B1','r3'),
 row('同名','NAME:同名','r4'),row('同名','Z1','r5'),row('離職甲','L1','r6'),
 row('留停乙','T1','r7'),row('阿明','X1','r8'),row('陌生','MISSING','r9')
];
const before=JSON.stringify(rows);
const c={
 systemEmployees:employees,p79AqcHeadcountVerified:false,
 normalizePersonName:s=>String(s||'').replace(/\s+/g,''),displayPersonName:s=>String(s||''),
 isAqcEmployee:e=>e.jobTitle==='AQC'&&e.employmentStatus==='active',
 workloadRecordMetrics:r=>({hours:2,disc:10,load:2,hc:1,containers:12}),
 personnelGroupCode:v=>/^[ABCD]組$/.test(v)?v[0]:'',
 operationGroupForRecord:r=>r.empId==='A1'?'A組':'B組'
};
vm.createContext(c);vm.runInContext(fn('p79VerifiedAqcReportView'),c);
let result=c.p79VerifiedAqcReportView(rows);
assert.equal(result.verified,false,'cached report alone cannot establish official current AQC headcount');
assert.equal(result.persons.length,0);assert.equal(result.rows.length,0);
c.p79AqcHeadcountVerified=true;
result=c.p79VerifiedAqcReportView(rows);
assert.equal(result.verified,true);
assert.equal(result.rosterCount,3,'HR has three current AQC employees, not all historical workers');
assert.deepEqual(result.rows.map(r=>r.id),['r1','r2','r3'],'only verified active AQC identities may contribute');
assert.equal(result.persons.length,2,'working headcount is current roster members with report rows');
assert.equal(result.persons.find(p=>p.empId==='A1').containers,24,'name-only records uniquely matching active HR IDs are aggregated');
assert.equal(result.persons.find(p=>p.empId==='B1').containers,12);
assert.equal(result.excluded,6);
assert.equal(JSON.stringify(rows),before,'historical WORKING REPORT entries remain unmodified');
const nodes=new Map();
function el(id){if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',hidden:false,querySelectorAll:()=>[],querySelector:()=>null});return nodes.get(id);}
const window={addEventListener(){}};const d={getElementById:el,querySelector:()=>null};
const ui={window,document:d,Intl,Number,Math,String,Map,Array};
vm.createContext(ui);vm.runInContext(reference,ui);assert.equal(typeof window.P79PersonnelReference.render,'function');
window.P79PersonnelReference.render({rows,persons:result.persons,rosterVerified:false,metrics:c.workloadRecordMetrics,groupCode:()=>''});
assert.equal(el('p79prPeople').textContent,'—','unverified roster never displays historic 39-style headcounts');
assert.match(el('p79prFreshness').textContent,/人資正式名冊待核對/);
window.P79PersonnelReference.render({rows:result.rows,persons:result.persons,rosterVerified:true,rosterCount:result.rosterCount,excludedRows:result.excluded,metrics:c.workloadRecordMetrics,groupCode:()=>''});
assert.equal(el('p79prPeople').textContent,'2');
assert.equal(el('p79prCount').textContent,'3');
assert.match(el('p79prFreshness').textContent,/人資在職 AQC 3 人/);
assert.match(el('p79prFreshness').textContent,/已排除 6 筆/);
assert.match(html,/personnel-reference-dashboard\.js\?v=20261112-verified-aqc-v1/,'new script version invalidates previous cached personnel dashboard');
assert.match(html,/const hrView=p79VerifiedAqcReportView\(rs\)/);
assert.match(html,/apiGet\('gcGetEmployees'\)/,'current HR roster must be read through dedicated endpoint');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 if(/\bsrc=|application\/ld\+json/i.test(m[1])||!m[2].trim())continue;
 new vm.Script(m[2]);
}
console.log('PASS current HR AQC personnel counts, unique identity matching, retired/transfer/leave exclusion, unknown roster masking and original report preservation');

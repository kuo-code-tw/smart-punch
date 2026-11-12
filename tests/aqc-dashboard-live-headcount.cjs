'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function fn(name){
  const start=html.indexOf('function '+name+'(');
  assert(start>=0,'missing '+name);
  const end=html.indexOf('\n}',start);
  assert(end>start,'incomplete '+name);
  return html.slice(start,end+2);
}
const node={textContent:'37',title:''};
const ctx={
  Map,Set,document:{getElementById:id=>id==='kpiPeople'?node:null},
  normalizePersonName:s=>String(s||'').replace(/\s+/g,''),
  systemEmployees:[],p79AqcHeadcountVerified:false,
  records:[{empId:'OLD',name:'已離職多年的舊員工',source:'working-report',workDate:'2026-11-05',disc:30}]
};
vm.createContext(ctx);
for(const name of ['currentOfficialJobTitle','isAqcEmployee','people','updateCurrentAqcHeadcount'])
  vm.runInContext(fn(name),ctx);
assert.equal(ctx.people().length,0,'Historical WORKING REPORT must not recreate current personnel roster');
ctx.updateCurrentAqcHeadcount();
assert.equal(node.textContent,'—','Before fresh HR validation stale count 37 must not be shown');
assert.match(node.title,/尚未核對/);
ctx.systemEmployees=[
  ...Array.from({length:36},(_,i)=>({empId:'ACTIVE-'+i,name:'現職'+i,jobTitle:'AQC',employmentStatus:'active'})),
  {empId:'OLD',name:'已離職多年的舊員工',jobTitle:'AQC',employmentStatus:'resigned'}
];
assert.equal(ctx.people().length,36,'Former AQC employee cannot inflate headcount to 37');
ctx.p79AqcHeadcountVerified=true;
ctx.updateCurrentAqcHeadcount();
assert.equal(node.textContent,'36','Verified HR roster must replace stale 37');
assert.match(node.title,/最新人資主檔/);
ctx.systemEmployees=ctx.systemEmployees.filter(x=>x.empId!=='ACTIVE-0');
ctx.updateCurrentAqcHeadcount();
assert.equal(node.textContent,'35','Subsequent verified status changes must repaint KPI');
ctx.p79AqcHeadcountVerified=false;
ctx.updateCurrentAqcHeadcount();
assert.equal(node.textContent,'—','Unverified GC backup must not present a former count as current');
const verifiedWrites=(html.match(/p79AqcHeadcountVerified=true;/g)||[]).length;
const resets=(html.match(/p79AqcHeadcountVerified=false;/g)||[]).length;
assert(verifiedWrites>=4,'Manual, group and two cloud HR refreshes must verify roster before display');
assert(resets>=3,'Initial screen and GC snapshots should remain unverified');
assert((html.match(/updateCurrentAqcHeadcount\(\);/g)||[]).length>=4,'Dashboard and background HR reads must refresh header');
assert(!fn('people').includes('forEach(r=>'),'Historical working-report fallback must not return');
for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=|application\/ld\+json/.test(m[1]))new vm.Script(m[2]);
console.log('PASS dashboard live 36-vs-37 headcount, no historical resurrection, verified-only KPI and background HR repaint');

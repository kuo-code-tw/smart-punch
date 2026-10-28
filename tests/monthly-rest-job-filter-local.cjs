'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const html=fs.readFileSync('work-hours/index.html','utf8');
const st=s.indexOf(' function filter(){'),en=s.indexOf(' function invalidate(){',st);
assert(st>=0&&en>st,'local staff and visible row helpers present');
const context={people:[
 {empId:'A',name:'甲',dept:'第一事業處',jobTitle:'ARMG'},
 {empId:'B',name:'乙',dept:'第一事業處',jobTitle:'F/L'},
 {empId:'C',name:'丙',dept:'第二事業處',jobTitle:'ARMG'}
],model:{rows:[
 {empId:'A',date:'2026-10-28',checked:true},
 {empId:'B',date:'2026-10-28',checked:false},
 {empId:'C',date:'2026-10-28',checked:true}
]},busy:false,
controls:{"#mrDept":{value:''},"#mrJob":{value:''},"#mrEmp":{value:''}},
q:function(x){return this.controls[x]},id:x=>String(x||'').trim().toUpperCase(),job:x=>x.jobTitle||x.deptDetail||'未設定',
options:()=>'',esc:x=>x};
context.q=context.q.bind(context);vm.createContext(context);
vm.runInContext(s.slice(st,en),context);
const get=()=>Array.from(context.visibleRows(),({r,i})=>({empId:r.empId,i,checked:r.checked}));
assert.deepEqual(get(),[{empId:'A',i:0,checked:true},{empId:'B',i:1,checked:false},{empId:'C',i:2,checked:true}]);
context.controls['#mrJob'].value='ARMG';
assert.deepEqual(get(),[{empId:'A',i:0,checked:true},{empId:'C',i:2,checked:true}],'job filter does not erase model or original row indices');
context.controls['#mrDept'].value='第二事業處';
assert.deepEqual(get(),[{empId:'C',i:2,checked:true}],'department filter uses already loaded employee data');
context.controls['#mrDept'].value='';
context.controls['#mrJob'].value='F/L';
assert.deepEqual(get(),[{empId:'B',i:1,checked:false}]);
assert.equal(context.model.rows[0].checked,true,'previous checked rows persist across job changes');
assert.equal(context.model.rows[2].checked,true,'other department selection also persists');
assert(s.includes("q('#mrDept').onchange=jobs;q('#mrJob').onchange=names"),'department and role change work locally');
assert(s.includes("q('#mrEmp').onchange=()=>{if(model&&!busy)paint();}"),'employee change repaints without a cloud fetch');
assert(s.includes("q('#mrMonth').onchange=()=>{if(!busy)q('#mrLoad').click();}"),'month change intentionally rereads');
assert(s.includes("loadedPeople=people.slice()"),'first cloud read includes all authorized employees');
assert(s.includes("visibleRows().map(({r,i})=>r.saved?''"),'render only selected staff but preserve model indices');
assert(s.includes("visibleRows().forEach(({r})=>{if(!r.saved&&!r.planned)r.checked=q('#mrAll').checked;}"),'select all only applies to visible staff');
assert(html.includes('port79-monthly-rest-overtime.js?v=20261028-forward-from-today-v5'),'browser must load updated dialog script');
console.log('PASS job/dept/person filters are local, preserve cross-filter checked reports and original indexes, reload only on month change/explicit refresh');

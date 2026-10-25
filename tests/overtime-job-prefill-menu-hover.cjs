const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const ctx={};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
const api=ctx.P79Overtime;
const people=[
 {empId:'W1',name:'代班甲',jobTitle:'F/L',dept:'第二事業處'},
 {empId:'W2',name:'代班乙',deptDetail:'AQC',dept:'第二事業處'},
 {empId:'W3',name:'代班丙',role:'ARMG'},
 {empId:'L1',name:'請假者',jobTitle:'F/L'}
];
assert.equal(api.reportEmployeeRole(people[0]),'F/L','employee jobTitle should be preferred');
assert.equal(api.reportEmployeeRole(people[1]),'AQC','fallback must match leave module deptDetail');
assert.equal(api.reportEmployeeRole(people[2]),'ARMG','older person records keep role fallback');
const control={value:'',options:[{value:''},{value:'F/L'},{value:'AQC'},{value:'ARMG'}]};
assert.equal(api.prefillReportRole(control,people,'W1'),true);assert.equal(control.value,'F/L','leave-picked worker must preselect its job title');
control.value='';assert.equal(api.prefillReportRole(control,people,'W2'),true);assert.equal(control.value,'AQC','fallback job title should be selected');
control.value='ARMG';assert.equal(api.prefillReportRole(control,people,'MISSING'),false);assert.equal(control.value,'ARMG','unknown worker must not mutate user selection');
assert(source.includes('<label>職稱<select id="p79OtRole"'),'field label should be only 職稱');
assert(!source.includes('<label>職稱篩選<select id="p79OtRole"'),'old label should be removed');
assert(source.includes('prefillReportRole(roleSelect,people,prefill.empId);'),'prefill must be applied before worker refresh');
const css=fs.readFileSync('assets/port79-seven-top.css','utf8');
assert(!css.includes('#p79SevenMenuWrap button:hover{background:#f1f5f9}'),'broad hover must no longer whiten the function menu trigger');
assert(css.includes('#p79SevenMenuWrap>#p79SevenMenuButton:hover'),'top button needs an explicit accessible hover color');
assert(css.includes('background:#0e7490;\n  color:#fff;'),'teal background needs white readable text on hover');
assert(css.includes('.p79-seven-standard-menu) button:hover'),'dropdown item hover should still be distinct');
for(const p of ['aqc-efficiency','history-data','hr','leave','schedule','work-hours']){
 const html=fs.readFileSync(p+'/index.html','utf8');
 assert(html.includes('port79-seven-top.css?v=20261024-unified-status-icons&menuhover=20261026a'),p+' must reload fixed shared menu style');
}
for(const p of ['hr','leave','schedule','work-hours']){
 const html=fs.readFileSync(p+'/index.html','utf8');
 assert(/port79-overtime-report\.js\?v=[^"']*&role20261026=1/.test(html),p+' must reload auto job-role module');
}
console.log('PASS overtime worker-role prefill, short label, shared seven-system function menu hover, and cache versions');

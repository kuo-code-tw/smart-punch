const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('leave/index.html','utf8');
const code=html.slice(html.indexOf('let p79PendingLeavePromptShown='),html.indexOf('async function loadCloud('));
function run({admin=true,access='manage',mode='admin',rows=[]}={}){
 let shown=0,dialog;
 const controls={};const fields={filterDept:{value:'D'},filterJob:{value:'J'},filterStatus:{value:''},adminLeaveBody:{scrollIntoView(){}}};
 const ctx={adminSession:admin?{}:null,leaveAccess:access,currentMode:mode,leaveRecords:rows,esc:v=>String(v).replaceAll('<','&lt;'),$:id=>fields[id],renderAdmin(){},document:{body:{appendChild(){}},createElement(){dialog={style:{},setAttribute(){},querySelector:s=>controls[s]||(controls[s]={}),addEventListener(){},showModal(){shown++},close(){}};return dialog;}}};
 vm.createContext(ctx);vm.runInContext(code,ctx);vm.runInContext('p79ShowPendingLeavePrompt();p79ShowPendingLeavePrompt()',ctx);
 return {shown,dialog,controls,fields};
}
const rows=[{name:'<員工>',status:'待審核'},{name:'核准者',status:'已核准'},{name:'舊資料'}];
const r=run({rows});assert.equal(r.shown,1);assert(r.dialog.innerHTML.includes('待審核請假 2 筆'));assert(!r.dialog.innerHTML.includes('核准者'));assert(r.dialog.innerHTML.includes('&lt;員工>'));
r.controls['[data-review]'].onclick();assert.equal(r.fields.filterDept.value,'');assert.equal(r.fields.filterJob.value,'');assert.equal(r.fields.filterStatus.value,'待審核');
for(const opts of [{admin:false,rows},{access:'view',rows},{mode:'employee',rows},{}])assert.equal(run(opts).shown,0);
assert(html.includes('renderAll();p79ShowPendingLeavePrompt();setStatus(adminSession?'));
console.log('PASS fresh-data admin pending dialog, once per entry, review filter, escaping, no employee/read-only/empty popup');

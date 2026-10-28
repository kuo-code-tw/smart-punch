const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),patch=require('../scripts/apply-gas-scope-conversion.cjs');
const read=p=>fs.readFileSync(p,'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
const backend={};vm.createContext(backend);vm.runInContext(read('backend/assigned-job-scopes.gs')+'\n'+read('backend/overtime-conversion-rule.gs'),backend);
const client={window:{},console,Date,JSON,Number,String,Array,Map,Set,Math,Intl};vm.createContext(client);vm.runInContext(read('assets/port79-overtime-report.js'),client);const ui=client.window.P79Overtime;
const systems=['attendance','workhours','leave','schedule','efficiency','hr','history'];let passed=0;function test(name,f){f();passed++;console.log('PASS '+name)}
test('all seven systems retain F/L and leader together through normalize, JSON save and readback',()=>{
 const input={dataScopeJobs:Object.fromEntries(systems.map(sys=>[sys,['F/L','領班','AQC','ARMG','指揮手']]))};
 const saved=JSON.parse(JSON.stringify(backend.p79NormalizeJobScopes_(input))),reread=backend.p79NormalizeJobScopes_({dataScopeJobs:saved});
 for(const sys of systems)assert.deepEqual(plain(reread[sys]),input.dataScopeJobs[sys]);
});
test('literal titles already used by the company are preserved, including ship commanders',()=>{
 assert.deepEqual(plain(backend.p79NormalizeJobScopes_({dataScopeJobs:{schedule:['船上指揮手','保養員','其他正式職稱']}}).schedule),['船上指揮手','保養員','其他正式職稱']);
});
test('F/L spelling variants canonicalize and duplicates do not change the selected set',()=>{
 assert.deepEqual(plain(backend.p79NormalizeJobScopes_({dataScopeJobs:{attendance:[' f／l ','F/L','FL','領班','領班']}}).attendance),['F/L','領班']);
});
test('malformed title input cannot become an all-personnel scope',()=>{
 const jobs=backend.p79NormalizeJobScopes_({dataScopeJobs:{hr:[null,{},1,'','\n','A'.repeat(65)]}});assert.equal(jobs.hr.length,0);
 const session={adminRole:'admin',dataScope:{hr:'assigned'},dataScopeJobs:jobs};assert.equal(backend.p79CanReadScopedEmployee_(session,'hr',{jobTitle:'F/L'}),false);
});
test('assigned scope includes F/L and leader but excludes unrelated job titles',()=>{
 for(const sys of systems){const session={adminRole:'admin',dataScope:{[sys]:'assigned'},dataScopeJobs:{[sys]:['F/L','領班']}};
  for(const title of ['F/L','FL','f／l','領班'])assert.equal(backend.p79CanReadScopedEmployee_(session,sys,{jobTitle:title}),true);
  assert.equal(backend.p79CanReadScopedEmployee_(session,sys,{jobTitle:'AQC'}),false);}
});
test('self, unit and department boundaries remain unchanged',()=>{
 assert.equal(backend.p79CanReadScopedEmployee_({empId:'A',dataScope:{hr:'self'}},'hr',{empId:'B',jobTitle:'F/L'}),false);
 assert.equal(backend.p79CanReadScopedEmployee_({dept:'D',dataScope:{hr:'department'}},'hr',{dept:'OTHER'}),false);
 assert.equal(backend.p79CanReadScopedEmployee_({unit:'U',dataScope:{hr:'unit'}},'hr',{unit:'U'}),true);
});
const standard=['延','代16-20',4,'','08','16','16','20','after'];
test('the exact standard extension rule resolves to the same 6.02 on client and GAS',()=>{
 assert.equal(ui.report(standard).convertedHours,6.02);assert.equal(backend.p79DirectResolvedRule_(standard)[3],6.02);assert.equal(standard[3],'');
});
test('colon time notation uses the same conversion as compact times',()=>{
 const row=[...standard];for(const i of [4,5,6,7])row[i]+=':00';assert.equal(ui.report(row).convertedHours,6.02);assert.equal(backend.p79DirectResolvedRule_(row)[3],6.02);
});
test('explicit cloud values including zero always win',()=>{
 for(const value of [0,'0',5.5,'7.25']){const row=[...standard];row[3]=value;assert.equal(ui.report(row).convertedHours,Number(value));assert.equal(Number(backend.p79DirectResolvedRule_(row)[3]),Number(value));}
});
test('a similarly named leave cover or a different period does not receive a guessed conversion',()=>{
 for(const row of [['代','代16-20',4,'','','','16','20','full'],['延','代20-08',4,'','24','08','20','24','before']]){
  assert.equal(ui.report(row).convertedHours,null);assert.equal(backend.p79DirectResolvedRule_(row)[3],'');}
});
test('every default rule has matching client/server conversion semantics',()=>{
 for(const row of ui.defaults()){const a=ui.report(row),b=backend.p79DirectResolvedRule_(row);assert.equal(a.convertedHours,b[3]===''?null:Number(b[3]));}
});
const draft={id:'UNCHANGED-ID',rule:ui.report(standard)},saved={...ui.report(standard),id:draft.id};
test('a correct report receipt is accepted and keeps the original ID',()=>{
 assert(ui.verifySavedReport(draft,{report:saved}));assert(backend.p79DirectConversionReceipt_(saved,draft.id,standard));
});
test('the former null-conversion success reply now fails on both sides',()=>{
 const broken={...saved,convertedHours:null};assert.throws(()=>ui.verifySavedReport(draft,{report:broken}),/雲端沒有保留換算時數/);assert.equal(backend.p79DirectConversionReceipt_(broken,draft.id,standard),false);
});
test('wrong ID, hours or time cannot close the editor as saved',()=>{
 for(const changes of [{id:'DIFFERENT'},{declaredHours:8},{overtimeStart:'15'}]){const broken={...saved,...changes};assert.throws(()=>ui.verifySavedReport(draft,{report:broken}));assert.equal(backend.p79DirectConversionReceipt_(broken,draft.id,standard),false);}
});
test('a legitimate unset custom rule stays unset, and a stored zero is not missing',()=>{
 const row=['代','代16-20',4,'','','','16','20','full'],d={id:'C',rule:ui.report(row)};assert(ui.verifySavedReport(d,{report:{...d.rule,id:d.id}}));
 const z={...draft,rule:{...draft.rule,convertedHours:0}};assert(ui.verifySavedReport(z,{report:{...z.rule,id:z.id}}));
});
test('the targeted patcher preserves unrelated live code and refuses unknown/already-patched sources',()=>{
 const fixture=`const API_VERSION = 'old';\nconst KEEP='UNCHANGED';\nfunction p79NormalizeJobScopes_(){}\nfunction p79CanReadScopedEmployee_(){}\nfunction p79ScopeEmployeeIdSet_(){}\nfunction p79PlanDirectReport_(rows,request,rule,attendance,leaveCovers,leaveRecords){}\nfunction adapter(){const rule=matches[0];p79DirectRuleEnvelope_(date,rule);if(!saved||saved.id!==data.id||saved.code!==rule[1])throw Error('加班寫入尚未通過讀回確認，請保留申報識別碼再試');}\nfunction p79DirectReportSameRequest_(meta,request,rule){return false;}`;
 const result=patch(fixture);assert(result.includes("const KEEP='UNCHANGED';"));assert(result.includes('p79DirectConversionReceipt_(saved,data.id,rule)'));assert.throws(()=>patch(result),/already patched/);assert.throws(()=>patch('unknown'),/unsupported/);
});
test('native workhours and the shared editor verify receipts before updating rows or closing',()=>{
 const html=read('work-hours/index.html');
 assert(html.includes('window.P79Overtime?.verifySavedReport?.(draft,result);'));
 const source=read('assets/port79-overtime-report.js');assert(source.indexOf('verifySavedReport(draft,result);',source.indexOf('const result=await global.p79OvertimeContext.saveReport'))<source.indexOf('sessionStorage.removeItem(KEY);el.querySelector'));
 assert(read('hr/index.html').includes('p79AvailableJobScopes(),...Object.values(selectedJobs)'));
});
console.log(JSON.stringify({passed,scope:'Synthetic client/server rules, literal job scopes, JSON roundtrip and receipt checks; no employee edits'}));

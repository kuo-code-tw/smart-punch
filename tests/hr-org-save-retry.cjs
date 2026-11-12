const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');const html=fs.readFileSync('hr/index.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert(start>=0,name);const a=html.slice(start-6,start)==='async '?start-6:start;const line=html.slice(a,html.indexOf('\n',a));return line.endsWith('}')?line:html.slice(a,html.indexOf('\n}',a)+2)}
function setup(){const els={saveOrgBtn:{disabled:false,textContent:'儲存'},orgSaveStatus:{textContent:'',style:{}},status:{textContent:''}},draft={departments:['D'],jobTitles:['AQC'],units:['U'],divisions:['事業部'],offices:['事業處'],sections:['作業課']},posts=[],reads=[],timers=[];const c={console,Promise,JSON,Error,String,Array,TextEncoder,$:id=>els[id],orgDraft:draft,orgSettings:{departments:[],jobTitles:[],units:[]},hrAccess:'manage',canHr:()=>true,normalizeOrgSettings:x=>JSON.parse(JSON.stringify(x)),P79_HR_ORG_OPTIONS_KEY:'hrOrgOptionsV1',P79_HR_ORG_OPTIONS_V2_KEY:'hrOrgOptionsV2',window:{},p79CanonicalOrgOptions:null,orgDialog:{closed:false,close(){this.closed=true}},populateFilters(){},alert(){throw Error('unexpected alert')},setTimeout:fn=>{timers.push(true);fn()},p79ReadCanonicalOrgOptions:async()=>{reads.push(true);c.p79CanonicalOrgOptions=draft;return{}},apiPost:async p=>{posts.push(p);return{ok:true}}};vm.createContext(c);for(const n of ['p79OrgSaveStatus','p79OrgSaveIsLockBusy','p79RetryOrgOperation','p79RetryOrgSave','saveOrgSettings'])vm.runInContext(fn(n),c);return{c,els,draft,posts,reads,timers}}
let passed=0;async function test(n,run){await run();passed++;console.log('PASS '+n)}
(async()=>{
await test('both server lock messages retry then succeed',async()=>{for(const message of ['雲端目前正在處理其他資料','雲端目前正在寫入資料，請稍後自動重試']){const x=setup();let calls=0;await x.c.p79RetryOrgOperation(async()=>{if(!calls++)throw Error(message);return{ok:true}});assert.equal(calls,2);assert.equal(x.timers.length,1)}});
await test('preflight read lock busy is handled inside the same bounded flow',async()=>{const x=setup();let count=0;x.c.p79ReadCanonicalOrgOptions=async()=>{if(!count++)throw Error('雲端目前正在寫入資料');x.c.p79CanonicalOrgOptions=x.draft;return{other:'keep'}};await x.c.saveOrgSettings();assert(x.c.orgDialog.closed);assert.equal(x.posts.length,2);assert.equal(x.posts[1].config.other,'keep');assert.equal(x.els.saveOrgBtn.disabled,false)});
await test('busy final verification retries reads without repeating successful writes',async()=>{const x=setup();let count=0;x.c.p79ReadCanonicalOrgOptions=async()=>{count++;if(count===3)throw Error('雲端目前正在寫入資料');x.c.p79CanonicalOrgOptions=x.draft;return{}};await x.c.saveOrgSettings();assert.equal(count,4);assert.equal(x.posts.length,2);assert(x.c.orgDialog.closed)});
await test('write lock busy retries are bounded and keep the draft open',async()=>{const x=setup();let calls=0;x.c.apiPost=async()=>{calls++;throw Error('雲端目前正在寫入資料')};const before=JSON.stringify(x.draft);await x.c.saveOrgSettings();assert.equal(calls,4);assert.equal(x.timers.length,3);assert.equal(JSON.stringify(x.c.orgDraft),before);assert(!x.c.orgDialog.closed);assert(x.els.orgSaveStatus.textContent.includes('你的修改仍保留'));assert.equal(x.els.saveOrgBtn.disabled,false)});
await test('authentication, validation and network failures are not automatically resent',async()=>{for(const message of ['權限不足','欄位格式錯誤','Failed to fetch','The operation was aborted']){const x=setup();let calls=0;x.c.apiPost=async()=>{calls++;throw Error(message)};await x.c.saveOrgSettings();assert.equal(calls,1);assert.equal(x.timers.length,0);assert(!x.c.orgDialog.closed)}});
await test('explicit non-retryable lock-like reply is not retried',async()=>{const x=setup();let calls=0;await assert.rejects(()=>x.c.p79RetryOrgOperation(async()=>{calls++;throw Object.assign(Error('雲端目前正在寫入資料'),{retryable:false})}));assert.equal(calls,1)});
await test('readback mismatch never shows saved success or closes the draft',async()=>{const x=setup();x.c.p79ReadCanonicalOrgOptions=async()=>{x.c.p79CanonicalOrgOptions={departments:[],jobTitles:[],units:[]};return{}};await x.c.saveOrgSettings();assert(!x.c.orgDialog.closed);assert(x.els.orgSaveStatus.textContent.includes('讀回不一致'));assert.equal(x.els.status.textContent,'')});
await test('job-title labels are unified while legacy data keys remain readable',()=>{for(const path of ['index.html','attendance/index.html','work-hours/index.html','schedule/index.html','history-data/index.html','aqc-efficiency/index.html']){const s=fs.readFileSync(path,'utf8');assert(!s.replaceAll("['職務']",'').includes('職務'),path);for(const m of s.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);}assert(fs.readFileSync('aqc-efficiency/index.html','utf8').includes("e['職務']"));assert(fs.readFileSync('assets/port79-hr-import.js','utf8').includes("['職稱','職務','jobtitle']"))});
await test('leave permission checkboxes are inside editor, not HR homepage',()=>{
 const editorStart=html.indexOf('<dialog id="editor"');
 const editorEnd=html.indexOf('</form></dialog>',editorStart);
 const location=html.indexOf('id="p79EditorLeavePermissionBox"');
 assert(editorStart>=0&&location>editorStart&&location<editorEnd,'five checkboxes inside editor dialog');
 assert.equal((html.match(/data-hr-editor-leave="/g)||[]).length,5);
 assert(html.indexOf('id="p79EditorLeavePermissionBox"')<html.indexOf('id="permGrid"'),'settings beside role and permissions');
 assert(!html.includes('id="scheduleLeaveSettingsPanel"'),'outside settings removed');
 assert(!html.includes('id="scheduleLeaveSettingsBtn"'),'outside toolbar removed');
});
await test('superadmin can grant and revoke admin leave; staff locked',async()=>{
 const controls=['年','事','病','公','喪'].map(hrEditorLeave=>({checked:false,disabled:true,dataset:{hrEditorLeave}}));
 const status={textContent:''};
 const modal={open:true};
 const currentRole={value:'superadmin'};
 const c={session:{adminRole:'superadmin'},editing:{empId:'EMP01'},editor:modal,
  p79EditorLeavePermission:{ready:false,empId:'',types:[],dirty:false,touched:{}},
  p79EditorLeaveRequestId:0,p79EditorLeaveCachedCloud:{key:'',config:null,at:0,pending:null},GAS_URL:'test-gas',token:'ACTOR',Date,
  document:{querySelectorAll:()=>controls},
  $:id=>id==='adminRole'?currentRole:id==='p79EditorLeavePermissionStatus'?status:null,
  P79_HR_SCHEDULE_LEAVE_TYPES:['年','事','病','公','喪'],
  P79_HR_SCHEDULE_LEAVE_POLICY_KEY:'hrScheduleLeaveEditV2',
  P79_HR_SCHEDULE_LEAVE_LEGACY_KEY:'hrScheduleLeaveEditV1',
  apiGet:async()=>({config:{hrScheduleLeaveEditV2:{byEmployee:{EMP01:['年','病'],EMP02:['事']}}}}),
  String,Array,JSON,Error,console};
 vm.createContext(c);
 for(const n of ['p79HrScheduleLeaveIsSuperAdmin','p79EditorLeaveRoleAllowed','p79EditorLeaveCloudCacheKey','p79ReadEditorLeaveCloudConfig','p79RenderEditorLeavePermission','p79OnEditorLeavePermissionChange','p79LoadEditorLeavePermission'])vm.runInContext(fn(n),c);
 await c.p79LoadEditorLeavePermission();
 assert.deepEqual(controls.filter(x=>x.checked).map(x=>x.dataset.hrEditorLeave),['年','病']);
 assert(controls.every(x=>!x.disabled),'superadmin can edit their own employee record');
 c.editing={empId:'EMP02'};currentRole.value='admin';
 await c.p79LoadEditorLeavePermission();
 assert.deepEqual(controls.filter(x=>x.checked).map(x=>x.dataset.hrEditorLeave),['事'],'admin account has independent grant');
 assert(controls.every(x=>!x.disabled),'superadmin can configure an ordinary manager');
 currentRole.value='employee';c.p79RenderEditorLeavePermission();
 assert(controls.every(x=>x.disabled&&!x.checked),'ordinary employee is locked and unchecked');
 currentRole.value='admin';c.p79RenderEditorLeavePermission();
 assert.deepEqual(controls.filter(x=>x.checked).map(x=>x.dataset.hrEditorLeave),['事'],'switching back to admin retains editor choices');
 c.session={adminRole:'admin'};c.p79RenderEditorLeavePermission();
 assert(controls.every(x=>x.disabled),'a manager cannot grant permissions to other managers');
});
await test('slow cloud never blocks editor and never overwrites a superadmin click',async()=>{
 const kinds=['年','事','病','公','喪'];
 const controls=kinds.map(hrEditorLeave=>({checked:false,disabled:true,dataset:{hrEditorLeave}}));
 const role={value:'admin'},status={textContent:''};
 let complete,requests=0;
 const pending=new Promise(resolve=>complete=resolve);
 const c={session:{adminRole:'superadmin',empId:'ACTOR'},editing:{empId:'EMP09',adminRole:'admin'},
  editor:{open:true},token:'TEST',GAS_URL:'GAS_TEST',Date,
  p79EditorLeavePermission:{ready:false,empId:'',types:[],dirty:false,touched:{}},
  p79EditorLeaveRequestId:0,p79EditorLeaveCachedCloud:{key:'',config:null,at:0,pending:null},
  $:id=>id==='adminRole'?role:id==='p79EditorLeavePermissionStatus'?status:null,
  document:{querySelectorAll:selector=>selector.includes(':checked')?controls.filter(x=>x.checked):controls},
  P79_HR_SCHEDULE_LEAVE_TYPES:kinds,
  P79_HR_SCHEDULE_LEAVE_POLICY_KEY:'hrScheduleLeaveEditV2',
  P79_HR_SCHEDULE_LEAVE_LEGACY_KEY:'hrScheduleLeaveEditV1',
  apiGet:async()=>{requests++;return pending},String,Array,JSON,Error,console,Set,Promise,Object};
 vm.createContext(c);
 for(const n of ['p79HrScheduleLeaveIsSuperAdmin','p79EditorLeaveRoleAllowed','p79EditorLeaveCloudCacheKey',
  'p79ReadEditorLeaveCloudConfig','p79RenderEditorLeavePermission','p79OnEditorLeavePermissionChange','p79LoadEditorLeavePermission'])
  vm.runInContext(fn(n),c);
 const load=c.p79LoadEditorLeavePermission();
 assert(controls.every(x=>!x.disabled),'all five boxes are clickable immediately without cloud response');
 assert(status.textContent.includes('不必等雲端'),'clear immediate guidance shown');
 controls[0].checked=true;c.p79OnEditorLeavePermissionChange(controls[0]);
 assert.equal(c.p79EditorLeavePermission.dirty,true);
 assert.equal(controls[0].checked,true);
 complete({config:{hrScheduleLeaveEditV2:{byEmployee:{EMP09:['事','公']}}}});
 await load;
 assert.equal(requests,1);
 assert.deepEqual(controls.filter(x=>x.checked).map(x=>x.dataset.hrEditorLeave),['年','事','公'],
  'late cloud response merges checked draft with existing permissions');
 assert(controls.every(x=>!x.disabled));
 role.value='employee';c.p79RenderEditorLeavePermission();
 assert(controls.every(x=>x.disabled),'ordinary staff remain locked');
});
await test('employee permission saving merges cloud data without affecting other staff',async()=>{
 let config={hrOrgOptionsV1:{departments:['D']},customFlag:123,hrScheduleLeaveEditV2:{byEmployee:{EMP01:['年'],EMP02:['公']}}};
 const c={session:{adminRole:'superadmin'},String,JSON,Array,Error,TextEncoder,
 P79_HR_SCHEDULE_LEAVE_TYPES:['年','事','病','公','喪'],
 P79_HR_SCHEDULE_LEAVE_POLICY_KEY:'hrScheduleLeaveEditV2',
 P79_HR_SCHEDULE_LEAVE_LEGACY_KEY:'hrScheduleLeaveEditV1',
 editing:{empId:'EMP01',adminRole:'admin'},p79EditorLeaveCachedCloud:{config:null,at:0},
 p79ReadCanonicalOrgOptions:async()=>JSON.parse(JSON.stringify(config)),
 p79RetryOrgSave:async producer=>{const x=await producer();assert.equal(x.action,'saveConfig');config=x.config;}};
 vm.createContext(c);
 for(const n of ['p79HrScheduleLeaveIsSuperAdmin','p79SaveEditorLeavePermission'])vm.runInContext(fn(n),c);
 await c.p79SaveEditorLeavePermission('EMP01','EMP01',['年','病']);
 assert.deepEqual(config.hrScheduleLeaveEditV2.byEmployee.EMP01,['年','病']);
 assert.deepEqual(config.hrScheduleLeaveEditV2.byEmployee.EMP02,['公'],'another account unaffected');
 assert.equal(config.customFlag,123);
 assert.deepEqual(config.hrOrgOptionsV1,{departments:['D']},'HR organization settings unaffected');
 await c.p79SaveEditorLeavePermission('EMP01','EMP01',['病'],{'年':false,'病':true});
 assert.deepEqual(config.hrScheduleLeaveEditV2.byEmployee.EMP01,['病'],'explicitly unchecked code is revoked');
 assert.deepEqual(config.hrScheduleLeaveEditV2.byEmployee.EMP02,['公'],'other staff untouched');
 config.hrScheduleLeaveEditV2.byEmployee.EMP01=['公'];
 await c.p79SaveEditorLeavePermission('EMP01','EMP01',['年'],{'年':true});
 assert.deepEqual(config.hrScheduleLeaveEditV2.byEmployee.EMP01,['年','公'],'a quick initial click keeps the unseen previously granted code');
 c.session={adminRole:'admin'};
 await assert.rejects(()=>c.p79SaveEditorLeavePermission('EMP02','EMP02',['年']),/超級管理員/);
});
await test('roster enforces each authorized admin account, denies employee and stale policy',async()=>{
 const source=fs.readFileSync('schedule/index.html','utf8');
 const start=source.indexOf('    const P79_SCHEDULE_LEAVE_POLICY_KEY='),end=source.indexOf('    let p79OvertimeShiftEditBusy=',start);
 assert(start>=0&&end>start);
 const cache=new Map([['admin_session',JSON.stringify({empId:'EMP01',adminRole:'superadmin'})]]);
 let serverConfig={hrScheduleLeaveEditV2:{byEmployee:{EMP01:['年','病'],EMP02:['事']}}};
 const c={Date,URL,Promise,AbortController,Error,console,setTimeout,clearTimeout,
  GAS_URL:'https://example.invalid/exec',sessionStorage:{getItem:k=>cache.get(k)||''},
  currentScheduleSession:()=>JSON.parse(cache.get('admin_session')||'{}'),
  currentPort79SsoToken:()=> 'TOKEN',canManageSchedule:()=>c.schedulePermission==='manage',schedulePermission:'manage',
  fetch:async()=>({ok:true,json:async()=>({ok:true,config:serverConfig})})};
 vm.createContext(c);vm.runInContext(source.slice(start,end),c);
 assert.equal(c.p79ScheduleAllowedEditShift('年'),false,'denied until cloud confirms account');
 assert.equal(await c.p79ScheduleReadHrLeavePolicy(),true);
 assert.equal(c.p79ScheduleAllowedEditShift('年'),true);
 assert.equal(c.p79ScheduleAllowedEditShift('事'),false);
 cache.set('admin_session',JSON.stringify({empId:'EMP02',adminRole:'admin'}));
 assert.equal(c.p79ScheduleAllowedEditShift('年'),false,'another account cannot inherit EMP01 permissions');
 assert.equal(await c.p79ScheduleReadHrLeavePolicy(),true);
 assert.equal(c.p79ScheduleAllowedEditShift('事'),true);
 assert.equal(c.p79ScheduleAllowedEditShift('年'),false);
 c.schedulePermission='view';
 assert.equal(c.p79ScheduleAllowedEditShift('事'),false,'a non-editor admin cannot change leave on schedule');
 c.schedulePermission='manage';
 cache.set('admin_session',JSON.stringify({empId:'EMP04',adminRole:'admin'}));
 assert.equal(await c.p79ScheduleReadHrLeavePolicy(),true,'manager without grant may read policy');
 for(const leave of ['年','事','病','公','喪'])
   assert.equal(c.p79ScheduleAllowedEditShift(leave),false,'unchecked manager cannot select '+leave);
 cache.set('admin_session',JSON.stringify({empId:'EMP03',adminRole:'employee'}));
 assert.equal(c.p79ScheduleAllowedEditShift('事'),false,'employee denied even if permissions are stale');
 assert.equal(await c.p79ScheduleReadHrLeavePolicy(),false,'employee may not load privileged permissions');
 cache.set('admin_session',JSON.stringify({empId:'EMP02',adminRole:'admin'}));
 assert.equal(await c.p79ScheduleReadHrLeavePolicy(),true);
 assert.equal(c.p79ScheduleAllowedEditShift('事'),true);

 c.fetch=async()=>{throw Error('network offline')};
 assert.equal(await c.p79ScheduleReadHrLeavePolicy(),false);
 assert.equal(c.p79ScheduleAllowedEditShift('事'),false,'error fails closed');
});
await test('HR inline JavaScript parses',()=>{for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1])});
console.log(JSON.stringify({passed,failed:0}));
})().catch(e=>{console.error(e);process.exitCode=1});

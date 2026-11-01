const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');const html=fs.readFileSync('hr/index.html','utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert(start>=0,name);const a=html.slice(start-6,start)==='async '?start-6:start;const line=html.slice(a,html.indexOf('\n',a));return line.endsWith('}')?line:html.slice(a,html.indexOf('\n}',a)+2)}
function setup(){const els={saveOrgBtn:{disabled:false,textContent:'儲存'},orgSaveStatus:{textContent:'',style:{}},status:{textContent:''}},draft={departments:['D'],jobTitles:['AQC'],units:['U']},posts=[],reads=[],timers=[];const c={console,Promise,JSON,Error,String,Array,TextEncoder,$:id=>els[id],orgDraft:draft,orgSettings:{departments:[],jobTitles:[],units:[]},hrAccess:'manage',canHr:()=>true,normalizeOrgSettings:x=>JSON.parse(JSON.stringify(x)),P79_HR_ORG_OPTIONS_KEY:'hrOrgOptionsV1',p79CanonicalOrgOptions:null,orgDialog:{closed:false,close(){this.closed=true}},populateFilters(){},alert(){throw Error('unexpected alert')},setTimeout:fn=>{timers.push(true);fn()},p79ReadCanonicalOrgOptions:async()=>{reads.push(true);c.p79CanonicalOrgOptions=draft;return{}},apiPost:async p=>{posts.push(p);return{ok:true}}};vm.createContext(c);for(const n of ['p79OrgSaveStatus','p79OrgSaveIsLockBusy','p79RetryOrgOperation','p79RetryOrgSave','saveOrgSettings'])vm.runInContext(fn(n),c);return{c,els,draft,posts,reads,timers}}
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
await test('HR superadmin controls five schedule leave types in shared cloud config',async()=>{
 const original={hrOrgOptionsV1:{departments:['A'],jobTitles:['F/L'],units:[]},customFlag:true};
 let current={...original},writes=[];
 const controls=['年','事','病','公','喪'].map(kind=>({checked:false,dataset:{scheduleLeaveKind:kind}}));
 const status={textContent:''},save={disabled:false},dialog={open:false,showModal(){this.open=true}};
 const c={session:{adminRole:'superadmin'},String,Array,JSON,TextEncoder,Error,
  P79_HR_SCHEDULE_LEAVE_POLICY_KEY:'hrScheduleLeaveEditV1',
  P79_HR_SCHEDULE_LEAVE_TYPES:['年','事','病','公','喪'],
  $:id=>id==='scheduleLeaveSettingsStatus'?status:id==='scheduleLeaveSettingsSaveBtn'?save:id==='status'?{textContent:''}:null,
  document:{querySelectorAll:()=>controls},
  scheduleLeaveSettingsDialog:dialog,
  alert:msg=>{throw Error(msg)},
  p79ReadCanonicalOrgOptions:async()=>structuredClone(current),
  p79RetryOrgSave:async cb=>{const req=await cb();writes.push(req);current=structuredClone(req.config);return{ok:true}}
 };vm.createContext(c);
 for(const n of ['p79HrScheduleLeaveIsSuperAdmin','openScheduleLeaveSettings','saveScheduleLeaveSettings'])vm.runInContext(fn(n),c);
 await c.openScheduleLeaveSettings();
 assert.equal(dialog.open,true);
 assert(controls.every(input=>input.checked),'defaults to five types only for confirmed superadmin');
 for(const input of controls)input.checked=['年','病'].includes(input.dataset.scheduleLeaveKind);
 await c.saveScheduleLeaveSettings();
 assert.equal(writes.length,1);
 assert.equal(writes[0].action,'saveConfig');
 assert.deepEqual(JSON.parse(JSON.stringify(current.hrScheduleLeaveEditV1)),{allowedTypes:['年','病']});
 assert.deepEqual(current.hrOrgOptionsV1,original.hrOrgOptionsV1,'unrelated HR configuration preserved');
 assert.equal(current.customFlag,true);
 c.session={adminRole:'admin'};
 await assert.rejects(()=>c.openScheduleLeaveSettings(),/只有超級管理員/);
 await assert.rejects(()=>c.saveScheduleLeaveSettings(),/只有超級管理員/);
 assert.equal(writes.length,1,'normal manager cannot save');
});
await test('schedule special leave requires verified cloud policy plus superadmin identity',async()=>{
 const source=fs.readFileSync('schedule/index.html','utf8');
 const start=source.indexOf('    const P79_SCHEDULE_LEAVE_POLICY_KEY=');
 const end=source.indexOf('    let p79OvertimeShiftEditBusy=',start);
 assert(start>=0&&end>start);
 const c={Date,URL,Promise,AbortController,Error,console,setTimeout,clearTimeout,
  GAS_URL:'https://example.invalid/exec',
  currentPort79SsoToken:()=> 'TOKEN',
  isScheduleSuperAdmin:()=>true,
  fetch:async()=>({ok:true,json:async()=>({ok:true,config:{hrScheduleLeaveEditV1:{allowedTypes:['年','病']}}})})};
 vm.createContext(c);vm.runInContext(source.slice(start,end),c);
 assert.equal(c.p79ScheduleAllowedEditShift('年'),false,'deny until cloud is verified');
 assert.equal(c.p79ScheduleAllowedEditShift('早'),true);
 assert.equal(await c.p79ScheduleReadHrLeavePolicy(),true);
 assert.equal(c.p79ScheduleAllowedEditShift('年'),true);
 assert.equal(c.p79ScheduleAllowedEditShift('病'),true);
 for(const leave of ['事','公','喪'])assert.equal(c.p79ScheduleAllowedEditShift(leave),false);
 c.isScheduleSuperAdmin=()=>false;
 assert.equal(c.p79ScheduleAllowedEditShift('年'),false,'normal manager denied even with enabled shared policy');
 c.isScheduleSuperAdmin=()=>true;c.fetch=async()=>{throw Error('offline')};
 assert.equal(await c.p79ScheduleReadHrLeavePolicy(),false,'read failed');
 assert.equal(c.p79ScheduleAllowedEditShift('年'),false,'offline policy fails closed');
});
await test('HR inline JavaScript parses',()=>{for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1])});
console.log(JSON.stringify({passed,failed:0}));
})().catch(e=>{console.error(e);process.exitCode=1});

const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8');
const workflow=fs.readFileSync('.github/workflows/pages-static.yml','utf8');
function fn(name){let a=html.indexOf('function '+name+'(');assert(a>=0,'missing '+name);if(html.slice(a-6,a)==='async ')a-=6;const e=html.indexOf('\n        }',a);assert(e>a,'missing closing function: '+name);return html.slice(a,e+10);}
assert(workflow.includes('paths:'),'the site deployment must be filtered to production source changes');
const watched=workflow.split('paths:')[1].split('workflow_dispatch:')[0];
for(const path of ['index.html','assets/**','work-hours/**','leave/**','schedule/**','hr/**','attendance/**'])assert(watched.includes(path),'production path not watched: '+path);
assert(!watched.includes('tests/**'),'test-only commits must not trigger deployment');
assert(!watched.includes('docs/**'),'documentation-only commits must not trigger deployment');
assert(workflow.includes('workflow_dispatch:'),'manual deployment must remain possible');
assert(workflow.includes('for test_file in tests/*.cjs'),'production site must keep the full test gate');

const versionStart=html.indexOf('        const PRIMARY_IN_RANGE_LOCATION_LABEL');
const versionEnd=html.indexOf('        const DEFAULT_DEPARTMENTS = [',versionStart);
assert(versionStart>=0&&versionEnd>versionStart);
const handlers={},elements=new Map(),replaced=[],messages=[];
let active=null,currentServerVersion='2026.10.26.117',requestCount=0;
function element(tag){
 return {tag,dataset:{},style:{},children:[],getClientRects:()=>[1],matches:()=>false,setAttribute(){},
  append(...nodes){this.children.push(...nodes);if(this.id)elements.set(this.id,this);},
  remove(){elements.delete(this.id);}};
}
const doc={
 visibilityState:'visible',get activeElement(){return active;},
 addEventListener:(type,fn)=>{handlers[type]=fn},
 querySelectorAll:()=>[],
 getElementById:id=>elements.get(id)||null,
 createElement:element,
 body:{appendChild(el){elements.set(el.id,el)}}
};
const location={href:'https://fixture.example/work-hours/',protocol:'https:',replace:target=>replaced.push(target)};
const ctx={Date,URL,document:doc,location,window:{addEventListener(){}},getComputedStyle:()=>({visibility:'visible'}),
 fetch:async()=>{requestCount++;return {ok:true,text:async()=>`const APP_VERSION='${currentServerVersion}';`}},
 showToast:msg=>messages.push(msg),setInterval:()=>1,console,APP_VERSION:'2026.10.26.116'};
vm.createContext(ctx);vm.runInContext(html.slice(versionStart,versionEnd),ctx);
(async()=>{
 await ctx.checkForAppUpdate();
 assert.equal(requestCount,1);
 assert.equal(replaced.length,0,'new code must not force location.replace');
 const notice=elements.get('p79AvailableVersionNotice');
 assert(notice,'new version must show a non-blocking notice');
 assert.equal(notice.dataset.version,currentServerVersion);
 const button=notice.children[1];
 active={matches:()=>true,getClientRects:()=>[1]};
 button.onclick();
 assert.equal(replaced.length,0,'cannot replace the page when editing');
 assert(messages.length,'user should be warned to finish edits');
 active=null;
 handlers.input({target:{matches:()=>true}});
 assert.equal(ctx.p79WorkhoursIsEditing(),true,'blurred dirty form needs a grace period');
 vm.runInContext('p79LastUnsavedFormInteractionAt=0',ctx);
 assert.equal(ctx.p79WorkhoursIsEditing(),false);
 button.onclick();
 assert.equal(replaced.length,1,'only an explicit user action should install a new version');
 assert(replaced[0].includes('v=2026.10.26.117'));
 vm.runInContext('lastAppVersionCheckAt=0',ctx);
 currentServerVersion='2026.10.26.116';
 await ctx.checkForAppUpdate();
 assert(!elements.has('p79AvailableVersionNotice'),'unchanged server version should remove update prompt');

 let refreshes=0,revision='r1',editing=false;
 const fixtures={Date,URL,Map,Set,Promise,Intl,AbortController,encodeURIComponent,
    console,setTimeout:()=>1,clearTimeout:()=>{},
    document:{getElementById:()=>({dataset:{p79MonthInitialized:'1'},value:'2026-10'})},
    currentPort79SsoToken:()=> 'fixed-token',
    normalizeScheduleDateKey:v=>v,getAttendanceDateKey:v=>v,
    getActiveGasUrl:()=> 'https://fixture.invalid',p79WorkhoursIsEditing:()=>editing,
    p79WorkOvertimeMonths:new Map(),p79WorkOvertimeLoadLanes:[Promise.resolve(),Promise.resolve(),Promise.resolve()],
    p79WorkOvertimeLoadQueue:Promise.resolve(),p79WorkOvertimeNextLane:0,p79WorkOvertimeRenderTimer:null,
    p79OvertimeCalculationCache:{},lastAttendanceCloudRevision:revision,window:{},
    renderOvertimeStats:()=>{},
    fetch:async()=>{refreshes++;return{ok:true,json:async()=>({ok:true,schedules:[],leaveCoverAssignments:[],revision})}}};
 vm.createContext(fixtures);vm.runInContext(fn('p79LoadWorkOvertimeMonths'),fixtures);
 fixtures.p79LoadWorkOvertimeMonths([]);
 await fixtures.p79WorkOvertimeMonths.get('2026-10').promise;
 assert.equal(refreshes,1,'first read should load');
 fixtures.p79WorkOvertimeMonths.get('2026-10').at=Date.now()-3600000;
 fixtures.p79LoadWorkOvertimeMonths([]);
 assert.equal(refreshes,1,'unchanged cloud revision should not refetch due to time');
 fixtures.lastAttendanceCloudRevision='r2';revision='r2';
 fixtures.p79LoadWorkOvertimeMonths([]);
 await fixtures.p79WorkOvertimeMonths.get('2026-10').promise;
 assert.equal(refreshes,2,'actual cloud revision should trigger fresh read');
 editing=true;fixtures.lastAttendanceCloudRevision='r3';revision='r3';
 const activeState=fixtures.p79WorkOvertimeMonths.get('2026-10');
 fixtures.p79LoadWorkOvertimeMonths([]);
 assert.equal(fixtures.p79WorkOvertimeMonths.get('2026-10'),activeState,'editing must preserve an existing snapshot');
 assert.equal(refreshes,2,'background data read must be deferred while editing');
 editing=false;
 fixtures.p79LoadWorkOvertimeMonths([]);
 await fixtures.p79WorkOvertimeMonths.get('2026-10').promise;
 assert.equal(refreshes,3,'deferred cloud revision should load after editing stops');

 let evidenceReads=0;
 const visible={Date,document:{visibilityState:'visible',getElementById:()=>({getClientRects:()=>[1],value:'2026-10'})},
    p79WorkhoursIsEditing:()=>editing,renderOvertimeStats:()=>{},
    p79DeferredOvertimeDisplay:false,
    p79WorkOvertimeMonths:new Map([['2026-10',{token:'fixed-token',ready:true,pending:false,restEvidencePending:false,restEvidenceLoaded:true,restEvidenceRevision:'r1'}]]),
    currentPort79SsoToken:()=> 'fixed-token',lastAttendanceCloudRevision:'r1',
    p79EnsureWorkRestEvidence:()=>{evidenceReads++}};
 vm.createContext(visible);
 vm.runInContext(fn('p79RefreshVisibleOvertimeEvidence'),visible);
 visible.p79RefreshVisibleOvertimeEvidence();
 assert.equal(evidenceReads,0,'unchanged attendance revision should not re-read raw evidence');
 visible.lastAttendanceCloudRevision='r2';visible.p79RefreshVisibleOvertimeEvidence();
 assert.equal(evidenceReads,1,'changed revision should refresh evidence');
 visible.p79WorkOvertimeMonths.get('2026-10').restEvidenceRevision='r2';
 visible.p79RefreshVisibleOvertimeEvidence();
 assert.equal(evidenceReads,1);
 editing=true;visible.lastAttendanceCloudRevision='r3';visible.p79RefreshVisibleOvertimeEvidence();
 assert.equal(evidenceReads,1,'editing must defer evidence refresh');
 assert(html.includes('if (p79WorkhoursIsEditing()) { scheduleAttendanceDeltaPoll(ATTENDANCE_DELTA_IDLE_MS); return false; }'),'automatic delta polling pauses during editing');
 assert(html.includes('if (p79WorkhoursIsEditing()) return false;'),'an in-flight delta fetch cannot apply while editing');
 assert(html.includes('if (!meta?.ok || p79WorkhoursIsEditing()) return;'),'revision read must not race an edit');
 console.log('PASS change-driven deployment, manual version update, edit guards, stable schedule/evidence revisions and deferred reads');
})().catch(error=>{console.error(error);process.exitCode=1});

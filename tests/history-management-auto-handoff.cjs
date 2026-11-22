'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('history-data/index.html','utf8');
const m=source.match(/window\.P79ManagementContext=\{\n system:'history',[\s\S]*?\n\};/);
assert(m,'history page must register the real management synchronization context');
assert(source.includes('preloaded||await api(\'historyGetMonthData\''),'archive views must support applying one confirmed read, not two');
assert(source.includes("window.P79ManagementPageBridge?.binding?.engine.status().pending.length"),
 'first loaded archive must reconcile retained notifications without another user click');
function setup(kind='attendance'){
 const elements={month:{value:'2026-10'},loadBtn:{disabled:false},historyImportPreview:{hidden:true}};
 const ctx={window:{},type:kind,historyLoaded:{type:kind,month:'2026-10'},backupBusy:false,backupRequest:null,
  session:()=>({role:'admin',punchOnly:false}),token:()=> 'TOKEN',gas:()=> 'https://script.google.com/macros/s/TEST/exec',
  perms:()=>({level:'manage',attendance:true,schedule:true,vessel:true}),
  $:id=>elements[id],calls:[],statuses:[],
  setStatus(message){ctx.statuses.push(message)},
  loadAttendance:async(...args)=>ctx.calls.push(['attendance',...args]),
  loadSchedule:async(...args)=>ctx.calls.push(['schedule',...args]),
  loadVessel:async(...args)=>ctx.calls.push(['vessel',...args])
 };
 vm.createContext(ctx);vm.runInContext(m[0],ctx);
 return {ctx,api:ctx.window.P79ManagementContext,elements};
}
(async()=>{
 let total=0;
 for(const [kind,rows] of [['attendance',{records:[]}],['schedule',{schedules:[]}],['vessel',{shipMasters:[],records:[]}]]) {
  const {api,ctx,elements}=setup(kind),reads=[];
  assert(api.canRead(),kind+' must require the current session permission');
  assert.equal(api.hasPendingChanges(),false,kind+' current archive may refresh');
  const snapshot=await api.readFresh(async(action,params)=>{reads.push({action,params});return {ok:true,month:'2026-10',...rows}});
  assert.equal(reads.length,1,kind+' single GET');
  assert.equal(reads[0].action,'historyGetMonthData');
  assert.equal(reads[0].params.type,kind);
  assert.equal(await api.applySnapshot(snapshot),true);
  assert.equal(ctx.calls.length,1,kind+' single view update');
  assert.equal(ctx.calls[0][2],false,'readback render must not fetch duplicate archived data');
  assert.equal(ctx.calls[0][3].month,'2026-10');
  assert.match(ctx.statuses[0],/歸檔/);
  elements.month.value='2026-11';
  assert.equal(await api.applySnapshot(snapshot),false,'changed month must not apply an old archive');
  total++;
 }
 for(const kind of ['attendance','schedule','vessel']){
  const {api}=setup(kind);
  await assert.rejects(()=>api.readFresh(async()=>({ok:true,month:'2026-10'})),/不完整/);
  await assert.rejects(()=>api.readFresh(async()=>({ok:true,month:'2026-09',records:[],schedules:[],shipMasters:[]})),/月份不符/);
 }
 const a=setup();
 a.ctx.backupBusy=true;assert(a.api.hasPendingChanges(),'busy backup must block refresh');a.ctx.backupBusy=false;
 a.ctx.backupRequest={id:'pending'};assert(a.api.hasPendingChanges(),'pending backup must block refresh');a.ctx.backupRequest=null;
 a.elements.historyImportPreview.hidden=false;assert(a.api.hasPendingChanges(),'import preview must block refresh');a.elements.historyImportPreview.hidden=true;
 a.elements.loadBtn.disabled=true;assert(a.api.hasPendingChanges(),'active read must block refresh');a.elements.loadBtn.disabled=false;
 a.ctx.historyLoaded=null;assert(a.api.hasPendingChanges(),'unloaded archive must not acknowledge new data');
 a.ctx.historyLoaded={type:'attendance',month:'2026-10'};
 a.ctx.session=()=>({role:'admin',punchOnly:true});assert.equal(a.api.canRead(),false,'punch-only cannot access historical data');
 a.ctx.session=()=>({role:'admin',punchOnly:false});a.ctx.perms=()=>({level:'none',attendance:false});
 assert.equal(a.api.canRead(),false,'unauthorized history read blocked');
 console.log('PASS history automatic cross-system readback: '+total+' archive types, no duplicate GET, scope, permission, edit and backup guards');
})().catch(e=>{console.error(e);process.exitCode=1});

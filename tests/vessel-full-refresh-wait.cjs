const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('assets/port79-full-refresh.js','utf8');
async function simulate({pending=false,dialog='',stuck=false,changeIdentity=false}={}){
 let busy=true,clock=0,reads=0,applied=0,identity='same',notifications=[];
 const nodes=dialog?[{id:dialog,getClientRects:()=>[{}]}]:[];
 const status={dataset:{},set textContent(s){notifications.push(s);}},button={};
 const c={URL,AbortController,console,Promise,Date:class extends Date{static now(){return clock;}},Error,JSON,Set,Map,
 setTimeout(fn,delay){clock+=delay;if(changeIdentity)identity='other';if(!stuck)busy=false;fn();return 1;},clearTimeout(){},
 document:{body:{dataset:{p79System:'efficiency'}},getElementById:id=>id==='p79FullRefreshButton'?button:id==='p79FullRefreshStatus'?status:null,querySelector:()=>null,querySelectorAll:()=>nodes},
 getComputedStyle:()=>({visibility:'visible'}),MutationObserver:class{observe(){}},
 activeEfficiencyTabName:()=> 'dashboard',invalidateWorkloadIndex(){},renderEfficiencyTabFast(){},saveLocal(){},
 P79ManagementContext:{canRead:()=>true,identity:()=>identity,hasPendingChanges:()=>busy||pending,hasUnsavedChanges:()=>pending,isReadBusy:()=>busy,scope:()=>({}),
 readFresh:async()=>{reads++;assert.equal(busy,false);return {ok:true,confirmedFresh:true};},applySnapshot:async()=>{applied++;return true;}}
 };c.window=c;vm.createContext(c);vm.runInContext(source,c);const result=await c.p79FullRefresh();return {result,reads,applied,clock,notifications,c};
}
(async()=>{
 let r=await simulate();assert(r.result);assert.equal(r.reads,1);assert.equal(r.applied,1);assert(r.notifications.some(s=>s.includes('完成後自動重新整理')));assert.equal(r.c.P79FullRefreshRunning,false);
 r=await simulate({pending:true});assert.equal(r.result,false);assert.equal(r.reads,0);assert(r.notifications.at(-1).includes('尚未儲存'));
 r=await simulate({dialog:'shipEditDialog'});assert.equal(r.reads,0);assert.equal(r.result,false);
 r=await simulate({dialog:'dashboardAuditDialog'});assert(r.result);assert.equal(r.reads,1);
 r=await simulate({stuck:true});assert.equal(r.result,false);assert.equal(r.reads,0);assert(r.clock>=90000);assert(r.notifications.at(-1).includes('同步尚未結束'));assert(!r.notifications.at(-1).includes('尚未儲存'));
 r=await simulate({changeIdentity:true});assert.equal(r.result,false);assert.equal(r.reads,0);
 console.log('PASS busy reads wait then refresh, real pending edits and forms block, read-only audit remains usable, stuck sync and changed identity preserve data');
})().catch(e=>{console.error(e);process.exitCode=1;});

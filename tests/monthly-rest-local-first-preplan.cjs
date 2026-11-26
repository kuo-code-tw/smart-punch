'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const controller=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const dashboard=fs.readFileSync('assets/port79-monthly-rest-dashboard.js','utf8');
new vm.Script(controller);new vm.Script(dashboard);
const planSave=controller.slice(controller.indexOf("q('#mrSavePlans').onclick=async"),controller.indexOf("q('#mrSave').onclick=async"));
assert(planSave.includes('const batch=latest.saveContext'));
assert(planSave.includes('await a.saveReport(draft,batch)'));
assert(planSave.includes('const fresh=await a.snapshot(loadedMonth,true,false,true)'));
assert(!planSave.includes("q('#mrLoad').click()"));
assert(planSave.includes('report?.id===r.id&&report.planned===true'));
assert(planSave.includes('model=plan(snapshot,loadedPeople,loadedMonth,rules'));
assert(controller.includes("const fresh=mode==='plan'?snapshot:await a.snapshot(month,false,false,true)"));
assert(dashboard.includes('finally{state.submitting=false;render();}'));
// Execute the actual load handler for initial local-first and manual reload.
// The option-rendering helper must remain callable, not be shadowed by the
// handler's configuration parameter or by a DOM click event.
const start=controller.indexOf("q('#mrLoad').onclick=async"),end=controller.indexOf(' function choosePlanningMode',start);
assert(start>=0&&end>start);
async function exerciseLoad(initial,preferLocal){
 const staff=[{empId:'QA',dept:'A',jobTitle:'ARMG'}],nodes=new Map(),calls=[],statuses=[];
 const q=key=>{if(!nodes.has(key))nodes.set(key,{value:key==='#mrMonth'?'2026-11':'',options:[],checked:false,hidden:false,innerHTML:''});return nodes.get(key);};
 const ctx={q,console,people:initial?staff.slice():[],busy:false,loadedMonth:'',loadedPeople:[],manualPeople:new Map(),snapshot:null,rules:[],model:null,autoPlan:true,explicitPlanningMode:false,
  invalidate(){},controls(x){calls.push(['controls',x]);},setStatus(x){statuses.push(x);},today:()=> '2026-11-26',
  validReportCutoff:(m,v)=>v,monthlyPlanPeople:()=>staff.slice(),options:(values,all)=>{calls.push(['options',values]);return all;},jobs(){},names(){},id:x=>String(x),
  a:{employees:()=>staff,snapshot:async(...args)=>{calls.push(['snapshot',args[3]]);return {schedules:[],attendanceEvidence:{complete:true}};}},
  g:{p79RestQuota:()=>({days:30}),p79OvertimeContext:{token:()=> 'test',refreshAccess:async()=>calls.push(['access'])},P79WorkhoursCache:{enabled:()=>true,verifiedRawMonths:()=>[{}]},P79Overtime:{loadRules:async()=>({rows:[]})}},
  plan:()=>({rows:[],plannedRows:[],issues:[],workflow:{canSubmit:true}}),autoSelectVerifiedHistory(){},isReadOnlySource:()=>false,paint(){calls.push(['paint']);}
 };
 vm.createContext(ctx);vm.runInContext(controller.slice(start,end),ctx);
 await q('#mrLoad').onclick(preferLocal?{preferLocal:true}:{type:'click'});
 assert(statuses.at(-1).startsWith('已核對 1 位'),statuses.join(' | '));
 assert(calls.some(x=>x[0]==='options'),'department choices built successfully');
 assert(calls.some(x=>x[0]==='paint'),'load reaches rendered model');
 assert.deepEqual(calls.find(x=>x[0]==='snapshot'),['snapshot',!preferLocal]);
 assert.equal(ctx.busy,false);assert.deepEqual(calls.at(-1),['controls',false]);
 if(!initial)assert(calls.some(x=>x[0]==='access'));
}
(async()=>{await exerciseLoad(true,true);await exerciseLoad(false,false);console.log('PASS local-first preplan and real monthly load handler, with initial and empty roster');})().catch(e=>{console.error(e);process.exitCode=1;});

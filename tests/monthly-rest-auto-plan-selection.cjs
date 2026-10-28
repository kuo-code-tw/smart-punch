'use strict';
const fs=require('node:fs'),vm=require('node:vm'),a=require('node:assert/strict'),source=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const start=source.indexOf(" q('#mrSavePlans').onclick=async()=>{"),end=source.indexOf('\n };',start);a(start>=0&&end>start);
const actual=source.slice(start,end+4);
async function run({failAt=-1,lostAck=false,missingReadback=false,none=false,cancel=false,stale=false}={}){
 const model={plannedRows:Array.from({length:3},(_,i)=>({id:'PLAN'+i,empId:'E'+i,name:'測試'+i,date:'2026-10-30',category:'國',rule:['國','國08-16',8],checked:!none&&i<2,planned:true}))},stored=new Map(),button={};let reads=0,posts=0;
 const schedules=()=>model.plannedRows.map(r=>({empId:r.empId,schedule:{__meta:stored.has(r.empId)?{[r.date]:{overtimeReport:stored.get(r.empId)}}:{}}}));
 const c={autoPlan:true,busy:false,stop:false,model,loadedMonth:'2026-10',loadedPeople:[],rules:[],Map,Set,Date,String,Number,id:x=>String(x).toUpperCase(),today:()=> '2026-10-29',q:()=>button,
 controls(){},paint(){},setStatus:s=>c.status=s,confirm:()=>!cancel,plan:()=>({plannedRows:stale?[]:model.plannedRows}),g:{P79Overtime:{report:r=>({category:r[0],code:r[1]})}},
 a:{snapshot:async(month,verify)=>{reads++;return {schedules:verify&&missingReadback?[]:schedules()}},saveReport:async draft=>{const n=posts++;a.equal(draft.manualPlan,true);a.equal(draft.preventReplace,false);if(n===failAt&&!lostAck)throw Error('fixture failed');const report={id:draft.id,category:draft.rule.category,code:draft.rule.code,planned:true};stored.set(draft.empId,report);if(n===failAt&&lostAck)throw Error('fixture lost ACK');return {ok:true,directOvertimeSaved:true,id:draft.id,report}},refresh(){}}};
 vm.createContext(c);vm.runInContext(actual,c);a.equal(posts,0,'opening or rendering never submits suggestions');await button.onclick();return {model,reads,posts,status:c.status};
}
(async()=>{
 let r=await run();a.equal(r.posts,2);a.equal(r.reads,2,'fresh preflight and batch cloud readback');a.equal(r.model.plannedRows.filter(x=>x.saved).length,2);a.equal(r.model.plannedRows[2].attempted,undefined,'unselected suggestion never saved');
 for(const options of [{none:true},{cancel:true}]){r=await run(options);a.equal(r.posts,0);a.equal(r.reads,0);}
 r=await run({stale:true});a.equal(r.posts,0);a.match(r.status,/已變更/);
 r=await run({failAt:1});a.equal(r.model.plannedRows.filter(x=>x.saved).length,1);a.equal(r.model.plannedRows[1].checked,true);a.equal(r.model.plannedRows[1].id,'PLAN1');
 r=await run({failAt:1,lostAck:true});a.equal(r.model.plannedRows.filter(x=>x.saved).length,2,'readback finds successful write after lost ACK without reissuing');
 r=await run({missingReadback:true});a.equal(r.model.plannedRows.filter(x=>x.saved).length,0);a(r.model.plannedRows.slice(0,2).every(x=>x.checked),'unconfirmed writes retain original ID and selection');
 console.log('PASS explicit auto mode: selected-only plan saves, fresh preflight, no implicit writes, partial/lost ACK and verified readback');
})().catch(e=>{console.error(e);process.exitCode=1});

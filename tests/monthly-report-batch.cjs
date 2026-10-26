const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const start=source.indexOf(" q('#mrSave').onclick=async()=>{");
// Extract the actual save handler, excluding open() and module exports.
const end=source.indexOf('\n };',start);assert(start>=0&&end>start,'save handler exists');
const actual=source.slice(start,end+4);
async function run({failAt=-1,missingReadback=false,loseAck=false,unselectedInvalid=false,sameIdWrongCategory=false}={}){
 const people=Array.from({length:20},(_,i)=>({empId:'E'+i,name:'人'+i})),model={rows:people.map((e,i)=>({...e,id:'R'+i,date:'2026-10-15',category:'國',rule:['國','國08-16',8],checked:true,status:'可申報'}))},store=new Map();let posts=0,reads=0,verifications=0,refreshes=0;const control={};
 if(sameIdWrongCategory)store.set('E0',{id:'R0',category:'休',code:'休08-16'});
 const roster=()=>people.map(e=>({empId:e.empId,schedule:{__meta:{'2026-10-15':store.get(e.empId)?{overtimeReport:store.get(e.empId)}:{}}}}));
 const batch={token:'fixture',month:'2026-10',ready:true,cloud:{revision:1}};
 const c={workflowStage:()=>({canSubmit:true}),today:()=> '2026-10-25',ruleFor:()=>['國','國08-16',8],rules:[['國','國08-16',8]],model,loadedPeople:unselectedInvalid?[...people,{empId:'NO_ROSTER',name:'未申報且無班表人員'}]:people,loadedMonth:'2026-10',busy:false,stop:false,KEY:'fixture',id:x=>String(x).toUpperCase(),Map,Set,Date,JSON,Number,confirm:()=>true,q:()=>control,setStatus:x=>{c.status=x},paint:()=>{},controls:()=>{},sessionStorage:{setItem(){},removeItem(){}},balance:()=>({remaining:{國:1},dates:['2026-10-15']}),g:{P79Overtime:{report:r=>({category:r[0],code:r[1]})}},a:{snapshot:async(m,verify)=>{if(verify){verifications++;return{schedules:missingReadback?people.map(e=>({empId:e.empId,schedule:{}})):roster()}}reads++;return{schedules:roster(),pairs:people.map(e=>({empId:e.empId,date:'2026-10-15',start:'2026-10-15T08:00:00',end:'2026-10-15T16:00:00'})),saveContext:batch}},saveReport:async(d,b)=>{assert.equal(b,batch);const index=posts++;if(index===failAt&&!loseAck)throw Error('fixture network failure');store.set(d.empId,{id:d.id,category:d.rule.category,code:d.rule.code});if(index===failAt&&loseAck)throw Error('fixture lost ACK');return{ok:true,directOvertimeSaved:true,id:d.id,report:store.get(d.empId)}},refresh:()=>refreshes++}};
 vm.createContext(c);vm.runInContext(actual,c);await control.onclick();return {c,model,posts,reads,verifications,refreshes};
}
(async()=>{
 let r=await run({unselectedInvalid:true});assert.equal(r.posts,20,'unselected person without a roster must not block selected people');assert.equal(r.model.rows.filter(x=>x.saved).length,20);
 r=await run();assert.equal(r.posts,20);assert.equal(r.reads,1);assert.equal(r.verifications,1,'20 people use one batch readback');assert.equal(r.refreshes,1,'main table renders once');assert(r.model.rows.every(x=>x.saved&&!x.checked));assert.match(r.c.status,/成功 20 筆/);
 r=await run({failAt:3});assert.equal(r.posts,4);assert.equal(r.verifications,1);assert.equal(r.model.rows.filter(x=>x.saved).length,3,'partial success still verified');assert(r.model.rows.slice(3).every(x=>!x.saved));assert.match(r.c.status,/後續停止/);
 r=await run({failAt:3,loseAck:true});assert.equal(r.posts,4);assert.equal(r.model.rows.filter(x=>x.saved).length,4,'batch readback resolves a lost write response without duplicate POST');
 r=await run({sameIdWrongCategory:true});assert.equal(r.posts,0,'same ID with a different rule is not successful readback');assert(r.model.rows.every(x=>!x.saved));
 r=await run({missingReadback:true});assert.equal(r.model.rows.filter(x=>x.saved).length,0,'write ACK alone cannot mark confirmed success');assert(r.model.rows.every(x=>x.checked&&x.acknowledged));assert.match(r.c.status,/20 筆待核對/);
 assert(source.includes("model.rows.map((r,i)=>r.saved?'':'<tr"),'confirmed rows removed without changing event indexes');
 console.log('PASS actual batch handler: 20 reports, one readback, one refresh, partial failure and unconfirmed readback retained');
})().catch(e=>{console.error(e);process.exit(1)});

'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
async function run(){
 let now=Date.now(),token='MANAGER';const requests=[];
 const cloud={ok:true,revision:'CURRENT',records:[],schedules:[{empId:'E1',schedule:{}}]};
 const c={console,Date:class extends Date{static now(){return now;}},AbortController,setTimeout,clearTimeout,
  sessionStorage:{getItem:()=>null},p79OvertimeContext:{token:()=>token,gasUrl:()=> 'https://fixture.invalid'},
  fetch:async url=>{const gate=deferred();requests.push({url,gate});return gate.promise;}};
 c.window=c;vm.createContext(c);vm.runInContext(source,c);const api=c.P79Overtime;
 const request=()=>({empId:'E1',date:'2026-11-28',leaveHandoffId:'L1'});
 const resolveReads=()=>{for(const {url,gate} of requests.splice(0))gate.resolve({ok:true,json:async()=>url.includes('getOvertimeConfig')?{ok:true,config:{overtimeConversionRowsV1:[],overtimeReportTypesV1:[]}}:cloud});};
 let draft=request(),running=api.prepareSaveValidation(draft);
 assert.equal(requests.length,2,'rules and employee/day context start concurrently');
 assert(requests.some(r=>r.url.includes('getOvertimeConfig')));assert(requests.some(r=>r.url.includes('getOvertimeReportContext')));
 resolveReads();await running;assert.equal(api.takeSaveContext(draft),cloud);
 assert.equal(api.takeSaveContext(draft),null,'preflight is consumed exactly once');
 for(const change of [()=>now+=15001,()=>token='OTHER',d=>d.date='2026-11-29',d=>d.empId='E2',d=>d.leaveHandoffId='L2']){
  token='MANAGER';draft=request();running=api.prepareSaveValidation(draft,false);resolveReads();await running;change(draft);
  assert.equal(api.takeSaveContext(draft),null,'expired or differently scoped context cannot be reused');
 }
 token='MANAGER';draft=request();running=api.prepareSaveValidation(draft,false);requests.shift().gate.resolve({ok:true,json:async()=>({...cloud,revision:null})});await assert.rejects(running,/不完整/);
 // Run the actual click handler up to its asynchronous validation failure.
 const fields=new Map(),node=id=>{if(!fields.has(id))fields.set(id,{value:'',disabled:false,textContent:''});return fields.get(id);};
 const validation=deferred();let calls=0;
 const h={el:{querySelector:node},selectedRow:()=>['休','休08-16'],verifyPlannedReviewSelection:()=>{},
  dateInput:{value:'2026-11-28'},empSelect:{value:'E1'},kind:{value:'休息日加班'},select:{value:'0'},forSelect:{value:''},
  prefill:{},editingOriginal:false,prepareSaveValidation:()=>{calls++;return validation.promise;}};
 node('#p79OtDate').value=h.dateInput.value;node('#p79OtEmp').value='E1';
 vm.createContext(h);const start=source.indexOf('   let submissionBusy=false;'),end=source.indexOf('\n   };',start)+7;
 vm.runInContext(source.slice(start,end),h);
 const first=node('#p79OtStage').onclick(),second=node('#p79OtStage').onclick();
 assert.equal(calls,1,'double click cannot start a second preflight');assert.equal(node('#p79OtStage').disabled,true);
 validation.reject(Error('offline'));await Promise.all([first,second]);assert.equal(node('#p79OtStage').disabled,false,'failed preflight unlocks button');
 assert.match(node('#p79OtStatus').textContent,/offline/);
 console.log('PASS concurrent fresh rules/context, one-use identity/date/leave-scoped preflight, expiry, missing revision, double-click mutex and failure recovery');
}
run().catch(e=>{console.error(e);process.exit(1)});

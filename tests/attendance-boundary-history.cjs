const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8');
const start=html.indexOf('  async function fetchBoundaryMonth(month){');
const source=html.slice(start,html.indexOf('\n  async function syncMonth(',start));
const engine=require('../attendance/v6-engine.js');
(async()=>{
 const primary={id:'1',empId:'E1',attNo:'1',timeStr:'2026/09/30 23:33',status:'上班簽到'};
 let raw=[],history=[primary,{...primary,id:'OLD',timeStr:'2026/09/01 07:35'}],failHistory=false;
 const calls=[];const c={Date,Promise,Set,String,Error,selectedMonth:()=> '2026-10',normRows:r=>r||[],stableAliasKeys:r=>['ID:'+r.id+'|'+r.status,'EVENT:'+r.empId+'|'+r.timeStr+'|'+r.status],readApi:async(action,params)=>{calls.push([action,params]);if(action==='historyGetMonthData'&&failHistory)throw Error('offline');return {ok:true,records:action==='historyGetMonthData'?history:raw}}};
 vm.createContext(c);vm.runInContext(source,c);
 let rows=await c.fetchBoundaryMonth('2026-09');assert.equal(rows.length,1);assert.equal(rows[0].timeStr,primary.timeStr);assert(calls.some(x=>x[0]==='historyGetMonthData'&&x[1].type==='attendance'));
 const pair=engine.buildShifts([...rows,{id:'2',empId:'E1',attNo:'1',timeStr:'2026/10/01 07:49',status:'下班簽退'}]);assert.equal(pair.length,1);assert(pair[0].clockIn&&pair[0].clockOut);assert.equal(pair[0].clockOut.timeStr,'2026/10/01 07:49:00');
 raw=[{...primary,note:'official'}];history=[{...primary,timeStr:'2026/09/30 22:00',manuallyEdited:true}];rows=await c.fetchBoundaryMonth('2026-09');assert.equal(rows.length,1);assert.equal(rows[0].note,'official','archived version cannot override official row');
 raw=[primary,{...primary,id:'3',status:'下班簽退',timeStr:'2026/09/30 23:59'}];history=[];assert.equal((await c.fetchBoundaryMonth('2026-09')).length,2);
 raw=[];failHistory=true;await assert.rejects(c.fetchBoundaryMonth('2026-09'),/尚未讀取完成/);
 failHistory=false;history=[{...primary,timeStr:'2026/11/01 07:49'},{...primary,id:'N2',timeStr:'2026/11/02 07:49'}];assert.equal((await c.fetchBoundaryMonth('2026-11')).length,1);
 console.log('PASS empty-success archive fallback, midnight cross-month pairing, official priority, both sides retained, failure not success, bounded dates; no writes');
})().catch(e=>{console.error(e);process.exitCode=1});

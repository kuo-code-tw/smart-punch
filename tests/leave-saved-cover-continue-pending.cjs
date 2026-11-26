'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('leave/index.html','utf8');
const start=html.indexOf('   continueButton.hidden=!pending.length||!p79CanReportOvertime();'),end=html.indexOf('\n   };',start)+6;
assert(start>=0&&end>start,'production continuation handler found');
const snippet=html.slice(start,end);
async function run(pending,unverified,permission=true,token='token'){
 const writes=[],events=[],button={};
 const ctx={pending,unverified,continueButton:button,id:'L1',Date,JSON,
 p79CanReportOvertime:()=>permission,leaveRequestToken:()=>token,
 sessionStorage:{setItem:(key,value)=>writes.push({key,value:JSON.parse(value)})},
 p79ActivateLeaveHandoff:()=>events.push('activate'),dialog:{close:()=>events.push('close')},p79OpenLeaveOvertimeHandoff:async()=>events.push('open')};
 vm.runInNewContext(snippet,ctx);
 await button.onclick();
 return {hidden:button.hidden,writes,events};
}
(async()=>{
 const worker={empId:'SECOND',date:'2026-11-23',forEmpId:'LEAVER'};
 const mixed=await run([worker],1);
 assert.equal(mixed.hidden,false);
 assert.deepEqual(JSON.parse(JSON.stringify(mixed.writes[0].value.entries)),[worker]);
 assert.deepEqual(mixed.events,['activate','close','open']);
 for(const c of [await run([],1),await run([worker],0,false),await run([worker],1,true,'')])assert.equal(c.writes.length,0);
 assert.equal((await run([],0)).hidden,true);
 assert.equal((await run([worker],0,false)).hidden,true);
 assert(html.includes('reported===entries.length&&planned===0&&pending.length===0&&restCovers===0&&unverified===0'),'completion must still require every worker to be verified');
 assert(html.includes('unverified++;continue;'),'unverified reports are not enqueued');
 console.log('PASS pending worker remains actionable when another report is unverified; completion and permissions protected');
})().catch(e=>{console.error(e);process.exitCode=1;});

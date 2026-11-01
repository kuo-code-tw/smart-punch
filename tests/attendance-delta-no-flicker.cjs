'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const file=fs.readFileSync(path.join(__dirname,'../assets/port79-attendance-core.js'),'utf8');
const start=file.indexOf('function mergeDeltaEvent(event){');
const end=file.indexOf('\n}\n\nasync function pollDelta(',start);
assert(start>=0&&end>start,'actual Delta merger is present');
const ctx={
 records:[{id:'R1',timeStr:'2026/10/12 08:00',status:'上班簽到'}],
 confirmCloudRecord:()=>{},confirmCloudDelete:()=>{},
 pendingForId:()=>false,forgetRecentAttendanceMutation:()=>{},
 Map,Set,Number,String,JSON
};
vm.createContext(ctx);
vm.runInContext(file.slice(start,end+2),ctx);
const run=x=>vm.runInContext('mergeDeltaEvent('+JSON.stringify(x)+')',ctx);
assert.equal(run({kind:'upsert',record:{id:'R1',timeStr:'2026/10/12 08:00',status:'上班簽到'}}),false,'unchanged delta must not redraw');
assert.equal(run({kind:'upsert',record:{id:'R1',timeStr:'2026/10/12 08:30',status:'上班簽到'}}),true,'genuine edit must render');
assert.equal(ctx.records[0].timeStr,'2026/10/12 08:30');
assert.equal(run({kind:'delete',id:'R1'}),true,'real deletion redraws');
assert.equal(run({kind:'delete',id:'R1'}),false,'repeated tombstone must not redraw');
assert(file.includes('now-lastDeltaResetRepairAt>=600000'),'repeated GAS reset cannot full-refresh repeatedly');
assert(file.includes('cloudSignature===lastCloudStatusUiSignature'),'identical status ticks must not rewrite UI');
assert(file.includes('},15000);'),'status heartbeat should not repaint every 3 seconds');
console.log('PASS no-change Delta, true edits, repeated deletes, reset throttle and status redraw protection');

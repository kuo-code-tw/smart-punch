const assert=require('assert/strict'),engine=require('../attendance/v6-engine.js');
function rec(id,type,time,more={}){return{id,empId:'E1',attNo:'1',name:'測試',status:type==='IN'?'上班簽到':'下班簽退',timeStr:time,...more}}
for(const [start,end,hours] of [['2026/10/04 15:31','2026/10/04 00:00',8+29/60],['2026/10/05 12:58','2026/10/05 00:00',11+2/60],['2026/10/31 15:31','2026/10/31 00:00',8+29/60],['2026/12/31 15:31','2026/12/31 00:00',8+29/60]]){
 const source=[rec('I','IN',start),rec('O','OUT',end,{source:'manual-admin',manualPairClockInId:'I'})];const before=JSON.stringify(source),rows=engine.buildShifts(source);assert.equal(rows.length,1);assert(rows[0].clockIn&&rows[0].clockOut);assert.equal(rows[0].clockOut.timeStr,end+':00');assert.equal(rows[0].dateKey,start.slice(0,10).replaceAll('/','-'));assert(Math.abs((engine.timestamp(rows[0].clockOut)-engine.timestamp(rows[0].clockIn))/3600000-hours)<.001);assert.equal(JSON.stringify(source),before);
}
const rows=engine.buildShifts([rec('I','IN','2026/10/04 15:31'),rec('O','OUT','2026/10/05 00:01')]);assert.equal(rows.length,1);assert(rows[0].clockOut);
assert.equal(engine.timestamp(rec('I','IN','2026/10/04 00:00')),new Date(2026,9,4).getTime());
assert.equal(engine.timestamp(rec('O','OUT','2026/10/04 00:01')),new Date(2026,9,4,0,1).getTime());
const separate=engine.buildShifts([rec('I','IN','2026/10/04 15:31'),rec('O','OUT','2026/10/04 00:00',{attNo:'2',empId:'E2'})]);assert.equal(separate.length,2);
console.log('PASS end-of-day midnight checkout, 00:01 next-day boundary, month/year rollover, durations, identity isolation, original timestamps unchanged');

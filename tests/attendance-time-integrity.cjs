const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8');
function fn(name,indent='        '){const start=html.indexOf(indent+'function '+name+'(');assert(start>=0,name);return html.slice(start,html.indexOf('\n'+indent+'}',start)+indent.length+2);}
const type=r=>r.status==='IN'?'IN':'OUT';
const c={Date,String,Number,Map,Set,Array,Math,console,getAttendanceRecordType:type,isManuallyEditedAttendanceRecord:r=>!!r.manuallyEdited,normalizeAttendanceRecordIdentifiers:r=>r,isLocallyDeletedAttendanceRecord:()=>false,getAttendanceImportEventKey:r=>r.sourceEventKey||'',stripManualPairSuffixFromEventKey:s=>s,normalizeImportedAttendanceTime:s=>/\d:\d/.test(s)?s:''};
vm.createContext(c);
for(const name of ['p79AttendancePreciseVersion','preferCanonicalAttendanceRecord'])vm.runInContext(fn(name),c);
for(const name of ['normRows','stableAliasKeys','chooseBetter','losslessMerge'])vm.runInContext(fn(name,'  '),c);
const full={id:'one',attNo:'292',status:'IN',timeStr:'2026/10/10 23:35',manuallyEdited:true,manuallyEditedAt:'2026-10-10T12:00:00Z'};
const damaged={...full,timeStr:'2026/10/10',note:'more metadata',manuallyEditedAt:'2026-10-18T00:00:00Z'};
for(const groups of [[[damaged],[full]],[[full],[damaged]]]){
 let rows=c.losslessMerge(groups);assert.equal(rows.length,1);assert.equal(rows[0].timeStr,full.timeStr);
 for(let i=0;i<3;i++){rows=c.losslessMerge([[damaged],rows]);assert.equal(rows[0].timeStr,full.timeStr);}
}
assert.equal(c.preferCanonicalAttendanceRecord(full,damaged),true);
assert.equal(c.preferCanonicalAttendanceRecord(damaged,full),false);
const midnight={...full,timeStr:'2026/10/10 00:00',manuallyEditedAt:damaged.manuallyEditedAt};
assert.equal(c.chooseBetter(full,midnight).timeStr,midnight.timeStr,'genuine explicitly timed newer edit wins');
for(const other of [{...damaged,attNo:'other'},{...damaged,status:'OUT'},{...damaged,id:'other'}])assert.equal(c.p79AttendancePreciseVersion(full,other),null,'cannot infer from another event');
const core=fs.readFileSync('assets/port79-attendance-core.js','utf8');
const ds=core.indexOf('function mergeDeltaEvent(event){'),de=core.indexOf('\nasync function pollDelta(',ds);
Object.assign(c,{records:[full],confirmCloudRecord:()=>{},pendingForId:()=>false});vm.runInContext(core.slice(ds,de),c);
assert.equal(c.mergeDeltaEvent({kind:'upsert',record:damaged}),true);assert.equal(c.records[0].timeStr,full.timeStr);
c.mergeDeltaEvent({kind:'upsert',record:midnight});assert.equal(c.records[0].timeStr,midnight.timeStr);
const engine=require('../attendance/v6-engine.js');
assert.equal(engine.normalizeTime('2026/10/10'),'2026/10/10');
let rows=engine.buildShifts([damaged,{...full,id:'out',status:'OUT',timeStr:'2026/10/11 07:51'}]);
assert.equal(rows.length,2);assert(rows.some(r=>r.timePrecisionIssue&&r.clockIn.timeStr==='2026/10/10'));assert(!rows.some(r=>r.clockIn&&r.clockOut));
rows=engine.buildShifts([full,{...full,id:'out',status:'OUT',timeStr:'2026/10/11 07:51'}]);assert.equal(rows.length,1);assert(rows[0].clockIn&&rows[0].clockOut);
rows=engine.buildShifts([{...full,timeStr:'2026/10/11 00:00'},{...full,id:'out',status:'OUT',timeStr:'2026/10/11 07:51'}]);assert.equal(rows.length,1);assert.equal(rows[0].dateKey,'2026-10-11');
for(const bad of ['2026/02/30 07:51','2026/10/10 25:00'])assert(engine.buildShifts([{...full,timeStr:bad}])[0].timePrecisionIssue);
console.log('PASS precise source preserved through month/canonical/delta merges and repeated pulls; newer genuine midnight edit, cross-day pairing and damaged-row visibility; no cloud writes');

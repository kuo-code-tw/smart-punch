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

assert.equal(engine.normalizeTime('2026/9/3'),'2026/09/03');
vm.runInContext(fn('formatAttendanceTimeCell'),c);vm.runInContext(fn('getAttendanceStatusBadge'),c);c.escapeHtml=s=>String(s);assert(c.formatAttendanceTimeCell(damaged,'IN').includes('時間不完整'));assert(!c.formatAttendanceTimeCell(damaged,'IN').includes('00:00'));assert(!c.getAttendanceStatusBadge('原始打卡時間不完整').includes('未打卡'));

const anchor={...full,id:'real-in',timeStr:'2026/10/06 23:32',v5PairTargetId:'real-out'};
const replacement={...full,id:'real-out',status:'OUT',timeStr:'2026/10/07 07:48',v5PairTargetId:'real-in'};
const stale={...full,id:'PAIRREC_OUT_OLD',source:'manual-pair-recovery',status:'OUT',timeStr:'2026/10/06 07:49',manualPairClockInId:'real-in'};
assert.equal(engine.buildShifts([anchor,replacement,stale]).length,1,'exact manual replacement retires impossible old recovery across dates');
assert.equal(engine.buildShifts([anchor,replacement,{...stale,id:'genuine',source:'manual-admin'}]).length,2,'real orphan retained');
assert.equal(engine.buildShifts([anchor,replacement,{...stale,manualPairClockInId:'unknown'}]).length,2,'unproven old recovery retained');
const dateOnlyRecovery={...full,id:'PAIRREC_IN_OLD',source:'manual-pair-recovery',timeStr:'2026/10/6'};
assert.equal(engine.buildShifts([anchor,replacement,dateOnlyRecovery]).length,1,'date-only synthetic does not duplicate genuine same-day side');

c.records=[full];c.mergeDeltaEvent({kind:'upsert',record:{...full,timeStr:'2026/10/10 07:30',manuallyEdited:false,manuallyEditedAt:''}});assert.equal(c.records[0].timeStr,full.timeStr,'historical delta cannot undo a dated manual edit');assert.equal(c.records[0].manuallyEdited,true);

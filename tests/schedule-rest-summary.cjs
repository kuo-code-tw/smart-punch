const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),c={window:null};c.window=c;vm.createContext(c);for(const f of ['rest-allocation','rest-attendance','monthly-rest-overtime','schedule-rest-summary'])vm.runInContext(fs.readFileSync('assets/port79-'+f+'.js','utf8'),c);
const api=c.P79ScheduleRestSummary,emp={id:'FIXTURE',name:'測試'},month='2026-10',dates=Array.from({length:31},(_,i)=>month+'-'+String(i+1).padStart(2,'0')),schedule={...Object.fromEntries(dates.map((d,i)=>[d,[2,8,9,15,21,22,28,29].includes(i+1)?'休':i===3?'年':'早'])),__meta:{}},json=x=>JSON.parse(JSON.stringify(x)),sum=()=>api.summary(emp,schedule,schedule.__meta,month,{},'');
assert.equal(sum().remaining,null,'local cached roster does not prove cloud declarations');
api.acceptRows([{empId:emp.id,schedule}]);assert.deepEqual(json(sum().remaining),{國:2,休:1,例:0},'all month including hidden 28th/29th is counted');
schedule.__meta[dates[0]]={restCategory:'休',restQuotaOvertime:true,restAllocationSource:'manual',overtimeReport:{id:'DRAFT',category:'休',code:'休08-16'}};
assert.equal(sum().reported.休,0,'unsaved local draft is not counted as a stored declaration');assert.equal(sum().reserved.休,1,'explicit pending rest overtime reserves its quota');assert.equal(sum().remaining.休,0);
const saved=JSON.parse(JSON.stringify(schedule));api.acceptRows([{empId:emp.id,schedule:saved}],month);assert.equal(sum().reported.休,1);assert.equal(sum().remaining.休,0);assert.equal(sum().remaining.國,2);
// Retrying a confirmed snapshot never deducts twice, and later local mutation does not alter receipt.
api.acceptRows([{empId:emp.id,schedule:saved}],month);assert.equal(sum().reported.休,1);saved.__meta[dates[0]].overtimeReport.category='國';assert.equal(sum().reported.休,1,'accepted reports are immutable');
const updated=JSON.parse(JSON.stringify(schedule));updated.__meta[dates[16]]={overtimeReport:{id:'NATIONAL',category:'國',code:'國08-16'}};api.acceptRows([{empId:emp.id,schedule:updated}],month);assert.equal(sum().remaining.國,1);assert.equal(sum().remaining.休,0);
const deleted=JSON.parse(JSON.stringify(schedule));deleted.__meta={};api.acceptRows([{empId:emp.id,schedule:deleted}],month);assert.equal(api.summary(emp,deleted,deleted.__meta,month,{},'').remaining.休,1,'confirmed deletion releases quota');
const idless=JSON.parse(JSON.stringify(schedule));idless.__meta[dates[0]].overtimeReport.id='';api.acceptRows([{empId:emp.id,schedule:idless}],month);assert.equal(sum().reported.休,0);
api.acceptRows([{empId:'OTHER',schedule:updated}],month);assert.equal(sum().reported.國,0,'employee identities never share deductions');
api.acceptRows([{empId:emp.id,schedule:updated}],month);api.acceptRows([{empId:emp.id,schedule:{'2026-11-01':'早'}}],'2026-11');assert.equal(sum().reported.國,1,'another month does not erase confirmed October');
const incomplete={...schedule};delete incomplete[dates[10]];assert.equal(api.summary(emp,incomplete,{},month,{},'').remaining,null,'incomplete roster is not a false zero');api.clear();assert.equal(sum().remaining,null,'session reset cannot reuse another account confirmations');
// Renderer formats the current per-category audit; cloud snapshot accounting is tested above.
const html=fs.readFileSync('schedule/index.html','utf8');let a=html.indexOf('    function p79ScheduleRestCountCells('),b=html.indexOf('    function p79RefreshScheduleRestCounts(',a);
Object.assign(c,{p79RestQuota:()=>({counts:{例:4,休:5,國:2}}),p79DailyRestCount:()=>({counts:{例:4,休:5,國:1},dates:{例:['01','02','03','04'],休:['05','06','07','08','09'],國:['10']}}),scheduleEscapeHtml:x=>String(x||'')});
vm.runInContext(html.slice(a,b),c);
const rendered=c.p79ScheduleRestCountCells(emp,month);assert.match(rendered,/<span>4\/0<\/span>/);assert.match(rendered,/<span>5\/0<\/span>/);assert.match(rendered,/<span>1\/1<\/span>/);assert.match(rendered,/國超額|p79-rest-national/);
assert(html.includes('acceptRows(data.schedules||[])'));assert(html.includes('acceptRows(confirmedRestRows,yearMonth)'));assert(html.includes('p79RefreshScheduleRestCounts(yearMonth)'));assert(!html.includes('for(const d of visibleDays){const date=yearMonth'));
console.log('PASS schedule summary: full-month cloud accounting, drafts/failure, successful write snapshots, retries, delete, identity/month reset, unknown state and category audit rendering');

// Legacy substitution keeps a manual rest marker from the original day off.
const substituteRoster=Object.fromEntries(dates.map((d,i)=>[d,i<8?'休':'早']));
const stale={restCategory:'例',restAllocationSource:'manual',forEmpId:'TARGET',forName:'測試代替',overtime:true,overtimeReport:{id:'SUB',category:'代',code:'代08-16'}};
substituteRoster.__meta={[dates[23]]:stale};
const original=JSON.stringify(substituteRoster);
api.acceptRows([{empId:emp.id,schedule:substituteRoster}],month);
let sub=api.summary(emp,substituteRoster,substituteRoster.__meta,month,{},'');
assert.equal(sub.error,undefined);assert.deepEqual(json(sub.remaining),{國:2,休:1,例:0});
assert.equal(sub.reported.例,0);assert.equal(JSON.stringify(substituteRoster),original,'source assignment and report remain intact');
const allocation=c.p79AllocateRestMonth(substituteRoster,substituteRoster.__meta,month).meta[dates[23]];
assert.equal(allocation.restCategory,undefined);assert.equal(allocation.forEmpId,'TARGET');assert.equal(allocation.overtimeReport.id,'SUB');
for(const marker of [{type:'substitute'},{overtimeReport:{id:'SUB',category:'代'}}]){
 const metadata={[dates[23]]:{restCategory:'例',restAllocationSource:'manual',...marker}};
 assert.doesNotThrow(()=>c.p79AllocateRestMonth(substituteRoster,metadata,month));
}
const evidence={attendanceEvidence:{complete:true,days:{[emp.id+'|'+dates[23]]:{state:'rest'}}}};
sub=api.summary(emp,substituteRoster,substituteRoster.__meta,month,evidence,'');
assert.equal(sub.off.休,5,'whole no-card substitution still counts as actual rest');assert.equal(sub.remaining.休,0);
assert.throws(()=>c.p79AllocateRestMonth(substituteRoster,{[dates[23]]:{restCategory:'例',restAllocationSource:'manual'}},month),/手動假別與班別不一致/,'unrelated inconsistencies remain visible');
assert.throws(()=>c.p79AllocateRestMonth(substituteRoster,{[dates[23]]:{...stale,overtimeReport:{id:'REST',category:'例'}}},month),/手動假別與班別不一致/,'do not silently erase a real rest declaration');
console.log('PASS legacy substitute rest metadata: numeric summary, no double deduction, immutable assignment, no-card rest, genuine conflicts retained');

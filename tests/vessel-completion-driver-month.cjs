const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function fn(name){let i=html.indexOf('function '+name+'(');assert(i>=0,name);let end=html.indexOf('\n}',i);assert(end>i,name);return html.slice(i,end+2);}
const rec=(id,no,date,disc,name)=>({id,workingNo:no,workDate:date,source:'working-report',empId:'NAME:'+name,name,number:'7902',startTime:'08:00',endTime:'12:00',disc,load:0,hatches:0,timeHours:4});
const s=[
 {workingNo:'5260159',lastDate:'2026-10-01',totalContainers:497,totalMoves:497,workingSheetSource:{reportRecordIds:['Asep','Aoct']}},
 {workingNo:'5260160',lastDate:'2026-10-01',totalContainers:771,totalMoves:771,workingSheetSource:{reportRecordIds:['Bsep','Boct']}},
 {workingNo:'5260176',lastDate:'2026-10-14',totalContainers:9,totalMoves:9,workingSheetSource:{reportRecordIds:['SUN']}},
 {workingNo:'5260195',lastDate:'2026-10-25',totalContainers:19809,totalMoves:19809,workingSheetSource:{reportRecordIds:['REST']}},
 {workingNo:'SEP',lastDate:'2026-09-30',totalContainers:300,totalMoves:300,workingSheetSource:{reportRecordIds:['SEPONLY']}},
 {workingNo:'NOV',lastDate:'2026-11-01',totalContainers:10,totalMoves:10,workingSheetSource:{reportRecordIds:['NOVOCT','NOVNOV']}}
];
const rows=[
 rec('Asep','5260159','2026-09-30',116,'員工甲'),rec('Aoct','5260159','2026-10-01',381,'員工甲'),
 rec('Bsep','5260160','2026-09-30',61,'員工乙'),rec('Boct','5260160','2026-10-01',710,'員工乙'),
 rec('STALE','5260160','2026-10-01',102,'員工乙'),rec('SUN','5260176','2026-10-14',9,'孫逸樺'),
 rec('REST','5260195','2026-10-25',19809,'員工丙'),rec('SEPONLY','SEP','2026-09-30',300,'員工甲'),
 rec('NOVOCT','NOV','2026-10-31',4,'員工甲'),rec('NOVNOV','NOV','2026-11-01',6,'員工甲')
];
const doc={filterMonth:{value:'2026-10'},rankingMonth:{value:'2026-10'}},ctx={
 Map,Set,Array,Number,String,records:rows,shipMasters:s,document:{getElementById:id=>doc[id]||null},
 getPort79Year:()=> '2026',dashboardDateRange:()=>({active:false}),dateWithinDashboardRange:()=>true,
 applyShipManualOverrides:x=>x,people:()=>[],normalizePersonName:v=>String(v||''),
 canonicalOperationalRecords:x=>x,personGroupId:()=>'',effectiveHours:r=>r.timeHours,
 recordMoveValues:r=>({disc:r.disc,load:r.load}),num:v=>Number(v)||0,
 round:(v,p=2)=>Number(Number(v).toFixed(p))
};vm.createContext(ctx);
for(const name of ['shipCompletionMonth','shipCompletionIndex','recordCompletionMonth','recordIsCurrentShipDetail','summaryRows','monthlyRankingRecords'])vm.runInContext(fn(name),ctx);
const total=()=>ctx.summaryRows().reduce((z,r)=>z+r.containers,0);
const before=JSON.stringify(rows);
assert.equal(total(),21086,'October includes both September driver segments, retired staff and SHIFT moves but not stale 102');
assert.equal(ctx.summaryRows().find(x=>x.name==='孫逸樺').containers,9,'Former worker remains in October total');
assert.equal(ctx.summaryRows().reduce((z,r)=>z+r.containers,0),21086,'No duplicate calculation on repaint');
let ranked=ctx.monthlyRankingRecords();
assert.equal(ranked.length,6,'All six valid October-completed segments, including two September work dates');
assert.equal(ranked.filter(x=>x.originalWorkDate==='2026-09-30').length,2);
assert(ranked.every(x=>x.workDate==='2026-10-01'));
doc.filterMonth.value='2026-09';doc.rankingMonth.value='2026-09';
assert.equal(total(),300,'September does not include drivers for October-completed ships');
assert.equal(ctx.monthlyRankingRecords().length,1);
doc.filterMonth.value='2026-11';doc.rankingMonth.value='2026-11';
assert.equal(total(),10,'November-completed ship takes October 31 and November 1 together');
assert.equal(ctx.monthlyRankingRecords().length,2);
doc.filterMonth.value='';assert.equal(total(),21396,'Full 2026 yearly total is all completed ships once');
assert.equal(JSON.stringify(rows),before,'Original workDate and cloud rows remain untouched');
assert.equal(ctx.people().length,0,'No former staff restored to current employee roster');
console.log(JSON.stringify({passed:12,failed:0,scope:'Cross-month driver attribution follows ship completion, retired staff, stale old records, ranking, 09/10/11, unmodified source rows'}));

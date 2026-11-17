'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const between=(left,right)=>{
  const a=html.indexOf(left),b=html.indexOf(right,a+left.length);
  assert(a>=0&&b>a,'Missing production function boundaries: '+left);
  return html.slice(a,b);
};
const context={
  normalizeAqcNo:x=>String(x??'').replace(/[^0-9]/g,''),
  workloadRecordMetrics:r=>({disc:r.disc,load:r.load,hc:r.hatches,hours:r.timeHours,containers:r.disc+r.load,eff:r.gph}),
  displayPersonName:x=>x,operationGroupForRecord:r=>r.group,
  esc:x=>String(x), document:{getElementById:()=>({value:''})},
  baseRecordRows:()=>dataset,recordGroupLabel:r=>r.group,
  encodeURIComponent,console
};
vm.createContext(context);
vm.runInContext(between('function p79WorkingReportSortClock(', 'function shiftAuditForMaster('),context);
vm.runInContext(between('function renderDriverVesselDetailTable(', 'function vesselScopeRows('),context);
vm.runInContext(between('function vesselDetailFilteredRows(', 'function renderVesselDetailRows('),context);
const fixtures=[
 ['08:00','08:58','管家宏',0,26,0],
 ['06:00','08:00','曾俊瑞',8,33,2],
 ['04:20','06:00','楊永慶',0,28,2],
 ['02:00','04:00','陳維新',0,46,1],
 ['00:19','02:00','郭耀宗',31,4,1]
];
const dataset=fixtures.map(([startTime,endTime,name,disc,load,hatches],i)=>({
 id:'WR_5260_8002_'+i,number:'8002',workDate:'2026-11-17',
 startTime,endTime,name,group:i===0?'B組':'A組',
 disc,load,hatches,timeHours:1,gph:21,sourceRow:100-i
}));
const expected=['00:19','02:00','04:20','06:00','08:00'];
const assertOrder=(rows,label)=>{
 assert.deepEqual(Array.from(rows,x=>x.startTime),expected,label);
 assert.equal(rows.reduce((n,r)=>n+r.disc+r.load,0),176,label+': quantity changed');
};
assertOrder([...dataset].sort(context.compareWorkingReportChronology),'direct comparator');
assertOrder(context.filteredRecords(),'record detail filters');
const original=dataset.map(x=>x.id).join(',');
const rendered=context.renderDriverVesselDetailTable(dataset);
const positions=expected.map(time=>rendered.indexOf(time+' → '));
assert(positions.every(p=>p>=0),'missing detail row from screenshot');
assert(positions.every((p,i)=>i===0||positions[i-1]<p),'AQC 8002 not sorted oldest to newest');
assert.equal((rendered.match(/class="vessel-operation-row"/g)||[]).length,5);
assert.equal(dataset.map(x=>x.id).join(','),original,'render must not mutate data order');
assert(context.p79WorkingReportSortClock('0:19')===19,'Google Sheets unpadded clock');
const multi=[
 {...dataset[0],id:'AQC8005',number:'8005',startTime:'00:00'},
 {...dataset[4],id:'AQC8003',number:'8003',startTime:'00:19'},
 ...dataset
];
const multiHtml=context.renderDriverVesselDetailTable(multi);
const g2=multiHtml.indexOf('AQC 8002'),g3=multiHtml.indexOf('AQC 8003'),g5=multiHtml.indexOf('AQC 8005');
assert(g2>=0&&g3>g2&&g5>g3,'AQC order broken');
const nextday=[{...dataset[0],id:'before',workDate:'2026-11-16',startTime:'22:00',endTime:'00:00'},
 {...dataset[4],id:'after',workDate:'2026-11-18',startTime:'00:00',endTime:'00:41'}];
assert.deepEqual(Array.from([...dataset,...nextday].sort(context.compareWorkingReportChronology),x=>x.id)[0],'before');
assert.deepEqual(Array.from([...dataset,...nextday].sort(context.compareWorkingReportChronology),x=>x.id).slice(-1),['after']);
context.officialRecordsForVessel=()=>dataset;
context.activeVesselKey={workingNo:'5260',vessel:'TEST'};
context.samePersonName=(a,b)=>a===b;
assertOrder(context.vesselDetailFilteredRows(),'vessel detail modal');
const source=html.slice(html.indexOf('function renderPersonStats()'),html.indexOf('const monthlyRankingReads=',html.indexOf('function renderPersonStats()')));
assert(source.includes('rs=[...rs].sort(compareWorkingReportChronology)'),'person workload history must use chronology');
const personnel=between('function renderPersonnelRecords(', 'function weeklyFilteredRecords(');
assert(personnel.includes('sort(compareWorkingReportChronology)'),'weekly personnel detail must use chronology');
const exportSource=between('function operationExportRows(', '// Read-only month safety audit');
assert(exportSource.includes('sort(compareWorkingReportChronology)'),'report export must use chronology');
console.log('PASS WORKING REPORT AQC 8002 ascending 00:19 -> 08:00, all detail tables, day rollover, group and export ordering; quantities intact');

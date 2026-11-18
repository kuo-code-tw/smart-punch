'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/personnel-reference-dashboard.js'),'utf8');
function fn(s,name){const i=s.indexOf('function '+name+'(');assert(i>=0,'missing '+name);const e=s.indexOf('\n}',i);assert(e>i);return s.slice(i,e+2);}
const rows=[
 {workDate:'2026-11-01',name:'甲',empId:'1',group:'A組',source:'working-report',disc:4,load:3,hatches:1,hours:2,workingNo:'NO1',number:'A1',startTime:'07:00',endTime:'09:00'},
 {workDate:'2026-11-30',name:'甲',empId:'1',group:'A組',source:'working-report',disc:6,load:1,hatches:0,hours:2,workingNo:'NO2',number:'A1',startTime:'07:00',endTime:'09:00'},
 {workDate:'2026-10-31',name:'乙',empId:'2',group:'B組',source:'working-report',disc:100,load:100,hatches:1,hours:1,workingNo:'NO3'}
];
let period={month:'2026-11',start:'2026-11-01',end:'2026-11-30',custom:false},write=null;
const button={disabled:false,textContent:''};
const nodes=new Map([['p79prExportExcel',button],['weeklyGroupFilter',{value:''}],['personStatPerson',{value:'',selectedOptions:[]}]]);
const document={getElementById:id=>nodes.get(id)||null};
const mock={
 window:{p79EnsureXlsx:async()=>{}},document,console,
 p79VerifiedAqcReportView:rs=>({verified:true,persons:[{name:'甲',empId:'1',group:'A組',rows:rs,hours:4,disc:10,load:4,hc:1,containers:14,eff:3.75}]}),
 rankedPersonnelEfficiencyPersons:ps=>ps.map(p=>({...p,effRank:1})),
 workloadRecordMetrics:r=>({hours:r.hours,disc:r.disc,load:r.load,hc:r.hatches,containers:r.disc+r.load,eff:(r.disc+r.load+r.hatches)/r.hours}),
 weeklyFilteredRecords:()=>rows.filter(x=>x.workDate>=period.start&&x.workDate<=period.end),
 personnelStatisticsPeriod:()=>period,
 displayPersonName:x=>x,operationGroupForRecord:r=>r.group,vesselLabelForRecord:r=>'船'+r.workingNo,
 normalizeAqcNo:s=>s,
 compareWorkingReportChronology:(a,b)=>a.workDate.localeCompare(b.workDate),
 requireEfficiencyAccess:()=>true,
 toast(){},Date,Number,String,Array,Map,
 XLSX:{utils:{book_new:()=>({sheets:[]}),aoa_to_sheet:data=>({data}),encode_cell:({r,c})=>'O'+(r+1),book_append_sheet:(book,sheet,name)=>book.sheets.push({name,sheet})},writeFile:(book,name)=>{write={book,name}}}
};
vm.createContext(mock);
vm.runInContext(fn(html,'buildPersonnelStatisticsExcelData'),mock);
vm.runInContext(fn(html,'exportPersonnelStatisticsExcel'),mock);
(async()=>{
 const report=mock.buildPersonnelStatisticsExcelData();
 assert.equal(report.rowsCount,2);
 assert.equal(report.summary.find(x=>x[0]==='作業櫃數')[1],14);
 assert.equal(report.days.length,31,'30 dates plus header; no last-12 truncation');
 assert.equal(report.detail.length,3);
 assert(!report.detail.some(r=>r.join(' ').includes('100')),'previous month must not leak');
 await mock.exportPersonnelStatisticsExcel();
 assert.equal(write.book.sheets.length,4);
 assert.equal(write.name,'人員統計_2026-11.xlsx');
 period={month:'2026-11',start:'2026-11-30',end:'2026-11-30',custom:true};
 assert.equal(mock.buildPersonnelStatisticsExcelData().rowsCount,1,'only selected day exported');
 assert.equal(mock.buildPersonnelStatisticsExcelData().detail[1][0],'2026-11-30');
 const chartNodes=new Map([['p79prDailyChart',{innerHTML:''}]]);
 const chartCtx={document:{getElementById:id=>chartNodes.get(id)},Map,Date,Math,Number,Array,String,Intl,console};
 vm.createContext(chartCtx);
 // Create chart with the same independent helpers as reference dashboard.
 const body=source.slice(source.indexOf('function renderTrend(rows,metric,period){'),source.indexOf('function renderCompare(persons,groupCode){'));
 vm.runInContext('var fmt=new Intl.NumberFormat("zh-TW");var n=v=>Number(v)||0;var safe=s=>String(s);var f=v=>Number(v).toFixed(2);',chartCtx);
 vm.runInContext(body,chartCtx);
 chartCtx.renderTrend(rows.slice(0,2),mock.workloadRecordMetrics,{start:'2026-11-01',end:'2026-11-30'});
 const monthSvg=chartNodes.get('p79prDailyChart').innerHTML;
 assert.equal((monthSvg.match(/<rect /g)||[]).length,30,'chart displays all 30 calendar days');
 assert(monthSvg.includes('11/30')&&monthSvg.includes('11/01'));
 chartCtx.renderTrend(rows.slice(1,2),mock.workloadRecordMetrics,{start:'2026-11-30',end:'2026-11-30'});
 assert.equal((chartNodes.get('p79prDailyChart').innerHTML.match(/<rect /g)||[]).length,1,'single selected day, not the month');
 console.log('PASS Excel summary, verified personnel, chart full-month and selected-day fidelity');
})().catch(e=>{console.error(e);process.exitCode=1;});

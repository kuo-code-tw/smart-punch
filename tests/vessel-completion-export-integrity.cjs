// Regression: 09/30→10/01 work belongs to the whole ship's October completion,
// not an incomplete October-only slice of its driver rows.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
const getFn=name=>{const a=html.indexOf('function '+name+'(');assert(a>=0,name);const b=html.indexOf('\n}',a);assert(b>a,name);return html.slice(a,b+2);};
const master=[
 {workingNo:'5260159',vessel:'WAN HAI 292',lastDate:'2026-10-01',compareDate:'2026-10-01',totalContainers:497,totalMoves:497,hatches:8,shiftMoves:0,workingSheetSource:{disc:190,load:319,bundleDeduct:12}},
 {workingNo:'5260160',vessel:'WAN HAI 105',lastDate:'2026-10-01',compareDate:'2026-10-01',totalContainers:771,totalMoves:771,hatches:26,shiftMoves:0,workingSheetSource:{disc:381,load:390,bundleDeduct:0}}
];
const records=[
 {id:'oldA',source:'working-report',workingNo:'5260159',workDate:'2026-09-30',disc:37,load:0,containers:37},
 {id:'newA',source:'working-report',workingNo:'5260159',workDate:'2026-10-01',disc:141,load:319,containers:460},
 {id:'oldB',source:'working-report',workingNo:'5260160',workDate:'2026-09-30',disc:61,load:0,containers:61},
 {id:'newB',source:'working-report',workingNo:'5260160',workDate:'2026-10-01',disc:320,load:390,containers:710},
 {id:'wrongMonth',source:'working-report',workingNo:'5260100',workDate:'2026-09-15',disc:12,load:0,containers:12}
];
const ctx={
 console,Map,Set,Math,Number,String,Array,
 window:{P79VesselVersionView:{collapse:()=>({excludedWorkingNos:[]})}},
 document:{getElementById:()=>({value:'2026-10'})},
 shipMasters:master,records,
 num:x=>Number(x)||0,round:(x,p=2)=>Number(Number(x).toFixed(p)),
 canonicalShipMasters:x=>x,applyShipManualOverrides:x=>x,
 dashboardAdjustJobsForMonthlyReference:x=>x,vesselJobRows:()=>master,
 recordsForVessel:no=>records.filter(x=>x.workingNo===no),recoveredMoveSplit:x=>x,
 monthlySerialFromWorkingNo:no=>String(no).slice(-4),monthlyShipNo:x=>x,
 shipCompletionIndex:()=>new Map(master.map(x=>[x.workingNo,{month:x.lastDate.slice(0,7)}])),
 recordCompletionMonth:(r,ix)=>ix.get(r.workingNo)?.month||r.workDate.slice(0,7),
 recordIsCurrentShipDetail:()=>true,
 canonicalOperationalRecords:x=>x,
 calc:()=>({statHours:1}),people:()=>[],groupName:()=>'',personGroupId:()=>'',vesselLabelForRecord:x=>x.workingNo,
 normalizeAqcNo:()=>'',effectiveBundleRecord:r=>({rawDisc:r.disc,rawLoad:r.load,bundleDeduct:0})
};
vm.createContext(ctx);
['shipMasterKey','vesselScopeMaster','vesselMonthlyExportRows','buildShipExportRows','buildDetailExportRows'].forEach(n=>vm.runInContext(getFn(n),ctx));
const monthly=ctx.vesselMonthlyExportRows('2026-10');
assert.equal(monthly.length,2);
assert.deepEqual(monthly.map(x=>[x.disc,x.load,x.bill]),[[178,319,497],[381,390,771]]);
const ships=ctx.buildShipExportRows();
assert.equal(ships.length,2);
assert.deepEqual(ships.map(x=>[x.disc,x.load,x.billing,x.date]),[[178,319,497,'2026-10-01'],[381,390,771,'2026-10-01']]);
const detail=ctx.buildDetailExportRows();
assert.equal(detail.length,4,'prior-month drivers of October-completed ships must be included');
assert.equal(detail.reduce((a,x)=>a+x.containers,0),1268);
assert.equal(detail.filter(x=>x.date==='2026-09-30').length,2,'do not rewrite actual workDate');
ctx.shipMasters=[{workingNo:'broken',totalContainers:100,lastDate:'2026-10-01'}];
ctx.records=[];
ctx.vesselJobRows=()=>ctx.shipMasters;
assert.throws(()=>ctx.buildShipExportRows(),/已停止匯出/,'incomplete cache must fail rather than under-export');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
console.log('PASS completion-month vessel exports, net Bundle, cross-month personnel, missing-data block, JavaScript syntax');

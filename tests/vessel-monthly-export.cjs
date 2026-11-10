const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
const versionView=require('../assets/port79-vessel-versions.js');
function fn(name){let a=html.indexOf('function '+name+'(');assert(a>=0,name);if(html.slice(a-6,a)==='async ')a-=6;return html.slice(a,html.indexOf('\n}',a)+2);}
const elements={filterMonth:{value:'2026-10'},vesselMonthlyExportBtn:{disabled:false},
 vesselMonthlySignProof:{value:'證明：測試'},vesselMonthlySignAssistant:{value:'協理：'},
 vesselMonthlySignManager:{value:'經理：'},vesselMonthlySignPrepared:{value:'製表：'}},messages=[],writes=[];
const c={console,Date,document:{getElementById:id=>elements[id]},shipMasters:[],records:[],
  num:v=>Number(v)||0,round:(v,n)=>Number(v.toFixed(n)),canonicalShipMasters:list=>list,
  applyShipManualOverrides:s=>({...s,...s.manualOverrides}),monthlySerialFromWorkingNo:no=>String(no).slice(-4),
  recordsForVessel:no=>c.records.filter(r=>r.workingNo===no),recoveredMoveSplit:r=>r,
  requireSuperAdminAccess:()=>true,toast:m=>messages.push(m),loadEfficiencyCloudScope:async()=>true,
  dashboardAdjustJobsForMonthlyReference:jobs=>jobs};
c.window=c;c.P79VesselVersionView=versionView;c.p79EnsureXlsx=async()=>{};c.P79VesselMonthlyReport={savedCompany:()=> 'Test Company',saveCompany:v=>v,
 saveSignatures:values=>values,
 download:async({month,rows,filename,company,signatures})=>writes.push({wb:{sheet:c.buildMonthlyOperationSheet(month,rows)},name:filename,company,signatures})};vm.createContext(c);
for(const name of ['monthlyShipNo','shipMasterDateMatchesMonth','shipMasterKey','p79VesselMonthSafetyAudit','vesselMonthlyExportRows','buildMonthlyOperationSheet','saveVesselMonthlySignatureFields','exportVesselMonthlyExcel'])vm.runInContext(fn(name),c);
c.vesselJobRows=month=>versionView.collapse(c.shipMasters
  .filter(s=>c.shipMasterDateMatchesMonth(s,month))
  .map(c.applyShipManualOverrides)).rows;
let passed=0;function test(name,f){f();passed++;console.log('PASS '+name);}
const master={workingNo:'5260159',vessel:'WAN HAI 292 N073',voyageE:'N073',firstDate:'2026-09-30',lastDate:'2026-10-01',totalContainers:497,totalMoves:497,hatches:8,shiftMoves:0,gph:23.06,gphHC:23.43,workingSheetSource:{disc:189,load:308}};
c.shipMasters=[master,{...master,workingNo:'5260160',lastDate:'2026-11-01'}];
c.records=[{workingNo:'5260159',source:'working-report',workDate:'2026-09-30',disc:10,load:20}];
test('completion month includes cross-month ship and excludes next month',()=>{assert.equal(c.vesselMonthlyExportRows('2026-10').length,1);assert.equal(c.vesselMonthlyExportRows('2026-09').length,0);});
test('sheet totals beat an incomplete detail cache and vessel suffix is not mistaken for ship number',()=>{const r=c.vesselMonthlyExportRows('2026-10')[0];assert.equal(r.disc,189);assert.equal(r.load,308);assert.equal(r.shipName,'292');assert.equal(r.serial,'0159');assert.equal(r.bill,497);});
test('manual zero overrides remain zero',()=>{master.manualOverrides={disc:0,totalContainers:0,hatches:0};const r=c.vesselMonthlyExportRows('2026-10')[0];assert.equal(r.disc,0);assert.equal(r.bill,0);assert.equal(r.hc,0);delete master.manualOverrides;});
// Regression: the October 2026 exported XLSX had an additional edit copy of
// WAN HAI 105 / WORKING NO 5260196: exactly +336 DISC +152 LOAD
// +488 billing +30 H/C. This copy must NOT be exported as a new vessel.
// A true independent second call 5260196-CALL2 must remain in the report.
const revisionBase={
  workingNo:'5260196',vessel:'WAN HAI 105',voyageI:'N466',voyageE:'S466',
  wharf:'80R',lastDate:'2026-10-28',compareDate:'2026-10-28',
  sourceFileName:'WAN HAI 105 S466 (第一靠)  Working Sheet.xlsx',
  workingSheetImportedAt:'2026-10-30T07:27:05.000Z',
  totalContainers:488,totalMoves:488,hatches:30,shiftMoves:0,
  workingSheetSource:{disc:336,load:152}
};
const revisionCopy={...revisionBase,workingNo:'5260196-1',
  workingSheetImportedAt:'2026-10-30T07:27:06.000Z'};
const actualSecondCall={...revisionBase,workingNo:'5260196-CALL2',
  sourceFileName:'WAN HAI 105 S466 (第二靠) Working Sheet.xlsx',
  lastDate:'2026-10-29',compareDate:'2026-10-29',
  totalContainers:299,totalMoves:299,hatches:12,
  workingSheetSource:{disc:201,load:98}};
const previousMasters=c.shipMasters;
c.shipMasters=[revisionBase,revisionCopy,actualSecondCall];
test('exclude 5260196 edit copy without dropping independent CALL2',()=>{
 const rows=c.vesselMonthlyExportRows('2026-10');
 assert.equal(rows.length,2);
 assert.equal(rows.reduce((n,r)=>n+r.disc,0),537);
 assert.equal(rows.reduce((n,r)=>n+r.load,0),250);
 assert.equal(rows.reduce((n,r)=>n+r.bill,0),787);
 assert.equal(rows.reduce((n,r)=>n+r.hc,0),42);
 assert(rows.some(r=>r.workingNo==='5260196-CALL2'));
});
c.shipMasters=previousMasters;
test('automatic monthly validation keeps valid months and refuses invalid totals',()=>{
 const checked=c.p79VesselMonthSafetyAudit('2026-10',[master]);
 assert.equal(checked.ok,true);
 assert.equal(checked.shipCount,1);
 const wrong=c.p79VesselMonthSafetyAudit('2026-10',[{...master,totalMoves:999}]);
 assert.equal(wrong.ok,false);
 assert(wrong.issues.some(x=>x.includes('Moves')));
 const duplicated=c.p79VesselMonthSafetyAudit('2026-10',[master,master]);
 assert.equal(duplicated.ok,false);
 assert(duplicated.issues.some(x=>x.includes('重複')));
 const version=c.P79VesselVersionView;
 c.P79VesselVersionView=null;
 assert.equal(c.p79VesselMonthSafetyAudit('2026-10',[master]).ok,false);
 c.P79VesselVersionView=version;
});
test('automatic monthly validation identifies duplicate edits and preserves CALL2',()=>{
 const s=[revisionBase,revisionCopy,actualSecondCall];
 c.shipMasters=s;
 const shown=c.vesselJobRows('2026-10');
 const audit=c.p79VesselMonthSafetyAudit('2026-10',shown);
 assert.equal(audit.ok,true);
 assert.equal(audit.versionCopies.length,1);
 assert.equal(audit.shipCount,2);
 c.shipMasters=previousMasters;
});
// Use a minimal SheetJS contract for offline CI; optionally verify the real writer locally.
c.XLSX={utils:{aoa_to_sheet(rows){const out={};rows.forEach((row,r)=>row.forEach((v,col)=>{out[String.fromCharCode(65+col)+(r+1)]={v,t:typeof v==='number'?'n':'s'};}));return out;},decode_range:s=>s,book_new:()=>({}),book_append_sheet:(wb,ws)=>{wb.sheet=ws;}},writeFile:(wb,name)=>writes.push({wb,name})};
test('template headers, ROC month, leading-zero serial and subtotal use the selected month',()=>{const ws=c.buildMonthlyOperationSheet('2026-10');assert(ws.A1.v.includes('115年10月份'));assert.equal(ws.B5.v,'0159');assert.equal(ws.K4.v,'Productivity');assert.equal(ws.H3.v,'作業櫃數');assert.equal(ws.J5.v,0);assert.equal(ws.J5.z,'#,##0;-#,##0;;@');assert.equal(ws.L5.z,'0.00;-0.00;;@');assert.equal(ws.J6.z,'#,##0;-#,##0;;@');assert.equal(ws.F6.f,'SUM(F5:F5)');assert.equal(ws.K6.v,'');assert.equal(ws['!ref'],'A1:N6');});
(async()=>{
 elements.filterMonth.value='';await c.exportVesselMonthlyExcel();assert.equal(writes.length,0);passed++;
 elements.filterMonth.value='2026-10';c.loadEfficiencyCloudScope=async()=>false;await c.exportVesselMonthlyExcel();assert.equal(writes.length,0);assert.equal(elements.vesselMonthlyExportBtn.disabled,false);passed++;
 c.loadEfficiencyCloudScope=async({month})=>{assert.equal(month,'2026-10');elements.filterMonth.value='2026-11';return true;};
 await c.exportVesselMonthlyExcel();assert.equal(writes.length,1);assert(writes[0].name.includes('115年10月份'));assert(writes[0].wb.sheet.A1.v.includes('115年10月份'));assert.equal(writes[0].signatures[0],'證明：測試');passed++;
 elements.filterMonth.value='2026-12';c.loadEfficiencyCloudScope=async()=>true;await c.exportVesselMonthlyExcel();assert.equal(writes.length,1);passed++;
 elements.filterMonth.value='2026-10';c.P79VesselMonthlyReport.download=async()=>{throw Error('load failed');};await c.exportVesselMonthlyExcel();assert.equal(writes.length,1);assert.equal(elements.vesselMonthlyExportBtn.disabled,false);passed++;
 assert(html.includes('id="vesselMonthlyExportBtn" type="button" onclick="exportVesselMonthlyExcel()"'));assert(html.includes('id="vesselMonthlySignProof"'));assert(html.includes('A4 直式、微軟正黑體'));passed++;
 if(process.env.P79_XLSX_PATH){
   c.XLSX=require(process.env.P79_XLSX_PATH);
   const wb=c.XLSX.utils.book_new();c.XLSX.utils.book_append_sheet(wb,c.buildMonthlyOperationSheet('2026-10'),'船邊作業量表');
   const bytes=c.XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),saved=c.XLSX.read(bytes,{type:'buffer'}).Sheets['船邊作業量表'];
   assert.equal(saved.B5.v,'0159');assert.equal(saved.B5.t,'s');assert.equal(saved.C5.t,'n');assert.equal(saved.C5.z,undefined);assert.equal(saved.F6.f,'SUM(F5:F5)');assert.equal(saved.L5.v,23.43);passed++;
 }
 console.log(JSON.stringify({passed,failed:0,scope:'Monthly export filtering, template and download flow; cloud mocked'}));
})().catch(e=>{console.error(e);process.exitCode=1;});

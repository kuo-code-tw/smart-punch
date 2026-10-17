const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function fn(name){let a=html.indexOf('function '+name+'(');assert(a>=0,name);if(html.slice(a-6,a)==='async ')a-=6;return html.slice(a,html.indexOf('\n}',a)+2);}
const elements={filterMonth:{value:'2026-10'},vesselMonthlyExportBtn:{disabled:false}},messages=[],writes=[];
const c={console,Date,document:{getElementById:id=>elements[id]},shipMasters:[],records:[],
  num:v=>Number(v)||0,round:(v,n)=>Number(v.toFixed(n)),canonicalShipMasters:list=>list,
  applyShipManualOverrides:s=>({...s,...s.manualOverrides}),monthlySerialFromWorkingNo:no=>String(no).slice(-4),
  recordsForVessel:no=>c.records.filter(r=>r.workingNo===no),recoveredMoveSplit:r=>r,
  requireSuperAdminAccess:()=>true,toast:m=>messages.push(m),loadEfficiencyCloudScope:async()=>true};
c.window=c;c.p79EnsureXlsx=async()=>{};vm.createContext(c);
for(const name of ['monthlyShipNo','shipMasterDateMatchesMonth','vesselMonthlyExportRows','buildMonthlyOperationSheet','exportVesselMonthlyExcel'])vm.runInContext(fn(name),c);
let passed=0;function test(name,f){f();passed++;console.log('PASS '+name);}
const master={workingNo:'5260159',vessel:'WAN HAI 292 N073',voyageE:'N073',firstDate:'2026-09-30',lastDate:'2026-10-01',totalContainers:497,hatches:8,shiftMoves:0,gph:23.06,gphHC:23.43,workingSheetSource:{disc:189,load:308}};
c.shipMasters=[master,{...master,workingNo:'5260160',lastDate:'2026-11-01'}];
c.records=[{workingNo:'5260159',source:'working-report',workDate:'2026-09-30',disc:10,load:20}];
test('completion month includes cross-month ship and excludes next month',()=>{assert.equal(c.vesselMonthlyExportRows('2026-10').length,1);assert.equal(c.vesselMonthlyExportRows('2026-09').length,0);});
test('sheet totals beat an incomplete detail cache and vessel suffix is not mistaken for ship number',()=>{const r=c.vesselMonthlyExportRows('2026-10')[0];assert.equal(r.disc,189);assert.equal(r.load,308);assert.equal(r.shipName,'292');assert.equal(r.serial,'0159');assert.equal(r.bill,497);});
test('manual zero overrides remain zero',()=>{master.manualOverrides={disc:0,totalContainers:0,hatches:0};const r=c.vesselMonthlyExportRows('2026-10')[0];assert.equal(r.disc,0);assert.equal(r.bill,0);assert.equal(r.hc,0);delete master.manualOverrides;});
// Use a minimal SheetJS contract for offline CI; optionally verify the real writer locally.
c.XLSX={utils:{aoa_to_sheet(rows){const out={};rows.forEach((row,r)=>row.forEach((v,col)=>{out[String.fromCharCode(65+col)+(r+1)]={v,t:typeof v==='number'?'n':'s'};}));return out;},decode_range:s=>s,book_new:()=>({}),book_append_sheet:(wb,ws)=>{wb.sheet=ws;}},writeFile:(wb,name)=>writes.push({wb,name})};
test('template headers, ROC month, leading-zero serial and subtotal use the selected month',()=>{const ws=c.buildMonthlyOperationSheet('2026-10');assert(ws.A1.v.includes('115年10月份'));assert.equal(ws.B5.v,'0159');assert.equal(ws.K4.v,'Productivity');assert.equal(ws.F6.f,'SUM(F5:F5)');assert.equal(ws.K6.v,'');assert.equal(ws['!ref'],'A1:N6');});
(async()=>{
 elements.filterMonth.value='';await c.exportVesselMonthlyExcel();assert.equal(writes.length,0);passed++;
 elements.filterMonth.value='2026-10';c.loadEfficiencyCloudScope=async()=>false;await c.exportVesselMonthlyExcel();assert.equal(writes.length,0);assert.equal(elements.vesselMonthlyExportBtn.disabled,false);passed++;
 c.loadEfficiencyCloudScope=async({month})=>{assert.equal(month,'2026-10');elements.filterMonth.value='2026-11';return true;};
 await c.exportVesselMonthlyExcel();assert.equal(writes.length,1);assert(writes[0].name.includes('115年10月份'));assert(writes[0].wb.sheet.A1.v.includes('115年10月份'));passed++;
 elements.filterMonth.value='2026-12';c.loadEfficiencyCloudScope=async()=>true;await c.exportVesselMonthlyExcel();assert.equal(writes.length,1);passed++;
 elements.filterMonth.value='2026-10';c.p79EnsureXlsx=async()=>{throw Error('load failed');};await c.exportVesselMonthlyExcel();assert.equal(writes.length,1);assert.equal(elements.vesselMonthlyExportBtn.disabled,false);passed++;
 assert(html.includes('id="vesselMonthlyExportBtn" type="button" onclick="exportVesselMonthlyExcel()"'));passed++;
 if(process.env.P79_XLSX_PATH){
   c.XLSX=require(process.env.P79_XLSX_PATH);
   const wb=c.XLSX.utils.book_new();c.XLSX.utils.book_append_sheet(wb,c.buildMonthlyOperationSheet('2026-10'),'船邊作業量表');
   const bytes=c.XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),saved=c.XLSX.read(bytes,{type:'buffer'}).Sheets['船邊作業量表'];
   assert.equal(saved.B5.v,'0159');assert.equal(saved.B5.t,'s');assert.equal(saved.C5.t,'n');assert.equal(saved.C5.z,undefined);assert.equal(saved.F6.f,'SUM(F5:F5)');assert.equal(saved.L5.v,23.43);passed++;
 }
 console.log(JSON.stringify({passed,failed:0,scope:'Monthly export filtering, template and download flow; cloud mocked'}));
})().catch(e=>{console.error(e);process.exitCode=1;});

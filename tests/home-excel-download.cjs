'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const homepage=fs.readFileSync('index.html','utf8');
const download=fs.readFileSync('assets/port79-home-excel-download.js','utf8');
const legacy=fs.readFileSync('assets/port79-home-drop-import.js','utf8');
const vessel=fs.readFileSync('aqc-efficiency/index.html','utf8');
const yard=fs.readFileSync('yard-dashboard/yard-dashboard.js','utf8');
new vm.Script(download);
assert(homepage.includes('data-p79-mode="download"'),'home page must enable download rather than import');
assert(homepage.includes('Excel 資料下載'));
assert(homepage.includes('port79-home-excel-download.js?v=20261118-read-only-v1'));
assert(legacy.includes("if(root.dataset?.p79Mode==='download')return;"),'old import event handlers must not run');
assert(vessel.includes('p79-home-excel-download-export-entry')&&vessel.includes("new URLSearchParams(location.search).get('homeDownload')!=='1'"));
assert(!/gateStatsImport|P79GateImport.*chooseFile|P79YardDashboard.*importFile|P79VesselHomeImport.*importFiles|method:['"]POST/.test(download),
 'homepage data downloads must be read-only');
const year=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric'}).format(new Date());
const fieldBlock=yard.match(/const FIELD_ROWS=\{([\s\S]*?)\};/);
assert(fieldBlock,'Yard field schema missing');
const fields=[...fieldBlock[1].matchAll(/\b([A-Za-z]\w*):\d+/g)].map(m=>m[1]);
const row={date:year+'-11-18'};fields.forEach(k=>row[k]=1);
row.heavyTotal=row.impTeu+row.expTeu+row.transTeu+row.reeferTeu;
row.emptyTotal=row.genEmptyTeu+row.reeferEmptyTeu;
row.longTotal=row.longImpTeu+row.longExpTeu+row.longTransTeu;
row.specialHeavyCount=row.specialHeavy20+row.specialHeavy40;
function element(kind){
 return {dataset:kind?{p79DropKind:kind}:{p79Mode:'download'},listeners:{},disabled:false,hidden:true,attributes:{},
  addEventListener(type,cb){this.listeners[type]=cb},setAttribute(k,v){this.attributes[k]=v},
  insertAdjacentElement(_where,node){this.nextStatus=node},querySelectorAll:()=>[],
  click(){if(this.listeners.click)return this.listeners.click()}};
}
const zones=['gate','yard','vessel'].map(element),root=element();
root.querySelectorAll=()=>zones;
const nodes=new Map([['p79HomeDropImport',root]]);
const doc={getElementById:id=>nodes.get(id)||null,createElement:()=>({hidden:false,dataset:{},setAttribute(){},textContent:''})};
const files=[],requests=[],nav=[],storage=new Map();
const session=new Map([
 ['port79_user_session',JSON.stringify({adminRole:'superadmin',empId:'SUP-1'})],
 ['port79_user_token','TOKEN'],
 ['port79_gas_url','https://script.google.com/macros/s/DEPLOYMENT/exec']
]);
storage.set('p79_yard_private_v1_SUP-1',JSON.stringify({fileName:'yard.xlsx',rows:[row]}));
let response={ok:true,source:'port79-gate-daily',year,rows:[{
 date:year+'-11-18',deliverEmpty:1,pickupEmpty:2,deliverLoaded:3,pickupLoaded:4,truckEntries:5
}]};
const window={
 document:doc,sessionStorage:{getItem:key=>session.get(key)||null},
 localStorage:{getItem:key=>storage.get(key)||null},
 location:{assign:url=>nav.push(url)},
 fetch:async(url,opts)=>{requests.push({url,opts});return {ok:true,json:async()=>response};},
 XLSX:{utils:{
  book_new:()=>({sheets:[]}),
  aoa_to_sheet:values=>({values}),
  book_append_sheet:(book,sheet,name)=>book.sheets.push({sheet,name})
 },writeFile:(book,name)=>files.push({book,name})},
 addEventListener(){}
};
vm.runInNewContext(download,{window,URL,Intl,Date,JSON,Map,Set,AbortController,setTimeout,clearTimeout,console});
(async()=>{
 assert.equal(root.hidden,false);
 assert.equal(zones.every(z=>z.disabled===false),true,'authorized manager sees all three download tiles');
 const api=window.Port79HomeExcelDownload;
 assert.equal(await api.start('gate'),true);
 assert.equal(files.length,1);
 assert.match(files[0].name,/Gate進出站_\d{4}\.xlsx$/);
 assert.deepEqual(Array.from(files[0].book.sheets[0].sheet.values[1]),[year+'-11-18',1,2,3,4,5]);
 assert.equal(new URL(requests[0].url).searchParams.get('action'),'gateStatsReadYear');
 assert.equal(requests[0].opts.method,'GET');
 assert.equal(await api.start('yard'),true);
 assert.equal(files.length,2);
 assert.match(files[1].name,/Yard儲量_.*\.xlsx$/);
 assert.equal(files[1].book.sheets[0].sheet.values[0].length,fields.length+1);
 assert.equal(requests.length,1,'Yard reads current account local data without extra cloud write');
 assert.equal(await api.start('vessel'),true);
 assert.deepEqual(nav,['./aqc-efficiency/?homeDownload=1']);
 response={ok:false,error:'正式 Gate 讀取服務尚未部署'};
 assert.equal(await api.start('gate'),false);
 assert.equal(files.length,2,'failed official cloud read must not generate fake Excel');
 assert.match(root.nextStatus.textContent,/尚未部署/);
 const original=storage.get('p79_yard_private_v1_SUP-1');
 const broken=JSON.parse(original);broken.rows[0].heavyTotal=999;
 storage.set('p79_yard_private_v1_SUP-1',JSON.stringify(broken));
 assert.equal(await api.start('yard'),false);
 assert.equal(files.length,2,'inconsistent Yard source must not download misleading data');
 storage.set('p79_yard_private_v1_SUP-1',original);
 const denied=JSON.stringify({role:'employee',empId:'E1'});
 session.set('port79_user_session',denied);
 api.refresh();
 assert.equal(root.hidden,true,'employees cannot access home data export');
 assert.equal(await api.start('gate'),false);
 assert.equal(requests.length,2,'no unauthorized cloud requests');
 session.set('port79_user_session',JSON.stringify({adminRole:'superadmin',empId:'SUP-1'}));
 api.refresh();
 assert.equal(await api.start('yard'),true,'authorized session can still download');
 assert.equal(files.length,3);
 assert.equal(root.querySelectorAll().length,3,'visual three-tile layout remains unchanged');
 console.log('PASS homepage Excel download: official Gate GET, account-owned Yard, original vessel exporter, no upload, no fake data, role isolation');
})().catch(error=>{console.error(error);process.exitCode=1});

'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('assets/port79-home-drop-import.js','utf8');
const css=fs.readFileSync('assets/port79-home-drop-import.css','utf8');
new vm.Script(js);
const importerSection=html.slice(html.indexOf('id="p79HomeDropImport"'),html.indexOf('id="p79AllBackupPanel"'));
assert.equal((importerSection.match(/data-p79-drop-kind=/g)||[]).length,3);
assert.match(importerSection,/Excel 資料下載/);
assert.match(importerSection,/data-p79-mode="download"/);
assert.match(html,/port79-home-excel-download.js\?v=20261118-read-only-v1/);
assert(js.includes("root.dataset?.p79Mode==='download'"),'legacy importer cannot bind homepage download mode');
assert.match(html,/id="p79HomeImportDialog"/);
assert.match(html,/id="p79HomeImportProgressBar"/);
assert.match(html,/id="p79HomeImportReviewYes"/);
assert.match(html,/id="p79HomeImportInput"/);
assert.match(css,/#p79HomeImportProgressBar/);
assert.match(html,/port79-home-drop-import.js\?v=20261116-auto-import-v2/);
assert(!js.includes('launchSystem('),'no homepage redirect');
assert(!js.includes('gcSyncAll'),'cloud storage remains with the original importers');
assert(!js.includes('gateStatsImport'),'no second Gate import implementation');
assert(/P79GateImport\?\.chooseFile/.test(js));
assert(/P79YardDashboard\?\.importFile/.test(js));
assert(/P79VesselHomeImport\?\.importFiles/.test(js));

function element(){
 return {
  dataset:{},style:{},listeners:{},attributes:{},textContent:'',hidden:false,open:false,files:[],
  classList:{add(){},remove(){}},
  setAttribute(k,v){this.attributes[k]=v;},
  addEventListener(k,fn){this.listeners[k]=fn;},
  showModal(){this.open=true;},close(){this.open=false;},focus(){},
  querySelectorAll(){return[]},contains(){return false;}
 };
}
const root=element(),modal=element(),frame=element(),picker=element(),progress=element(),bar=element();
const title=element(),fileLabel=element(),status=element(),review=element(),reviewText=element();
const yes=element(),no=element(),close=element();
const kinds=['gate','yard','vessel'],zones={};
for(const kind of kinds){zones[kind]=element();zones[kind].dataset.p79DropKind=kind;}
root.querySelectorAll=()=>Object.values(zones);
const all={
 p79HomeDropImport:root,p79HomeImportDialog:modal,p79HomeImportFrame:frame,p79HomeImportInput:picker,
 p79HomeImportTitle:title,p79HomeImportFile:fileLabel,p79HomeImportProgress:progress,
 p79HomeImportProgressBar:bar,p79HomeImportStatus:status,p79HomeImportReview:review,
 p79HomeImportReviewText:reviewText,p79HomeImportReviewYes:yes,p79HomeImportReviewNo:no,
 p79HomeImportClose:close
};
const documentListeners={};
const document={
 getElementById:id=>all[id]||null,
 addEventListener:(k,fn)=>{documentListeners[k]=fn}
};
const origin='https://port79.example.test',calls=[],books={};
books[1]={
 SheetNames:['WORKING SHEET','WORKING REPORT'],
 Sheets:{'WORKING SHEET':{},'WORKING REPORT':{}}
};
books[2]={
 SheetNames:['堆場櫃位'],Sheets:{'堆場櫃位':{
  A2:{v:'重櫃'},A3:{v:'進口櫃'},A29:{v:'空櫃'},A77:{v:'Long-Stay'}
 }}
};
books[3]={
 SheetNames:['Sheet1'],Sheets:{Sheet1:{
  B2:{v:'交空櫃'},B3:{v:'交重櫃'},B7:{v:'領空櫃'},A15:{v:'本日進站卡車數'}
 }}
};
books[4]={SheetNames:['Notes'],Sheets:{Notes:{}}};
books[5]={SheetNames:['Sheet1'],Sheets:{Sheet1:{B2:{v:'¥-ølbEóæ}ol'}}}};
const XLSX={read:buf=>books[new Uint8Array(buf)[4]]};
const session=new Map([
 ['port79_user_session',JSON.stringify({adminRole:'superadmin'})],
 ['port79_user_token','TEST']
]);
const host={
 document,location:{origin},sessionStorage:{getItem:k=>session.get(k)||null},XLSX,
 addEventListener(){},confirm(){return true}
};
class MockObserver{
 constructor(fn){this.fn=fn;MockObserver.current=this;}
 observe(){}disconnect(){if(MockObserver.current===this)MockObserver.current=null}
}
let onloadTrigger=0,vesselVerified=false,gateFails=false,yardFails=false;
Object.defineProperty(frame,'src',{
 configurable:true,
 get(){return this._src;},
 set(value){
  this._src=value;
  const path=new URL(value,origin).pathname;
  frame.contentWindow={location:{origin,pathname:path}};
  if(path.includes('/gate-import/')){
   const msg=element();msg.textContent='正在核對';
   frame.contentDocument={getElementById:id=>id==='gateMessage'?msg:null};
   frame.contentWindow.P79GateImport={chooseFile:async file=>{
    calls.push(['gate',file.name]);
    msg.textContent=gateFails?'Gate 雲端寫入失敗':'已寫入正式資料庫：新增 1 天';msg.dataset.kind=gateFails?'error':'success';
    MockObserver.current?.fn();
   }};
  }else if(path.includes('/yard-dashboard/')){
   const msg=element();
   frame.contentDocument={getElementById:id=>id==='yardStatus'?msg:null};
   frame.contentWindow.P79YardDashboard={importFile:async file=>{
    calls.push(['yard',file.name]);
    msg.textContent=yardFails?'Yard 資料儲存失敗':'已儲存於此瀏覽器';msg.dataset.tone=yardFails?'error':'success';
   }};
  }else if(path.includes('/aqc-efficiency/')){
   frame.contentDocument={getElementById:()=>null};
   frame.contentWindow.P79VesselHomeImport={importFiles:async files=>{
    assert.equal(await host.Port79HomeDropImport.confirmImport('匯入前檢查',frame.contentWindow),true,'validated workbook imports without another question');
    assert.equal(review.hidden,true,'manual approval controls stay hidden');
    assert.equal(await host.Port79HomeDropImport.confirmImport('untrusted',{}),false,'unrelated frame cannot auto-approve');
    calls.push(['vessel',files.map(f=>f.name).join(',')]);
    return {processed:files.length,success:files.length,failed:0,cloudConfirmed:vesselVerified,cloudIssue:vesselVerified?'':'雲端資料尚未讀回'};
   }};
  }
  queueMicrotask(()=>{onloadTrigger++;frame.onload?.();});
 }
});
vm.runInNewContext(js,{window:host,MutationObserver:MockObserver,setTimeout,clearTimeout,URL,console},{timeout:5000});
function file(name,marker){return {name,size:1000,arrayBuffer:async()=>Uint8Array.from([0x50,0x4b,3,4,marker]).buffer};}
(async()=>{
 await host.Port79HomeDropImport.start([file('yard.xlsx',1)]);
 assert.deepEqual(calls,[['vessel','yard.xlsx']],'contents, not filename, choose original vessel');
 assert.equal(status.dataset.tone,'pending','vessel parser result never fakes cloud confirmation');
 assert.equal(modal.open,true,'unverified vessel keeps window');
 vesselVerified=true;
 calls.length=0;
 await host.Port79HomeDropImport.start([
  file('tally.xlsx',1),file('yard.xlsx',2),file('gate.xlsx',3)
 ]);
 assert.deepEqual(calls,[['gate','gate.xlsx'],['yard','yard.xlsx'],['vessel','tally.xlsx']]);
 assert.equal(bar.style.width,'100%');
 assert.equal(modal.open,false,'mixed batch closes only once all are confirmed');
 assert.equal(onloadTrigger,4);
 calls.length=0;
 await host.Port79HomeDropImport.start([file('gate.xlsx',3)]);
 assert.equal(modal.open,false,'confirmed Gate closes');
 await host.Port79HomeDropImport.start([file('yard.xlsx',2)]);
 assert.equal(modal.open,false,'persisted Yard closes');
 await host.Port79HomeDropImport.start([file('ship.xlsx',1)]);
 assert.equal(modal.open,false,'readback-confirmed vessel closes');
 gateFails=true;await host.Port79HomeDropImport.start([file('gate.xlsx',3)]);
 assert.equal(modal.open,true,'failed Gate remains open');
 assert.equal(status.dataset.tone,'error');gateFails=false;
 yardFails=true;await host.Port79HomeDropImport.start([file('yard.xlsx',2)]);
 assert.equal(modal.open,true,'failed Yard remains open');
 assert.equal(status.dataset.tone,'error');yardFails=false;
 vesselVerified=false;await host.Port79HomeDropImport.start([file('ship.xlsx',1)]);
 assert.equal(modal.open,true,'cloud-unverified vessel remains open');
 assert.equal(status.dataset.tone,'pending');vesselVerified=true;
 calls.length=0;
 await host.Port79HomeDropImport.start([file('random.xlsx',4)]);
 assert.equal(calls.length,0,'unrecognized workbook must not enter any database');
 assert.equal(status.dataset.tone,'error');
 assert.match(status.textContent,/Excel 內容不符合/);
 calls.length=0;
 await host.Port79HomeDropImport.start([file('gate.xlsx',5)]);
 assert.equal(calls.length,0,'filename-only Gate workbook must be rejected');
 assert.match(status.textContent,/B2/);
 assert.doesNotMatch(status.textContent,/ølbEóæ/,'garbled cell values should not be shown');
 calls.length=0;
 const corrupt={name:'gate.xlsx',size:500,arrayBuffer:async()=>Uint8Array.from([0x1f,0x8b,0x08,0x00,0xaa]).buffer};
 await host.Port79HomeDropImport.start([corrupt]);
 assert.equal(calls.length,0,'misnamed binary file must not be dispatched to Gate');
 assert.match(status.textContent,/不是正常 Excel 活頁簿/);
 assert.equal(await host.Port79HomeDropImport.confirmImport('idle',frame.contentWindow),false,'inactive import cannot auto-approve');
 session.set('port79_user_session',JSON.stringify({adminRole:'employee'}));
 host.Port79HomeDropImport.refresh();
 assert.equal(root.hidden,true);
 const n=calls.length;
 zones.vessel.listeners.click();
 assert.equal(calls.length,n,'regular employee cannot trigger uploads');
 const vesselHtml=fs.readFileSync('aqc-efficiency/index.html','utf8'),at=vesselHtml.indexOf('async function p79HomeConfirmExcelImport('),end=vesselHtml.indexOf('\n}',at)+2;
 const nativeWindow={};nativeWindow.parent=nativeWindow;let permitted=true,asked=0;
 const nativeContext={window:nativeWindow,location:{search:''},URLSearchParams,console,requireSuperAdminAccess:()=>permitted,confirm:()=>{asked++;throw Error('native confirmation is forbidden');}};vm.createContext(nativeContext);vm.runInContext(vesselHtml.slice(at,end),nativeContext);
 assert.equal(await nativeContext.p79HomeConfirmExcelImport('valid report'),true);assert.equal(asked,0,'native file selection imports without prompting');permitted=false;assert.equal(await nativeContext.p79HomeConfirmExcelImport('unauthorized'),false,'direct import retains authorization checks');
 console.log('PASS: detect vessel/yard/gate by workbook contents, delegate to originals, avoid guessed cloud success, reject unknown');
})().catch(e=>{console.error(e);process.exitCode=1});

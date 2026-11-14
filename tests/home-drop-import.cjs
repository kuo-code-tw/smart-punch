'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('index.html','utf8');
const source=fs.readFileSync('assets/port79-home-drop-import.js','utf8');
const yard=fs.readFileSync('yard-dashboard/yard-dashboard.js','utf8');
const vessel=fs.readFileSync('aqc-efficiency/index.html','utf8');
new vm.Script(source);
assert.equal((html.match(/id="p79HomeDropImport"/g)||[]).length,1);
assert.equal((html.match(/data-p79-drop-kind="/g)||[]).length,3);
const names=['gate','yard','vessel'];
for(const name of names)assert(html.includes('data-p79-drop-kind="'+name+'"'));
assert(html.indexOf('id="cardHistory"')<html.indexOf('id="p79HomeDropImport"'));
assert.match(html,/port79-home-drop-import.js\?v=/);
assert.match(html,/port79-home-drop-import.css\?v=/);
assert.match(yard,/g\.P79YardDashboard=\{importFile,/);
assert.match(vessel,/window\.P79VesselHomeImport=\{/);
assert.match(vessel,/p79VesselHomeImportInitialized=true/,'embedded vessel import defers writes until startup hydration');
assert.match(vessel,/restoreVesselDataFromCloud\(false,true\)/,'import must read complete authoritative vessel data before change');
assert.match(vessel,/homeImport'\)==='1'/);
assert.match(source,/child\.P79GateImport\.chooseFile\(files\[0\]\)/);
assert.match(source,/child\.P79YardDashboard\.importFile\(files\[0\]\)/);
assert.match(source,/child\.P79VesselHomeImport\.importFiles\(files\)/);
assert(!source.includes('gateStatsImport'), 'homepage must not copy private Gate write logic');

function fakeElement(){
 const listeners={};
 return {
  listeners,dataset:{},textContent:'',hidden:false,value:'',open:false,
  classList:{add(){},remove(){}},contains(){return false;},
  addEventListener(name,fn){listeners[name]=fn;},
  showModal(){this.open=true;},close(){this.open=false;},
  querySelector(){return null;}
 };
}
const zones={};
for(const kind of names){
 const zone=fakeElement(),input=fakeElement();
 zone.dataset.p79DropKind=kind;
 zone.input=input;
 zone.querySelector=q=>q==='input[type=file]'?input:null;
 zones[kind]=zone;
}
const root=fakeElement(),dialog=fakeElement(),frame=fakeElement(),title=fakeElement(),status=fakeElement(),close=fakeElement();
root.querySelectorAll=()=>Object.values(zones);
const elements={
 p79HomeDropImport:root,p79HomeImportDialog:dialog,p79HomeImportFrame:frame,
 p79HomeImportTitle:title,p79HomeImportStatus:status,p79HomeImportClose:close
};
const document={
 getElementById:id=>elements[id]||null,
 addEventListener(){},
};
const token=new Map([
 ['port79_user_session',JSON.stringify({adminRole:'superadmin',empId:'FIXTURE'})],
 ['port79_user_token','test-token']
]);
const host={
 document,sessionStorage:{getItem:key=>token.get(key)||null},
 location:{origin:'https://port79.test'},
 addEventListener(){},confirm(){return true;}
};
class MockObserver{observe(){}disconnect(){}}
vm.runInNewContext(source,{window:host,MutationObserver:MockObserver});
assert.equal(root.hidden,false,'authorized superadmin sees all three drop zones');

function drag(kind,files){
 const evt={
  preventDefault(){},stopPropagation(){},
  dataTransfer:{files,types:['Files'],dropEffect:'none'},
  relatedTarget:null
 };
 zones[kind].listeners.drop(evt);
 assert.equal(dialog.open,true,'dropping a file opens the embedded importer');
}
const file=name=>({name,size:1000,arrayBuffer:async()=>new ArrayBuffer(2)});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 let seen=null;
 const gateMessage=fakeElement();
 gateMessage.textContent='正在核對';
 frame.contentDocument={getElementById:id=>id==='gateMessage'?gateMessage:null};
 frame.contentWindow={
  location:{origin:host.location.origin,pathname:'/smart-punch/gate-import/'},
  P79GateImport:{chooseFile:async file=>{seen=file;gateMessage.textContent='已寫入正式資料庫：新增 1 天';gateMessage.dataset.kind='success';}}
 };
 drag('gate',[file('gate.xlsx')]);
 assert.match(frame.src,/gate-import\/\?embed=1&homeImport=1/);
 frame.onload();await flush();
 assert.equal(seen.name,'gate.xlsx');
 frame.onload();await flush();assert.equal(seen.name,'gate.xlsx','duplicate load events must never rerun the same import');
 assert.match(status.textContent,/已寫入正式資料庫/);
 assert.equal(status.dataset.tone,'success');

 seen=null;
 const yardStatus=fakeElement();
 frame.contentDocument={getElementById:id=>id==='yardStatus'?yardStatus:null};
 frame.contentWindow={
  location:{origin:host.location.origin,pathname:'/smart-punch/yard-dashboard/'},
  P79YardDashboard:{importFile:async f=>{
   seen=f;yardStatus.textContent='已保存於此瀏覽器，尚未同步雲端';
   yardStatus.dataset.tone='success';
  }}
 };
 drag('yard',[file('yard.xlsx')]);
 assert.match(frame.src,/yard-dashboard\/\?embed=1&homeImport=1/);
 frame.onload();await flush();
 assert.equal(seen.name,'yard.xlsx');
 assert.match(status.textContent,/尚未同步雲端/);
 assert.equal(status.dataset.tone,'success');

 seen=null;
 frame.contentDocument={getElementById:()=>null};
 frame.contentWindow={
  location:{origin:host.location.origin,pathname:'/smart-punch/aqc-efficiency/'},
  P79VesselHomeImport:{importFiles:async files=>{seen=files;return {processed:2,success:2,failed:0};}}
 };
 drag('vessel',[file('ship1.xlsx'),file('ship2.xls')]);
 assert.match(frame.src,/aqc-efficiency\/\?homeImport=1/);
 frame.onload();await flush();
 assert.equal(seen.length,2);
 assert.match(status.textContent,/已處理 2 個檔案/);
 assert.match(status.textContent,/雲端同步狀態/);

 token.set('port79_user_session',JSON.stringify({adminRole:'employee'}));
 host.Port79HomeDropImport.refresh();
 assert.equal(root.hidden,true,'regular employees must not see import zones');
 const prior=frame.src;
 zones.gate.listeners.drop({preventDefault(){},stopPropagation(){},
  dataTransfer:{files:[file('other.xlsx')]}});
 assert.equal(frame.src,prior,'unauthorized drops never dispatch files to importer');
 console.log('PASS homepage real drag events reach existing Gate/Yard/Vessel importers; old cloud rules reused and employee access blocked');
})().catch(error=>{console.error(error);process.exitCode=1;});

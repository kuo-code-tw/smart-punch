'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('index.html','utf8');
const source=fs.readFileSync('assets/port79-home-drop-import.js','utf8');
const css=fs.readFileSync('assets/port79-home-drop-import.css','utf8');
const vessel=fs.readFileSync('aqc-efficiency/index.html','utf8');
const gate=fs.readFileSync('gate-import/index.html','utf8');
const yard=fs.readFileSync('yard-dashboard/index.html','utf8');
new vm.Script(source);

const area=html.slice(html.indexOf('id="p79HomeDropImport"'),html.indexOf('id="p79AllBackupPanel"'));
assert.equal((area.match(/data-p79-drop-kind=/g)||[]).length,3,'three original system links');
assert(area.includes('前往匯入')&&!area.includes('拖曳匯入'),'homepage is only a gateway');
assert(!area.includes('type="file"'),'homepage cannot select or process Excel');
assert(!html.includes('id="p79HomeImportDialog"'),'duplicate modal removed');
assert(!html.includes('id="p79HomeImportFrame"'),'hidden importer iframe removed');
assert(!css.includes('#p79HomeImportDialog'),'unused modal styles removed');
assert(html.indexOf('id="p79HomeDropImport"')<html.indexOf('id="p79AllBackupPanel"'));
assert(html.indexOf('id="p79AllBackupPanel"')<html.indexOf('id="p79Dashboard"'));
assert(html.includes('port79-home-drop-import.js?v=20261115-original-import-nav-v6'));
assert(html.includes('port79-home-drop-import.css?v=20261115-original-import-nav-v6'));

assert(gate.includes('id="gateFile"'),'original Gate importer unchanged');
assert(yard.includes('id="yardFile"'),'original Yard importer unchanged');
assert(vessel.includes('id="excelImport"'),'original Vessel importer unchanged');
assert(vessel.includes('function importExcelFiles(fileList){'),'original Vessel import method unchanged');
assert(!source.includes('P79VesselHomeImport'),'homepage cannot call vessel parser');
assert(!source.includes('arrayBuffer'),'homepage cannot read files');
assert(!source.includes('iframe'),'homepage cannot spin up a hidden parser');
assert(!source.includes('fetch('),'homepage cannot write to cloud');

function element(){
 return {dataset:{},listeners:{},hidden:false,
   addEventListener(key,cb){this.listeners[key]=cb;},
   querySelectorAll(){return[]}
 };
}
const root=element(),zones={};
for(const kind of ['gate','yard','vessel']){
 zones[kind]=element();
 zones[kind].dataset.p79DropKind=kind;
}
root.querySelectorAll=()=>Object.values(zones);
const storage=new Map([
 ['port79_user_session',JSON.stringify({adminRole:'superadmin',punchOnly:false})],
 ['port79_user_token','TEST']
]);
const launches=[],urls=[];
const host={
 document:{getElementById:id=>id==='p79HomeDropImport'?root:null},
 sessionStorage:{getItem:k=>storage.get(k)||null},
 launchSystem:key=>launches.push(key),
 p79NavigateWhileBackingUp:path=>urls.push(path),
 location:{assign:path=>urls.push(path)}
};
vm.runInNewContext(source,{window:host},{timeout:3000});
assert.equal(root.hidden,false,'superadmin sees navigation entries');
zones.gate.listeners.click();assert.deepEqual(urls,['./gate-import/'],'Gate goes to original Gate importer');
zones.yard.listeners.click();zones.vessel.listeners.click();
assert.deepEqual(launches,['yard','efficiency'],'Yard and Vessel use original SSO-aware homepage navigation');

let blocked=false;
zones.vessel.listeners.keydown({key:'Enter',preventDefault(){blocked=true;}});
assert(blocked&&launches.at(-1)==='efficiency','keyboard navigates to original system');
let dropBlocked=false;
zones.gate.listeners.drop({preventDefault(){dropBlocked=true;},stopPropagation(){}});
assert(dropBlocked,'accidental file drops never open local Excel in browser');
assert.equal(urls.at(-1),'./gate-import/','drop moves to the original importer, not a hidden copy');

storage.set('port79_user_session',JSON.stringify({adminRole:'employee'}));
host.Port79HomeDropImport.refresh();
assert.equal(root.hidden,true,'employee cannot access home import entries');
const prev=launches.length;
zones.vessel.listeners.click();
assert.equal(launches.length,prev,'non-admin navigation is blocked');
console.log('PASS: homepage routes to native importers only; no Excel handling or duplicate modal');

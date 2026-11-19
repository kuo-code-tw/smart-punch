'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const versions=require('../assets/port79-vessel-versions.js');
function fn(name){const i=html.indexOf('function '+name+'(');assert(i>=0,name);const j=html.indexOf('\n}',i);assert(j>i,name);return html.slice(i,j+2);}
const old={
 workingNo:'5290042',sourceWorkingNo:'5290042',vessel:'WAN HAI 290',
 voyageI:'N085',voyageE:'N085',wharf:'79R',
 firstDate:'2026-06-10',lastDate:'2026-06-10',compareDate:'2026-06-10',
 totalContainers:471,totalMoves:473,hatches:6,shiftMoves:2,
 workingSheetImportedAt:'2026-11-19T04:00:00Z',
 workingSheetSource:{sourceWorkingNo:'5290042',importedAt:'2026-11-19T04:00:00Z',reportRecordIds:['old1']}
};
const corrected={
 ...old,workingNo:'5260042',sourceWorkingNo:'5290042',
 workingSheetImportedAt:'2026-11-19T05:27:00Z',
 workingSheetSource:{sourceWorkingNo:'5290042',importedAt:'2026-11-19T05:27:00Z',reportRecordIds:['new1','new2']}
};
const c={
 num:x=>Number(x)||0,normalizeShipText:x=>String(x||'').trim().toUpperCase(),
 normalizeMonthlySerial:x=>String(x||'').replace(/^\d{3}/,'').replace(/-.*/,''),Map,Set,Number,Date,String,
 shipMasters:[old,corrected],shipMasterQuality:()=>100,mergeShipMasterOne:(a,b)=>({...a,...b}),
 workingNoSortParts:x=>({base:Number(String(x||'').replace(/\D/g,'')),suffix:0})
};
vm.createContext(c);
for(const name of ['sameShipMasterJob','originalNumericWorkingNo','importSourceWorkingNo','vesselImportCallNumber',
 'sameVerifiedCorrectedShipJob','sameShipMasterJobWithSerialGuard','chooseLatestShipMaster','dedupeShipMasters'])
 vm.runInContext(fn(name),c);
assert(c.sameVerifiedCorrectedShipJob(old,corrected),'explicit original number links corrected import');
assert.equal(c.sameShipMasterJobWithSerialGuard(old,corrected),true);
const master=c.dedupeShipMasters([old,corrected]);
assert.equal(master.length,1);
assert.equal(master[0].workingNo,'5260042');
assert.equal(master[0].sourceWorkingNo,'5290042');
for(const pair of [[old,corrected],[corrected,old]]){
 const result=versions.collapse(pair);
 assert.equal(result.rows.length,1);
 assert.equal(result.rows[0].workingNo,'5260042');
 assert.deepEqual(result.excludedWorkingNos,['5290042']);
}
for(const different of [
 {...corrected,sourceWorkingNo:'5260042'},
 {...corrected,wharf:'80R'},
 {...corrected,voyageI:'N086',voyageE:'N086'},
 {...corrected,firstDate:'2026-06-11',lastDate:'2026-06-11',compareDate:'2026-06-11'},
 {...corrected,workingNo:'5260042-CALL2',sourceFileName:'WAN HAI 290 第二靠.xlsx'},
 {...corrected,vessel:'WAN HAI 291'}
]){
 assert.equal(c.sameVerifiedCorrectedShipJob(old,different),false,'independent work must not be treated as a correction');
 assert.equal(versions.collapse([old,different]).rows.length,2,'independent visit remains visible');
}
const missingTime={...old,workingSheetImportedAt:'',workingSheetSource:{}};
assert.equal(versions.collapse([missingTime,corrected]).rows.length,1,'untimed original with same quantities is a duplicate');
const modified={...corrected,totalContainers:470,totalMoves:472};
assert.equal(versions.collapse([old,modified]).rows.length,1,'timestamped correction may legitimately revise quantity');
assert.match(html,/sourceWorkingNo:String\(s\.sourceWorkingNo\|\|s\.workingSheetSource\?\.sourceWorkingNo\|\|s\.workingNo/,'dashboard must retain original lineage');
for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
 if(script[1].trim())new vm.Script(script[1]);
}
console.log('PASS screenshot WAN HAI 290: 5290042 replaced by 5260042, new and cloud rows unified, independent calls protected');

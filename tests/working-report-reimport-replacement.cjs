const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8'),a=html.indexOf('function mergeCloudRecordsWithLocal('),code=html.slice(a,html.indexOf('\n}',a)+2);
const stamp='2026-10-19T06:00:00Z';
const c={Map,Set,Array,String,Object,Date,num:x=>Number(x)||0,recordIdentityKey:r=>r.id,shipMasters:[{workingNo:'SHIP1',workingSheetSource:{importedAt:stamp,reportRecordIds:['new1','new2']}}]};
vm.createContext(c);vm.runInContext(code,c);
const local=[{id:'new1',workingNo:'SHIP1',workingSheetImportedAt:stamp,source:'working-report',workingSheetRuleVersion:'SHIFT_X2',disc:381,load:0},{id:'new2',workingNo:'SHIP1',workingSheetImportedAt:stamp,source:'working-report',workingSheetRuleVersion:'SHIFT_X2',disc:0,load:390}];
const remote=[{id:'old-extra',workingNo:'SHIP1',disc:102},{id:'new1',workingNo:'SHIP1',disc:400},{id:'other',workingNo:'SHIP2',disc:100},{id:'child',workingNo:'SHIP1-1',disc:20}];
const out=c.mergeCloudRecordsWithLocal(remote,local);
assert(!out.some(r=>r.id==='old-extra'));assert(out.some(r=>r.id==='other'));assert(out.some(r=>r.id==='child'));
assert.equal(out.filter(r=>r.workingNo==='SHIP1').reduce((n,r)=>n+(r.disc||0)+(r.load||0),0),771);
assert(c.mergeCloudRecordsWithLocal(remote,local.slice(0,1)).some(r=>r.id==='old-extra'),'partial local data cannot delete cloud history');
const newer=remote.map(r=>r.id==='old-extra'?{...r,workingSheetImportedAt:'2026-10-20T00:00:00Z'}:r);
assert(c.mergeCloudRecordsWithLocal(newer,local).some(r=>r.id==='old-extra'),'newer remote batch is protected');
delete c.shipMasters[0].workingSheetSource.reportRecordIds;assert(c.mergeCloudRecordsWithLocal(remote,local).some(r=>r.id==='old-extra'),'legacy records without a replacement manifest retained');
console.log('PASS complete reimport replaces exact job, preserves other jobs and child jobs, partial snapshots and newer cloud imports');

// 另一台裝置以新雲端完整批次取代舊本機，不能把舊列補回、再上傳。
c.shipMasters[0].workingSheetSource.reportRecordIds=['new1','new2'];
const otherDevice=c.mergeCloudRecordsWithLocal(local,remote);
assert(!otherDevice.some(r=>r.id==='old-extra'));
assert.equal(otherDevice.filter(r=>r.workingNo==='SHIP1').reduce((n,r)=>n+(r.disc||0)+(r.load||0),0),771);
assert(otherDevice.some(r=>r.id==='other'));assert(otherDevice.some(r=>r.id==='child'));
assert(c.mergeCloudRecordsWithLocal(local.slice(0,1),remote).some(r=>r.id==='old-extra'),'partial cloud snapshot cannot discard local rows');
const savedMasters=c.shipMasters;c.shipMasters=[];
assert(!c.mergeCloudRecordsWithLocal(local,remote,savedMasters).some(r=>r.id==='old-extra'),'pre-upload merge uses fetched manifest even if local master is stale');
console.log('PASS second-device cloud replacement, partial cloud preservation and remote manifest during upload');

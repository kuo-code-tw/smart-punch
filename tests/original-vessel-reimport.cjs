const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
function extract(name){const a=html.indexOf('function '+name+'(');const b=html.indexOf('\n}',a);assert(a>=0&&b>a);return html.slice(a,b+2)}
const c={shipMasters:[],num:x=>Number(x)||0,normalizeShipText:x=>String(x||'').trim().toUpperCase()};vm.createContext(c);
for(const n of ['originalNumericWorkingNo','importSourceWorkingNo','sameShipMasterJob','vesselImportCallNumber','sameOriginalImportJob','resolveImportWorkingNo'])vm.runInContext(extract(n),c);
const old={workingNo:'5260196-3',sourceWorkingNo:'5260196',vessel:'WAN HAI 105',voyageI:'A',wharf:'79',firstDate:'2026-10-28',lastDate:'2026-10-28',totalContainers:488};
c.shipMasters=[old];
const next={...old,workingNo:'5260196-4',sourceWorkingNo:'5260196-4',totalContainers:299};
assert.equal(c.resolveImportWorkingNo(next,[{workDate:'2026-10-28'}]).effectiveNo,'5260196');
assert.equal(c.originalNumericWorkingNo('5260196-3'),'5260196');assert.equal(c.originalNumericWorkingNo('JOB-3'),'JOB-3');
assert.throws(()=>c.resolveImportWorkingNo({...next,vessel:'OTHER'},[{workDate:'2026-10-28'}]),/未覆寫/);
assert.equal(old.totalContainers,488,'resolution never mutates stored data');
for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(script[1].trim())new vm.Script(script[1]);
console.log('PASS original numeric vessel id, updated quantities reuse job, unrelated jobs protected, inline syntax');

const versions=require('../assets/port79-vessel-versions.js');
const revisionA={...old,totalMoves:488,hatches:2,shiftMoves:0,workingSheetImportedAt:'2026-10-29T01:55:00Z',workingSheetSource:{reportRecordIds:['a','b']}};
const revisionB={...revisionA,workingNo:'5260196-4',totalContainers:299,totalMoves:299,workingSheetImportedAt:'2026-10-29T01:58:00Z',workingSheetSource:{reportRecordIds:['c']}};
assert.equal(versions.collapse([revisionA,revisionB]).rows.length,1);
assert.equal(versions.collapse([revisionA,revisionB]).rows[0].totalContainers,299,'latest import wins, not largest detail count');
assert.equal(versions.collapse([revisionA,{...revisionB,voyageI:'OTHER'}]).rows.length,2,'different voyage remains separate');

// The customer's second-call filename is a separate operation, even when
// the original working number, vessel and outbound voyage are reused.
c.shipMasters=[{...old,workingNo:'5260196',voyageE:'S466',sourceFileName:'WAN HAI 105 S466 Working Sheet.xlsx'}];
const second={...next,workingNo:'5260196',sourceWorkingNo:'5260196',voyageE:'S466'};
const secondFile='WAN HAI 105 S466 (第二靠) Working Sheet.xlsx';
const secondResult=c.resolveImportWorkingNo(second,[{workDate:'2026-10-28'}],secondFile);
assert.equal(secondResult.effectiveNo,'5260196-CALL2');
const secondMaster={...second,workingNo:secondResult.effectiveNo,sourceWorkingNo:'5260196',sourceFileName:secondFile,firstDate:'2026-10-28',lastDate:'2026-10-28'};
c.shipMasters.push(secondMaster);
assert.equal(c.resolveImportWorkingNo({...second,totalContainers:310},[{workDate:'2026-10-28'}],secondFile).effectiveNo,'5260196-CALL2','repeat second call keeps the same key');
assert.equal(c.sameOriginalImportJob(c.shipMasters[0],secondMaster),false,'first call cannot be deleted by second-call replacement');
assert.equal(versions.callNumber(secondMaster),2);
assert.equal(versions.collapse([{...revisionA,sourceFileName:'第一靠.xlsx'},{...revisionB,workingNo:'5260196-CALL2',sourceFileName:secondFile}]).rows.length,2,'two calls are not collapsed as revisions');
assert.equal(c.originalNumericWorkingNo(secondMaster.workingNo),'5260196','original number remains available');
console.log('PASS second-call import, repeat key stability, first-call preservation and cross-dashboard isolation');

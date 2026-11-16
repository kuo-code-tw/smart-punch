'use strict';
function once(s,a,b){if(s.split(a).length!==2)throw Error('Patch anchor mismatch: '+a.slice(0,70));return s.replace(a,b);}
function section(s,name){const a=s.indexOf('function '+name+'('),b=s.indexOf('\nfunction ',a+12);if(a<0||b<0)throw Error('Function boundary missing '+name);return [a,b,s.slice(a,b)];}
module.exports=function patch(source,helper){
 if(source.includes('var p79VesselWriteLockV122_='))throw Error('V122 already installed');
 let [a,b,body]=section(source,'gcGetDataSafe_');source=source.slice(0,a)+'function gcGetDataSafe_(ss, options) { return p79VesselGetStableData_(ss,options||{}); }\n'+source.slice(b);
 [a,b,body]=section(source,'port79DoPostCore_');
 body=once(body,'  let directOvertimeRevisionFinalized = false;','  let directOvertimeRevisionFinalized = false;\n  let vesselFenceStartedV122=false;');
 body=once(body,'    if (isEmployeeMasterWrite) {',`    const vesselWriteV122=/^gc(?:Upsert|Delete|Assign|Sync)/.test(action)||action==='migrateVesselToDrive';
    if(vesselWriteV122){
      p79VesselWriteLockV122_=LockService.getUserLock();
      if(!p79VesselWriteLockV122_.tryLock(5000)){p79VesselWriteLockV122_=null;return jsonOutput({ok:false,retryable:true,rejectedBeforeWrite:true,retryAfterMs:1500,error:'船舶資料正在寫入資料，請稍後自動重試'});}
      acquiredDataWriteLock=true;
    } else if (isEmployeeMasterWrite) {`);
 body=once(body,'    if (monthlyRolloverDependentActions.includes(action)) {',`    if(vesselWriteV122||monthlyRolloverDependentActions.includes(action)){
      if(!p79VesselWriteLockV122_){p79VesselWriteLockV122_=LockService.getUserLock();if(!p79VesselWriteLockV122_.tryLock(5000)){p79VesselWriteLockV122_=null;return jsonOutput({ok:false,retryable:true,rejectedBeforeWrite:true,error:'船舶資料正在寫入資料，請稍後自動重試'});}}
      p79VesselBeginWrite_();vesselFenceStartedV122=true;
    }
    if (monthlyRolloverDependentActions.includes(action)) {`);
 const tail=body.lastIndexOf('    if (employeeLock) {');if(tail<0)throw Error('missing final release');body=body.slice(0,tail)+`    try{if(vesselFenceStartedV122)p79VesselEndWrite_();}
    finally{
      if(p79VesselWriteLockV122_){try{p79VesselWriteLockV122_.releaseLock();}finally{p79VesselWriteLockV122_=null;}}
`+body.slice(tail);const end=body.lastIndexOf('\n  }\n}');if(end<0)throw Error('missing final boundary');body=body.slice(0,end)+'\n    }'+body.slice(end);source=source.slice(0,a)+body+source.slice(b);
 [a,b,body]=section(source,'p79GcOpenYearSpreadsheetV58_');
 body=once(body,'  const createLock = LockService.getUserLock();\n  if (!createLock.tryLock(8000)) {','  const createLock = p79VesselWriteLockV122_ || LockService.getUserLock();\n  const ownsCreateLockV122=!p79VesselWriteLockV122_;\n  if (ownsCreateLockV122 && !createLock.tryLock(8000)) {');
 body=once(body,'try { createLock.releaseLock(); } catch (ignore) {}','try { if(ownsCreateLockV122)createLock.releaseLock(); } catch (ignore) {}');
 source=source.slice(0,a)+body+source.slice(b);source=once(source,'function forceTrimGcWorkDetailsByRawDateColumn(', 'function p79ForceTrimGcWorkDetailsCoreV122_(');
 source=once(source,'function migrateGcLegacyToDrive_(', 'function p79MigrateGcLegacyCoreV122_(');
 source=once(source,"jsonOutput(p79HistoryBackupRequest_(parsedData))","jsonOutput(p79VesselGuardBackup_(parsedData))");
 return source+'\n'+helper;
};
if(require.main===module){const fs=require('fs');const updated=module.exports(fs.readFileSync(process.argv[2],'utf8'),fs.readFileSync('backend/vessel-read-write-lane.gs','utf8'));new(require('vm').Script)(updated);fs.writeFileSync(process.argv[3],updated);}

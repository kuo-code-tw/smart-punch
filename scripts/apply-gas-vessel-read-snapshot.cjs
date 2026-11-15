'use strict';
const fs=require('fs'),path=require('path');
function apply(source){
 if(source.includes('function p79VesselSnapshotKey_('))throw Error('Vessel snapshot cache already installed');
 const once=(a,b)=>{if(source.split(a).length!==2)throw Error('Unexpected live anchor');source=source.replace(a,b);};
 once("if (action === 'gcGetData') {\n      const ss = getSpreadsheet_(true);\n      gcRequireSystemPermission_(ss, params.gcToken || params.token || '', 'efficiency', 'view');\n      port79AutoMonthlyRollover_(false);", "if (action === 'gcGetData') {\n      const ss = getSpreadsheet_(true);\n      gcRequireSystemPermission_(ss, params.gcToken || params.token || '', 'efficiency', 'view');\n      // Readback must not trigger unrelated attendance/schedule/monthly migrations.");
 once('function gcGetDataSafe_(ss, options) {\n  const lock = LockService.getScriptLock();', 'function gcGetDataSafe_(ss, options) {\n  const snapshotKey = p79VesselSnapshotKey_(options);\n  const snapshot = p79VesselSnapshotRead_(snapshotKey);\n  if (snapshot) return snapshot;\n  const lock = LockService.getScriptLock();');
 once('    return gcGetData_(ss, options || {});','    const result = gcGetData_(ss, options || {});\n    p79VesselSnapshotStore_(snapshotKey, result);\n    return result;');
 return source+'\n'+fs.readFileSync(path.join(__dirname,'../backend/vessel-read-snapshot-cache.gs'),'utf8');
}
module.exports={apply};

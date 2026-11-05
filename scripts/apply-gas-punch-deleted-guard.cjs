'use strict';
const fs=require('fs');
function once(s,a,b){if(s.split(a).length!==2)throw Error('Unexpected source fragment: '+a.slice(0,90));return s.replace(a,b);}
function apply(source){
 let s=once(source,"const API_VERSION = '2026.11.05.V99-PUNCH-READ-IO';","const API_VERSION = '2026.11.05.V100-PUNCH-DELETED-GUARD';");
 s=once(s,'      if (p79RepairStalePunchGuard_(ss, record, state)) state = p79ReadPunchGuardState_(record) || state;','      if (p79RepairStalePunchGuard_(ss, record, state)) {\n        state = p79ReadPunchGuardState_(record);\n        if (!state) return {ok:true,deletedGuardCleared:true};\n      }');
 const start=s.indexOf('function p79RepairStalePunchGuard_('),end=s.indexOf('\nfunction ',start+10);if(start<0||end<0)throw Error('repair missing');
 let f=s.slice(start,end);
 f=once(f,'  const channel=p79PunchGuardChannel_(record.status);\n  let latest=null, latestTime=guardTime, ambiguous=false;','  const channel=p79PunchGuardChannel_(record.status);\n  const stateDeleted=!!deleted[normalizeId_(state&&state.id)];\n  let latest=null, latestTime=stateDeleted ? -Infinity : guardTime, ambiguous=false;');
 f=once(f,'      readRecords_(sheet).forEach(function(item) {','      let rows=readRecords_(sheet);\n      if(stateDeleted && sheet===main)rows=p79MergeProtectedPunchOriginals_(sheet,rows,null,deleted);\n      rows.forEach(function(item) {');
 f=once(f,'        if (!Number.isFinite(at) || at<=guardTime) return;','        if (!Number.isFinite(at) || (!stateDeleted && at<=guardTime)) return;');
 f=once(f,'  if (!latest || latestTime>incomingTime || ambiguous || p79PunchGuardStatusType_(latest.status)===state.type) return false;','  if (latestTime>incomingTime || ambiguous || (!stateDeleted && (!latest || p79PunchGuardStatusType_(latest.status)===state.type))) return false;');
 f=once(f,'  p79WritePunchGuardState_(Object.assign({},latest,{attNo:record.attNo,empId:record.empId}));','  if(latest){\n    p79WritePunchGuardState_(Object.assign({},latest,{attNo:record.attNo,empId:record.empId}));\n  }else{\n    if(!stateDeleted)return false;\n    const key=p79PunchGuardKey_(record);\n    PropertiesService.getScriptProperties().deleteProperty(key);\n    CacheService.getScriptCache().remove(key);\n  }');
 return s.slice(0,start)+f+s.slice(end);
}
module.exports={apply};if(require.main===module){const [input,output]=process.argv.slice(2);fs.writeFileSync(output,apply(fs.readFileSync(input,'utf8')));}

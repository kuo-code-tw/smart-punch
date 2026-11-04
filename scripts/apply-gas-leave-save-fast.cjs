'use strict';
const fs=require('node:fs'),path=require('node:path');
function once(source,before,after){const at=source.indexOf(before);if(at<0||source.indexOf(before,at+before.length)>=0)throw Error('Expected one production fragment: '+before.slice(0,90));return source.slice(0,at)+after+source.slice(at+before.length);}
function apply(source,cover=fs.readFileSync(path.join(__dirname,'../backend/leave-cover-fast-save.gs'),'utf8')){
 if(source.includes('20261104-leave-overtime-fast-v1'))throw Error('Patch already applied');
 let out=once(source,"const API_VERSION = '2026.10.31.V72-MY-ROSTER-SELF-ONLY';","const API_VERSION = '2026.11.04.V95-LEAVE-OVERTIME-FAST';");
 out=once(out,"  let scheduleSaveUnchanged = false;", "  let scheduleSaveUnchanged = false;\n  let directOvertimeRevisionFinalized = false;");
 out=once(out,"    const ss = scheduleLockAction ? null : getSpreadsheet_(fastAuthAction || fastScheduleMonthSave ||", "    const fastLeaveWrite = ['addLeave','addLeaveRecord','saveLeaveCoverAssignment'].includes(action);\n    const ss = scheduleLockAction ? null : getSpreadsheet_(fastAuthAction || fastScheduleMonthSave || fastLeaveWrite ||");
 out=once(out,"      case 'saveOvertimeReportDirect':\n        return jsonOutput(p79SaveDirectOvertimeReport_(ss,data));", "      case 'saveOvertimeReportDirect': {\n        const saved=p79SaveDirectOvertimeReport_(ss,data);\n        // Finalize the revision before serializing the ACK, while holding ScriptLock.\n        if(saved.ok===true){\n          const revision=touchScheduleSyncRevision_();\n          saved.revision=[revision,getLeaveSyncRevision_(),getEmployeeAuthRevision_(),String(data.date).slice(0,7)].join(':');\n          saved.backendSavePipeline='20261104-leave-overtime-fast-v1';\n          directOvertimeRevisionFinalized=true;\n        }\n        return jsonOutput(saved);\n      }");
 const release="    if (employeeLock) {\n      try {\n        employeeLock.releaseLock();\n      } catch (ignore) {}\n    }\n    if (lock) {\n      try {\n        lock.releaseLock();\n      } catch (ignore) {}\n    }";
 out=once(out,release,'    // Revision publication remains inside the write lock.');
 out=once(out,"if (action && p79IsScheduleMutationAction_(action) && !scheduleSaveUnchanged)","if (action && p79IsScheduleMutationAction_(action) && !scheduleSaveUnchanged && !directOvertimeRevisionFinalized)");
 const routerStart=out.indexOf('function port79DoPostCore_('),routerEnd=out.indexOf('\nfunction parsePostData_',routerStart);
 if(routerStart<0||routerEnd<0)throw Error('Cannot locate production router boundary');
 const router=out.slice(routerStart,routerEnd),last=router.lastIndexOf('\n  }\n}');
 if(last<0)throw Error('Cannot locate finally boundary');
 out=out.slice(0,routerStart)+router.slice(0,last)+'\n'+release+router.slice(last)+out.slice(routerEnd);
 const start=out.indexOf('function p79SaveLeaveCoverAssignment_('),end=out.indexOf('\nfunction ',start+9);
 if(start<0||end<0)throw Error('Cannot locate cover function');
 const replacement=cover.slice(cover.indexOf('function p79SaveLeaveCoverAssignment_(')).trimEnd();
 out=out.slice(0,start)+replacement+'\n'+out.slice(end);
 return out;
}
module.exports={apply};
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node apply-gas-leave-save-fast.cjs INPUT.gs OUTPUT.gs');const source=fs.readFileSync(input,'utf8');fs.writeFileSync(output,apply(source));}

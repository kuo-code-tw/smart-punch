// Targeted V67 patcher. Never deploys; refuses unknown source anchors.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function patch(source){
 const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
 source=source.replace(/\r\n/g,'\n');
 if(source.includes('function p79ConfirmAttendanceDayAndReconcile_('))throw Error('Already patched; use the current source instead of applying twice');
 const one=(a,b)=>{if(source.split(a).length!==2)throw Error('Unsupported GAS source: '+a.slice(0,80));source=source.replace(a,b);};
 one("      case 'saveOvertimeReportDirect':", "      case 'confirmAttendanceDayAndReconcile':\n        return jsonOutput(p79ConfirmAttendanceDayAndReconcile_(ss,data));\n      case 'saveOvertimeReportDirect':");
 one('function p79FilterScheduleSnapshot_(ss,session,record){',`function p79FilterScheduleSnapshot_(ss,session,record){\n  record=Object.assign({},record,{plannedRestAttendanceVersion:1,plannedRestAttendanceCanConfirm:!!session&&['attendance','schedule','workhours'].every(function(key){return String((session.systemPermissions||{})[key]||'').toLowerCase()==='manage';})});`);
 one(" const original=old.reportOriginalShift??old.overtimeOriginalShift??schedule[date]??'';"," const original=old.reportOriginalShift??old.overtimeOriginalShift??schedule[date]??'';\n const plannedRestOriginalCategory=old.plannedRestOriginalCategory||(['例','休','國','颱'].includes(String(original).trim())?(['例','休','國','颱'].includes(old.restCategory)?old.restCategory:String(original).trim()):'');");
 one(" delete value.overtimeExcluded;delete value.overtimeDeletedAt;"," if(planned&&plannedRestOriginalCategory)value.plannedRestOriginalCategory=plannedRestOriginalCategory;\n delete value.overtimeExcluded;delete value.overtimeDeletedAt;");
 one("    if(P79_OT_HISTORY_ACTION_==='deleteOvertimeAssignment'", "    if(P79_OT_HISTORY_ACTION_==='confirmAttendanceDayAndReconcile')event.reason='正式考勤確認完成，原休假日預排加班無出勤，自動取消並恢復原假別';\n    if(P79_OT_HISTORY_ACTION_==='deleteOvertimeAssignment'");
 source=source.replace("    'saveOvertimeReportDirect','syncSchedules'","    'confirmAttendanceDayAndReconcile','saveOvertimeReportDirect','syncSchedules'");
 const modules=['attendance/v6-engine.js','assets/port79-rest-attendance.js','assets/port79-planned-rest-reconciliation.js'];
 source+='\n/* V67 shared attendance and holiday-plan rules; bundled from tested frontend sources. */\nvar P79_PLANNED_REST_SHARED_={};\n(function(window){\n'+modules.map(read).join('\n')+'\n})(P79_PLANNED_REST_SHARED_);\n'+read('backend/planned-rest-attendance.gs');
 source=source.replace(/const API_VERSION = '[^']+';/,"const API_VERSION = '2026.10.30.V67-PLANNED-REST-ATTENDANCE-CONFIRM';");
 new vm.Script(source);return source;
}
module.exports=patch;
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/apply-gas-planned-rest.cjs LIVE_Code.gs PATCHED_Code.gs');fs.writeFileSync(output,patch(fs.readFileSync(input,'utf8')));console.log('V67 source patched and syntax checked. Deployment is a separate step.');}

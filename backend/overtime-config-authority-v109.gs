// Saved overtime configuration is the only source for new filings.
function p79ConfiguredOvertimeRowsV109_(config){
 var rows=config.overtimeConversionRowsV1;
 if(!Array.isArray(rows))return [];
 var labels={休:'休息日加班',國:'國定假日加班',例:'例假加班',代:'休假代班加班',延:'平日延時加班'};
 var canonical=function(n){return n==='代班加班'?'休假代班加班':n==='平日延長加班'?'平日延時加班':String(n||'');};
 var builtin=function(n){return Object.values(labels).includes(canonical(n));};
 var name=function(r){return r[9]&&!builtin(r[9])?String(r[9]):labels[r[0]];};
 var deleted=new Set((config.overtimeDeletedBuiltinTypesV1||[]).map(canonical));
 var allowed=new Set((config.overtimeReportTypesV1||[]).map(function(t){return canonical(t[0]);}));
 if(!Object.prototype.hasOwnProperty.call(config,'overtimeArchivedRuleKeysV1'))rows.forEach(function(r){if(Array.isArray(r)&&builtin(name(r))&&!deleted.has(name(r)))allowed.add(name(r));});
 var archived=new Set(config.overtimeArchivedRuleKeysV1||[]),hidden=new Set(config.overtimeManagerHiddenRuleKeysV1||[]);
 return rows.filter(function(r){if(!Array.isArray(r))return false;var key=(r[9]?'named:'+r[9]:'builtin:'+labels[r[0]])+'|'+r[1];return allowed.has(name(r))&&!archived.has(key)&&!hidden.has(key);});
}
function p79V109VerifyConfiguredRules(){
 var row=['延','延16-20',4,'','08','16','16','20','after'];
 var config={overtimeConversionRowsV1:[row],overtimeReportTypesV1:[['平日延時加班','延']],overtimeArchivedRuleKeysV1:[]};
 if(p79ConfiguredOvertimeRowsV109_(config).length!==1)throw Error('已設定時段未開放');
 config.overtimeReportTypesV1=[];
 if(p79ConfiguredOvertimeRowsV109_(config).length)throw Error('已刪類型仍開放');
 config.overtimeReportTypesV1=[['平日延時加班','延']];config.overtimeArchivedRuleKeysV1=['builtin:平日延時加班|延16-20'];
 if(p79ConfiguredOvertimeRowsV109_(config).length)throw Error('已封存時段仍開放');
 if(p79DirectResolvedRule_(row)[3]!=='')throw Error('未設定換算被自行補值');
 Logger.log('V109_CONFIG_AUTHORITY PASS configured/deleted/archived/no-invented-conversion; productionWrites=0');
}

'use strict';const fs=require('fs'),path=require('path');
function once(s,a,b){if(s.split(a).length!==2)throw Error('Unexpected production anchor: '+a.slice(0,80));return s.replace(a,b);}
function apply(source){
 if(source.includes('function p79OrgOptionsSave_('))throw Error('Organization fast lane already installed');
 let s=once(source,"  if(action==='getGpsConfig')", "  if(action==='hrGetOrgOptions'){try{return jsonOutput(p79OrgOptionsRead_(params));}catch(error){return jsonOutput({ok:false,error:String(error.message||error),code:error.code||'',retryable:error.retryable===true});}}\n  if(action==='getGpsConfig')");
 s=once(s,"  if(action==='gateStatsImport')", "  if(action==='hrSaveOrgOptions'){try{return jsonOutput(p79OrgOptionsSave_(parsedData));}catch(error){return jsonOutput({ok:false,error:String(error.message||error),code:error.code||'',retryable:error.retryable===true});}}\n  if(action==='gateStatsImport')");
 s=once(s,'function syncConfig_(data) { return p79GpsSaveConfig_(data); }','function syncConfig_(data) { return p79WithConfigLock_(function(){return p79GpsSaveConfig_(data);}); }');
 s=once(s,'function hrReadOrgSettings_(ss) {',"function hrReadOrgSettings_(ss) {\n  const canonical=getSystemConfig_().hrOrgOptionsV1;\n  if(canonical&&['departments','units','jobTitles'].every(function(k){return Array.isArray(canonical[k]);}))return canonical;");
 s+= '\n'+fs.readFileSync(path.join(__dirname,'../backend/hr-org-options-fastlane.gs'),'utf8');
 return s;
}
module.exports={apply};if(require.main===module){const[input,output]=process.argv.slice(2);fs.writeFileSync(output,apply(fs.readFileSync(input,'utf8')));}

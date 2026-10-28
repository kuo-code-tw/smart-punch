// Targeted source patcher: preserves all unrelated live GAS code. Never deploys.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function patch(source){
 const root=path.join(__dirname,'..'),jobs=fs.readFileSync(path.join(root,'backend/assigned-job-scopes.gs'),'utf8'),conversion=fs.readFileSync(path.join(root,'backend/overtime-conversion-rule.gs'),'utf8');
 const one=(text,from,to)=>{if(text.split(from).length!==2)throw Error('GAS source differs at '+from.slice(0,80)+'; review the live version before patching');return text.replace(from,to)};
 const a=source.indexOf('function p79NormalizeJobScopes_('),b=source.indexOf('function p79ScopeEmployeeIdSet_',a);
 if(a<0||b<a||source.includes('function p79AssignedJobTitle_(')||source.includes('function p79DirectResolvedRule_('))throw Error('GAS source is unsupported or already patched; no output written');
 source=source.slice(0,a)+jobs+source.slice(b);
 source=one(source,'function p79PlanDirectReport_(rows,request,rule,attendance,leaveCovers,leaveRecords){',conversion+'\nfunction p79PlanDirectReport_(rows,request,rule,attendance,leaveCovers,leaveRecords){\n rule=p79DirectResolvedRule_(rule);');
 source=one(source,'const rule=matches[0];p79DirectRuleEnvelope_','const rule=p79DirectResolvedRule_(matches[0]);p79DirectRuleEnvelope_');
 source=one(source,'function p79DirectReportSameRequest_(meta,request,rule){','function p79DirectReportSameRequest_(meta,request,rule){\n rule=p79DirectResolvedRule_(rule);');
 source=one(source,"if(!saved||saved.id!==data.id||saved.code!==rule[1])throw Error('加班寫入尚未通過讀回確認，請保留申報識別碼再試');","if(!p79DirectConversionReceipt_(saved,data.id,rule))throw Error('加班寫入的時數、換算或時段未通過讀回確認，請保留申報識別碼再試');");
 source=source.replace(/const API_VERSION = '[^']+';/,"const API_VERSION = '2026.10.28.V62-JOB-SCOPE-CONVERSION-READBACK';");
 new vm.Script(source);return source;
}
module.exports=patch;
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/apply-gas-scope-conversion.cjs LIVE_Code.gs PATCHED_Code.gs');const updated=patch(fs.readFileSync(input,'utf8'));fs.writeFileSync(output,updated);console.log('Patched and syntax checked. Deployment and production readback are separate steps.');}

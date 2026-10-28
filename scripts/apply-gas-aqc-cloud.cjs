const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function patch(source){
 if(source.includes('function p79MultiRodWrite_('))throw Error('AQC cloud already installed');
 const one=(a,b)=>{if(source.split(a).length!==2)throw Error('Unexpected live GAS anchor: '+a);source=source.replace(a,b)};
 one("  if(action==='historyBackupCapabilities')", "  if(action==='gcGetAqcMultiRod'){try{return jsonOutput(p79MultiRodRead_(params));}catch(error){return jsonOutput({ok:false,error:String(error.message||error)});}}\n  if(action==='historyBackupCapabilities')");
 one("  if(action==='historyBackupMonth')", "  if(action==='gcSaveAqcMultiRod'){try{return jsonOutput(p79MultiRodWrite_(parsedData));}catch(error){return jsonOutput({ok:false,error:String(error.message||error)});}}\n  if(action==='historyBackupMonth')");
 if(!/const API_VERSION = '[^']+';/.test(source))throw Error('Missing API_VERSION');
 source=source.replace(/const API_VERSION = '[^']+';/,"const API_VERSION = '2026.10.28.V63-AQC-MULTI-ROD-CLOUD';");
 source+='\n'+fs.readFileSync(path.join(__dirname,'../backend/aqc-multi-rod.gs'),'utf8');new vm.Script(source);return source;
}
module.exports=patch;
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Provide live source and output paths');fs.writeFileSync(output,patch(fs.readFileSync(input,'utf8')));console.log('AQC cloud patch syntax verified');}

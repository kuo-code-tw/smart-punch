#!/usr/bin/env node
'use strict';
/*
 * Safely add the read-only historic-month GET endpoint to an export of the
 * ACTIVE Apps Script source. Does not deploy, overwrite any original,
 * install triggers, archive or remove rows.
 */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const anchor="    if (action === 'historyGetMonthData') {";
const route=[
"    if (action === 'historyGetArchivedModuleMonth') {",
"      return jsonOutput(p79HistoryGetArchivedModuleMonth_(params));",
"    }",
"    if (action === 'historyGetProvisionalScheduleMonth') {",
"      return jsonOutput(p79HistoryGetProvisionalScheduleMonth_(params));",
"    }",
"",
anchor
].join('\n');
function patch(source, extension){
 if(typeof source!=='string'||typeof extension!=='string')throw Error('GAS source and extension must be UTF-8 text');
 if(source.includes("action === 'historyGetArchivedModuleMonth'")||source.includes('function p79HistoryGetArchivedModuleMonth_('))
   throw Error('Already patched; refuse duplicate route');
 if(source.split(anchor).length!==2)throw Error('Unsupported GAS revision: expected one historyGetMonthData router');
 if(!source.includes('function doGet(')||!source.includes('function historyGetMonthData_('))
   throw Error('Unrecognized live GAS source');
 const out=source.replace(anchor,route)+'\n\n'+extension+'\n';
 new vm.Script(out,{filename:'PORT79_merged_history.gs'});
 return out;
}
module.exports=patch;
if(require.main===module){
 const [input,output]=process.argv.slice(2);
 if(!input||!output||path.resolve(input)===path.resolve(output)){
  console.error('Usage: node scripts/apply-gas-history-month-readonly.cjs LIVE_GAS.gs OUTPUT_GAS.gs');
  process.exit(2);
 }
 const extension=fs.readFileSync(path.join(__dirname,'../backend/history-module-month-readonly.gs'),'utf8');
 const original=fs.readFileSync(input,'utf8');
 const merged=patch(original,extension);
 fs.writeFileSync(output,merged,{flag:'wx'});
 console.log('PASS: original file unchanged, GET-only route merged and JavaScript parsed. Not deployed.');
}

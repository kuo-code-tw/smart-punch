#!/usr/bin/env node
/* Apply read-only Wan Hai source bridge to an EXPORT of the ACTIVE PORT79 GAS.
 * Usage: node scripts/apply-gas-wanhai-sailing.cjs LIVE_Code.gs PATCHED_Code.gs
 * This does not deploy anything; operator must confirm the live Google Apps Script
 * project, back it up, install this output, and deploy the existing Web App.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const [,,inputFile,outputFile]=process.argv;
if(!inputFile||!outputFile||path.resolve(inputFile)===path.resolve(outputFile)){
 console.error('Usage: node scripts/apply-gas-wanhai-sailing.cjs LIVE_Code.gs PATCHED_Code.gs');
 process.exit(2);
}
const source=fs.readFileSync(inputFile,'utf8');
const moduleText=fs.readFileSync(path.join(__dirname,'../backend/wanhai-sailing-readonly.gs'),'utf8');
if(source.includes('p79WanHaiSailingGet_')||source.includes("action==='wanHaiSailingSchedule'")){
 throw Error('Wan Hai bridge is already installed. Refusing duplicate route.');
}
const header=/function doGet\(e\)\s*\{\s*const params=\(e&&e\.parameter\)\|\|\{\};\s*const action=String\(params\.action\|\|''\)\.trim\(\);/g;
const matches=[...source.matchAll(header)];
if(matches.length!==1)throw Error('Expected exactly one compatible live doGet route. Found '+matches.length+'; refused unsafe patch.');
const anchor=matches[0][0];
const route="\n  if(action==='wanHaiSailingSchedule'){try{return jsonOutput(p79WanHaiSailingGet_(params));}catch(error){return jsonOutput({ok:false,action:'wanHaiSailingSchedule',error:String(error.message||error)});}}";
const result=source.replace(anchor,anchor+route)+'\n\n'+moduleText;
new vm.Script(result,{filename:outputFile});
fs.writeFileSync(outputFile,result);
console.log('PASS: read-only Wan Hai route added once; syntax parsed; no existing GAS route removed. Output: '+outputFile);

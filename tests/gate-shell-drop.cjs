'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8'),gate=fs.readFileSync('gate-import/index.html','utf8');
const start=html.indexOf('async function handleExcelDrop(e){'),end=html.indexOf('\nasync function importExcelFiles',start);
assert(start>=0&&end>start);
let active=true,received=[],vessel=[],notices=[],frame={contentWindow:{P79GateImport:{chooseFile:async f=>received.push(f)}}};
const ctx={document:{body:{classList:{contains:()=>active}},getElementById:()=>frame},toast:t=>notices.push(t),excelDragDepth:0,setExcelDropActive(){},isExcelFile:f=>/\.xlsx?$/i.test(f.name),setExcelDropStatus(){},importExcelFiles:async f=>vessel.push(f)};
vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
const csv={name:'gate.csv'},xlsx={name:'gate.xlsx'};
const event=files=>({dataTransfer:{files},preventDefault(){},stopPropagation(){}});
(async()=>{
 await ctx.handleExcelDrop(event([csv]));assert.equal(received[0],csv);assert.equal(vessel.length,0);
 await ctx.handleExcelDrop(event([xlsx]));assert.equal(received[1],xlsx);
 await ctx.handleExcelDrop(event([csv,xlsx]));assert.equal(received.length,2);assert.match(notices.at(-1),/一次只能/);
 frame={contentWindow:{}};await ctx.handleExcelDrop(event([csv]));assert.match(notices.at(-1),/尚未載入/);assert.equal(vessel.length,0);
 active=false;await ctx.handleExcelDrop(event([xlsx]));assert.equal(vessel.length,1);
 assert(gate.indexOf('id="gateMessage"')>gate.indexOf('id="gateDropZone"')&&gate.indexOf('id="gateMessage"')<gate.indexOf('id="gateFile"'),'import status immediately follows drop zone inside upload panel');
 console.log('PASS: outer Gate drop forwards CSV/Excel to Gate only; loading and file-count errors visible; vessel drop preserved');
})().catch(e=>{console.error(e);process.exitCode=1});

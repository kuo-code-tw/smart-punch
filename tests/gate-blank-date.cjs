'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const js=fs.readFileSync('assets/port79-gate-import.js','utf8');
let matrix=[],sheet={};
const ctx={g:{XLSX:{utils:{sheet_to_json:()=>matrix}}},book:{Sheets:{Gate:sheet}},skippedDates:[]};
vm.createContext(ctx);
vm.runInContext(js.slice(js.indexOf('function text(v)'),js.indexOf('function mondayOf')),ctx);
function fixture(){
 matrix=Array.from({length:15},()=>['','','','']);matrix[0][2]='2026-10-01';matrix[0][3]='2026-10-02';
 for(const [r,label] of [[1,'交空櫃'],[2,'交重櫃'],[3,'交空櫃'],[4,'交重櫃'],[6,'領空櫃'],[7,'領重櫃'],[8,'領空櫃'],[9,'領重櫃']])matrix[r][1]=label;
 matrix[14][0]='本日進站卡車數';
 for(const r of [1,2,3,4,5,6,7,8,9,10,11,14])matrix[r][2]='0';
}
fixture();let rows=ctx.findGateMatrix('Gate');assert.equal(rows.length,1);assert.equal(rows[0].date,'2026-10-01');assert.equal(ctx.skippedDates[0],'2026-10-02');
assert.equal(rows[0].deliverEmpty,0,'explicit zero day remains a valid record');
matrix[1][3]='1';assert.throws(()=>ctx.findGateMatrix('Gate'),/不是有效/,'partially missing day must not be silently filled with zero');
fixture();sheet.D2={f:'SUM(A1:A2)'};assert.throws(()=>ctx.findGateMatrix('Gate'),/公式沒有計算結果/);delete sheet.D2;
fixture();matrix[5][2]='1';assert.throws(()=>ctx.findGateMatrix('Gate'),/小計不符/);
if(process.env.GATE_MATRIX){
 matrix=JSON.parse(fs.readFileSync(process.env.GATE_MATRIX,'utf8'));rows=ctx.findGateMatrix('Gate');
 assert.equal(rows.length,29);assert.equal(rows[0].date,'2026-10-01');assert.equal(rows.at(-1).date,'2026-10-30');
 assert.deepEqual(Array.from(ctx.skippedDates),['2026-10-23']);assert(!rows.some(r=>r.date==='2026-10-23'));
 console.log('PASS supplied October workbook: 29 valid dates; only wholly empty October 23 skipped; each daily total verified; no cloud writes');
}
console.log('PASS: blank days skipped, explicit zero preserved, partial gaps and uncalculated formulas rejected');

const assert=require('assert/strict'),path=require('path');
const report=require('../assets/port79-vessel-monthly-report.js');
class Sheet{
 constructor(){this.cells=new Map();this.rows=new Map();this.pageSetup={};this.breaks=[];this.merges=[];}
 getCell(r,c){const k=r+','+c;if(!this.cells.has(k))this.cells.set(k,{value:null});return this.cells.get(k);}
 getRow(r){if(!this.rows.has(r))this.rows.set(r,{getCell:c=>this.getCell(r,c),eachCell:fn=>{for(let c=1;c<=13;c++)fn(this.getCell(r,c));},addPageBreak:()=>this.breaks.push(r)});return this.rows.get(r);}
 mergeCells(...range){this.merges.push(range);}
}
class Workbook{constructor(){this.worksheets=[];this.calcProperties={};}addWorksheet(name,options){const s=new Sheet();Object.assign(s,options);this.worksheets.push(s);return s;}}
const ExcelJS=process.env.P79_EXCELJS_PATH?require(path.resolve(process.env.P79_EXCELJS_PATH)):{Workbook};
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
const fixture=n=>Array.from({length:n},(_,i)=>({serial:String(i+1).padStart(4,'0'),date:'2026-10-01',shipName:'315',voyage:'N270',disc:150,load:419,bill:569,hc:16,shift:0,productivity:21.41,includeHC:22.01,note:'PRIVATE NOTE'}));
for(const n of [1,35,36,45,46,70,91])test(n+' records use portrait pages with no unnecessary 36th-ship break',()=>{
 const wb=report.createWorkbook(ExcelJS,{month:'2026-10',company:'自訂測試公司',rows:fixture(n)}),s=wb.worksheets[0],pages=Math.ceil(n/report.PAGE_SIZE);
 assert.equal(s.pageSetup.printArea,`A1:M${n+10*pages}`);
 assert.equal(s.pageSetup.fitToHeight,pages===1?1:0);
 assert(s.pageSetup.horizontalCentered);assert(!s.pageSetup.verticalCentered);
 assert.equal(s.pageSetup.orientation,'portrait');
 const breaks=s.breaks||s.rowBreaks;assert.equal(breaks.length,pages-1);
 for(let i=0;i<n;i++){
  const r=i+5+10*Math.floor(i/report.PAGE_SIZE);
  assert.equal(s.getCell(r,1).value,i+1);
  assert.equal(s.getCell(r,2).value,String(i+1).padStart(4,'0'));
  assert.equal(s.getCell(r,13).value,'');
  assert.equal(s.getCell(r,6).alignment.horizontal,'center');
  assert.equal(s.getCell(r,6).font.name,'Microsoft JhengHei');
 }
 for(let p=0;p<pages;p++){
  const first=p*55+1,chunk=Math.min(report.PAGE_SIZE,n-p*report.PAGE_SIZE);
  const subtotal=first+4+chunk,grand=subtotal+1,footer=grand+1,signature=footer+2,stamp=signature+1;
  assert.equal(s.getCell(first,1).value,'自訂測試公司');
  assert.equal(s.getCell(first,1).font.size,22);
  assert.equal(s.getCell(first+3,11).value,'Productivity');
  assert.equal(s.getCell(footer,1).value,`第 ${p+1} 頁／共 ${pages} 頁`);
  assert.equal(s.getCell(grand,8).value.result,n*569);
  assert.equal(s.getCell(signature,1).value,'證明：');
  assert.equal(s.getCell(signature,4).value,'協理：');
  assert.equal(s.getCell(signature,7).value,'經理：');
  assert.equal(s.getCell(signature,10).value,'製表：');
  assert.equal(s.getCell(stamp,1).value,'');
 }
});
test('blank company has a useful default and company edits persist when storage is available',()=>{
 assert.equal(report.companyName('   '),'亞安顧問管理');assert.equal(report.companyName('  New Company  '),'New Company');
 const old=global.localStorage,store={};global.localStorage={getItem:k=>store[k],setItem:(k,v)=>store[k]=v};report.saveCompany('Company B');assert.equal(report.savedCompany(),'Company B');global.localStorage=old;
});
test('invalid month and empty rows cannot produce a misleading report',()=>{assert.throws(()=>report.createWorkbook(ExcelJS,{month:'2026-13',rows:fixture(1)}));assert.throws(()=>report.createWorkbook(ExcelJS,{month:'2026-10',rows:[]}));});
(async()=>{
 if(process.env.P79_EXCELJS_PATH){
  const original=report.createWorkbook(ExcelJS,{month:'2026-10',company:'公司抬頭',rows:fixture(36)}),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await original.xlsx.writeBuffer());
  const s=loaded.worksheets[0];
  assert.equal(s.getCell('A1').value,'公司抬頭');
  assert.equal(s.getCell('F5').font.name,'Microsoft JhengHei');
  assert.equal(s.getCell('A1').alignment.horizontal,'center');
  assert.equal(s.getCell('F5').alignment.vertical,'middle');
  assert.equal(s.getCell('M5').value,'');
  assert.equal(s.getCell('B40').value,'0036');
  assert.equal(s.getCell('H42').value.result,36*569);
  assert.equal(s.getCell('A45').value,'證明：');
  assert.equal(original.worksheets[0].rowBreaks.length,0);
  passed++;
 }
 console.log(JSON.stringify({passed,failed:0,nativeRoundTrip:!!process.env.P79_EXCELJS_PATH}));
})().catch(e=>{console.error(e);process.exitCode=1;});

const assert=require('node:assert/strict');
const storage=new Map();
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
const report=require('../assets/port79-vessel-monthly-report.js');
class Cell{
 constructor(){this.value=null;this.font=null;this.fill=null;this.alignment=null;this.border=null;}
}
class Row{
 constructor(index){this.number=index;this.cells=new Map();this.height=0;this.breaks=0;}
 getCell(col){if(!this.cells.has(col))this.cells.set(col,new Cell());return this.cells.get(col);}
 eachCell(fn){for(const [col,cell] of this.cells)fn(cell,col);}
 addPageBreak(){this.breaks++;}
}
class Sheet{
 constructor(options){this.pageSetup=options.pageSetup;this.rows=new Map();this.merges=[];this.columns=[];}
 getRow(n){if(!this.rows.has(n))this.rows.set(n,new Row(n));return this.rows.get(n);}
 getCell(row,col){return this.getRow(row).getCell(col);}
 mergeCells(a,b,c,d){this.merges.push([a,b,c,d]);}
}
class Workbook{
 constructor(){this.calcProperties={};this.sheets=[];}
 addWorksheet(name,options){const sheet=new Sheet(options);sheet.name=name;this.sheets.push(sheet);return sheet;}
}
const ExcelJS={Workbook};
const data=Array.from({length:36},(_,i)=>({
 date:'2026-10-'+String(i%27+1).padStart(2,'0'),
 serial:String(i+159).padStart(4,'0'),shipName:'292',voyage:'N073',
 disc:100+i,load:200+i,bill:300+i,hc:10,shift:2,productivity:23.06,includeHC:23.43
}));
assert.deepEqual(report.savedSignatures(),['證明：','協理：','經理：','製表：']);
const saved=report.saveSignatures(['驗證：主任','協辦：專員','經理：王主管','填表人：小美']);
assert.deepEqual(report.savedSignatures(),saved);
const build=report.createWorkbook(ExcelJS,{month:'2026-10',company:'亞安顧問管理',rows:data,signatures:saved});
const sheet=build.sheets[0];
assert.equal(sheet.pageSetup.paperSize,9);
assert.equal(sheet.pageSetup.orientation,'portrait');
assert.equal(sheet.pageSetup.fitToWidth,1);
assert.equal(sheet.pageSetup.fitToHeight,1);
assert.equal(sheet.pageSetup.printArea,'A1:M46');
assert.equal(report.PRINT_ROWS_PER_PAGE,55);
assert.equal(report.PAGE_SIZE,45);
assert.equal(sheet.getCell(1,1).value,'亞安顧問管理');
assert.equal(sheet.getCell(2,1).value,'79W 115年10月份船邊作業量表');
assert.equal(sheet.getCell(3,1).value,'編號','header retained');
assert.equal(sheet.getCell(43,1).value,'第 1 頁／共 1 頁');
assert.equal(sheet.getRow(46).breaks,0,'36 ships fit on one portrait page');
assert.deepEqual([1,4,7,10].map(col=>sheet.getCell(45,col).value),saved);
assert.equal(sheet.getCell(45,1).font.name,'Microsoft JhengHei');
assert.equal(sheet.getCell(40,1).value,36,'last ship remains visible');
assert.equal(sheet.getCell(41,1).value,'本頁小計');
assert.equal(sheet.getCell(42,1).value,'本月合計');
assert.equal(sheet.getCell(42,6).value.formula,'F41','one-page monthly total references the only subtotal');
assert.equal(sheet.getCell(42,6).value.result,data.reduce((n,x)=>n+x.disc,0));
for(const [r,c] of [[3,1],[4,11],[5,4],[41,6],[42,1],[45,1],[46,10]]){
 assert.equal(sheet.getCell(r,c).fill.fgColor.argb,'FFFFFFFF','only white backgrounds');
 assert.equal(sheet.getCell(r,c).font.name,'Microsoft JhengHei');
}
assert.equal(sheet.getCell(46,1).value,'','stamp space is present');
assert.equal(sheet.getCell(5,13).value,'','remarks stay blank');
assert.equal(sheet.getCell(5,2).value,'0159','leading-zero serial preserved');
const single=report.createWorkbook(ExcelJS,{month:'2026-10',company:'管理處',rows:data.slice(0,1)});
assert.equal(single.sheets[0].getCell(10,1).value,saved[0],'saved labels used as default on export');
assert.equal(single.sheets[0].pageSetup.printArea,'A1:M11');
assert.throws(()=>report.createWorkbook(ExcelJS,{month:'bad',company:'亞安',rows:data}),/月份/);
assert.throws(()=>report.createWorkbook(ExcelJS,{month:'2026-10',company:'亞安',rows:[]}),/沒有/);
console.log('PASS vessel portrait and editable signatures: A4 single page for 36 records, white cells, editable four signatures and monthly totals');

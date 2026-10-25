const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {TextEncoder,TextDecoder}=require('node:util');
const source=fs.readFileSync('assets/port79-overtime-application.js','utf8');
const frontend=fs.readFileSync('work-hours/index.html','utf8');
const ctx={window:{},TextEncoder,TextDecoder};
vm.createContext(ctx);vm.runInContext(source,ctx);
const app=ctx.window.P79OvertimeApplication;
assert.equal(typeof app.applyExportRemarks,'function');
const original=[
 {date:'2026-10-01',company:'測試公司',job:'ARMG',name:'甲',empId:'E1',periods:['08-16','','',''],actual:8,converted:12.7,note:'加班申報 / 每月未休假加班',reportId:'r1'},
 {date:'2026-10-01',company:'測試公司',job:'ARMG',name:'乙',empId:'E2',periods:['16-20','','',''],actual:4,converted:6.02,note:'原始申報備註',reportId:'r2'}
];
const verify=rows=>{
 const preview=app.reportHtml(rows,false);
 const excel=app.excelBytes(rows,false);
 const bytes=Buffer.from(excel.buffer,excel.byteOffset,excel.byteLength);
 const cells=bytes.toString('utf8');
 return {preview,cells};
};
const defaultRows=app.applyExportRemarks(original,'');
assert.deepEqual(Array.from(defaultRows,r=>r.note),['吊櫃作業','吊櫃作業']);
const v1=verify(defaultRows);
assert(v1.preview.includes('吊櫃作業')&&v1.cells.includes('吊櫃作業'),'default needs to reach both preview and Excel');
const customRows=app.applyExportRemarks(original,'設備檢修');
assert.deepEqual(Array.from(customRows,r=>r.note),['設備檢修','設備檢修']);
const v2=verify(customRows);
assert(v2.preview.includes('設備檢修')&&v2.cells.includes('設備檢修'),'custom needs to reach both preview and Excel');
const overrides=new Map([[1,' 臨時吊櫃支援 ']]);
const changed=app.applyExportRemarks(original,'設備檢修',overrides);
assert.deepEqual(Array.from(changed,r=>r.note),['設備檢修','臨時吊櫃支援']);
const v3=verify(changed);
assert(v3.preview.includes('臨時吊櫃支援')&&v3.cells.includes('臨時吊櫃支援'),'individual override must reach printed report and Excel');
const summary=app.aggregate(changed,['2026-10-01']);
assert(summary[0].note.includes('設備檢修')&&summary[0].note.includes('臨時吊櫃支援'),'summary remarks must preserve unique notes');
const cleared=app.applyExportRemarks(original,' ',new Map([[1,'  ']]));
assert.deepEqual(Array.from(cleared,r=>r.note),['吊櫃作業','吊櫃作業']);
assert.equal(original[0].note,'加班申報 / 每月未休假加班','original cloud note must remain untouched');
assert.equal(original[0].actual,8);assert.equal(changed[0].actual,8);assert.equal(changed[0].converted,12.7);
assert(source.includes('id="oaRemark"')&&source.includes('id="oaRowRemarks"')&&source.includes('data-oa-note-row'));
assert(source.includes("q('#oaRemark').oninput=")&&source.includes("loaded.rows=loaded.summary?aggregate("));
assert(frontend.includes('port79-overtime-application.js?v=20261025-editable-remarks-v1'),'production should load revised asset');
console.log('PASS overtime report notes: blank defaults to 吊櫃作業, custom/global/individual overrides, preview/print and Excel, summary, source and hour preservation');

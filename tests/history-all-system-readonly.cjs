'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../backend/history-module-month-readonly.gs'),'utf8');

function iterator(items){
 let i=0;return {hasNext:()=>i<items.length,next:()=>items[i++]};
}
function fixture(options={}){
 const permissions=[];
 const files=(options.fileNames||['79號碼頭_2026-10_2026-10請假紀錄_歷史保全_20261101']).map((name,i)=>({
  getName:()=>name,getId:()=>String(i+1),getMimeType:()=> 'application/vnd.google-apps.spreadsheet'
 }));
 const archiveFolder={getFiles:()=>iterator(files)};
 const root={getFoldersByName:()=>iterator(options.missingFolder?[]:[archiveFolder])};
 const scheduleFolder={getParents:()=>iterator([root])};
 const rows=[['工號','日期'],['A001','2026-10-10'],['A002','2026-10-20']];
 const sheet={getLastRow:()=>rows.length,getLastColumn:()=>rows[0].length,getRange:(r,c,n,w)=>({
   getDisplayValues:()=>rows.slice(r-1,r-1+n).map(x=>x.slice(c-1,c-1+w))
 })};
 const context={
  getSpreadsheet_:()=>({}),
  gcRequireSystemPermission_:(_ss,_token,area,access)=>{
    permissions.push([area,access]);
    if(options.denyPermission===area)throw Error('No permission');
    return {adminRole:options.role||'superadmin'};
  },
  getScheduleDriveFolder_:()=>scheduleFolder,
  Utilities:{formatDate:()=>options.current||'2026-11'},
  SpreadsheetApp:{openById:()=>({getSheets:()=>[sheet],getUrl:()=> 'https://docs.google.com/spreadsheets/d/test/edit'})}
 };
 vm.createContext(context);vm.runInContext(source,context);
 return {context,permissions,files};
}

{
 const t=fixture();
 const r=t.context.p79HistoryGetArchivedModuleMonth_({token:'VALID',type:'leave',month:'2026-10',pageSize:1,page:2});
 assert.equal(r.ok,true);assert.equal(r.rows.length,1);assert.equal(r.rows[0][0],'A002');
 assert.equal(r.totalRows,2);assert.equal(r.page,2);assert.equal(r.hasMore,false);
 assert.equal(JSON.stringify(t.permissions),JSON.stringify([['history','view'],['leave','view']]));
 assert.equal(r.source,'history-folder');
}
{
 const t=fixture({denyPermission:'leave'});
 assert.throws(()=>t.context.p79HistoryGetArchivedModuleMonth_({type:'leave',month:'2026-10'}),/No permission/);
}
{
 const t=fixture();
 assert.throws(()=>t.context.p79HistoryGetArchivedModuleMonth_({type:'leave',month:'bad'}),/YYYY-MM/);
 assert.equal(t.context.p79HistoryGetArchivedModuleMonth_({type:'leave',month:'2026-11'}).status,'CURRENT_OR_FUTURE');
}
{
 const t=fixture({missingFolder:true});
 assert.equal(t.context.p79HistoryGetArchivedModuleMonth_({type:'leave',month:'2026-10'}).status,'MISSING_ARCHIVE');
}
{
 const t=fixture({fileNames:['x2026-10請假紀錄','y2026-10請假紀錄']});
 assert.throws(()=>t.context.p79HistoryGetArchivedModuleMonth_({type:'leave',month:'2026-10'}),/多個|2 份/);
}
{
 const t=fixture({role:'admin'});
 assert.throws(()=>t.context.p79HistoryGetArchivedModuleMonth_({type:'login-audit',month:'2026-10'}),/超級管理員|No permission/);
}
console.log('PASS: 6 archive boundary, permission, paging, duplicate and missing-month cases');


// Provisional October fallback must never be published as a final roster.
{
 const permissions=[];
 const name='79號碼頭_2026-10排班_20261028來源待核對_歷史保全';
 const file={getName:()=>name,getId:()=> 'backup-id',getMimeType:()=> 'application/vnd.google-apps.spreadsheet'};
 const sheet={getLastRow:()=>3};
 const mocks={
  getSpreadsheet_:()=>({}),
  gcRequireSystemPermission_:(_ss,_token,area,level)=>{
   permissions.push([area,level]);return {adminRole:'superadmin'};
  },
  getScheduleDriveFolder_:()=>({getFiles:()=>iterator([file])}),
  Utilities:{formatDate:()=> '2026-11'},
  SpreadsheetApp:{openById:()=>({getSheets:()=>[sheet],getUrl:()=> 'https://docs.google.com/spreadsheets/d/backup-id/edit'})},
  readSchedules_:()=>[{empId:'A01',month:'2026-10',schedule:{}},{empId:'A02',month:'2026-10',schedule:{}}],
  normalizeScheduleMonth_:x=>String(x)
 };
 const c=vm.createContext(mocks);
 vm.runInContext(source,c);
 const result=c.p79HistoryGetProvisionalScheduleMonth_({month:'2026-10',token:'AUTH'});
 assert.equal(result.ok,true);
 assert.equal(result.provisional,true);
 assert.equal(result.count,2);
 assert.match(result.archiveStatus,/待核對/);
 assert.deepEqual(permissions,[['history','view'],['schedule','view']]);
 assert.throws(()=>c.p79HistoryGetProvisionalScheduleMonth_({month:'2026-11',token:'AUTH'}),/本月/);
}
console.log('PASS: provisional roster read-only source, status, permissions and current-month guard');

'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let snapshot=fs.readFileSync('backend/punch-self-read.gs','utf8');
snapshot=snapshot.replace('function p79PunchSelfReadRouteSnapshot_(params){',"function fakeDoGet(params){\nconst action='getAttendanceMainDirect';\n    if (action === 'getAttendanceMainDirect') {");
snapshot=snapshot.slice(0,snapshot.lastIndexOf('\n}'))+"\n    }\n    if (false) {}\n}\n";
const before=process.env.P79_PUNCH_SOURCE ? fs.readFileSync(process.env.P79_PUNCH_SOURCE,'utf8') :
 "const API_VERSION = '2026.11.05.V98-PUNCH-SELF-READ';\nfunction activityFixture(action){\n  const ignore = !action || action==='ping' || action==='deploymentCheck' || action==='getSyncMeta' || action==='getAttendanceDelta';\n}\n"+snapshot;
const after=require('../scripts/apply-gas-punch-read-io.cjs').apply(before);
new vm.Script(after);
function sourceFunction(source,name){const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+10);assert(start>=0);return source.slice(start,end<0?undefined:end);}
function setup(source){
 const month=new Date().toISOString().slice(0,7),counts={ensure:0,deleted:0},norm=x=>String(x||'').trim();
 const rows=[['own','450','E450','員工'],['foreign','234','OTHER','別人'],['deleted','450','E450','員工']].map(([id,attNo,empId,name])=>[id,attNo,empId,name,'部門',month.replace('-','/')+'/05 07:00:00','上班簽到','','','','','','employee','',JSON.stringify({id,attNo,empId,name,source:'employee'})]);
 const originalRows=[['protected','450','E450','員工'],['deleted-original','450','E450','員工'],['foreign-protected','234','OTHER','別人']].map(([id,attNo,empId,name])=>Array.from({length:15},(_,i)=>i===14?JSON.stringify({id,attNo,empId,name,source:'employee',timeStr:month+'/05 08:00:00',status:'上班簽到'}):''));
 const original={getLastRow:()=>originalRows.length+1,getRange:()=>({getValues:()=>originalRows})};
 const sheet={getName:()=> 'main',getParent:()=>ss,getLastRow:()=>rows.length+1,getLastColumn:()=>15,getRange:(r,c,n,w)=>({getDisplayValues:()=>r===1?[['ID','考勤號碼','工號','姓名','部門','完整考勤時間','出勤狀態','備註','地點','來源原始識別','人工修改','人工修改時間','資料來源','匯入檔案','完整資料JSON']]:rows.slice(r-2,r-2+n).map(x=>x.slice(c-1,c-1+w)),getValues:()=>rows.slice(r-2,r-2+n).map(x=>x.slice(c-1,c-1+w))})};
 const deleted={ids:{deleted:true}},permanent={ids:{'deleted-original':true}};
 const ss={getId:()=> '1QlixVO7V0tAdx64n1npQmWCFW8sNvsfdVh-vEtGpakE',getSpreadsheetTimeZone:()=> 'Asia/Taipei',getSheetByName:name=>name==='main'?sheet:name==='deleted'?deleted:null};
 const c={console,Date,JSON,Set,Object,Array,normalizeText_:norm,normalizeId_:norm,normalizeEmpId_:x=>norm(x).toUpperCase(),safeJsonParse_:(x,d)=>{try{return JSON.parse(x)}catch{return d}},normalizeRecordPayload_:x=>x.record,getSpreadsheet_:()=>ss,ensureSheet_:()=>{counts.ensure++;return sheet},getSheetFast_:()=>sheet,SHEET_RECORDS:'main',SHEET_DELETED_RECORDS:'deleted',RECORD_HEADERS:Array(15).fill(''),attendanceCurrentMonthKey_:()=>month,attendanceMonthKeyFromTimeStr_:()=>month,attendanceMonthKeyFromRecord_:()=>month,p79PunchOriginalSheet_:()=>original,p79ExistingPermanentDeletedSheet_:()=>permanent,p79DeletedIdsFromSheet_:sh=>{counts.deleted++;return {...sh?.ids}},getDeletedRecordIds_:()=>{counts.deleted+=2;return {deleted:true,'deleted-original':true}},userRequireTokenCore_:(_,token)=>{if(token!=='VALID')throw Error('登入驗證資料不存在');return {empId:'E450',attNo:'450',name:'員工'}},p79EnrichAttendanceIdentities_:(_,r)=>r,jsonOutput:x=>x,API_VERSION:'TEST'};
 vm.createContext(c);
 for(const name of ['p79ReadAttendanceMainDirectUnprotectedV54_','p79ReadAttendanceMainDirect_','p79MergeProtectedPunchOriginals_','p79PunchSelfMatches_'])vm.runInContext(sourceFunction(source,name),c);
 if(source.includes('function p79PunchDeletedIdsFast_('))vm.runInContext(sourceFunction(source,'p79PunchDeletedIdsFast_'),c);
 const start=source.indexOf("    if (action === 'getAttendanceMainDirect') {"),end=source.indexOf('\n    if (',start+10);
 vm.runInContext("function route(params){const action='getAttendanceMainDirect';"+source.slice(start,end)+'}',c);
 return {c,counts,read:p=>c.route({...p,month})};
}
const old=setup(before),next=setup(after);
const p={punchSelf:'1',token:'VALID',empId:'OTHER'};
assert.deepEqual(JSON.parse(JSON.stringify(next.read(p))).records,JSON.parse(JSON.stringify(old.read(p))).records);
assert.equal(next.counts.ensure,0,'employee read never repairs sheet formatting');
assert.equal(next.counts.deleted,2,'visible and permanent tombstones each read only once');
assert.equal(old.counts.deleted,4,'baseline reads both tombstone lists twice');
assert.throws(()=>setup(after).read({punchSelf:'1'}),/登入/);
const legacy=setup(after);legacy.read({token:'VALID'});assert.equal(legacy.counts.ensure,1,'management route retains schema checks');
assert(!after.includes("const ignore = !action || action==='ping' || action==='deploymentCheck' || action==='getSyncMeta' || action==='getAttendanceDelta';"));
console.log('PASS exact record parity, own identity, protected originals, visible/permanent deletions, one tombstone read, no employee formatting repairs, missing token denied, legacy schema checks');

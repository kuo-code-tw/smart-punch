'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../backend/yard-cloud-store.gs'),'utf8');
const fields=source.match(/var P79_YARD_COLUMNS_='([^']+)'[.]split/)[1].split(' ');
function row(date,value=1){const r={date};for(const key of fields.slice(1))r[key]=value;r.heavyCap=19200;r.emptyCap=5350;return r;}
function fixture(initial=[],role='admin',badHeader=false){
 const records=initial.map(r=>fields.map(k=>r[k]));let writes=0;
 const sheet={getLastRow:()=>records.length+1,getRange(start,col,n,width){return {
  getDisplayValues:()=>[fields.map(k=>badHeader&&k==='heavyCap'?'BAD':k)],
  getValues:()=>Array.from({length:n},(_,i)=>(records[start-2+i]||Array(width).fill('')).slice()),
  setValues(rows){writes++;rows.forEach((r,i)=>records[start-2+i]=r.slice());}
 };}};
 const context={Date,Number,Object,Array,String,Error,JSON,decodeURIComponent,
 SpreadsheetApp:{openById(id){assert.equal(id,'1kyWW6WDk_L39b92Wv0uk6MPiVak0gekKpKP-JgTnqsU');return {getSheetByName:()=>sheet}},flush(){}},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},getSpreadsheet_:()=>({}),
 gcRequireSystemPermission_(_db,token,system,perm){if(token!=='GOOD')throw Error('Invalid token');assert.equal(system,'efficiency');assert(['view','edit'].includes(perm));return {adminRole:role,empId:'TEST-ADMIN'};}
 };
 vm.createContext(context);vm.runInContext(source,context);
 return {context,get writes(){return writes;}};
}
function request(action,rows,token='GOOD',account='TEST-ADMIN'){return {action,rows,token,account};}
test('authorized manager reads the original 52 cloud columns, without writing',()=>{
 const x=fixture([row('2026-11-16',8)]),res=x.context.p79YardAccountRequest_(request('yardAccountRead'));
 assert.equal(res.ok,true);assert.equal(res.version,1);assert.equal(res.rows.length,1);
 assert.equal(res.rows[0].emptyCap,5350);assert.equal(res.latestDate,'2026-11-16');assert.equal(Object.keys(res.rows[0]).length,52);
 assert.equal(x.writes,0);
});
test('invalid session, wrong account or employee role cannot read private yard data',()=>{
 const x=fixture();
 assert.throws(()=>x.context.p79YardAccountRequest_(request('yardAccountRead',null,'')),/登入/);
 assert.throws(()=>x.context.p79YardAccountRequest_(request('yardAccountRead',null,'INVALID')),/Invalid token/);
 assert.throws(()=>x.context.p79YardAccountRequest_(request('yardAccountRead',null,'GOOD','OTHER')),/權限不符/);
 const y=fixture([],'employee');assert.throws(()=>y.context.p79YardAccountRequest_(request('yardAccountRead')),/無碼頭儲量檢視權限/);
});
test('write merges one new date and retains existing older historical data',()=>{
 const x=fixture([row('2026-11-15',3)]);const res=x.context.p79YardAccountRequest_(request('yardAccountWrite',[row('2026-11-16',8)]));
 assert.equal(res.added,1);assert.equal(res.rows.length,2);assert.equal(res.rows[0].imp20,3);
 assert.equal(res.rows[1].imp20,8);assert.equal(x.writes,1);
});
test('invalid numbers and duplicate days fail before touching cloud',()=>{
 const x=fixture(),broken=row('2026-11-16');delete broken.imp20;
 assert.throws(()=>x.context.p79YardAccountRequest_(request('yardAccountWrite',[broken])),/缺少數值/);
 const valid=row('2026-11-16');
 assert.throws(()=>x.context.p79YardAccountRequest_(request('yardAccountWrite',[valid,valid])),/重複日期/);
 assert.equal(x.writes,0);
});
test('schema drift is rejected instead of silently showing wrong inventory',()=>{
 const x=fixture([],'admin',true);assert.throws(()=>x.context.p79YardAccountRequest_(request('yardAccountRead')),/欄位不符/);
});
test('homepage never mislabels restored historical data as today or public JSON',()=>{
 const home=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 const sync=fs.readFileSync(path.resolve(__dirname,'../assets/port79-yard-account-sync.js'),'utf8');
 assert(home.includes('歷史資料（不是今日即時場存）'));
 assert(home.includes('首頁登入授權讀取服務尚未連線'));
 assert(sync.includes('cloudSyncedAt:'));
 assert(!source.includes('ContentService.createTextOutput(JSON.stringify(records))'));
});

const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-special-days-editor.js','utf8');
let cloud={revision:'0',rows:[{kind:'election',date:'2026-11-28'}]},reads=0,writes=0;
function setup(existing=[]){
 const stored=new Map([['p79-manual-typhoon-days-v1',JSON.stringify(existing)]]);
 const c={Date,Intl,Map,Set,Promise,console,localStorage:{
  getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,String(v)),removeItem:k=>stored.delete(k)
 },P79SpecialOvertime:{electionDates:()=>['2026-11-28']}};
 c.window=c;vm.createContext(c);vm.runInContext(source,c);
 const app=c.P79SpecialDaysEditor;
 app.configure({
  read:async()=>{reads++;return {ok:true,source:'cloud',schemaVersion:1,...structuredClone(cloud)}},
  write:async({rows,expectedRevision})=>{
   writes++;if(expectedRevision!==cloud.revision)return {ok:false,conflict:true,error:'版本衝突'};
   cloud={revision:'v'+String(writes).padStart(32,'0'),rows:structuredClone(rows)};
   return {ok:true,source:'cloud',schemaVersion:1,...structuredClone(cloud)};
  }
 });
 return {app,stored};
}
(async()=>{
 const a=setup(['2026-10-23']),b=setup();
 await a.app.refresh();await b.app.refresh();
 assert.deepEqual(Array.from(a.app.pendingLegacy(),x=>x.date),['2026-10-23'],'old home date backed up');
 assert.equal(a.stored.get('p79-manual-typhoon-days-v1'),'[]','old local date is not silently submitted to cloud');
 assert.equal(a.stored.get('p79-special-days-precloud-backup-v1')!==null,true);
 const local=JSON.parse(a.stored.get('p79-special-days-precloud-backup-v1'));
 assert.deepEqual(local.rows.map(x=>x.date),['2026-10-23']);
 assert.equal(a.app.signature(),'0');
 const next=[{date:'2026-11-28',kind:'election'},{date:'2026-10-23',kind:'typhoon'}];
 await a.app.save(next,a.app.signature());
 await b.app.refresh();
 assert.equal(b.stored.get('p79-manual-typhoon-days-v1'),'["2026-10-23"]','office computer receives home changes');
 assert.equal(b.app.read().length,2);
 assert.equal(a.app.pendingLegacy().length,0,'after explicit migration, no pending legacy');
 await assert.rejects(()=>b.app.save([{date:'2026-10-24',kind:'typhoon'}],'0'),/版本已變更/);
 assert.throws(()=>a.app.normalize([{date:'2026-02-30',kind:'typhoon'}]),/有效日期/);
 const days=a.app.range('2026-10-23','2026-10-25','typhoon');
 assert.equal(days.length,3);
 assert.equal(writes,1,'only explicit save writes to cloud');
 assert(reads>=3);
 assert(source.includes("const BACKUP_KEY=")&&source.includes("if(!service)throw Error('未連接 GAS"));
 console.log('PASS special days cloud: cross-computer sync, optimistic revision, legacy backup, explicit upload, invalid dates');
})().catch(e=>{console.error(e);process.exitCode=1});

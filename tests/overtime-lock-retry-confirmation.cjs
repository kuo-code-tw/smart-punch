const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8');
const source=html.slice(html.indexOf('async function p79SaveWorkOvertimeDraft('),html.indexOf('window.p79OvertimeContext='));
assert(source.startsWith('async function p79SaveWorkOvertimeDraft('),'official overtime save routine exists');
const date='2099-10-15',old={id:'ORIGINAL-09',category:'休',code:'休16-24',declaredHours:8,convertedHours:12.7,note:'舊備註'};
const draft={id:old.id,empId:'E9',date,preventReplace:true,rule:{category:'休',code:'休08-16',typeName:'休息日加班',declaredHours:8,convertedHours:12.7,overtimeStart:'08',overtimeEnd:'16'},note:'修改後'};
async function run(mode){
 let revision=1,gets=0,posts=0,confirmed=false;const ledger={...old};
 const mock={console,Date,Map,Promise,Number,String,JSON,Intl,AbortController,TypeError,Error,
  currentPort79SsoToken:()=> 'token',p79CanReportOvertime:()=>true,getActiveGasUrl:()=> 'https://fixture.invalid',
  setTimeout:(fn,ms)=>ms>=45000?1:(fn(),2),clearTimeout:()=>{},
  buildDailyAttendanceRows:()=>[],p79WorkOvertimeMonths:new Map(),p79OvertimeCalculationCache:null,
  renderOvertimeStats:()=>{},localStorage:{setItem(){}},P79Overtime:{overtimeMinutes:()=>0}};
 mock.window=mock;
 mock.fetch=async(url,options={})=>{
  if(options.method==='POST'){
   posts++;const body=JSON.parse(options.body);
   assert.equal(body.id,old.id,'never create a new report ID');
   assert.equal(body.replaceReportId,old.id,'always preserve original amendment target');
   assert.equal(body.expectedRevision,revision,'retry must read latest cloud revision');
   if(mode==='busy-once'&&posts===1||mode==='always-busy')
   {revision++;return {ok:true,json:async()=>({ok:false,retryable:true,error:'雲端目前正在處理其他資料，請稍後自動重試'})};}
   if(mode==='ambiguous-write')throw new TypeError('Failed to fetch');
   Object.assign(ledger,{category:body.category,code:body.code,note:body.note,declaredHours:8,convertedHours:12.7});
   revision++;confirmed=true;
   return {ok:true,json:async()=>({ok:true,id:old.id,directOvertimeSaved:true,report:{...ledger},revision})};
  }
  gets++;
  if(mode==='read-busy'&&gets<=2)return {ok:true,json:async()=>({ok:false,retryable:true,error:'雲端目前正在處理其他資料，請稍後自動重試'})};
  return {ok:true,json:async()=>({ok:true,revision,schedules:[{empId:'E9',schedule:{[date]:'休',__meta:{[date]:{overtimeReport:{...ledger}}}}}],records:[]})};
 };
 vm.createContext(mock);vm.runInContext(source,mock);
 let result=null,error=null;try{result=await mock.p79SaveWorkOvertimeDraft({...draft});}catch(e){error=e}
 return{result,error,gets,posts,confirmed,ledger};
}
(async()=>{
 const afterBusy=await run('busy-once');
 assert.equal(afterBusy.error,null);assert.equal(afterBusy.result.ok,true);
 assert.equal(afterBusy.posts,2);assert.equal(afterBusy.gets,2,'retry requires fresh GET before next POST');
 assert.equal(afterBusy.ledger.code,'休08-16');
 const readBusy=await run('read-busy');
 assert.equal(readBusy.error,null);assert.equal(readBusy.gets,3);assert.equal(readBusy.posts,1);
 const exhausted=await run('always-busy');
 assert(exhausted.error);assert.match(exhausted.error.message,/本次修改尚未儲存/);
 assert.equal(exhausted.posts,4,'never spin forever');assert.equal(exhausted.ledger.code,old.code,'failed attempt keeps original');
 const unknown=await run('ambiguous-write');
 assert(unknown.error);assert.match(unknown.error.message,/寫入結果尚未確認/);
 assert.equal(unknown.posts,1,'network-ambiguous POST must not be blindly retried');
 console.log('PASS GAS lock contention: fresh revision, same original ID, GET retries, bounded failure, no replay on unknown writes');
})().catch(e=>{console.error(e);process.exitCode=1});

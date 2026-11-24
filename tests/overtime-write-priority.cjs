'use strict';
const fs=require('node:fs');
async function test(page){
 const assert=(x,m)=>{if(!x)throw Error(m)};
 const start=page.indexOf('async function p79SaveWorkOvertimeDraft('),end=page.indexOf('window.p79OvertimeContext=',start);
 let revision=1,gets=0,posts=0,pauses=[],modes=['busy','busy','ok'],lastId;
 const date='2099-10-15',report={id:'R',category:'休',code:'休16-24',declaredHours:8,convertedHours:12.7,note:''};
 const rule={category:'休',code:'休08-16',typeName:'休息日加班',declaredHours:8,convertedHours:12.7,overtimeStart:'08',overtimeEnd:'16'};
 const globals={currentPort79SsoToken:()=> 'token',p79CanReportOvertime:()=>true,getActiveGasUrl:()=> 'https://fixture.invalid',
 p79AssertDirectReportActive:op=>{if(op?.stopped)throw Error('stopped')},AbortController:class{constructor(){this.signal={}}abort(){}},setTimeout:(fn,ms)=>{if(ms<10000){pauses.push(ms);fn();}return 1;},clearTimeout:()=>{},buildDailyAttendanceRows:()=>[],p79WorkOvertimeMonths:new Map(),p79OvertimeCalculationCache:null,renderOvertimeStats:()=>{},localStorage:{setItem(){}},P79Overtime:{overtimeMinutes:()=>0}};
 globals.window=globals;
 globals.fetch=async(url,opts)=>{
  if(opts.method==='POST'){
   posts++;const b=JSON.parse(opts.body);lastId=b.id;assert(b.expectedRevision===revision,'fresh revision before write');
   const mode=modes.shift();if(mode==='busy'){revision++;return {ok:true,json:async()=>({ok:false,retryable:true,error:'雲端目前正在處理其他資料'})};}
   if(mode==='unknown')throw new TypeError('Failed to fetch');
   return {ok:true,json:async()=>({ok:true,id:'R',directOvertimeSaved:true,report:{...report,...rule},revision})};
  }
  gets++;return {ok:true,json:async()=>({ok:true,revision,schedules:[{empId:'A',schedule:{__meta:{[date]:{overtimeReport:report}}}}],records:[]})};
 };
 const names=Object.keys(globals),save=new Function(...names,page.slice(start,end)+';return p79SaveWorkOvertimeDraft')(...Object.values(globals));
 const draft={id:'R',empId:'A',date,rule,note:'',preventReplace:true,directRow:true};
 const r=await save(draft);assert(r.ok&&gets===3&&posts===3&&lastId==='R','two lock refusals recover with same ID');
 assert(pauses.includes(2500)&&pauses.includes(5000),'progressive wait avoids immediate collision');
 modes=['unknown'];posts=0;try{await save(draft);throw Error('expected error');}catch(e){assert(/寫入結果尚未確認/.test(e.message),'ambiguous write not replayed');}assert(posts===1,'one ambiguous post');
 assert(page.includes('if(p79OvertimeWritePriority>0)return;'),'background sync gated');
 assert(page.includes('p79OvertimeWritePriority=Math.max(0,p79OvertimeWritePriority-1)'),'priority released');
 assert(page.includes('limit=90000'),'bounded overall deadline');
 return 'PASS two explicit lock refusals recover, fresh revision, same ID, backoff, ambiguous write not replayed, priority gates';
}
test(fs.readFileSync('work-hours/index.html','utf8')).then(console.log).catch(e=>{console.error(e);process.exitCode=1;});

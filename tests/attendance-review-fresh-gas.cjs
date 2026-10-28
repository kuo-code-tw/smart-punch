'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-attendance-overtime.js','utf8');
new vm.Script(source);
const date='2026-10-12',month='2026-10',store=new Map(),requests=[],responses=[];
const revoked={confirmed:true,reportId:'OLD',report:{id:'OLD',code:'休08-16'},
 empId:'E1',date,at:'2026-10-18',actor:'主管'};
const makeCloud=kind=>({ok:true,employees:[{empId:'E1',name:'員工'}],
 schedules:[{empId:'E1',schedule:{__meta:{[date]:
  {overtimeReport:kind==='new'?{id:'NEW',code:'休08-16',reportedAt:'original',modifiedAt:'updated'}:
    kind==='same-id'?{id:'OLD',code:'休08-16'}:null,
   overtimeRevocations:[revoked,{...revoked,reportId:'OLD2',report:{id:'OLD2'},at:'2026-10-20'}]}
 }}}]});
const months=new Map([[month,{token:'TOKEN',ready:true,rows:makeCloud('old').schedules,people:[]}]]);
const styles={},button={dataset:{},
 style:{setProperty(k,v){styles[k]=v},removeProperty(k){delete styles[k]}},
 removeAttribute(){},setAttribute(){},
 getAttribute:k=>k==='data-p79-attendance-date'?date:null};
const strip={querySelectorAll(){return [button]},querySelector(){return null},appendChild(){}};
const document={readyState:'complete',getElementById:id=>id==='p79AttendanceDateStrip'?strip:null,
 createElement:()=>({style:{}})};
const ctx={document,URL,AbortController,setTimeout,clearTimeout,
 location:{href:'https://example.test/attendance/'},
 renderRecordsPagination(){},addEventListener(){},
 getAttendanceEmployeeMasterToken:()=> 'TOKEN',getActiveGasUrl:()=> 'https://example.test/gas',
 p79AttendanceOvertimeMonths:months,
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
 fetch:async(url,opts)=>{requests.push({url,opts});return responses.shift()||{ok:true,json:async()=>makeCloud('new')};}
};
ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
const api=ctx.P79AttendanceOvertimeDayStatus;
function color(){api.decorateOvertimeDateStrip([date],date);return styles['background-color'];}
(async()=>{
 assert.equal(color(),'#fee2e2','stale revoked month initially red');
 responses.push({ok:true,json:async()=>makeCloud('new')});
 const fixed=await api.recheckAndMarkReviewed(date,true);
 assert.equal(fixed.ok,true);
 assert.match(fixed.message,/已確認 1 筆有效申報/);
 assert.equal(color(),'#dcfce7','fresh effective report is green after checking');
 assert(requests[0].url.includes('action=getScheduleDataSecure'));
 assert(requests[0].url.includes('month=2026-10'));
 assert.equal(requests[0].opts.cache,'no-store');
 responses.push({ok:true,json:async()=>makeCloud('old')});
 const missing=await api.recheckAndMarkReviewed(date,true);
 assert.equal(missing.ok,false);
 assert.match(missing.message,/本次班表回傳 0 筆申報候選資料、2 筆已確認取消歷史/);
 assert.match(missing.message,/不代表你沒有正式申報/);
 assert.equal(color(),'#fee2e2','refuse to paint revoked-only date green');
 responses.push({ok:true,json:async()=>makeCloud('same-id')});
 const conflict=await api.recheckAndMarkReviewed(date,true);
 assert.equal(conflict.ok,false,'same report ID conflicts with historical revocation');
 assert.match(conflict.message,/1 筆申報編號與取消紀錄相同/);
 assert.match(conflict.message,/不代表你沒有正式申報/);
 responses.push({ok:false,json:async()=>({ok:false,error:'權限不足'})});
 const error=await api.recheckAndMarkReviewed(date,true);
 assert.equal(error.ok,false);assert.match(error.message,/權限不足/);
 assert.equal(requests.length,4,'each explicit click hits GAS, never stale month cache');
 console.log('PASS 10/12: fresh GAS report makes green, revoked-only reports remain unverified with evidence and no false claim of non-filing, errors are visible');
})().catch(e=>{console.error(e);process.exitCode=1});

'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('hr/port79-hr-live-statistics.js','utf8');
const M=require('../hr/port79-hr-verified-metrics.js');
const E=require('../attendance/v6-engine.js');
const nodes=new Map(),node=id=>{
 if(!nodes.has(id))nodes.set(id,{value:id==='p79rWorkDate'?'2026-11-12':'',innerHTML:'',textContent:'',style:{},closest:()=>({style:{}})});
 return nodes.get(id);
};
const requests=[];
const session={empId:'ADMIN',adminRole:'superadmin'};
const storage={getItem:k=>k==='port79_user_token'?'TEST':k==='port79_user_session'?JSON.stringify(session):k==='port79_gas_url'?'https://script.google.com/macros/s/TEST/exec':null};
const staff=[{empId:'A',attNo:'001',name:'Alice',employmentStatus:'active',startDate:'2026-01-01'}];
const win={P79HrVerifiedMetrics:M,P79AttendanceV6:E,p79HrDashRender(){}};
const ctx={window:win,document:{getElementById:node,addEventListener(){}},
 employees:staff,p79HrCloudDataReady:true,token:'TEST',
 sessionStorage:storage,Date,Intl,URL,AbortController,setTimeout,clearTimeout,console,
 fetch:async url=>{
  const parsed=new URL(url),action=parsed.searchParams.get('action'),month=parsed.searchParams.get('month');
  requests.push([action,month]);
  const response=action==='getLeaveData'?{ok:true,employees:staff,leaveRecords:[]}:
   action==='getAttendanceMonthData'?{ok:true,month,records:[]}:
   action==='getScheduleDataSecure'?{ok:true,month,schedules:[{empId:'A',schedule:{'2026-11-12':'早','2026-11-13':'早'}}]}:
   null;
  assert(response,'known authorized action');
  return {ok:true,text:async()=>JSON.stringify(response)};
 }
};
vm.createContext(ctx);vm.runInContext(source,ctx);
(async()=>{
 await win.P79HrStatistics.refresh();
 assert.equal(requests.length,3,'current-day initial render fetches only leave, attendance, and current schedule');
 assert(!requests.some(([action,month])=>action==='getScheduleDataSecure'&&month==='2026-12'));
 assert.equal(requests.filter(([action])=>action==='getLeaveData').length,1);
 assert.equal(win.P79HrStatistics.getTimings().length,3);
 const timing=JSON.stringify(win.P79HrStatistics.getTimings());
 assert(!timing.includes('TEST')&&!timing.includes('Alice'),'timing diagnostics contain no credentials or private records');
 node('p79rWorkDate').value='2026-11-13';
 win.p79HrDashRender();
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(requests.length,3,'changing date within one month reuses in-memory authorized data');
 node('p79rWorkDate').value='2026-11-30';
 win.p79HrDashRender();
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(requests.length,4,'month-end cross-midnight pairing fetches only next-month punches');
 assert(requests.some(([action,month])=>action==='getAttendanceMonthData'&&month==='2026-12'));
 assert(!requests.some(([action,month])=>action==='getScheduleDataSecure'&&month==='2026-12'));
 await win.P79HrStatistics.refresh();
 assert.equal(requests.length,8,'manual force refresh bypasses all monthly source cache entries');
 session.empId='OTHER';session.adminRole='admin';session.systemPermissions={attendance:'none',leave:'none',schedule:'none',workhours:'none'};
 win.p79HrDashRender();
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(requests.length,8,'changing permission scope never reuses or fetches forbidden sources');
 assert.match(node('p79rAttendanceDetails').innerHTML,/權限/);
 console.log('PASS HR fast-source calendar reuse, month-end records, manual refresh, permission isolation and redacted diagnostics');
})().catch(e=>{console.error(e);process.exitCode=1});

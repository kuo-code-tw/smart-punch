'use strict';
const fs=require('node:fs');
function test(core,ui){
 const window={};new Function('window',core)(window);new Function('window','document',ui)(window,{});
 const api=window.P79MonthlyRest,view=window.P79MonthlyRestDashboard,assert=(x,m)=>{if(!x)throw Error(m)};
 const model={balances:[{emp:{empId:'A'},remaining:{例:0,休:3,國:0},reported:{例:0,休:2,國:0},formalReported:{例:0,休:1,國:0}},{emp:{empId:'B'},remaining:{例:0,休:1,國:0},reported:{例:0,休:0,國:0}}],rows:[{id:'R17',empId:'A',category:'休',date:'2026-11-17',checked:false},{id:'R23',empId:'B',category:'休',checked:true}]};
 const label=(preview=false)=>view.quotaProgressLabel(api.personQuotaProgress(model,'A'),preview);
 assert(label()==='例0/0／休1/3／國0/0','actual verified report, not planned');
 model.rows[0].checked=true;
 assert(label()==='例0/0／休1/3／國0/0'&&label(true)==='例0/0／休2/2／國0/0','checked preview separate from saved');
 model.rows[0].checked=false;assert(label(true)===label(),'uncheck restores preview');
 model.rows[0].saved=true;
 assert(label()==='例0/0／休2/2／國0/0','success updates actual quota once');
 assert(api.rosterReviewRows(model,[{empId:'A',name:'A'}])[0].remaining.休===2,'pending review uses updated remaining');
 model.balances[0].remaining.休=2;model.balances[0].formalReported.休=2;model.rows.shift();
 assert(label()==='例0/0／休2/2／國0/0','fresh snapshot no double count');
 assert(core.includes('meta.overtimeReport.planned!==true')&&core.includes('report.planned!==true'),'plan is not formal readback');
 assert(core.includes('note:backfillContext(loadedMonth).note,preventReplace:false'),'new report can be created');
 assert(core.includes('if(meta.overtimeReport||meta.overtime||meta.forEmpId'),'existing day guard retained');
 assert(ui.includes('申報後 '),'visible preview');
 return 'PASS existing 1/3, checked 2/2 preview, confirmed 2/2, uncheck, refresh, employee isolation, new report guard';
}
console.log(test(fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8'),fs.readFileSync('assets/port79-monthly-rest-dashboard.js','utf8')));

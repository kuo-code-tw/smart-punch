'use strict';
const fs=require('node:fs');
function test(src){
 const window={};new Function('window','document',src)(window,{});
 const api=window.P79MonthlyRestDashboard,assert=(v,m)=>{if(!v)throw Error(m)};
 const person={kind:'roster',id:'A',name:'員工甲',role:'ARMG',category:'例0／休3／國0',due:3,reviewType:'deficit',suggestions:[
  {date:'2026-11-17',category:'休',period:'休16-24'},
  {date:'2026-11-28',category:'休',period:'休24-08',referenceOnly:true},
  {date:'2026-11-29',category:'休',period:'休24-08',referenceOnly:true}]};
 const data={ready:[{kind:'ready',id:'R17',empId:'A',name:'員工甲',date:'2026-11-17',category:'休',period:'休16-24',hours:'8 小時',status:'可申報',checked:false,disabled:false}],planned:[],roster:[person]};
 const before=JSON.stringify(data);
 const rows=api.dailyPendingRows(data);
 assert(rows.length===3,'three dates, exactly three rows');
 assert(rows.map(r=>r.date).join(',')==='2026-11-17,2026-11-28,2026-11-29','date order');
 assert(rows[0].id==='R17'&&api.selectionMode(rows[0])==='native','actual date retains original ID');
 assert(rows.slice(1).every(r=>r.kind==='reference'&&api.selectionMode(r)==='review'&&r.hours==='—'),'unverified suggestions cannot submit');
 const picked=new Set();api.markForReview(picked,rows[1],true);
 assert(api.reviewSelected(picked,rows[1])&&!api.reviewSelected(picked,rows[2]),'each date independent');
 assert(JSON.stringify(data)===before,'no source changes');
 const plan={kind:'plan',id:'P28',empId:'A',name:'員工甲',date:'2026-11-28',category:'休',period:'休24-08',status:'預排草案',checked:false,disabled:false};
 const mixed=api.dailyPendingRows({...data,planned:[plan]});
 assert(mixed.length===3&&mixed[1].id==='P28'&&api.selectionMode(mixed[1])==='native','real plan replaces preview without duplicate');
 const residual=api.dailyPendingRows({...data,roster:[{...person,due:4}]});
 assert(residual.length===4&&residual[3].kind==='roster'&&residual[3].suggestions.length===0,'unresolved quota remains separate');
 assert(!src.includes('personActionRows(sourceRows(el),row)'),'no grouped checkbox');
 return 'PASS one row per employee/date, no duplicate preview, separate selection, native ID preserved, unresolved quota retained';
}
console.log(test(fs.readFileSync('assets/port79-monthly-rest-dashboard.js','utf8')));

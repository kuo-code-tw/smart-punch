'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const helper=fs.readFileSync('assets/port79-leave-cover-suggest.js','utf8');
const ui=fs.readFileSync('assets/port79-approved-cover-auto.js','utf8');
const html=fs.readFileSync('leave/index.html','utf8');
const elements=new Map();
function el(id){
 if(!elements.has(id))elements.set(id,{id,hidden:false,innerHTML:'',textContent:'',value:'',
  querySelectorAll:()=>[],get options(){return [];}});
 return elements.get(id);
}
const document={getElementById:el};
const window={};const context={window,document,Date,Set,Map,Error};
vm.runInNewContext(helper,context);vm.runInNewContext(ui,context);
const api=window.P79ApprovedCoverAuto;
const day='2026-11-27';
const people=[
 {empId:'LEAVER',dept:'第二事業處',jobTitle:'指揮手',name:'請假者'},
 {empId:'MID',dept:'第二事業處',jobTitle:'指揮手',name:'中班甲'},
 {empId:'EARLY',dept:'第二事業處',jobTitle:'指揮手',name:'早班乙'},
 {empId:'OTHER',dept:'第二事業處',jobTitle:'F/L',name:'其他職稱'}
];
const leave={id:'LEAVE_1',empId:'LEAVER',startDate:day,endDate:'2026-11-29',status:'已核准'};
const scheduleData={ok:true,month:'2026-11',schedules:[
 {empId:'LEAVER',schedule:{27:'晚',28:'晚',29:'晚'}},
 {empId:'MID',schedule:{27:'中',28:'中',29:'中',30:'中'}},
 {empId:'EARLY',schedule:{28:'早',29:'早',30:'早'}},
 {empId:'OTHER',schedule:{27:'中',28:'中',29:'中'}}
]};
const fetchMonth=async(month)=>month==='2026-11'?scheduleData:{ok:true,month,schedules:[]};
async function run(){
 el('p79LeaveCoverModal').hidden=false;
 const dates=Array.from(api.days('2026-11-27','2026-11-29'));
 assert.deepEqual(dates,['2026-11-27','2026-11-28','2026-11-29']);
 await api.open({leave,people,leaves:[leave],covers:[],fetchMonth});
 assert.equal(el('p79LeaveCoverDefaultWorkers').hidden,true,'multi-day display uses per-date recommendations');
 assert.equal(el('p79LeaveCoverDailyRows').hidden,false);
 const markup=el('p79LeaveCoverDailyRows').innerHTML;
 assert(markup.includes('2026-11-27')&&markup.includes('2026-11-28')&&markup.includes('2026-11-29'),'all three dates rendered');
 assert(markup.includes('中班甲')&&markup.includes('早班乙'),'actual people named in drop-down options');
 const assignments=Array.from(api.collect());
 assert.equal(assignments.length,3);
 for(const a of assignments){assert.equal(a.mode,'two');assert.deepEqual(Array.from(a.workerIds),['MID','EARLY']);}
 assert(el('p79LeaveCoverAutoStatus').textContent.includes('3 天'),'explains multi-day roster result');
 api.close();
 assert.equal(el('p79LeaveCoverDailyRows').hidden,true);
 await api.open({leave,people,leaves:[leave,{empId:'EARLY',startDate:'2026-11-28',endDate:'2026-11-28',status:'已核准'}],covers:[],fetchMonth});
 assert.throws(()=>api.collect(),/2026-11-27|2026-11-28|2026-11-29/,'unavailable employee must not silently produce two valid names');
 api.close();
 await api.open({leave,people,leaves:[leave],covers:[{leaveId:'LEAVE_1',workerIds:['MID'],startDate:day,endDate:'2026-11-29'}],fetchMonth});
 assert.equal(api.collect(),null,'existing cloud assignment protected from overwriting by new auto recommendation');
 assert(el('p79LeaveCoverAutoStatus').textContent.includes('保留'));
 assert(html.includes('void window.P79ApprovedCoverAuto?.open({leave,people:employees'),'real approved-leave Arrange Cover entry connected');
 assert(html.includes('dailyAssignments:daily'),'multi-day save uses backend dailyAssignments API');
 assert(html.includes("saved.dailyAssignmentsSaved!==true"),'cloud save receipt checked for every date');
 assert(html.includes('window.P79ApprovedCoverAuto?.close()'),'pending request invalidated on close');
 assert(html.includes("getScheduleDataSecure&gcToken="),'uses authenticated official roster');
 assert(html.includes('port79-approved-cover-auto.js?v='),'approved leave module loaded');
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))
  if(!/\bsrc=|application\/json|importmap/.test(match[1]))new vm.Script(match[2]);
 console.log('PASS approved 3-day leave: official numbered-day roster, name recommendations, daily 4h split, date-specific restrictions, no overwrites, parse-safe page');
}
run().catch(e=>{console.error(e);process.exitCode=1});

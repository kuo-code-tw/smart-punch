'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const window={},nodes=new Map();
function get(id){
 if(!nodes.has(id))nodes.set(id,{id,hidden:false,innerHTML:'',textContent:'',value:'',options:[],querySelectorAll:()=>[]});
 return nodes.get(id);
}
const ctx={window,document:{getElementById:get},Date,Map,Set,Error};
vm.createContext(ctx);
for(const file of ['assets/port79-leave-cover-suggest.js','assets/port79-smart-cover-picker.js','assets/port79-approved-cover-auto.js'])
 vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
const date='2026-11-08';
const people=[
 {empId:'LEAVER',name:'請假甲',dept:'A',jobTitle:'指揮手'},
 {empId:'REST',name:'休假乙',dept:'A',jobTitle:'指揮手'},
 {empId:'BUSY',name:'上班丙',dept:'A',jobTitle:'指揮手'},
 {empId:'LEAVE',name:'請假丁',dept:'A',jobTitle:'指揮手'}
];
const leave={id:'L-A',empId:'LEAVER',status:'已核准',startDate:date,endDate:date};
const schedule={ok:true,month:'2026-11',schedules:people.map(p=>({empId:p.empId,schedule:{8:p.empId==='REST'?'休':p.empId==='LEAVER'?'中':'中'}}))};
async function fetchMonth(month){return month==='2026-11'?schedule:{ok:true,month,schedules:[]};}
(async()=>{
 const api=window.P79ApprovedCoverAuto;
 get('p79LeaveCoverModal').hidden=false;
 await api.open({leave,people,leaves:[leave],covers:[],fetchMonth});
 let result=Array.from(api.collect());
 assert.equal(result.length,1);
 assert.equal(result[0].mode,'one','middle shift has one 8-hour rest recommendation');
 assert.deepEqual(Array.from(result[0].workerIds),['REST']);
 assert(get('p79LeaveCoverDefaultWorkers').hidden===true);
 assert(get('p79LeaveCoverDailyRows').innerHTML.includes('data-smart-action="pick"'));
 assert(get('p79LeaveCoverDailyRows').innerHTML.includes('休假乙'));
 assert(!get('p79LeaveCoverDailyRows').innerHTML.includes('不可安排代班'));

 api.close();get('p79LeaveCoverModal').hidden=false;
 await api.open({leave,people,leaves:[leave,{empId:'REST',status:'已核准',startDate:date,endDate:date}],covers:[],fetchMonth});
 assert.throws(()=>api.collect(),/2026-11-08/,'approved leave employee cannot be saved');

 api.close();get('p79LeaveCoverModal').hidden=false;
 await api.open({leave,people,leaves:[leave],covers:[{leaveId:'L-A',workerIds:['REST'],startDate:date,endDate:date}],fetchMonth});
 assert.equal(api.collect(),null,'pre-existing cloud cover is not replaced implicitly');
 assert.match(get('p79LeaveCoverAutoStatus').textContent,/保留/);
 console.log('PASS unified approved dialog: middle-shift rest auto-choice, checked one-8h result, approved leave exclusion and existing-cover protection');
})().catch(e=>{console.error(e);process.exitCode=1});

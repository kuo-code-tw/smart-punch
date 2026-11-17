'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('work-hours/index.html','utf8');
const ui=fs.readFileSync('assets/port79-workhours-hidden-job-ui.js','utf8');
const policy=fs.readFileSync('assets/port79-hidden-job-titles.js','utf8');
for(const asset of ['port79-hidden-job-titles.js?v=20261117-hr-hidden-v1','port79-workhours-hidden-job-ui.js?v=20261117-hr-filter-v1'])
 assert(html.includes(asset),'work-hours must load production HR hidden-title UI policy');
assert(html.indexOf('port79-hidden-job-titles.js')<html.indexOf('port79-workhours-hidden-job-ui.js'),'HR policy first');
assert(html.includes('p79WorkhoursRosterForVisibility'),'read only original HR employee roster');
const ids=['recordJobTitleFilter','liveJobTitleFilter','overtimeJobTitleFilter',
 'attendanceStatsJobTitle','leaveBalanceJobTitleFilter','leaveJobTitleFilter','manualLeaveJobTitle'];
for(const id of ids){
 assert(html.includes('id="'+id+'"'),'original system filter remains: '+id);
 assert(ui.includes(id),'hidden-job policy must cover all work-hours job filters: '+id);
}
const people=[{empId:'001',name:'甲',jobTitle:'F/L'}, {empId:'002',name:'乙',jobTitle:'領班'}, {empId:'003',name:'丙',jobTitle:'司機'}];
let status='loading',hidden=['F/L','領班'];
const root={
 Port79JobTitleVisibility:{
  ready:()=>status==='ready',isVisible:role=>!hidden.includes(role),
  status:()=>status,revision:()=>1
 }
};
const context={module:{exports:{}},window:root,console};
vm.createContext(context);
vm.runInContext(policy, {module:{exports:{}},console,Set,Date,AbortController,window:undefined});
vm.runInContext(ui,context);
const api=root.Port79WorkhoursHiddenJobUI;
assert(api,'expose work-hours read-only presentation policy');
assert.equal(api.ROLES.length,7,'all seven job controls covered');
const options=[
 {value:'ALL',label:'全部職稱',disabled:false},
 {value:'F/L',label:'F/L',disabled:false},
 {value:'領班',label:'領班',disabled:false},
 {value:'司機',label:'司機',disabled:false}
];
assert.equal(api.ready(),false);
assert.deepEqual(JSON.parse(JSON.stringify(api.desiredOptions('job',options,people))),
 [{value:'ALL',label:'人資隱藏職稱設定待核對',disabled:false}],
 'policy unreadable: no hidden role names may be presented');
status='ready';
assert.equal(api.visible('F/L'),false);
assert.equal(api.visible('領班'),false);
assert.equal(api.visible('司機'),true);
assert.deepEqual(JSON.parse(JSON.stringify(api.desiredOptions('job',options,people))),
 [{value:'ALL',label:'全部職稱',disabled:false},{value:'司機',label:'司機',disabled:false}],
 'both user-hidden roles excluded from work-hours and overtime dropdowns');
const employeeOptions=[
 {value:'ALL',label:'全部姓名',disabled:false},
 {value:'001',label:'甲',disabled:false},
 {value:'002',label:'乙',disabled:false},
 {value:'003',label:'丙',disabled:false}
];
assert.deepEqual(JSON.parse(JSON.stringify(api.desiredOptions('person',employeeOptions,people))).map(x=>x.value),
 ['ALL','003'],'name selector also excludes people whose titles were hidden');
assert.equal(api.eligiblePersonOption({value:'UNKNOWN',label:'未核對的紀錄'},people),true,
 'never infer hidden status of unrelated historical record');
assert(html.includes('id="overtimeDeptFilter"'),'unit filter remains');
assert(html.includes('id="attendanceStatsDept"'),'attendance units remain');
assert(ui.includes("el.dispatchEvent(new Event('change'"),'invalid selected job triggers original dependent filter refresh');
assert(!/(?:postCloud|saveData|updateEmployee|addOvertime|deleteOvertime)\s*\(/i.test(ui),
 'visual adaptation never writes or alters calculations');
new vm.Script(ui);
console.log('PASS HR V2 hidden job titles: 7 work-hours/overtime selectors, matching names, fail-closed, source safety');

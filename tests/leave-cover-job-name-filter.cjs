'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const pickerSource=fs.readFileSync('assets/port79-smart-cover-picker.js','utf8');
const dailySource=fs.readFileSync('assets/port79-leave-daily-simple.js','utf8');
const approvedSource=fs.readFileSync('assets/port79-approved-cover-auto.js','utf8');
const page=fs.readFileSync('leave/index.html','utf8');
const window={};
vm.runInNewContext(pickerSource,{window,Date,Map,Set});
const picker=window.P79SmartCoverPicker,date='2026-11-08';
const person=(empId,name,jobTitle,dept='一處')=>({empId,name,jobTitle,dept,employmentStatus:'active'});
const people=[
 person('LEAVER','請假人員','指揮手'),
 person('W1','王明安','指揮手'),
 person('W2','王明安','指揮手'),
 person('W3','陳建華','堆高機'),
 person('W4','郭正宏','堆高機'),
 person('OTHER','不同部門員工','指揮手','二處')
];
const rosters=new Map(people.map(p=>[p.empId,{[date]:'休'}]));
const params={people,target:people[0],date,selected:['W1','W3'],mode:'two',scope:'new',rosters};
const options=picker.candidates(params);
assert.equal(options.length,4,'only same-department active workers eligible');
let html=picker.render(params);
assert(html.includes('data-smart-action="filter-job"'),'職稱下拉存在');
assert(html.includes('data-smart-action="filter-name"'),'姓名下拉存在');
assert(!html.includes('data-smart-action="filter-unit"'),'舊單位篩選已移除');
assert(html.includes('全部職稱')&&html.includes('全部姓名'),'both filters allow reset');
assert(!html.includes('不同部門員工'),'cannot expose workers from other departments');
assert(html.includes('W1')&&html.includes('W2'),'same names must use different IDs');
assert(html.includes('王明安（W1）')&&html.includes('王明安（W2）'),'duplicate name options disambiguated by employee ID');
html=picker.render({...params,jobFilter:'指揮手'});
assert(html.includes('<strong>王明安</strong>'),'job filter displays matching candidates');
assert(!html.includes('<strong>陳建華</strong>'),'wrong-title worker hidden from candidate list');
assert(!html.includes('郭正宏（W4）'),'name dropdown narrows to selected job title');
assert(html.includes('已勾選 2 / 2 位'),'hidden selected worker remains counted');
assert(html.includes('陳建華</span>'),'hidden selected worker remains in preview');
assert.deepEqual(Array.from(picker.recommend({...params,jobFilter:'指揮手'},'two')).sort(),['W1','W2'],'recommendation honors job filter');
html=picker.render({...params,jobFilter:'指揮手',nameFilter:'W2'});
assert(html.includes('data-smart-id="W2"'),'name filter matches exact employee');
assert(!html.includes('data-smart-id="W1"'),'same-name colleague excluded by ID');
assert(!html.includes('data-smart-id="W3"'),'different job colleague excluded');
assert(html.includes('已勾選 2 / 2 位'),'filter never clears selected workers');
assert(html.includes('陳建華</span>'),'filtered worker still visible in saved selection preview');
assert.deepEqual(Array.from(picker.recommend({...params,jobFilter:'指揮手',nameFilter:'W2'},'two')),['W2'],'recommend honors name selection');
assert.equal(picker.visible(options,{jobFilter:'指揮手',nameFilter:'W2'}).length,1);
assert.equal(picker.visible(options,{jobFilter:'堆高機',nameFilter:'W2'}).length,0,'stale name and job can never incorrectly match');
const events=[],getDate=()=>({dataset:{smartDate:date}});
const job={dataset:{smartAction:'filter-job'},value:'堆高機',closest:getDate};
const name={dataset:{smartAction:'filter-name'},value:'W3',closest:getDate};
picker.bind({querySelectorAll:()=>[job,name]},evt=>events.push(evt));
job.onchange();name.onchange();
assert.deepEqual(JSON.parse(JSON.stringify(events)),[
 {kind:'filter-job',date,value:'堆高機'},
 {kind:'filter-name',date,value:'W3'}
],'both dropdowns emit day-scoped selection events');
assert(dailySource.includes("entry.filterJob=action.value;entry.filterName=''"),'new leave resets name when title changes');
assert(approvedSource.includes("row.filterJob=action.value;row.filterName=''"),'approved leave resets name when title changes');
assert(dailySource.includes("entry.filterName=action.value"),'new leave stores name per date');
assert(approvedSource.includes("row.filterName=action.value"),'approved leave stores name per date');
assert(dailySource.includes("nameFilter:row.filterName"),'new leave restores saved name');
assert(approvedSource.includes("nameFilter:entry.filterName"),'approved leave restores saved name');
assert(page.includes('p79-smart-cover-job-name-filter-v3'),'filters styled in both windows');
assert(page.includes('smart-cover-picker.js?v=20261106-job-name-filter-v3'),'JS cache version updated');
const attack=person('X','<script>danger()</script>','<img src=x>');
html=picker.render({...params,people:[...people,attack]});
assert(!html.includes('<script>danger()</script>')&&!html.includes('<img src=x>'),'names and titles escaped');
new vm.Script(pickerSource);new vm.Script(dailySource);new vm.Script(approvedSource);
for(const match of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
 if(!/\bsrc=|application\/json|importmap/.test(match[1])&&match[2].trim())new vm.Script(match[2]);
}
console.log('PASS leave substitute job/name filters: two dialogs, cascaded names, duplicate names, no unit filter, preserved selections, safety and syntax');

'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const js=fs.readFileSync('assets/port79-smart-cover-picker.js','utf8');
const approved=fs.readFileSync('assets/port79-approved-cover-auto.js','utf8');
const fresh=fs.readFileSync('assets/port79-leave-daily-simple.js','utf8');
const leave=fs.readFileSync('leave/index.html','utf8');
const win={};vm.runInNewContext(js,{window:win,Date,Map,Set});
const picker=win.P79SmartCoverPicker;
const date='2026-11-14';
const p=(id,name,job,shift)=>({empId:id,name,jobTitle:job,dept:'第二事業處',employmentStatus:'active',shift});
const people=[
 p('LEAVER','郭昇龍','F/L','晚'),
 p('A','方乃慶','F/L','中'),
 p('B','第二位員工','F/L','早'),
 p('C','其他職稱員工','AQC','中'),
 p('D','已請假同仁','F/L','休'),
 {...p('OUTSIDE','外部單位員工','F/L','休'),dept:'其他部門'}
];
const rosters=new Map(people.map(x=>[x.empId,{[date]:x.shift}]));
const params={people,target:people[0],date,mode:'two',selected:[],jobFilter:'F/L',nameFilter:'A',
 rosters,leaves:[{empId:'D',startDate:date,endDate:date,status:'已核准'}]};
const html=picker.render(params);
assert(html.includes('已勾選 0 / 2 位｜顯示 1 位候選人'),'screenshot reproduced: name filter yields one checkbox');
const selects=[...html.matchAll(/<select data-smart-action="slot" data-smart-slot="([01])"[^>]*>[\s\S]*?<\/select>/g)];
assert.equal(selects.length,2,'two independent worker selectors visible in two-person mode');
assert.equal(selects[0][1],'0');assert.equal(selects[1][1],'1');
for(const [,slot,options] of selects.map(x=>[x[0],x[1],x[0]])){
 assert(options.includes('方乃慶')&&options.includes('第二位員工'),'each slot shows unfiltered eligible same-department workers');
 assert(!options.includes('其他職稱員工'),'default direct dropdown shows only the leave worker job title');
 assert(options.includes('已請假同仁')&&options.includes(' disabled'),'unavailable same-title workers remain visible with reason');
 assert(!options.includes('外部單位員工'),'other department must not appear');
}
assert(selects[1][0].includes('disabled'),'second slot is visible but waits for first selection');
const afterFirst=picker.render({...params,selected:['A']});
const second=afterFirst.match(/<select data-smart-action="slot" data-smart-slot="1"[^>]*>[\s\S]*?<\/select>/)?.[0]||'';
assert(second&&!second.match(/^<select[^>]* disabled/),'second slot enabled after first choice');
assert(second.includes('第二位員工'),'second same-title candidate available even though advanced name filter selects A');
assert(html.includes('data-smart-action="slot-job" data-smart-slot="0"'),'first worker has a visible job filter');
assert(html.includes('data-smart-action="slot-job" data-smart-slot="1"'),'second worker has a separate visible job filter');
assert(html.includes('<option value="F/L" selected>F/L</option>'),'target title is selected by default');
const mixed=picker.render({...params,slotJobs:['F/L','AQC']});
const secondMixed=mixed.match(/<select data-smart-action="slot" data-smart-slot="1"[^>]*>[\s\S]*?<\/select>/)?.[0]||'';
assert(secondMixed.includes('其他職稱員工'),'second worker may use another job title');
assert(!secondMixed.includes('方乃慶'),'different slot title filters are independent');

assert(second.includes('已選為另一位'),'first worker cannot be selected as second');
const done=picker.render({...params,selected:['A','B']});
assert(done.includes('已勾選 2 / 2 位'),'two distinct workers complete required selection');
assert(done.includes('合計 8 / 8 小時'),'each four-hour slot contributes four hours');
const singles=picker.render({...params,mode:'one'});
assert.equal([...singles.matchAll(/data-smart-action="slot" data-smart-slot=/g)].length,1,'one-person mode uses one direct worker dropdown');
assert(singles.includes('代班人員（8 小時）'),'one-person mode has a single eight-hour worker field');
assert(singles.includes('<details class="p79-smart-cover-advanced"')&&!singles.includes('<details class="p79-smart-cover-advanced" data-smart-action="advanced" open>'),'advanced filters default collapsed');
assert(picker.render({...params,advancedOpen:true}).includes('data-smart-action="advanced" open'),'optional details can remain expanded across rerenders');
const events=[],makeNode=(n,id)=>({
 dataset:{smartAction:'slot',smartSlot:String(n)},value:id,
 closest:()=>({dataset:{smartDate:date}})
});
const first=makeNode(0,'A'),last=makeNode(1,'B');
picker.bind({querySelectorAll:()=>[first,last]},x=>events.push(x));
first.onchange();last.onchange();
assert.deepEqual(JSON.parse(JSON.stringify(events)),[
 {kind:'slot',date,slot:0,id:'A'},
 {kind:'slot',date,slot:1,id:'B'}
],'both slot callbacks independently address the same leave day');
assert(approved.includes("action.kind==='slot'")&&fresh.includes("action.kind==='slot'"),'both approved and new-leave flows receive slot selections');
assert(approved.includes("entry.mode==='two'&&ids.length!==2"),'approved two-person saves still reject missing second worker');
assert(fresh.includes("ids.length!==(row.secondVisible?2:1)"),'new-leave saves still reject missing second worker');
for(const filename of ['port79-smart-cover-picker.js','port79-approved-cover-auto.js','port79-leave-daily-simple.js']){
 assert(leave.includes(filename+'?v='+(filename==='port79-leave-daily-simple.js'?'20261119-group-consecutive-leave-close-v1':'20261116-sameday-4h-stroke-v1')),'deployed page cache busts '+filename);
}
for(const x of [js,approved,fresh])new vm.Script(x);
console.log('PASS two separate leave-cover selectors; filters no longer hide second choice; duplicate/unavailable workers blocked; both workflows integrated');

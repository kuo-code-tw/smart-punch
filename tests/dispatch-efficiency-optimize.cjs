const assert=require('assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm');
const {optimizeGroups,summarize,buildMonth}=require('../assets/port79-personnel-dispatch.js');
const person=(key,group,containers,hours=10)=>({key,name:key,empId:key,group,containers,hours,hc:0,count:6,invalid:0,confirmed:true,eligible:true,eff:containers/hours});
const people=[
 person('a1','A',50),person('a2','A',300),
 person('b1','B',100),person('b2','B',350),
 person('c1','C',150),person('c2','C',400),
 person('d1','D',10),person('d2','D',990)
];
const snapshot=JSON.stringify(people);
const result=optimizeGroups(people,{lockedGroups:[]});
assert.ok(result.plan,'must propose better assignment');
assert.equal(result.optimal,true,'eight selected people are exhaustively optimized');
assert.ok(result.after.gap<result.before.gap);
assert.deepEqual(result.before.groups.map(g=>g.people),result.after.groups.map(g=>g.people));
assert.deepEqual(result.before.groups.map(g=>g.containers).reduce((a,b)=>a+b),result.after.groups.map(g=>g.containers).reduce((a,b)=>a+b));
assert.equal(JSON.stringify(people),snapshot,'optimization is read-only');
assert.ok(result.moves.every(move=>move.from!==move.to));
const narrow=optimizeGroups(people,{selectedKeys:['a1','b1'],lockedGroups:[]});
assert.ok(!narrow.plan||Object.keys(narrow.plan).every(key=>['a1','b1'].includes(key)));
const protectedResult=optimizeGroups(people,{lockedGroups:['D']});
assert.ok(!protectedResult.plan||Object.keys(protectedResult.plan).every(key=>!key.startsWith('d')));
assert.ok(!protectedResult.plan||Object.values(protectedResult.plan).every(g=>g!=='D'));
assert.ok(!protectedResult.plan||protectedResult.after.groups[3].eff===protectedResult.before.groups[3].eff);
const empty=optimizeGroups(people,{selectedKeys:[],lockedGroups:[]});
assert.ok(!empty.plan&&/至少兩個/.test(empty.reason));
const onlyOneGroup=optimizeGroups(people,{selectedKeys:['a1','a2'],lockedGroups:[]});
assert.ok(!onlyOneGroup.plan);
const missingPerson=person('missing','A',0,0);
missingPerson.eff=null;missingPerson.eligible=false;missingPerson.count=0;
const withMissing=optimizeGroups([...people,missingPerson],{selectedKeys:['missing','a1','b1','c1','d1'],lockedGroups:[]});
assert.ok(!withMissing.plan||!Object.keys(withMissing.plan).includes('missing'));
const ten=[...people,person('a3','A',250),person('b3','B',120)];
const largeA=optimizeGroups(ten,{lockedGroups:[]}),largeB=optimizeGroups(ten,{lockedGroups:[]});
assert.equal(largeA.optimal,false);
assert.deepEqual(largeA.plan,largeB.plan,'large-roster heuristic should be deterministic');
assert.ok(!largeA.plan||largeA.after.gap<=largeA.before.gap);
assert.ok(!largeA.plan||largeA.before.groups.every((g,i)=>g.people===largeA.after.groups[i].people));
const roster=[
 {empId:'1',name:'甲',group:'A組'},
 {empId:'2',name:'乙',group:'B組'},
 {empId:'3',name:'丙',group:'C組'},
 {empId:'4',name:'丁',group:'D組'}
];
const employeeList=roster.map(row=>({...row,employmentStatus:'active'}));
const built=buildMonth({month:'2026-11',records:[],roster,employees:employeeList,metrics:x=>x});
assert.equal(built.length,4,'include all active A-D employees even with no working report');
assert.ok(built.every(p=>!p.eligible),'staff without data must not be given speculative efficiency');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
const js=fs.readFileSync(path.join(__dirname,'../assets/port79-personnel-dispatch.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../assets/port79-personnel-dispatch.css'),'utf8');
for(const match of html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)){
 if(!/\\bsrc=|application\\/ld\\+json/.test(match[1]))new vm.Script(match[2]);
}
for(const id of ['dispatchGroupRoster','dispatchRosterSelection','dispatchUnassigned','dispatchGenerateButton','dispatchBody'])
 assert.match(html,new RegExp('id="'+id+'"'));
assert.match(js,/data-dispatch-select=/);
assert.match(js,/suggestionResult=optimizeGroups/);
assert.match(css,/\\.p79d-roster-grid/);
console.log('PASS complete A-D roster, selected-only optimization, exact small-group optimum, seeded large-group improvement, locks, headcount preservation, and no formal roster mutation');

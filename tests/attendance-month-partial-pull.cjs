const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8'),a=html.indexOf('  async function syncMonth(month, options={}){'),b=html.indexOf('\n  async function startup(',a),source=html.slice(a,b);
function setup(){
 const calls=[],messages=[];
 const c={Date,Promise,Array,console:{warn(){},info(){}},navigator:{onLine:true},records:[{id:'local-pending'}],lastAttendanceCloudRevision:'',validMonth:()=>true,selectedMonth:()=> '2026-10',monthNow:()=> '2026-10',shiftAttendanceMonthKey:(m,d)=>d<0?'2026-09':'2026-11',V2:{busy:new Map(),lastSyncAt:new Map(),lastSourceCounts:{totalMonth:1}},setCloudSyncStatus:(...x)=>messages.push(x),showToast:(...x)=>messages.push(x),fetchCurrentMonthSources:async()=>({rows:[{id:'cloud'}],counts:{},availableMonths:[],revision:'new'}),applyMonth:(month,rows)=>{c.records.push(...rows);},p79RenderOnlyVisibleAttendanceView(){},fetchBoundaryMonth:async month=>{calls.push(month);throw Error('archive offline');}};
 vm.createContext(c);vm.runInContext(source,c);return {c,calls,messages};
}
(async()=>{
 let {c,calls,messages}=setup();assert.equal(await c.syncMonth('2026-10',{showMessage:true}),true);assert.deepEqual(calls,['2026-09']);assert(c.records.some(r=>r.id==='cloud'));assert(c.records.some(r=>r.id==='local-pending'));assert(messages.some(x=>String(x[0]).includes('尚未')));assert(!messages.some(x=>x[1]==='success'));assert.equal(c.V2.busy.size,0);
 ({c,calls,messages}=setup());c.fetchCurrentMonthSources=async()=>{throw Error('main offline')};assert.equal(await c.syncMonth('2026-10',{showMessage:true}),false);assert.equal(c.records.length,1);assert.equal(calls.length,0);assert.equal(c.V2.busy.size,0);
 console.log('PASS month pull retains pending rows, skips future archive, reports partial boundary separately, real main failure stays failure, busy lock released');
})().catch(e=>{console.error(e);process.exitCode=1});

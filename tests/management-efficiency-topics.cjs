const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../integration-test/management-link.js'),'utf8');
const start=source.indexOf('},"efficiency":function(){')+'},"efficiency":function(){'.length;
const code=source.slice(start,source.indexOf('},"hr":function(){',start));
function setup(){
 const c={window:{},JSON,Array,Promise,loadGcSession:()=> 'synthetic-token',efficiencyCloudScopeParams:()=>({year:'2026'}),getGasUrl:()=> 'https://script.google.com/macros/s/TEST/exec',requireEfficiencyAccess:()=>true,readQueue:()=>[],cloudBusy:false,port79ShipAutoSyncBusy:false,systemEmployees:[{id:'old-person'}],groups:['old-group'],assignments:['old-assignment'],shipMasters:['old-ship'],records:['old-record'],normalizeCloudEmployee:x=>x,mergeAssignmentsKeepLocal:(a,b)=>b,canonicalShipMasters:x=>x,mergeShipMastersPreferComplete:(a,b)=>b,sanitizeShipMasterMetrics:x=>x,mergeCloudRecordsWithLocal:(a,b)=>a,invalidateWorkloadIndex(){},populateSelects(){},renderVesselSummary(){},renderEfficiencyTabFast(){},updateEmployeeDataState(){}};
 vm.createContext(c);vm.runInContext(code,c);return {c,adapter:c.window.P79ManagementContext};
}
(async()=>{
 for(const topics of [['people'],['organization'],['permissions']]){
  const {c,adapter}=setup(),calls=[],oldRecords=c.records,oldShips=c.shipMasters;
  const snap=await adapter.readFresh(async(action)=>{calls.push(action);return {employees:[{id:'new-person'}]}},topics);
  await adapter.applySnapshot(snap);
  assert.deepEqual(calls,['gcGetEmployees']);assert.equal(c.records,oldRecords);assert.equal(c.shipMasters,oldShips);assert.equal(c.systemEmployees[0].id,'new-person');
 }
 {
  const {c,adapter}=setup(),calls=[],people=c.systemEmployees;
  const snap=await adapter.readFresh(async(action,scope)=>{calls.push(action);assert.equal(scope.year,'2026');return {records:[{id:'new-record'}],shipMasters:[{id:'new-ship'}]}},['efficiency']);
  await adapter.applySnapshot(snap);assert.deepEqual(calls,['gcGetData']);assert.equal(c.systemEmployees,people);assert.equal(c.records[0].id,'new-record');
 }
 {
  const {adapter}=setup(),calls=[];
  await adapter.readFresh(async(action)=>{calls.push(action);return action==='gcGetData'?{records:[],shipMasters:[]}:{employees:[]}},['people','efficiency']);assert.deepEqual(calls.sort(),['gcGetData','gcGetEmployees']);
  await assert.rejects(adapter.readFresh(async()=>({}),['efficiency']),/效率資料不完整/);
  await assert.rejects(adapter.readFresh(async()=>({}),['people']),/效率資料不完整/);
  let sent=0;await assert.rejects(adapter.readFresh(async()=>{sent++},['history']),/沒有對應效率管理更新/);assert.equal(sent,0);
 }
 console.log('PASS HR-only notifications omit vessel download and preserve vessel data; vessel-only reads preserve people; combined updates and malformed replies are checked');
})().catch(error=>{console.error(error);process.exitCode=1});

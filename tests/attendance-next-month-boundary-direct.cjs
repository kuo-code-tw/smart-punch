'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const engine=require('../attendance/v6-engine.js');
const html=fs.readFileSync('attendance/index.html','utf8');

const from=html.indexOf('  async function fetchBoundaryMonth(month, originMonth=selectedMonth()){');
const to=html.indexOf('\n  async function syncMonth(',from);
assert(from>=0&&to>from,'cross-month reader must be available');
const context={
  Promise,Set,Date,validMonth:m=>/^\d{4}-\d{2}$/.test(m),selectedMonth:()=> '2026-10',
  normRows:x=>Array.isArray(x)?x:[],
  normalizeImportedAttendanceTime:x=>String(x||'').replace(/-/g,'/'),
  stableAliasKeys:r=>['ID:'+r.id+'|TYPE:'+r.status+'|DAY:'+String(r.timeStr||'').slice(0,10)],
  p79AttendancePreciseVersion:()=>null,
  readApi:async()=>({records:[]})
};
vm.createContext(context);
vm.runInContext(html.slice(from,to),context);
const punch=(id,emp,kind,t)=>({id,empId:emp,attNo:emp,status:kind==='IN'?'上班簽到':'下班簽退',timeStr:t});

(async()=>{
  const start=punch('oct-in','E1','IN','2026/10/31 23:35');
  const nextOut=punch('nov-out','E1','OUT','2026/11/01 07:47');
  let calls=[];
  context.readApi=async(action)=>{calls.push(action);return {records:action==='getAttendanceMainDirect'?[nextOut]:[]}};
  let edge=await context.fetchBoundaryMonth('2026-11','2026-10');
  assert.equal(edge.length,1,'direct official Nov 1 OUT must be returned when raw/history miss it');
  assert.equal(edge[0].timeStr,nextOut.timeStr);
  assert(calls.includes('getAttendanceMainDirect'),'next-month direct source requested');
  let shifts=engine.buildShifts([start,...edge]);
  assert.equal(shifts.length,1);
  assert.equal(shifts[0].accountingDateKey,'2026-10-31');
  assert.equal(shifts[0].accountingMonthKey,'2026-10');
  assert.equal(shifts[0].clockOut.timeStr,'2026/11/01 07:47:00');

  calls=[];
  context.readApi=async(action)=>{calls.push(action);return {records:action==='getAttendanceCoreData'?[nextOut]:[]}};
  edge=await context.fetchBoundaryMonth('2026-11','2026-10');
  assert.equal(edge.length,1,'core fallback must rescue absent Nov 1 source rows');
  assert(calls.includes('getAttendanceCoreData'));

  context.readApi=async(action)=>({records:action==='getAttendanceMonthRaw'?[nextOut]:action==='getAttendanceMainDirect'?[nextOut]:[]});
  edge=await context.fetchBoundaryMonth('2026-11','2026-10');
  assert.equal(edge.length,1,'same Nov 1 OUT found in raw/direct must not double count');

  const aliasStart=html.indexOf('function stableAliasKeys(r){');
  const aliasEnd=html.indexOf('  function chooseBetter(',aliasStart);
  const mergeStart=html.indexOf('function losslessMerge(groups){');
  const mergeEnd=html.indexOf('  let p79V2PersistTimer',mergeStart);
  assert(aliasStart>=0&&aliasEnd>aliasStart&&mergeStart>=0&&mergeEnd>mergeStart);
  const mergeCtx={
    Set,Map,
    getAttendanceRecordType:r=>r.status,
    getAttendanceImportEventKey:r=>r.empId+'|'+r.timeStr+'|'+r.status,
    stripManualPairSuffixFromEventKey:s=>s,
    normalizeImportedAttendanceTime:s=>s,
    normRows:context.normRows,
    isLocallyDeletedAttendanceRecord:()=>false,
    chooseBetter:(a,b)=>a
  };
  vm.createContext(mergeCtx);
  vm.runInContext(html.slice(aliasStart,aliasEnd)+html.slice(mergeStart,mergeEnd),mergeCtx);
  const octOut=punch('recycled-1','E1','OUT','2026/10/31 17:50');
  const novOtherOut=punch('recycled-1','E1','OUT','2026/11/01 07:47');
  const both=mergeCtx.losslessMerge([[octOut],[novOtherOut]]);
  assert.equal(both.length,2,'same legacy ID on two dates must not erase Nov 1 OUT');

  const separate=engine.buildShifts([
    start,nextOut,
    punch('other-in','E2','IN','2026/11/01 09:00'),
    punch('other-out','E2','OUT','2026/11/01 17:00')
  ]);
  assert.equal(separate.length,2,'other employee Nov 1 shift must remain separate');
  assert.equal(separate.filter(s=>s.accountingMonthKey==='2026-10').length,1,'October counts cross-midnight shift once');
  assert.equal(separate.filter(s=>s.accountingMonthKey==='2026-11').length,1,'November keeps independent shift');
  console.log('PASS all staff cross-month boundary direct/core recovery, physical-day IDs, pairing, month accounting and no double count');
})().catch(error=>{console.error(error);process.exitCode=1});

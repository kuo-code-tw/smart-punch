(function(root){
'use strict';
// Typhoon leave reconciliation is deliberately conservative: a multi-day leave
// may be deleted only when EVERY day is covered by a marked typhoon closure.
// The actual cloud endpoint remains responsible for authorization and deleting
// associated cover/overtime data as one linked operation.
const NOTE='颱風停班免計假（自動取消）';
function dateKey(value){
 const m=String(value||'').trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
 if(!m)return '';
 const key=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
 const d=new Date(key+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===key?key:'';
}
function signature(row){
 return [row.id,row.empId,row.leaveType,row.startTime||row.startDate,row.endTime||row.endDate,row.status,row.days??row.hours??''].map(v=>String(v??'')).join('|');
}
function legacyAnnualBalance(row,employees){
 if(!/特休|年假/.test(String(row.leaveType||'')))return false;
 const id=String(row.empId||'').trim().toUpperCase(),attNo=String(row.attNo||'').trim();
 const person=(Array.isArray(employees)?employees:[]).find(emp=>id&&String(emp.empId||'').trim().toUpperCase()===id)||(Array.isArray(employees)?employees:[]).find(emp=>attNo&&String(emp.attNo||'').trim()===attNo);
 if(!person)return true; // Historical applicant cannot be verified against imported annual balance.
 const balance=person.leaveBalance;
 if(!balance||!Number.isFinite(Number(balance.remaining)))return false;
 if(!Array.isArray(balance.baselineApprovedLeaveIds))return true;
 return balance.baselineApprovedLeaveIds.map(String).includes(String(row.id));
}
function buildPlan(records,markedDates,employees=[]){
 const days=new Set((Array.isArray(markedDates)?markedDates:[]).map(dateKey).filter(Boolean));
 const cancel=[],review=[],balanceReview=[];
 for(const row of Array.isArray(records)?records:[]){
  if(!row||!row.id||String(row.status||'')==='已駁回')continue;
  const from=dateKey(row.startTime||row.startDate),to=dateKey(row.endTime||row.endDate||row.startTime||row.startDate);
  if(!from||!to||from>to)continue;
  const total=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;
  if(total<1)continue;
  let affected=0;
  if(total<=366){
   for(let i=0;i<total;i++){
    const date=new Date(Date.parse(from+'T12:00:00Z')+i*86400000).toISOString().slice(0,10);
    if(days.has(date))affected++;
   }
  }else{
   for(const date of days)if(from<=date&&date<=to)affected++;
  }
  if(!affected)continue;
  const item={id:String(row.id),name:String(row.name||row.empId||'未命名'),from,to,affected,total,signature:signature(row)};
  if(affected!==total)review.push(item);
  else if(legacyAnnualBalance(row,employees))balanceReview.push(item);
  else cancel.push(item);
 }
 return {cancel,review,balanceReview};
}
async function run({dates,read,remove,confirm}){
 if(typeof read!=='function'||typeof remove!=='function'||typeof confirm!=='function')throw Error('缺少雲端讀寫或核准程序');
 const first=await read();
 if(!Array.isArray(first?.leaveRecords)||!Array.isArray(first?.leaveCoverAssignments)||!Array.isArray(first?.employees))throw Error('雲端人員、請假或代班資料不完整，禁止自動刪除');
 const initial=buildPlan(first.leaveRecords,dates,first.employees);
 const outcome={note:NOTE,found:initial.cancel.length,review:initial.review,balanceReview:initial.balanceReview,deleted:[],skipped:[],errors:[],confirmed:false};
 if(!initial.cancel.length)return outcome;
 const sample=initial.cancel.slice(0,8).map(row=>row.name+'（'+row.from+(row.from===row.to?'':'～'+row.to)+'）').join('、');
 const message='【'+NOTE+'】\n已核對 '+initial.cancel.length+' 筆請假完全落在颱風假日期。\n'
  +'確認後會從雲端刪除請假單，以及連動的一位／兩位代班安排和相關代班加班；不會刪除代班員工的人事資料。\n'
  +'名單：'+sample+(initial.cancel.length>8?' 等 '+initial.cancel.length+' 筆':'')
  +(initial.review.length?'\n另外 '+initial.review.length+' 筆跨日請假只有部分遇到颱風假，為避免誤刪其他日期，會保留並要求人工調整。':'')
  +(initial.balanceReview.length?'\n另有 '+initial.balanceReview.length+' 筆年假涉及舊匯入餘額基準，需人工核對回補天數，本次不自動刪除。':'')
  +'\n是否執行連動取消？';
 if(!await confirm(message))return outcome;
 outcome.confirmed=true;
 // A second read protects against an earlier cached list or another editor
 // changing a request while the confirmation dialog was open.
 const current=await read();
 if(!Array.isArray(current?.leaveRecords)||!Array.isArray(current?.leaveCoverAssignments)||!Array.isArray(current?.employees))throw Error('重新核對雲端失敗，取消本次刪除');
 const now=buildPlan(current.leaveRecords,dates,current.employees);
 const safe=new Map(now.cancel.map(item=>[item.id,item]));
 for(const item of initial.cancel){
  if(safe.get(item.id)?.signature!==item.signature){
   outcome.skipped.push(item);
   continue;
  }
  try{
   const result=await remove(item.id,NOTE);
   if(result?.linkedDelete!==true)throw Error('伺服器未確認請假、代班與相關加班已連動移除');
   outcome.deleted.push(item);
  }catch(error){
   outcome.errors.push(item.name+'：'+String(error?.message||error));
   // An uncertain cloud result is not safe to retry or to continue bulk deletion.
   break;
  }
 }
 if(outcome.deleted.length){
  try{
   const verified=await read();
   if(!Array.isArray(verified?.leaveRecords)||!Array.isArray(verified?.leaveCoverAssignments)||!Array.isArray(verified?.employees))throw Error('雲端核對資料不完整');
   const residual=new Set([
    ...verified.leaveRecords.map(row=>String(row.id||'')),
    ...verified.leaveCoverAssignments.map(row=>String(row.leaveId||''))
   ]);
   for(const item of outcome.deleted)if(residual.has(item.id))outcome.errors.push(item.name+'：雲端仍有請假或代班資料，請人工核對');
  }catch(error){outcome.errors.push('刪除後讀回核對失敗：'+String(error?.message||error));}
 }
 return outcome;
}
const api={NOTE,dateKey,buildPlan,run};
root.P79TyphoonLeaveSync=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);

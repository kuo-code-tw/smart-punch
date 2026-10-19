(function(global){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x)),id=x=>String(x||'').trim().toUpperCase();
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function nextMonth(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('請選擇有效來源月份');const [y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m,1));return d.toISOString().slice(0,7);}
const dates=month=>Array.from({length:new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate()},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
const canonical=v=>['例','國'].includes(v)?'休':['早','中','晚','休'].includes(v)?v:'';
function cycleFor(rule){
 if(rule.algo==='TWO_TWO')return ['早','早','休','休','晚','晚','休','休'];
 if(rule.algo==='FOUR_TWO')return ['早','早','早','早','休','休','中','中','中','中','休','休','晚','晚','晚','晚','休','休'];
 if(rule.algo==='FIXED_EARLY')return ['早'];
 const values=rule.counts||[];if(values.length!==6||values.some(v=>!Number.isInteger(v)||v<0||v>62)||!values.some(Boolean))throw Error('請先設定有效的自訂輪班天數');
 return values.flatMap((n,i)=>Array(n).fill(['早','休','中','休','晚','休'][i]));
}
function leaveOn(snapshot,emp,date){return (snapshot.leaveRecords||[]).some(l=>id(l.empId)===id(emp)&&['已核准','已核準'].includes(l.status)&&date>=String(l.startDate||l.startTime||'').slice(0,10).replace(/\//g,'-')&&date<=String(l.endDate||l.endTime||l.startDate||l.startTime||'').slice(0,10).replace(/\//g,'-'));}
function coverOn(snapshot,emp,date){return (snapshot.leaveCoverAssignments||[]).some(c=>(id(c.leaveEmpId)===id(emp)||(c.workerIds||[]).some(w=>id(w)===id(emp)))&&date>=c.startDate&&date<=c.endDate);}
function buildPlan(input){
 const {sourceMonth,targetMonth,source,target,people,rule}=input;if(nextMonth(sourceMonth)!==targetMonth)throw Error('目標必須是來源的下一個月份');
 const sourceDays=dates(sourceMonth),targetDays=dates(targetMonth),rows=clone(target.schedules||[]),byId=new Map(rows.map(r=>[id(r.empId),r])),sourceById=new Map((source.schedules||[]).map(r=>[id(r.empId),r]));
 const summaries=[],changes=[],warnings=[];
 for(const person of people){
  const emp=id(person.empId||person.id),from=sourceById.get(emp),summary={empId:emp,name:person.name||emp,added:0,preserved:0,skipped:0,reason:'',cells:[]};summaries.push(summary);
  if(!from){summary.reason='來源月份沒有正式班表，略過';continue;}
  const original=from.schedule||{},personnel=original.__personnel||{};
  if(personnel.lockType==='FIXED_LOCKED'||byId.get(emp)?.schedule?.__personnel?.lockType==='FIXED_LOCKED'){summary.reason='固定鎖定人員，保留原設定並略過';continue;}
  const fixedWeekend=personnel.group==='不輪班';let cycle,phases=[0];
  if(!fixedWeekend){
   const known=sourceDays.map((date,index)=>{const meta=original.__meta?.[date]||{};let value=canonical(original[date]);
    const originalShift=meta.reportOriginalShift??meta.overtimeOriginalShift;
    if(originalShift!==undefined)value=canonical(originalShift);
    else if(meta.overtime||meta.overtimeReport||meta.forEmpId||meta.coverAssignmentId||leaveOn(source,emp,date)||coverOn(source,emp,date))value='';
    return {index,value};}).filter(x=>x.value);
   // 以來源月本人的正常班找最短、可重複驗證的循環，與畫面輪班規則無關。
   for(let period=1;period<=Math.min(21,sourceDays.length-1);period++){
    if(known.length<period+Math.min(7,period))continue;
    const pattern=Array(period).fill(null);let conflict=false;
    for(const item of known){const slot=item.index%period;if(pattern[slot]&&pattern[slot]!==item.value){conflict=true;break;}pattern[slot]=item.value;}
    if(conflict||pattern.some(value=>!value))continue;
    const overlap=known.filter(item=>known.some(other=>other.index===item.index+period)).length;
    if(overlap<Math.min(7,period))continue;
    cycle=pattern;break;
   }
   const knownByIndex=new Map(known.map(item=>[item.index,item.value]));
   summary.sourceTail=sourceDays.map((date,index)=>({date,shift:knownByIndex.get(index)||String(original[date]||'空白')}));
   const manual=Number(input.tailPeriods?.[emp]);
   if(Number.isInteger(manual)&&manual>=1&&manual<=sourceDays.length){
    const start=sourceDays.length-manual,pattern=sourceDays.slice(start).map((_,i)=>knownByIndex.get(start+i));
    if(pattern.some(value=>!value)){summary.reason='選取的月底循環包含請假、加班或空白，請改選正常班完整區段';summary.canChooseTail=true;continue;}
    cycle=pattern;phases=[-start];summary.manualTail=true;
   }
   if(!cycle){
    // 月初調班不應擋住月底已穩定的循環；至少核對連續十四天。
    for(let period=1;period<=15&&!cycle;period++){
     const length=Math.max(14,period*2),start=sourceDays.length-length;if(start<0)continue;
     const tail=sourceDays.slice(start).map((_,i)=>knownByIndex.get(start+i));
     if(tail.some(value=>!value))continue;
     if(tail.every((value,i)=>i<period||value===tail[i-period])){cycle=tail.slice(0,period);phases=[-start];summary.fromTail=true;}
    }
   }
   if(!cycle){summary.reason='無法自動判定，請查看下方來源班表並指定月底循環天數，再套用預覽';summary.canChooseTail=true;continue;}
   summary.cycle=cycle.join('→');
  }
  const lastActual=canonical(original[sourceDays[sourceDays.length-1]]),firstExisting=canonical(byId.get(emp)?.schedule?.[targetDays[0]]);
  const firstPlanned=fixedWeekend?([0,6].includes(new Date(targetDays[0]+'T12:00:00Z').getUTCDay())?'休':'早'):cycle[(sourceDays.length+phases[0])%cycle.length];
  if(lastActual==='晚'&&(firstExisting||firstPlanned)==='早'){summary.reason='跨月晚班接早班，請人工確認；未新增任何班別';continue;}
  let to=byId.get(emp);if(!to){to={empId:emp,name:person.name||from.name,role:from.role,group:from.group,month:targetMonth,schedule:{}};rows.push(to);byId.set(emp,to);}
  const roster=to.schedule||(to.schedule={}),priorMeta=roster.__meta||{},created=[];
  for(let i=0;i<targetDays.length;i++){
   const date=targetDays[i];
   if(Object.prototype.hasOwnProperty.call(roster,date)||Object.prototype.hasOwnProperty.call(priorMeta,date)||leaveOn(target,emp,date)||coverOn(target,emp,date)){summary.preserved++;continue;}
   if(input.eligible&&!input.eligible(person,date)){summary.skipped++;continue;}
   const weekday=new Date(date+'T12:00:00Z').getUTCDay(),shift=fixedWeekend?([0,6].includes(weekday)?'休':'早'):cycle[(sourceDays.length+i+phases[0])%cycle.length];
   roster[date]=shift;created.push(date);summary.cells.push({date,shift});summary.added++;changes.push({empId:emp,date,shift});
  }
  if(!created.length)continue;
  if(!roster.__personnel)roster.__personnel=clone(personnel);
  else if(personnel.group&&personnel.group!=='不分組'&&(!roster.__personnel.group||roster.__personnel.group==='不分組')&&roster.__personnel.groupExplicit!==true){
   roster.__personnel={...roster.__personnel,group:personnel.group};to.group=personnel.group;
  }
  if(input.allocate){
   try{const excluded=targetDays.filter(d=>leaveOn(target,emp,d)||coverOn(target,emp,d));const allocated=input.allocate(roster,priorMeta,targetMonth,excluded,person);
    // 只保存新增格的自動假別資料，既有格的 metadata 一律原樣保留。
    const merged=clone(priorMeta);for(const date of created)if(allocated[date])merged[date]=allocated[date];if(Object.keys(merged).length)roster.__meta=merged;
   }catch(error){warnings.push(summary.name+'：例／休／國未自動配對（'+error.message+'）');}
  }
 }
 return {sourceMonth,targetMonth,rows,summaries,changes,warnings};
}
let draft=null,busy=false,dialog=null;
function ui(){if(dialog)return dialog;const style=document.createElement('style');style.textContent='#p79ContinueDialog{width:min(960px,calc(100vw - 24px));max-height:90dvh;padding:0;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#0f172a}#p79ContinueDialog::backdrop{background:#0f172a88}#p79ContinueDialog .sc-head,#p79ContinueDialog .sc-foot{padding:14px 18px;display:flex;gap:10px;justify-content:space-between;align-items:center}#p79ContinueDialog .sc-body{padding:0 18px 14px;max-height:65dvh;overflow:auto}#p79ContinueDialog .sc-fields{display:flex;gap:14px;flex-wrap:wrap;margin:10px 0}#p79ContinueDialog input{border:1px solid #cbd5e1;border-radius:8px;padding:8px}#p79ContinueDialog button{border:0;border-radius:8px;padding:9px 12px;font-weight:700;cursor:pointer;background:#e2e8f0}#p79ContinueDialog button:disabled{opacity:.5;cursor:wait}#p79ContinueDialog #scSave{background:#047857;color:#fff}#p79ContinueDialog .sc-person{padding:10px 0;border-top:1px solid #e2e8f0}#p79ContinueDialog .sc-days{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px}#p79ContinueDialog .sc-days span{padding:4px 6px;border-radius:5px;background:#eff6ff;color:#1e40af}#p79ContinueDialog .sc-error{color:#b45309}html.dark #p79ContinueDialog{background:#0f172a;color:#e2e8f0}';document.head.appendChild(style);
 dialog=document.createElement('dialog');dialog.id='p79ContinueDialog';dialog.innerHTML='<div class="sc-head"><strong>延續到下個月</strong><button id="scClose">關閉</button></div><div class="sc-body"><p>依來源月份每位員工的實際正常班順序接續，只補下一個月的空白格。既有排班、請假、代班與加班保留；不複製來源月份的請假或加班。</p><div class="sc-fields"><label>來源月份 <input id="scSource" type="month"></label><label>目標月份 <input id="scTarget" type="month" readonly></label><button id="scPreview">產生預覽</button></div><div id="scStatus" role="status"></div><div id="scRows"></div></div><div class="sc-foot"><button id="scCancel">取消</button><button id="scSave" disabled>確認延續並儲存</button></div>';document.body.appendChild(dialog);
 const q=x=>dialog.querySelector('#'+x);q('scClose').onclick=q('scCancel').onclick=()=>{if(!busy)dialog.close();};dialog.oncancel=e=>{if(busy)e.preventDefault();};q('scSource').onchange=()=>{draft=null;q('scSave').disabled=true;q('scRows').textContent='';try{q('scTarget').value=nextMonth(q('scSource').value);}catch(e){q('scStatus').textContent=e.message;}};
 q('scRows').addEventListener('click',applyTail); q('scPreview').onclick=preview;q('scSave').onclick=save;return dialog;
}
function setBusy(v){busy=v;for(const key of ['scClose','scCancel','scPreview','scSource'])dialog.querySelector('#'+key).disabled=v;dialog.querySelector('#scSave').disabled=v||!draft?.plan.changes.length;}
async function preview(){if(busy)return;if(draft?.uncertain){dialog.querySelector('#scStatus').textContent='上一筆儲存仍待確認，請按確認按鈕查詢回條，暫不產生另一份預覽';return;}const ctx=global.P79ScheduleContinuationContext,q=x=>dialog.querySelector('#'+x);draft=null;setBusy(true);q('scStatus').textContent='正在讀取來源與目標月份…';q('scRows').textContent='';try{
 if(!ctx.canManage())throw Error('沒有排班管理權限');await ctx.prepare();const sourceMonth=q('scSource').value,targetMonth=nextMonth(sourceMonth);q('scTarget').value=targetMonth;const token=ctx.token(),[source,target]=await Promise.all([ctx.read(sourceMonth),ctx.read(targetMonth)]);if(ctx.token()!==token)throw Error('登入身分已改變，請重新開啟');
 const rule={},people=ctx.people(source),plan=buildPlan({sourceMonth,targetMonth,source,target,people,rule,eligible:ctx.eligible,allocate:ctx.allocate});draft={tailPeriods:{},token,sourceMonth,targetMonth,source,target,rule,people,plan,requestId:null,uncertain:false};
 renderPlan();
 }catch(e){draft=null;q('scStatus').textContent='預覽未完成：'+e.message;}finally{setBusy(false);}}
function renderPlan(){
 const plan=draft.plan,q=x=>dialog.querySelector('#'+x);
 q('scStatus').textContent='將新增 '+plan.changes.length+' 格；保留 '+plan.summaries.reduce((n,r)=>n+r.preserved,0)+' 格。'+(plan.warnings.length?' '+plan.warnings.join('；'):'');
 q('scRows').innerHTML=plan.summaries.map((r,index)=>'<div class="sc-person"><b>'+esc(r.name)+'</b>　新增 '+r.added+' 格／保留 '+r.preserved+' 格'+(r.cycle?'<div>來源班表循環：'+esc(r.cycle)+'</div>':'')+(r.manualTail?'<div>已指定月底循環</div>':r.fromTail?'<div>依月底連續班表辨識</div>':'')+(r.reason?'<div class="sc-error">'+esc(r.reason)+'</div>':'')+(r.canChooseTail?'<div class="sc-days">'+(r.sourceTail||[]).map(c=>'<span>'+esc(c.date.slice(8))+' '+esc(c.shift)+'</span>').join('')+'</div><label>重複月底最後 <input id="scTail'+index+'" type="number" min="1" max="31" value="'+(draft.tailPeriods[r.empId]||7)+'" style="width:70px"> 天</label> <button type="button" data-tail-index="'+index+'">套用此人的月底循環</button>':'')+'<div class="sc-days">'+r.cells.map(c=>'<span>'+esc(c.date.slice(8))+' '+esc(c.shift)+'</span>').join('')+'</div></div>').join('');
}
function applyTail(event){
 const button=event.target.closest?.('[data-tail-index]');if(!button||busy||!draft||draft.uncertain)return;
 const index=Number(button.dataset.tailIndex),person=draft.plan.summaries[index],period=Number(dialog.querySelector('#scTail'+index).value);
 if(!person||!Number.isInteger(period)||period<1||period>31){dialog.querySelector('#scStatus').textContent='請輸入 1 到 31 的循環天數';return;}
 draft.tailPeriods[person.empId]=period;
 const ctx=global.P79ScheduleContinuationContext;
 draft.plan=buildPlan({...draft,eligible:ctx.eligible,allocate:ctx.allocate});
 renderPlan();setBusy(false);
}
async function save(){if(busy||!draft?.plan.changes.length)return;const ctx=global.P79ScheduleContinuationContext,q=x=>dialog.querySelector('#'+x),d=draft;setBusy(true);q('scStatus').textContent='正在核對編輯權與雲端班表…';try{
 if(ctx.token()!==d.token||!ctx.canManage())throw Error('登入或管理權限已改變');await ctx.prepare();await ctx.acquire();
 if(d.uncertain){const receipt=await ctx.receipt(d.requestId,d.targetMonth);if(!receipt)throw Error('上一筆儲存結果仍未確認，請稍後再次核對，不會重送月份資料');}
 else{
  const [source,target]=await Promise.all([ctx.read(d.sourceMonth),ctx.read(d.targetMonth)]);
  if(JSON.stringify(source.employees)!==JSON.stringify(d.source.employees)||JSON.stringify(source.schedules)!==JSON.stringify(d.source.schedules)||JSON.stringify(target.schedules)!==JSON.stringify(d.target.schedules)||JSON.stringify(source.leaveRecords)!==JSON.stringify(d.source.leaveRecords)||JSON.stringify(target.leaveRecords)!==JSON.stringify(d.target.leaveRecords)||JSON.stringify(source.leaveCoverAssignments)!==JSON.stringify(d.source.leaveCoverAssignments)||JSON.stringify(target.leaveCoverAssignments)!==JSON.stringify(d.target.leaveCoverAssignments))throw Error('班表或請假資料已變更，請重新產生預覽');
  d.requestId=d.requestId||ctx.requestId();d.uncertain=true;await ctx.persist(d.targetMonth,d.plan.rows,d.requestId);
 }
 const verified=await ctx.read(d.targetMonth),index=new Map((verified.schedules||[]).map(r=>[id(r.empId),r.schedule||{}]));
 if(d.plan.changes.some(c=>index.get(c.empId)?.[c.date]!==c.shift))throw Error('雲端尚未讀回完整延續結果，請保留視窗再核對');
 d.uncertain=false;q('scStatus').textContent='已核對並儲存 '+d.targetMonth+' 班表，共新增 '+d.plan.changes.length+' 格。';q('scSave').textContent='已儲存';draft=null;await ctx.afterSave(d.targetMonth);dialog.close();
 }catch(e){if(e.confirmedRejected)d.uncertain=false;q('scStatus').textContent='尚未確認完成：'+e.message;}finally{setBusy(false);}}
function open(sourceMonth){const ctx=global.P79ScheduleContinuationContext;if(!ctx?.canManage())return alert('沒有排班管理權限');ui();draft=null;const month=typeof sourceMonth==='string'?sourceMonth:ctx.month();dialog.querySelector('#scSource').value=month;dialog.querySelector('#scTarget').value=nextMonth(month);dialog.querySelector('#scRows').textContent='';dialog.querySelector('#scStatus').textContent='依來源月份實際班表延續，不使用上方輪班規則；請產生預覽。';dialog.querySelector('#scSave').textContent='確認延續並儲存';setBusy(false);dialog.showModal();}
global.P79ScheduleContinuation={buildPlan,nextMonth,cycleFor,open};
})(typeof window==='undefined'?globalThis:window);

(function(global){
 'use strict';
 const el=id=>document.getElementById(id);
 const escaped=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s);
 const key=x=>String(x??'').trim().toUpperCase();
 const job=p=>String(p?.jobTitle||p?.deptDetail||'').trim()||'未設定職稱';
 let serial=0,state=null;
 function days(start,end){
  if(!validDate(start)||!validDate(end)||start>end)return [];
  const a=Date.parse(start+'T12:00:00Z'),b=Date.parse(end+'T12:00:00Z'),dates=[];
  for(let v=a;v<=b&&dates.length<=62;v+=86400000)dates.push(new Date(v).toISOString().slice(0,10));
  return dates.length<=62?dates:[];
 }
 function close(){serial++;state=null;const host=el('p79LeaveCoverDailyRows');if(host){host.hidden=true;host.innerHTML='';}const box=el('p79LeaveCoverDefaultWorkers');if(box)box.hidden=false;}
 function manual(){if(state)state.manual=true;}
 function eligible(state){
  return state.people.filter(p=>key(p.dept)===key(state.target.dept)&&key(p.empId)!==key(state.target.empId)&&p.empId&&!['resigned','離職','terminated','inactive','leave','loa','留停'].includes(String(p.employmentStatus||'active').toLowerCase()));
 }
 function optionList(state,selected,exclude,required){
  const candidates=eligible(state).filter(p=>key(p.empId)!==key(exclude));
  const placeholder=required?'請選擇代班人員':'不選第二位（單人代班 8 小時）';
  return '<option value="">'+placeholder+'</option>'+candidates.map(p=>'<option value="'+escaped(p.empId)+'"'+(key(p.empId)===key(selected)?' selected':'')+'>'+escaped(p.name||p.empId)+'｜'+escaped(job(p))+'</option>').join('');
 }
 function render(){
  const host=el('p79LeaveCoverDailyRows');if(!state||!host)return;
  const current=eligible(state);
  host.hidden=false;
  host.innerHTML=state.entries.map((entry,index)=>{
   if(!current.some(p=>key(p.empId)===key(entry.first)))entry.first='';
   if(!current.some(p=>key(p.empId)===key(entry.second))||key(entry.first)===key(entry.second))entry.second='';
   const result=entry.recommendation;
   const segment=result?.leaveShift==='晚'?'大夜班':result?.leaveShift==='早'?'早班':'班別待核對';
   const hint=result?.first&&result?.second?'排班建議：'+escaped(result.first.name||result.first.empId)+' '+escaped(result.slots[0].period)+'、'+escaped(result.second.name||result.second.empId)+' '+escaped(result.slots[1].period):escaped(result?.reason||'無法由班表安全推薦，請人工核對');
   const mustTwo=result?.leaveShift==='晚'||result?.leaveShift==='早';
   return '<div style="padding:11px;margin:10px 0;border:1px solid #b8c8d7;border-radius:10px">'+
    '<b>'+escaped(entry.date)+'｜'+segment+'請假</b>'+
    '<label>第一位代班人員</label><select data-cover-day="'+index+'" data-cover-person="first">'+optionList(state,entry.first,'',true)+'</select>'+
    '<label>第二位代班人員'+(mustTwo?'（4 小時支援）':'（可選）')+'</label><select data-cover-day="'+index+'" data-cover-person="second">'+optionList(state,entry.second,entry.first,mustTwo)+'</select>'+
    '<p class="note" style="font-size:12px">'+hint+'。'+(entry.second?'兩人各代 4 小時':'尚未選兩位（單人模式為 8 小時）')+'</p></div>';
  }).join('');
  host.querySelectorAll('select[data-cover-day]').forEach(select=>{
   select.onchange=()=>{
    if(!state)return;
    state.manual=true;
    const item=state.entries[Number(select.dataset.coverDay)];if(!item)return;
    item[select.dataset.coverPerson]=select.value;
    if(key(item.first)===key(item.second))item.second='';
    render();
   };
  });
 }
 function collect(){
  if(!state?.entries?.length)return null;
  const candidates=eligible(state);
  return state.entries.map(entry=>{
   const ids=[entry.first,entry.second].filter(Boolean);
   if(!entry.first||new Set(ids.map(key)).size!==ids.length)throw Error(entry.date+' 請選擇不同的代班人員');
   if(['早','晚'].includes(entry.recommendation?.leaveShift)&&ids.length!==2)
    throw Error(entry.date+' 早班／大夜班請假需選兩位各支援 4 小時，請核對人員');
   for(const id of ids)if(!candidates.some(p=>key(p.empId)===key(id)))
    throw Error(entry.date+' 選擇的人員不在同部門在職名單中，請重新選擇');
   return {date:entry.date,mode:ids.length===2?'two':'one',workerIds:ids};
  });
 }
 async function open({leave,people,leaves=[],covers=[],fetchMonth}){
  close();
  const id=String(leave?.id||''),target=people.find(p=>key(p.empId)===key(leave?.empId));
  const start=String(leave?.startTime||leave?.startDate||'').slice(0,10).replaceAll('/','-'),
        end=String(leave?.endTime||leave?.endDate||start).slice(0,10).replaceAll('/','-');
  const dates=days(start,end),status=el('p79LeaveCoverAutoStatus'),helper=global.P79LeaveCoverSuggest,seq=++serial;
  if(!status)return;
  if(!id||!target||!dates.length){status.textContent='無法核對請假人員或日期；請先重新整理正式資料。';return;}
  if(!helper){status.textContent='推薦模組未載入，請重新整理。';return;}
  if(covers.some(c=>String(c.leaveId)===id)){status.textContent='原請假已有代班安排，保留既有紀錄，不自動更動。';return;}
  state={id,target,people,entries:[],manual:false};
  status.textContent='正在讀取 '+dates.length+' 天正式班表與前後12小時休息條件…';
  try{
   const months=[...new Set(dates.flatMap(date=>helper.monthsFor(date)))];
   const results=await Promise.all(months.map(fetchMonth));
   const roster=helper.mergeRosters(results);
   const allLeaves=[...leaves,...results.flatMap(r=>r.leaveRecords||[])],allCovers=[...covers,...results.flatMap(r=>r.leaveCoverAssignments||[])];
   if(seq!==serial||!state||state.id!==id||state.manual||el('p79LeaveCoverModal')?.hidden)return;
   if(allCovers.some(c=>String(c.leaveId)===id)){status.textContent='雲端發現已有代班安排，已保留原紀錄；請先重新整理。';state=null;return;}
   const entries=dates.map(date=>{const suggestion=helper.suggest({people,rosters:roster,leaves:allLeaves,covers:allCovers,leaveEmpId:target.empId,date});
    return {date,recommendation:suggestion,first:suggestion.first?.empId||'',second:suggestion.second?.empId||''};
   });
   state.entries=entries;
   if(entries.length===1){
    const item=entries[0],r=item.recommendation;
    if(!r.first||!r.second){status.textContent=r.reason||'沒有通過班表與休息時間檢查的兩名人員，可人工選擇。';state=null;return;}
    el('p79LeaveCoverMode').value='two';global.p79RefreshLeaveCoverMode?.();
    el('p79LeaveCoverJob').value=job(r.first);el('p79LeaveCoverSecondJob').value=job(r.second);
    global.p79FilterLeaveCoverPeople?.();
    const first=el('p79LeaveCoverFirst'),second=el('p79LeaveCoverSecond');
    if(![...first.options].some(o=>key(o.value)===key(r.first.empId)))throw Error('第一位建議人員不在選單中');
    first.value=String(r.first.empId);global.p79FilterLeaveCoverPeople?.();
    if(![...second.options].some(o=>key(o.value)===key(r.second.empId)))throw Error('第二位建議人員不在選單中');
    second.value=String(r.second.empId);
    state=null;
    status.textContent='正式班表已建議：'+r.first.name+'（'+r.slots[0].period+'）與'+r.second.name+'（'+r.slots[1].period+'），請核對再儲存。';
   }else{
    el('p79LeaveCoverDefaultWorkers').hidden=true;
    render();
    const matched=entries.filter(item=>item.first&&item.second).length;
    status.textContent='已逐日查詢 '+entries.length+' 天正式班表；'+matched+' 天找到兩位建議人員。缺少人選的日期保留空白，不會套用其他日期的人員。';
   }
  }catch(error){
   if(seq===serial&&status&&!el('p79LeaveCoverModal')?.hidden){
    state=null;
    el('p79LeaveCoverDefaultWorkers').hidden=false;el('p79LeaveCoverDailyRows').hidden=true;
    status.textContent='正式班表尚未讀取成功：'+String(error?.message||error)+'。未自動指定，請核對後手動安排。';
   }
  }
 }
 global.P79ApprovedCoverAuto={open,close,manual,collect,days};
})(typeof window==='undefined'?globalThis:window);

/* Monthly roster labels: accounting quota, not a statutory cycle validator. */
function p79RestQuota(month) {
  if (!/^2026-(0[1-9]|1[0-2])$/.test(month)) throw new Error('目前已核對的國定假日年度為115年（2026）；其他年度尚未建立，未進行自動配對。');
  const holidays = {
    '01-01':'開國紀念日','02-15':'春節前一日','02-16':'除夕','02-17':'春節初一','02-18':'春節初二','02-19':'春節初三',
    '02-28':'和平紀念日','04-04':'兒童節','04-05':'清明節','05-01':'勞動節','06-19':'端午節',
    '09-25':'中秋節','09-28':'教師節','10-10':'國慶日','10-25':'臺灣光復暨金門古寧頭大捷紀念日','12-25':'行憲紀念日'
  };
  const [y,m]=month.split('-').map(Number), days=new Date(y,m,0).getDate(), slots=[];
  for(let d=1;d<=days;d++) {
    const date=month+'-'+String(d).padStart(2,'0'), week=new Date(y,m-1,d).getDay();
    if(week===0)slots.push({category:'例',sourceDate:date});
    if(week===6)slots.push({category:'休',sourceDate:date});
    if(holidays[date.slice(5)])slots.push({category:'國',sourceDate:date,holidayName:holidays[date.slice(5)]});
  }
  return {days,slots,counts:slots.reduce((a,s)=>(a[s.category]++,a),{'例':0,'休':0,'國':0})};
}

function p79AllocateRestMonth(schedule,meta,month,excludedDates=[]) {
  const quota=p79RestQuota(month), result=JSON.parse(JSON.stringify(meta||{})), excluded=new Set(excludedDates);
  const dates=Array.from({length:quota.days},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
  if(dates.some(d=>!schedule[d]))throw new Error('本月有未排班日期，請補齊班表後再配對');
  // Remove only fields owned by this allocator; preserve manual overtime and substitutions.
  for(const date of dates) {
    const item=result[date];if(!item||item.restAllocationSource!=='auto-v1')continue;
    for(const field of ['restCategory','restSourceDate','restHolidayName','restQuotaOvertime','restAllocationSource'])delete item[field];
    if(!Object.keys(item).length)delete result[date];
  }
  const available=dates.filter(d=>schedule[d]==='休'&&!excluded.has(d)&&!result[d]?.restCategory&&!result[d]?.overtime&&!result[d]?.forEmpId);
  const used=new Set(), slots=quota.slots.map(s=>({...s})), remaining=[];
  // Keep manually assigned categories and consume corresponding quota first.
  for(const date of dates) {
    const item=result[date];if(!item?.restCategory||item.restAllocationSource==='auto-v1')continue;
    if(schedule[date]!=='休'&&!item.restQuotaOvertime)throw new Error(date+' 手動假別與班別不一致');
    const index=slots.findIndex(s=>s.category===item.restCategory&&(!item.restSourceDate||s.sourceDate===item.restSourceDate));
    if(index<0)throw new Error('手動「'+item.restCategory+'」超過本月額度或來源日期不符');
    slots.splice(index,1);used.add(date);
  }
  const nearest=(list,source)=>list.filter(d=>!used.has(d)).sort((a,b)=>Math.abs(Number(a.slice(8))-Number(source.slice(8)))-Math.abs(Number(b.slice(8))-Number(source.slice(8)))||a.localeCompare(b))[0];
  const assign=(date,slot,overtime)=>{
    used.add(date);result[date]={...(result[date]||{}),restCategory:slot.category,restSourceDate:slot.sourceDate,
      restHolidayName:slot.holidayName||'',restQuotaOvertime:overtime,restAllocationSource:'auto-v1'};
  };
  // Fill actual days off before assigning any shortfall to an existing work day.
  const offPriority={'例':0,'休':1,'國':2};
  slots.sort((a,b)=>offPriority[a.category]-offPriority[b.category]||a.sourceDate.localeCompare(b.sourceDate));
  for(const slot of slots) {const date=nearest(available,slot.sourceDate);if(date)assign(date,slot,false);else remaining.push(slot);}
  const workers=dates.filter(d=>['早','中','晚'].includes(schedule[d])&&!excluded.has(d)&&!result[d]?.overtime&&!result[d]?.forEmpId&&!result[d]?.restCategory);
  const unresolved=[];
  const overtimePriority={'國':0,'休':1,'例':2};
  remaining.sort((a,b)=>overtimePriority[a.category]-overtimePriority[b.category]||a.sourceDate.localeCompare(b.sourceDate));
  // Spread reminders across the final eight days, beginning one week before month end.
  const finalWeek=workers.filter(d=>Number(d.slice(8))>=quota.days-7).sort();
  const older=workers.filter(d=>Number(d.slice(8))<quota.days-7).sort().reverse();
  const count=Math.min(remaining.length,finalWeek.length),selected=[];
  for(let i=0;i<count;i++)selected.push(finalWeek[count===1?0:Math.round(i*(finalWeek.length-1)/(count-1))]);
  const candidates=[...selected,...older,...finalWeek.filter(d=>!selected.includes(d))];
  for(const slot of remaining) {const date=candidates.find(d=>!used.has(d));if(date)assign(date,slot,true);else unresolved.push(slot);}
  const assigned=dates.map(d=>result[d]).filter(x=>x?.restCategory);
  return {meta:result,quota:quota.counts,off:assigned.filter(x=>!x.restQuotaOvertime).length,
    overtime:assigned.filter(x=>x.restQuotaOvertime).length,unresolved};
}

function p79RestActualOvertimeMinutes(totalMinutes,meta) {
  if(!Number.isFinite(totalMinutes)||totalMinutes<=0)return 0;
  if(meta?.restQuotaOvertime===true&&['例','休','國'].includes(meta.restCategory))return totalMinutes;
  return totalMinutes>510 ? totalMinutes-480 : 0;
}

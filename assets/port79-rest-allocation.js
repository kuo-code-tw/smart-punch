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

function p79AllocateRestMonth(schedule,meta,month,excludedDates=[],employmentStart='',employmentEnd='',nationalExcludedDates=[],typhoonDates=[]) {
  const quota=p79RestQuota(month), result=JSON.parse(JSON.stringify(meta||{})), excluded=new Set(excludedDates),nationalBlocked=new Set(nationalExcludedDates),typhoonProtected=new Set(typhoonDates);
  const allDates=Array.from({length:quota.days},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
  const dates=allDates.filter(d=>(!employmentStart||d>=employmentStart)&&(!employmentEnd||d<employmentEnd));
  quota.slots=quota.slots.filter(s=>(!employmentStart||s.sourceDate>=employmentStart)&&(!employmentEnd||s.sourceDate<employmentEnd));
  quota.counts=quota.slots.reduce((a,s)=>(a[s.category]++,a),{'例':0,'休':0,'國':0});
  if(dates.some(d=>!schedule[d]))throw new Error('本月有未排班日期，請補齊班表後再配對');
  // Remove only fields owned by this allocator; preserve manual overtime and substitutions.
  for(const date of dates) {
    const item=result[date];if(!item||item.restAllocationSource!=='auto-v1')continue;
    for(const field of ['restCategory','restSourceDate','restHolidayName','restQuotaOvertime','restAllocationSource'])delete item[field];
    if(!Object.keys(item).length)delete result[date];
  }
  // 颱風日不是例／休／國；清除舊的自動或人工休假額度註記，但不改原班別，
  // 也不觸碰正式加班、代班、鎖定欄位。颱日不得藉舊標記消耗任何休假額度。
  for(const date of dates) {
    if(!typhoonProtected.has(date))continue;
    const item=result[date];if(!item)continue;
    const formalWork=item.overtimeReport||item.overtimeReports?.length||item.overtime||
      item.forEmpId||item.type==='substitute'||item.restQuotaOvertime;
    if(formalWork)continue;
    for(const field of ['restCategory','restSourceDate','restHolidayName',
      'restQuotaOvertime','restAllocationSource','restPreferredCategory'])delete item[field];
    if(!Object.keys(item).length)delete result[date];
  }
  // A substitute assignment can retain the rest label from the original roster.
  // That label is no longer an off day or a rest-quota declaration. Ignore only
  // its allocation fields on this calculation copy; never delete the assignment.
  const substitutionDates=new Set();
  for(const date of dates) {
    const item=result[date];if(!item)continue;
    const substitute=item.forEmpId||item.type==='substitute'||item.overtimeReport?.category==='代';
    const restReport=['例','休','國'].includes(item.overtimeReport?.category);
    if(!substitute||restReport)continue;
    substitutionDates.add(date);
    for(const field of ['restCategory','restSourceDate','restHolidayName','restQuotaOvertime','restAllocationSource'])delete item[field];
  }
  // A bare "休" remains flexible even if old import/manual metadata labeled
  // it as 休. It may become 例 or 國 only when that is needed to fill the
  // higher-priority quota. A 國 label on a typhoon day likewise must not
  // consume 國 quota invisibly. Explicit 例/國 manual declarations on ordinary
  // dates, actual overtime, substitutes and locked records remain protected.
  // When a previously manually selected 休 has since become a working
  // shift, remove only its stale rest classification. It must not block the
  // entire 83-person batch or be treated as approved overtime.
  for(const date of dates){
    const item=result[date];
    if(!item||item.restCategory!=='休'||schedule[date]==='休'||
       item.restQuotaOvertime||item.restAllocationLocked||item.restCategoryLocked||
       item.overtimeReport||item.overtimeReports?.length||item.overtime||
       item.forEmpId||item.type==='substitute')continue;
    for(const key of ['restCategory','restSourceDate','restHolidayName',
      'restAllocationSource','restPreferredCategory'])delete item[key];
    if(!Object.keys(item).length)delete result[date];
  }
  const flexible=new Set();
  for(const date of dates){
    const item=result[date]||{};
    if(schedule[date]!=='休'||item.restQuotaOvertime||
       item.restAllocationLocked||item.restCategoryLocked||
       item.overtime||item.overtimeReport||item.overtimeReports?.length||
       item.forEmpId||item.type==='substitute')continue;
    if(item.restCategory==='休'||item.restPreferredCategory==='休'||
       item.restCategory==='國'&&nationalBlocked.has(date))flexible.add(date);
  }
  const used=new Set(),slots=quota.slots.map(s=>({...s})),remaining=[];
  const available=dates.filter(date=>
    schedule[date]==='休'&&!substitutionDates.has(date)&&!excluded.has(date)&&
    (!result[date]?.restCategory||flexible.has(date))&&
    !result[date]?.restAllocationLocked&&!result[date]?.restCategoryLocked&&
    !result[date]?.overtime&&!result[date]?.overtimeReport&&
    !result[date]?.overtimeReports?.length&&!result[date]?.forEmpId&&
    !result[date]?.restQuotaOvertime);
  // Consume genuinely protected manual categories, not movable 休 entries.
  for(const date of dates){
    const item=result[date];
    if(!item?.restCategory||item.restAllocationSource==='auto-v1'||flexible.has(date))continue;
    if(typhoonProtected.has(date)||excluded.has(date)&&!item.restQuotaOvertime)continue;
    if(schedule[date]!=='休'&&!item.restQuotaOvertime)throw new Error(date+' 手動假別與班別不一致');
    const index=slots.findIndex(s=>s.category===item.restCategory&&
      (!item.restSourceDate||s.sourceDate===item.restSourceDate));
    if(index<0)throw new Error('手動「'+item.restCategory+'」超過本月額度或來源日期不符：'+date);
    slots.splice(index,1);used.add(date);
  }
  const assign=(date,slot)=>{
    const prior=result[date]||{},hadManualRest=prior.restCategory==='休'&&prior.restAllocationSource==='manual';
    const preference=prior.restPreferredCategory==='休'||hadManualRest?'休':'';
    result[date]={...prior,restCategory:slot.category,restSourceDate:slot.sourceDate,
      restHolidayName:slot.holidayName||'',restQuotaOvertime:false,restAllocationSource:'auto-v1',
      ...(preference?{restPreferredCategory:preference}:{})};
    used.add(date);
  };
  const priority={'例':0,'休':1,'國':2};
  slots.sort((a,b)=>priority[a.category]-priority[b.category]||a.sourceDate.localeCompare(b.sourceDate));
  for(const slot of slots){
    const pool=available.filter(date=>!used.has(date)&&
      (slot.category!=='國'||!nationalBlocked.has(date)));
    pool.sort((a,b)=>{
      const pref=date=>result[date]?.restPreferredCategory==='休'||
        result[date]?.restAllocationSource==='manual'&&result[date]?.restCategory==='休';
      // Keep original manual 休 as 休 whenever possible. If 例/國
      // cannot otherwise be filled, those 休 cells are still convertible.
      const x=(slot.category==='休'?!pref(a):!!pref(a))?1:0;
      const y=(slot.category==='休'?!pref(b):!!pref(b))?1:0;
      return x-y||Math.abs(Number(a.slice(8))-Number(slot.sourceDate.slice(8)))-
        Math.abs(Number(b.slice(8))-Number(slot.sourceDate.slice(8)))||a.localeCompare(b);
    });
    if(pool.length)assign(pool[0],slot);
    else remaining.push(slot);
  }
  // 未被休假日分配覆蓋的額度只能列為「尚未安排」。
  // 不可在工作日自動建立 restQuotaOvertime；只有明確申報／人工安排才有加班。
  const unresolved=remaining.slice();
  const assigned=dates.map(d=>result[d]).filter(x=>x?.restCategory);
  return {meta:result,quota:quota.counts,off:assigned.filter(x=>!x.restQuotaOvertime).length,
    overtime:assigned.filter(x=>x.restQuotaOvertime).length,unresolved};
}

function p79RestActualOvertimeMinutes(totalMinutes,meta) {
  if(!Number.isFinite(totalMinutes)||totalMinutes<=0)return 0;
  if(meta?.restQuotaOvertime===true&&['例','休','國'].includes(meta.restCategory))return totalMinutes;
  return totalMinutes>510 ? totalMinutes-480 : 0;
}

function p79OvertimeDeletionPlan_(rows,covers,empId,date){
  const affected=new Set([empId]),nextCovers=[];
  const previousDay=function(day,offset){return new Date(Date.parse(day+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);};
  covers.forEach(function(row){
    let ids=[];try{ids=JSON.parse(row[5]||'[]');}catch(ignore){}
    const start=p79DateOnly_(row[2]),end=p79DateOnly_(row[3]);
    if(!Array.isArray(ids)||!ids.map(normalizeEmpId_).includes(empId)||date<start||date>end){nextCovers.push(row);return;}
    ids.forEach(function(id){affected.add(normalizeEmpId_(id));});
    if(start<date){const before=row.slice();before[3]=previousDay(date,-1);nextCovers.push(before);}
    if(date<end){const after=row.slice();after[2]=previousDay(date,1);nextCovers.push(after);}
  });
  const nextRows=JSON.parse(JSON.stringify(rows));
  nextRows.forEach(function(row){
    if(!affected.has(normalizeEmpId_(row.empId)))return;
    const schedule=row.schedule||{},all=schedule.__meta||{},meta=all[date]||{};
    if(meta.overtimeAssignedShift&&schedule[date]===meta.overtimeAssignedShift&&meta.overtimeOriginalShift!==undefined)schedule[date]=meta.reportOriginalShift!==undefined?meta.reportOriginalShift:meta.overtimeOriginalShift;
    const kept=Object.assign({},meta);
    ['type','forEmpId','forName','note','assignedAt','overtime','overtimeType','overtimeOriginalShift','overtimeAssignedShift','overtimeStart','overtimeEnd','overtimeReport','reportOriginalShift'].forEach(function(key){delete kept[key];});
    kept.overtimeExcluded=true;kept.overtimeDeletedAt=new Date().toISOString();
    all[date]=kept;schedule.__meta=all;row.schedule=schedule;
  });
  return {rows:nextRows,covers:nextCovers,affected:Array.from(affected)};
}

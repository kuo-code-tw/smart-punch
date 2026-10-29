/* Read-only analytics. Shared V6 pairing; no attendance, schedule or approval writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.P79HomeAnalytics=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const str=x=>String(x??'').trim(),id=e=>str(e?.empId||e?.employeeId||e?.id).toUpperCase();
const day=x=>{const m=str(x).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:'';};
const active=e=>!['resigned','leave','terminated','離職','已離職','留職停薪'].includes(str(e.employmentStatus||e.status).toLowerCase());
function aggregate({engine,records,employees,schedules=[],leaves=[],covers=[],today,month,attendanceReady=true,rosterReady=true,leaveReady=true,boundariesReady=true}){
 const people=Array.isArray(employees)?employees:[],byEmp=new Map(),byAtt=new Map(),byName=new Map();people.forEach(e=>{if(id(e))byEmp.set(id(e),e);if(str(e.attNo||e.attendanceNo))byAtt.set(str(e.attNo||e.attendanceNo).replace(/^0+/,''),e);if(e.name){const name=str(e.name);byName.set(name,byName.has(name)?null:e);}});
 const find=r=>{const key=str(r.empId||r.employeeId||r['自定義編號']).toUpperCase(),att=str(r.attNo||r.attendanceNo||r['考勤號碼']).replace(/^0+/,'');return byEmp.get(key)||byAtt.get(att)||(!key&&!att?byName.get(str(r.name||r['姓名'])):null);};
 // Always restrict raw punches to the authorized employee roster returned by the server.
 const scoped=(records||[]).filter(r=>!!find(r)&&r.deleted!==true&&r.isDeleted!==true&&!r.deletedAt&&!r.tombstone).map(r=>{const e=find(r);return {...r,empId:id(e),attNo:e.attNo||r.attNo,name:e.name||r.name,dept:e.dept||r.dept};});
 const shifts=attendanceReady?engine.buildShifts(scoped):[],monthShifts=shifts.filter(s=>day(s.accountingDateKey||s.dateKey).startsWith(month+'-')),todayShifts=shifts.filter(s=>day(s.accountingDateKey||s.dateKey)===today);
 const unique=new Set(),present=new Set(),hours=[0,0,0,0,0],deptHours=new Map(),latest=new Map();let todayHours=0,monthHours=0;
 for(const s of shifts){const e=find(s);if(!e)continue;const key=id(e),date=day(s.accountingDateKey||s.dateKey);if(s.clockIn&&date.startsWith(month+'-'))unique.add(key+'|'+date);if(s.clockIn&&date===today)present.add(key);
  if(!s.clockIn||!s.clockOut||s.timePrecisionIssue)continue;const h=(s.clockOut.__ts-s.clockIn.__ts)/3600000;if(!(h>0&&h<=24))continue;if(date===today)todayHours+=h;if(date.startsWith(month+'-')){monthHours+=h;hours[Math.min(4,Math.floor((Number(date.slice(-2))-1)/7))]+=h;const dept=str(e.dept||e.department||'未設定部門');deptHours.set(dept,(deptHours.get(dept)||0)+h);}}
 for(const r of engine.dedupe(scoped)){const e=find(r),time=engine.normalizeTime(r.timeStr||r['出勤時間']),date=day(time);if(!e||!date)continue;const m=time.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);if(!m)continue;const key=id(e),stamp=`${date}T${m[4]}:${m[5]}:${m[6]}+08:00`,t=Date.parse(stamp);if(!latest.has(key)||t>latest.get(key).t)latest.set(key,{t,type:engine.recordType(r),date});}
 const yesterday=new Date(Date.parse(today+'T12:00:00+08:00')-86400000).toISOString().slice(0,10);let onDuty=0;latest.forEach(v=>{if(v.type==='IN'&&(v.date===today||v.date===yesterday))onDuty++;});
 const leaveToday=new Set(),pending=[];for(const l of leaves){const e=find(l);if(!e)continue;const status=str(l.status)||'待審核',start=day(l.startDate||l.startTime),end=day(l.endDate||l.endTime)||start;if(status==='已核准'&&start&&start<=today&&end>=today)leaveToday.add(id(e));if(status==='待審核')pending.push({kind:'leave',id:str(l.id),name:e.name||l.name||id(e),date:start||'未設定日期',description:l.leaveType||'請假申請',status});}
 const expected=new Set(present);let missingSchedule=0,conflicts=0;const reportIds=new Set();let declaredHours=0;const declaredByWeek=[0,0,0,0,0];
 for(const row of schedules){const e=find(row);if(!e)continue;const schedule=row.schedule||{};const shift=str(schedule[today]);if(active(e)&&(/^(早|中|晚)/.test(shift)||/\d{2}[-~～]\d{2}/.test(shift)))expected.add(id(e));if(active(e)&&!shift)missingSchedule++;if(leaveToday.has(id(e))&&/^(早|中|晚)/.test(shift))conflicts++;
  for(const [date,meta]of Object.entries(schedule.__meta||{})){if(!date.startsWith(month+'-'))continue;const r=meta?.overtimeReport;if(!r?.id||reportIds.has(str(r.id)))continue;reportIds.add(str(r.id));if(/撤銷|刪除|取消|revoked|cancel/i.test(str(r.status))||r.revoked===true||r.deleted===true)continue;const h=Number(r.declaredHours??r.rule?.declaredHours);if(Number.isFinite(h)&&h>=0){declaredHours+=h;declaredByWeek[Math.min(4,Math.floor((Number(date.slice(-2))-1)/7))]+=h;}if(/^(待審核|待核准|pending)$/.test(str(r.status)))pending.push({kind:'overtime',id:str(r.id),name:e.name||id(e),date,description:'加班申請',status:str(r.status)});}}
 const approvedOff=[...leaveToday].filter(k=>!present.has(k));approvedOff.forEach(k=>expected.add(k));const waiting=[...expected].filter(k=>!present.has(k)&&!leaveToday.has(k));
 const missing=monthShifts.filter(s=>day(s.dateKey)<today&&(!s.clockIn||!s.clockOut||s.timePrecisionIssue));const long=monthShifts.filter(s=>s.clockIn&&s.clockOut&&(s.clockOut.__ts-s.clockIn.__ts)>12*3600000);
 return {today,month,attendanceReady,rosterReady,leaveReady,boundariesReady,scopeCount:people.length,present:present.size,onDuty,todayHours,monthHours,attendanceDays:unique.size,hours,departmentHours:[...deptHours].sort((a,b)=>b[1]-a[1]),declaredHours,declaredByWeek,pending:pending.sort((a,b)=>b.date.localeCompare(a.date)),distribution:{present:present.size,leave:approvedOff.length,waiting:waiting.length,total:expected.size},alerts:[{label:'歷史班次缺卡／時間待核',count:missing.length,target:'attendance',detail:'僅統計今日以前的本月班次'},{label:'刷卡區間超過 12 小時',count:long.length,target:'workhours',detail:'需核對班次、休息及申報明細'},{label:'核准請假與工作班別重疊',count:conflicts,target:'schedule',detail:'核對請假與排班連動狀態'}],missingSchedule};
}
// These pure Bundle rules are copied verbatim from the existing vessel module.
// A regression guard below compares their source to prevent calculation drift.
const num=v=>Number(v)||0;
function parseBundleRemark(text){
  const s=String(text||'')
    .toUpperCase()
    .replace(/[’′]/g,"'")
    .replace(/\u00A0/g,' ')
    .replace(/[ \t]+/g,' ')
    .trim();

  const items=[];
  const seenOccurrence=new Set();
  const pushItem=(size,bn,fl,unit,raw,key)=>{
    bn=num(bn);fl=num(fl);
    if(!(bn>=0&&fl>=0))return;

    // v9.3：
    // 「相同 BN/FR 數值」不代表同一筆 Bundle。
    // 實際 WORKING REPORT 會出現：
    //   D7 1BN/3FR,1BN/4FR
    //   D4 1BN/4FR
    // 其中兩個 1BN/4FR 是不同艙位、都必須扣除。
    //
    // 舊版用 size/unit/bn/fl 當內容簽章去重，會把第二個 1BN/4FR 吃掉，
    // 導致 WAN HAI 292 N073：WORKING REPORT/WORKING SHEET 應扣 12，
    // 但人員明細只扣到 9。
    //
    // 現在只對「同一文字位置、同一 parser 命中」去重；
    // 不同位置即使內容相同，也視為不同 Bundle。
    const normalizedUnit=String(unit||'FR').toUpperCase();
    const occurrenceKey=String(key||'').trim();
    if(occurrenceKey && seenOccurrence.has(occurrenceKey))return;
    if(occurrenceKey)seenOccurrence.add(occurrenceKey);

    items.push({
      size:String(size||''),bn,fl,unit:normalizedUnit,
      deduct:Math.max(0,fl-bn),raw:String(raw||'').replace(/^[^0-9]+/,'').trim(),
      occurrence:occurrenceKey
    });
  };

  // 格式 1：2BN/7FR、5BN/20FL（舊有格式）
  const normal=/(?:^|[^0-9])(?:(20|40|45)\s*'?\s*\*?\s*)?(\d+(?:\.\d+)?)\s*BN\s*\/\s*(\d+(?:\.\d+)?)\s*(FR|FL)/gi;
  let m;
  while((m=normal.exec(s))){
    pushItem(m[1],m[2],m[3],m[4],m[0],`N:${m.index}:${m[0]}`);
  }

  // 格式 2：7FR/2BN、20FL/5BN（WAN HAI 272 N229 實際使用格式）
  const reverse=/(?:^|[^0-9])(?:(20|40|45)\s*'?\s*\*?\s*)?(\d+(?:\.\d+)?)\s*(FR|FL)\s*\/\s*(\d+(?:\.\d+)?)\s*BN/gi;
  while((m=reverse.exec(s))){
    pushItem(m[1],m[4],m[2],m[3],m[0],`R:${m.index}:${m[0]}`);
  }

  // 格式 3：40FR*4/1BN、FR40*4/1BN、20FL*5/2BN
  // WAN HAI 292 N072 實際使用「D2 FR40*4/1BN」；代表 4 櫃組成 1 Bundle，應扣 3。
  const sizeTimes=/(?:^|[^0-9])(?:(?:(20|40|45)\s*'?\s*(FR|FL))|(?:(FR|FL)\s*(20|40|45)\s*'?))\s*\*\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*BN/gi;
  while((m=sizeTimes.exec(s))){
    const size=m[1]||m[4]||'';
    const unit=m[2]||m[3]||'FR';
    const fl=m[5],bn=m[6];
    pushItem(size,bn,fl,unit,m[0],`X:${m.index}:${m[0]}`);
  }

  // v8.6 格式 4：BN2/FL8、BN1/FR4（實際 WORKING REPORT 會使用「D7甲 BN2/FL8」）
  // 數字位於 BN / FL 標籤後方；先讀 BN，再讀 FL/FR。
  const labelFirst=/\bBN\s*(\d+(?:\.\d+)?)\s*\/\s*(FR|FL)\s*(\d+(?:\.\d+)?)/gi;
  while((m=labelFirst.exec(s))){
    pushItem('',m[1],m[3],m[2],m[0],`LF:${m.index}:${m[0]}`);
  }

  // v8.6 格式 5：FL8/BN2、FR4/BN1（反向標籤在前）
  const labelFirstReverse=/\b(FR|FL)\s*(\d+(?:\.\d+)?)\s*\/\s*BN\s*(\d+(?:\.\d+)?)/gi;
  while((m=labelFirstReverse.exec(s))){
    pushItem('',m[3],m[2],m[1],m[0],`LFR:${m.index}:${m[0]}`);
  }

  const deduct=items.reduce((a,x)=>a+num(x.deduct),0);
  const fl=items.reduce((a,x)=>a+num(x.fl),0);
  const bn=items.reduce((a,x)=>a+num(x.bn),0);

  return {items,deduct,fl,bn};
}

function applyBundleDeductionToWorkingReport(discValue,loadValue,remarkText){
  const rawDisc=Math.max(0,num(discValue));
  const rawLoad=Math.max(0,num(loadValue));
  const info=parseBundleRemark(remarkText);

  if(!info.deduct){
    return {
      disc:rawDisc,load:rawLoad,
      rawDisc,rawLoad,
      bundleDeduct:0,bundleInfo:info
    };
  }

  let disc=rawDisc,load=rawLoad;
  const deduction=Math.max(0,info.deduct);

  // Remark 通常只屬於該列的一種作業（DISC 或 LOAD）。
  // 若只有其中一邊有數字，直接從該邊扣除。
  if(rawDisc>0 && rawLoad<=0){
    disc=Math.max(0,rawDisc-deduction);
  }else if(rawLoad>0 && rawDisc<=0){
    load=Math.max(0,rawLoad-deduction);
  }else if(rawDisc>0 || rawLoad>0){
    // 少數範本同列同時有 DISC / LOAD：
    // Remark 中 FL 總數通常會接近其中一邊的原始櫃數，
    // 因此扣在與 FL 最接近的一側，避免任意拆分。
    const dDiff=Math.abs(rawDisc-info.fl);
    const lDiff=Math.abs(rawLoad-info.fl);
    if(dDiff<=lDiff)disc=Math.max(0,rawDisc-deduction);
    else load=Math.max(0,rawLoad-deduction);
  }

  return {
    disc,load,rawDisc,rawLoad,
    bundleDeduct:deduction,bundleInfo:info
  };
}

function bundleRemarkTextFromRecord(r){
  // v7.40：
  // bundleRemark 是匯入時已鎖定的 Bundle 原始來源，存在時直接使用。
  // 不再把 note / stopRemark 再拼回 bundleRemark，避免同一個 Bundle
  // 在多個欄位各出現一次後被重複計算。
  const primary=String(r?.bundleRemark||'').trim();
  if(primary)return primary;

  // 舊資料若沒有 bundleRemark，才從其他備註欄位補找；
  // 只保留真的含有 Bundle 的欄位，且文字完全相同時只取一次。
  const parts=[
    r?.note,
    r?.stopRemark1,
    r?.stopRemark2,
    r?.stopRemark3
  ]
    .map(v=>String(v||'').trim())
    .filter(Boolean)
    .filter(v=>parseBundleRemark(v).deduct>0);

  return [...new Set(parts)].join('｜');
}

function canonicalBundleRemark(bundleInfo){
  const items=Array.isArray(bundleInfo)?bundleInfo:[];
  const out=[];
  items.forEach(x=>{
    const bn=num(x?.bn),fl=num(x?.fl);
    const unit=String(x?.unit||'FR').toUpperCase();
    const size=String(x?.size||'').trim();
    if(!(fl>0||bn>0))return;
    // v9.3：保留相同數值 Bundle 的「筆數」。
    // 不再以 bn/fl 內容去重，避免不同艙位的 1BN/4FR 被合併成一筆。
    out.push(`${bn}BN/${fl}${unit}${size?`(${size}')`:''}`);
  });
  return out.join('；');
}

function effectiveBundleRecord(r){
  const currentDisc=num(r?.disc);
  const currentLoad=num(r?.load);
  const currentSum=currentDisc+currentLoad;
  const remark=bundleRemarkTextFromRecord(r);
  const parsed=parseBundleRemark(remark);

  const hasRawDisc=Object.prototype.hasOwnProperty.call(r||{},'rawDisc');
  const hasRawLoad=Object.prototype.hasOwnProperty.call(r||{},'rawLoad');

  let rawDisc=hasRawDisc?num(r.rawDisc):currentDisc;
  let rawLoad=hasRawLoad?num(r.rawLoad):currentLoad;

  // raw 不可能比已計算後數字更少。
  // v20 部分雲端舊資料 raw 欄位為 0，這裡自動以目前 DISC/LOAD 回復原始值。
  if(rawDisc+rawLoad < currentSum){
    rawDisc=currentDisc;
    rawLoad=currentLoad;
  }

  // v8.7：同一位司機的連續時段可能各自都有完全相同的 Bundle 文字。
  // mergeWorkingReportRecords 會把數值正確相加（例如 6 + 6 = 12），但顯示用 bundleRemark
  // 會把相同文字收斂成一份；若這裡只重新解析文字，就會把 12 又錯算回 6。
  // 因此：當原始 DISC/LOAD 與目前 DISC/LOAD 的實際差額，能精確證明 existing bundleDeduct
  // 已經是「多個時段的累加值」時，必須優先保留結構化 Bundle 明細，不可被去重後的文字覆蓋。
  const existingDeduct=num(r?.bundleDeduct);
  const existingInfo=Array.isArray(r?.bundleInfo)?r.bundleInfo:[];
  const rawSum=rawDisc+rawLoad;
  const currentDeduct=Math.max(0,rawSum-currentSum);
  const existingBn=num(r?.bundleBn);
  const existingFl=num(r?.bundleFl);
  const structuralBundleIsStronger = existingDeduct>0
    && existingDeduct>num(parsed.deduct)+0.01
    && Math.abs(currentDeduct-existingDeduct)<=0.01
    && (existingInfo.length>0 || existingBn>0 || existingFl>0);

  if(structuralBundleIsStronger){
    return {
      detected:true,
      remark:remark||canonicalBundleRemark(existingInfo),
      rawDisc,
      rawLoad,
      disc:currentDisc,
      load:currentLoad,
      bundleDeduct:existingDeduct,
      bundleBn:existingBn,
      bundleFl:existingFl,
      bundleInfo:existingInfo
    };
  }

  if(parsed.items.length>0){
    const adjusted=applyBundleDeductionToWorkingReport(rawDisc,rawLoad,remark);
    return {
      detected:true,
      remark,
      rawDisc:num(adjusted.rawDisc),
      rawLoad:num(adjusted.rawLoad),
      disc:num(adjusted.disc),
      load:num(adjusted.load),
      bundleDeduct:num(adjusted.bundleDeduct),
      bundleBn:num(adjusted.bundleInfo?.bn),
      bundleFl:num(adjusted.bundleInfo?.fl),
      bundleInfo:Array.isArray(adjusted.bundleInfo?.items)
        ? adjusted.bundleInfo.items
        : []
    };
  }

  // 若舊紀錄本身已有 Bundle 欄位，但備註不存在，不能只保留 bundleDeduct 卻不真正扣 DISC/LOAD。
  // v7.48 的舊資料可能出現：raw 551、bundleDeduct 13，但調整後只剩 547（只扣到 4）。
  // v7.49 會用既有 BN/FL/bundleInfo 重建一次扣除；若目前數字早已完整扣除則保持原值，避免二次扣除。
  if(existingDeduct>0){
    let synthRemark=canonicalBundleRemark(existingInfo);
    if(!synthRemark){
      const bn=num(r?.bundleBn), fl=num(r?.bundleFl);
      if(fl>0 || bn>0) synthRemark=`${bn}BN/${fl}FR`;
    }

    let fixedDisc=currentDisc, fixedLoad=currentLoad;

    if(Math.abs(currentDeduct-existingDeduct)>0.01){
      if(synthRemark){
        const fixed=applyBundleDeductionToWorkingReport(rawDisc,rawLoad,synthRemark);
        fixedDisc=num(fixed.disc);
        fixedLoad=num(fixed.load);
      }else{
        fixedDisc=rawDisc; fixedLoad=rawLoad;
        if(rawLoad>=existingDeduct) fixedLoad=Math.max(0,rawLoad-existingDeduct);
        else fixedDisc=Math.max(0,rawDisc-existingDeduct);
      }
    }

    return {
      detected:true,
      remark:synthRemark||remark,
      rawDisc,
      rawLoad,
      disc:fixedDisc,
      load:fixedLoad,
      bundleDeduct:existingDeduct,
      bundleBn:num(r?.bundleBn),
      bundleFl:num(r?.bundleFl),
      bundleInfo:existingInfo
    };
  }

  return {
    detected:false,
    remark,
    rawDisc:currentDisc,
    rawLoad:currentLoad,
    disc:currentDisc,
    load:currentLoad,
    bundleDeduct:0,
    bundleBn:0,
    bundleFl:0,
    bundleInfo:[]
  };
}
// Read-only vessel snapshot aggregation. Counts use dated detail rows; billing uses completed jobs.
function vesselAggregate(data,{today,month}){
 const num=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0&&n<1e8?n:0;};
 const iso=v=>{const m=String(v||'').match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:'';};
 const active=r=>r&&!r.deleted&&!r.isDeleted&&!r.deletedAt&&!r.tombstone;
 const unique=(list,master=false)=>{const m=new Map();(list||[]).filter(active).forEach((r,i)=>m.set(String(master?(r.workingNo||r.id||'row:'+i):(r.id||[r.workingNo,r.empId||r.name,r.workDate,r.startTime,r.endTime,r.source].join('|'))),r));return [...m.values()];};
 const masters=unique(data.shipMasters,true).map(raw=>({...raw,...Object.fromEntries(Object.entries(raw.manualOverrides||{}).filter(([k])=>!k.startsWith('_')))}));
 const shipMasters=masters,records=unique(data.records),PERSON_NAME_ALIAS_GROUPS=[['張嘉誠','張家誠']];
 const applyShipManualOverrides=s=>s;
function normalizePersonName(v){
  let name=String(v||'')
    .replace(/[（(]\s*AQC\s*[)）]/gi,'')
    .replace(/\s+/g,'')
    .trim();

  // 工作報表 / 月效率資料曾出現同一人不同用字：
  // 張嘉誠 <-> 張家誠。
  // 只針對明確已知的別名做合併，不做模糊猜測，避免誤配其他員工。
  for(const group of PERSON_NAME_ALIAS_GROUPS){
    if(group.includes(name))return group[0];
  }

  return name;
}
function displayPersonName(v){
  return String(v||'')
    .replace(/\s*[（(]\s*(?:AQC|ARMG|F\s*\/\s*L|FL|GC|QC|RTG|RMG|領班|指揮手)\s*[）)]\s*/g,'')
    .trim();
}
function normalizeAqcNo(v){
  const s=String(v||'').trim().toUpperCase().replace(/\s+/g,'');
  const m=s.match(/(?:GC|AQC)?0*(\d{3,6})$/);
  return m?String(Number(m[1])):s.replace(/^(GC|AQC)[#:\-]?/,'');
}
function normalizeMonthlySerial(v){
  const raw=String(v??'').trim();
  if(!raw)return '';

  // 支援：
  // 0142      -> 0142
  // 142       -> 0142
  // 0142-2    -> 0142-2
  // 5260142   -> 0142
  // 5260142-2 -> 0142-2
  //
  // 注意："-2" 是同一月報序號的子序號，必須保留，不能併到 0142。
  const m=raw.match(/(\d+)\s*(?:-\s*(\d+))?\s*$/);
  if(!m)return raw.toUpperCase().replace(/\s+/g,'');

  const main=String(m[1]||'');
  const suffix=String(m[2]||'').replace(/^0+(?=\d)/,'');
  const base=main.slice(-4).padStart(4,'0');

  return suffix ? `${base}-${suffix}` : base;
}
function monthlyShipNo(v){
  const s=String(v||'').trim();
  if(!s)return '';
  // 船名可能帶航次，例如「WAN HAI 177 S062」；不能抓字串最後的 062 當船號。
  const wh=s.match(/WAN\s*HAI\s*(\d+)/i);
  if(wh)return String(Number(wh[1]));
  const lead=s.match(/^0*(\d+)\b/);
  if(lead)return String(Number(lead[1]));
  return s.replace(/^WAN\s*HAI\s*/i,'').trim();
}

// v2026.10.02：月報航次可能只有數字 618，系統則保存 N618 / S619。
// 比對身份時只抽取航次的數字主體；N/S/I/E 等方向前綴不應把同一 WORKING NO 拆成缺漏。
function normalizeShipText(v){
  return String(v||'').trim().toUpperCase().replace(/\s+/g,' ');
}
function workingNoHasSuffix(v){
  return /-\d+$/.test(String(v||'').trim());
}
function recordMatchesMasterDate(r,master){
  const firstDate=String(master?.firstDate||'').slice(0,10);
  const lastDate=String(master?.lastDate||'').slice(0,10);
  const d=String(r?.workDate||'').slice(0,10);
  if(!d || (!firstDate&&!lastDate))return true;
  if(firstDate && d<firstDate)return false;
  if(lastDate && d>lastDate)return false;
  return true;
}
function vesselMasterForRecord(r){
  const no=String(r?.workingNo||r?.workNo||r?.workingNumber||'').trim();
  if(no){
    const exact=(shipMasters||[]).find(s=>String(s.workingNo||'').trim()===no);
    if(exact)return exact;

    // 舊資料可能只存 0151，而主檔是 5260151；只有「唯一標準序號」才允許補綁。
    // 一旦 NO. 帶 -1/-2 子序號，就絕對不能退回同船名的父作業。
    const serial=normalizeMonthlySerial(no);
    if(serial){
      const bySerial=(shipMasters||[]).filter(s=>normalizeMonthlySerial(s?.workingNo)===serial);
      if(bySerial.length===1)return bySerial[0];
    }
    if(workingNoHasSuffix(no))return null;
  }

  const d=String(r?.workDate||'').slice(0,10);
  const aqc=normalizeAqcNo(r?.number||r?.gcNo);
  const rawVessel=normalizeShipText(r?.shipName||r?.vessel||'');
  const explicitVoyages=[r?.voyageI,r?.voyageE,r?.voyage,r?.voyageIE]
    .map(v=>normalizeShipText(v)).filter(Boolean);

  if(rawVessel){
    let candidates=(shipMasters||[]).filter(s=>{
      const name=normalizeShipText(s?.vessel||'');
      if(!name)return false;
      return rawVessel===name || rawVessel.startsWith(name+' ');
    });

    if(candidates.length>1){
      const fromLabel=[];
      candidates.forEach(s=>{
        const name=normalizeShipText(s?.vessel||'');
        const suffix=rawVessel.startsWith(name+' ')?rawVessel.slice(name.length+1).trim():'';
        if(suffix)fromLabel.push(suffix);
      });
      const voyages=[...new Set([...explicitVoyages,...fromLabel])].filter(Boolean);
      if(voyages.length){
        const matched=candidates.filter(s=>{
          const sv=[s?.voyageI,s?.voyageE].map(v=>normalizeShipText(v)).filter(Boolean);
          return voyages.some(v=>sv.includes(v) || sv.some(x=>v.includes(x)||x.includes(v)));
        });
        if(matched.length)candidates=matched;
      }
    }
    if(candidates.length>1 && d){
      const matched=candidates.filter(s=>recordMatchesMasterDate(r,s));
      if(matched.length)candidates=matched;
    }
    if(candidates.length===1)return candidates[0];
  }

  const candidates=(shipMasters||[]).filter(s=>{
    const first=String(s.firstDate||'').slice(0,10),last=String(s.lastDate||'').slice(0,10);
    const inDate=!d || ((!first||d>=first)&&(!last||d<=last));
    const aqcs=Array.isArray(s.aqcs)?s.aqcs:[];
    const hasAqc=!aqc || !aqcs.length || aqcs.some(a=>normalizeAqcNo(a.number)===aqc);
    return inDate&&hasAqc;
  });
  return candidates.length===1?candidates[0]:null;
}
function operationalSourceRank(r){
  const src=String(r?.source||'');
  if(src==='working-report')return 50;
  if(src==='gc-driver-efficiency')return 40;
  if(src==='web')return 30;
  if(!src)return 20;
  if(src==='excel-import')return 0;
  return 10;
}
function canonicalOperationalRecords(list){
  const map=new Map();
  (list||[]).filter(r=>String(r?.source||'')!=='excel-import').forEach(r=>{
    const person=normalizePersonName(displayPersonName(r?.name));
    const date=String(r?.workDate||'').slice(0,10);
    const aqc=normalizeAqcNo(r?.number||r?.gcNo);
    const st=String(r?.startTime||'').slice(0,5);
    const et=String(r?.endTime||'').slice(0,5);
    const directNo=String(r?.workingNo||r?.workNo||r?.workingNumber||'').trim();
    const directSerial=normalizeMonthlySerial(directNo);
    const master=directSerial?null:vesselMasterForRecord(r);
    // 5260151 / 0151 是同一月報序號；日期已在 key 內，因此用標準序號可安全去重。
    const vesselKey=directSerial?`SER:${directSerial}`:(master?.workingNo?`SER:${normalizeMonthlySerial(master.workingNo)}`:`SHIP:${monthlyShipNo(r?.shipName||r?.vessel||'')}`);
    const rawMoves=(num(r?.disc)+num(r?.load))||num(r?.containers);
    // 同一人、同船、同日、同 AQC、同起訖時間就是同一作業段；班別文字不同不能讓同一筆重複計算。
    const segment=(st||et)?`${st}|${et}`:`NO_TIME|${rawMoves}|${num(r?.hatches)}|${String(r?.note||'').trim()}`;
    const key=[vesselKey,person,date,aqc,segment].join('|');
    const completeness=(directNo?3:0)+(r?.shipName||r?.vessel?2:0)+(st?1:0)+(et?1:0)+(rawMoves>0?2:0)+(num(r?.hatches)>0?1:0);
    const rank=operationalSourceRank(r)*100+completeness;
    const prev=map.get(key);
    if(!prev || rank>prev.rank)map.set(key,{r,rank});
  });
  return [...map.values()].map(x=>x.r);
}
function shipCompletionMonth(s,latestByNo=null){
  if(!s)return '';
  const x=applyShipManualOverrides(s)||s,ws=x.workingSheetSource||{};
  const monthOf=v=>{
    const m=String(v||'').trim().match(/^(20\d{2})[-\/](\d{1,2})(?:[-\/]\d{1,2})?/);
    return m&&+m[2]>=1&&+m[2]<=12?m[1]+'-'+String(+m[2]).padStart(2,'0'):'';
  };
  for(const v of [s._cloudLastDate,s.cloudLastDate,s._authoritativeLastDate,x.lastDate,s.lastDate,x.lashingDateTime,x.lashingDate,ws.lashingDateTime,ws.lashingDate,ws.endDate]){
    const month=monthOf(v);if(month)return month;
  }
  const no=String(s.workingNo||'').trim();
  if(no){
    const cached=latestByNo?.get(no);
    if(cached)return cached.slice(0,7);
    // 單艘船直接呼叫時仍保留舊資料備援；整月請由 shipCompletionIndex 預先索引，避免 O(船數×明細數)。
    if(!latestByNo){
      const dates=(records||[]).filter(r=>String(r?.workingNo||'').trim()===no)
        .map(r=>String(r?.workDate||r?.date||'').slice(0,10)).filter(d=>/^20\d{2}-\d{2}-\d{2}$/.test(d)).sort();
      if(dates.length)return dates[dates.length-1].slice(0,7);
    }
  }
  for(const v of [x.compareMonth,x.compareDate,ws.compareMonth,ws.compareDate,x.firstDate,ws.firstDate,ws.startDate]){
    const month=monthOf(v);if(month)return month;
  }
  return '';
}
function shipCompletionIndex(masters){
  const latestByNo=new Map();
  for(const r of (records||[])){
    const no=String(r?.workingNo||'').trim();
    const date=String(r?.workDate||r?.date||'').slice(0,10);
    if(no&&/^20\d{2}-\d{2}-\d{2}$/.test(date) && date>(latestByNo.get(no)||''))latestByNo.set(no,date);
  }
  return new Map((masters||[]).filter(s=>String(s?.workingNo||'').trim())
    .map(s=>[String(s.workingNo).trim(),{master:s,month:shipCompletionMonth(s,latestByNo)}]));
}
function recordCompletionMonth(r,index){
  const entry=index?.get(String(r?.workingNo||'').trim());
  if(entry?.month)return entry.month;
  // 舊明細無主檔時僅取明確日期欄位；不覆寫原始作業日。
  const raw=r?.sheetCompareDate||r?.compareDate||r?._cloudLastDate||'';
  const m=String(raw).match(/^(20\d{2})[-\/](\d{1,2})/);
  if(m&&+m[2]>=1&&+m[2]<=12)return m[1]+'-'+String(+m[2]).padStart(2,'0');
  return String(r?.workDate||'').slice(0,7);
}
function recordIsCurrentShipDetail(r,index){
  if(String(r?.source||'')!=='working-report')return true;
  const ids=index?.get(String(r?.workingNo||'').trim())?.master?.workingSheetSource?.reportRecordIds;
  return !Array.isArray(ids)||!ids.length||!String(r?.id||'')||ids.map(String).includes(String(r.id));
}
 const completionIndex=shipCompletionIndex(masters);
 const rows=canonicalOperationalRecords(records.filter(r=>recordIsCurrentShipDetail(r,completionIndex))),key=r=>String(r.workingNo||[r.shipName||r.vessel,r.voyageE||r.voyage].join('|'));
 const finish=s=>iso(s._cloudLastDate||s.cloudLastDate||s._authoritativeLastDate)||iso(s.lastDate)||iso(s.lashingDateTime||s.lashingDate||s.workingSheetSource?.lashingDateTime||s.workingSheetSource?.endDate)||iso(s.compareDate||s.workingSheetSource?.compareDate)||iso(s.firstDate);
 const byNo=new Map(masters.map(s=>[key(s),s]));
 const dated=rows.map(r=>({...r,date:iso(r.workDate)})).filter(r=>r.date);
 const moves=r=>{if(r.source==='working-report'){const b=effectiveBundleRecord(r);return num(b.disc)+num(b.load);}return r.source==='gc-driver-efficiency'?num(r.disc)+num(r.load):num(r.containers);};
 const hours=r=>{if(['working-report','gc-driver-efficiency'].includes(r.source)&&num(r.timeHours))return Math.round(num(r.timeHours)*100)/100;const min=t=>{const m=String(t||'').match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null;};const a=min(r.startTime),b=min(r.endTime);const h=a===null||b===null?0:((b-a+1440)%1440)/60;const adjusted=['working-report','gc-driver-efficiency'].includes(r.source)?h:Math.max(0,h-[r.deduct1,r.deduct2,r.deduct3,r.deduct4].reduce((s,v)=>s+num(v),0)/60);return Math.round(adjusted*100)/100;};
 const monthRows=dated.filter(r=>recordCompletionMonth(r,completionIndex)===month),todayRows=dated.filter(r=>r.date===today);
 const todayKeys=new Set(todayRows.map(key));masters.filter(s=>iso(s.firstDate)&&iso(s.firstDate)<=today&&iso(s.lastDate)&&iso(s.lastDate)>=today).forEach(s=>todayKeys.add(key(s)));
 const jobs=[...todayKeys].map(k=>{const rs=todayRows.filter(r=>key(r)===k),m=byNo.get(k)||rs[0]||{},hs=rs.reduce((s,r)=>s+hours(r),0),qty=rs.reduce((s,r)=>s+moves(r),0);return {shipGph:num(m.gph)||null,vessel:m.shipName||m.vessel||'未命名',voyage:m.voyageE||m.voyageI||m.voyage||'—',volume:rs.length,containers:qty,people:new Set(rs.map(r=>String(r.empId||r.name||'')).filter(Boolean)).size,efficiency:hs?qty/hs:null,status:m.status||'已載入'};});
 const weeks=Array.from({length:Math.ceil(new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate()/7)},()=>({volume:0,containers:0,hours:0,moves:0,shipGph:[]}));
 monthRows.forEach(r=>{const w=weeks[r.date<month+'-01'?0:Math.min(weeks.length-1,Math.floor((Number(r.date.slice(8))-1)/7))];w.volume++;w.containers+=moves(r);w.hours+=hours(r);w.moves+=moves(r)+num(r.hatches);});
 const sum=k=>weeks.reduce((s,w)=>s+w[k],0),monthJobs=masters.filter(s=>(completionIndex.get(String(s.workingNo||'').trim())?.month||finish(s).slice(0,7))===month);
 monthJobs.forEach(s=>{const date=finish(s),gph=num(s.gph),w=weeks[Math.floor((Number(date.slice(8))-1)/7)];if(w&&gph>0&&num(s.totalContainers||s.totalMoves)>0)w.shipGph.push({gph,quantity:num(s.totalContainers||s.totalMoves)});});
 const eff=monthJobs.filter(s=>num(s.gph)>0&&num(s.totalContainers||s.totalMoves)>0),personalHours=sum('hours');const shipQuantity=eff.reduce((s,r)=>s+num(r.totalContainers||r.totalMoves),0),shipHours=eff.reduce((s,r)=>s+num(r.totalContainers||r.totalMoves)/num(r.gph),0);
 const pending=monthJobs.filter(s=>/待審|待核|pending/i.test(String(s.status||''))).map(s=>({name:s.vessel||s.shipName||'未命名船舶',voyage:s.voyageE||s.voyageI||'—',description:s.reviewReason||s.note||'船舶作業待核對',date:finish(s),status:s.status,kind:'vessel'}));
 return {pending,jobs,todayShips:todayKeys.size,todayVolume:todayRows.length,todayContainers:todayRows.reduce((s,r)=>s+moves(r),0),monthVolume:monthRows.length,monthContainers:sum('containers'),billingContainers:monthJobs.reduce((s,r)=>s+num(r.totalContainers),0),shipEfficiency:shipHours?shipQuantity/shipHours:null,personEfficiency:personalHours?sum('moves')/personalHours:null,weeks,recordCount:rows.length,masterCount:masters.length};
}
// GAS snapshot routes share a server lock. Read them one at a time and publish each result.
async function readSnapshots(jobs,{signal,onResult,onError,onProgress}={}){
 for(const job of jobs){
  if(signal?.aborted)break;
  try{const value=await job.run();if(!signal?.aborted)onResult?.(job.key,value);}
  catch(error){if(!signal?.aborted)onError?.(job.key,error);}
  finally{if(!signal?.aborted)onProgress?.();}
 }
}
return {aggregate,day,vesselAggregate,readSnapshots};
});

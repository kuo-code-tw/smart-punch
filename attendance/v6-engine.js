(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root){ root.P79AttendanceV6=api; }
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const MAX_SHIFT_MS=24*60*60*1000;
  // V6.0.4：同一員工同一側 15 分鐘內的多刷，視為同一次班次的重複刷卡候選。
  // 僅用於班次顯示/配對，不直接刪除原始 Google Sheet 資料。
  const NEAR_DUPLICATE_SIDE_MS=15*60*1000;

  function s(v){return String(v==null?'':v).trim();}
  function normAtt(v){const x=s(v).replace(/^0+/,'');return x||s(v);}
  function normEmp(v){return s(v).replace(/\s+/g,'').toUpperCase();}
  function normName(v){return s(v).replace(/\([^)]*\)\s*$/,'').replace(/\s+/g,'').toUpperCase();}
  function recordType(r){
    const x=s(r&&r.status||r&&r['出勤狀態']);
    if(x==='IN'||x.includes('上班簽到')||x==='簽到'||(x.includes('上班')&&!x.includes('未'))) return 'IN';
    if(x==='OUT'||x.includes('下班簽退')||x==='簽退'||(x.includes('下班')&&!x.includes('未'))) return 'OUT';
    return 'OTHER';
  }
  function normalizeTime(v){
    let x=s(v).replace(/-/g,'/').replace(/\s+/g,' ');
    const m=x.match(/^(\d{2,4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if(!m) return x;
    let y=Number(m[1]); if(y<1911) y+=1911;
    return `${String(y).padStart(4,'0')}/${String(Number(m[2])).padStart(2,'0')}/${String(Number(m[3])).padStart(2,'0')} ${String(Number(m[4]||0)).padStart(2,'0')}:${String(Number(m[5]||0)).padStart(2,'0')}:${String(Number(m[6]||0)).padStart(2,'0')}`;
  }
  function ts(r){
    const n=normalizeTime(r&&r.timeStr||r&&r['出勤時間']);
    const m=n.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if(!m) return NaN;
    return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),Number(m[6]),0).getTime();
  }
  function identity(r){
    const a=normAtt(r&&(r.attNo!=null?r.attNo:r['考勤號碼'])); if(a) return 'ATT:'+a;
    const e=normEmp(r&&(r.empId||r['自定義編號'])); if(e) return 'EMP:'+e;
    const n=normName(r&&(r.name||r['姓名'])); return n?'NAME:'+n:'';
  }
  function isManual(r){
    const source=s(r&&r.source).toLowerCase();
    const loc=s(r&&r.location);
    const note=s(r&&r.note);
    return r&&r.manuallyEdited===true || s(r&&r.manuallyEdited).toLowerCase()==='true' || source.includes('manual') || loc.includes('管理員手動') || note.includes('管理員手動');
  }
  function normalizedRecord(raw,index){
    const r={...raw};
    if(r.attNo==null) r.attNo=raw['考勤號碼'];
    if(!r.empId) r.empId=raw['自定義編號'];
    if(!r.name) r.name=raw['姓名'];
    if(!r.timeStr) r.timeStr=raw['出勤時間'];
    if(!r.status) r.status=raw['出勤狀態'];
    r.timeStr=normalizeTime(r.timeStr);
    r.__type=recordType(r); r.__ts=ts(r); r.__identity=identity(r); r.__index=index;
    return r;
  }
  function recency(r){
    const a=Date.parse(s(r&&r.manuallyEditedAt))||0;
    const b=Date.parse(s(r&&r.v5PairLinkedAt||r&&r.manualPairLinkedAt))||0;
    const idn=Number(r&&r.id)||0;
    return Math.max(a,b,idn);
  }
  function prefer(a,b){
    if(!b) return a;
    const am=isManual(a), bm=isManual(b); if(am!==bm) return am?a:b;
    const ar=recency(a), br=recency(b); if(ar!==br) return ar>br?a:b;
    return (a.__index||0)>(b.__index||0)?a:b;
  }
  function eventKey(r){
    const t=r.__type||recordType(r), i=r.__identity||identity(r), tm=normalizeTime(r.timeStr);
    return i&&t!=='OTHER'&&tm?`${i}|${t}|${tm}`:'';
  }
  function dedupe(records){
    const map=new Map(), loose=[];
    records.forEach(r=>{const k=eventKey(r); if(!k){loose.push(r);return;} map.set(k,prefer(r,map.get(k)));});
    return [...map.values(),...loose].sort((a,b)=>(a.__ts||0)-(b.__ts||0)||(a.__index||0)-(b.__index||0));
  }
  function accountingDateForSession(inRec,outRec){
    const base=inRec||outRec;
    const calendar=normalizeTime(base&&base.timeStr).slice(0,10).replace(/\//g,'-');
    // A completed dawn call-out belongs to the previous night when most of its
    // actual working time falls before 08:00. Early arrival for a normal day
    // shift remains on its calendar day. Never alter either punch timestamp.
    if(!inRec||!outRec)return calendar;
    const start=ts(inRec),end=ts(outRec),day=new Date(start);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>MAX_SHIFT_MS||day.getHours()>=8)return calendar;
    const cutoff=new Date(day.getFullYear(),day.getMonth(),day.getDate(),8).getTime();
    const night=Math.max(0,Math.min(end,cutoff)-start),after=Math.max(0,end-Math.max(start,cutoff));
    if(night<=after)return calendar;
    day.setDate(day.getDate()-1);
    return [day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');
  }
  function pairSession(inRec,outRec,reason,allRecords){
    const rawList=Array.isArray(allRecords)?allRecords:[inRec,outRec];
    const seen=new Set();
    const list=rawList.filter(Boolean).filter(r=>{if(seen.has(r))return false;seen.add(r);return true;});
    const base=inRec||outRec||list[0]||{};
    const baseTime=(inRec&&inRec.timeStr)||(outRec&&outRec.timeStr)||'';
    const actualDateKey=baseTime.slice(0,10).replace(/\//g,'-');
    const date=accountingDateForSession(inRec,outRec);
    const month=date.slice(0,7);
    const selectedCount=(inRec?1:0)+(outRec?1:0);
    const duplicateCount=Math.max(0,list.length-selectedCount);
    // V6.0.7：讓管理介面可直接讀取系統判斷標籤，不更動原有狀態及配對結果。
    // 缺少簽到/簽退、跨日、人工補卡與重複刷卡可同時顯示。
    const overnight=!!(inRec&&outRec&&normalizeTime(inRec.timeStr).slice(0,10)!==normalizeTime(outRec.timeStr).slice(0,10));
    // 僅以此班次實際採用的簽到／簽退判定補卡；鄰近重複刷卡與舊配對資料不可污染標籤。
    // 一般員工打卡即使曾由管理員修正時間，也不是「人工補卡」。
    const manual=[inRec,outRec].filter(Boolean).some(r=>{
      const source=s(r.source).toLowerCase();
      const loc=s(r.location);
      const note=s(r.note);
      return source==='manual-admin' || source==='manual-pair-recovery' ||
        source==='manual-punch' || loc.includes('管理員手動補卡') || note.includes('管理員手動補刷');
    });
    const attendanceCheckLabels=[];
    if(!inRec) attendanceCheckLabels.push('缺少簽到');
    else if(!outRec) attendanceCheckLabels.push('缺少簽退');
    else attendanceCheckLabels.push('正常配對');
    if(overnight) attendanceCheckLabels.push('跨日班次');
    if(manual) attendanceCheckLabels.push('人工補卡');
    if(duplicateCount>0) attendanceCheckLabels.push('重複刷卡已整合');
    return {
      attNo:base.attNo,empId:base.empId,name:base.name,dept:base.dept||'一般',unit:base.unit||'',jobTitle:base.jobTitle||'',
      clockIn:inRec||null,clockOut:outRec||null,records:list,
      key:`${identity(base)}|${inRec?inRec.timeStr:''}|${outRec?outRec.timeStr:''}`,
      dateKey:date,accountingDateKey:date,accountingMonthKey:month,actualDateKey,workDateAdjusted:date!==actualDateKey,
      attendanceStatus:inRec&&outRec
        ? (duplicateCount>0?'已整合｜同班次重複刷卡':'正常')
        : (inRec?'缺少簽退':'缺少簽到'),
      duplicateRecordCount:duplicateCount,
      attendanceCheckLabels,attendanceChecks:{overnight,manual,duplicateMerged:duplicateCount>0,missingIn:!inRec,missingOut:!outRec},
      noteText:[...new Set(list.map(x=>s(x.note)).filter(Boolean))].join(' / '),
      locationText:s((list.slice().sort((a,b)=>(b.__ts||0)-(a.__ts||0)).find(x=>s(x.location))||{}).location),
      sortTime:inRec?inRec.__ts:(outRec?outRec.__ts:0),v6PairReason:reason||''
    };
  }
  function explicitTargetId(r){return s(r.v5PairTargetId);}
  function legacyTargetId(r){return r.__type==='OUT'?s(r.manualPairClockInId):r.__type==='IN'?s(r.manualPairClockOutId):'';}
  function explicitTargetTime(r){
    return r.__type==='OUT'
      ? normalizeTime(r.manualPairClockInTimeStr)
      : (r.__type==='IN' ? normalizeTime(r.manualPairClockOutTimeStr) : '');
  }
  function validPair(a,b){
    const i=a.__type==='IN'?a:b.__type==='IN'?b:null;
    const o=a.__type==='OUT'?a:b.__type==='OUT'?b:null;
    if(!i||!o) return false;
    // V6.0.3：明確禁止跨員工配對。舊資料可能有重複 record.id，
    // 只看 ID 會把 A 員工的人工 OUT 掛到 B 員工的 IN。
    if(i.__identity!==o.__identity) return false;
    const d=o.__ts-i.__ts; return Number.isFinite(d)&&d>=0&&d<=MAX_SHIFT_MS;
  }
  function sessionIdentity(session){
    const r=session&&((session.clockIn)||(session.clockOut)||(Array.isArray(session.records)?session.records[0]:null));
    return r?(r.__identity||identity(r)):'';
  }
  function uniqueSessionRecords(memberSessions){
    const out=[],seen=new Set();
    (Array.isArray(memberSessions)?memberSessions:[]).forEach(session=>{
      const rows=Array.isArray(session&&session.records)&&session.records.length
        ? session.records
        : [session&&session.clockIn,session&&session.clockOut];
      rows.filter(Boolean).forEach(r=>{if(!seen.has(r)){seen.add(r);out.push(r);}});
    });
    return out;
  }
  function mergedSession(memberSessions,reason){
    const records=uniqueSessionRecords(memberSessions);
    const ins=records.filter(r=>r.__type==='IN').sort((a,b)=>a.__ts-b.__ts||a.__index-b.__index);
    const outs=records.filter(r=>r.__type==='OUT').sort((a,b)=>a.__ts-b.__ts||a.__index-b.__index);
    const inRec=ins[0]||null;                 // 上班保留最早
    const outRec=outs.length?outs[outs.length-1]:null; // 下班保留最晚
    if(inRec&&outRec&&!validPair(inRec,outRec)){
      // 理論上近重複合併不會跨過 24 小時；若舊髒資料真的發生，退回原班次避免誤合。
      return memberSessions[0];
    }
    return pairSession(inRec,outRec,reason,records);
  }
  function consolidateNearDuplicateSessions(inputSessions){
    const groups=new Map();
    (Array.isArray(inputSessions)?inputSessions:[]).forEach(session=>{
      const id=sessionIdentity(session);
      if(!id){groups.set('NOID:'+(groups.size+1),[session]);return;}
      if(!groups.has(id))groups.set(id,[]);
      groups.get(id).push(session);
    });

    const result=[];
    groups.forEach(list=>{
      const completeClusters=[];
      const orphans=[];

      // ① 完整班次只有 IN 與 OUT 都在 15 分鐘內才可彼此合併。
      list.forEach(session=>{
        if(!(session.clockIn&&session.clockOut)){orphans.push(session);return;}
        let bestIndex=-1,bestScore=Infinity;
        completeClusters.forEach((cluster,index)=>{
          const base=mergedSession(cluster,'near-duplicate-complete');
          if(!base.clockIn||!base.clockOut)return;
          const inDiff=Math.abs(base.clockIn.__ts-session.clockIn.__ts);
          const outDiff=Math.abs(base.clockOut.__ts-session.clockOut.__ts);
          if(inDiff<=NEAR_DUPLICATE_SIDE_MS&&outDiff<=NEAR_DUPLICATE_SIDE_MS){
            const score=inDiff+outDiff;
            if(score<bestScore){bestScore=score;bestIndex=index;}
          }
        });
        if(bestIndex>=0)completeClusters[bestIndex].push(session);
        else completeClusters.push([session]);
      });

      // ② 孤立 IN/OUT 若靠近完整班次同側，吸收到該班。
      const remainingOrphans=[];
      orphans.forEach(session=>{
        const side=session.clockIn?'IN':(session.clockOut?'OUT':'');
        const sideRec=side==='IN'?session.clockIn:session.clockOut;
        if(!sideRec){remainingOrphans.push(session);return;}

        let bestIndex=-1,bestDiff=Infinity;
        completeClusters.forEach((cluster,index)=>{
          const base=mergedSession(cluster,'near-duplicate-side');
          const target=side==='IN'?base.clockIn:base.clockOut;
          if(!target)return;
          const diff=Math.abs(target.__ts-sideRec.__ts);
          if(diff<=NEAR_DUPLICATE_SIDE_MS&&diff<bestDiff){bestDiff=diff;bestIndex=index;}
        });
        if(bestIndex>=0)completeClusters[bestIndex].push(session);
        else remainingOrphans.push(session);
      });

      completeClusters.forEach(cluster=>{
        result.push(mergedSession(
          cluster,
          cluster.length>1?'near-duplicate-merged':(cluster[0].v6PairReason||'paired')
        ));
      });

      // ③ 沒有完整班次可吸附的同側孤兒，也以 15 分鐘為一群，避免連續多刷顯示很多列。
      const bySide={IN:[],OUT:[]};
      remainingOrphans.forEach(session=>{
        const side=session.clockIn?'IN':(session.clockOut?'OUT':'');
        if(side)bySide[side].push(session);
        else result.push(session);
      });
      ['IN','OUT'].forEach(side=>{
        const sorted=bySide[side].sort((a,b)=>{
          const ar=(side==='IN'?a.clockIn:a.clockOut),br=(side==='IN'?b.clockIn:b.clockOut);
          return (ar&&ar.__ts||0)-(br&&br.__ts||0);
        });
        let cluster=[];
        let anchorTs=NaN;
        const flush=()=>{
          if(!cluster.length)return;
          result.push(mergedSession(
            cluster,
            cluster.length>1?'near-duplicate-orphan-merged':(cluster[0].v6PairReason||'orphan')
          ));
          cluster=[];anchorTs=NaN;
        };
        sorted.forEach(session=>{
          const r=side==='IN'?session.clockIn:session.clockOut;
          const t=r&&r.__ts;
          if(!cluster.length){cluster=[session];anchorTs=t;return;}
          if(Number.isFinite(t)&&Number.isFinite(anchorTs)&&Math.abs(t-anchorTs)<=NEAR_DUPLICATE_SIDE_MS){
            cluster.push(session);
          }else{
            flush();cluster=[session];anchorTs=t;
          }
        });
        flush();
      });
    });

    return result;
  }

  function isSyntheticManualPairRecovery(r){
    const source=s(r&&r.source).toLowerCase();
    const id=s(r&&r.id);
    const note=s(r&&r.note);
    const location=s(r&&r.location);
    return source==='manual-pair-recovery' ||
      /^PAIRREC_(IN|OUT)_/i.test(id) ||
      note.includes('由人工補卡配對資料自動還原') ||
      location.includes('系統自動修復');
  }
  function calendarDateKey(r){
    const t=normalizeTime(r&&r.timeStr);
    return t ? t.slice(0,10) : '';
  }
  function suppressReplacedSyntheticRecoveries(records){
    const list=Array.isArray(records)?records:[],realKeys=new Set(),byId=new Map(),manualReal=[];
    list.forEach(r=>{
      const id=s(r.id);if(id){if(!byId.has(id))byId.set(id,[]);byId.get(id).push(r);}
      if(isSyntheticManualPairRecovery(r))return;
      realKeys.add([r.__identity,r.__type,calendarDateKey(r)].join('|'));
      if(isManual(r))manualReal.push(r);
    });
    return list.filter(r=>{
      if(!isSyntheticManualPairRecovery(r))return true;
      const key=[r.__identity,r.__type,calendarDateKey(r)].join('|');
      if(realKeys.has(key))return false;
      // Only retire a stale synthetic side when its exact old counterpart and
      // a genuine manual correction both explicitly select the same replacement.
      // A same-day alternative alone is not evidence that a real punch is obsolete.
      const oldTargets=[explicitTargetId(r),legacyTargetId(r)].filter(Boolean);
      for(const real of manualReal){
        if(real.__identity!==r.__identity||real.__type===r.__type||!validPair(r,real))continue;
        const targets=[explicitTargetId(real),legacyTargetId(real)].filter(Boolean);
        for(const targetId of targets){
          if(targetId===s(r.id))continue;
          const replacements=(byId.get(targetId)||[]).filter(t=>t.__identity===r.__identity&&t.__type===r.__type&&calendarDateKey(t)===calendarDateKey(r)&&validPair(t,real));
          if(!replacements.length)continue;
          for(const oldId of oldTargets){
            const chained=(byId.get(oldId)||[]).some(old=>old.__identity===r.__identity&&old.__type===real.__type&&calendarDateKey(old)===calendarDateKey(real)&&validPair(r,old)&&[explicitTargetId(old),legacyTargetId(old)].includes(targetId));
            if(chained)return false;
          }
        }
      }
      return true;
    });
  }
  function buildShifts(rawRecords){
    const prepared=(Array.isArray(rawRecords)?rawRecords:[])
      .map(normalizedRecord)
      .filter(r=>r.__type!=='OTHER'&&r.__identity&&Number.isFinite(r.__ts));
    // V6.0.7：舊 manual-pair-recovery 若同人同日同側已有真正事件，先丟掉 synthetic recovery。
    // 例如 23:40 IN 曾被舊 recovery 01:02 OUT 綁住，但同日另有真正 07:51 OUT，
    // 必須讓 07:51 參與正式班次配對，不能讓舊 recovery 永久搶走上班。
    const normalized=dedupe(suppressReplacedSyntheticRecoveries(prepared));
    // V6.0.3：同一個舊 record.id 可能不只一筆，不能 Map(id -> 單筆)。
    // 改成 Map(id -> 候選陣列)，再用員工身份、方向、目標時間挑真正 target。
    const byId=new Map();
    normalized.forEach(r=>{
      const id=s(r.id);
      if(!id) return;
      if(!byId.has(id)) byId.set(id,[]);
      byId.get(id).push(r);
    });

    const used=new Set(),sessions=[];
    const use=(a,b,reason)=>{if(!a||!b||used.has(a)||used.has(b)||!validPair(a,b)) return false;const i=a.__type==='IN'?a:b,o=a.__type==='OUT'?a:b;used.add(i);used.add(o);sessions.push(pairSession(i,o,reason));return true;};

    const pickExplicitTarget=(r,id)=>{
      const wantedType=r.__type==='OUT'?'IN':(r.__type==='IN'?'OUT':'');
      if(!wantedType) return null;
      const wantedTime=explicitTargetTime(r);
      const candidates=(byId.get(id)||[])
        .filter(t=>
          t!==r &&
          !used.has(t) &&
          t.__type===wantedType &&
          t.__identity===r.__identity &&
          validPair(r,t)
        )
        .sort((a,b)=>{
          const ae=wantedTime&&normalizeTime(a.timeStr)===wantedTime?0:1;
          const be=wantedTime&&normalizeTime(b.timeStr)===wantedTime?0:1;
          if(ae!==be) return ae-be;
          return Math.abs(a.__ts-r.__ts)-Math.abs(b.__ts-r.__ts);
        });
      return candidates[0]||null;
    };

    normalized.forEach(r=>{
      if(used.has(r)) return;
      const ids=[explicitTargetId(r),legacyTargetId(r)].filter(Boolean);
      for(const id of ids){
        const t=pickExplicitTarget(r,id);
        if(t&&use(r,t,'explicit-id')) return;
      }
    });
    // V6.0.7：反向人工配對由每筆全表掃描，改為一次建立目標 ID 索引。
    // 同一目標可有多筆候選；仍保留原排序與 used/身份/24 小時驗證。
    const reverseTargetIndex=new Map();
    normalized.forEach(x=>{
      const targetIds=new Set([explicitTargetId(x),legacyTargetId(x)].filter(Boolean));
      targetIds.forEach(targetId=>{
        if(!reverseTargetIndex.has(targetId)) reverseTargetIndex.set(targetId,[]);
        reverseTargetIndex.get(targetId).push(x);
      });
    });
    normalized.forEach(r=>{
      if(used.has(r)||!s(r.id)) return;
      const rt=normalizeTime(r.timeStr);
      const candidates=(reverseTargetIndex.get(s(r.id))||[])
        .filter(x=>
          !used.has(x) &&
          x!==r &&
          x.__identity===r.__identity &&
          validPair(r,x)
        )
        .sort((a,b)=>{
          const at=explicitTargetTime(a), bt=explicitTargetTime(b);
          const ae=at&&at===rt?0:1, be=bt&&bt===rt?0:1;
          if(ae!==be) return ae-be;
          return Math.abs(a.__ts-r.__ts)-Math.abs(b.__ts-r.__ts);
        });
      const t=candidates[0]||null;
      if(t) use(r,t,'reverse-explicit-id');
    });
    normalized.forEach(r=>{
      if(used.has(r)||!isManual(r)) return;
      const want=r.__type==='OUT'?'IN':'OUT';let best=null,bestDiff=Infinity;
      normalized.forEach(c=>{
        if(c===r||used.has(c)||c.__type!==want||c.__identity!==r.__identity) return;
        if(!validPair(r,c)) return;
        const d=Math.abs(c.__ts-r.__ts);if(d<bestDiff){best=c;bestDiff=d;}
      });
      if(best) use(r,best,'manual-rescue');
    });

    const groups=new Map();
    normalized.forEach(r=>{if(used.has(r))return;if(!groups.has(r.__identity))groups.set(r.__identity,[]);groups.get(r.__identity).push(r);});
    groups.forEach(list=>{
      list.sort((a,b)=>a.__ts-b.__ts||a.__index-b.__index);
      const open=[];
      for(const r of list){
        if(r.__type==='IN'){open.push(r);continue;}
        if(r.__type==='OUT'){
          while(open.length&&r.__ts-open[0].__ts>MAX_SHIFT_MS){const old=open.shift();used.add(old);sessions.push(pairSession(old,null,'expired-in'));}
          if(open.length){const i=open.shift();use(i,r,'fifo');}
          else{used.add(r);sessions.push(pairSession(null,r,'orphan-out'));}
        }
      }
      open.forEach(i=>{if(!used.has(i)){used.add(i);sessions.push(pairSession(i,null,'open-in'));}});
    });
    const consolidated=consolidateNearDuplicateSessions(sessions);
    consolidated.sort((a,b)=>(b.sortTime||0)-(a.sortTime||0));
    return consolidated;
  }
  function install(){
    if(typeof window==='undefined') return false;
    window.p79V6BuildDailyAttendanceRows=buildShifts;
    window.buildDailyAttendanceRows=function(sourceRecords){return buildShifts(sourceRecords);};
    window.p79AttendanceEngineVersion='V6.0.9-WORK-DATE';
    console.info('[PORT79] Attendance V6.0.9 work-date rule installed');
    return true;
  }
  return {MAX_SHIFT_MS,NEAR_DUPLICATE_SIDE_MS,normalizeTime,recordType,identity,isManual,dedupe,accountingDateForSession,buildShifts,install};
});
if(typeof window!=='undefined'&&window.P79AttendanceV6){window.P79AttendanceV6.install();}


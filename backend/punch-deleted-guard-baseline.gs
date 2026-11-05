// Production-derived V99 baseline for isolated guard regression tests.
const API_VERSION = '2026.11.05.V99-PUNCH-READ-IO';

function p79CheckDuplicatePunchGuard_(record, ss) {
  const type = p79PunchGuardStatusType_(record && record.status);
  if (!type) return { ok:true };

  let state = p79ReadPunchGuardState_(record);
  if (!state) return { ok:true };

  const recordId = normalizeId_(record && record.id);
  if (recordId && normalizeId_(state.id) === recordId) {
    return { ok:true, idempotent:true };
  }

  if (normalizeText_(state.type) === type && ss) {
    try {
      if (p79RepairStalePunchGuard_(ss, record, state)) state = p79ReadPunchGuardState_(record) || state;
    } catch (err) {
      console.warn('Punch guard reconciliation unavailable; duplicate protection retained');
    }
  }

  if (normalizeText_(state.type) === type) {
    const label = type === 'IN' ? '上班簽到' : '下班簽退';
    return {
      ok:false,
      duplicatePunch:true,
      retryable:false,
      error:'已完成' + label +
        (state.timeStr ? '（' + state.timeStr + '）' : '') +
        '，請勿重複刷卡',
      lastPunchStatus:state.status || '',
      lastPunchTime:state.timeStr || '',
      lastPunchId:state.id || ''
    };
  }

  return { ok:true };
}


function p79RepairStalePunchGuard_(ss,record,state) {
  const guardTime=p79GuardEventMillis_(state&&state.timeStr);
  const incomingTime=p79GuardEventMillis_(record&&record.timeStr);
  if (!ss || !Number.isFinite(guardTime) || !Number.isFinite(incomingTime) || incomingTime<=guardTime) return false;
  const months=[attendanceMonthKeyFromTimeStr_(state.timeStr),attendanceMonthKeyFromRecord_(record)]
    .filter(function(m,i,a){return m && a.indexOf(m)===i;});
  const deleted=getDeletedRecordIds_(ss);
  const channel=p79PunchGuardChannel_(record.status);
  let latest=null, latestTime=guardTime, ambiguous=false;
  const scannedSheets=[];
  months.forEach(function(month) {
    // Current month's main table may contain the previous month's late/manual rows.
    const main=ss.getSheetByName(SHEET_RECORDS);
    const sheets=[];
    if (main && sheets.indexOf(main)<0) sheets.push(main);
    if (month!==attendanceCurrentMonthKey_()) {
      const historical=getAttendanceMonthlySheet_(ss,month,false);
      if (historical && sheets.indexOf(historical)<0) sheets.push(historical);
    }
    sheets.forEach(function(sheet) {
      if (scannedSheets.indexOf(sheet)>=0) return;
      scannedSheets.push(sheet);
      readRecords_(sheet).forEach(function(item) {
        if (!p79GuardSameEmployee_(record,item) || deleted[normalizeId_(item.id)] ||
            p79PunchGuardChannel_(item.status)!==channel || !p79PunchGuardStatusType_(item.status)) return;
        const at=p79GuardEventMillis_(item.timeStr);
        if (!Number.isFinite(at) || at<=guardTime) return;
        if (at>latestTime) { latest=item; latestTime=at; ambiguous=false; }
        else if (at===latestTime && latest && p79PunchGuardStatusType_(latest.status)!==p79PunchGuardStatusType_(item.status)) ambiguous=true;
      });
    });
  });
  if (!latest || latestTime>incomingTime || ambiguous || p79PunchGuardStatusType_(latest.status)===state.type) return false;
  // Called under the existing employee UserLock. Never replace a newer accepted IN.
  const current=p79ReadPunchGuardState_(record);
  if (!current || normalizeId_(current.id)!==normalizeId_(state.id) || current.timeStr!==state.timeStr || current.type!==state.type) return false;
  p79WritePunchGuardState_(Object.assign({},latest,{attNo:record.attNo,empId:record.empId}));
  return true;
}

function fixtureEndMarker_() {}

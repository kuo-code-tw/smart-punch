// Candidate helper for isolated GAS validation only. Do not deploy to production.
// The caller holds the existing employee punch lock and must save the new IN
// through its usual acknowledged path. The older missing OUT is left for audit.
function p79AllowNextShiftAfterOldOpenIn_(ss, record, state) {
  const blocked={ok:false};
  try {
    if (!ss || !record || !state || state.type!=='IN' ||
        p79PunchGuardStatusType_(record.status)!=='IN') return blocked;
    const oldAt=p79GuardEventMillis_(state.timeStr);
    const newAt=p79GuardEventMillis_(record.timeStr);
    // Match the front end's rolling 24-hour unresolved check-in window.
    if (!Number.isFinite(oldAt) || !Number.isFinite(newAt) ||
        newAt-oldAt < 24*60*60*1000) return blocked;
    const oldId=normalizeId_(state.id);
    if (!oldId || !normalizeId_(record.id) || oldId===normalizeId_(record.id))
      return blocked;
    const guard=p79ReadPunchGuardState_(record);
    if (!guard || normalizeId_(guard.id)!==oldId ||
        guard.timeStr!==state.timeStr || guard.type!=='IN') return blocked;
    const deleted=getDeletedRecordIds_(ss);
    if (deleted[oldId]) return blocked;
    const main=ss.getSheetByName(SHEET_RECORDS);
    if (!main) return blocked;
    const sheets=[main];
    const monthKeys=[
      attendanceMonthKeyFromTimeStr_(state.timeStr),
      attendanceMonthKeyFromTimeStr_(record.timeStr),
      attendanceCurrentMonthKey_()
    ];
    if (monthKeys.some(key=>!/^\d{4}-(0[1-9]|1[0-2])$/.test(key))) return blocked;
    const monthIndex=key=>Number(key.slice(0,4))*12+Number(key.slice(5))-1;
    const [firstMonth,punchMonth,currentMonth]=monthKeys.map(monthIndex);
    // The annual ledger has a separate sheet for every month, including today.
    for (let index=firstMonth; index<=Math.max(punchMonth,currentMonth); index++) {
      const key=String(Math.floor(index/12)).padStart(4,'0')+'-'+
        String(index%12+1).padStart(2,'0');
      const monthly=getAttendanceMonthlySheet_(ss,key,false);
      // A missing month is unknown evidence, not proof of zero newer punches.
      // This also stops if an annual book is missing or redirected unexpectedly.
      if (!monthly) return blocked;
      if (!sheets.includes(monthly)) sheets.push(monthly);
    }
    const channel=p79PunchGuardChannel_(record.status);
    const seen=new Set();
    let oldInVerified=false;
    for (const sheet of sheets) {
      const rows=readRecords_(sheet);
      if (!Array.isArray(rows)) return blocked;
      for (const row of rows) {
        if (!p79GuardSameEmployee_(record,row) ||
            p79PunchGuardChannel_(row.status)!==channel) continue;
        const itemType=p79PunchGuardStatusType_(row.status);
        if (!itemType) continue;
        const id=normalizeId_(row.id);
        if (deleted[id]) continue;
        const at=p79GuardEventMillis_(row.timeStr);
        if (!id || !Number.isFinite(at)) return blocked;
        const key=id+'|'+String(at)+'|'+itemType;
        if (seen.has(key)) continue;
        seen.add(key);
        // Later events or ambiguous same-time evidence cannot be overridden.
        if (at>oldAt || (at===oldAt && (id!==oldId || itemType!=='IN')))
          return blocked;
        if (id===oldId && at===oldAt && itemType==='IN') oldInVerified=true;
      }
    }
    if (!oldInVerified) return blocked;
    // Do not create an OUT. The prior unmatched IN remains pending review.
    return {ok:true,previousOpenShiftNeedsReview:true,
      previousOpenPunchId:oldId,previousOpenPunchTime:state.timeStr};
  } catch (_) {
    // Unreadable ledger / missing authorization may never enable a punch.
    return blocked;
  }
}

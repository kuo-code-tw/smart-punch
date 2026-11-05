// Production-derived V98 read functions; apply guarded patch, not standalone deployment.

function p79ReadAttendanceMainDirectUnprotectedV54_(ss, monthKey, selfSession) {
  const sheet = ensureSheet_(ss, SHEET_RECORDS, RECORD_HEADERS);
  if (sheet.getLastRow() < 2) {
    return {records:[], rawRows:0, parsedRows:0, sheetName:sheet.getName()};
  }

  const lastCol = Math.max(sheet.getLastColumn(), 9);
  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0]
    .map(function(v){ return normalizeText_(v); });
  const values = sheet.getRange(2, 1, sheet.getLastRow()-1, lastCol).getDisplayValues();

  function indexOfHeader_(names, fallback) {
    for (let i=0;i<names.length;i++) {
      const idx = headers.indexOf(names[i]);
      if (idx >= 0) return idx;
    }
    return fallback;
  }

  const idx = {
    id:indexOfHeader_(['ID','Id','id'],0),
    attNo:indexOfHeader_(['考勤號碼','考勤號'],1),
    empId:indexOfHeader_(['工號','員工工號'],2),
    name:indexOfHeader_(['姓名','員工姓名'],3),
    dept:indexOfHeader_(['部門'],4),
    time:indexOfHeader_(['完整考勤時間','考勤時間','時間'],5),
    status:indexOfHeader_(['出勤狀態','狀態'],6),
    note:indexOfHeader_(['備註'],7),
    location:indexOfHeader_(['地點','位置'],8),
    sourceEventKey:indexOfHeader_(['來源原始識別','sourceEventKey'],9),
    manuallyEdited:indexOfHeader_(['人工修改','manuallyEdited'],10),
    manuallyEditedAt:indexOfHeader_(['人工修改時間','manuallyEditedAt'],11),
    source:indexOfHeader_(['資料來源','來源','source'],12),
    importFile:indexOfHeader_(['匯入檔案','importFile'],13),
    fullJson:indexOfHeader_(['完整資料JSON','完整JSON','fullDataJSON'],14)
  };

  // 時間欄讀原始值，避免 Sheets 顯示格式省略補零或秒數。
  const rawTimes=sheet.getRange(2,idx.time+1,values.length,1).getValues();
  const key = String(monthKey || '').trim();
  const out = [];
  const spreadsheetTimeZone = (typeof ss.getSpreadsheetTimeZone === 'function'
    ? ss.getSpreadsheetTimeZone() : Session.getScriptTimeZone()) || 'Asia/Taipei';

  values.forEach(function(row, i){
    if(selfSession && !p79PunchSelfMatches_(selfSession,{empId:row[idx.empId],attNo:row[idx.attNo],name:row[idx.name]}))return;
    const rawTime=rawTimes[i][0];
    const timeStr = rawTime instanceof Date?Utilities.formatDate(rawTime,spreadsheetTimeZone,'yyyy/MM/dd HH:mm:ss'):normalizeText_(row[idx.time]);
    const month = attendanceMonthKeyFromTimeStr_(timeStr);
    if (key && month !== key) return;

    const empId = normalizeEmpId_(row[idx.empId]);
    const attNo = normalizeText_(row[idx.attNo]);
    const name = normalizeText_(row[idx.name]);
    const status = normalizeText_(row[idx.status]);

    if ((!empId && !attNo && !name) || !timeStr || !status) return;

    // V2026.10.06.02：主表直讀也必須保留第 15 欄完整 JSON。
    // 否則 manualPairClockIn/Out、PAIRGRP、v5PairTargetId 會在 direct API 被剝掉，
    // 前端雖然看到資料庫已有下班簽退，卻無法知道它要配到哪一筆上班。
    const fullData = idx.fullJson >= 0
      ? safeJsonParse_(row[idx.fullJson], {})
      : {};

    const fallbackId = 'DIRECT_' + (i + 2) + '_' +
      String(empId || attNo || name || 'UNKNOWN').replace(/[^A-Za-z0-9一-龥]/g, '') + '_' +
      String(timeStr || '').replace(/\D/g, '') + '_' +
      (status.indexOf('上班') >= 0 ? 'IN' : (status.indexOf('下班') >= 0 ? 'OUT' : 'OTHER'));

    out.push(normalizeRecordPayload_({record:Object.assign({}, fullData, {
      id: normalizeId_(row[idx.id]) || normalizeId_(fullData.id) || fallbackId,
      attNo: attNo || fullData.attNo || '',
      empId: empId || normalizeEmpId_(fullData.empId),
      name: name || normalizeText_(fullData.name),
      dept: normalizeText_(row[idx.dept]) || normalizeText_(fullData.dept),
      timeStr: timeStr || normalizeText_(fullData.timeStr || fullData.time),
      status: status || normalizeText_(fullData.status),
      note: normalizeText_(row[idx.note]) || normalizeText_(fullData.note),
      location: normalizeText_(row[idx.location]) || normalizeText_(fullData.location),
      sourceEventKey: normalizeText_(row[idx.sourceEventKey]) || normalizeText_(fullData.sourceEventKey),
      manuallyEdited: normalizeText_(row[idx.manuallyEdited]) || fullData.manuallyEdited,
      manuallyEditedAt: normalizeText_(row[idx.manuallyEditedAt]) || normalizeText_(fullData.manuallyEditedAt),
      source: normalizeText_(row[idx.source]) || normalizeText_(fullData.source) || 'main-direct-read',
      importFile: normalizeText_(row[idx.importFile]) || normalizeText_(fullData.importFile)
    })}));
  });

  return {
    records: out,
    rawRows: values.length,
    parsedRows: out.length,
    sheetName: sheet.getName(),
    headers: headers
  };
}

function p79ReadAttendanceMainDirect_(ss,monthKey,selfSession){
 const result=p79ReadAttendanceMainDirectUnprotectedV54_(ss,monthKey,selfSession);
 if(monthKey&&monthKey!==attendanceCurrentMonthKey_())return result;
 const records=p79MergeProtectedPunchOriginals_(ss.getSheetByName(SHEET_RECORDS),result.records,selfSession);
 return Object.assign({},result,{records:records,protectedOriginalsAdded:records.length-result.records.length});
}

function p79MergeProtectedPunchOriginals_(sheet, records, selfSession) {
  const ss=sheet.getParent();if(sheet.getName()!==SHEET_RECORDS||ss.getId()!=='1QlixVO7V0tAdx64n1npQmWCFW8sNvsfdVh-vEtGpakE')return records||[];
  const month=attendanceCurrentMonthKey_(),original=p79PunchOriginalSheet_(ss,month,false);if(!original||original.getLastRow()<2)return records||[];
  const deleted=getDeletedRecordIds_(ss),result=(records||[]).slice(),seen=new Set(result.map(r=>normalizeId_(r.id)));
  original.getRange(2,1,original.getLastRow()-1,RECORD_HEADERS.length).getValues().forEach(row=>{
    let record;try{record=JSON.parse(String(row[14]||''));}catch(e){throw Error('打卡原始保護資料無法解析，主表未覆寫');}
    const id=normalizeId_(record.id);if(!id||attendanceMonthKeyFromRecord_(record)!==month||deleted[id]||seen.has(id))return;
    if(String(record.source||'').toLowerCase().indexOf('employee')<0)return;
    if(selfSession && !p79PunchSelfMatches_(selfSession,record))return;
    seen.add(id);result.push(record);
  });return result;
}

function p79PunchSelfMatches_(session,record){
 const empId=normalizeEmpId_(session && session.empId);
 if(!empId)return false;
 const recordId=normalizeEmpId_(record && record.empId);
 if(recordId)return recordId===empId;
 const attNo=normalizeText_(session.attNo),name=normalizeText_(session.name).replace(/\s+/g,'');
 return !!attNo && !!name && normalizeText_(record && record.attNo)===attNo &&
   normalizeText_(record && record.name).replace(/\s+/g,'')===name;
}

function p79PunchSelfReadRouteSnapshot_(params){
      const ss = getSpreadsheet_(true);
      const token = params.token || params.gcToken || '';
      const punchSelf = String(params.punchSelf || '') === '1';
      const selfSession = punchSelf ? userRequireTokenCore_(ss, token) : null;
      if (token && !punchSelf) userRequireTokenCore_(ss, token);
      const month = String(params.month || attendanceCurrentMonthKey_()).trim();
      const direct = p79ReadAttendanceMainDirect_(ss, month, selfSession);

      const deletedIds = getDeletedRecordIds_(ss);
      const filteredRecords = direct.records.filter(function(record) {
        const id = normalizeId_(record && record.id);
        return !(id && deletedIds[id]);
      });
      const validRecords = punchSelf ? filteredRecords : p79EnrichAttendanceIdentities_(ss, filteredRecords);

      return jsonOutput({
        ok:true,
        action:'getAttendanceMainDirect',
        punchSelf:punchSelf,
        empId:selfSession ? normalizeEmpId_(selfSession.empId) : '',
        month:month,
        sheetName:direct.sheetName,
        rawRows:direct.rawRows,
        parsedRows:direct.parsedRows,
        deletedFiltered:direct.records.length - validRecords.length,
        records:validRecords,
        apiVersion:API_VERSION,
        serverTime:Date.now()
      });

}

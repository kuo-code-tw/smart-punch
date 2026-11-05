// V96 production-derived router and leave receipt functions. Apply with the guarded patch script.
function port79DoPostCore_(e) {
  P79_OT_HISTORY_ACTOR_=null;P79_OT_HISTORY_ACTION_='';
  let lock = null;
  let employeeLock = null;
  let acquiredDataWriteLock = false;
  let action = '';
  let scheduleSaveUnchanged = false;
  let directOvertimeRevisionFinalized = false;

  try {
    // 一律先建立可解析的 data；無論成功或失敗都由 jsonOutput 回 JSON。
    const data = parsePostData_(e);
    action = normalizeAction_(data);
    P79_OT_HISTORY_ACTION_=action;

    if (!action) {
      throw new Error('缺少 action 參數');
    }

    // POST 健康檢查不需要碰 Google Sheet，避免健康檢查本身拖慢登入。
    if (action === 'pingPost') {
      return jsonOutput({
        ok: true,
        version: API_VERSION,
        method: 'POST',
        scheduleSavePipeline: 'V5-SCHEDULE-RECEIPT-VERIFIED',
        scheduleSaveReceiptVersion: 1,
        message: 'GAS POST JSON 正常'
      });
    }

    if (action === 'queueEmployeePunch') return jsonOutput(queueEmployeePunchFast_(data));
    if (action === 'persistEmployeePunch') return jsonOutput(persistEmployeePunchFast_(data));
    if (action === 'addRecord' && p79IsRealtimeEmployeePunchPayload_(data)) return jsonOutput(addEmployeePunchFast_(data));

    const fastAuthAction = action === 'verifyUser' || action === 'loginUser' ||
      action === 'verifyAdmin' || action === 'adminLogin' || action === 'loginAdmin' ||
      action === 'gcSuperAdminLogin';

    // 排班編輯鎖是極輕量控制訊號：
    // 不應為了取得/續租/釋放編輯權去開啟試算表、ensure 六張工作表或掃員工主檔。
    const scheduleLockAction = [
      'scheduleAcquireEditLock',
      'scheduleHeartbeatEditLock',
      'scheduleReleaseEditLock',
      'scheduleForceAcquireEditLock',
      'scheduleForceReleaseEditLock'
    ].includes(action);

    // 排班月份儲存本身會 ensure 其正式資料分頁，無需每次先確保考勤／員工／請假等六張表。
    const fastScheduleMonthSave = ['saveOvertimeReportDirect','syncSchedules','saveSchedules','saveScheduleMonth','recordOvertimeReportExport','recordOvertimeReportExportBatch','saveScheduleSpecialDays'].includes(action);
    const fastLeaveWrite = ['addLeave','addLeaveRecord','saveLeaveCoverAssignment'].includes(action);
    const ss = scheduleLockAction ? null : getSpreadsheet_(fastAuthAction || fastScheduleMonthSave || fastLeaveWrite || /^gc(?:Upsert|Delete|Assign|Sync)/.test(action) || action === 'migrateVesselToDrive');


    // POST 健康檢查。
    if (action === 'speedTest') {
      const started = Date.now();
      const sheet = ensureSheet_(ss, SHEET_RECORDS, RECORD_HEADERS);
      return jsonOutput({
        ok: true,
        action: 'speedTest',
        elapsedMs: Date.now() - started,
        records: Math.max(0, sheet.getLastRow() - 1),
        message: 'GAS 雲端速度測試完成'
      });
    }

    // 首頁統一登入：登入後由 GAS 回傳實際身分角色。
    if (action === 'verifyUser' || action === 'loginUser') {
      return jsonOutput(verifyUser_(ss, data));
    }

    // 登入驗證只讀資料，不需要寫入鎖。
    if (action === 'verifyAdmin' || action === 'adminLogin' || action === 'loginAdmin') {
      return jsonOutput(verifyAdmin_(ss, data));
    }

    // G/C 超級管理員登入驗證：成功後核發短效 Token。
    if (action === 'gcSuperAdminLogin') {
      return jsonOutput(gcCreateSuperAdminSession_(ss, data));
    }

    if (action === 'gcLogout') {
      return jsonOutput(gcLogoutSession_(ss, data.gcToken || data.token || '', data));
    }

    // 正式版：所有 G/C 相關寫入都必須通過超級管理員 Token 驗證。
    if (String(action).indexOf('gc') === 0 &&
        action !== 'gcSuperAdminLogin' &&
        action !== 'gcLogout') {
      gcRequireSystemPermission_(ss, data.gcToken || data.token || '', 'efficiency', 'manage');
    }

    // 排班多人編輯鎖：取得 / 心跳 / 釋放不進入下方共用資料寫入鎖，
    // 由各自函式用短 ScriptLock 原子更新 ScriptProperties。
    if (action === 'scheduleAcquireEditLock') {
      return jsonOutput(scheduleAcquireEditLock_(ss, data.gcToken || data.token || '', data.scheduleClientId || data.clientId || ''));
    }
    if (action === 'scheduleHeartbeatEditLock') {
      return jsonOutput(scheduleHeartbeatEditLock_(ss, data.gcToken || data.token || '', data.scheduleClientId || data.clientId || ''));
    }
    if (action === 'scheduleReleaseEditLock') {
      return jsonOutput(scheduleReleaseEditLock_(ss, data.gcToken || data.token || '', data.scheduleClientId || data.clientId || ''));
    }
    // v2026.09.28.7.39：超級管理員可踢除目前排班編輯者並原子接管編輯鎖。
    if (action === 'scheduleForceAcquireEditLock') {
      return jsonOutput(scheduleForceAcquireEditLock_(ss, data.gcToken || data.token || '', data.scheduleClientId || data.clientId || ''));
    }
    if (action === 'scheduleForceReleaseEditLock') {
      return jsonOutput(scheduleForceReleaseEditLock_(ss, data.gcToken || data.token || '', data.scheduleClientId || data.clientId || ''));
    }

    if ([
      'deleteOvertimeAssignment','syncSchedules','saveSchedules','saveScheduleMonth','saveScheduleGroups','saveScheduleShiftTimes'
    ].includes(action)) {
      gcRequireSystemPermission_(ss, data.gcToken || data.token || '', 'schedule', 'manage');
      scheduleRequireEditLockOwner_(ss, data.gcToken || data.token || '', data.scheduleClientId || data.clientId || '');
    }

    // v2026.10.01：把「員工主檔」寫入鎖與其他系統的大型寫入拆開。
    // 舊版所有 POST 都共用 ScriptLock，效率／排班／考勤任何一個長任務
    // 都會把 hrUpsertEmployee 卡住並回傳「雲端目前正在處理其他資料」。
    const employeeMasterActions = [
      'hrUpsertEmployee','hrDeleteEmployee','hrSetEmploymentStatus',
      'hrSaveOrgSettings','hrSaveOrganizationSettings','saveHrOrgSettings',
      'hrUnbindEmployeeDevice','hrSetPunchDeviceBypass','hrClearSessionLogs','hrClearEmployeeHistory',
      'syncEmployees','saveEmployees','upsertEmployee','saveEmployee',
      'updateEmployee','deleteEmployee','setEmployeeDevice','unbindEmployeeDevice',
      'updateLeaveBalances'
    ];
    const isEmployeeMasterWrite = employeeMasterActions.includes(action);

    if (isEmployeeMasterWrite) {
      // 人資 / 員工主檔使用獨立 DocumentLock，
      // 不再被考勤、請假、排班、效率的 ScriptLock 長任務阻塞。
      employeeLock = LockService.getDocumentLock() || LockService.getScriptLock();
      if (!employeeLock.tryLock(15000)) {
        return jsonOutput({
          ok: false,
          retryable: true,
          rejectedBeforeWrite: true,
          retryAfterMs: 1500,
          error: '人資主檔目前正在由其他操作更新，系統將自動重試'
        });
      }
      acquiredDataWriteLock = true;
    } else {
      lock = LockService.getScriptLock();
      // 一般系統寫入仍維持原本快速回傳機制。
      if (!lock.tryLock(5000)) {
        return jsonOutput({
          ok: false,
          retryable: true,
          rejectedBeforeWrite: true,
          retryAfterMs: 1500,
          error: '雲端目前正在處理其他資料，請稍後自動重試'
        });
      }

      acquiredDataWriteLock = true;

      // 只有取得寫入互斥鎖之後才驗證並續租排班編輯權。
      // 正式儲存的單一 POST 即可兼做編輯權確認，不再要求前端先打一次 Heartbeat。
      // 任何其他帳號/分頁都不能搶寫；強制接管也需等待這把鎖釋放。
      if (['deleteOvertimeAssignment','syncSchedules','saveSchedules','saveScheduleMonth',
           'saveScheduleGroups','saveScheduleShiftTimes'].includes(action)) {
        scheduleRenewEditLockForWriteUnderScriptLock_(
          ss, data.gcToken || data.token || '', data.scheduleClientId || data.clientId || ''
        );
      }

      // syncAllData 會同時寫員工主檔，因此還要拿人資主檔鎖，
      // 避免它和 hrUpsertEmployee 同時覆寫員工資料。
      if (action === 'syncAllData') {
        employeeLock = LockService.getDocumentLock() || LockService.getScriptLock();
        if (!employeeLock.tryLock(15000)) {
          return jsonOutput({
            ok: false,
            retryable: true,
          rejectedBeforeWrite: true,
          retryAfterMs: 1500,
            error: '人資主檔目前正在更新，全部同步將自動重試'
          });
        }
      }
    }

    // PORT79 2026-10-10 V09：只有真正會改動考勤/排班/效率「月份資料」的操作，
    // 才需要在寫入前檢查每月歸檔。登入紀錄清空是獨立的人資稽核資料清除：
    // 舊版先跑 attendance-recovery，導致 Drive 資料夾失效時「登入紀錄」根本還沒執行。
    // 登入／登出寫入、人資資料、請假、普通配置都不能被不相干的月份歸檔阻斷。
    // 原本的所有 Token/操作權限驗證、DocumentLock/ScriptLock 及實際工作表函式仍執行。
    // 刪除考勤維持 V07/V08 的獨立墓碑/多來源清理保護，不跳過刪除函式。
    // V13：addRecord 與 editRecord / updateRecord 同樣是單筆考勤操作。
    // addRecord_ 已透過 getAttendanceSheetForRecord_ 選取主表或正式年度月份表，
    // 保留既有身分、紀錄及安全檢查；不得先占住 ScriptLock 執行整月歸檔。
    // 月份遷移與救回仍由 syncRecords / repair / migrate 專用動作負責。
    // 不修改任何既有待同步 payload，不略過防重複或刪除墓碑驗證。
    // V4 根因修正：排班寫入不得因考勤 Drive 救回的 ID 核對失敗而被阻斷。
    // syncSchedules_ 自行依排班月份儲存正式主表或歷史月份表；無須先跑
    // port79AutoMonthlyRollover_（考勤救回、船舶月結、歷史排班遷移）。
    // 這只解除無關工作間的依賴：所有考勤資料及考勤月結仍維持原本的安全停止機制。
    const monthlyRolloverDependentActions = [
      'syncRecords','saveRecords',
      'syncAllData','repairAttendanceRecords','migrateAttendanceToDrive'
      // V58: vessel actions keep their own Drive month migration; never run attendance rollover here.
    ];
    if (monthlyRolloverDependentActions.includes(action)) {
      port79AutoMonthlyRollover_(true);
    } else {
      Logger.log('PORT79_V09_SKIP_UNRELATED_MONTHLY_ROLLOVER action=' + action);
    }

    switch (action) {

      /* ---------- 系統登入紀錄 ---------- */
      case 'logSession':
        return jsonOutput(saveSessionLog_(ss, data));

      /* ---------- 考勤 ---------- */
      case 'addRecord':
        return jsonOutput(addRecord_(ss, data));
      case 'batchEditRecords':
        return jsonOutput(p79BatchEditRecordsV15_(ss, data));
      case 'editRecord':
      case 'updateRecord':
        return jsonOutput(editRecord_(ss, data));
      case 'deleteRecord':
        return jsonOutput(deleteRecord_(ss, data));
      case 'syncRecords':
      case 'saveRecords':
        return jsonOutput(syncRecords_(ss, data));

      /* ---------- 人資管理系統 ---------- */
      case 'hrUpsertEmployee':
        return jsonOutput(hrUpsertEmployeeSecure_(ss, data));
      case 'hrDeleteEmployee':
        return jsonOutput(hrDeleteEmployeeSecure_(ss, data));
      case 'hrSetEmploymentStatus':
        return jsonOutput(hrSetEmploymentStatusSecure_(ss, data));
      case 'hrSaveOrgSettings':
      case 'hrSaveOrganizationSettings':
      case 'saveHrOrgSettings':
        return jsonOutput(hrSaveOrgSettingsSecure_(ss, data));
      case 'hrSetPunchDeviceBypass':
        return jsonOutput(hrSetPunchDeviceBypassSecure_(ss,data));
      case 'hrUnbindEmployeeDevice':
        return jsonOutput(hrUnbindEmployeeDeviceSecure_(ss, data));
      case 'hrClearSessionLogs':
        return jsonOutput(hrClearSessionLogsSecure_(ss, data));
      case 'hrClearEmployeeHistory':
        return jsonOutput(hrClearEmployeeHistorySecure_(ss, data));

      /* ---------- 員工（舊版相容） ---------- */
      case 'syncEmployees':
      case 'saveEmployees':
        return jsonOutput(syncEmployees_(ss, data));

      /* ---------- 系統設定 ---------- */
      case 'syncConfig':
      case 'saveConfig':
        return jsonOutput(syncConfig_(data));
      case 'upsertEmployee':
      case 'saveEmployee':
      case 'updateEmployee':
        return jsonOutput(upsertEmployee_(ss, data));
      case 'syncAllData':
        return jsonOutput(syncAllData_(ss, data));
      case 'deleteEmployee':
        return jsonOutput(deleteEmployee_(ss, data));
      case 'setEmployeeDevice':
        return jsonOutput(setEmployeeDevice_(ss, data));
      case 'unbindEmployeeDevice':
        return jsonOutput(unbindEmployeeDevice_(ss, data));

      /* ---------- 請假 ---------- */
      case 'addLeave':
      case 'addLeaveRecord':
        return jsonOutput(addLeave_(ss, data));
      case 'syncLeaveRecords':
      case 'saveLeaveRecords':
        return jsonOutput(syncLeaveRecords_(ss, data));
      case 'updateLeaveStatus':
        return jsonOutput(updateLeaveStatus_(ss, data));
      case 'recordOvertimeReportExport':
        return jsonOutput(p79RecordOvertimeReportExport_(ss,data));
      case 'saveScheduleSpecialDays':
        return jsonOutput(p79SaveScheduleSpecialDays_(ss,data));
      case 'recordOvertimeReportExportBatch':
        return jsonOutput(p79RecordOvertimeReportExportBatch_(ss,data));
      case 'saveOvertimeReportDirect': {
        const saved=p79SaveDirectOvertimeReport_(ss,data);
        // Finalize the revision before serializing the ACK, while holding ScriptLock.
        if(saved.ok===true){
          const revision=touchScheduleSyncRevision_();
          saved.revision=[revision,getLeaveSyncRevision_(),getEmployeeAuthRevision_(),String(data.date).slice(0,7)].join(':');
          saved.backendSavePipeline='20261104-leave-overtime-fast-v1';
          directOvertimeRevisionFinalized=true;
        }
        return jsonOutput(saved);
      }
      case 'setOvertimeDateReviewState':
        return jsonOutput(p79SetOvertimeDateReviewState_(ss,data));
      case 'deleteOvertimeAssignment':
        return jsonOutput(p79DeleteOvertimeAssignment_(ss,data));
      case 'saveLeaveCoverAssignment':
        return jsonOutput(p79SaveLeaveCoverAssignment_(ss, data));
      case 'editLeaveRecord':
      case 'updateLeaveRecord':
        return jsonOutput(editLeaveRecord_(ss, data));
      case 'cleanupOrphanLeaveCovers':
        return jsonOutput(p79CleanupOrphanLeaveCovers_(ss, data));
      case 'deleteLeaveRecord':
      case 'deleteLeave':
        return jsonOutput(deleteLeaveRecord_(ss, data));
      case 'cleanupInvalidLeaveRecords':
        return jsonOutput(cleanupInvalidLeaveRecords_(ss));
      case 'updateLeaveBalances':
        return jsonOutput(updateLeaveBalances_(ss, data));

      /* ---------- 舊考勤資料修復 ---------- */
      case 'repairAttendanceRecords':
        return jsonOutput(repairAttendanceRecords_(ss));

      case 'migrateAttendanceToDrive': {
        const session = userRequireToken_(ss, data.token || data.userToken || data.gcToken || '');
        const role = normalizeText_(session.adminRole || session.role).toLowerCase();
        const permission = role === 'superadmin'
          ? 'manage'
          : normalizeSystemPermissionLevel_((session.systemPermissions || {}).attendance, 'none');
        if (role !== 'superadmin' && permission !== 'manage') throw new Error('只有考勤系統管理權限可以執行考勤資料搬移');
        return jsonOutput(migrateAttendanceLegacyToDrive_(true));
      }

      case 'migrateVesselToDrive':
        return jsonOutput(migrateGcLegacyToDrive_(true));

      /* ---------- G/C 個人效率 ---------- */
      case 'gcUpsertGroup':
        return jsonOutput(gcUpsertGroup_(ss, data));
      case 'gcDeleteGroup':
        return jsonOutput(gcDeleteGroup_(ss, data));
      case 'gcAssignEmployee':
        return jsonOutput(gcAssignEmployee_(ss, data));
      case 'gcUpsertRecord':
        return jsonOutput(gcUpsertRecord_(ss, data));
      case 'gcDeleteRecord':
        return jsonOutput(gcDeleteRecord_(ss, data));
      case 'gcUpsertShipMaster':
        return jsonOutput(gcUpsertShipMaster_(ss, data));
      case 'gcDeleteShipMaster':
        return jsonOutput(gcDeleteShipMaster_(ss, data));
      case 'gcSyncAll':
        return jsonOutput(gcSyncAll_(ss, data));

      /* ---------- 排班 ---------- */
      case 'syncSchedules':
      case 'saveSchedules':
      case 'saveScheduleMonth': {
        // 多人編輯權已於 ScriptLock 內驗證。相同請求 ID 只能完成一次。
        const requestId=normalizeText_(data.saveRequestId || '');
        const clientId=normalizeText_(data.scheduleClientId || data.clientId || '');
        const token=data.gcToken || data.token || '';
        const owner=requestId ? scheduleRequireCachedPermission_(token,'manage') : null;
        if (requestId && !p79ScheduleReceiptKey_(clientId,requestId)) {
          throw new Error('排班儲存請求編號不合法，已停止寫入');
        }
        if (requestId) {
          const previous=p79ScheduleReadSaveReceipt_(clientId,requestId);
          if (previous && normalizeEmpId_(previous.ownerEmpId) !== normalizeEmpId_(owner.empId)) {
            throw new Error('此儲存編號與原始儲存者不符，已停止寫入');
          }
          if (previous && normalizeEmpId_(previous.ownerEmpId) === normalizeEmpId_(owner.empId)) {
            if (normalizeScheduleMonth_(data.month || data.yearMonth) !== previous.month) {
              throw new Error('相同儲存編號對應不同月份，已停止重複寫入');
            }
            scheduleSaveUnchanged=true;
            return jsonOutput({ok:true,receiptConfirmed:true,replayed:true,
              saveRequestId:requestId,month:previous.month,count:previous.count,
              message:'雲端確認此筆班表先前已儲存，沒有重複寫入'});
          }
        }
        const saved = syncSchedules_(ss, data);
        scheduleSaveUnchanged = !!saved.unchanged;
        if (requestId) {
          saved.saveRequestId=requestId;
          saved.receiptConfirmed=p79ScheduleRecordSaveReceipt_(owner,clientId,requestId,saved);
        }
        return jsonOutput(saved);
      }
      case 'saveScheduleEmployee':
      case 'upsertScheduleEmployee':
        return jsonOutput(saveScheduleEmployee_(ss, data));
      case 'syncScheduleEmployees':
        return jsonOutput(syncScheduleEmployees_(ss, data));
      case 'saveScheduleGroups':
        return jsonOutput(saveScheduleGroups_(data));
      case 'saveScheduleShiftTimes':
        return jsonOutput(p79SaveShiftTimes_(data));

      default:
        throw new Error('未知操作: [' + action + ']。請檢查前端傳送的 action 參數。');
    }

  } catch (err) {
    return jsonOutput({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });

  } finally {
    P79_OT_HISTORY_ACTOR_=null;P79_OT_HISTORY_ACTION_='';
    // Revision publication remains inside the write lock.

    // 人員／權限主檔只有真的被修改時才更新獨立驗證版本。
    // Token 驗證可直接使用 Cache，不再因考勤打卡或其他系統寫入而反覆掃描整張員工清單。
    if (acquiredDataWriteLock && action && p79IsEmployeeMasterMutationAction_(action)) {
      try { touchEmployeeAuthRevision_(); } catch (ignore) {}
    }
    if (acquiredDataWriteLock && action && p79IsScheduleMutationAction_(action) && !scheduleSaveUnchanged && !directOvertimeRevisionFinalized) {
      try { touchScheduleSyncRevision_(); } catch (ignore) {}
    }
    if (acquiredDataWriteLock && action && p79IsLeaveMutationAction_(action)) {
      try { touchLeaveSyncRevision_(); } catch (ignore) {}
    }

    // 所有寫入類 action 完成後更新同步版本。
    // 手機/電腦只輪詢這個很小的版本值，版本變更時才重新抓完整資料。
    if (acquiredDataWriteLock && action && !scheduleSaveUnchanged && ![
      'pingPost',
      'speedTest',
      'verifyAdmin',
      'adminLogin',
      'loginAdmin',
      'getData',
      'getScheduleData',
      'getAdminUsers',
      'getSyncMeta',
      'getScheduleSyncMeta',
      'getLeaveData',
      'getScheduleDataSecure',
      // 匯出稽核不改班表、申報、考勤；不要讓自己的匯出使原始資料快取失效。
      'recordOvertimeReportExport','recordOvertimeReportExportBatch'
    ].includes(action)) {
      try { touchSyncRevision_(); } catch (ignore) {}
    }
    if (employeeLock) {
      try {
        employeeLock.releaseLock();
      } catch (ignore) {}
    }
    if (lock) {
      try {
        lock.releaseLock();
      } catch (ignore) {}
    }
  }
}

function p79ConfirmSavedLeave_(sheet,row,leave,message) {
  const expected=leaveToRow_(leave),actual=sheet.getRange(row,1,1,LEAVE_HEADERS.length).getValues()[0]||[];
  const textColumns=[0,2,3,4,5,9,10,11];
  const same=textColumns.every(function(i){return normalizeText_(actual[i])===normalizeText_(expected[i]);})&&
    [6,7].every(function(i){return p79DateOnly_(actual[i])===p79DateOnly_(expected[i]);})&&Number(actual[8])===Number(expected[8]);
  if(!same)throw new Error('請假寫入未通過正式資料讀回確認，請保留原單號重新核對');
  return {ok:true,id:leave.id,days:leave.days,message:message,verified:true,backendSavePipeline:'20261105-leave-lock-retry-v1'};
}

function addLeave_(ss, data) {
  const sheet = ensureSheet_(
    ss,
    SHEET_LEAVE,
    LEAVE_HEADERS
  );

  const token = normalizeText_(data && (data.token || data.userToken || data.gcToken));
  const session = userRequireTokenCore_(ss, token);
  const leave = normalizeLeavePayload_(data);
  const role = normalizeText_(session.adminRole).toLowerCase();
  if (role !== 'admin' && role !== 'superadmin') {
    // 一般員工只能替自己申請，不能改送其他人的工號/姓名。
    leave.empId = normalizeEmpId_(session.empId);
    leave.attNo = normalizeText_(session.attNo);
    leave.name = normalizeText_(session.name);
    leave.dept = normalizeText_(session.dept);
    // 一般員工只能替自己提出申請，但可選擇法定／公司公告允許的假別。
    const allowedEmployeeLeaveTypes = [
      '特休假','事假','普通傷病假','公傷病假','婚假','喪假','公假',
      '產假','產檢假','陪產檢及陪產假','安胎休養請假','家庭照顧假','生理假','其他公司公告假別'
    ];
    leave.leaveType = normalizeText_(leave.leaveType);
    if (allowedEmployeeLeaveTypes.indexOf(leave.leaveType) < 0) {
      throw new Error('此假別目前未開放一般員工申請：' + (leave.leaveType || '未指定'));
    }
    leave.status = '待審核';
    leave.source = 'leave-system';
  }
  validateLeave_(leave);

  const leaveEmployee = findEmployeeByIdentity_(ss, leave.empId, leave.attNo, leave.name);
  if (leaveEmployee && normalizeEmpId_(leaveEmployee.empId) !== 'ADMIN' && !isEmployeeActive_(leaveEmployee)) {
    throw new Error('新增請假失敗：' + normalizeText_(leaveEmployee.name || leaveEmployee.empId) + '目前為「' + employmentStatusLabel_(leaveEmployee.employmentStatus) + '」狀態');
  }

  // 如果相同 ID 已存在，直接更新，避免重複新增
  const existingRow = findRowById_(sheet, leave.id);

  if (existingRow >= 2) {
    sheet.getRange(
      existingRow,
      1,
      1,
      LEAVE_HEADERS.length
    ).setValues([leaveToRow_(leave)]);

    return p79ConfirmSavedLeave_(sheet,existingRow,leave,'請假紀錄已更新');
  }

  sheet.appendRow(leaveToRow_(leave));

  return p79ConfirmSavedLeave_(sheet,sheet.getLastRow(),leave,'請假紀錄已新增');
}
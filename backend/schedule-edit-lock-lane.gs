// V97 short edit-lock functions for fixed-owner web deployment; use guarded patch script.
function scheduleAcquireEditLock_(ss, token, clientId) {
  const session = scheduleRequireCachedPermission_(token, 'manage');
  const cid = normalizeText_(clientId);
  if (!cid) throw new Error('缺少排班編輯裝置識別碼，請重新整理排班頁面');
  // Deployment executes as the fixed owner, so UserLock is shared by all web clients.
  // This short lock is independent of long ScriptLock data reads/writes.
  const atomic = LockService.getUserLock();
  if (!atomic.tryLock(800)) throw new Error('排班編輯權正在切換中，請立即再試');
  try {
    const current = scheduleReadEditLock_();
    const empId = normalizeEmpId_(session.empId);
    const mine = !!current && normalizeEmpId_(current.ownerEmpId) === empId && normalizeText_(current.clientId) === cid;
    const sameAccount = !!current && normalizeEmpId_(current.ownerEmpId) === empId;

    // 同一帳號登出後重新登入、換分頁或換瀏覽器時，立即接管自己的舊鎖。
    // 舊分頁下一次 heartbeat / 儲存會因 clientId 不符而失去寫入權，避免雙寫。
    if (current && !mine && !sameAccount) return scheduleLockPublicState_(current, session, cid);

    const now = Date.now();
    const next = {
      ownerEmpId: empId,
      ownerName: normalizeText_(session.name) || empId,
      clientId: cid,
      startedAt: current && sameAccount ? Number(current.startedAt || now) : now,
      updatedAt: now,
      expiresAt: now + SCHEDULE_EDIT_LOCK_TTL_MS
    };
    PropertiesService.getScriptProperties().setProperty(SCHEDULE_EDIT_LOCK_PROPERTY_KEY, JSON.stringify(next));
    return scheduleLockPublicState_(next, session, cid);
  } finally {
    try { atomic.releaseLock(); } catch (ignore) {}
  }
}

function scheduleHeartbeatEditLock_(ss, token, clientId) {
  const session = scheduleRequireCachedPermission_(token, 'manage');
  const cid = normalizeText_(clientId);
  if (!cid) throw new Error('缺少排班編輯裝置識別碼');
  // Deployment executes as the fixed owner, so UserLock is shared by all web clients.
  // This short lock is independent of long ScriptLock data reads/writes.
  const atomic = LockService.getUserLock();
  if (!atomic.tryLock(1800)) throw new Error('排班編輯鎖續租暫時忙碌，請稍後重試');
  try {
    const current = scheduleReadEditLock_();
    const empId = normalizeEmpId_(session.empId);
    const mine = !!current && normalizeEmpId_(current.ownerEmpId) === empId && normalizeText_(current.clientId) === cid;
    if (!mine) return scheduleLockPublicState_(current, session, cid);
    const now = Date.now();
    current.updatedAt = now;
    current.expiresAt = now + SCHEDULE_EDIT_LOCK_TTL_MS;
    PropertiesService.getScriptProperties().setProperty(SCHEDULE_EDIT_LOCK_PROPERTY_KEY, JSON.stringify(current));
    return scheduleLockPublicState_(current, session, cid);
  } finally {
    try { atomic.releaseLock(); } catch (ignore) {}
  }
}

function scheduleReleaseEditLock_(ss, token, clientId) {
  const session = scheduleRequireCachedPermission_(token, 'view');
  const cid = normalizeText_(clientId);
  // Deployment executes as the fixed owner, so UserLock is shared by all web clients.
  // This short lock is independent of long ScriptLock data reads/writes.
  const atomic = LockService.getUserLock();
  if (!atomic.tryLock(500)) return Object.assign(scheduleLockPublicState_(scheduleReadEditLock_(), session, cid), { released:false });
  try {
    const current = scheduleReadEditLock_();
    const empId = normalizeEmpId_(session.empId);
    const mine = !!current && normalizeEmpId_(current.ownerEmpId) === empId && normalizeText_(current.clientId) === cid;
    if (mine) PropertiesService.getScriptProperties().deleteProperty(SCHEDULE_EDIT_LOCK_PROPERTY_KEY);
    return { ok:true, locked: mine ? false : !!current, mine:false, released:mine, ownerEmpId: mine || !current ? '' : normalizeEmpId_(current.ownerEmpId), ownerName: mine || !current ? '' : normalizeText_(current.ownerName), expiresAt: mine || !current ? 0 : Number(current.expiresAt || 0) };
  } finally {
    try { atomic.releaseLock(); } catch (ignore) {}
  }
}

function scheduleForceAcquireEditLock_(ss, token, clientId) {
  // 身分必須是真正 superadmin；一般 manage 管理員不能強制踢人。
  const session = scheduleRequireCachedSuperAdmin_(token);
  const cid = normalizeText_(clientId);
  if (!cid) throw new Error('缺少排班編輯裝置識別碼，請重新整理排班頁面');

  // Deployment executes as the fixed owner, so UserLock is shared by all web clients.
  // This short lock is independent of long ScriptLock data reads/writes.
  const atomic = LockService.getUserLock();
  if (!atomic.tryLock(800)) throw new Error('排班編輯權正在切換中，請立即再試');
  try {
    const current = scheduleReadEditLock_();
    const now = Date.now();
    const empId = normalizeEmpId_(session.empId);
    const kickedEmpId = current ? normalizeEmpId_(current.ownerEmpId) : '';
    const kickedName = current ? normalizeText_(current.ownerName) : '';

    const next = {
      ownerEmpId: empId,
      ownerName: normalizeText_(session.name) || empId,
      clientId: cid,
      startedAt: now,
      updatedAt: now,
      expiresAt: now + SCHEDULE_EDIT_LOCK_TTL_MS
    };
    PropertiesService.getScriptProperties().setProperty(SCHEDULE_EDIT_LOCK_PROPERTY_KEY, JSON.stringify(next));
    return Object.assign(scheduleLockPublicState_(next, session, cid), {
      forced: true,
      kicked: !!current && !(kickedEmpId === empId && normalizeText_(current.clientId) === cid),
      kickedEmpId: kickedEmpId,
      kickedName: kickedName
    });
  } finally {
    try { atomic.releaseLock(); } catch (ignore) {}
  }
}

function scheduleForceReleaseEditLock_(ss, token, clientId) {
  const session = scheduleRequireCachedSuperAdmin_(token);
  const cid = normalizeText_(clientId);
  // Deployment executes as the fixed owner, so UserLock is shared by all web clients.
  // This short lock is independent of long ScriptLock data reads/writes.
  const atomic = LockService.getUserLock();
  if (!atomic.tryLock(1500)) throw new Error('雲端正忙於排班鎖切換，請稍後再試');
  try {
    const current = scheduleReadEditLock_();
    const kickedEmpId = current ? normalizeEmpId_(current.ownerEmpId) : '';
    const kickedName = current ? normalizeText_(current.ownerName) : '';
    PropertiesService.getScriptProperties().deleteProperty(SCHEDULE_EDIT_LOCK_PROPERTY_KEY);
    return Object.assign(scheduleLockPublicState_(null, session, cid), {
      forced:true, released:true, kicked:!!current,
      kickedEmpId:kickedEmpId, kickedName:kickedName
    });
  } finally {
    try { atomic.releaseLock(); } catch(ignore) {}
  }
}

function scheduleRenewEditLockForWriteUnderScriptLock_(ss, token, clientId) {
  // Lock order is always ScriptLock then the short owner-scoped edit lock.
  const editAtomic=LockService.getUserLock();
  if(!editAtomic.tryLock(5000))throw new Error('排班編輯權正在確認，班表尚未寫入，請稍後重試');
  try {
  const session = scheduleRequireEditLockOwner_(ss, token, clientId);
  const current = scheduleReadEditLock_();
  if (!current || normalizeEmpId_(current.ownerEmpId) !== normalizeEmpId_(session.empId) ||
      normalizeText_(current.clientId) !== normalizeText_(clientId)) {
    throw new Error('排班編輯權已變更，班表尚未儲存');
  }
  const now = Date.now();
  current.updatedAt = now;
  current.expiresAt = now + SCHEDULE_EDIT_LOCK_TTL_MS;
  PropertiesService.getScriptProperties().setProperty(SCHEDULE_EDIT_LOCK_PROPERTY_KEY, JSON.stringify(current));
  return session;

  } finally { editAtomic.releaseLock(); }
}
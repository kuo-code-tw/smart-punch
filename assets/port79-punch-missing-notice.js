/* Port79 employee-only missing-punch notice.
 * Read-only. Never writes attendance, authorizes a punch or fabricates a checkout.
 * Caller must supply only one employee's cloud-confirmed current-month records.
 */
(function (root) {
  'use strict';
  const DAY_MS = 24 * 60 * 60 * 1000;
  let showing = '';
  function collectMissingPunches({ rows, confirmedIds, nowMs, parseTime, formatTime } = {}) {
    if (!Array.isArray(rows) || !Array.isArray(confirmedIds) ||
        typeof parseTime !== 'function' || typeof formatTime !== 'function' ||
        !Number.isFinite(nowMs)) return [];
    const trusted = new Set(confirmedIds.map(x => String(x || '')).filter(Boolean));
    const found = new Set();
    const missing = [];
    for (const row of rows) {
      if (!row || (!!row.clockIn === !!row.clockOut)) continue;
      const record = row.clockIn || row.clockOut;
      const id = String(record?.id ?? '').trim();
      if (!id || !trusted.has(id) || found.has(id)) continue;
      const time = Number(parseTime(record));
      // Do not mislabel today's open shift or an invalid/future punch as "missed".
      if (!Number.isFinite(time) || time <= 0 || nowMs - time <= DAY_MS) continue;
      found.add(id);
      missing.push({
        id,
        time,
        timeText: String(formatTime(record.timeStr) || record.timeStr || ''),
        missingType: row.clockIn ? '下班簽退' : '上班簽到',
        observedType: row.clockIn ? '上班簽到' : '下班簽退'
      });
    }
    return missing.sort((a, b) => b.time - a.time);
  }
  function localDay(nowMs) {
    const d = new Date(nowMs);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0')].join('-');
  }
  function showFromOfficial({ empId, month, rows, confirmedIds, parseTime, formatTime,
    nowMs = Date.now(), doc = typeof document !== 'undefined' ? document : null,
    storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null } = {}) {
    const employee = String(empId || '').trim().toUpperCase();
    if (!employee || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))) return { shown: false, items: [] };
    const items = collectMissingPunches({ rows, confirmedIds, nowMs, parseTime, formatTime });
    const existing = doc?.getElementById?.('p79MissingPunchNoticeDialog');
    if (!items.length) {
      // Identity may have changed; never leave another employee's notice visible.
      if (existing) existing.remove();
      showing = '';
      return { shown: false, items };
    }
    if (!doc?.body || typeof doc.createElement !== 'function') return { shown: false, items };
    const key = 'p79_missing_punch_notice_' + employee;
    const identity = [employee, month, localDay(nowMs),
      ...items.map(x => x.id + ':' + x.missingType)].join('|');
    let acknowledged = '';
    try { acknowledged = String(storage?.getItem(key) || ''); } catch (_) {}
    if (acknowledged === identity || showing === identity) return { shown: false, items };
    if (existing) existing.remove();
    const create = (tag, classes, text) => {
      const node = doc.createElement(tag);
      if (classes) node.className = classes;
      if (text != null) node.textContent = String(text);
      return node;
    };
    const overlay = create('div', 'fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 px-4 py-6');
    overlay.id = 'p79MissingPunchNoticeDialog';
    overlay.dataset.employee = employee;
    const card = create('div', 'w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-800');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', '未完成打卡提醒');
    card.appendChild(create('h2', 'text-lg font-black text-amber-700 dark:text-amber-300',
      '⚠ 您有尚未完成的打卡紀錄'));
    card.appendChild(create('p', 'mt-2 text-sm text-slate-700 dark:text-slate-200',
      '以下是本月雲端已確認的單邊打卡，請通知人資或管理員核對補卡。'));
    const list = create('div', 'mt-3 max-h-56 space-y-2 overflow-y-auto');
    for (const entry of items.slice(0, 4)) {
      const item = create('div', 'rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-slate-900');
      item.appendChild(create('div', 'font-semibold text-slate-800 dark:text-slate-100',
        entry.timeText + '　' + entry.observedType));
      item.appendChild(create('div', 'mt-1 font-bold text-rose-700 dark:text-rose-300',
        '缺少：' + entry.missingType));
      list.appendChild(item);
    }
    if (items.length > 4) list.appendChild(create('p', 'text-xs text-slate-500',
      '另外還有 ' + (items.length - 4) + ' 筆，請至考勤管理核對。'));
    card.appendChild(list);
    card.appendChild(create('p', 'mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300',
      '不會自動填入缺少的時間。此提醒不會解除同班重複打卡、裝置或 GPS 驗證；符合新班次規則時仍可正常打卡。'));
    const button = create('button',
      'mt-4 w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-700',
      '我知道了，繼續打卡');
    button.type = 'button';
    button.addEventListener('click', () => {
      try { storage?.setItem(key, identity); } catch (_) {}
      if (showing === identity) showing = '';
      overlay.remove();
    });
    card.appendChild(button);
    overlay.appendChild(card);
    doc.body.appendChild(overlay);
    showing = identity;
    return { shown: true, items };
  }
  const api = { collectMissingPunches, showFromOfficial };
  if (root) root.P79MissingPunchNotice = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null);

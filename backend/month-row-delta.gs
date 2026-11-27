// Dispatch from port79DoPostCore_ immediately after normalizeAction_.
function p79ReadMonthRowDelta_(data) {
  const fields = {
    getAttendanceMonthRaw: ['records'],
    getAttendanceMonthData: ['records'],
    getAttendanceMainDirect: ['records'],
    getScheduleDataSecure: ['employees', 'schedules', 'scheduleGroups', 'leaveRecords',
      'leaveCoverAssignments', 'leaveCoverCancellations']
  };
  const read = String(data.read || '');
  const month = String(data.month || '');
  if (!Object.prototype.hasOwnProperty.call(fields, read) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('月份同步參數不正確');
  }

  const token = String(data.token || '');
  if (!token) throw new Error('登入已失效');
  const request = {parameter:{action:read, month:month, token:token, gcToken:token}};
  const output = read === 'getScheduleDataSecure' ? port79DoGetCore_(request) : p79SecureLegacyRead_(request);
  const snapshot = JSON.parse(output.getContent());
  if (snapshot.ok !== true || snapshot.month !== month) return snapshot;

  const manifest = data.manifest || {};
  const changes = {};
  fields[read].forEach(function(field) {
    const rows = snapshot[field];
    const known = manifest[field];
    if (!Array.isArray(rows) || !Array.isArray(known) || !known.length || known.length > 25000) return;

    const indexByHash = new Map();
    known.forEach(function(hash, index) {
      if (typeof hash === 'string' && /^[A-Za-z0-9_-]{43}$/.test(hash)) indexByHash.set(hash, index);
    });
    changes[field] = rows.map(function(row) {
      const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
        p79MonthRowCanonical_(row), Utilities.Charset.UTF_8);
      const digest = Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
      return indexByHash.has(digest) ? -1 - indexByHash.get(digest) : row;
    });
    delete snapshot[field];
  });
  snapshot.rowDelta = {version:1, changes:changes};
  return snapshot;
}

function p79MonthRowCanonical_(value) {
  if (Array.isArray(value)) return '[' + value.map(p79MonthRowCanonical_).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function(key) {
      return JSON.stringify(key) + ':' + p79MonthRowCanonical_(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

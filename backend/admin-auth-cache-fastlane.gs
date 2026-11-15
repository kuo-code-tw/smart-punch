// Same cache/revision checks as userRequireTokenCore_. No new sessions or roles.
// A cache miss or changed employee permissions still uses the original locked path.
function p79CurrentCachedAdminSession_(token, superOnly) {
  const rawToken = String(token || '').trim();
  if (!rawToken) return null;
  const raw = CacheService.getScriptCache().get(GC_TOKEN_PREFIX + rawToken);
  if (!raw) return null;
  let session;
  try { session = JSON.parse(raw); } catch (_) { return null; }
  if (!session || !normalizeEmpId_(session.empId) || session.punchOnly === true) return null;
  if (String(session.authRevision || '') !== getEmployeeAuthRevision_()) return null;
  const role = String(session.adminRole || '').trim().toLowerCase();
  if (superOnly ? role !== 'superadmin' : role !== 'admin' && role !== 'superadmin') return null;
  return session;
}

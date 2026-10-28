// Replace the same-named functions in Code.gs; do not append duplicate definitions.
// Literal job titles only. Role/system/fine-permission checks stay in the existing HR router.
function p79AssignedJobTitle_(value) {
  if(typeof value!=='string')return '';
  var title=value.normalize('NFKC').trim();
  if(!title||title.length>64||/[\u0000-\u001f]/.test(title))return '';
  if(/^F\s*\/?\s*L$/i.test(title))return 'F/L';
  return title;
}
function p79NormalizeJobScopes_(emp) {
  var raw=emp&&emp.dataScopeJobs&&typeof emp.dataScopeJobs==='object'?emp.dataScopeJobs:{};
  var out={};
  ['attendance','workhours','leave','schedule','efficiency','hr','history'].forEach(function(sys){
    var values=Array.isArray(raw[sys])?raw[sys]:[];
    out[sys]=Array.from(new Set(values.map(p79AssignedJobTitle_).filter(Boolean))).slice(0,100);
  });
  return out;
}
function p79CanReadScopedEmployee_(session,sys,emp){
  var role=String(session&&session.adminRole||'').toLowerCase();
  if(role==='superadmin')return true;
  var scope=String(session&&session.dataScope&&session.dataScope[sys]||'department');
  var id=String(emp&&emp.empId||'').toUpperCase();
  if(scope==='self')return id===String(session.empId||'').toUpperCase();
  if(scope==='department')return String(emp.dept||'')===String(session.dept||'');
  if(scope==='unit')return !!String(session.unit||'')&&String(emp.unit||'')===String(session.unit||'');
  if(scope==='assigned'){
    var roles=p79NormalizeJobScopes_(session)[sys]||[];
    var title=p79AssignedJobTitle_(emp&&(emp.jobTitle||emp.deptDetail)||'');
    return !!title&&roles.indexOf(title)>=0;
  }
  return scope==='all';
}

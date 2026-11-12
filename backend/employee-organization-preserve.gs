/* V112: preserve canonical organization in existing employee JSON; no sheet/record migration. */
function p79PreserveEmployeeOrganization_(target, source, existing, authoritative) {
  source=source||{};existing=existing||{};
  const fields=['headquarters','division','office','section','orgHierarchy','organization','orgPath'];
  fields.forEach(function(field){
    const present=Object.prototype.hasOwnProperty.call(source,field);
    const stored=Object.prototype.hasOwnProperty.call(existing,field);
    if(!authoritative&&existing.empId){
      if(stored)target[field]=existing[field];else delete target[field];
    }else if(!present&&stored){target[field]=existing[field];}
    else if(present&&['headquarters','division','office','section'].indexOf(field)>=0){
      if(source[field]!==null&&typeof source[field]!=='string')throw Error('組織歸屬欄位必須是文字：'+field);
      target[field]=String(source[field]||'').trim();
      if(target[field].length>120)throw Error('組織名稱超過120字：'+field);
    }
  });
  // HR sends section and the compatible unit together. Old bulk clients cannot replace either.
  if(Object.prototype.hasOwnProperty.call(target,'section'))target.unit=target.section||'';
  return target;
}
function p79EmployeeOrganizationPath_(employee){
  const e=employee||{},nested=e.orgHierarchy||e.organization||e.orgPath||{};
  return ['headquarters','division','office','section'].map(function(field){
    if(Object.prototype.hasOwnProperty.call(e,field))return String(e[field]||'').trim();
    return String(nested[field]||(field==='section'?e.unit:'')||'').trim();
  });
}
function p79RecordOrganizationChange_(incoming,existing,actor){
  if(!existing)return;
  const before=p79EmployeeOrganizationPath_(existing),after=p79EmployeeOrganizationPath_(incoming);
  if(JSON.stringify(before)===JSON.stringify(after))return;
  const history=Array.isArray(incoming.transferHistory)?incoming.transferHistory.slice():Array.isArray(existing.transferHistory)?existing.transferHistory.slice():[];
  history.push({changedAt:new Date().toISOString(),changedBy:String(actor||''),kind:'organization',fromOrganization:before,toOrganization:after});
  incoming.transferHistory=history;
}

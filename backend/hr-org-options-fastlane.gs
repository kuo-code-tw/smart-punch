/* Organization options use a short owner-scoped config lock, independent of bulk data ScriptLock.
 * This deployment executes as its fixed owner. All config writers must use this same UserLock.
 */
function p79OrgConfigKeys_(){return ['hrOrgOptionsV1','hrOrgOptionsV2','departments','jobTitles'];}
function p79OrgConfigOnly_(config){
  const out={};p79OrgConfigKeys_().forEach(function(k){if(Object.prototype.hasOwnProperty.call(config,k))out[k]=config[k];});return out;
}
function p79WithConfigLock_(operation){
  const lock=LockService.getUserLock();
  if(!lock.tryLock(5000)){const e=new Error('組織設定正在儲存，請稍後再試');e.code='ORG_CONFIG_BUSY';e.retryable=true;throw e;}
  try{return operation();}finally{lock.releaseLock();}
}
function p79OrgList_(value,field){
  if(!Array.isArray(value)||value.length>500)throw Error('組織選項格式不完整：'+field);
  const seen=Object.create(null);value.forEach(function(v){if(typeof v!=='string'||v.trim().length>120)throw Error('組織選項名稱無效：'+field);if(v.trim())seen[v.trim()]=true;});
  return Object.keys(seen).sort();
}
function p79OrgOptionsPayload_(data){
  const a=data.settings||{},b=data.extendedSettings||{},legacy={},extended={};
  ['departments','units','jobTitles'].forEach(function(k){legacy[k]=p79OrgList_(a[k],k);});
  ['headquarters','divisions','offices','sections','hiddenJobTitles'].forEach(function(k){extended[k]=p79OrgList_(b[k],k);});
  const config={hrOrgOptionsV1:legacy,hrOrgOptionsV2:extended,departments:legacy.departments,jobTitles:legacy.jobTitles};
  if(Utilities.newBlob(JSON.stringify(config)).getBytes().length>8800)throw Error('組織設定容量不足，尚未儲存');
  return config;
}
function p79OrgOptionsRead_(data){
  gcRequireSystemPermission_(getSpreadsheet_(true),data.token||data.userToken||data.gcToken||'','hr','view');
  return {ok:true,config:getSystemConfig_(),orgSaveVersion:113};
}
function p79OrgOptionsSave_(data){
  gcRequireActionPermission_(getSpreadsheet_(true),data.token||data.userToken||data.gcToken||'','hr','org.manage');
  const wanted=p79OrgOptionsPayload_(data);
  const result=syncConfig_({config:wanted});
  const actual=p79OrgConfigOnly_(result.config);
  if(JSON.stringify(actual)!==JSON.stringify(wanted))throw Error('組織設定寫入後讀回不一致');
  touchSyncRevision_();
  return {ok:true,config:actual,orgSaveVersion:113};
}
// Editor-only release verification: persist current config unchanged while bulk ScriptLock is occupied.
function p79V113OrgConfigReleaseVerify(){
  const bulk=LockService.getScriptLock(),owned=bulk.tryLock(1000),started=Date.now();
  try{
    p79WithConfigLock_(function(){
      const before=JSON.stringify(getSystemConfig_());
      const saved=p79GpsSaveConfig_({config:{}});
      if(JSON.stringify(saved.config)!==before||JSON.stringify(getSystemConfig_())!==before)throw Error('正式設定保存讀回不一致');
    });
    Logger.log('ORG_V113_CONFIG_PERSIST PASS '+JSON.stringify({bulkLockOccupied:true,ownedBulkLock:owned,elapsedMs:Date.now()-started,configUnchanged:true,employeeWrites:0,attendanceWrites:0}));
  }finally{if(owned)bulk.releaseLock();}
}

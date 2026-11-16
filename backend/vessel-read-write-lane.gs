/* Deployed to the existing production Apps Script endpoint on 2026-11-16.
 * V122: physical read-only snapshots; vessel writes use UserLock, not unrelated ScriptLock. */
var p79VesselWriteLockV122_=null;
function p79VesselFence_(){return JSON.parse(PropertiesService.getScriptProperties().getProperty('P79_VESSEL_FENCE_V122')||'{"epoch":"initial","active":false}');}
function p79VesselBeginWrite_(){var mark={epoch:Utilities.getUuid(),active:true,at:Date.now()};PropertiesService.getScriptProperties().setProperty('P79_VESSEL_FENCE_V122',JSON.stringify(mark));return mark;}
function p79VesselEndWrite_(){SpreadsheetApp.flush();gcTouchRevision_();var mark=p79VesselFence_();mark.active=false;mark.finishedAt=Date.now();PropertiesService.getScriptProperties().setProperty('P79_VESSEL_FENCE_V122',JSON.stringify(mark));}
function p79VesselBusy_(message){return {ok:false,retryable:true,code:'VESSEL_SNAPSHOT_UNSTABLE',error:message||'船舶雲端資料正在同步，請稍後自動重試'};}
function p79VesselGetStableData_(ss,options){
 var before=p79VesselFence_();if(before.active)return p79VesselBusy_();
 var revision=gcGetRevision_(),auth=getEmployeeAuthRevision_(),key='v122_'+p79VesselSnapshotKey_(options)+'_'+before.epoch;
 var result=p79VesselSnapshotRead_(key)||p79VesselReadOnlyData_(ss,options||{}),after=p79VesselFence_();
 if(after.active||after.epoch!==before.epoch||revision!==gcGetRevision_()||auth!==getEmployeeAuthRevision_())return p79VesselBusy_('船舶資料在讀取期間已更新，正在重新核對完整快照');
 result.revision=revision;result.readPipeline='V122-PHYSICAL-READONLY';if(!result.snapshotCached)p79VesselSnapshotStore_(key,result);return result;
}
function p79VesselReadOnlyData_(ss,options){
 var opts=options||{},month=String(opts.month||''),year=String(opts.year||''),scope=String(opts.scope||'').toLowerCase();
 if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||year&&!/^\d{4}$/.test(year))throw Error('船舶讀取年月格式錯誤');
 var wantedYear=year||Utilities.formatDate(new Date(),'Asia/Taipei','yyyy');
 function inScope(m){return month?m===month:scope==='all'||m.slice(0,4)===wantedYear;}
 function required(name){var sheet=ss.getSheetByName(name);if(!sheet)throw Error('船舶唯讀來源缺少：'+name+'；未執行自動搬移或覆寫');return sheet;}
 var groupSheet=required(GC_SHEET_GROUPS),assignSheet=required(GC_SHEET_ASSIGN),shipSheet=required(GC_SHEET_SHIPS),recordSheet=required(GC_SHEET_RECORDS),employeeSheet=required(SHEET_EMPLOYEES);
 var index=gcGetDriveMonthIndexCached_();if(!index.length)throw Error('船舶月份索引缺少，未回傳不完整快照；請核對歷史索引');var registered={};index.forEach(function(m){registered[m]=true;});
 var source=gcReadRecords_(recordSheet),records=source.filter(function(r){return inScope(gcMonthKeyFromRecord_(r));}),months=index.slice(),legacy=ss.getSheets();
 source.forEach(function(r){var m=gcMonthKeyFromRecord_(r);if(m)months.push(m);});
 legacy.forEach(function(sheet){var m=gcMonthKeyFromMonthlySheetName_(sheet.getName())||gcMonthKeyFromDetailSheetName_(sheet.getName());if(!m)return;months.push(m);if(inScope(m)&&gcSheetLooksLikeRecordDetail_(sheet))records=records.concat(gcReadRecords_(sheet).filter(function(r){var rm=gcMonthKeyFromRecord_(r);return !rm||rm===m;}));});
 if(month)months.push(month);months=Array.from(new Set(months)).filter(function(m){return /^\d{4}-\d{2}$/.test(m)&&inScope(m);}).sort();
 var driveMonthMasters=[];
 months.forEach(function(m){
  var book=getGcYearSpreadsheet_(m,false);if(!book){if(registered[m])throw Error('已登記船舶月份缺少年度檔：'+m+'；未回傳不完整資料');return;}
  var detail=book.getSheetByName(gcMonthlyDetailSheetName_(m)),summary=book.getSheetByName(gcMonthlySheetName_(m)),found=false;
  [summary,detail].forEach(function(sheet){if(sheet&&gcSheetLooksLikeRecordDetail_(sheet)){found=true;records=records.concat(gcReadRecords_(sheet).filter(function(r){var rm=gcMonthKeyFromRecord_(r);return !rm||rm===m;}));}});
  if(registered[m]&&!found)throw Error('已登記船舶月份缺少有效人員明細：'+m+'；未執行自動修復');
  if(month&&summary&&gcSheetLooksLikeShipSummary_(summary))driveMonthMasters=p79GcReadSummarySheetDirect_(summary);
 });
 records=gcMergeRecordsById_([],records);
 var masters=gcReadShipMasters_(shipSheet);if(month)masters=p79MergeShipMastersByWorkingNo_(masters,driveMonthMasters);
 var employees=readEmployees_(employeeSheet).map(function(emp){var title=String(emp.jobTitle||emp.deptDetail||'');return {attNo:String(emp.attNo||''),attendanceNo:String(emp.attNo||''),attendanceId:String(emp.attNo||''),'考勤號碼':String(emp.attNo||''),empId:String(emp.empId||''),employeeId:String(emp.empId||''),name:String(emp.name||''),employeeName:String(emp.name||''),dept:String(emp.dept||''),department:String(emp.dept||''),jobTitle:title,deptDetail:title,role:title};});
 var groups=gcReadGroups_(groupSheet),assignments=gcReadAssignments_(assignSheet);
 return {ok:true,revision:gcGetRevision_(),groups:groups,assignments:assignments,records:records,shipMasters:masters,latestTwoShipMasters:gcLatestTwoShipMasters_(masters),latestTwoEfficiency:gcLatestTwoEfficiency_(masters),systemEmployees:employees,availableMonths:index,requestedMonth:month,driveMonthShipMasters:driveMonthMasters.length,mainShipMasters:masters.length,storage:{mode:'drive-year-month',folderId:GC_DRIVE_FOLDER_ID,recordsInDrive:true,shipMasterInMainSpreadsheet:true,scope:opts},counts:{groups:groups.length,assignments:assignments.length,records:records.length,shipMasters:masters.length,employees:employees.length},sheets:{groups:groupSheet.getName(),assignments:assignSheet.getName(),records:'Drive 年度船舶作業資料 / 月份分頁',shipMasters:shipSheet.getName()},serverTime:Date.now()};
}
// Editor-only, private isolated cloud workbook. Production data/folder functions are restored.
function p79ProbeVesselReadWriteLane(){
 var ss=getSpreadsheet_(true),start=Date.now(),first=gcGetDataSafe_(ss,{}),firstMs=Date.now()-start;
 if(!first.ok)throw Error(first.error);start=Date.now();var second=gcGetDataSafe_(ss,{}),secondMs=Date.now()-start;
 if(!second.ok||JSON.stringify(first.records)!==JSON.stringify(second.records)||JSON.stringify(first.shipMasters)!==JSON.stringify(second.shipMasters))throw Error('正式快照兩次讀回不一致');
 Logger.log(JSON.stringify({phase:'production-read',ok:true,firstMs:firstMs,secondMs:secondMs,records:first.records.length,ships:first.shipMasters.length,cached:!!second.snapshotCached,pipeline:second.readPipeline}));
 var book=SpreadsheetApp.create('PORT79_船舶隔離寫入測試_'+Utilities.formatDate(new Date(),'Asia/Taipei','yyyyMMdd-HHmmss')),month=gcCurrentMonthKey_(),rev=0;
 var saved={year:getGcYearSpreadsheet_,index:gcGetDriveMonthIndex_,indexCached:gcGetDriveMonthIndexCached_,register:gcRegisterDriveMonth_,bootstrap:ensureGcDriveBootstrap_,migrate:gcEnsureLegacyMonthMigrated_,touch:gcTouchRevision_,revision:gcGetRevision_,layout:p79GcMonthlyLayoutCacheV58_};
 try{
  getGcYearSpreadsheet_=function(){return book;};gcGetDriveMonthIndex_=gcGetDriveMonthIndexCached_=function(){return [month];};gcRegisterDriveMonth_=function(){};ensureGcDriveBootstrap_=gcEnsureLegacyMonthMigrated_=function(){return {ok:true};};gcTouchRevision_=function(){return String(++rev);};gcGetRevision_=function(){return String(rev);};p79GcMonthlyLayoutCacheV58_={};
  ensureSheet_(book,SHEET_EMPLOYEES,EMPLOYEE_HEADERS);
  var no='991116001',id='P79_ISOLATED_RECORD',date=month+'-16',payload={groups:[{id:'P79_TEST_GROUP',name:'隔離測試組'}],assignments:[],shipMasters:[{workingNo:no,vessel:'隔離測試船舶',firstDate:date,lastDate:date,wharf:'79',disc:3,load:4,totalContainers:7}],records:[{id:id,workingNo:no,vessel:'隔離測試船舶',empId:'TEST_ONLY',name:'隔離測試',workDate:date,startTime:'08:00',endTime:'09:00',number:'1',disc:3,load:4,containers:7,timeHours:1}]};
  var write=gcSyncAll_(book,payload);SpreadsheetApp.flush();if(!write.ok)throw Error('隔離寫入失敗');var read=p79VesselReadOnlyData_(book,{month:month});
  var repeat=gcSyncAll_(book,payload);SpreadsheetApp.flush();var reread=p79VesselReadOnlyData_(book,{month:month});
  if(!repeat.ok||read.records.length!==1||reread.records.length!==1||reread.records[0].id!==id||Number(reread.records[0].containers)!==7||reread.shipMasters.length!==1)throw Error('隔離寫入或重送讀回核對失敗');
  Logger.log(JSON.stringify({phase:'isolated-cloud-write-readback',ok:true,records:reread.records.length,ships:reread.shipMasters.length,repeatWithoutDuplicates:true,productionDataUntouched:true}));
 }finally{getGcYearSpreadsheet_=saved.year;gcGetDriveMonthIndex_=saved.index;gcGetDriveMonthIndexCached_=saved.indexCached;gcRegisterDriveMonth_=saved.register;ensureGcDriveBootstrap_=saved.bootstrap;gcEnsureLegacyMonthMigrated_=saved.migrate;gcTouchRevision_=saved.touch;gcGetRevision_=saved.revision;p79GcMonthlyLayoutCacheV58_=saved.layout;}
}
function p79VesselWithWriteLane_(work){
 if(p79VesselWriteLockV122_)return work();var lock=LockService.getUserLock();if(!lock.tryLock(5000))throw Error('船舶資料正在寫入資料，請稍後自動重試');p79VesselWriteLockV122_=lock;var began=false;
 try{p79VesselBeginWrite_();began=true;return work();}finally{try{if(began)p79VesselEndWrite_();}finally{p79VesselWriteLockV122_=null;lock.releaseLock();}}
}
function forceTrimGcWorkDetailsByRawDateColumn(){return p79VesselWithWriteLane_(function(){return p79ForceTrimGcWorkDetailsCoreV122_();});}
function migrateGcLegacyToDrive_(force){return p79VesselWithWriteLane_(function(){return p79MigrateGcLegacyCoreV122_(force);});}
function p79VesselGuardBackup_(data){if(['efficiency','vessel'].indexOf(String(data.type))<0)return p79HistoryBackupRequest_(data);p79HistoryBackupSession_(getSpreadsheet_(true),data.gcToken||data.token||'');return p79VesselWithWriteLane_(function(){return p79HistoryBackupRequest_(data);});}

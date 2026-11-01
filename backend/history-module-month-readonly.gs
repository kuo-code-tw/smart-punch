/*
 * PORT79 archived-month read-only bridge.
 * Add as a separate file to the EXISTING Apps Script project; do not replace the
 * live GAS. The doGet route is registered separately by the accompanying patch.
 * No row deletion, migration, source overwrite, trigger installation or writes.
 */
function p79HistoryModuleMap_() {
  return {
    leave:             {folder:'79號碼頭－請假資料', marker:'請假紀錄', permission:'leave', level:'view'},
    'leave-cover':     {folder:'79號碼頭－請假資料', marker:'請假代班', permission:'leave', level:'view'},
    overtime:          {folder:'79號碼頭－加班資料', marker:'加班異動', permission:'workhours', level:'view'},
    'overtime-export': {folder:'79號碼頭－加班資料', marker:'加班匯出', permission:'workhours', level:'view'},
    'raw-punch':       {folder:'79號碼頭－出勤資料', marker:'原始打卡', permission:'attendance', level:'manage'},
    'attendance-edit': {folder:'79號碼頭－出勤資料', marker:'考勤修改', permission:'attendance', level:'manage'},
    'deleted-punch':   {folder:'79號碼頭－出勤資料', marker:'已刪除考勤', permission:'attendance', level:'manage'},
    'delete-index':    {folder:'79號碼頭－出勤資料', marker:'刪除保護', permission:'attendance', level:'manage'},
    'login-audit':     {folder:'79號碼頭－系統稽核資料', marker:'登入稽核', permission:'hr', level:'manage', superadmin:true},
    workhours:         {folder:'79號碼頭－工時資料', marker:'工時', permission:'workhours', level:'view'},
    efficiency:        {folder:'79號碼頭－作業效率資料', marker:'效率', permission:'efficiency', level:'view'},
    shipping:          {folder:'79號碼頭－船期資料', marker:'船期', permission:'efficiency', level:'view'},
    hr:                {folder:'79號碼頭－人資資料', marker:'人資', permission:'hr', level:'view'}
  };
}

function p79HistoryArchiveMonthKey_(raw) {
  const month=String(raw||'').trim();
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('歷史月份必須是 YYYY-MM');
  return month;
}

function p79HistoryModuleFolder_(name) {
  // Existing history folders share the parent of the original schedule folder.
  // Avoid hard-coding sensitive Drive file IDs into the public GitHub repository.
  const scheduleFolder=getScheduleDriveFolder_();
  const parents=scheduleFolder.getParents();
  if(!parents.hasNext()) throw new Error('歷史資料夾根目錄不存在');
  const parent=parents.next();
  const folders=parent.getFoldersByName(name);
  if(!folders.hasNext()) return null;
  const found=folders.next();
  if(folders.hasNext()) throw new Error('找到多個同名歷史資料夾，拒絕猜測：'+name);
  return found;
}

function p79HistoryModuleFile_(folder,month,marker) {
  if(!folder)return null;
  const iter=folder.getFiles();
  const matches=[];
  let scanned=0;
  while(iter.hasNext()&&scanned<500) {
    const file=iter.next();scanned++;
    const title=String(file.getName()||'');
    if(title.indexOf(month)<0||title.indexOf(marker)<0)continue;
    if(file.getMimeType()!=='application/vnd.google-apps.spreadsheet')continue;
    if(title.indexOf('未完成')>=0)continue;
    matches.push(file);
  }
  if(iter.hasNext())throw new Error('歷史資料夾檔案過多，拒絕不完整搜尋');
  // Do not silently choose an older snapshot when multiple versions exist.
  if(matches.length>1)throw new Error('同月份同類型有 '+matches.length+' 份歷史檔，需先決定正式版本');
  return matches.length?matches[0]:null;
}

function p79HistoryGetArchivedModuleMonth_(params) {
  const ss=getSpreadsheet_(true);
  const p=params||{};
  const type=String(p.type||'').trim().toLowerCase();
  const month=p79HistoryArchiveMonthKey_(p.month);
  const map=p79HistoryModuleMap_();
  if(!Object.prototype.hasOwnProperty.call(map,type)) throw new Error('不支援的歷史資料類型');
  const item=map[type];
  const token=String(p.gcToken||p.token||'').trim();
  const session=gcRequireSystemPermission_(ss,token,'history','view');
  // Every module also requires its own permission; history.view alone is insufficient.
  gcRequireSystemPermission_(ss,token,item.permission,item.level);
  if(item.superadmin&&String(session.adminRole||'').toLowerCase()!=='superadmin')
    throw new Error('此稽核紀錄僅限超級管理員查詢');

  const current=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM');
  if(month>=current)return {
    ok:false,action:'historyGetArchivedModuleMonth',type:type,month:month,
    status:'CURRENT_OR_FUTURE',error:'當月資料請使用原系統即時查詢'
  };
  const folder=p79HistoryModuleFolder_(item.folder);
  const file=p79HistoryModuleFile_(folder,month,item.marker);
  if(!file)return {
    ok:false,action:'historyGetArchivedModuleMonth',type:type,month:month,
    status:'MISSING_ARCHIVE',error:month+' '+item.marker+' 尚無可核對的歷史歸檔'
  };

  const sheetFile=SpreadsheetApp.openById(file.getId());
  const sheets=sheetFile.getSheets();
  if(sheets.length!==1)throw new Error('歷史檔分頁數異常，拒絕讀取可能混合月份的資料');
  const sheet=sheets[0];
  const lastRow=sheet.getLastRow();
  const width=sheet.getLastColumn();
  if(lastRow<1||width<1)throw new Error('歷史檔案沒有表頭，拒絕當作空月份');
  if(width>60)throw new Error('歷史資料欄位異常');
  const headers=sheet.getRange(1,1,1,width).getDisplayValues()[0];
  const totalRows=Math.max(0,lastRow-1);
  const page=Math.max(1,Math.min(100000,Math.floor(Number(p.page)||1)));
  const pageSize=Math.max(1,Math.min(200,Math.floor(Number(p.pageSize)||100)));
  const start=(page-1)*pageSize;
  const count=Math.max(0,Math.min(pageSize,totalRows-start));
  const rows=count?sheet.getRange(start+2,1,count,width).getDisplayValues():[];
  return {
    ok:true,action:'historyGetArchivedModuleMonth',type:type,month:month,
    source:'history-folder',archiveStatus:'歷史保全副本（不代表月底正式核對完成）',
    sourceName:file.getName(),sourceUrl:sheetFile.getUrl(),
    headers:headers,rows:rows,totalRows:totalRows,page:page,pageSize:pageSize,
    hasMore:start+rows.length<totalRows,serverTime:Date.now()
  };
}


/*
 * Provisional roster retrieval. The formal historyGetMonthData schedule remains
 * the primary source. This explicit fallback is for a missing formal month tab.
 * It NEVER publishes, writes, or labels the 2026-10-28 backup as a final roster.
 */
function p79HistoryGetProvisionalScheduleMonth_(params) {
  const p=params||{};
  const month=p79HistoryArchiveMonthKey_(p.month);
  const ss=getSpreadsheet_(true);
  const token=String(p.gcToken||p.token||'').trim();
  const session=gcRequireSystemPermission_(ss,token,'history','view');
  const fine=session&&session.finePermissions&&session.finePermissions.history||{};
  const role=String(session&&session.adminRole||'').trim().toLowerCase();
  if(role!=='superadmin'&&fine['schedule.view']!==true)
    throw Error('此帳號沒有排班歷史查詢權限');
  gcRequireSystemPermission_(ss,token,'schedule','view');
  const current=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM');
  if(month>=current)throw Error('本月班表必須從正式主系統讀取');
  const historyFolder=getScheduleDriveFolder_();
  const backup=p79HistoryModuleFile_(historyFolder,month,'排班_20261028來源待核對_歷史保全');
  if(!backup)return {
    ok:false,action:'historyGetProvisionalScheduleMonth',type:'schedule',month:month,
    status:'MISSING_BACKUP',error:'找不到該月份備援班表；不得虛構歷史紀錄'
  };
  const file=SpreadsheetApp.openById(backup.getId());
  const sheets=file.getSheets();
  if(sheets.length!==1)throw Error('排班備援分頁數不符，拒絕混合月份');
  const schedules=readSchedules_(sheets[0]).filter(function(row){return normalizeScheduleMonth_(row.month)===month;});
  if(!schedules.length)throw Error('排班備援沒有指定月份紀錄');
  const expected=sheets[0].getLastRow()-1;
  if(schedules.length!==expected)throw Error('排班備援筆數不一致，拒絕顯示');
  return {
    ok:true,action:'historyGetProvisionalScheduleMonth',type:'schedule',month:month,
    provisional:true,archiveStatus:'待核對（10月28日排班備援；非月底正式定稿）',
    schedules:schedules,count:schedules.length,sourceLabel:'Google Drive｜10/28 備援排班｜待核對',
    sourceUrl:file.getUrl(),serverTime:Date.now()
  };
}

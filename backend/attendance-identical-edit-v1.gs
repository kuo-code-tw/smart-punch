// Targeted physical duplicate repair, invoked only inside the existing POST ScriptLock.
// No global canonical cleanup, no ID tombstone, no arbitrary duplicate selection.
function p79RepairIdenticalAttendanceEditV1_(ss,data){
 const fail=message=>({ok:false,retryable:false,error:message});
 const record=normalizeRecordPayload_(data),id=normalizeId_(record.id);
 const auth=gcRequireSystemPermission_(ss,data.gcToken||data.token||'','attendance','manage');
 // The operation physically removes duplicate rows. Only an unrestricted administrator
 // may do this; ordinary edits continue using the existing route and permissions.
 const role=String(auth.adminRole||auth.role||'').toLowerCase();
 if(role!=='superadmin')return fail('重複正式考勤合併需要最高管理員權限，修改草稿保留');
 if(!id||!normalizeEmpId_(record.empId)||!normalizeText_(record.attNo)||isDeletedRecordId_(ss,id))return fail('考勤身分缺失或已刪除，修改草稿保留');
 const original=normalizeText_(data.originalTimeStr),month=attendanceMonthKeyFromTimeStr_(original);
 if(!month||month!==attendanceMonthKeyFromRecord_(record))return fail('跨月或原時間不明，禁止自動合併');
 const count=Number(data.expectedDuplicateCount);
 if(!Number.isInteger(count)||count<2||count>100)return fail('重複數量不符，請重新核對');
 const sl=LockService.getScriptLock();
 if(!sl.hasLock())return fail('未取得正式考勤寫入鎖，禁止合併');
 // Employee real-time punching uses the UserLock; keep both write lanes excluded.
 const ul=LockService.getUserLock(),owned=!ul.hasLock();
 if(owned&&!ul.tryLock(1000))return {ok:false,retryable:true,rejectedBeforeWrite:true,error:'雲端目前正在處理其他資料，請稍後自動重試'};
 try{
  const target=getAttendanceSheetForRecord_(ss,record,false),main=ss.getSheetByName(SHEET_RECORDS);
  if(!target)return fail('正式月份工作表不存在，修改草稿保留');
  const sheets=[target,main].filter((sheet,i,all)=>sheet&&all.findIndex(x=>x&&x.getSheetId()===sheet.getSheetId())===i);
  const matches=[];
  sheets.forEach(sheet=>{
   const n=sheet.getLastRow()-1;if(n<=0)return;
   const ids=sheet.getRange(2,1,n,1).getDisplayValues();
   ids.forEach((row,i)=>{
    if(normalizeId_(row[0])!==id)return;
    const width=Math.max(RECORD_HEADERS.length,sheet.getLastColumn()),range=sheet.getRange(i+2,1,1,width);
    const raw=range.getValues()[0],display=range.getDisplayValues()[0],formulas=range.getFormulas()[0];
    const parsed=extractRecordFromLegacyRow_(display.slice(0,RECORD_HEADERS.length)).record;
    matches.push({sheet,row:i+2,raw,display,formulas,parsed});
   });
  });
  if(matches.length!==count||matches.some(x=>x.sheet.getSheetId()!==target.getSheetId()))return fail('正式列數或來源工作表已變更，禁止合併');
  const first=matches[0],before=first.parsed;
  if(matches.some(x=>x.formulas.some(Boolean)||JSON.stringify(x.raw)!==JSON.stringify(first.raw)||JSON.stringify(x.display)!==JSON.stringify(first.display)))
   return fail('重複紀錄完整欄位不完全一致，禁止合併');
  if(normalizeEmpId_(before.empId)!==normalizeEmpId_(record.empId)||normalizeText_(before.attNo)!==normalizeText_(record.attNo)||
     !Number.isFinite(p79GuardEventMillis_(original))||p79GuardEventMillis_(original)!==p79GuardEventMillis_(before.timeStr)||
     attendanceRecordTypeCode_(before)!==attendanceRecordTypeCode_(record))return fail('原始人員、時間或上下班狀態不符，禁止合併');
  // Existing compare-and-swap and manuallyEditedAt checks must also pass.
  p79PrepareSafeAttendanceEdit_(before,record,data);
  // Back up each duplicate's full physical row before any removal. The kept
  // original remains unchanged until the existing audited edit succeeds.
  let audit=ss.getSheetByName('考勤完全重複合併備份');
  if(!audit){audit=ss.insertSheet('考勤完全重複合併備份');audit.appendRow(['備份時間','紀錄ID','工作表','原始列','原始欄位JSON','顯示欄位JSON']);audit.hideSheet();}
  const backups=matches.slice(1).map(x=>[new Date(),id,x.sheet.getName(),x.row,JSON.stringify(x.raw),JSON.stringify(x.display)]);
  const at=audit.getLastRow()+1;
  audit.getRange(at,1,backups.length,6).setValues(backups);
  SpreadsheetApp.flush();
  const check=audit.getRange(at,1,backups.length,6).getValues();
  if(check.length!==backups.length||check.some((row,i)=>String(row[1])!==id||row[4]!==backups[i][4]||row[5]!==backups[i][5]))return fail('重複紀錄備份未確認，禁止合併');
  matches.slice(1).sort((a,b)=>b.row-a.row).forEach(x=>x.sheet.deleteRow(x.row));
  SpreadsheetApp.flush();
  const result=editRecord_(ss,Object.assign({},data,{action:'updateRecord',record}));
  if(!result||result.ok!==true||result.ignoredDeleted===true)return fail('原紀錄仍保留，正式修改尚未確認');
  SpreadsheetApp.flush();
  const n=target.getLastRow()-1,ids=n>0?target.getRange(2,1,n,1).getDisplayValues():[];
  const remaining=ids.map((r,i)=>normalizeId_(r[0])===id?i+2:0).filter(Boolean);
  if(remaining.length!==1)return fail('正式主表尚未確認只剩一筆，修改草稿保留');
  const final=extractRecordFromLegacyRow_(target.getRange(remaining[0],1,1,RECORD_HEADERS.length).getDisplayValues()[0]).record;
  if(normalizeEmpId_(final.empId)!==normalizeEmpId_(record.empId)||normalizeText_(final.attNo)!==normalizeText_(record.attNo)||
     p79GuardEventMillis_(final.timeStr)!==p79GuardEventMillis_(record.timeStr)||attendanceRecordTypeCode_(final)!==attendanceRecordTypeCode_(record)||
     normalizeText_(final.note)!==normalizeText_(record.note))return fail('正式修改回讀不一致，修改草稿保留');
  return Object.assign({},result,{ok:true,id,identicalAttendanceEditConfirmed:true,removedDuplicateRows:count-1});
 }finally{if(owned)ul.releaseLock();}
}

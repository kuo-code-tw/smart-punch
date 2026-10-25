/*
 * Private Google Apps Script module for PORT79 accounting email.
 * Install into the EXISTING authenticated Apps Script project; never publish
 * the mail recipient list or credentials in GitHub Pages/HTML.
 *
 * Authenticated doPost router:
 *   getOvertimeMailOptions  -> p79OvertimeMailOptions_(ss, data)
 *   sendOvertimeAccountingMail -> p79OvertimeMailSend_(ss, data)
 *   sendOvertimeAccountingDayMail -> p79OvertimeDayMailSend_(ss, data)
 *   manageOvertimeMailRecipients -> p79OvertimeMailManageRecipient_(ss, data)
 *
 * Script property P79_OVERTIME_MAIL_RECIPIENTS_V1:
 *   [{"id":"accounting","name":"會計","email":"accounting@example.invalid"}]
 * Use REAL addresses only in PRIVATE Script Properties, not in source control.
 *
 * MailApp returning successfully confirms service accepted send, NOT inbox
 * receipt or reading. Pending ledger rows block automatic retries after an
 * ambiguous exception, protecting against duplicate notifications.
 */
var P79_OVERTIME_MAIL_LOG_SHEET_V1='P79_OVERTIME_MAIL_AUDIT_V1';
var P79_OVERTIME_MAIL_HEADERS_V1=[
  'requestId','status','sentAt','createdAt','reportId','empId','date',
  'recipientId','recipientEmail','recipientName','actorEmpId','actorName',
  'reportJson','error'
];
function p79OvertimeMailUid_(x){return String(x||'').trim().toUpperCase();}
function p79OvertimeMailCanonical_(value){
  if(Array.isArray(value))return '['+value.map(p79OvertimeMailCanonical_).join(',')+']';
  if(value&&typeof value==='object'){
    var keys=Object.keys(value).filter(function(k){return value[k]!==undefined;}).sort();
    return '{'+keys.map(function(k){return JSON.stringify(k)+':'+p79OvertimeMailCanonical_(value[k]);}).join(',')+'}';
  }
  return JSON.stringify(value===undefined?null:value);
}
function p79OvertimeMailRecipients_(){
  var text=PropertiesService.getScriptProperties().getProperty('P79_OVERTIME_MAIL_RECIPIENTS_V1')||'[]';
  var entries=JSON.parse(text);
  if(!Array.isArray(entries)||entries.length>20)throw Error('會計收件人設定格式有誤');
  var ids={};
  return entries.map(function(x){
    var id=String(x.id||'').trim(),name=String(x.name||'').trim(),email=String(x.email||'').trim().toLowerCase();
    if(!/^[a-zA-Z0-9_-]{1,40}$/.test(id)||ids[id]||!name||name.length>60||
      !/^[a-zA-Z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)||
      /[\r\n]/.test(name))throw Error('會計收件人設定有誤');
    ids[id]=true;
    return {id:id,name:name,email:email};
  });
}
function p79OvertimeMailAuthorize_(ss,data){
  var token=String(data.gcToken||data.token||'');
  // Explicitly require BOTH scoped schedule and work-hours management.
  var session=gcRequireSystemPermission_(ss,token,'workhours','manage');
  gcRequireSystemPermission_(ss,token,'schedule','manage');
  return session;
}
function p79OvertimeMailRows_(ss,create){
  var sheet=ss.getSheetByName(P79_OVERTIME_MAIL_LOG_SHEET_V1);
  if(!sheet&&!create)return {sheet:null,rows:[]};
  if(!sheet){sheet=ss.insertSheet(P79_OVERTIME_MAIL_LOG_SHEET_V1);sheet.appendRow(P79_OVERTIME_MAIL_HEADERS_V1);}
  if(sheet.getLastColumn()<P79_OVERTIME_MAIL_HEADERS_V1.length||
     P79_OVERTIME_MAIL_HEADERS_V1.some(function(h,i){return String(sheet.getRange(1,i+1).getValue())!==h;}))
    throw Error('加班郵件稽核紀錄表欄位不符，未寄送');
  var n=sheet.getLastRow();
  return {sheet:sheet,rows:n<2?[]:sheet.getRange(2,1,n-1,P79_OVERTIME_MAIL_HEADERS_V1.length).getValues()};
}
function p79OvertimeMailEmployee_(ss,session,empId){
  var person=(p79GetEmployeeMasterCached_(ss)||[]).find(function(e){
    return p79OvertimeMailUid_(e.empId)===empId;
  });
  if(!person||!p79CanReadScopedEmployee_(session,'workhours',person)||
     !p79CanReadScopedEmployee_(session,'schedule',person))
    throw Error('無權查看或寄送此人員的加班申報');
  return person;
}
function p79OvertimeMailReceipt_(row){
  return {
    requestId:String(row[0]||''),status:String(row[1]||''),sentAt:String(row[2]||''),
    reportId:String(row[4]||''),empId:String(row[5]||''),date:String(row[6]||''),
    recipientId:String(row[7]||''),recipientName:String(row[9]||''),
    actor:String(row[11]||''),reportJson:String(row[12]||'')
  };
}
function p79OvertimeMailOptions_(ss,data){
  var session=p79OvertimeMailAuthorize_(ss,data),month=String(data.month||'');
  if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month))throw Error('請指定正確月份');
  var log=p79OvertimeMailRows_(ss,false),visible={};
  (p79GetEmployeeMasterCached_(ss)||[]).forEach(function(person){
    if(p79CanReadScopedEmployee_(session,'workhours',person)&&
       p79CanReadScopedEmployee_(session,'schedule',person))
      visible[p79OvertimeMailUid_(person.empId)]=true;
  });
  var receipts=log.rows.filter(function(row){
    if(String(row[6]||'').slice(0,7)!==month||['sent','sending'].indexOf(String(row[1]))<0)return false;
    if(String(row[5])==='__DAY__'){
      try{
        var items=JSON.parse(String(row[12]||'[]'));
        return Array.isArray(items)&&items.length>0&&items.every(function(item){
          return !!visible[p79OvertimeMailUid_(item.empId)];
        });
      }catch(_){return false;}
    }
    return !!visible[p79OvertimeMailUid_(row[5])];
  }).map(p79OvertimeMailReceipt_);
  return {ok:true,overtimeMailVersion:2,canManageRecipients:true,
    recipients:p79OvertimeMailRecipients_(),receipts:receipts};
}
function p79OvertimeMailSend_(ss,data){
  var session=p79OvertimeMailAuthorize_(ss,data);
  var empId=p79OvertimeMailUid_(data.empId),date=String(data.date||''),
    reportId=String(data.reportId||''),recipientId=String(data.recipientId||''),
    requestId=String(data.requestId||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!empId||
    !/^[A-Za-z0-9_.:-]{1,120}$/.test(reportId)||
    !/^[A-Za-z0-9_-]{12,90}$/.test(requestId))throw Error('缺少有效的加班申報或寄送請求編號');
  var receiver=p79OvertimeMailRecipients_().find(function(r){return r.id===recipientId;});
  if(!receiver)throw Error('收件人不在核准的會計名單內');
  var person=p79OvertimeMailEmployee_(ss,session,empId);
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    // Re-read the AUTHORITATIVE active report under a lock. Never email
    // unsaved browser data or a cancelled/overwritten declaration.
    var schedules=readScheduleMonthOnly_(ss,date.slice(0,7))||[];
    var target=schedules.find(function(r){return p79OvertimeMailUid_(r.empId)===empId;});
    var meta=target&&target.schedule&&target.schedule.__meta&&target.schedule.__meta[date]||{};
    var report=meta.overtimeReport;
    if(!report||String(report.id)!==reportId||meta.overtimeExcluded===true||
      (meta.overtimeRevocations||[]).some(function(a){return a&&a.confirmed===true&&String(a.reportId)===reportId;}))
      throw Error('加班已取消或申報編號已改變，請重新讀取');
    var json=p79OvertimeMailCanonical_(report);
    if(!data.expectedReport||p79OvertimeMailCanonical_(data.expectedReport)!==json)
      throw Error('加班申報版本已改變，尚未寄送；請重新讀取');
    if(json.length>12000)throw Error('申報內容過長，請人工核對');
    var log=p79OvertimeMailRows_(ss,true),duplicate=null,pending=null;
    log.rows.forEach(function(row){
      if(String(row[0])===requestId&&(String(row[4])!==reportId||
          p79OvertimeMailUid_(row[5])!==empId||String(row[6])!==date||
          String(row[7])!==recipientId||String(row[12])!==json))
        throw Error('寄送請求編號重複但內容不一致');
      if(String(row[4])===reportId&&p79OvertimeMailUid_(row[5])===empId&&
         String(row[6])===date&&String(row[7])===recipientId&&String(row[12])===json){
        if(String(row[1])==='sent')duplicate=p79OvertimeMailReceipt_(row);
        else if(String(row[1])==='sending')pending=true;
      }
    });
    if(duplicate)return {ok:true,overtimeMailVersion:1,sent:true,duplicate:true,receipt:duplicate};
    if(pending)throw Error('此版本已有尚未確認的郵件請求，請管理員核對郵件及稽核表，勿重複寄送');
    if(MailApp.getRemainingDailyQuota()<1)throw Error('今日電子郵件寄送額度已用完');
    var created=new Date().toISOString(),actor=String(session.name||session.empId||'管理員');
    var values=[requestId,'sending','',created,reportId,empId,date,receiver.id,receiver.email,
      receiver.name,String(session.empId||''),actor,json,''];
    var next=log.sheet.getLastRow()+1;
    // Preserve date, ISO timestamp and JSON as literal text for stable readback.
    log.sheet.getRange(next,1,1,values.length).setNumberFormat('@').setValues([values]);
    SpreadsheetApp.flush();
    var safe=x=>String(x??'').replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,240);
    var type=safe(report.typeName||report.category||'加班'),period=safe(report.code||'');
    var body=[
      '此通知由加班管理系統寄出，請依申報編號與目前版本核對。',
      '姓名：'+safe(person.name||empId),
      '工號：'+empId,
      '加班日期：'+date,
      '加班類型：'+type,
      '出勤時段：'+period,
      '申報時數：'+safe(report.declaredHours??'')+' 小時',
      '申報性質：'+(report.planned===true?'預排加班（尚須核對實際出勤）':'已申報加班'),
      '申報編號：'+reportId,
      '申報備註：'+safe(report.note||''),
      '寄送管理員：'+safe(actor),
      '重要：若此筆後續修改或取消，請依新通知或系統核對紀錄處理。'
    ].join('\n');
    try{
      MailApp.sendEmail({to:receiver.email,
        subject:'【加班申報通知】'+date+' '+safe(person.name||empId)+'／'+reportId,
        body:body,name:'PORT79 加班管理'});
    }catch(error){
      log.sheet.getRange(next,2).setValue('failed');
      log.sheet.getRange(next,14).setValue(String(error.message||error).slice(0,200));
      SpreadsheetApp.flush();
      throw Error('郵件服務回報失敗；請查核寄件紀錄後再決定是否重試');
    }
    // Only AFTER MailApp accepted the message may the status become sent.
    var sentAt=new Date().toISOString();
    log.sheet.getRange(next,2,1,2).setValues([['sent',sentAt]]);
    SpreadsheetApp.flush();
    var written=log.sheet.getRange(next,1,1,values.length).getValues()[0];
    if(String(written[1])!=='sent'||String(written[2])!==sentAt||
       String(written[12])!==json)
      throw Error('郵件服務已接受，但稽核紀錄讀回未確認；請核對後再操作，勿重送');
    return {ok:true,overtimeMailVersion:1,sent:true,receipt:p79OvertimeMailReceipt_(written)};
  }finally{lock.releaseLock();}
}


/* Daily digest: one date -> one MailApp message, regardless of employee count.
 * The entire day's authoritative report set must match browser expectations. */
function p79OvertimeMailDayRows_(ss,session,date){
  var people={},found={};
  (p79GetEmployeeMasterCached_(ss)||[]).forEach(function(p){
    people[p79OvertimeMailUid_(p.empId)]=p;
  });
  var all=readScheduleMonthOnly_(ss,date.slice(0,7))||[],out=[];
  all.forEach(function(row){
    var empId=p79OvertimeMailUid_(row.empId);
    var meta=row.schedule&&row.schedule.__meta&&row.schedule.__meta[date];
    if(!meta||meta.overtimeExcluded===true)return;
    var reports=[meta.overtimeReport].concat(Array.isArray(meta.overtimeReports)?meta.overtimeReports:[]);
    reports.filter(Boolean).forEach(function(report){
      var reportId=String(report.id||''),key=empId+'|'+reportId;
      if(!reportId||found[key]||(meta.overtimeRevocations||[]).some(function(a){
        return a&&a.confirmed===true&&String(a.reportId)===reportId;
      }))return;
      // Never silently omit someone outside the sender's scope.
      var person=people[empId];
      if(!person||!p79CanReadScopedEmployee_(session,'workhours',person)||
        !p79CanReadScopedEmployee_(session,'schedule',person))
        throw Error('當日包含不在管理範圍內的加班人員，為避免漏寄請由有完整權限的管理員寄送');
      found[key]=true;
      out.push({empId:empId,id:reportId,report:report});
    });
  });
  out.sort(function(a,b){return a.empId.localeCompare(b.empId)||a.id.localeCompare(b.id);});
  if(out.length>250)throw Error('單日加班申報筆數超過寄送安全上限，請核對');
  return {items:out,people:people};
}
function p79OvertimeDayMailSend_(ss,data){
  var session=p79OvertimeMailAuthorize_(ss,data);
  var date=String(data.date||''),recipientId=String(data.recipientId||''),
      requestId=String(data.requestId||'');
  if(!/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(date)||
     !/^[A-Za-z0-9_-]{12,90}$/.test(requestId))
    throw Error('寄送日期或識別碼無效');
  var receiver=p79OvertimeMailRecipients_().find(function(p){return p.id===recipientId;});
  if(!receiver)throw Error('收件信箱不在核准名單中');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    var day=p79OvertimeMailDayRows_(ss,session,date);
    if(!day.items.length)throw Error('此日期沒有可寄送的有效加班申報');
    var version=p79OvertimeMailCanonical_(day.items);
    if(!Array.isArray(data.expectedReports)||
       p79OvertimeMailCanonical_(data.expectedReports)!==version)
      throw Error('當日加班申報內容與雲端不一致，可能有人新增、修改或取消，請重新核對');
    if(version.length>70000)throw Error('當日加班資料過長，請分開處理');
    var log=p79OvertimeMailRows_(ss,true),dayId='DAY:'+date,prior=null,pending=false;
    log.rows.forEach(function(row){
      if(String(row[0])===requestId&&(
         String(row[4])!==dayId||String(row[5])!=='__DAY__'||
         String(row[6])!==date||String(row[7])!==recipientId||String(row[12])!==version))
        throw Error('相同寄送識別碼對應不同內容，為安全起見已停止');
      if(String(row[4])===dayId&&String(row[5])==='__DAY__'&&
         String(row[6])===date&&String(row[7])===recipientId&&String(row[12])===version){
        if(String(row[1])==='sent')prior=p79OvertimeMailReceipt_(row);
        else if(String(row[1])==='sending')pending=true;
      }
    });
    if(prior)return {ok:true,overtimeMailVersion:2,sent:true,duplicate:true,receipt:prior};
    if(pending)throw Error('當日此版本已有寄送中的紀錄，請先核對郵件與稽核資料，避免重複寄送');
    if(MailApp.getRemainingDailyQuota()<1)throw Error('郵件服務今日寄送額度已用完');
    var safe=function(x){return String(x??'').replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,200);};
    var lines=day.items.map(function(item,i){
      var person=day.people[item.empId],report=item.report;
      return [
        String(i+1)+'. '+safe(person.name||item.empId)+'（'+item.empId+'）',
        '類型：'+safe(report.typeName||report.category||'加班'),
        '時段：'+safe(report.code||''),
        '時數：'+safe(report.declaredHours??'')+' 小時',
        '申報編號：'+item.id
      ].join('｜');
    });
    var staffCount={};day.items.forEach(function(x){staffCount[x.empId]=true;});
    var count=Object.keys(staffCount).length;
    var body=['加班申報日期：'+date,'加班人數：'+count+' 人','有效申報：'+day.items.length+' 筆',
      '以下為此日期所有有效加班申報的合併通知。','',lines.join('\n'),'',
      '寄送管理員：'+safe(session.name||session.empId||'管理員'),
      '如有新增加班、申報修改或取消，舊信可能失效，請以最新核對紀錄為準。'].join('\n');
    if(body.length>25000)throw Error('單日郵件內容過長，請核對');
    var timestamp=new Date().toISOString(),values=[
      requestId,'sending','',timestamp,dayId,'__DAY__',date,
      receiver.id,receiver.email,receiver.name,
      String(session.empId||''),String(session.name||session.empId||'管理員'),version,''
    ];
    var position=log.sheet.getLastRow()+1;
    log.sheet.getRange(position,1,1,values.length).setNumberFormat('@').setValues([values]);
    SpreadsheetApp.flush();
    try{
      MailApp.sendEmail({to:receiver.email,
        subject:'【加班申報】'+date+'（'+count+'人／'+day.items.length+'筆）',
        body:body,name:'PORT79 加班管理'});
    }catch(error){
      // MailApp exception may still be ambiguous; retain a failure for review.
      log.sheet.getRange(position,2).setValue('failed');
      log.sheet.getRange(position,14).setValue(String(error.message||error).slice(0,200));
      SpreadsheetApp.flush();
      throw Error('郵件服務回報失敗，請先檢查寄件紀錄避免重複寄送');
    }
    var sentAt=new Date().toISOString();
    log.sheet.getRange(position,2,1,2).setValues([['sent',sentAt]]);
    SpreadsheetApp.flush();
    var saved=log.sheet.getRange(position,1,1,values.length).getValues()[0];
    if(String(saved[1])!=='sent'||String(saved[2])!==sentAt||
       String(saved[12])!==version)
      throw Error('郵件服務已接受，但稽核紀錄讀回未確認；請先人工核對，勿重複寄送');
    return {ok:true,overtimeMailVersion:2,sent:true,count:day.items.length,
      employeeCount:count,receipt:p79OvertimeMailReceipt_(saved)};
  }finally{lock.releaseLock();}
}
/* Only authenticated managers with both schedule/workhours manage may mutate
 * the private, allowlisted recipient configuration. Changes are audit logged. */
function p79OvertimeMailManageRecipient_(ss,data){
  var session=p79OvertimeMailAuthorize_(ss,data);
  var operation=String(data.operation||'');
  if(operation!=='add'&&operation!=='remove')throw Error('無效的信箱管理操作');
  var lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    var old=p79OvertimeMailRecipients_(),next=old.slice(),item=null;
    if(operation==='add'){
      var name=String(data.name||'').trim(),email=String(data.email||'').trim().toLowerCase();
      if(name.length<1||name.length>60||/[\r\n]/.test(name)||
         !/^[a-zA-Z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email))
        throw Error('請輸入有效的收件人名稱與 Mail 信箱');
      if(next.some(function(r){return r.email===email;}))throw Error('這個 Mail 信箱已經在名單內');
      if(next.length>=20)throw Error('收件信箱上限為 20 組');
      item={id:'mail_'+Utilities.getUuid().replace(/-/g,'').slice(0,16),name:name,email:email};
      next.push(item);
    }else{
      var removeId=String(data.recipientId||'');
      item=next.find(function(r){return r.id===removeId;});
      if(!item)throw Error('找不到要刪除的 Mail 信箱');
      next=next.filter(function(r){return r.id!==removeId;});
    }
    var props=PropertiesService.getScriptProperties(),serialized=JSON.stringify(next);
    if(serialized.length>7000)throw Error('信箱名單超過設定上限');
    // Prepare audit table before changing Script Properties. Historical sends
    // retain recipient name/id even after a mailbox is removed.
    var sheet=ss.getSheetByName('P79_OVERTIME_MAIL_RECIPIENT_AUDIT_V1')||
      ss.insertSheet('P79_OVERTIME_MAIL_RECIPIENT_AUDIT_V1');
    if(sheet.getLastRow()===0)sheet.appendRow(['at','actorId','actorName','operation','recipientId','name','email']);
    var at=new Date().toISOString();
    props.setProperty('P79_OVERTIME_MAIL_RECIPIENTS_V1',serialized);
    sheet.appendRow([at,String(session.empId||''),String(session.name||''),operation,item.id,item.name,item.email]);
    SpreadsheetApp.flush();
    return {ok:true,overtimeMailVersion:2,recipients:next};
  }finally{lock.releaseLock();}
}

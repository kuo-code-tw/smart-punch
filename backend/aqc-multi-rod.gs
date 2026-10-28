// Independent append-only journal. Vessel totals and employee permissions are never edited.
function p79MultiRodSheet_(ss,create){
 var name='AQC多桿作業紀錄',sheet=ss.getSheetByName(name);
 if(!sheet&&create){sheet=ss.insertSheet(name);sheet.getRange(1,1,1,3).setValues([['事件ID','紀錄ID','事件JSON']]);sheet.setFrozenRows(1);}
 return sheet;
}
function p79MultiRodEvents_(sheet){
 if(!sheet||sheet.getLastRow()<2)return [];
 return sheet.getRange(2,3,sheet.getLastRow()-1,1).getValues().map(function(r){var e;try{e=JSON.parse(r[0]);}catch(_){throw Error('AQC 雲端紀錄損壞，停止覆寫');}if(!e||!e.after||!e.eventId)throw Error('AQC 雲端事件不完整');return e;});
}
function p79MultiRodRows_(events){var rows={};events.forEach(function(e){rows[e.after.id]=e.after;});return Object.keys(rows).map(function(id){return rows[id];});}
function p79MultiRodRevision_(sheet){return !sheet||sheet.getLastRow()<2?'0':String(sheet.getRange(sheet.getLastRow(),1).getValue());}
function p79MultiRodAuth_(ss,data,key){
 var token=data.gcToken||data.token||'';
 var session=gcRequireSystemPermission_(ss,token,'efficiency',key==='records.view'||key==='records.export'?'view':'manage');
 gcRequireActionPermission_(ss,token,'efficiency',key);return session;
}
function p79MultiRodRead_(data){
 var ss=getSpreadsheet_();p79MultiRodAuth_(ss,data,'records.view');
 if(data.export==='1')p79MultiRodAuth_(ss,data,'records.export');
 var lock=LockService.getScriptLock();if(!lock.tryLock(5000))throw Error('AQC 儲存中，請稍後重新讀取');
 try{
 var sheet=p79MultiRodSheet_(ss,false),revision=p79MultiRodRevision_(sheet);
 if(data.meta==='1'||String(data.revision||'')===revision)return {ok:true,revision:revision,unchanged:String(data.revision||'')===revision,apiVersion:API_VERSION};
 return {ok:true,revision:revision,records:p79MultiRodRows_(p79MultiRodEvents_(sheet)).filter(function(r){return !r.deleted;}),apiVersion:API_VERSION};
 }finally{lock.releaseLock();}
}
function p79MultiRodNormalize_(raw){
 raw=raw||{};var out={};
 ['id','ship','voyage','workingNo','start','end','note'].forEach(function(k){var v=raw[k]==null?'':raw[k];if(typeof v!=='string')throw Error('AQC 欄位必須為文字：'+k);v=v.trim();var max=k==='note'?500:k==='ship'?120:80;if(v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))throw Error('AQC 欄位格式錯誤：'+k);out[k]=v;});
 if(!/^[A-Za-z][A-Za-z0-9_-]{7,79}$/.test(out.id)||!out.ship)throw Error('AQC 紀錄ID或船名不正確');
 function time(s,empty){if(!s&&empty)return;var m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);if(!m)throw Error('AQC 時間格式錯誤');var d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5]));if(d.toISOString().slice(0,16)!==s)throw Error('AQC 日期時間無效');}
 time(out.start,false);time(out.end,true);if(out.end&&out.end<out.start)throw Error('結束時間不能早於開始時間');
 ['rods','containers','hatches','shiftMoves'].forEach(function(k){var n=raw[k];if(typeof n!=='number'||!Number.isSafeInteger(n)||n<(k==='rods'?1:0)||n>(k==='rods'?999999:99999999))throw Error('AQC 數量格式錯誤：'+k);out[k]=n;});return out;
}
function p79MultiRodWrite_(data){
 var ss=getSpreadsheet_(),raw=data.record||{},item=p79MultiRodNormalize_(raw),op=String(data.operation||'save');
 if(op!=='save'&&op!=='delete')throw Error('不支援的 AQC 操作');
 var action=op==='delete'?'records.delete':Number(data.expectedVersion)===0?'records.create':'records.edit';
 var session=p79MultiRodAuth_(ss,data,action),eventId=String(data.mutationId||'');
 if(!/^[A-Za-z][A-Za-z0-9_-]{7,99}$/.test(eventId)||!Number.isSafeInteger(data.expectedVersion)||data.expectedVersion<0)throw Error('缺少 AQC 版本或操作識別碼');
 var lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('AQC 儲存忙碌，請保留表單稍後重試');
 try{
 var sheet=p79MultiRodSheet_(ss,true),events=p79MultiRodEvents_(sheet),prior=events.find(function(e){return e.eventId===eventId;});
 var request={operation:op,record:item,expectedVersion:data.expectedVersion};
 if(prior){if(prior.actorId!==String(session.empId||session.id||'')||JSON.stringify(prior.request)!==JSON.stringify(request))throw Error('操作ID已使用，請重新讀取');return {ok:true,record:prior.after,revision:p79MultiRodRevision_(sheet),duplicate:true};}
 var old=p79MultiRodRows_(events).find(function(r){return r.id===item.id;});
 if((old?old.version:0)!==data.expectedVersion||old&&old.deleted||op==='delete'&&!old)throw Error('此紀錄已由其他人修改或刪除，請重新讀取後再編輯');
 var now=new Date().toISOString();var after=Object.assign({},item,{version:(old?old.version:0)+1,createdAt:old?old.createdAt:now,updatedAt:now,updatedBy:String(session.empId||session.id||''),deleted:op==='delete'});
 var event={eventId:eventId,actorId:after.updatedBy,actorName:String(session.name||''),at:now,operation:op,request:request,before:old||null,after:after};
 var row=sheet.getLastRow()+1;sheet.getRange(row,1,1,3).setValues([[eventId,item.id,JSON.stringify(event)]]);SpreadsheetApp.flush();
 var receipt=JSON.parse(String(sheet.getRange(row,3).getValue()));if(JSON.stringify(receipt)!==JSON.stringify(event))throw Error('AQC 雲端讀回不一致，請保留操作ID重試');
 return {ok:true,record:receipt.after,revision:eventId,apiVersion:API_VERSION};
 }finally{lock.releaseLock();}
}

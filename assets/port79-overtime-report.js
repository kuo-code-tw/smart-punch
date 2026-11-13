(function(global){
 'use strict';
 const KEY='port79_overtime_report_draft_v1',CONFIG='overtimeConversionRowsV1';
 const types=['休','國','例','代','延'];
 const TYPECONFIG='overtimeReportTypesV1',DELETED_CONFIG='overtimeDeletedBuiltinTypesV1',ARCHIVED_CONFIG='overtimeArchivedRuleKeysV1',ROLE_DEFAULTS_CONFIG='overtimeRoleTypeDefaultsV1',HIDDEN_MANAGER_RULES='overtimeManagerHiddenRuleKeysV1';
 // Category labels provide internal day classifications, not installed types.
 // Keep archived conversion rows in cloud storage for historical audit/edit,
 // while only administrator-created types are offered in NEW filing forms.
 // Keep the previous wording as a read-only alias. New reports, menus, and
 // labels must use ONE official type: 平日延時加班 (category 延).
 const typeLabel={休:'休息日加班',國:'國定假日加班',例:'例假加班',代:'休假代班加班',延:'平日延時加班'};
 const canonicalType=value=>{
  const name=String(value??'').trim();
  return name==='代班加班'?'休假代班加班':
   name==='平日延長加班'?'平日延時加班':name;
 };
 function deletedBuiltins(config={}){
  const raw=config?.[DELETED_CONFIG]||[];
  if(!Array.isArray(raw))throw Error('已刪除加班類型設定格式錯誤');
  // A previously deleted OLD builtin must not accidentally suppress a
  // separate, explicitly configured newer-name type during consolidation.
  const newName=typeLabel.延;
  const newConfigured=(Array.isArray(config?.[TYPECONFIG])&&
   config[TYPECONFIG].some(row=>Array.isArray(row)&&String(row[0]).trim()===newName&&row[1]==='延'))||
   (Array.isArray(config?.[CONFIG])&&
   config[CONFIG].some(row=>Array.isArray(row)&&row[0]==='延'&&String(row[9]||'').trim()===newName));
  const oldDeleted=raw.includes('平日延長加班');
  const newDeleted=raw.includes(newName);
  return new Set(raw.map(canonicalType).filter(name=>
   Object.values(typeLabel).includes(name)&&
   !(name===newName&&oldDeleted&&!newDeleted&&newConfigured)));
 }
 const isBuiltinType=name=>Object.values(typeLabel).includes(canonicalType(name));
 // 舊表格切換假別後可能保留原來的預設名稱；預設類型一律依假別辨識。
 const ruleType=r=>r[9]&&!isBuiltinType(r[9])?r[9]:typeLabel[r[0]];
 // Recover ONLY previously cloud-saved legacy types; do not install any
 // default type. New-format saves write ARCHIVED_CONFIG to distinguish
 // intentional permanent deletion from a legacy configuration.
 function legacySavedTypes(config={}){
  if(Object.prototype.hasOwnProperty.call(config,ARCHIVED_CONFIG))return [];
  if(!Object.prototype.hasOwnProperty.call(config,CONFIG)||!Array.isArray(config[CONFIG]))return [];
  const removed=deletedBuiltins(config),found=new Map();
  for(const row of validate(config[CONFIG])){
   const name=canonicalType(ruleType(row));
   // Never resurrect a legacy custom type removed from TYPECONFIG.
   if(!isBuiltinType(name)||removed.has(name))continue;
   found.set(name,row[0]);
  }
  return [...found].map(([name,category])=>({name,category}));
 }
 // Category labels are internal accounting groups, not installed defaults.
 function typeOptions(config={},rows=[]){
  const configured=config?.[TYPECONFIG]||[];
  if(!Array.isArray(configured))throw Error('加班類型設定無效');
  const map=new Map(legacySavedTypes(config).map(t=>[t.name,t.category]));
  for(const row of configured){
   if(!Array.isArray(row)||!types.includes(row[1])||!String(row[0]||'').trim())throw Error('加班類型設定無效');
   map.set(canonicalType(row[0]),row[1]);
  }
  return [...map].map(([name,category])=>({name,category}));
 }
 const ruleKey=row=>(row[9]?'named:'+row[9]:'builtin:'+typeLabel[row[0]])+'|'+row[1];
 function activeReportRows(rows,config={}){
  const allowed=new Set(typeOptions(config).map(t=>t.name)),archived=new Set(config?.[ARCHIVED_CONFIG]||[]);
  const hidden=new Set(config?.[HIDDEN_MANAGER_RULES]||[]);
  return validate(rows).filter(row=>allowed.has(ruleType(row))&&!archived.has(ruleKey(row))&&!hidden.has(ruleKey(row)));
 }
 // Diagnose stored-but-disabled rules without reviving archived or deleted periods.
 function reportPeriodDiagnostic(rows,config={},selectedType=''){
  const name=canonicalType(selectedType),configured=typeOptions(config).find(t=>t.name===name);
  const saved=validate(rows),archived=new Set(config?.[ARCHIVED_CONFIG]||[]),
   hidden=new Set(config?.[HIDDEN_MANAGER_RULES]||[]);
  const matching=saved.filter(row=>ruleType(row)===name);
  const visible=matching.filter(row=>!hidden.has(ruleKey(row)));
  return {name,configured:!!configured,
   active:configured?visible.filter(row=>!archived.has(ruleKey(row))).length:0,
   archived:visible.filter(row=>archived.has(ruleKey(row))).length,
   deleted:matching.length-visible.length,
   otherNamed:configured?saved.filter(row=>row[0]===configured.category&&
    ruleType(row)!==name&&!hidden.has(ruleKey(row))).length:0,
   total:matching.length};
 }
 function managerVisibleRules(rows,config={}){
  const hidden=config?.[HIDDEN_MANAGER_RULES]||[];
  if(!Array.isArray(hidden))throw Error('加班管理刪除清單格式錯誤');
  const keys=new Set(hidden);
  return validate(rows).filter(row=>!keys.has(ruleKey(row)));
 }
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const hour=x=>{const m=String(x).match(/^(\d{2})(?::(\d{2}))?$/);if(!m)return NaN;const h=Number(m[1]),n=Number(m[2]||0);return h<=24&&n<60&&(h!==24||n===0)?h*60+n:NaN};
 const span=(a,b)=>{const x=hour(a),y=hour(b);return Number.isFinite(x)&&Number.isFinite(y)&&x%1440!==y%1440?(y-x+1440)%1440:NaN};
 const time=x=>/^24(?::00)?$/.test(String(x))?'00:00':String(x).includes(':')?x:String(x)+':00';
 // Compact cloud rows: category, code, declared hours, converted hours, normal start/end, overtime start/end, position.
 function defaults(){
  const rest=[['08-16',8,12.7],['10-18',8,12.7],['12-20',8,12.7],['16-24',8,12.7],['24-08',8,12.7],['08-14',6,9.36],['14-20',6,9.36],['08-20',12,23.36],['24-04',4,6.02],['04-08',4,6.02],['08-18',10,18.02],['16-20',4,6.02],['20-22',2,2.68],['20-24',4,6.02],['20-01',5,7.67],['20-02',6,9.36],['20-03',7,11.03],['20-04',8,12.7],['20-05',9,15.35],['20-06',10,18.02],['20-07',11,20.69],['20-08',12,23.36],['14-24',10,18.02],['04-07',3,4.35]];
  const national=[['08-14',8,8],['14-20',8,8],['20-24',8,8],['24-04',8,8],['08-16',8,8],['04-08',8,8],['20-05',9,9.33],['20-06',10,10.68],['20-07',11,12.03],['16-24',8,8],['24-08',8,8],['10-18',8,8],['20-04',8,8]];
  const out=[...rest.map(r=>['休','休'+r[0],r[1],r[2],'','',...r[0].split('-'),'full']),...national.map(r=>['國','國'+r[0],r[1],r[2],'','',...r[0].split('-'),'full'])];
  out.push(['代','代08-16',8,'','','','08','16','full'],['代','代16-24',8,'','','','16','24','full'],['代','代24-08',8,'','','','24','08','full'],['延','代16-20',4,6.02,'08','16','16','20','after'],['延','代20-08',4,'','24','08','20','24','before']);
  return out;
 }
 function validate(rows){
  if(!Array.isArray(rows)||rows.length>150)throw Error('換算表必須為表格，最多150筆');
  const seen=new Set();
  return rows.map((r,i)=>{
   if(!Array.isArray(r)||![9,10].includes(r.length))throw Error('第'+(i+1)+'列格式錯誤');
   const v=r.map(x=>String(x??'').trim()),code=v[1];
   if(!types.includes(v[0])||!/^(?:[^0-9]{1,12})?\d{2}(?::\d{2})?-\d{2}(?::\d{2})?$/.test(code))throw Error('第'+(i+1)+'列類型或代碼有誤');
   // Legacy 延長 and 延時 periods may share a code in the cloud but have
   // different historical conversions. Preserve their raw identities for
   // existing reports rather than destroying one while merging menus.
   const legacyIdentity=v[9]?'named:'+v[9]:'builtin:'+typeLabel[v[0]];
   const key=legacyIdentity+'|'+code;
   if(seen.has(key))throw Error('同一加班類型的出勤時段重複：'+code);
   seen.add(key);
   if(!(Number(v[2])>0&&Number(v[2])<=24)||v[3]!==''&&!(Number.isFinite(Number(v[3]))&&Number(v[3])>=0&&Number(v[3])<=100))throw Error(code+' 時數無效');
   if(!Number.isFinite(span(v[6],v[7])))throw Error(code+' 加班起迄時間無效');
   if(v[0]==='延'){
    if(!['before','after'].includes(v[8])||span(v[4],v[5])!==480)throw Error(code+' 正常班須為8小時，並選擇班前或班後');
    if(v[8]==='before'&&hour(v[7])%1440!==hour(v[4])%1440||v[8]==='after'&&hour(v[5])%1440!==hour(v[6])%1440)throw Error(code+' 正常班與加班必須相接');
   }else{v[4]='';v[5]='';v[8]='full';}
   const label=code.match(/(\d{2}(?::\d{2})?)-(\d{2}(?::\d{2})?)$/);
   if(v[0]!=='延'&&(hour(label[1])%1440!==hour(v[6])%1440||hour(label[2])%1440!==hour(v[7])%1440))throw Error(code+' 代碼時段與加班時段不一致');
   if(v[0]==='延'&&v[8]==='before'&&(hour(label[1])%1440!==hour(v[6])%1440||hour(label[2])%1440!==hour(v[5])%1440))throw Error(code+' 班前加班代碼須包含完整出勤時段');
   // Retain the original legacy label INSIDE the cloud rule record.
   // The display is unified by ruleType(), not by overwriting history.
   if(v.length===10&&(!v[9]||isBuiltinType(v[9])&&
      !['平日延長加班','平日延時加班'].includes(v[9])))v.pop();
   return v;
  });
 }
 const excelHeaders=['假別','出勤時段','實際加班時數','換算時數','正常起','正常迄','加班起','加班迄','位置','加班類型名稱'];
 const positionLabels={full:'全段',after:'班後',before:'班前'};
 function excelRows(rows){return [excelHeaders,...validate(rows).map(r=>[typeLabel[r[0]],...r.slice(1,8),positionLabels[r[8]],ruleType(r)])];}
 function parseExcelRows(rows){
  if(!Array.isArray(rows)||!rows.length||excelHeaders.some((h,i)=>String(rows[0][i]||'').trim()!==h))throw Error('匯入欄位不符，請先匯出試算表範本');
  const categories={...Object.fromEntries(types.map(c=>[typeLabel[c],c])),'平日延長加班':'延'},positions=Object.fromEntries(Object.entries(positionLabels).map(([a,b])=>[b,a]));
  return validate(rows.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map(r=>[categories[String(r[0]).trim()]||r[0],...Array.from({length:7},(_,i)=>r[i+1]??''),positions[String(r[8]).trim()]||r[8],r[9]||'']));
 }
 async function ensureExcel(){
  if(global.XLSX)return global.XLSX;
  const loader=global.p79EnsureXlsx||global.p79LoadXlsxLibrary;
  if(!loader)throw Error('試算表元件尚未就緒，請重新整理');
  await loader();if(!global.XLSX)throw Error('試算表元件載入失敗');return global.XLSX;
 }
 function normalizeStored(value){return value===undefined?[]:validate(value);}
 function resolvedRule(row){
  const r=row.slice();
  if(r[3]===null||r[3]===undefined||String(r[3]).trim()==='')r[3]='';
  return r;
 }

 function report(row){
  const r=resolvedRule(validate([row])[0]);return {version:1,category:r[0],typeName:ruleType(r),code:r[1],declaredHours:Number(r[2]),convertedHours:r[3]===''?null:Number(r[3]),normalStart:r[4],normalEnd:r[5],overtimeStart:r[6],overtimeEnd:r[7],position:r[8]};
 }
 function verifySavedReport(draft,result){
  const actual=result?.report,expected=draft.rule;
  if(!actual||actual.id!==draft.id||actual.category!==expected.category||actual.code!==expected.code||Number(actual.declaredHours)!==Number(expected.declaredHours))throw Error('雲端回覆的申報身分或時數與修改內容不一致，已保留編輯內容');
  const absent=v=>v===null||v===undefined||String(v).trim()==='';
  if(absent(actual.convertedHours)!==absent(expected.convertedHours)||!absent(expected.convertedHours)&&Number(actual.convertedHours)!==Number(expected.convertedHours))throw Error('雲端沒有保留換算時數（預期 '+(absent(expected.convertedHours)?'空白':expected.convertedHours)+'，實際 '+(absent(actual.convertedHours)?'空白':actual.convertedHours)+'）；GAS 儲存規則尚未一致，已保留修改內容');
  const time=v=>String(v??'').trim().replace(/:00$/,'').padStart(2,'0');
  if(['normalStart','normalEnd','overtimeStart','overtimeEnd'].some(k=>time(actual[k])!==time(expected[k]))||String(actual.position||'full')!==String(expected.position||'full'))throw Error('雲端沒有保留所選出勤時段，已保留修改內容');
  return true;
 }
 function interval(date,start,end,offset=0){
  const base=Date.parse(date+'T00:00:00+08:00'),a=hour(start),duration=span(start,end);
  if(!Number.isFinite(base)||!Number.isFinite(duration))throw Error('日期或時段無效');
  const x=base+(a+offset*1440)*60000;return [x,x+duration*60000];
 }
 // Declaration hours use the scheduled start and the clock-out minute; minute 45 is inclusive for hour advance.
 function declarationEnd(end){
  if(end===null||end===undefined||end===''||!Number.isFinite(Number(end)))return NaN;
  const value=Number(end),hour=Math.floor(value/3600000)*3600000;
  return hour+(new Date(value).getUTCMinutes()>=45?3600000:0);
 }
 function declarationWindow(start,end,date,roster){
  if(!(Number.isFinite(start)&&end>start))return null;
  const period=global.P79RestAttendance?.period(date,roster||{});
  if(!period?.known)return null;
  const cutoff=declarationEnd(end);
  return {start:period.start,end:Math.max(period.start,cutoff),minutes:Math.max(0,(cutoff-period.start)/60000)};
 }
 function ruleAttendanceIssue(start,end,date,row,roster=null){
  if(!(Number.isFinite(start)&&Number.isFinite(end)&&end>start))return '尚未完成上下班打卡，請核對';
  const r=validate([row])[0];let ot=interval(date,r[6],r[7]);
  if(r[0]==='延'){
   const normal=interval(date,r[4],r[5]),offset=r[8]==='after'?normal[1]-ot[0]:normal[0]-ot[1];
   ot=ot.map(t=>t+offset);
  }
  const scheduled=roster?declarationWindow(start,end,date,roster):null;
  // A moved shift may leave reportOriginalShift pointing at the older slot.
  // Respect the latest paired punch only when it starts near the selected rule;
  // a single punch or an unrelated early timestamp can never override a roster.
  const startAgrees=Math.abs(start-ot[0])<=45*60000;
  const endAgrees=Math.abs(end-ot[1])<=45*60000;
  // A roster that was *actually changed* to a different shift can supersede
  // stale reportOriginalShift; arbitrary earlier periods cannot.
  const activeShift=String(roster?.[date]||'');
  const currentStart=({早:'08',中:'16',晚:'24'})[activeShift];
  const adjustedShiftStart=currentStart!=null&&hour(currentStart)===hour(r[6]);
  // 完整上下班打卡均與新時段吻合時，即使舊休班 meta 尚未改班，也允許原申報改時段。
  // 僅上班一筆或任意較早打卡不得單獨推翻原班表。
  const movedFullShift=endAgrees&&Number(r[2])===8&&ot[1]-ot[0]===8*3600000&&scheduled&&scheduled.start-ot[0]>=4*3600000;
  if(r[0]!=='延'&&scheduled&&ot[0]<scheduled.start&&!(startAgrees&&(adjustedShiftStart||movedFullShift)))
   return '申報起點早於排定班別，請依班別起算';
  if(ot[1]>declarationEnd(end))return '下班分鐘達45分（含）即進位；此申報時段超過可計算的下班整點，請選較短時段';
  if(r[0]!=='延'&&!startAgrees)return '打卡上班時間與申報起點不符，請核對排定班別';
  if(r[0]==='延'&&start>ot[0]+45*60000)return '打卡上班時間與申報起點不符，請核對排定班別';
  return '';
 }
 function overtimeMinutes(start,end,date,meta){
  const r=meta?.overtimeReport;if(!r||!(end>start))return null;
  let [a,b]=interval(date,r.overtimeStart,r.overtimeEnd);
  if(r.position==='after'||r.position==='before'){
   const normal=interval(date,r.normalStart,r.normalEnd);
   // A 24:00 overtime start is already on the next calendar day. Align the
   // actual overtime interval to the adjacent normal shift instead of adding
   // the normal end's day count (which previously skipped one extra day).
   const shift=r.position==='after'?normal[1]-a:normal[0]-b;
   if(shift%86400000!==0)return null;
   a+=shift;b+=shift;
  }
  return Math.max(0,Math.floor((Math.min(end,b)-Math.max(start,a))/60000));
 }
 function inferRule(start,end,date,rows,category){
  const candidates=[];
  validate(rows).forEach((row,index)=>{
   if(category&&row[0]!==category)return;
   try{
    let ot=interval(date,row[6],row[7]),a=ot[0],b=ot[1];
    if(row[0]==='延'){
     const normal=interval(date,row[4],row[5]);
     const offset=row[8]==='after'?normal[1]-ot[0]:normal[0]-ot[1];
     if(offset%86400000)return;ot=ot.map(t=>t+offset);
     a=row[8]==='after'?normal[0]:ot[0];b=row[8]==='after'?ot[1]:normal[1];
    }
    if(Math.abs(start-a)>45*60000||Math.abs(end-b)>45*60000||b>declarationEnd(end))return;
    const minutes=Math.max(0,Math.floor((Math.min(end,ot[1])-Math.max(start,ot[0]))/60000));
    if(minutes)candidates.push({row,index,minutes,distance:Math.abs(start-a)+Math.abs(end-b)});
   }catch(ignore){}
  });
  candidates.sort((a,b)=>a.distance-b.distance||a.index-b.index);return candidates[0]?.row||null;
 }
 function suggestRule(start,end,date,roster,rows,kinds=[]){
  const window=declarationWindow(start,end,date,roster);if(!window||!window.minutes)return null;
  const typhoon=kinds.some(k=>k.code==='颱'),election=kinds.some(k=>k.code==='選');
  const ranked=validate(rows).map((row,index)=>({row,index,priority:typhoon&&/颱/.test(ruleType(row))?0:election&&/選舉|投票/.test(ruleType(row))?0:(typhoon||election)&&row[0]==='國'?1:2}));
  const candidates=ranked.filter(({row})=>{
   if(typhoon||election){const named=typhoon&&/颱/.test(ruleType(row))||election&&/選舉|投票/.test(ruleType(row));if(!named&&ruleType(row)!=='國定假日加班')return false;}else if(row[0]!=='延')return false;
   try{const r=inferRule(window.start,end,date,[row]);if(!r)return false;const span=interval(date,row[6],row[7]);return row[0]==='延'||span[0]===window.start&&span[1]===window.end;}catch(_){return false;}
  }).sort((a,b)=>a.priority-b.priority||a.index-b.index);
  return candidates[0]?.row||null;
 }
 // Generated choices are available immediately; only the selected new rule is persisted.
 const specialTypes=[['颱風日加班','颱'],['選舉日加班','選']];
 function specialRows(rows,config={},extra=[]){
  // Only saved, enabled periods can be offered, including special days.
  return activeReportRows(rows,config);
 }

 async function ensureSpecialRule(row){
  const fresh=await loadRules();
  const found=activeReportRows(fresh.rows,fresh.config).find(r=>ruleType(r)===ruleType(row)&&r[1]===row[1]);
  if(!found||JSON.stringify(report(found))!==JSON.stringify(report(row)))
   throw Error('此時段未啟用或已更新，請至加班選項管理設定並儲存後再申報');
 }

 function matchReport(start,end,date,map){
  const direct=map?.[date]||null,base=Date.parse(date+'T00:00:00+08:00');
  if(!Number.isFinite(base))return {meta:direct,date,minutes:null};
  let best=null;
  for(const offset of [-1,0,1]){
   // toISOString is UTC; restore Taipei date for the logical roster day.
   const key=new Date(base+offset*86400000+8*3600000).toISOString().slice(0,10);
   const meta=map?.[key];if(!meta?.overtimeReport)continue;
   const minutes=overtimeMinutes(start,end,key,meta);
   if(minutes>0&&(!best||minutes>best.minutes))best={meta,date:key,minutes};
  }
  return best||{meta:direct,date,minutes:direct?.overtimeReport?overtimeMinutes(start,end,date,direct):null};
 }
 function auth(){
  const token=global.p79OvertimeContext?.token?.()||sessionStorage.getItem('port79_user_token')||sessionStorage.getItem('port79_admin_token')||sessionStorage.getItem('port79_gc_superadmin_token')||sessionStorage.getItem('port79_gc_token')||'';
  const url=global.p79OvertimeContext?.gasUrl?.();if(!url||!token)throw Error('請先登入管理員');return {url,token};
 }
 async function rpc(action,payload){
  const {url,token}=auth(),ctl=new AbortController(),timeoutMs=payload?45000:12000;let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{ctl.abort();reject(Error(payload?'雲端儲存逾時，尚未確認成功；請保留修改':'雲端讀取超過12秒，請按「重新讀取雲端」再試'));},timeoutMs)});
  try{return await Promise.race([(async()=>{
   const endpoint=payload?url:url+'?action='+encodeURIComponent(action)+'&token='+encodeURIComponent(token)+'&gcToken='+encodeURIComponent(token)+'&t='+Date.now();
   const options=payload?{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,action,token,gcToken:token,userToken:token})}:{cache:'no-store'};
   const res=await fetch(endpoint,{...options,signal:ctl.signal});if(!res.ok)throw Error('雲端HTTP '+res.status);
   const d=await res.json();if(d?.ok!==true)throw Error(d?.error||'雲端未確認成功');return d;
  })(),deadline]);}finally{clearTimeout(timer)}
 }
 // A preflight belongs to one button press, never to persisted browser drafts.
 const saveValidationContexts=new WeakMap();
 async function prepareSaveValidation(request,checkRules=true){
  const credentials=auth(),{url,token}=credentials;
  const scope={empId:String(request.empId).trim().toUpperCase(),date:request.date,
   overtimeDate:String(request.overtimeDate||request.date),coverDate:String(request.coverDate||request.date),leaveHandoffId:String(request.leaveHandoffId||'')};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  const read=(async()=>{
   try{
    const query='?action=getOvertimeReportContext&gcToken='+encodeURIComponent(token)+'&token='+encodeURIComponent(token)+
     '&empId='+encodeURIComponent(scope.empId)+'&date='+encodeURIComponent(scope.date)+
     '&leaveHandoffId='+encodeURIComponent(scope.leaveHandoffId)+'&coverDate='+encodeURIComponent(scope.coverDate)+
     '&overtimeDate='+encodeURIComponent(scope.overtimeDate)+'&_='+Date.now();
    const response=await fetch(url+query,{cache:'no-store',signal:controller.signal});
    const cloud=await response.json();
    if(!response.ok||cloud?.ok!==true)throw Error(cloud?.error||'出勤與班表核對失敗');
    if(cloud.revision==null||!Array.isArray(cloud.records)||!Array.isArray(cloud.schedules)||
       !cloud.schedules.some(row=>String(row.empId).trim().toUpperCase()===scope.empId))throw Error('雲端出勤或正式班表資料不完整，尚未送出申報');
    return {cloud,checkedAt:Date.now()};
   }finally{clearTimeout(timer)}
  })();
  const [rules,context]=await Promise.all([checkRules?loadRules():null,read]);
  const current=auth();
  if(current.url!==url||current.token!==token)throw Error('登入或資料來源已變更，請重新核對申報');
  saveValidationContexts.set(request,{...context,...credentials,...scope});
  return {rules,cloud:context.cloud};
 }
 function takeSaveContext(draft){
  const saved=saveValidationContexts.get(draft);saveValidationContexts.delete(draft);
  if(!saved)return null;
  const current=auth(),age=Date.now()-saved.checkedAt;
  if(age<0||age>15000||saved.url!==current.url||saved.token!==current.token||
     saved.empId!==String(draft.empId).trim().toUpperCase()||saved.date!==draft.date||
     saved.coverDate!==String(draft.coverDate||draft.date)||saved.overtimeDate!==String(draft.overtimeDate||draft.date)||
     saved.leaveHandoffId!==String(draft.leaveHandoffId||''))return null;
  return saved.cloud;
 }
 // Show each rule only under its named overtime type; sharing a quota category
 // (e.g. 颱風日加班 and 國定假日加班 both may use 國) is NOT the same type.
 function matchesReportType(row,type){return ruleType(row)===canonicalType(type);}
 // Human-readable labels are display-only. Persist the original rule code and category
 // for backend verification, existing declarations, conversion rates, and audits.
 function displayPeriodCode(row){
  const original=String(row?.[1]||'');
  const name=ruleType(row);
  const match=original.match(/(\d{2}(?::\d{2})?-\d{2}(?::\d{2})?)$/);
  const suffix=match?.[1]||'';
  const code=name==='颱風日加班'&&suffix?'颱'+suffix:
   name==='選舉日加班'&&suffix?'選'+suffix:
   row[0]==='延'&&suffix?'延'+row[6]+'-'+row[7]:
   original;
  return code+'｜'+name;
 }
 // Four 4-hour extension periods for night- and early-shift leave coverage.
 // Existing configured categories, rates and periods are never overwritten.
 // New cloud settings are saved only through the normal explicit Save action.
 function p79AddLeaveSupportPeriods(source){
  return {rows:validate(source),added:0};
 }
 function reportRules(){
  const config=global.p79OvertimeContext?.config?.();
  if(config&&Object.prototype.hasOwnProperty.call(config,CONFIG))return normalizeStored(config[CONFIG]);
  return [];
 }
 function activeSupportPeriods(rows,config={}){
  return {rows:activeReportRows(rows,config),added:0};
 }

 function activeReportRules(){
  return activeReportRows(reportRules(),global.p79OvertimeContext?.config?.()||{});
 }
 function reportEmployeeRole(e){
  return String(e?.jobTitle||e?.deptDetail||e?.role||e?.position||'未設定職稱').trim()||'未設定職稱';
 }
 function normalizeRoleTypeDefaults(config={}){
  const pairs=config?.[ROLE_DEFAULTS_CONFIG]||[];
  if(!Array.isArray(pairs)||pairs.length>100)throw Error('職稱預設加班類型格式錯誤（最多100筆）');
  const seen=new Set();
  return pairs.map((pair,index)=>{
   if(!Array.isArray(pair)||pair.length!==2)throw Error('第'+(index+1)+'筆職稱加班類型格式有誤');
   const role=String(pair[0]||'').trim(),type=canonicalType(pair[1]);
   if(!role||role.length>70||!['平日延時加班','休息日加班'].includes(type)||seen.has(role))
    throw Error('第'+(index+1)+'筆職稱加班類型無效或重複');
   seen.add(role);return [role,type];
  });
 }
 // A job title supplies a suggestion, never a legally authoritative day type.
 // Reject deleted categories; verified roster and punch evidence still prevail.
 function preferredOvertimeTypeForRole(config={},role='',rows=null){
  const found=normalizeRoleTypeDefaults(config).find(pair=>pair[0]===String(role||'').trim());
  if(!found)return '';
  const effectiveRows=rows||normalizeStored(config[CONFIG]);
  return typeOptions(config,activeReportRows(effectiveRows,config))
   .some(option=>option.name===found[1])?found[1]:'';
 }
 function prefillReportRole(select,people,empId){
  const worker=people.find(e=>String(e.empId)===String(empId));
  if(!worker)return false;
  const value=reportEmployeeRole(worker);
  if(!Array.from(select.options||[]).some(option=>option.value===value))return false;
  select.value=value;
  return true;
 }
 function filterReportEmployees(people,department='',jobTitle=''){
  const dept=e=>String(e.dept||'一般'),title=e=>String(e.jobTitle||e.deptDetail||'未設定');
  const unique=xs=>[...new Set(xs)].sort((a,b)=>a.localeCompare(b,'zh-Hant',{numeric:true}));
  const scoped=people.filter(e=>!department||dept(e)===department);
  return {departments:unique(people.map(dept)),jobTitles:unique(scoped.map(title)),employees:scoped.filter(e=>!jobTitle||title(e)===jobTitle)};
 }
 // Preserve a last known-good, same-endpoint snapshot of real cloud-saved
 // overtime options before an empty/partial response can erase browser config.
 // This is a local recovery candidate only; it NEVER creates or saves rules.
 const RECOVERY_STORAGE='p79_overtime_options_last_good_v1';
 const RECOVERY_FIELDS=[CONFIG,TYPECONFIG,DELETED_CONFIG,ARCHIVED_CONFIG,ROLE_DEFAULTS_CONFIG,HIDDEN_MANAGER_RULES];
 function overtimeRecoverySnapshot(config){
  if(!config||typeof config!=='object'||!Array.isArray(config[CONFIG]))return null;
  const rows=validate(config[CONFIG]);
  if(!rows.length||!typeOptions(config,rows).length||!activeReportRows(rows,config).length)return null;
  const result={};
  for(const key of RECOVERY_FIELDS)if(Object.prototype.hasOwnProperty.call(config,key))
   result[key]=JSON.parse(JSON.stringify(config[key]));
  return result;
 }
 function rememberOvertimeOptions(config,source='cloud'){
  try{
   const snapshot=overtimeRecoverySnapshot(config);
   const url=String(global.p79OvertimeContext?.gasUrl?.()||'').trim();
   if(!snapshot||!url||!global.localStorage)return false;
   const previous=JSON.parse(global.localStorage.getItem(RECOVERY_STORAGE)||'null');
   // Do not replace a richer previous snapshot merely because this read has
   // fewer rows: this recovery record is not an authoritative live setting.
   if(previous?.url===url&&
      Array.isArray(previous?.config?.[CONFIG])&&
      previous.config[CONFIG].length>snapshot[CONFIG].length)return true;
   global.localStorage.setItem(RECOVERY_STORAGE,JSON.stringify({
    url,at:Date.now(),source,config:snapshot
   }));
   return true;
  }catch(error){return false;}
 }
 function recoverableOvertimeOptions(cloudConfig){
  try{
   const url=String(global.p79OvertimeContext?.gasUrl?.()||'').trim();
   if(!url||!global.localStorage||!cloudConfig||typeof cloudConfig!=='object')return null;
   // Never override a current active rule, an intentional archive/deletion, or
   // a source mismatch. Recovery requires an administrator confirmation and
   // the existing guarded Save + cloud readback.
   if(normalizeStored(cloudConfig[CONFIG]).length||typeOptions(cloudConfig).length||
      [DELETED_CONFIG,ARCHIVED_CONFIG,HIDDEN_MANAGER_RULES].some(key=>
       Array.isArray(cloudConfig[key])&&cloudConfig[key].length))return null;
   const saved=JSON.parse(global.localStorage.getItem(RECOVERY_STORAGE)||'null');
   if(saved?.url!==url)return null;
   const snapshot=overtimeRecoverySnapshot(saved.config);
   if(!snapshot)return null;
   const allowed=new Set(activeReportRows(snapshot[CONFIG],snapshot).map(ruleKey));
   const rows=validate(snapshot[CONFIG]).filter(row=>allowed.has(ruleKey(row)));
   const types=typeOptions(snapshot,rows).map(({name,category})=>[name,category]);
   if(!rows.length||!types.length)return null;
   return {rows,types,at:saved.at,source:saved.source,
    roleDefaults:normalizeRoleTypeDefaults(snapshot)};
  }catch(error){return null;}
 }
 async function loadRules(){const d=await rpc('getOvertimeConfig');if(!d.config||typeof d.config!=='object')throw Error('雲端設定不完整，未使用預設值覆蓋');const rows=validate(normalizeStored(d.config[CONFIG]));rememberOvertimeOptions(d.config,'getOvertimeConfig');return {config:d.config,rows};}
 // Replace ONLY the cloud-owned overtime fields. Shallow Object.assign leaves
 // old archive flags behind when the authoritative cloud no longer has them.
 // Other context settings, such as permissions or local page data, stay intact.
 function syncCloudOvertimeConfig(cloudConfig){
  const current=global.p79OvertimeContext?.config?.();
  if(!current)return null;
  rememberOvertimeOptions(current,'before-cloud-overwrite');
  for(const key of [CONFIG,TYPECONFIG,DELETED_CONFIG,ARCHIVED_CONFIG,ROLE_DEFAULTS_CONFIG,HIDDEN_MANAGER_RULES]){
   if(!Object.prototype.hasOwnProperty.call(cloudConfig,key))delete current[key];
  }
  Object.assign(current,cloudConfig);
  return current;
 }
 // Convert legacy leave-handoff queue items to the worker's actual work date.
 // The original leave date is retained for leave-link verification; this is
 // read-only and never creates a scheduled shift or an overtime report.
 function normalizeLeaveCoverHandoffEntry(data,handoff,entry){
  const key=v=>String(v||'').trim().toUpperCase(),leaveDate=String(entry?.coverDate||entry?.date||'');
  const cover=(data?.leaveCoverAssignments||[]).find(c=>String(c.leaveId)===String(entry?.leaveId||handoff?.id)&&
   key(c.leaveEmpId)===key(entry?.forEmpId)&&(c.workerIds||[]).some(id=>key(id)===key(entry?.empId))&&
   String(c.startDate)<=leaveDate&&String(c.endDate)>=leaveDate);
  if(!cover)throw Error('原請假代班資料未能通過正式雲端核對，保留待申報資料');
  const roster=new Map((data.schedules||[]).map(r=>[key(r.empId),r.schedule||{}]));
  const target=roster.get(key(cover.leaveEmpId))||{};
  const originalShift=[target[leaveDate],target.__meta?.[leaveDate]?.leaveOriginalShift,
   target.__meta?.[leaveDate]?.reportOriginalShift,entry.coverShift]
   .map(v=>String(v||'').trim()).find(v=>['早','中','晚'].includes(v))||'';
  const workerIndex=(cover.workerIds||[]).findIndex(id=>key(id)===key(entry.empId));
  const plan=global.P79LeaveCoverSuggest?.coverWorkday?.(leaveDate,originalShift,cover.mode,workerIndex);
  if(!plan)return {...entry,coverDate:leaveDate};
  if(entry.date!==leaveDate&&entry.date!==plan.workDate)
   throw Error('原請假日期與代班工作日期不符，不能猜測或重複建立加班');
  return {...entry,date:plan.workDate,workDate:plan.workDate, overtimeDate:plan.overtimeDate,
   coverDate:leaveDate,coverShift:originalShift,code:plan.code,preferredType:'平日延時加班'};
 }
 function resolveLeaveCoverReport(data,handoff,entry){
  const key=v=>String(v||'').trim().toUpperCase(),date=entry.date;
  const leaveDate=String(entry.coverDate||date);
  const cover=(data.leaveCoverAssignments||[]).find(c=>String(c.leaveId)===String(handoff.id)&&key(c.leaveEmpId)===key(entry.forEmpId)&&(c.workerIds||[]).some(id=>key(id)===key(entry.empId))&&String(c.startDate)<=leaveDate&&String(c.endDate)>=leaveDate);
  if(!cover)throw Error('此筆請假在原代班日期的安排已取消或更換人員，請重新整理請假管理核對');
  const roster=new Map((data.schedules||[]).map(r=>[key(r.empId),r.schedule||{}])),own=roster.get(key(entry.empId))||{},target=roster.get(key(cover.leaveEmpId))||{};
  const originalShift=[target[leaveDate],target.__meta?.[leaveDate]?.leaveOriginalShift,
   target.__meta?.[leaveDate]?.reportOriginalShift,entry.coverShift]
   .map(v=>String(v||'').trim()).find(v=>['早','中','晚'].includes(v))||'';
  const workerIndex=(cover.workerIds||[]).findIndex(id=>key(id)===key(entry.empId));
  const split=global.P79LeaveCoverSuggest?.coverWorkday?.(leaveDate,originalShift,cover.mode,workerIndex);
  if(split){
   if(date!==split.workDate)throw Error('本筆實際出勤日期應為 '+split.workDate+'（原請假日 '+leaveDate+'）；請重新核對代班預排，尚未正式申報');
   if(entry.overtimeDate&&entry.overtimeDate!==split.overtimeDate)
    throw Error('加班歸屬日應為 '+split.overtimeDate+'，不能依畫面日期自行變更');
   const ownShift=[own[date],own.__meta?.[date]?.reportOriginalShift,own.__meta?.[date]?.overtimeOriginalShift]
    .map(v=>String(v||'').trim()).find(v=>['早','中','晚'].includes(v))||'';
   if(ownShift!==split.normalShift)return {code:'',requirePeriodSelection:true,
    overtimeDate:split.overtimeDate,workDate:split.workDate,
    periodHint:'預排候選：正常班 '+split.normalStart+'-'+split.normalEnd+'，加班 '+split.overtimeStart+'-'+split.overtimeEnd+'；出勤日 '+split.workDate+'，加班歸屬 '+split.overtimeDate+'；雲端尚未確認此人 '+date+' 的 '+split.normalShift+'班，請核對後才能儲存。'};
   return {code:split.code,requirePeriodSelection:false,overtimeDate:split.overtimeDate,workDate:split.workDate,
    periodHint:'原請假日 '+leaveDate+'；實際出勤日 '+date+'；加班歸屬日 '+split.overtimeDate+'；正常班 '+split.normalStart+'-'+split.normalEnd+
     '；平日延時加班 '+split.overtimeStart+'-'+split.overtimeEnd+'（不含正常班）'};
  }
  const meta=own.__meta?.[date]||{};

  const shift=map=>{const value=map[date]??map[date.slice(-2)]??map[String(Number(date.slice(-2)))];if(['早','中','晚'].includes(value))return value;const m=map.__meta?.[date]||{};return [m.reportOriginalShift,m.overtimeOriginalShift,m.leaveOriginalShift].find(v=>['早','中','晚'].includes(v));};
  const name=shift(target)||shift(own),ranges={早:['08','16'],中:['16','24'],晚:['24','08']};let times=ranges[name];
  if(times&&cover.mode==='two'){
   const halves={早:[['08','12'],['12','16']],中:[['16','20'],['20','24']],晚:[['24','04'],['04','08']]},ownTimes=ranges[shift(own)];
   if(ownTimes){
    const adjacent=halves[name].filter(t=>hour(t[1])%1440===hour(ownTimes[0])%1440||hour(t[0])%1440===hour(ownTimes[1])%1440);
    if(adjacent.length!==1)return {code:'',requirePeriodSelection:true,periodHint:'請假班為'+name+'班 '+ranges[name].join('-')+'；此員正常班為'+shift(own)+'班 '+ownTimes.join('-')+'，沒有可直接相接的半班，請核對代班安排。'};
    times=adjacent[0];
   }else times=halves[name][cover.workerIds.findIndex(id=>key(id)===key(entry.empId))===1?1:0];
  }
  return {code:'',requirePeriodSelection:true,periodHint:times?'請假班為'+name+'班 '+ranges[name].join('-')+'；本筆代班時段 '+times.join('-')+'，請選擇符合的已設定規則。':''};
 }
 function dialog(title,content,id='p79OvertimeDialog'){
  const previous=document.getElementById(id);previous?.p79Cleanup?.();previous?.remove();
  const el=document.createElement('dialog');el.id=id;el.className='p79-overtime-dialog';el.style.cssText='box-sizing:border-box;width:min('+(id==='p79OvertimeOptionsDialog'?'1100':'680')+'px,calc(100vw - 32px));max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);padding:20px;border:1px solid #cbd5e1;border-radius:16px;color:#0f172a;background:white;overflow:auto;text-align:center;';
  el.innerHTML=`<style>
   .p79-overtime-dialog,.p79-overtime-dialog *{box-sizing:border-box!important}
   .p79-overtime-dialog[open]{display:flex;flex-direction:column;gap:10px}
   .p79-overtime-dialog>div,.p79-overtime-dialog>p{min-width:0;max-width:100%;flex-shrink:0}
   .p79-overtime-dialog p,.p79-overtime-dialog h2,.p79-overtime-dialog label,.p79-overtime-dialog th,.p79-overtime-dialog td{text-align:center!important}
   .p79-overtime-dialog input,.p79-overtime-dialog select{min-width:0!important;max-width:100%!important;text-align:center!important}
   .p79-overtime-dialog label{min-width:0}
   #p79OvertimeDialog{width:min(680px,calc(100vw - 32px))!important;padding:14px!important;height:fit-content!important;min-height:0!important;max-height:calc(100dvh - 28px)!important;margin:auto!important;gap:6px!important}
   #p79OvertimeDialog .p79-report-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:8px 0}
   #p79OvertimeDialog .p79-report-grid label{display:flex;flex-direction:column;gap:5px;font-size:14px;font-weight:700}
   #p79OvertimeDialog select,#p79OvertimeDialog input{font-size:14px!important;padding:8px!important}
   #p79OvertimeDialog [data-ot-category="休"]{background:#dbeafe!important;color:#1e40af!important}
   #p79OvertimeDialog [data-ot-category="國"]{background:#dcfce7!important;color:#166534!important}
   #p79OvertimeDialog [data-ot-category="例"]{background:#ede9fe!important;color:#5b21b6!important}
   #p79OvertimeDialog [data-ot-category="代"]{background:#cffafe!important;color:#155e75!important}
   #p79OvertimeDialog [data-ot-category="延"]{background:#ffe4e6!important;color:#9f1239!important}
   #p79OvertimeDialog #p79OtForEmp{background:#fff1f2!important;color:#9f1239!important}
   #p79OvertimeDialog #p79OtEmp{background:#ecfeff!important;color:#155e75!important}
   #p79OvertimeDialog #p79OtDate{background:#f0fdf4!important;color:#166534!important}
   .p79-ot-dialog-header{position:relative;display:flex;align-items:center;justify-content:center;min-height:36px;padding:0 90px}
   .p79-ot-dialog-header h2{margin:0;font-size:20px;font-weight:900}
   .p79-ot-dialog-header button{position:absolute;right:0;top:50%;transform:translateY(-50%)}
   .p79-overtime-dialog button{max-width:100%;white-space:normal;text-align:center}
   .p79-ot-new-type-controls,.p79-ot-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px}
   .p79-ot-actions{position:sticky;bottom:0;z-index:4;margin-top:6px;padding:10px 0;background:white}
   #p79OvertimeOptionsDialog .p79-ot-table-wrap{flex:1 1 auto;min-height:120px;max-height:55vh;width:100%;overflow:auto;overscroll-behavior:contain;border:1px solid #e2e8f0;border-radius:8px}
   #p79OvertimeOptionsDialog table{width:100%!important;min-width:1000px!important;max-width:none!important;table-layout:fixed;border-collapse:collapse}
   #p79OvertimeOptionsDialog th{position:sticky;top:0;z-index:2;white-space:normal!important;overflow-wrap:anywhere;vertical-align:middle;padding:8px 4px!important}
   #p79OvertimeOptionsDialog td{padding:6px 4px!important;vertical-align:middle;overflow:hidden}
   #p79OvertimeOptionsDialog [data-ot-category="休"]{--ot-row:#dbeafe;--ot-field:#eff6ff;--ot-ink:#1e40af}
   #p79OvertimeOptionsDialog [data-ot-category="國"]{--ot-row:#dcfce7;--ot-field:#f0fdf4;--ot-ink:#166534}
   #p79OvertimeOptionsDialog [data-ot-category="例"]{--ot-row:#ede9fe;--ot-field:#f5f3ff;--ot-ink:#5b21b6}
   #p79OvertimeOptionsDialog [data-ot-category="代"]{--ot-row:#cffafe;--ot-field:#ecfeff;--ot-ink:#155e75}
   #p79OvertimeOptionsDialog [data-ot-category="延"]{--ot-row:#ffe4e6;--ot-field:#fff1f2;--ot-ink:#9f1239}
   #p79OvertimeOptionsDialog tr[data-ot-category] td{background:var(--ot-row)!important;color:var(--ot-ink)!important}
   #p79OvertimeOptionsDialog tr[data-ot-category] td:first-child{border-left:4px solid var(--ot-ink)}
   #p79OvertimeOptionsDialog tr[data-ot-category] input,#p79OvertimeOptionsDialog tr[data-ot-category] select{background:var(--ot-field)!important;color:var(--ot-ink)!important}
   #p79OvertimeOptionsDialog .p79-ot-color-legend{display:flex;justify-content:center;flex-wrap:wrap;gap:8px}
   #p79OvertimeOptionsDialog .p79-ot-color-legend span{background:var(--ot-row);color:var(--ot-ink);border:1px solid var(--ot-ink);border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700}
   #p79OvertimeOptionsDialog th:first-child{width:6%}
   #p79OvertimeOptionsDialog th:nth-child(2){width:11%}
   #p79OvertimeOptionsDialog th:nth-child(9){width:7%}
   #p79OvertimeOptionsDialog th:nth-child(10){width:13%}
   #p79OvertimeOptionsDialog th:last-child{width:6%}
   #p79OvertimeOptionsDialog td input,#p79OvertimeOptionsDialog td select{width:100%!important;padding:7px 3px!important}
   /* Compact overtime options manager; maximize space for actual period rows. */
   #p79OvertimeOptionsDialog{height:min(90dvh,840px)!important;max-height:calc(100dvh - 20px)!important;padding:10px 14px!important;gap:5px!important}
   #p79OvertimeOptionsDialog .p79-ot-dialog-header{min-height:28px}
   #p79OvertimeOptionsDialog .p79-ot-dialog-header h2{font-size:16px}
   #p79OvertimeOptionsDialog #p79OtStatus{margin:0!important;min-height:17px;font-size:12px;line-height:1.35}
   #p79OvertimeOptionsDialog .p79-ot-type-manager{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:6px 12px;align-items:start;background:#f0f9ff;border:1px solid #dbeafe;border-radius:8px;padding:8px 10px;margin:0;flex-shrink:0}
   #p79OvertimeOptionsDialog .p79-ot-section-title{display:block;font-size:12px;font-weight:700;margin:0;text-align:left}
   #p79OvertimeOptionsDialog .p79-ot-new-type-controls{display:flex;flex-wrap:nowrap;gap:5px;margin-top:6px!important;justify-content:flex-start}
   #p79OvertimeOptionsDialog #p79NewTypeName{flex:1 1 155px;width:0!important;min-width:75px!important;height:32px;padding:5px 6px!important}
   #p79OvertimeOptionsDialog #p79NewTypeCategory{flex:0 1 155px;width:155px!important;min-width:106px!important;height:32px;padding:5px 4px!important}
   #p79OvertimeOptionsDialog #p79AddType{flex:0 0 auto;white-space:nowrap!important;height:32px;padding:5px 10px!important;font-size:12px}
   #p79OvertimeOptionsDialog .p79-ot-type-list-wrap{min-width:0}
   #p79OvertimeOptionsDialog #p79OvertimeTypeList{max-height:72px;min-height:37px;overflow:auto;margin-top:6px;background:#fff;border:1px solid #cbd5e1;border-radius:6px;padding:4px}
   #p79OvertimeOptionsDialog #p79AddedTypeList{display:flex;flex-wrap:wrap;align-content:flex-start;gap:5px}
   #p79OvertimeOptionsDialog #p79AddedTypeList>div[role="listitem"]{min-height:28px!important;padding:2px 5px!important}
   #p79OvertimeOptionsDialog #p79AddedTypeList .p79OtDeleteType{padding:3px 6px!important;font-size:11px}
   #p79OvertimeOptionsDialog #p79AddedTypeMessage{grid-column:1/-1;margin:0!important;text-align:left!important;font-size:11px;line-height:1.35;min-height:0}
   #p79OvertimeOptionsDialog .p79-ot-table-help{margin:0!important;font-size:12px;font-weight:700;text-align:left!important;color:#334155}
   #p79OvertimeOptionsDialog #p79RoleTypeDefaultsPanel{margin:0!important;padding:0!important;border:1px solid #e2e8f0;border-radius:7px;background:#f8fafc;flex-shrink:0}
   #p79OvertimeOptionsDialog .p79-ot-role-heading{text-align:left;font-size:12px;font-weight:700;padding:6px 10px}
   #p79OvertimeOptionsDialog #p79RoleTypeDefaultsPanel{padding-bottom:4px!important}
   #p79OvertimeOptionsDialog #p79RoleTypeDefaultsRows{display:grid;gap:4px;grid-template-columns:repeat(2,minmax(0,1fr));max-height:190px;overflow:auto;margin:5px 10px}
   #p79OvertimeOptionsDialog .p79-ot-table-wrap{flex:1 1 200px!important;min-height:180px!important;max-height:none!important;overflow:auto}
   #p79OvertimeOptionsDialog table{min-width:930px!important}
   #p79OvertimeOptionsDialog th{padding:6px 4px!important;font-size:12px}
   #p79OvertimeOptionsDialog td{padding:3px!important;font-size:12px}
   #p79OvertimeOptionsDialog td input,#p79OvertimeOptionsDialog td select{padding:5px 3px!important;font-size:12px!important}
   #p79OvertimeOptionsDialog .p79-ot-actions{flex-shrink:0;margin:0!important;padding:5px 0!important;gap:5px!important;border-top:1px solid #e2e8f0}
   #p79OvertimeOptionsDialog .p79-ot-actions button{padding:7px 9px!important;font-size:12px;white-space:nowrap!important}
   /* One table for current rules and historical conversion rates. */
   #p79OvertimeOptionsDialog .p79-ot-table-wrap{min-height:250px!important}
   #p79OvertimeOptionsDialog table{min-width:880px!important;table-layout:auto!important}
   #p79OvertimeOptionsDialog table th{position:sticky;top:0;background:#eaf3fa!important;z-index:2;white-space:nowrap!important}
   #p79OvertimeOptionsDialog table td{padding:6px 5px!important;overflow:visible}
   #p79OvertimeOptionsDialog .p79-ot-times{display:flex;gap:4px;align-items:center;white-space:nowrap}
   #p79OvertimeOptionsDialog .p79-ot-times input{width:43px!important;min-width:43px!important;text-align:center!important}
   #p79OvertimeOptionsDialog .p79-ot-status-active{font-size:11px;color:#166534;font-weight:700}
   #p79OvertimeOptionsDialog .p79-ot-historical td{background:#f8fafc!important;color:#475569!important;border-bottom:1px solid #e2e8f0}
   #p79OvertimeOptionsDialog .p79-ot-historical-label{font-weight:700;color:#8b5cf6!important}
   #p79OvertimeOptionsDialog .p79-ot-muted{color:#94a3b8}
   #p79OvertimeOptionsDialog .p79OtDelete{font-size:11px;color:#991b1b;background:#fff1f2;border:1px solid #fecaca;border-radius:5px;padding:5px 6px}

   /* Production overtime type manager, matched to approved editable design. */
   #p79OvertimeOptionsDialog{width:min(1450px,calc(100vw - 22px))!important;max-width:calc(100vw - 22px)!important;height:min(93dvh,990px)!important;padding:14px 18px!important;gap:9px!important}
   #p79OvertimeOptionsDialog .p79-ot-dialog-header h2{font-size:21px!important;color:#0f2950}
   #p79OvertimeOptionsDialog .p79-ot-type-manager{display:flex!important;flex-direction:column;align-items:stretch;background:transparent;border:0;padding:0;gap:8px!important}
   #p79OvertimeOptionsDialog .p79-ot-type-list-wrap{order:-1;text-align:center!important}
   #p79OvertimeOptionsDialog .p79-ot-type-list-wrap>.p79-ot-section-title{display:none!important}
   #p79OvertimeOptionsDialog #p79OvertimeTypeList{max-height:86px!important;min-height:34px!important;border:0;background:transparent;padding:0;overflow:auto;margin:0!important}
   #p79OvertimeOptionsDialog #p79AddedTypeList{justify-content:center;align-items:center;flex-wrap:wrap;gap:8px}
   #p79OvertimeOptionsDialog #p79AddedTypeList>div[role="listitem"]{min-height:33px!important;border-radius:22px!important;padding:3px 7px 3px 12px!important;background:var(--ot-field)!important;color:var(--ot-ink)!important;border:1px solid var(--ot-ink)!important}
   #p79OvertimeOptionsDialog #p79AddedTypeList .p79OtDeleteType{padding:1px 6px!important;font-size:14px!important;border-radius:50%!important;border:0!important;background:transparent!important;color:var(--ot-ink)!important;line-height:1.25}
   #p79OvertimeOptionsDialog .p79-ot-add-type-wrap{background:#eaf6fd;border-radius:12px;padding:12px 16px;text-align:center!important}
   #p79OvertimeOptionsDialog .p79-ot-add-type-wrap .p79-ot-section-title{text-align:center!important;font-size:15px}
   #p79OvertimeOptionsDialog .p79-ot-new-type-controls{justify-content:center!important;flex-wrap:wrap;gap:10px;margin-top:8px!important}
   #p79OvertimeOptionsDialog #p79NewTypeName{flex:0 1 270px;width:270px!important;min-width:180px!important;height:37px!important}
   #p79OvertimeOptionsDialog #p79NewTypeCategory{flex:0 1 175px;width:175px!important;min-width:145px!important;height:37px!important}
   #p79OvertimeOptionsDialog #p79AddType{height:37px!important;padding:6px 17px!important}
   #p79OvertimeOptionsDialog #p79AddedTypeMessage{text-align:center!important;font-size:12px!important;color:#276381;min-height:16px;margin-top:-3px!important}
   #p79OvertimeOptionsDialog #p79RoleTypeDefaultsPanel{display:none!important}
   #p79OvertimeOptionsDialog .p79-ot-table-wrap{flex:1 1 380px!important;min-height:255px!important;overflow:auto;border-radius:9px;border:1px solid #dbe5f3}
   #p79OvertimeOptionsDialog table{min-width:1220px!important;table-layout:fixed!important;width:100%!important}
   #p79OvertimeOptionsDialog th{padding:9px 4px!important;white-space:nowrap!important;font-size:12px!important;background:#e8f1fa!important}
   #p79OvertimeOptionsDialog td{padding:4px!important;overflow:hidden!important}
   #p79OvertimeOptionsDialog td input,#p79OvertimeOptionsDialog td select{width:100%!important;min-width:0!important;height:32px!important;padding:4px 3px!important;border-radius:7px!important;font-size:12px!important}
   #p79OvertimeOptionsDialog th:nth-child(1){width:13%}
   #p79OvertimeOptionsDialog th:nth-child(2){width:10%}
   #p79OvertimeOptionsDialog th:nth-child(3){width:10%}
   #p79OvertimeOptionsDialog th:nth-child(4){width:9%}
   #p79OvertimeOptionsDialog th:nth-child(5),#p79OvertimeOptionsDialog th:nth-child(6),#p79OvertimeOptionsDialog th:nth-child(7),#p79OvertimeOptionsDialog th:nth-child(8){width:7%}
   #p79OvertimeOptionsDialog th:nth-child(9){width:8%}
   #p79OvertimeOptionsDialog th:nth-child(10){width:13%}
   #p79OvertimeOptionsDialog th:nth-child(11){width:7%}
   #p79OvertimeOptionsDialog [data-ot-category="休"]{--ot-row:#e0edff;--ot-field:#f4f8ff;--ot-ink:#1d4d92}
   #p79OvertimeOptionsDialog [data-ot-category="國"]{--ot-row:#d8f8e5;--ot-field:#f1fcf6;--ot-ink:#17653d}
   #p79OvertimeOptionsDialog [data-ot-category="例"]{--ot-row:#f0e9ff;--ot-field:#f8f5ff;--ot-ink:#63379b}
   #p79OvertimeOptionsDialog [data-ot-category="代"]{--ot-row:#d9f6fa;--ot-field:#f0fcfe;--ot-ink:#11677b}
   #p79OvertimeOptionsDialog [data-ot-category="延"]{--ot-row:#ffdee5;--ot-field:#fff2f4;--ot-ink:#9e2746}
   #p79OvertimeOptionsDialog .p79OtDelete{color:#1e293b!important;background:#f8fafc!important;border:1px solid #94a3b8!important;padding:4px 6px!important;white-space:nowrap}
   #p79OvertimeOptionsDialog .p79-ot-actions{justify-content:center;flex-wrap:wrap;gap:9px;padding:10px 0!important}
   #p79OvertimeOptionsDialog #p79OtSave{font-weight:700}
   @media(max-width:760px){
    #p79OvertimeOptionsDialog{width:calc(100vw - 16px)!important;max-width:calc(100vw - 16px)!important;padding:8px!important;height:calc(100dvh - 16px)!important}
    #p79OvertimeOptionsDialog .p79-ot-type-manager{grid-template-columns:minmax(0,1fr);gap:5px;padding:7px}
    #p79OvertimeOptionsDialog #p79NewTypeName{flex-basis:110px}
    #p79OvertimeOptionsDialog #p79NewTypeCategory{flex-basis:110px;width:110px!important}
    #p79OvertimeOptionsDialog #p79AddType{padding:4px 7px!important}
    #p79OvertimeOptionsDialog #p79OvertimeTypeList{max-height:45px}
    #p79OvertimeOptionsDialog #p79RoleTypeDefaultsRows{grid-template-columns:minmax(0,1fr)}
    #p79OvertimeOptionsDialog .p79-ot-actions{flex-wrap:wrap;gap:4px!important}
    #p79OvertimeOptionsDialog .p79-ot-actions button{font-size:11px;padding:5px 6px!important}
    #p79OvertimeOptionsDialog .p79-ot-table-wrap{min-height:140px!important}
   }
   @media(max-width:600px){.p79-overtime-dialog{padding:12px!important;width:calc(100vw - 20px)!important;max-width:calc(100vw - 20px)!important;max-height:calc(100dvh - 20px)!important}.p79-ot-dialog-header{padding:0 65px}.p79-ot-dialog-header h2{font-size:17px}.p79-ot-new-type-controls input,.p79-ot-new-type-controls select{width:100%!important}.p79-ot-actions button{padding:8px!important}}
  </style><div class="p79-ot-dialog-header"><h2>`+esc(title)+'</h2><button type="button" id="p79OtClose">✕ 關閉</button></div>'+content;
  // A manual preplan launched from the planned-review dialog must remain in
  // that dialog and must never navigate to the homepage or touch login state.
  // Use the SAME authenticated report form; only its DOM host changes.
  const planned=document.getElementById('p79OvertimePlannedDialog');
  const host=id==='p79OvertimeDialog'&&planned?.open?planned:document.body;
  host.appendChild(el);el.querySelector('#p79OtClose').onclick=()=>el.close();el.showModal();return el;
 }
 // Closing a verified report must not wait for optional navigation, notifications,
 // or a slow table refresh. Closing the exact instance also preserves any
 // underlying planned-review dialog and does not change cloud report data.
 function closeConfirmedReportDialog(el){
  if(!el)return;
  try{if(el.open)el.close();}catch(error){console.warn('已確認申報，關閉視窗時發生問題',error);}
  try{el.p79Cleanup?.();}catch(error){console.warn('加班視窗清理未完成',error);}
  try{el.remove?.();}catch(error){console.warn('加班視窗移除未完成',error);}
 }
 // A lost network acknowledgment is NOT a verified save. Keep the form and
 // original report ID available for a safe cloud reread/retry, not a duplicate.
 function awaitOvertimeSaveConfirmation(task,timeoutMs=90000){
  let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>
   reject(Error('雲端儲存回覆超過等候時間，結果尚未確認；已保留原申報 ID。請到加班明細核對後再重試，不要新增重複申報。')),timeoutMs);});
  return Promise.race([Promise.resolve(task),deadline]).finally(()=>clearTimeout(timer));
 }
 const inputStyle='box-sizing:border-box;width:100%;min-width:0;max-width:100%;text-align:center;padding:7px;border:1px solid #cbd5e1;border-radius:5px;font-size:13px;background:white;color:#0f172a';
 function editorRow(row){
  const v=[...row.slice(0,9),ruleType(row)].map(x=>String(x??''));
  const field=(i,label,number=false)=>'<input data-col="'+i+'" aria-label="'+esc(label)+'" value="'+esc(v[i])+'" '+(number?'type="number" min="0" step="0.01"':'type="text"')+'>';
  const category='<select data-col="0" aria-label="加班假別">'+types.filter(t=>t!=='代'||v[0]==='代').map(t=>'<option value="'+t+'" '+(t===v[0]?'selected':'')+'>'+esc(typeLabel[t])+'</option>').join('')+'</select>';
  const position='<select data-col="8" aria-label="加班位置">'+[['full','全段'],['after','班後'],['before','班前']].map(([value,label])=>'<option value="'+value+'" '+(v[8]===value?'selected':'')+'>'+label+'</option>').join('')+'</select>';
  return '<tr data-ot-active="true" data-ot-key="'+esc(ruleKey(row))+'" data-ot-legacy-builtin="'+(row.length===9?'1':'0')+'" data-ot-original-category="'+esc(row[0])+'" data-ot-category="'+esc(v[0])+'">'+
   '<td>'+category+'</td><td>'+field(1,'出勤時段')+'</td><td>'+field(2,'實際加班時數',true)+'</td><td>'+field(3,'換算時數',true)+'</td>'+
   '<td>'+field(4,'正常起')+'</td><td>'+field(5,'正常迄')+'</td><td>'+field(6,'加班起')+'</td><td>'+field(7,'加班迄')+'</td>'+
   '<td>'+position+'</td><td>'+field(9,'加班類型名稱')+'</td>'+
   '<td><button type="button" class="p79OtDelete" aria-label="刪除時段 '+esc(v[1])+'">刪除</button></td></tr>';
 }
 function ruleGuide(rows){
  const saved=validate(rows);
  const lines=saved.map(row=>{
   const r=report(row),normal=r.normalStart&&r.normalEnd?r.normalStart+'–'+r.normalEnd:'無正常班段';
   return '<tr><td>'+esc(r.typeName)+'</td><td>'+esc(normal)+'</td><td>'+esc(r.overtimeStart+'–'+r.overtimeEnd)+'</td><td>'+esc(r.declaredHours)+' 小時</td><td>'+esc(r.convertedHours===null?'未設定':r.convertedHours+' 小時')+'</td></tr>';
  }).join('');
  return '<p>加班類型、出勤時段、實際與換算時數，均以本管理表儲存到雲端的設定為準。刪除的類型或時段不供新增、推薦或重新申報；缺少設定時顯示待設定，不自動補回。</p>'+
   '<p>正常班與加班分開計算。晚班請假分由兩人支援時：中班出勤 16:00–翌日04:00，其中 16:00–24:00 為正常班、24:00–04:00 為加班；早班出勤翌日04:00–16:00，其中 08:00–16:00 為正常班、04:00–08:00 為加班。兩段加班歸屬原晚班請假日，實際出勤及打卡日期各自保留；只有管理表存在符合時段時才提供申報。</p>'+
   '<p>預排可先申報已設定時數，實際出勤須待正式打卡核對。代班安排只記錄支援關係，不會自行產生「代」加班。舊正式申報保留原始資料供核對，刪除選項不會刪除既有工時。</p>'+
   '<p>以下依目前表格內容顯示；編輯後須按「儲存加班類型與出勤時段」才生效。</p><table style="width:100%;border-collapse:collapse"><thead><tr><th>加班類型</th><th>正常班</th><th>加班時段</th><th>實際時數</th><th>換算時數</th></tr></thead><tbody>'+lines+'</tbody></table>';
 }
 async function openRules(){
  if(!global.p79OvertimeContext?.canEditRules?.()&&!global.p79OvertimeContext?.canReport?.())return alert('沒有管理加班選項的權限');
  const el=dialog('加班選項管理','<p id="p79OtStatus">正在讀取已儲存的選項…</p>','p79OvertimeOptionsDialog');
  try{
   const cached=global.p79OvertimeContext?.config?.();
   rememberOvertimeOptions(cached,'existing-browser-settings');
   let removedBuiltinNames=deletedBuiltins(cached||{});
   let rows=cached&&Object.prototype.hasOwnProperty.call(cached,CONFIG)?managerVisibleRules(normalizeStored(cached[CONFIG]),cached):[];
   let allCloudRows=reportRules();
   let loadedRows='',loadedVisibleRows='',customTypes=typeOptions(cached||{},allCloudRows).map(t=>[t.name,t.category]),loadedTypes='',loadedTypeDraft='',loadedDeleted='',loadedArchived='',loadedHidden='',cloudReady=false,reading=false,saving=false;
   let roleTypeDefaults=normalizeRoleTypeDefaults(cached||{}),loadedRoleDefaults='',rowDeletionConfirmed=false;
   el.insertAdjacentHTML('beforeend','<p class="p79-ot-table-help">加班出勤時段與換算表 <span id="p79OtRuleCount" style="font-size:11px;font-weight:400;color:#64748b">（雲端時段均可編輯與刪除；修改後按儲存）</span></p><div class="p79-ot-table-wrap"><table style="width:100%;border-collapse:collapse"><thead><tr>'+['假別','出勤時段','實際加班時數','換算時數','正常起','正常迄','加班起','加班迄','位置','加班類型名稱','操作'].map(t=>'<th style="padding:8px;white-space:nowrap;background:#e0f2fe">'+t+'</th>').join('')+'</tr></thead><tbody id="p79OtRuleRows">'+rows.map(row=>editorRow(row,[...removedBuiltinNames])).join('')+'</tbody></table></div><div class="p79-ot-actions"><button id="p79OtAdd" type="button">＋新增出勤時段</button><button id="p79OtExport" type="button">匯出加班設定</button><button id="p79OtImport" type="button">匯入加班設定</button><input id="p79OtImportFile" type="file" accept=".xlsx,.xls" hidden><button id="p79OtReload" type="button">重新讀取雲端</button><button id="p79OtSave" type="button" style="background:#0369a1;color:white;padding:8px 18px;border-radius:8px">儲存加班類型與出勤時段</button></div>');
   el.querySelector('#p79OtStatus').insertAdjacentHTML('afterend',
    '<div class="p79-ot-type-manager">'+
     '<div class="p79-ot-add-type-wrap"><span class="p79-ot-section-title">新增加班類型</span>'+
      '<div class="p79-ot-new-type-controls">'+
       '<input id="p79NewTypeName" aria-label="新加班類型名稱" placeholder="例如：吊櫃作業休息日" maxlength="40" style="'+inputStyle+'">'+
       '<select id="p79NewTypeCategory" aria-label="新類型的工時計算方式" title="計算分類不代表已存在的加班類型" style="'+inputStyle+'">'+types.filter(c=>c!=='代').map(c=>'<option value="'+c+'">'+esc(typeLabel[c])+'</option>').join('')+'</select>'+
       '<button type="button" id="p79AddType" style="background:#0369a1;color:#fff;border-radius:6px;font-weight:700">＋新增加班類型</button>'+
      '</div></div>'+
     '<div class="p79-ot-type-list-wrap"><span class="p79-ot-section-title">現有加班類型（可刪除）</span>'+
      '<div id="p79OvertimeTypeList" role="list" aria-label="加班類型清單"><div id="p79AddedTypeList"></div></div></div>'+
     '<p id="p79AddedTypeMessage" role="status" aria-live="polite">輸入自訂名稱並選擇實際適用的假別，儲存後才會變更雲端。</p>'+
    '</div>');
   // Show all cloud periods as real editable rows. Preserve raw legacy
   // builtin identity so a label does not create a duplicate new rule.
   el.querySelector('.p79-ot-table-help').insertAdjacentHTML('beforebegin','<details style="margin:12px 0;padding:12px;border:1px solid #bfdbfe;border-radius:8px"><summary style="cursor:pointer;font-weight:700">加班規則說明（依本表設定）</summary><div id="p79OtRuleGuide"></div></details>');
   // Only present this recovery action if this same browser has authentic
   // formerly saved rules and the latest cloud reply is entirely empty.
   el.querySelector('#p79OtReload').insertAdjacentHTML('afterend',
    '<button id="p79OtRecoverLocal" type="button" hidden style="background:#fff7ed;border:1px solid #fb923c;color:#9a3412;padding:8px;border-radius:8px">找回本機舊加班設定</button>');
   const recoverButton=el.querySelector('#p79OtRecoverLocal');
   let recoveryDraft=null;
   const body=el.querySelector('#p79OtRuleRows');
   const readEditorRow=tr=>{
    const row=Array.from({length:10},(_,i)=>tr.querySelector('[data-col="'+i+'"]')?.value??'');
    if(tr.dataset.otLegacyBuiltin==='1'&&row[0]===tr.dataset.otOriginalCategory&&row[9]===typeLabel[row[0]])row.pop();
    return row;
   };
   const getRows=()=>[...body.querySelectorAll('tr[data-ot-active="true"]')].map(readEditorRow);
   const refreshRuleCount=()=>{
    try{el.querySelector('#p79OtRuleGuide').innerHTML=ruleGuide(getRows());}catch(error){el.querySelector('#p79OtRuleGuide').textContent='表格內容待修正：'+error.message;}
    const count=body.querySelectorAll('tr[data-ot-active="true"]').length;
    el.querySelector('#p79OtRuleCount').textContent='雲端出勤時段 '+count+' 筆｜可直接修改與刪除，按最下方儲存後生效';
   };
   body.addEventListener('input',refreshRuleCount);body.addEventListener('change',refreshRuleCount);
   const renderAddedTypeList=()=>{
    const list=el.querySelector('#p79AddedTypeList');if(!list)return;
    list.replaceChildren();
    if(!customTypes.length){
     const empty=document.createElement('div');empty.textContent='目前沒有啟用的加班類型';
     empty.style.cssText='padding:14px;text-align:center;color:#64748b';list.append(empty);return;
    }
    customTypes.forEach(([name,category],index)=>{
     const item=document.createElement('div');item.setAttribute('role','listitem');item.dataset.otCategory=category;
     item.style.cssText='display:inline-flex;align-items:center;justify-content:space-between;gap:5px;padding:2px 5px;border:1px solid #dbe4ee;border-radius:5px;background:#fff;min-height:28px;font-size:12px';
     const label=document.createElement('span');label.textContent=name;
     const button=document.createElement('button');button.type='button';button.className='p79OtDeleteType';
     button.textContent='×';button.setAttribute('aria-label','刪除加班類型 '+name);
     button.title='確認後直接儲存雲端，不提供恢復';
     button.style.cssText='padding:4px 9px;border:1px solid #fecaca;border-radius:6px;color:#b91c1c;background:#fff1f2;font-size:12px;font-weight:700';
     button.disabled=!cloudReady||reading||saving||!global.p79OvertimeContext?.canEditRules?.();
     button.onclick=()=>{
      if(!cloudReady||reading||saving||!global.p79OvertimeContext?.canEditRules?.()||customTypes[index]?.[0]!==name)return;
      const matching=[...body.querySelectorAll('tr[data-ot-active="true"]')].filter(tr=>
       ruleType(readEditorRow(tr))===canonicalType(name));
      if(!global.confirm('確定刪除加班類型「'+name+'」？'+
       (matching.length?'\\n同時停止提供 '+matching.length+' 個出勤時段。':'')+
       '\\n確認後直接同步雲端，不提供恢復；歷史加班紀錄保留。'))return;
      customTypes.splice(index,1);matching.forEach(tr=>tr.remove());
      renderAddedTypeList();renderRoleTypeDefaults();
      el.querySelector('#p79AddedTypeMessage').textContent='已移除「'+name+'」及其時段；請按最下方「儲存加班類型與出勤時段」。';
      refreshRuleCount();
     };
     item.append(label,button);list.append(item);
    });
   };
   renderAddedTypeList();
   el.querySelector('#p79AddType').onclick=()=>{
    if(!cloudReady||reading||saving||!global.p79OvertimeContext?.canEditRules?.())return;
    const name=canonicalType(el.querySelector('#p79NewTypeName').value.trim()),category=el.querySelector('#p79NewTypeCategory').value;
    if(!name){el.querySelector('#p79OtStatus').textContent='請輸入加班類型名稱';return;}
     if(name===typeLabel.代){el.querySelector('#p79OtStatus').textContent='「休假代班加班」已從新增選項移除';return;}
    if(category==='代'||!types.includes(category)){el.querySelector('#p79OtStatus').textContent='請選擇新類型使用的工時計算方式';return;}
    if(typeOptions({[TYPECONFIG]:customTypes}).some(t=>t.name===name)){
     el.querySelector('#p79OtStatus').textContent='此加班類型已存在';return;
    }
    const standard=types.find(code=>typeLabel[code]===name);
    if(standard&&standard!==category){
     el.querySelector('#p79OtStatus').textContent='此名稱應選擇「'+typeLabel[standard]+'」作為適用假別';return;
    }
    customTypes.push([name,category]);el.querySelector('#p79NewTypeName').value='';
    renderAddedTypeList();renderRoleTypeDefaults();
    el.querySelector('#p79AddedTypeMessage').textContent='已新增「'+name+'」；請按最下方儲存後才會寫入雲端。';
   };
   el.querySelector('#p79AddedTypeMessage').parentElement.insertAdjacentHTML('afterend',
    '<section id="p79RoleTypeDefaultsPanel">'+
     '<div class="p79-ot-role-heading">職稱預設加班類型 <span style="color:#64748b;font-weight:400">（直接顯示）</span></div>'+
     '<p style="font-size:11px;color:#64748b;margin:4px 10px">依職稱建議加班類型；仍以正式班表與考勤為準，不會自動增加時數。</p>'+
     '<div id="p79RoleTypeDefaultsRows"></div>'+
    '</section>');
   function renderRoleTypeDefaults(){
    const panel=el.querySelector('#p79RoleTypeDefaultsRows');if(!panel)return;
    panel.replaceChildren();
    const employeeRoles=(global.p79OvertimeContext?.employees?.()||[]).map(reportEmployeeRole);
    const titles=[...new Set([...employeeRoles,...roleTypeDefaults.map(pair=>pair[0])].filter(Boolean))]
     .sort((a,b)=>a.localeCompare(b,'zh-Hant',{numeric:true}));
    if(!titles.length){panel.textContent='尚無職稱資料，請先確認人資資料已載入。';return;}
    const activeNames=typeOptions({
     [TYPECONFIG]:customTypes,[DELETED_CONFIG]:[...removedBuiltinNames]
    },getRows()).map(row=>row.name);
    const enabled=['平日延時加班','休息日加班'].filter(name=>activeNames.includes(name));
    for(const title of titles){
     const line=document.createElement('div');
     line.style.cssText='display:grid;grid-template-columns:minmax(90px,1fr) minmax(150px,1fr);align-items:center;gap:8px';
     const name=document.createElement('span');name.textContent=title;name.style.cssText='font-size:13px;font-weight:700';
     const pick=document.createElement('select');pick.style.cssText=inputStyle+';width:100%';
     pick.setAttribute('aria-label',title+'的預設加班類型');
     const current=roleTypeDefaults.find(pair=>pair[0]===title)?.[1]||'';
     const choices=[['','依班表判斷'],...enabled.map(type=>[type,type])];
     if(current&&!enabled.includes(current))choices.push([current,current+'（已停用，暫不帶入）']);
     for(const [value,label] of choices){
      const option=document.createElement('option');option.value=value;option.textContent=label;pick.append(option);
     }
     pick.value=current;
     pick.disabled=!cloudReady||reading||!global.p79OvertimeContext?.canEditRules?.();
     pick.onchange=()=>{
      if(!cloudReady||reading||!global.p79OvertimeContext?.canEditRules?.())return;
      roleTypeDefaults=roleTypeDefaults.filter(pair=>pair[0]!==title);
      if(pick.value)roleTypeDefaults.push([title,pick.value]);
      roleTypeDefaults.sort((a,b)=>a[0].localeCompare(b[0],'zh-Hant',{numeric:true}));
      el.querySelector('#p79OtStatus').textContent='已暫存「'+title+'」職稱的加班建議，請按最下方儲存。';
     };
     line.append(name,pick);panel.append(line);
    }
   }
   renderRoleTypeDefaults();
   // Row type and accounting category are fixed; no dropdown selection required.
   body.addEventListener('change',e=>{
     if(!e.target.matches('select[data-col="0"]'))return;
     const tr=e.target.closest('tr'),previous=tr.dataset.otCategory,next=e.target.value;
     tr.dataset.otCategory=next;
     const name=tr.querySelector('[data-col="9"]');
     if(name&&(!name.value.trim()||canonicalType(name.value)===typeLabel[previous]))name.value=typeLabel[next];
     if(previous!==next){
      if(next==='延'){
       tr.querySelector('[data-col="4"]').value='08';tr.querySelector('[data-col="5"]').value='16';
       tr.querySelector('[data-col="8"]').value='after';
      }else{
       tr.querySelector('[data-col="4"]').value='';tr.querySelector('[data-col="5"]').value='';
       tr.querySelector('[data-col="8"]').value='full';
      }
     }
    });
    body.addEventListener('click',e=>{
     if(!cloudReady||!global.p79OvertimeContext?.canEditRules?.())return;
     const button=e.target.closest('.p79OtDelete');if(!button)return;
     const tr=button.closest('tr'),period=tr.querySelector('[data-col="1"]')?.value||'';
     if(!global.confirm('確定刪除加班時段「'+period+'」？按下方儲存後將停止新申報使用，過去正式申報紀錄不受影響。'))return;
     tr.remove();rowDeletionConfirmed=true;refreshRuleCount();
     el.querySelector('#p79OtStatus').textContent='已移除時段「'+period+'」，請按最下方儲存以同步雲端。';
    });
   el.querySelector('#p79OtStatus').textContent=rows.length?'已顯示本機保存的選項（尚未核對雲端），正在確認…':'選項視窗已開啟，正在確認雲端資料…';
   el.querySelector('#p79OtAdd').onclick=()=>{
    if(!customTypes.length){
     el.querySelector('#p79OtStatus').textContent='請先在上方新增至少一種加班類型，再建立出勤時段。';
     el.querySelector('#p79NewTypeName').focus();return;
    }
    const choices=typeOptions({[TYPECONFIG]:customTypes,[DELETED_CONFIG]:[...removedBuiltinNames]},getRows()),form=dialog('新增出勤時段','<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0"><label>加班類型<select id="p79PeriodType" style="'+inputStyle+'">'+choices.map((x,i)=>'<option value="'+i+'">'+esc(x.name)+'</option>').join('')+'</select></label><label>出勤時段名稱<input id="p79PeriodCode" placeholder="例如：休08-16、延16-20" style="'+inputStyle+'"></label>'+['正常起','正常迄','加班起','加班迄'].map((label,i)=>'<label>'+label+'<select id="p79PeriodTime'+i+'" style="'+inputStyle+'">'+Array.from({length:25},(_,h)=>'<option value="'+String(h).padStart(2,'0')+'">'+String(h).padStart(2,'0')+'</option>').join('')+'</select></label>').join('')+'<label>加班位置<select id="p79PeriodPosition" style="'+inputStyle+'"><option value="full">整段加班</option><option value="after">正常班後加班</option><option value="before">正常班前加班</option></select></label><label>實際加班時數<input id="p79PeriodActual" type="number" step="0.01" style="'+inputStyle+'"></label><label>換算加班時數<input id="p79PeriodConverted" type="number" step="0.01" style="'+inputStyle+'"></label></div><p id="p79PeriodMessage"></p><button id="p79PeriodAdd" type="button" style="background:#0369a1;color:white;padding:10px;border-radius:8px">加入出勤時段</button>','p79OvertimePeriodDialog');
    [8,16,8,16].forEach((h,i)=>form.querySelector('#p79PeriodTime'+i).value=String(h).padStart(2,'0'));form.querySelector('#p79PeriodActual').value='8';
    form.querySelector('#p79PeriodAdd').onclick=()=>{try{
     const chosen=choices[Number(form.querySelector('#p79PeriodType').value)],times=[0,1,2,3].map(i=>form.querySelector('#p79PeriodTime'+i).value),position=form.querySelector('#p79PeriodPosition').value;
     const code=form.querySelector('#p79PeriodCode').value.trim()||(chosen.category+times[2]+'-'+times[3]);
     const row=[chosen.category,code,form.querySelector('#p79PeriodActual').value,form.querySelector('#p79PeriodConverted').value,...(chosen.category==='延'?times.slice(0,2):['','']),...times.slice(2),position,chosen.name];
     validate([...getRows(),row]);body.insertAdjacentHTML('afterbegin',editorRow(row,[...removedBuiltinNames]));refreshRuleCount();form.close();el.querySelector('#p79OtStatus').textContent='已加入「'+chosen.name+'／'+code+'」，請按儲存。';
    }catch(error){form.querySelector('#p79PeriodMessage').textContent=error.message}};
   };
   el.querySelector('#p79OtExport').onclick=async()=>{try{
    const x=await ensureExcel(),wb=x.utils.book_new();x.utils.book_append_sheet(wb,x.utils.aoa_to_sheet(excelRows(getRows())),'加班選項');x.writeFile(wb,'加班換算表.xlsx');
   }catch(error){el.querySelector('#p79OtStatus').textContent='❌ '+error.message}};
   el.querySelector('#p79OtImport').onclick=()=>{if(cloudReady)el.querySelector('#p79OtImportFile').click()};
   el.querySelector('#p79OtImportFile').onchange=async event=>{try{
    if(!cloudReady)throw Error('請先確認雲端資料');const file=event.target.files?.[0];if(!file)return;
    const x=await ensureExcel(),wb=x.read(await file.arrayBuffer(),{type:'array'}),sheet=wb.Sheets['加班選項']||wb.Sheets[wb.SheetNames[0]];
    const imported=parseExcelRows(x.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false}));
    if(!imported.length)throw Error('試算表沒有加班選項，未覆蓋原表');
    rows=validate(imported);
     customTypes=[...new Map([...customTypes,...rows.map(row=>[ruleType(row),row[0]])].map(pair=>[pair[0],pair])).values()];
     renderAddedTypeList();body.innerHTML=rows.map(row=>editorRow(row)).join('');refreshRuleCount();renderRoleTypeDefaults();
    el.querySelector('#p79OtStatus').textContent='已匯入'+rows.length+'筆，請核對後按儲存。';
   }catch(error){el.querySelector('#p79OtStatus').textContent='❌ '+error.message}finally{event.target.value=''}};
   el.querySelector('#p79OtSave').onclick=async()=>{
    const b=el.querySelector('#p79OtSave');if(b.disabled||!cloudReady||saving)return;
    saving=true;setReady(false);
    try{
     const draft=validate(getRows());
     // Old cloud rows may have both named/builtin identities for one visible
     // type/code. Preserve them until the admin chooses which one to keep;
     // never newly activate both in official filing by accident.
     const visiblePeriods=new Set();
     for(const row of draft){
      const key=canonicalType(ruleType(row))+'|'+row[1];
      if(visiblePeriods.has(key))throw Error('加班類型「'+ruleType(row)+'」的出勤時段「'+row[1]+'」重複；請核對實際與換算時數，刪除多餘的一列再儲存。');
      visiblePeriods.add(key);
     }
     const fresh=await loadRules();
     if(!draft.length&&!customTypes.length&&fresh.rows.length&&
        loadedVisibleRows==='[]'&&loadedTypes==='[]'&&!rowDeletionConfirmed)
      throw Error('雲端仍保留舊換算時段，不能以空白設定覆蓋。請直接核對表格中的「歷史保留」列。');
     const enabledNames=new Set(customTypes.map(pair=>canonicalType(pair[0])));
     const deleted=types.map(code=>typeLabel[code]).filter(name=>!enabledNames.has(name));
     const rolesDraft=normalizeRoleTypeDefaults({[ROLE_DEFAULTS_CONFIG]:roleTypeDefaults});
     // Never overwrite newer changes from another administrator.
     if(JSON.stringify(fresh.rows)!==loadedRows)throw Error('加班時段已由其他人修改，請重新載入核對');
     if(JSON.stringify(fresh.config[TYPECONFIG]||[])!==loadedTypes)throw Error('加班類型已由其他人修改，請重新載入核對');
     if(JSON.stringify([...deletedBuiltins(fresh.config)])!==loadedDeleted)throw Error('加班類型刪除狀態已變更，請重新載入核對');
     if(JSON.stringify(fresh.config[ARCHIVED_CONFIG]||[])!==loadedArchived)throw Error('歷史加班規則已由其他人修改，請重新載入核對');
     if(JSON.stringify(fresh.config[HIDDEN_MANAGER_RULES]||[])!==loadedHidden)throw Error('可刪除時段清單已由其他管理員變更，請重新讀取雲端');
     if(JSON.stringify(normalizeRoleTypeDefaults(fresh.config))!==loadedRoleDefaults)
      throw Error('職稱預設加班類型已由其他管理員變更，請重新讀取雲端核對');
     // Keep original cloud conversion rules for historical report validation;
     // withdrawn categories and periods are archived, never new filing choices.
     const draftKeys=new Set(draft.map(ruleKey));
     const archived=fresh.rows.filter(row=>!draftKeys.has(ruleKey(row)));
     const archiveKeys=[...new Set(archived.map(ruleKey))];
     const hiddenManagerKeys=[...new Set([...(fresh.config[HIDDEN_MANAGER_RULES]||[]),...archiveKeys])];
     const nextRows=validate([...draft,...archived]);
     const config={...fresh.config,[CONFIG]:nextRows,[TYPECONFIG]:customTypes,[DELETED_CONFIG]:deleted,
      [ARCHIVED_CONFIG]:archiveKeys,[ROLE_DEFAULTS_CONFIG]:rolesDraft,[HIDDEN_MANAGER_RULES]:hiddenManagerKeys};
     if(new TextEncoder().encode(JSON.stringify(config)).length>8800)
      throw Error('雲端設定已達安全容量上限，尚未變更；請先保留原設定並聯絡管理員');
     if(!Object.prototype.hasOwnProperty.call(fresh.config,CONFIG)||
        !Object.prototype.hasOwnProperty.call(fresh.config,TYPECONFIG)||
        !Object.prototype.hasOwnProperty.call(fresh.config,DELETED_CONFIG)||
        JSON.stringify(fresh.rows)!==JSON.stringify(nextRows)||
        JSON.stringify(fresh.config[TYPECONFIG]||[])!==JSON.stringify(customTypes)||
        JSON.stringify([...deletedBuiltins(fresh.config)])!==JSON.stringify(deleted)||
        JSON.stringify(fresh.config[ARCHIVED_CONFIG]||[])!==JSON.stringify(archiveKeys)||
        JSON.stringify(fresh.config[HIDDEN_MANAGER_RULES]||[])!==JSON.stringify(hiddenManagerKeys)||
        JSON.stringify(normalizeRoleTypeDefaults(fresh.config))!==JSON.stringify(rolesDraft))
      await rpc('saveConfig',{config});
     const check=await loadRules();
     if(JSON.stringify(check.rows)!==JSON.stringify(nextRows)||
        JSON.stringify(check.config[TYPECONFIG]||[])!==JSON.stringify(customTypes)||
        JSON.stringify([...deletedBuiltins(check.config)])!==JSON.stringify(deleted)||
        JSON.stringify(check.config[ARCHIVED_CONFIG]||[])!==JSON.stringify(archiveKeys)||
        JSON.stringify(check.config[HIDDEN_MANAGER_RULES]||[])!==JSON.stringify(hiddenManagerKeys)||
        JSON.stringify(normalizeRoleTypeDefaults(check.config))!==JSON.stringify(rolesDraft))
      throw Error('加班選項及職稱對應雲端讀回不一致，請保留畫面供核對');
     loadedRows=JSON.stringify(check.rows);
     loadedTypes=JSON.stringify(check.config[TYPECONFIG]||[]);
     loadedTypeDraft=JSON.stringify(customTypes);
     loadedDeleted=JSON.stringify([...deletedBuiltins(check.config)]);
     loadedArchived=JSON.stringify(check.config[ARCHIVED_CONFIG]||[]);
     loadedHidden=JSON.stringify(check.config[HIDDEN_MANAGER_RULES]||[]);
     removedBuiltinNames=new Set(deleted);
     roleTypeDefaults=normalizeRoleTypeDefaults(check.config);
     loadedRoleDefaults=JSON.stringify(roleTypeDefaults);
     loadedVisibleRows=JSON.stringify(draft);
     allCloudRows=check.rows;
     const current=global.p79OvertimeContext?.config?.();if(current)Object.assign(current,check.config);
     try{global.p79OvertimeContext?.persistConfig?.();}catch(error){console.warn('雲端已保存，本機快取更新失敗',error);}
     global.dispatchEvent?.(new CustomEvent('p79-overtime-options-saved'));
     rows=managerVisibleRules(check.rows,check.config);
     body.innerHTML=rows.map(row=>editorRow(row)).join('');
     rowDeletionConfirmed=false;refreshRuleCount();renderAddedTypeList();renderRoleTypeDefaults();
     const activeCount=activeReportRows(check.rows,check.config).length;
     el.querySelector('#p79OtStatus').textContent='✅ 已將 '+draft.length+' 筆加班時段寫入雲端，目前可供新申報 '+activeCount+' 筆。已刪除的時段不會再出現，原有申報歷史仍保留。';
    }catch(e){el.querySelector('#p79OtStatus').textContent='❌ '+e.message;}finally{saving=false;setReady(true);renderAddedTypeList();}
   };
   const setReady=ready=>{
    cloudReady=ready;
    ['p79OtAdd','p79AddType','p79OtSave','p79OtImport'].forEach(id=>el.querySelector('#'+id).disabled=!ready);
    body.querySelectorAll('input,select,button').forEach(input=>input.disabled=!ready);
    el.querySelectorAll('.p79OtDeleteType').forEach(button=>button.disabled=!ready||!global.p79OvertimeContext?.canEditRules?.());
    el.querySelectorAll('#p79RoleTypeDefaultsRows select').forEach(select=>
     select.disabled=!ready||!global.p79OvertimeContext?.canEditRules?.());
    
   };
   recoverButton.onclick=()=>{
    if(!cloudReady||saving||reading||!recoveryDraft||!global.p79OvertimeContext?.canEditRules?.())return;
    if(!global.confirm('找到這台電腦先前已儲存的加班規則 '+recoveryDraft.rows.length+' 筆。\\n要先載入畫面供核對嗎？\\n此操作不會寫入雲端，確認規則與換算時數後，仍須按下方「儲存加班類型與出勤時段」。'))return;
    rows=validate(recoveryDraft.rows);customTypes=recoveryDraft.types.map(pair=>pair.slice());
    roleTypeDefaults=recoveryDraft.roleDefaults.map(pair=>pair.slice());
    body.innerHTML=rows.map(row=>editorRow(row)).join('');
    refreshRuleCount();renderAddedTypeList();renderRoleTypeDefaults();
    recoverButton.hidden=true;recoveryDraft=null;
    el.querySelector('#p79OtStatus').textContent='已從這台電腦載入 '+rows.length+' 筆舊加班時段（尚未寫入雲端）。請逐筆核對換算時數，再按下方原有「儲存加班類型與出勤時段」。';
   };
   const reload=async()=>{
    if(reading)return;
    let dirty=false;try{dirty=cloudReady&&(
     JSON.stringify(validate(getRows()))!==loadedVisibleRows||
     JSON.stringify(customTypes)!==loadedTypeDraft||
     JSON.stringify(roleTypeDefaults)!==loadedRoleDefaults);}catch(error){el.querySelector('#p79OtStatus').textContent='修改內容尚未通過驗證：'+error.message+'；請先修正或匯出，未重新載入。';return;}
    if(dirty){
     el.querySelector('#p79OtStatus').textContent='有尚未儲存的修改，請先儲存或匯出；未重新載入覆蓋你的內容。';return;
    }
    reading=true;setReady(false);el.querySelector('#p79OtReload').disabled=true;
    try{
     const loaded=await loadRules();if(!el.isConnected)return;
     loadedRows=JSON.stringify(validate(loaded.rows));
     removedBuiltinNames=new Set(types.map(code=>typeLabel[code]).filter(name=>!typeOptions(loaded.config).some(t=>t.name===name)));
     loadedDeleted=JSON.stringify([...deletedBuiltins(loaded.config)]);
     loadedArchived=JSON.stringify(loaded.config[ARCHIVED_CONFIG]||[]);
     loadedHidden=JSON.stringify(loaded.config[HIDDEN_MANAGER_RULES]||[]);
     roleTypeDefaults=normalizeRoleTypeDefaults(loaded.config);
     loadedRoleDefaults=JSON.stringify(roleTypeDefaults);
     allCloudRows=loaded.rows;
     rows=managerVisibleRules(Object.prototype.hasOwnProperty.call(loaded.config,CONFIG)?loaded.rows:[],loaded.config);
     customTypes=typeOptions(loaded.config,loaded.rows).map(t=>[t.name,t.category]);
     loadedTypes=JSON.stringify(loaded.config[TYPECONFIG]||[]);
     loadedTypeDraft=JSON.stringify(customTypes);
     loadedVisibleRows=JSON.stringify(validate(rows));
     recoveryDraft=recoverableOvertimeOptions(loaded.config);
     recoverButton.hidden=!recoveryDraft||!global.p79OvertimeContext?.canEditRules?.();
     body.innerHTML=rows.map(row=>editorRow(row)).join('');
     refreshRuleCount();
     renderAddedTypeList();renderRoleTypeDefaults();
     if(cached){for(const key of [CONFIG,TYPECONFIG,DELETED_CONFIG,ARCHIVED_CONFIG,ROLE_DEFAULTS_CONFIG,HIDDEN_MANAGER_RULES])if(!Object.prototype.hasOwnProperty.call(loaded.config,key))delete cached[key];Object.assign(cached,loaded.config);}
     try{global.p79OvertimeContext?.persistConfig?.();}catch(error){console.warn('加班選項本機快取未更新',error);}
     global.dispatchEvent?.(new CustomEvent('p79-overtime-options-saved'));
     const activeRows=activeReportRows(loaded.rows,loaded.config);
     const activeKeys=new Set(activeRows.map(ruleKey));
     const enabledNames=new Set(typeOptions(loaded.config).map(t=>t.name));
     const archivedVisible=rows.filter(row=>enabledNames.has(ruleType(row))&&!activeKeys.has(ruleKey(row))).length;
     setReady(true);el.querySelector('#p79OtStatus').textContent=rows.length?
      '已讀取雲端 '+rows.length+' 筆加班時段｜可供新申報 '+activeRows.length+' 筆'+
      (archivedVisible?'｜其中 '+archivedVisible+' 筆仍封存。若要重新開放，請核對表格內容並按最下方「儲存加班類型與出勤時段」。':'')+
      '；原換算時數會保留。':
      recoveryDraft?'⚠ 雲端目前回傳零筆加班類型與時段，但這台電腦找到 '+recoveryDraft.rows.length+' 筆先前已儲存的時段。可選「找回本機舊加班設定」核對後再儲存；不會自行覆蓋雲端。':
      '⚠ 雲端沒有回傳可編輯的加班時段，且此瀏覽器尚無可核對的舊設定備份。請勿用空白表格覆蓋；需檢查 Apps Script 正式設定來源。';
    }catch(error){el.querySelector('#p79OtStatus').textContent='❌ '+error.message+'。目前內容尚未核對，不會用它覆蓋雲端。';}
    finally{reading=false;el.querySelector('#p79OtReload').disabled=false;}
   };
   el.querySelector('#p79OtReload').onclick=reload;
   await reload();
  }catch(e){el.querySelector('#p79OtStatus').textContent='❌ '+e.message}
 }
 function approvedLeaveDateChoices(records,employeeId){
  const id=String(employeeId||'').trim().toUpperCase();
  if(!id)return [];
  const dates=new Set();
  const normalize=value=>{
   const match=String(value||'').trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
   if(!match)return '';
   const iso=match[1]+'-'+match[2].padStart(2,'0')+'-'+match[3].padStart(2,'0');
   const dt=new Date(iso+'T12:00:00Z');
   return Number.isFinite(dt.getTime())&&dt.toISOString().slice(0,10)===iso?iso:'';
  };
  for(const leave of Array.isArray(records)?records:[]){
   if(String(leave?.empId||'').trim().toUpperCase()!==id||!['已核准','已核準'].includes(leave?.status))continue;
   const first=normalize(leave.startTime||leave.startDate),last=normalize(leave.endTime||leave.endDate||leave.startTime||leave.startDate);
   if(!first||!last||last<first)continue;
   const span=(Date.parse(last+'T12:00:00Z')-Date.parse(first+'T12:00:00Z'))/86400000;
   if(span>366)continue;
   for(let d=new Date(first+'T12:00:00Z'),end=last;d.toISOString().slice(0,10)<=end;d.setUTCDate(d.getUTCDate()+1))dates.add(d.toISOString().slice(0,10));
  }
  return [...dates].sort();
 }
 function validateLeaveLinkedOvertimeDate(date,forEmpId,allowedDates,handoffDate=''){
  if(handoffDate){
   if(date!==handoffDate)throw Error('請假代班申報日期不可變更；原請假／代班日期是 '+handoffDate+'，請重新從請假紀錄開啟。');
   return;
  }
  if(!forEmpId)return;
  if(!allowedDates.length)throw Error('無法核對這位請假人員的已核准請假日期，請先從請假系統選擇正確日期，不可用今天直接申報。');
  if(!allowedDates.includes(date))throw Error('加班日期 '+date+' 與請假人員的已核准請假日不符。請從「請假日期」選擇：'+allowedDates.join('、'));
 }
 function reportPair(category,empId,forEmpId,people){
  if(category!=='代'&&category!=='延')return {forEmpId:'',forName:''};
  if(category==='延'&&!String(forEmpId||'').trim())return {forEmpId:'',forName:''};
  const target=people.find(e=>String(e.empId)===String(forEmpId));
  if(!target||String(forEmpId)===String(empId))throw Error('請選擇另一位有效的請假人員');
  return {forEmpId:String(target.empId),forName:String(target.name||'')};
 }
 function advanceLeaveHandoff(draft){
  if(!draft.leaveHandoffId)return null;
  const key='port79_leave_overtime_handoff_v1',handoff=JSON.parse(sessionStorage.getItem(key)||'null');
  if(!handoff||!Array.isArray(handoff.entries))return null;
  // 每天每位代班員工各有請假關聯 ID，不能只與佇列第一筆比對。
  const index=handoff.entries.findIndex(e=>String(e.leaveId||handoff.id)===String(draft.leaveHandoffId)&&String(e.empId)===String(draft.empId)&&e.date===draft.date&&String(e.forEmpId||'')===String(draft.forEmpId||''));
  if(index<0)return null;
  handoff.entries.splice(index,1);
  if(handoff.entries.length)sessionStorage.setItem(key,JSON.stringify(handoff));else sessionStorage.removeItem(key);
  return {remaining:handoff.entries.length};
 }
 // Match the currently selected overtime TYPE to complete official punches.
 // Never substitute the first period (often 08-16) for a 24-08 employee.
 function matchingReportPeriod(date,roster,attendance,rows,type){
  const start=Number(attendance?.start),end=Number(attendance?.end);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))||
     !attendance||!Number.isFinite(start)||!Number.isFinite(end)||
     start<=0||end<=start||end-start>18*3600000||!type||!Array.isArray(rows))return null;
  const eligible=rows.filter(r=>matchesReportType(r,type));
  if(!eligible.length)return null;
  const matched=inferRule(start,end,date,eligible);
  if(!matched||ruleAttendanceIssue(start,end,date,matched,roster||null))return null;
  return matched;
 }
 // An official roster shift establishes the NORMAL shift, not overtime.
 // Never create overtime hours or cloud rules merely from a future schedule.
 function officialOvertimeTypeHint(shift,category,hasRules){
  const shiftHours={早:'08-16',中:'16-24',晚:'24-08'};
  const work=Object.prototype.hasOwnProperty.call(shiftHours,shift);
  const rest=['休','例','國'].includes(shift);
  const categoryName=typeLabel[category]||'目前加班類型';
  const prefix=work?'正式班表：'+shift+'班（'+shiftHours[shift]+'）。':
    rest?'正式班表：'+shift+'。':shift?'正式班表：'+shift+'。':'正式班表沒有可核對的班別。';
  if(work&&['休','例','國'].includes(category))
    return prefix+' 當天不是'+categoryName+'，不能自動帶入休息日出勤時段；如有班前／班後加班，請核對實際時段與申報類型。';
  if(rest&&category==='延')
    return prefix+' 當天不是一般工作班，無法由正常班推算平日延時加班。';
  if(!hasRules)return prefix+' 雲端目前沒有這個加班類型的出勤時段規則，請由授權管理員核對設定。';
  if(work&&category==='延')
    return prefix+' 正常班不是加班時數；班前或班後延長時段須另行確認，不能自動當成已出勤。';
  if(rest&&['休','例','國'].includes(category))
    return prefix+' 已有可選的加班規則；實際加班起迄時間仍需確認，不能只靠排休自動產生。';
  return prefix+' 請依已核准代班、預排或完成的上下班打卡核對加班時段。';
 }
 function showReportLoading(){const el=dialog('申報加班','<p id="p79OtStatus">正在同時核對代班安排與加班選項…</p>');el.onclose=()=>el.remove();return el;}
 async function openReport(prefill={}){
  const loading=showReportLoading();
  try{
   if((!global.p79OvertimeContext?.canReport?.()||!global.p79OvertimeContext?.employees?.().length)&&global.p79OvertimeContext?.refreshAccess)await global.p79OvertimeContext.refreshAccess();
   if(loading.isConnected===false)return;
   if(!global.p79OvertimeContext?.canReport?.()){loading.remove?.();return alert('沒有申報加班權限');}
  }catch(error){loading.querySelector('#p79OtStatus').textContent='人員載入失敗：'+error.message;return;}
  const editingOriginal=Boolean(prefill.lockOriginal&&prefill.savedReport&&prefill.reportId);
  const el=dialog(editingOriginal?'修改加班申報':prefill.manualPlan===true?'新增預排（未正式申報）':'申報加班','<p id="p79OtStatus">正在讀取加班換算表…</p>');
  try{
   // Leave-handoff snapshots can lack authoritative archive flags. Reuse
   // only a recent getOvertimeConfig read; the final save rereads current data.
   const preverified=prefill.verifiedOvertimeRules,credentials=auth();
   const verifiedFresh=!!(preverified?.source==='getOvertimeConfig'&&
    Number(preverified.checkedAt)>0&&Date.now()-Number(preverified.checkedAt)>=0&&
    Date.now()-Number(preverified.checkedAt)<10000&&
    preverified.token===credentials.token&&preverified.url===credentials.url&&
    preverified.config&&typeof preverified.config==='object'&&Array.isArray(preverified.rows));
   const latestRules=verifiedFresh?
    {config:preverified.config,rows:validate(preverified.rows)}:await loadRules();
   syncCloudOvertimeConfig(latestRules.config);
   const extra=[],window=prefill.attendance&&declarationWindow(prefill.attendance.start,prefill.attendance.end,prefill.date,prefill.roster);
   if(window&&window.minutes>0){const hour=new Date(window.start+8*3600000).getUTCHours();extra.push([hour||24,window.minutes/60]);}
   // Open new filings with ACTIVE rules only; historical rules stay in the
   // cloud for audit and are not automatically offered as new submissions.
   const historicalRule=prefill.savedReport?latestRules.rows.find(row=>
    String(row[0])===String(prefill.category||'')&&String(row[1])===String(prefill.code||'')):null;
   const dialogRuleConfig=()=>global.p79OvertimeContext.config();
   const reportRowsForDialog=source=>activeReportRows(source,dialogRuleConfig());
   let rows=specialRows(reportRowsForDialog(latestRules.rows),dialogRuleConfig(),extra);
   let cloudRuleSource=latestRules.rows;
   if(prefill.attendance&&prefill.roster&&!prefill.savedReport){
    const kinds=global.P79SpecialOvertime?.forShift(prefill.attendance.start,prefill.attendance.end)||[];
    const special=kinds.flatMap(p=>p.kinds).filter(k=>['颱','選'].includes(k.code));
    if(special.length){const inferred=suggestRule(prefill.attendance.start,prefill.attendance.end,prefill.date,prefill.roster,rows,special);if(inferred)prefill={...prefill,code:inferred[1],category:inferred[0],preferredType:ruleType(inferred),requirePeriodSelection:false};}
   }
   // Preserve existing formal reports and explicit future plans. New reports
   // use the verified IN/OUT period within the requested overtime type.
   if(!prefill.savedReport&&!prefill.manualPlan&&prefill.attendance&&prefill.date){
    const requestedType=canonicalType(prefill.preferredType)||typeLabel[prefill.category]||'';
    const matched=matchingReportPeriod(prefill.date,prefill.roster,prefill.attendance,rows,requestedType);
    if(matched)prefill={...prefill,code:matched[1],category:matched[0],
      preferredType:ruleType(matched),requirePeriodSelection:false};
   }
   const people=global.p79OvertimeContext.employees();
   el.insertAdjacentHTML('beforeend','<div class="p79-report-grid"><label>加班類型<select id="p79OtKind" style="'+inputStyle+'"></select></label><label>加班日期<input id="p79OtDate" type="date" style="'+inputStyle+'"></label><label id="p79OtLeaveDatesWrap" style="display:none">請假日期（依核准紀錄）<select id="p79OtLeaveDates" style="'+inputStyle+'"></select></label><label id="p79OtForWrap">請假人員<select id="p79OtForEmp" style="'+inputStyle+'"></select></label><label>職稱<select id="p79OtRole" style="'+inputStyle+'"></select></label><label>代班／加班人員<select id="p79OtEmp" style="'+inputStyle+'"></select></label><label>出勤時段<select id="p79OtCode" style="'+inputStyle+'"></select></label><label>備註<input id="p79OtNote" maxlength="200" style="'+inputStyle+'"></label></div><div id="p79OtPreview" style="padding:8px;border-radius:8px"></div><p style="font-size:12px;color:#64748b;margin:4px 0">每位人員分別儲存一筆；儲存後可切換下一位人員繼續申報。</p><button id="p79OtStage" type="button" style="background:#0369a1;color:white;padding:9px 16px;border-radius:8px">儲存加班申報</button>');
   el.querySelector('#p79OtDate').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
    // Explicit hand-picked monthly plans require the operator to enter a date.
    // Never silently use today for an employee whose future day is undecided.
    if(prefill.manualPlan===true&&prefill.pickDateExplicitly===true)el.querySelector('#p79OtDate').value='';
   const forSelect=el.querySelector('#p79OtForEmp'),empSelect=el.querySelector('#p79OtEmp');
   const dateInput=el.querySelector('#p79OtDate'),leaveDateSelect=el.querySelector('#p79OtLeaveDates'),leaveDateWrap=el.querySelector('#p79OtLeaveDatesWrap');
   const leaveRecords=global.p79OvertimeContext?.approvedLeaves?.()||[];
   let approvedDates=[];
   const stroke=new Intl.Collator('zh-TW-u-co-stroke',{numeric:true});
   const sortedPeople=[...people].sort((a,b)=>stroke.compare(String(a.name||''),String(b.name||''))||String(a.empId).localeCompare(String(b.empId)));
   const sorted=()=>sortedPeople;
   const roleSelect=el.querySelector('#p79OtRole');
   const roleOf=reportEmployeeRole;
   const roles=[...new Set(sortedPeople.map(roleOf))].sort((a,b)=>stroke.compare(a,b));
   roleSelect.innerHTML='<option value="">全部職稱</option>'+roles.map(role=>'<option value="'+esc(role)+'">'+esc(role)+'</option>').join('');
   forSelect.innerHTML='<option value="">請選擇請假人員</option>'+sorted().map(e=>'<option value="'+esc(e.empId)+'">'+esc(e.name+'（'+e.empId+'）'+(e.dept?'｜'+e.dept:''))+'</option>').join('');
   function refreshPairPeople(){
    const rule=selectedRow(),target=people.find(e=>String(e.empId)===String(forSelect.value)),previous=empSelect.value;
    const allowed=prefill.allowedEmpIds?.length?prefill.allowedEmpIds:prefill.leaveHandoffId?[prefill.empId]:null;
    const matches=sorted().filter(e=>(!roleSelect.value||roleOf(e)===roleSelect.value)&&(!allowed||allowed.some(id=>String(id)===String(e.empId)))&&(rule?.[0]!=='代'||target&&String(target.dept||'').trim()&&String(e.dept||'').trim()===String(target.dept||'').trim()&&String(e.empId)!==String(target.empId)));
    empSelect.innerHTML='<option value="">'+(rule?.[0]==='代'&&!target?'先選左邊請假人員':matches.length?'請選擇代班人員':'同部門沒有可代班人員')+'</option>'+matches.map(e=>'<option value="'+esc(e.empId)+'">'+esc(e.name+'（'+e.empId+'）')+'</option>').join('');
    if(matches.some(e=>String(e.empId)===previous))empSelect.value=previous;
   }
   const kind=el.querySelector('#p79OtKind'),select=el.querySelector('#p79OtCode');
   const matches=r=>matchesReportType(r,kind.value);
    // Empty placeholder is not row 0. Require an actual matching period.
    const selectedRow=()=>{
     const row=select.value!==''&&select.selectedIndex>=0?rows[Number(select.value)]:null;
     return row&&matches(row)?row:null;
    };
   // Read-only, short-lived monthly roster lookup. Changing employees/dates must
   // never reuse the last employee's inferred overtime selection.
   el.querySelector('#p79OtPreview').insertAdjacentHTML('afterend',
    '<p id="p79OtRosterHint" style="margin:4px 0;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:12px;color:#334155;background:#f8fafc"></p>');
   const rosterHint=el.querySelector('#p79OtRosterHint');
   rosterHint.insertAdjacentHTML('beforebegin',
    '<p id="p79OtRoleTypeHint" style="margin:4px 0;font-size:12px;color:#0369a1"></p>'+
    '<p id="p79OtPeriodAvailabilityHint" role="status" style="margin:4px 0;font-size:12px;color:#a16207"></p>');
   const roleTypeHint=el.querySelector('#p79OtRoleTypeHint');
   const officialMonthReads=new Map();
   let rosterHintEpoch=0,lastOfficialShift='',lastRosterDate='',lastRosterEmployee='',manuallySelectedType=false,manuallySelectedPeriod=false;
   const isExplicitPeriod=()=>editingOriginal||!!(prefill.savedReport||prefill.code||
     prefill.leaveHandoffId||prefill.attendance||prefill.lockOriginal);
   function matchesOfficialRosterPeriod(row){
    if(lastRosterDate!==dateInput.value||lastRosterEmployee!==empSelect.value||
       !lastOfficialShift||isExplicitPeriod())return true;
    const normal={早:['08','16'],中:['16','24'],晚:['24','08']}[lastOfficialShift];
    if(normal){
     if(['休','國','例'].includes(row[0]))return false;
     if(row[0]==='延')return hour(row[4])%1440===hour(normal[0])%1440&&
       hour(row[5])%1440===hour(normal[1])%1440;
    }
    if(['休','國','例'].includes(lastOfficialShift)&&row[0]==='延')return false;
    return true;
   }
   // A future plan is never evidence of attendance. For completed dates,
   // securely re-read this employee's actual cloud IN/OUT records; no new
   // report is created and neither stored roster nor punches are modified.
   async function officialPunchPeriodChoice(empId,date,shift){
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
    if(date>today)return null;
    const {url,token}=auth(),endpoint=new URL(url);
    for(const [key,value] of Object.entries({
     action:'getOvertimeReportContext',month:date.slice(0,7),empId,date,
     token,gcToken:token,_:String(Date.now())
    }))endpoint.searchParams.set(key,value);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    let data;
    try{
     const response=await fetch(endpoint.toString(),{cache:'no-store',signal:controller.signal});
     data=await response.json();
     if(!response.ok||data?.ok!==true||!Array.isArray(data.records))return null;
    }finally{clearTimeout(timer);}
    const dateStart=Date.parse(date+'T00:00:00+08:00');
    const canonTime=value=>{
     let raw=String(value||'').trim().split('/').join('-').replace(' ','T');
     if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{1,2}:[0-9]{2}/.test(raw))return NaN;
     if(!/[zZ]$|[+-][0-9]{2}:?[0-9]{2}$/.test(raw))raw+='+08:00';
     return Date.parse(raw);
    };
    const records=data.records.filter(row=>
     String(row.empId||'').trim().toUpperCase()===String(empId).trim().toUpperCase())
     .map(row=>({
      time:canonTime(row.timeStr),
      type:String(row.recordType||row.type||row.status||'').trim().toUpperCase()
     })).filter(row=>Number.isFinite(row.time));
    const isIn=row=>['IN','CLOCK_IN','上班','簽到'].includes(row.type);
    const isOut=row=>['OUT','CLOCK_OUT','下班','簽退'].includes(row.type);
    const starts=records.filter(row=>isIn(row)&&row.time>=dateStart&&row.time<dateStart+86400000);
    if(starts.length!==1)return null;
    const start=starts[0].time;
    const ends=records.filter(row=>isOut(row)&&row.time>start&&row.time-start<=18*3600000);
    if(ends.length!==1)return null;
    const end=ends[0].time;
    const matched=matchingReportPeriod(date,{[date]:shift},{start,end},rows,kind.value);
    if(!matched)return null;
    const candidates=rows.map((row,index)=>({row,index})).filter(({row})=>
     matches(row)&&matchesOfficialRosterPeriod(row)&&
     row[0]===matched[0]&&row[1]===matched[1]&&
     row[6]===matched[6]&&row[7]===matched[7]);
    return candidates.length===1?candidates[0]:null;
   }
   async function officialOvertimeRosterShift(empId,date){
    const {url,token}=auth(),month=date.slice(0,7),current=officialMonthReads.get(month);
    let entry=current;
    if(!entry||Date.now()-entry.at>15000){
     const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),16000);
     const promise=(async()=>{
      try{
       const endpoint=new URL(url);
       endpoint.searchParams.set('action','getScheduleDataSecure');
       endpoint.searchParams.set('gcToken',token);
       endpoint.searchParams.set('month',month);
       endpoint.searchParams.set('_',String(Date.now()));
       const response=await fetch(endpoint.toString(),{cache:'no-store',redirect:'follow',signal:controller.signal});
       if(!response.ok)throw Error('雲端班表讀取失敗');
       const data=await response.json();
       if(data?.ok!==true||!Array.isArray(data.schedules)||data.month&&String(data.month)!==month)
        throw Error('雲端班表資料尚未核對');
       return data.schedules;
      }finally{clearTimeout(timeout);}
     })();
     entry={at:Date.now(),promise};officialMonthReads.set(month,entry);
     promise.catch(()=>{if(officialMonthReads.get(month)===entry)officialMonthReads.delete(month);});
    }
    const cloudRows=await entry.promise,person=cloudRows.find(row=>
      String(row.empId||'').trim().toUpperCase()===String(empId||'').trim().toUpperCase());
    if(!person)return '';
    return String(person.schedule?.[date]??'').trim();
   }
   async function refreshOfficialRosterHint(){
    const epoch=++rosterHintEpoch;
    // Original reports and verified leave handoffs already carry their context.
    // Actual save still checks the newest cloud attendance and official roster.
    if(editingOriginal||prefill.leaveHandoffId){
     rosterHint.textContent=editingOriginal?
      '原申報將在正式儲存時重新核對最新打卡與班表。':
      '請假代班安排已核對；正式儲存時會重新核對雲端出勤及班表。';
     return;
    }
    if(!typeOptions(dialogRuleConfig(),rows).length){
     rosterHint.textContent='雲端尚未建立加班類型；請先在「加班選項管理」自行新增類型與出勤時段，班表不會自動建立加班。';
     return;
    }
    const date=String(dateInput.value||''),empId=String(empSelect.value||'');
    if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)||!empId){
     rosterHint.textContent='選擇人員及日期後，自動核對正式班別；排班不等於加班時數。';
     return;
    }
    rosterHint.textContent='正在核對 '+date+' 的正式班表…';
    try{
     const shift=await officialOvertimeRosterShift(empId,date);
     if(!el.isConnected||epoch!==rosterHintEpoch)return;
     lastOfficialShift=shift;lastRosterDate=date;lastRosterEmployee=empId;
     const allTypes=typeOptions(dialogRuleConfig(),rows);
     const employee=people.find(person=>String(person.empId)===String(empId));
     const rolePreset=preferredOvertimeTypeForRole(
      global.p79OvertimeContext?.config?.()||{},employee?reportEmployeeRole(employee):String(roleSelect.value||''),rows);
     // Never overwrite the configured job-title default with a roster guess.
     if(!isExplicitPeriod()&&!manuallySelectedType&&!prefill.preferredType&&!rolePreset){
      const suggested=['休','國','例'].includes(shift)?shift:
        ['早','中','晚'].includes(shift)?'延':'';
      const next=suggested?allTypes.find(option=>option.category===suggested):null;
      if(next)kind.value=next.name;
     }
     const category=allTypes.find(type=>type.name===kind.value)?.category||'';
     if(!isExplicitPeriod()){
      refresh();
      const choices=rows.map((row,index)=>({row,index}))
        .filter(({row})=>matches(row)&&matchesOfficialRosterPeriod(row));
      if(choices.length===1&&!manuallySelectedPeriod){
       select.value=String(choices[0].index);preview();
       rosterHint.textContent='正式班表 '+shift+'：已自動帶出唯一候選時段 '+displayPeriodCode(choices[0].row)+
         '；正式申報仍須符合完整實際打卡。';
      }else{
       // Do not reset a period manually selected during the async roster read.
       if(!manuallySelectedPeriod){select.value='';preview();}
       const available=rows.filter(matches).length;
       rosterHint.textContent=officialOvertimeTypeHint(shift,category,available>0)+
         (choices.length>1?' 已列出 '+choices.length+' 個正式班表相符的候選時段。':
          available&&!choices.length?' 已顯示雲端儲存的 '+available+' 個時段供核對，但無法由此班表自動選定。':'');
      }
     }else rosterHint.textContent=officialOvertimeTypeHint(shift,category,rows.some(matches));
     if(!isExplicitPeriod()&&!manuallySelectedPeriod){
      try{
       const attendanceMatch=await officialPunchPeriodChoice(empId,date,shift);
       if(el.isConnected&&epoch===rosterHintEpoch&&!manuallySelectedPeriod&&attendanceMatch){
        select.value=String(attendanceMatch.index);preview();
        rosterHint.textContent='已依正式上下班打卡自動帶入 '+displayPeriodCode(attendanceMatch.row)+
         '；請核對後再儲存，這不代表系統已自動核准加班。';
       }
      }catch(error){console.warn('正式打卡時段無法自動帶入，保留班表候選項目',error);}
     }
    }catch(error){
     if(!el.isConnected||epoch!==rosterHintEpoch)return;
     rosterHint.textContent='正式班表暫時無法即時核對，請勿把未確認的班別當作加班時數。';
    }
   }

   const findPrefill=(code,category)=>{const exact=rows.findIndex(r=>r[1]===code&&r[0]===category);if(exact>=0)return exact;if(category!=='延')return -1;const m=String(code||'').match(/(\d{2}(?::\d{2})?)-(\d{2}(?::\d{2})?)$/);if(!m)return -1;const candidates=rows.map((r,i)=>({r,i})).filter(({r})=>r[0]==='延'&&((hour(m[1])%1440===hour(r[6])%1440&&hour(m[2])%1440===hour(r[7])%1440)||(hour(m[1])%1440===hour(r[8]==='after'?r[4]:r[6])%1440&&hour(m[2])%1440===hour(r[8]==='after'?r[7]:r[5])%1440)));return candidates.length===1?candidates[0].i:-1;};
   const refresh=()=>{
    const previous=select.value;
    const choices=rows.map((row,index)=>({row,index}))
      .filter(({row})=>matches(row));
    const diagnostic=reportPeriodDiagnostic(cloudRuleSource,dialogRuleConfig(),kind.value);
    let reason='';
    if(!choices.length&&kind.value){
     if(diagnostic.archived)reason='雲端保留「'+kind.value+'」'+diagnostic.archived+
      ' 筆出勤時段，但目前是歷史封存，不開放新申報。管理員請至「加班選項管理」核對這些時段，按最下方「儲存加班類型與出勤時段」才會正式啟用；換算時數不變。';
     else if(diagnostic.deleted)reason='「'+kind.value+'」的 '+diagnostic.deleted+
      ' 筆時段已被管理員刪除／隱藏，系統不會自動恢復。';
     else if(diagnostic.otherNamed)reason='同一假別有 '+diagnostic.otherNamed+
      ' 筆其他加班類型名稱的時段，不能混用；請至加班選項管理核對類型名稱與時段。';
     else reason='雲端尚未儲存「'+kind.value+'」可供新申報的出勤時段，請至加班選項管理核對並儲存。';
    }
    const hintTarget=el.querySelector('#p79OtPeriodAvailabilityHint');
    if(hintTarget)hintTarget.textContent=reason;
    // Use the EXISTING refresh button for an explicit, scoped recovery when
    // all cloud periods for this active type are archived, not deleted.
    const refreshButton=el.querySelector('#p79OtReloadOptions');
    if(refreshButton){
     const canActivate=global.p79OvertimeContext?.canEditRules?.()&&
      diagnostic.configured&&diagnostic.archived>0&&diagnostic.active===0&&
      kind.value!==typeLabel.代;
     refreshButton.textContent=canActivate?
      '開放 '+diagnostic.archived+' 筆「'+kind.value+'」封存時段':'更新雲端時段選項';
    }
    // Display existing cloud periods even if roster cannot verify them.
    const hint=choices.length?'請選擇實際加班時段':diagnostic.archived?'此類型時段仍封存，尚未開放申報':!typeOptions(dialogRuleConfig(),rows).length?'請先新增加班類型及出勤時段':!kind.value?'請先選擇加班類型':'此類型尚未設定出勤時段';
    select.innerHTML='<option value="">'+hint+'</option>'+
      choices.map(({row,index})=>'<option data-ot-category="'+row[0]+'" value="'+index+'">'+
       esc(displayPeriodCode(row))+'</option>').join('');
    select.value=previous!==''&&choices.some(item=>String(item.index)===previous)?previous:'';
    preview();
   };
   function preview(){const r=selectedRow();const originalLocked=!!(prefill.lockOriginal&&prefill.savedReport&&prefill.reportId);for(const field of [kind,select,el.querySelector('#p79OtPreview')])field.setAttribute?.('data-ot-category',r?.[0]||'');refreshPairPeople();forSelect.disabled=originalLocked||!!prefill.leaveHandoffId||!['代','延'].includes(r?.[0]);empSelect.disabled=!!prefill.leaveHandoffId&&r?.[0]==='代'&&!(prefill.allowedEmpIds?.length>1);if(empSelect.disabled)empSelect.value=String(prefill.empId||'');el.querySelector('#p79OtForWrap').style.display=['代','延'].includes(r?.[0])?'flex':'none';if(prefill.leaveHandoffId||originalLocked)forSelect.value=String(prefill.forEmpId||'');else if(!['代','延'].includes(r?.[0]))forSelect.value='';el.querySelector('#p79OtPreview').textContent=r&&matches(r)?'出勤時段 '+displayPeriodCode(r)+(r[0]==='延'?'｜正常班 '+r[4]+'-'+r[5]:'')+'｜申報 '+r[2]+' 小時｜換算 '+(r[3]===''?'未設定':r[3]+' 小時'):(!typeOptions(dialogRuleConfig(),rows).length?'雲端尚未新增加班類型，請先按「＋新增／管理加班類型與時段」新增類型及時段':!kind.value?'請先選擇加班類型':rows.some(matches)?'尚未選定出勤時段，請核對班表或實際打卡':'此加班類型尚未建立出勤時段，請先到加班選項管理新增');if(r?.[0]==='代'){const worker=people.find(e=>String(e.empId)===String(empSelect.value)),target=people.find(e=>String(e.empId)===String(forSelect.value));el.querySelector('#p79OtPreview').textContent+='｜代班：'+(worker?.name||'未選擇')+'｜請假：'+(target?.name||'未選擇');}}
   const refreshTypes=()=>{const previous=kind.value,options=typeOptions(dialogRuleConfig(),rows);kind.innerHTML=(options.length?'':'<option value="">尚未新增任何加班類型</option>')+options.map(x=>'<option data-ot-category="'+x.category+'" value="'+esc(x.name)+'">'+esc(x.name)+'</option>').join('');if(options.some(x=>x.name===previous))kind.value=previous;refresh();};
   function syncApprovedLeaveDate(){
    const forId=String(forSelect.value||'');
    approvedDates=approvedLeaveDateChoices(leaveRecords,forId);
    const selectedRule=selectedRow();
    const originalExtensionReview=editingOriginal&&prefill.plannedReview===true&&!prefill.leaveHandoffId&&selectedRule?.[0]==='延';
    leaveDateWrap.style.display=forId&&['代','延'].includes(selectedRule?.[0])&&!originalExtensionReview?'flex':'none';
    leaveDateSelect.innerHTML='<option value="">'+(approvedDates.length?'請選核准請假日期':'沒有可核對的已核准請假日期')+'</option>'+approvedDates.map(d=>'<option value="'+d+'">'+d.replaceAll('-','/')+'</option>').join('');
    // 原申報的日期由已儲存申報鎖定；不得因另一人的核准請假資料未讀入而清空。
    // 不自動改選日期，也不改原先代班關聯。
    if(editingOriginal){
     dateInput.value=String(prefill.date||'');
     if(approvedDates.includes(dateInput.value))leaveDateSelect.value=dateInput.value;
     else leaveDateSelect.value='';
     return;
    }
    if(!forId)return;
    if(prefill.leaveHandoffId){
     dateInput.value=prefill.date||'';
     const originalLeaveDate=String(prefill.coverDate||dateInput.value);
     if(approvedDates.includes(originalLeaveDate))leaveDateSelect.value=originalLeaveDate;
     leaveDateSelect.disabled=true;
     return;
    }
    if(approvedDates.length===1){
     dateInput.value=approvedDates[0];leaveDateSelect.value=approvedDates[0];
     el.querySelector('#p79OtStatus').textContent='已自動帶入 '+approvedDates[0]+' 的已核准請假日期，請核對代班與出勤時段。';
    }else{
     // 不能拿今天當作請假日期：多筆日期必須由使用者明確選擇。
     if(approvedDates.includes(prefill.date)&&String(prefill.forEmpId||'')===forId){
      dateInput.value=prefill.date;leaveDateSelect.value=prefill.date;
     }else{dateInput.value='';leaveDateSelect.value='';}
     el.querySelector('#p79OtStatus').textContent=approvedDates.length?'這位員工有 '+approvedDates.length+' 個核准請假日期，請先選擇正確日期，再儲存。':'目前無法核對這位員工的已核准請假紀錄，請先到請假系統查詢，不可沿用今天。';
    }
   }
   function autoSelectPeriodForCurrentType(){
    // An old employee or date cannot provide evidence for the newly chosen row.
    if(!prefill.attendance||!prefill.date||dateInput.value!==prefill.date||
       String(empSelect.value)!==String(prefill.empId||''))return;
    const matched=matchingReportPeriod(prefill.date,prefill.roster,prefill.attendance,rows,kind.value);
    const index=matched?rows.findIndex(r=>r[0]===matched[0]&&r[1]===matched[1]&&matchesReportType(r,kind.value)):-1;
    if(index>=0)select.value=String(index);
    else{
     select.selectedIndex=-1;select.value='';
     el.querySelector('#p79OtStatus').textContent='這個加班類型沒有與正式上下班打卡相符的時段，請核對考勤或更新雲端時段選項。';
    }
    preview();
   }
   function suggestBySelectedRole(){
    const person=people.find(e=>String(e.empId)===String(empSelect.value));
    const title=person?reportEmployeeRole(person):String(roleSelect.value||'');
    const recommended=preferredOvertimeTypeForRole(
     global.p79OvertimeContext?.config?.()||{},title,rows);
    roleTypeHint.textContent=recommended?
      '職稱「'+title+'」預設建議：'+recommended+'；仍須依當日班表及實際加班核對。':
      title?'職稱「'+title+'」未設定預設加班類型，請依當日班表判斷。':'';
    const explicit=!!(prefill.savedReport||prefill.leaveHandoffId||
      prefill.preferredType||prefill.lockOriginal||(prefill.attendance&&prefill.code));
    // For a new report, an inferred category (休/延) is not an explicit choice.
    if(!recommended||explicit||editingOriginal||manuallySelectedType)return;
    if(!typeOptions(dialogRuleConfig(),rows).some(o=>o.name===recommended))return;
    // Change the suggested TYPE, never silently choose any period or
    // declare hours; the day-level formal roster check remains mandatory.
    if(kind.value!==recommended){
     kind.value=recommended;
     refresh();select.selectedIndex=-1;select.value='';preview();
     autoSelectPeriodForCurrentType();
    }
    el.querySelector('#p79OtStatus').textContent='已自動帶入職稱「'+title+'」設定的 '+recommended+'；請核對當日班表及實際出勤時段。';
   }
   roleSelect.onchange=()=>{manuallySelectedType=false;manuallySelectedPeriod=false;refreshPairPeople();preview();suggestBySelectedRole();void refreshOfficialRosterHint();};
   kind.onchange=()=>{manuallySelectedType=true;manuallySelectedPeriod=false;prefill.preferredType='';refresh();autoSelectPeriodForCurrentType();void refreshOfficialRosterHint();};
   select.onchange=()=>{manuallySelectedPeriod=true;preview();};
   forSelect.onchange=()=>{syncApprovedLeaveDate();preview();void refreshOfficialRosterHint();};
   leaveDateSelect.onchange=()=>{if(prefill.leaveHandoffId)return;dateInput.value=leaveDateSelect.value;refresh();void refreshOfficialRosterHint();};
   empSelect.onchange=()=>{manuallySelectedType=false;manuallySelectedPeriod=false;lastOfficialShift='';lastRosterEmployee='';refresh();suggestBySelectedRole();void refreshOfficialRosterHint();};
   dateInput.onchange=()=>{manuallySelectedType=false;manuallySelectedPeriod=false;lastOfficialShift='';lastRosterDate='';if(forSelect.value&&approvedDates.length)leaveDateSelect.value=approvedDates.includes(dateInput.value)?dateInput.value:'';refresh();void refreshOfficialRosterHint();};
   refreshTypes();el.querySelector('#p79OtStatus').textContent=typeOptions(dialogRuleConfig(),rows).length?'請選擇員工、日期與出勤時段。':'雲端目前沒有可用的加班類型。請按下方「＋新增／管理加班類型與時段」，先新增類型，再設定出勤時段。';
   if(prefill.empId||prefill.forEmpId){
    el.querySelector('#p79OtDate').value=prefill.date||el.querySelector('#p79OtDate').value;
    if(prefill.forEmpId)forSelect.value=String(prefill.forEmpId);
    const match=findPrefill(prefill.code,prefill.category);
    const categoryMatch=match>=0?match:rows.findIndex(r=>r[0]===prefill.category);
    if(categoryMatch>=0){kind.value=ruleType(rows[categoryMatch]);refresh();}
    if(match>=0){select.value=String(match);preview();}
    else if(prefill.code||prefill.requirePeriodSelection){select.selectedIndex=-1;select.value='';el.querySelector('#p79OtStatus').textContent=prefill.periodHint|| (prefill.code?'班表時段 '+prefill.code+' 尚無相符選項，請新增或選擇正確時段。':'代班已確認；班表無法推算時段，請自行選擇正確出勤時段。');}
    // 請假新增／代班安排已選過人員：依人資主檔自動帶入相同職稱，免再次手選。
    // 同時支援 jobTitle 與請假頁採用的 deptDetail，保留職稱下拉切換能力。
    prefillReportRole(roleSelect,people,prefill.empId);
    refreshPairPeople();empSelect.value=String(prefill.empId);syncApprovedLeaveDate();preview();
   }
   function applyPreferredType(){
    const requested=canonicalType(prefill.preferredType);if(!requested)return;
    if(!typeOptions(dialogRuleConfig(),rows).some(x=>x.name===requested)){select.selectedIndex=-1;select.value='';el.querySelector('#p79OtStatus').textContent='原選加班類型已變更，請重新選擇類型與出勤時段。';return;}
    kind.value=requested;refresh();
    const period=String(prefill.code||'').match(/(\d{2}(?::\d{2})?)-(\d{2}(?::\d{2})?)$/);
    const candidates=rows.map((r,i)=>({r,i})).filter(({r})=>matchesReportType(r,requested)&&(r[1]===prefill.code||period&&hour(period[1])%1440===hour(r[6])%1440&&hour(period[2])%1440===hour(r[7])%1440));
    if(candidates.length===1){select.value=String(candidates[0].i);preview();}
    else{select.selectedIndex=-1;select.value='';preview();el.querySelector('#p79OtStatus').textContent='已帶入「'+requested+'」，請選擇本位人員的出勤時段。';}
   }
   applyPreferredType();
   // Show the intended four-hour period even before the next day's first IN.
   // It is a plan only, never verified actual overtime or punch evidence.
   if(prefill.leaveHandoffId&&prefill.periodHint){
    const p=el.querySelector('#p79OtPreview');
    p?.insertAdjacentHTML('afterend','<div id="p79OtCoverPlanPreview" style="margin:7px 0;padding:9px;border:1px solid #93c5fd;border-radius:8px;background:#eff6ff;color:#1e40af;font-size:13px;font-weight:700">'+
     '預排代班時段（尚未認列實際加班）｜'+esc(prefill.periodHint)+'</div>');
   }
   suggestBySelectedRole();
   void refreshOfficialRosterHint();
   if(!prefill.code&&prefill.requirePeriodSelection&&prefill.attendance)
    autoSelectPeriodForCurrentType();
   if(editingOriginal&&prefill.plannedReview===true){
    const time=ms=>Number.isFinite(ms)?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ms)):'不完整';
    const start=prefill.attendance?.start,end=prefill.attendance?.end;
    el.querySelector('#p79OtPreview').insertAdjacentHTML('afterend',
     '<div class="p79-planned-review-evidence" style="margin:8px 0;padding:10px;border:1px solid #a5b4fc;border-radius:8px;background:#eef2ff;color:#312e81;font-weight:700">'+
     '原預排 '+esc(prefill.originalReportCode||prefill.code||'')+'｜依完整打卡選擇 '+esc(prefill.code||'待選時段')+
     '｜打卡 '+time(start)+' ～ '+time(end)+'｜確認後沿用原 ID 正式儲存。'+
     '</div>');
   }
   if(editingOriginal){
    // A saved report can change its hours/note, but not its original employee or date.
    dateInput.readOnly=true;
    empSelect.disabled=true;
    roleSelect.disabled=true;
    el.querySelector('#p79OtStatus').textContent=prefill.plannedReview===true?'原預排已有打卡，請確認實際工作、休息時間及原申報時段；送出後沿用原申報 ID，不建立第二筆。':'修改原正式申報：保留員工與日期，請選擇正確時段或修改備註後儲存。';
   }
   el.insertAdjacentHTML('beforeend',' <button id="p79OtManageOptions" type="button" style="margin-left:10px;padding:10px;border:1px solid #0369a1;border-radius:8px">＋新增／管理加班類型與時段</button>');el.querySelector('#p79OtManageOptions').onclick=openRules;el.querySelector('#p79OtManageOptions').style.display=global.p79OvertimeContext?.canEditRules?.()?'inline-block':'none';
   function applyReportRows(nextRows){
    const previous=selectedRow();
    cloudRuleSource=nextRows;
    rows=specialRows(reportRowsForDialog(nextRows),dialogRuleConfig(),extra);refreshTypes();suggestBySelectedRole();
    const code=previous?.[1]||prefill.code,category=previous?.[0]||prefill.category;
    const index=findPrefill(code,category);
    if(index>=0){if(!matches(rows[index])){kind.value=ruleType(rows[index]);refresh();}select.value=String(index);preview();}
    else if(code||prefill.requirePeriodSelection){select.selectedIndex=-1;select.value='';preview();}
    if(prefill.preferredType&&!previous)applyPreferredType();
    void refreshOfficialRosterHint();
   }
   const optionsSaved=()=>{if(el.isConnected)applyReportRows(reportRules());};
   el.insertAdjacentHTML('beforeend','<button id="p79OtReloadOptions" type="button">更新雲端時段選項</button>');
   // The selector was first rendered before this button existed; refresh its
   // label now without changing the selected overtime period.
   refresh();
   el.querySelector('#p79OtReloadOptions').onclick=async()=>{
    const button=el.querySelector('#p79OtReloadOptions');if(button.disabled)return;
    const selectedType=String(kind.value||'');
    button.disabled=true;
    try{
     const loaded=await loadRules();
     if(!el.isConnected)return;
     const diagnostic=reportPeriodDiagnostic(loaded.rows,loaded.config,selectedType);
     const mayReactivate=global.p79OvertimeContext?.canEditRules?.()&&
      diagnostic.configured&&diagnostic.archived>0&&diagnostic.active===0&&
      selectedType!==typeLabel.代;
     if(mayReactivate){
      const archivedKeys=new Set(loaded.config[ARCHIVED_CONFIG]||[]);
      const hiddenKeys=new Set(loaded.config[HIDDEN_MANAGER_RULES]||[]);
      const affected=loaded.rows.filter(row=>ruleType(row)===selectedType&&
       archivedKeys.has(ruleKey(row))&&!hiddenKeys.has(ruleKey(row)));
      if(affected.length){
       const approved=global.confirm('雲端目前保留「'+selectedType+'」'+affected.length+
        ' 筆歷史封存的出勤時段。\\n確定只將這些時段重新開放給新加班申報嗎？'+
        '\\n原換算時數不變，已刪除的時段不會恢復；正式儲存仍須核對打卡與班表。');
       if(approved){
        if(kind.value!==selectedType)throw Error('加班類型已切換，請重新核對後操作');
        // Confirm cloud settings have not been changed by another administrator.
        const current=await loadRules();
        if(JSON.stringify(current.config)!==JSON.stringify(loaded.config)||
           JSON.stringify(current.rows)!==JSON.stringify(loaded.rows))
         throw Error('加班選項已在其他地方更新，請重新讀取後核對');
        const recoveryKeys=new Set(affected.map(ruleKey));
        const nextConfig={...current.config,
         [ARCHIVED_CONFIG]:(current.config[ARCHIVED_CONFIG]||[]).filter(key=>!recoveryKeys.has(key))};
        if(new TextEncoder().encode(JSON.stringify(nextConfig)).length>8800)
         throw Error('雲端設定已達安全容量上限，尚未變更');
        await rpc('saveConfig',{config:nextConfig});
        const checked=await loadRules();
        const active=new Set(activeReportRows(checked.rows,checked.config).map(ruleKey));
        if(!affected.every(row=>active.has(ruleKey(row))))
         throw Error('雲端尚未確認這些時段全部啟用，請重新核對，不要重複新增');
        syncCloudOvertimeConfig(checked.config);
        try{global.p79OvertimeContext.persistConfig?.();}catch(error){console.warn('雲端已確認，畫面快取更新失敗',error);}
        applyReportRows(checked.rows);
        el.querySelector('#p79OtStatus').textContent='✅ 雲端已確認開放「'+selectedType+
         '」'+affected.length+' 筆出勤時段；請選擇實際加班時段後申報。';
        return;
       }
      }
     }
     syncCloudOvertimeConfig(loaded.config);
     try{global.p79OvertimeContext.persistConfig?.();}catch(error){console.warn('加班選項快取更新失敗',error);}
     applyReportRows(loaded.rows);
     el.querySelector('#p79OtStatus').textContent=!typeOptions(dialogRuleConfig(),rows).length?
      '雲端尚未新增加班類型，請至加班選項管理核對。':
      !rows.length?'雲端已有加班類型，但尚未有可申報的出勤時段。':
      '已更新 '+rows.length+' 筆可申報的出勤時段。';
    }catch(error){if(el.isConnected)el.querySelector('#p79OtStatus').textContent='選項更新失敗：'+error.message;}
    finally{button.disabled=false;}
   };
   // Initial options already come from authoritative config. A duplicate
   // background read previously overwrote rendered choices and caused flicker.
   // Only the explicit refresh button should refetch and redraw this dialog.
   if(prefill.code&&findPrefill(prefill.code,prefill.category)<0){
    const diagnostic=reportPeriodDiagnostic(cloudRuleSource,dialogRuleConfig(),
     canonicalType(prefill.preferredType)||typeLabel[prefill.category]||kind.value);
    if(diagnostic.archived)
     el.querySelector('#p79OtStatus').textContent='雲端核對：'+diagnostic.archived+
      ' 筆對應時段仍是歷史封存，須在加班選項管理核對並儲存啟用，才能申報。';
   }
   global.addEventListener?.('p79-overtime-options-saved',optionsSaved);
   el.p79Cleanup=()=>global.removeEventListener?.('p79-overtime-options-saved',optionsSaved);
   el.onclose=()=>{el.p79Cleanup();el.remove();};
   if(prefill.manualPlan===true){el.querySelector('#p79OtStage').textContent='儲存預排';el.querySelector('#p79OtDate').min=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());}
   if(prefill.readonlyWrongDate===true){
    const reason='原預排仍在 '+String(prefill.coverDate||'原請假日')+
     '，實際出勤日 '+String(prefill.date||'')+'、加班歸屬日 '+String(prefill.overtimeDate||prefill.coverDate||prefill.date||'')+
     '。已顯示加班候選時段，但原申報 ID 尚待授權更正；不可建立重複預排。';
    el.querySelector('#p79OtStatus').textContent=reason;
    const stage=el.querySelector('#p79OtStage');
    stage.textContent='原預排日期待更正（不可重複儲存）';
    stage.disabled=true;stage.title=reason;
   }
   if(prefill.savedReport&&prefill.reportId)el.querySelector('#p79OtStage').textContent=prefill.plannedReview===true?'確認正式申報':'儲存原申報修改';
   if(prefill.note)el.querySelector('#p79OtNote').value=String(prefill.note);
   // 正式核對只能用與完整上/下班打卡一致的規則；不接受預排快取的舊班別。
   function verifyPlannedReviewSelection(selected){
    if(prefill.plannedReview!==true)return;
    const start=Number(prefill.attendance?.start),end=Number(prefill.attendance?.end);
    const match=global.P79OvertimeShiftMatch?.resolve?.({
     date:prefill.date,roster:prefill.roster||{},
     report:{category:selected?.[0]||'',typeName:ruleType(selected)},
     rules:[selected],start,end,attendanceIssue:false
    });
    if(match?.state!=='completed'||match?.confirmed!==true||
       match?.suggested?.code!==selected?.[1]||match?.suggested?.category!==selected?.[0])
     throw Error('原預排時段與實際打卡不符，不能確認正式申報；請選擇符合 08-16、16-24 等實際上下班的時段。');
   }
   let submissionBusy=false;
   el.querySelector('#p79OtStage').onclick=async()=>{
    if(prefill.readonlyWrongDate===true)return;
    if(submissionBusy)return;
    submissionBusy=true;let completed=false;
    const stageButton=el.querySelector('#p79OtStage');stageButton.disabled=true;
    el.querySelector('#p79OtStatus').textContent='正在核對最新出勤、班表與加班設定…';
    try{const chosen=selectedRow();if(!chosen)throw Error('請先選擇正確出勤時段；若沒有符合的選項，請新增加班規則');
     const date=el.querySelector('#p79OtDate').value,empId=el.querySelector('#p79OtEmp').value;
     if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!empId)throw Error('請選擇員工與日期');
     verifyPlannedReviewSelection(chosen);
     const selectionKey=()=>JSON.stringify([dateInput.value,empSelect.value,kind.value,select.value,forSelect.value,el.querySelector('#p79OtNote').value,selectedRow()]);
     const selection=selectionKey();
     const validationRequest={empId,date,overtimeDate:prefill.overtimeDate||date,
      coverDate:prefill.coverDate||date,leaveHandoffId:prefill.leaveHandoffId||''};
     // Always read the current official rule table during preflight, including
     // original planned-review edits. Reuse this already verified snapshot
     // instead of performing a second GET after the Save spinner appears.
     const validation=await prepareSaveValidation(validationRequest,true);
     // Older GAS stores only the punch/work date. Never silently credit 04-08 to 11/08.
     if(validationRequest.overtimeDate!==date&&validation.cloud?.capabilities?.nightCoverOvertimeAccountingV1!==true)
      throw Error('正式 GAS 尚未支援跨日加班歸屬日 '+validationRequest.overtimeDate+'（出勤日 '+date+'）；保留代班安排，禁止錯日送出申報。');
     if(selectionKey()!==selection)throw Error('核對期間申報內容已變更，請確認內容後再次儲存');
     // Deleted builtin types remain in GAS only to preserve OLD reports.
     // Reject NEW submissions from stale browser tabs even before backend POST.
     {
      const latest=validation.rules,selected=chosen;
      const active=activeReportRows(latest.rows,latest.config);
      const stillActive=typeOptions(latest.config,active).some(option=>option.name===ruleType(selected));
      const known=active.some(row=>JSON.stringify(report(row))===JSON.stringify(report(selected)));
      const transientSpecial=specialTypes.some(([name])=>name===ruleType(selected));
      if(!stillActive||!known&&(editingOriginal||!transientSpecial))
       throw Error('所選加班類型或時段已從雲端刪除、停用或換算已更新，請重新讀取雲端選項後核對。');
     }
     const selectedCategoryNow=chosen?.[0];
     if(!editingOriginal&&['休','例','國','延'].includes(selectedCategoryNow)){
      const officialRoster=validation.cloud.schedules.find(row=>String(row.empId).trim().toUpperCase()===String(empId).trim().toUpperCase())?.schedule||{};
      const officialMeta=officialRoster.__meta?.[date]||{};
      const actualRosterShift=[officialRoster[date],officialMeta.reportOriginalShift,officialMeta.overtimeOriginalShift]
       .map(value=>String(value||'').trim()).find(value=>['早','中','晚','休','例','國'].includes(value))||'';
      if(['休','例','國'].includes(selectedCategoryNow)&&['早','中','晚'].includes(actualRosterShift))
       throw Error('正式班表此日為「'+actualRosterShift+'」班，不是休息日／例假／國定假日加班，請核對正確加班類型與時段。');
      if(selectedCategoryNow==='延'&&['休','例','國'].includes(actualRosterShift))
       throw Error('正式班表此日為「'+actualRosterShift+'」，與平日延時加班不符；請先核對日期、班別與正確加班類型。');
     }
     // 已存在的平日延時加班預排，只核對同一張申報、同一員工、日期與原代班關聯；
     // 請假資料缺漏不可抹去原申報日期。新申報及真正請假代班仍須核對核准請假日。
     const originalExtensionReview=editingOriginal&&prefill.plannedReview===true&&!prefill.leaveHandoffId&&chosen?.[0]==='延'&&
       String(prefill.empId||'')===String(empId)&&String(prefill.date||'')===date&&
       String(prefill.forEmpId||'')===String(forSelect.value||'');
     if(!originalExtensionReview&&['代','延'].includes(chosen?.[0]))validateLeaveLinkedOvertimeDate(date,forSelect.value,approvedDates,prefill.leaveHandoffId?prefill.date:'');
     if(prefill.attendance&&String(prefill.empId)===String(empId)&&prefill.date===date){const issue=ruleAttendanceIssue(prefill.attendance.start,prefill.attendance.end,date,chosen);if(issue)throw Error(issue);}
     const editingExisting=Boolean(prefill.savedReport&&prefill.reportId&&String(prefill.empId)===String(empId)&&prefill.date===date);
     if(editingOriginal&&!editingExisting)throw Error('修改正式申報不可更換員工或日期，請重新開啟原紀錄。');
     if(editingExisting&&!(prefill.attendance?.end>prefill.attendance?.start))throw Error('原申報需完成上下班打卡才能確認修改時段；目前只顯示暫估');
     const selectedCategory=chosen[0];
     const pair=editingOriginal&&!['代','延'].includes(selectedCategory)
      ?{forEmpId:String(prefill.forEmpId||''),forName:''}
      :reportPair(prefill.leaveHandoffId?'代':selectedCategory,empId,prefill.leaveHandoffId?prefill.forEmpId:forSelect.value,people);
     const draft=Object.assign(validationRequest,{id:editingExisting?String(prefill.reportId):crypto.randomUUID(),manualPlan:prefill.manualPlan===true,preventReplace:editingExisting,plannedReview:editingExisting&&prefill.plannedReview===true,expectedOriginalCode:editingOriginal?String(prefill.originalReportCode||''):'',expectedOriginalCategory:editingOriginal?String(prefill.originalReportCategory||''):'',expectedPunchStart:editingOriginal?Number(prefill.attendance?.start):null,expectedPunchEnd:editingOriginal?Number(prefill.attendance?.end):null,empId,date,rule:report(chosen),...pair,note:el.querySelector('#p79OtNote').value,createdAt:Date.now(),gasUrl:auth().url,autoSave:true,leaveHandoffId:prefill.leaveHandoffId||''});
     try{const pending=editingExisting?null:JSON.parse(sessionStorage.getItem(KEY)||'null');
      if(pending&&pending.gasUrl===draft.gasUrl&&pending.empId===draft.empId&&pending.date===draft.date&&pending.forEmpId===draft.forEmpId&&pending.note===draft.note&&pending.leaveHandoffId===draft.leaveHandoffId&&JSON.stringify(pending.rule)===JSON.stringify(draft.rule)){draft.id=pending.id;draft.createdAt=pending.createdAt;}
     }catch(ignore){}
     sessionStorage.setItem(KEY,JSON.stringify(draft));
     if(typeof global.p79OvertimeContext?.saveReport==='function'){
      const button=stageButton;button.disabled=true;el.querySelector('#p79OtStatus').textContent='正在確認出勤時段並儲存加班…';
      try{
       // The up-to-date rule was checked above. Do not block confirmed
       // posting on a redundant network read with another timeout.
       const result=await awaitOvertimeSaveConfirmation(
        global.p79OvertimeContext.saveReport(draft));
       verifySavedReport(draft,result);
       if(draft.overtimeDate!==draft.date&&String(result?.report?.overtimeDate||'')!==draft.overtimeDate)
        throw Error('雲端未確認加班歸屬日 '+draft.overtimeDate+'；保留待核對，不可當作已申報。');
       if(draft.plannedReview===true&&result?.report?.planned!==false)throw Error('雲端仍顯示預排，尚未確認轉為正式申報；請重新核對。');
       if(result?.ok!==true||result.directOvertimeSaved!==true||result.id!==draft.id)throw Error('尚未收到加班儲存確認，已保留申報內容');
       // The cloud explicitly confirmed success (and planned=false for a
       // formal review). Mark complete and close BEFORE any optional event
       // listener or leave-handoff navigation can throw, block or reopen UI.
       completed=true;
       try{sessionStorage.removeItem(KEY);}catch(error){console.warn('已儲存申報；暫存清理未完成',error);}
       closeConfirmedReportDialog(el);
       try{global.dispatchEvent?.(new CustomEvent('p79-overtime-report-saved',{detail:{draft,result}}));}
       catch(error){console.warn('申報已儲存；畫面通知未完成',error);}
       if(draft.leaveHandoffId&&typeof global.p79OpenLeaveOvertimeHandoff==='function'){
        try{
         const progress=advanceLeaveHandoff(draft);
         if(progress?.remaining)await global.p79OpenLeaveOvertimeHandoff();
        }catch(error){console.warn('申報已儲存；接續代班申報需重新開啟',error);}
       }

      }finally{button.disabled=completed}
     }else throw Error('申報儲存模組尚未載入；內容已保留，請重新整理後接續申報。');
    }catch(e){el.querySelector('#p79OtStatus').textContent='❌ '+e.message}
    finally{submissionBusy=false;if(!completed)stageButton.disabled=false;}
   };
  }catch(e){el.querySelector('#p79OtStatus').textContent='❌ '+e.message}
 }
 global.P79Overtime={RECOVERY_STORAGE,overtimeRecoverySnapshot,rememberOvertimeOptions,recoverableOvertimeOptions,ruleGuide,prepareSaveValidation,takeSaveContext,ROLE_DEFAULTS_CONFIG,ARCHIVED_CONFIG,HIDDEN_MANAGER_RULES,reportPeriodDiagnostic,managerVisibleRules,normalizeRoleTypeDefaults,preferredOvertimeTypeForRole,DELETED_CONFIG,canonicalType,deletedBuiltins,activeReportRows,activeReportRules,activeSupportPeriods,officialOvertimeTypeHint,matchingReportPeriod,resolvedRule,verifySavedReport,specialRows,ensureSpecialRule,suggestRule,declarationEnd,declarationWindow,ruleAttendanceIssue,advanceLeaveHandoff,KEY,CONFIG,defaults,validate,excelRows,parseExcelRows,report,interval,overtimeMinutes,inferRule,matchReport,reportRules,showReportLoading,loadRules,resolveLeaveCoverReport,normalizeLeaveCoverHandoffEntry,matchesReportType,displayPeriodCode,filterReportEmployees,reportEmployeeRole,prefillReportRole,reportPair,approvedLeaveDateChoices,validateLeaveLinkedOvertimeDate,typeOptions,ruleType,openRules,openReport,time};
})(typeof window==='undefined'?globalThis:window);



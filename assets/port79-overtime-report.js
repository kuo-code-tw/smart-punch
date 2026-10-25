(function(global){
 'use strict';
 const KEY='port79_overtime_report_draft_v1',CONFIG='overtimeConversionRowsV1';
 const types=['休','國','例','代','延'];
 const TYPECONFIG='overtimeReportTypesV1';
 const typeLabel={休:'休息日加班',國:'國定假日加班',例:'例假加班',代:'休假代班加班',延:'平日延長加班'};
 const canonicalType=name=>name==='代班加班'?'休假代班加班':name;
 const isBuiltinType=name=>Object.values(typeLabel).includes(canonicalType(name));
 // 舊表格切換假別後可能保留原來的預設名稱；預設類型一律依假別辨識。
 const ruleType=r=>r[9]&&!isBuiltinType(r[9])?r[9]:typeLabel[r[0]];
 function typeOptions(config={},rows=[]){const map=new Map(types.map(c=>[typeLabel[c],c]));for(const r of config[TYPECONFIG]||[]){if(!Array.isArray(r)||!types.includes(r[1])||!String(r[0]).trim())throw Error('加班類型設定無效');const name=String(r[0]).trim();if(!isBuiltinType(name))map.set(name,r[1]);}for(const r of rows){const name=ruleType(r);if(r[9]&&!isBuiltinType(name))map.set(name,r[0]);}return [...map].map(([name,category])=>({name,category}));}
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
   const key=ruleType(v)+'|'+code;if(seen.has(key))throw Error('同一加班類型的出勤時段重複：'+code);seen.add(key);
   if(!(Number(v[2])>0&&Number(v[2])<=24)||v[3]!==''&&!(Number.isFinite(Number(v[3]))&&Number(v[3])>=0&&Number(v[3])<=100))throw Error(code+' 時數無效');
   if(!Number.isFinite(span(v[6],v[7])))throw Error(code+' 加班起迄時間無效');
   if(v[0]==='延'){
    if(!['before','after'].includes(v[8])||span(v[4],v[5])!==480)throw Error(code+' 正常班須為8小時，並選擇班前或班後');
    if(v[8]==='before'&&hour(v[7])%1440!==hour(v[4])%1440||v[8]==='after'&&hour(v[5])%1440!==hour(v[6])%1440)throw Error(code+' 正常班與加班必須相接');
   }else{v[4]='';v[5]='';v[8]='full';}
   const label=code.match(/(\d{2}(?::\d{2})?)-(\d{2}(?::\d{2})?)$/);
   if(v[0]!=='延'&&(hour(label[1])%1440!==hour(v[6])%1440||hour(label[2])%1440!==hour(v[7])%1440))throw Error(code+' 代碼時段與加班時段不一致');
   if(v[0]==='延'&&v[8]==='before'&&(hour(label[1])%1440!==hour(v[6])%1440||hour(label[2])%1440!==hour(v[5])%1440))throw Error(code+' 班前加班代碼須包含完整出勤時段');
   if(v.length===10&&(!v[9]||isBuiltinType(v[9])))v.pop();
   return v;
  });
 }
 const excelHeaders=['假別','出勤時段','實際加班時數','換算時數','正常起','正常迄','加班起','加班迄','位置','加班類型名稱'];
 const positionLabels={full:'全段',after:'班後',before:'班前'};
 function excelRows(rows){return [excelHeaders,...validate(rows).map(r=>[typeLabel[r[0]],...r.slice(1,8),positionLabels[r[8]],ruleType(r)])];}
 function parseExcelRows(rows){
  if(!Array.isArray(rows)||!rows.length||excelHeaders.some((h,i)=>String(rows[0][i]||'').trim()!==h))throw Error('匯入欄位不符，請先匯出試算表範本');
  const categories=Object.fromEntries(types.map(c=>[typeLabel[c],c])),positions=Object.fromEntries(Object.entries(positionLabels).map(([a,b])=>[b,a]));
  return validate(rows.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map(r=>[categories[String(r[0]).trim()]||r[0],...Array.from({length:7},(_,i)=>r[i+1]??''),positions[String(r[8]).trim()]||r[8],r[9]||'']));
 }
 async function ensureExcel(){
  if(global.XLSX)return global.XLSX;
  const loader=global.p79EnsureXlsx||global.p79LoadXlsxLibrary;
  if(!loader)throw Error('試算表元件尚未就緒，請重新整理');
  await loader();if(!global.XLSX)throw Error('試算表元件載入失敗');return global.XLSX;
 }
 function normalizeStored(value){return value===undefined?defaults():validate(value);}
 function report(row){
  const r=validate([row])[0];return {version:1,category:r[0],typeName:ruleType(r),code:r[1],declaredHours:Number(r[2]),convertedHours:r[3]===''?(r[0]==='延'&&r[4]==='08'&&r[5]==='16'&&r[6]==='16'&&r[7]==='20'&&Number(r[2])===4?6.02:null):Number(r[3]),normalStart:r[4],normalEnd:r[5],overtimeStart:r[6],overtimeEnd:r[7],position:r[8]};
 }
 function interval(date,start,end,offset=0){
  const base=Date.parse(date+'T00:00:00+08:00'),a=hour(start),duration=span(start,end);
  if(!Number.isFinite(base)||!Number.isFinite(duration))throw Error('日期或時段無效');
  const x=base+(a+offset*1440)*60000;return [x,x+duration*60000];
 }
 // Declaration hours use the scheduled start and the clock-out minute, not elapsed-time rounding.
 function declarationEnd(end){
  if(end===null||end===undefined||end===''||!Number.isFinite(Number(end)))return NaN;
  const value=Number(end),hour=Math.floor(value/3600000)*3600000;
  return hour+(new Date(value).getUTCMinutes()>45?3600000:0);
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
  if(r[0]!=='延'&&scheduled&&ot[0]<scheduled.start)return '申報起點早於排定班別，請依班別起算';
  if(ot[1]>declarationEnd(end))return '下班分鐘須超過45分才進位；此申報時段超過可計算的下班整點，請選較短時段';
  if(start>ot[0]+45*60000)return '打卡上班時間與申報起點不符，請核對排定班別';
  return '';
 }
 function overtimeMinutes(start,end,date,meta){
  const r=meta?.overtimeReport;if(!r||!(end>start))return null;
  let offset=0;
  if(r.position==='after'){
   const normal=interval(date,r.normalStart,r.normalEnd);
   const base=Date.parse(date+'T00:00:00+08:00');offset=Math.floor((normal[1]-base)/86400000);
  }
  const[a,b]=interval(date,r.overtimeStart,r.overtimeEnd,offset);
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
  const out=validate(rows),options=typeOptions(config,out);
  for(const [name,prefix] of specialTypes){
   const category=options.find(t=>t.name===name)?.category||'國';
   const periods=[];
   for(const begin of [8,16,24])for(let duration=1;duration<=8;duration++)periods.push([begin,duration]);
   periods.push(...extra);
   for(const [begin,duration] of periods){
    if(!Number.isInteger(begin)||!Number.isInteger(duration)||duration<1||duration>18)continue;
    const end=(begin+duration)%24||24,a=String(begin||24).padStart(2,'0'),b=String(end).padStart(2,'0');
    if(out.some(r=>ruleType(r)===name&&hour(r[6])%1440===hour(a)%1440&&hour(r[7])%1440===hour(b)%1440))continue;
    out.push([category,prefix+a+'-'+b,String(duration),String(duration),'','',a,b,'full',name]);
   }
  }
  return validate(out);
 }
 let specialSaveQueue=Promise.resolve();
 function ensureSpecialRule(row){
  if(!specialTypes.some(([name])=>ruleType(row)===name))return Promise.resolve();
  const run=async()=>{
   const fresh=await loadRules(),name=ruleType(row),same=fresh.rows.find(r=>ruleType(r)===name&&r[1]===row[1]);
   if(same){if(JSON.stringify(report(same))!==JSON.stringify(report(row)))throw Error('此出勤時段已更新，請更新雲端時段選項後再申報');return;}
   if(!global.p79OvertimeContext?.canEditRules?.())throw Error('此時段尚未存入雲端，請由有加班選項管理權限的人員首次儲存');
   const custom=typeOptions(fresh.config,fresh.rows).filter(t=>!isBuiltinType(t.name)).map(t=>[t.name,t.category]);
   for(const [type] of specialTypes)if(!custom.some(t=>t[0]===type))custom.push([type,type===name?row[0]:'國']);
   const config={...fresh.config,[CONFIG]:validate([...fresh.rows,row]),[TYPECONFIG]:custom};
   if(new TextEncoder().encode(JSON.stringify(config)).length>8800)throw Error('共用設定已達容量上限，新時段尚未儲存');
   const latest=await loadRules();
   if(JSON.stringify(latest.config)!==JSON.stringify(fresh.config))throw Error('加班設定已由其他人修改，請重試以合併最新設定');
   await rpc('saveConfig',{config});
   const check=await loadRules();
   if(!check.rows.some(r=>JSON.stringify(report(r))===JSON.stringify(report(row)))||!check.config[TYPECONFIG]?.some(t=>t[0]===name&&t[1]===row[0]))throw Error('新出勤時段尚未通過雲端讀回確認，未送出申報');
   Object.assign(global.p79OvertimeContext.config(),check.config);global.p79OvertimeContext.persistConfig?.();
  };
  const pending=specialSaveQueue.then(run);specialSaveQueue=pending.catch(()=>{});return pending;
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
   row[0]==='延'&&suffix?row[6]+'-'+row[7]:
   original;
  return code+'｜'+name;
 }
 function reportRules(){
  const config=global.p79OvertimeContext?.config?.();
  if(config&&Object.prototype.hasOwnProperty.call(config,CONFIG))return normalizeStored(config[CONFIG]);
  return defaults();
 }
 function filterReportEmployees(people,department='',jobTitle=''){
  const dept=e=>String(e.dept||'一般'),title=e=>String(e.jobTitle||e.deptDetail||'未設定');
  const unique=xs=>[...new Set(xs)].sort((a,b)=>a.localeCompare(b,'zh-Hant',{numeric:true}));
  const scoped=people.filter(e=>!department||dept(e)===department);
  return {departments:unique(people.map(dept)),jobTitles:unique(scoped.map(title)),employees:scoped.filter(e=>!jobTitle||title(e)===jobTitle)};
 }
 async function loadRules(){const d=await rpc('getOvertimeConfig');if(!d.config||typeof d.config!=='object')throw Error('雲端設定不完整，未使用預設值覆蓋');return {config:d.config,rows:validate(normalizeStored(d.config[CONFIG]))};}
 function resolveLeaveCoverReport(data,handoff,entry){
  const key=v=>String(v||'').trim().toUpperCase(),date=entry.date;
  const cover=(data.leaveCoverAssignments||[]).find(c=>String(c.leaveId)===String(handoff.id)&&key(c.leaveEmpId)===key(entry.forEmpId)&&(c.workerIds||[]).some(id=>key(id)===key(entry.empId))&&String(c.startDate)<=date&&String(c.endDate)>=date);
  if(!cover)throw Error('此筆請假在該日的代班已取消或更換人員，請重新整理請假管理核對');
  const roster=new Map((data.schedules||[]).map(r=>[key(r.empId),r.schedule||{}])),own=roster.get(key(entry.empId))||{},target=roster.get(key(cover.leaveEmpId))||{};
  const meta=own.__meta?.[date]||{};
  if(meta.overtimeReport?.category==='代'&&key(meta.forEmpId)===key(cover.leaveEmpId)&&meta.overtimeReport.code)return {code:meta.overtimeReport.code,requirePeriodSelection:false};
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
  return {code:times?'代'+times.join('-'):'',requirePeriodSelection:!times,periodHint:times?'請假班為'+name+'班 '+ranges[name].join('-')+'；本筆代班時段 '+times.join('-')+'，請選擇符合的已設定規則。':''};
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
   @media(max-width:600px){.p79-overtime-dialog{padding:12px!important;width:calc(100vw - 20px)!important;max-width:calc(100vw - 20px)!important;max-height:calc(100dvh - 20px)!important}.p79-ot-dialog-header{padding:0 65px}.p79-ot-dialog-header h2{font-size:17px}.p79-ot-new-type-controls input,.p79-ot-new-type-controls select{width:100%!important}.p79-ot-actions button{padding:8px!important}}
  </style><div class="p79-ot-dialog-header"><h2>`+esc(title)+'</h2><button type="button" id="p79OtClose">✕ 關閉</button></div>'+content;
  document.body.appendChild(el);el.querySelector('#p79OtClose').onclick=()=>el.close();el.showModal();return el;
 }
 const inputStyle='box-sizing:border-box;width:100%;min-width:0;max-width:100%;text-align:center;padding:7px;border:1px solid #cbd5e1;border-radius:5px;font-size:13px;background:white;color:#0f172a';
 function editorRow(row){return '<tr data-ot-category="'+esc(row[0])+'">'+[...row.slice(0,9),ruleType(row)].map((v,j)=>'<td style="padding:4px">'+(j===0?'<select data-col="0" style="'+inputStyle+'">'+types.map(t=>'<option '+(v===t?'selected':'')+'>'+t+'</option>').join('')+'</select>':j===8?'<select data-col="8" style="'+inputStyle+'">'+[['full','全段'],['after','班後'],['before','班前']].map(([val,label])=>'<option value="'+val+'" '+(v===val?'selected':'')+'>'+label+'</option>').join('')+'</select>':'<input data-col="'+j+'" style="'+inputStyle+'" value="'+esc(v)+'" '+([2,3].includes(j)?'type="number" min="0" step="0.01"':'type="text"')+'>')+'</td>').join('')+'<td><button type="button" class="p79OtDelete">刪除</button></td></tr>';}
 async function openRules(){
  if(!global.p79OvertimeContext?.canEditRules?.()&&!global.p79OvertimeContext?.canReport?.())return alert('沒有管理加班選項的權限');
  const el=dialog('加班選項管理','<p id="p79OtStatus">正在讀取已儲存的選項…</p>','p79OvertimeOptionsDialog');
  try{
   const cached=global.p79OvertimeContext?.config?.();
   let rows=reportRules();
   let loadedRows='',customTypes=JSON.parse(JSON.stringify(cached?.[TYPECONFIG]||[])),loadedTypes='',cloudReady=false,reading=false;
   el.insertAdjacentHTML('beforeend','<p style="margin:12px 0;color:#475569">依你圖片預填換算值，可自行修改。時間使用08、16、24或08:30。申報時數與時段長度分開保存。空白換算時數表示尚未設定。</p><div class="p79-ot-table-wrap"><table style="width:100%;border-collapse:collapse"><thead><tr>'+['假別','出勤時段','實際加班時數','換算時數','正常起','正常迄','加班起','加班迄','位置','加班類型名稱','操作'].map(t=>'<th style="padding:8px;white-space:nowrap;background:#e0f2fe">'+t+'</th>').join('')+'</tr></thead><tbody id="p79OtRuleRows">'+rows.map(editorRow).join('')+'</tbody></table></div><div class="p79-ot-actions"><button id="p79OtAdd" type="button">＋新增出勤時段</button><button id="p79OtExport" type="button">匯出加班設定</button><button id="p79OtImport" type="button">匯入加班設定</button><input id="p79OtImportFile" type="file" accept=".xlsx,.xls" hidden><button id="p79OtReload" type="button">重新讀取雲端</button><button id="p79OtSave" type="button" style="background:#0369a1;color:white;padding:8px 18px;border-radius:8px">儲存加班類型與出勤時段</button></div>');
   el.querySelector('#p79OtStatus').insertAdjacentHTML('afterend','<div style="padding:12px;margin:12px 0;background:#f0f9ff;border-radius:10px"><b>新增加班類型</b><div class="p79-ot-new-type-controls" style="margin-top:8px"><input id="p79NewTypeName" placeholder="例如：吊櫃作業休息日" maxlength="40" style="'+inputStyle+';width:240px"><select id="p79NewTypeCategory" style="'+inputStyle+';width:170px">'+types.map(c=>'<option value="'+c+'">'+esc(typeLabel[c])+'</option>').join('')+'</select><button type="button" id="p79AddType" style="background:#0369a1;color:#fff;padding:9px 14px;border-radius:8px;font-weight:800">＋新增加班類型</button></div><p id="p79AddedTypeMessage" role="status" style="font-weight:700;color:#075985;margin-top:8px">可輸入「颱風日加班」，再選擇實際適用的假別。颱風日不一定屬國定假日。</p><div id="p79AddedTypeList" style="margin-top:6px;font-size:12px"></div><p style="font-size:12px;color:#475569">操作順序：①新增加班類型 → ②新增出勤時段並選剛新增的名稱 → ③按最下方「儲存加班類型與出勤時段」。按新增尚未寫入雲端。</p></div>');
   const renderAddedTypeList=()=>{
    const list=el.querySelector('#p79AddedTypeList');
    if(list)list.textContent=customTypes.length?'目前自訂類型：'+customTypes.map(x=>x[0]+'（'+(typeLabel[x[1]]||x[1])+'）').join('、'):'目前沒有自訂類型';
   };
   renderAddedTypeList();
   el.querySelector('#p79AddType').onclick=()=>{
    const name=el.querySelector('#p79NewTypeName').value.trim(),category=el.querySelector('#p79NewTypeCategory').value;
    if(!name)return el.querySelector('#p79OtStatus').textContent='請填加班類型名稱';
    if(typeOptions({[TYPECONFIG]:customTypes},rows).some(x=>x.name===name))return el.querySelector('#p79OtStatus').textContent='此類型已存在';
    customTypes.push([name,category]);el.querySelector('#p79NewTypeName').value='';
    renderAddedTypeList();
    el.querySelector('#p79AddedTypeMessage').textContent='✅ 已暫存「'+name+'」；接著按「＋新增出勤時段」，選擇「'+name+'」並設定時數，最後按最下方儲存。';
    el.querySelector('#p79OtStatus').textContent='已暫存「'+name+'」，尚未寫入雲端。';
   };
   el.querySelector('#p79OtStatus').insertAdjacentHTML('afterend','<div class="p79-ot-color-legend" aria-label="假別顏色說明">'+types.map(c=>'<span data-ot-category="'+c+'">'+esc(typeLabel[c])+'</span>').join('')+'</div>');
   const body=el.querySelector('#p79OtRuleRows'),getRows=()=>[...body.rows].map(tr=>[...tr.querySelectorAll('[data-col]')].map(i=>i.value));
   body.addEventListener('change',e=>{if(e.target.matches('select[data-col="0"]')){const row=e.target.closest('tr');row.dataset.otCategory=e.target.value;const name=row.querySelector('[data-col="9"]');if(name&&(!name.value.trim()||isBuiltinType(name.value.trim())))name.value=typeLabel[e.target.value];}});
   body.addEventListener('click',e=>{if(!cloudReady)return;if(e.target.closest('.p79OtDelete'))e.target.closest('tr').remove()});
   el.querySelector('#p79OtStatus').textContent=rows.length?'已顯示本機保存的選項（尚未核對雲端），正在確認…':'選項視窗已開啟，正在確認雲端資料…';
   el.querySelector('#p79OtAdd').onclick=()=>{
    const choices=typeOptions({[TYPECONFIG]:customTypes},getRows()),form=dialog('新增出勤時段','<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0"><label>加班類型<select id="p79PeriodType" style="'+inputStyle+'">'+choices.map((x,i)=>'<option value="'+i+'">'+esc(x.name)+'</option>').join('')+'</select></label><label>出勤時段名稱<input id="p79PeriodCode" placeholder="例如：休08-16、代16-20" style="'+inputStyle+'"></label>'+['正常起','正常迄','加班起','加班迄'].map((label,i)=>'<label>'+label+'<select id="p79PeriodTime'+i+'" style="'+inputStyle+'">'+Array.from({length:25},(_,h)=>'<option value="'+String(h).padStart(2,'0')+'">'+String(h).padStart(2,'0')+'</option>').join('')+'</select></label>').join('')+'<label>加班位置<select id="p79PeriodPosition" style="'+inputStyle+'"><option value="full">整段加班</option><option value="after">正常班後加班</option><option value="before">正常班前加班</option></select></label><label>實際加班時數<input id="p79PeriodActual" type="number" step="0.01" style="'+inputStyle+'"></label><label>換算加班時數<input id="p79PeriodConverted" type="number" step="0.01" style="'+inputStyle+'"></label></div><p id="p79PeriodMessage"></p><button id="p79PeriodAdd" type="button" style="background:#0369a1;color:white;padding:10px;border-radius:8px">加入出勤時段</button>','p79OvertimePeriodDialog');
    [8,16,8,16].forEach((h,i)=>form.querySelector('#p79PeriodTime'+i).value=String(h).padStart(2,'0'));form.querySelector('#p79PeriodActual').value='8';
    form.querySelector('#p79PeriodAdd').onclick=()=>{try{
     const chosen=choices[Number(form.querySelector('#p79PeriodType').value)],times=[0,1,2,3].map(i=>form.querySelector('#p79PeriodTime'+i).value),position=form.querySelector('#p79PeriodPosition').value;
     const code=form.querySelector('#p79PeriodCode').value.trim()||(chosen.category+times[2]+'-'+times[3]);
     const row=[chosen.category,code,form.querySelector('#p79PeriodActual').value,form.querySelector('#p79PeriodConverted').value,...(chosen.category==='延'?times.slice(0,2):['','']),...times.slice(2),position,chosen.name];
     validate([...getRows(),row]);body.insertAdjacentHTML('beforeend',editorRow(row));form.close();el.querySelector('#p79OtStatus').textContent='已加入「'+chosen.name+'／'+code+'」，請按儲存。';
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
    rows=imported;customTypes=typeOptions({},rows).filter(t=>!isBuiltinType(t.name)).map(t=>[t.name,t.category]);renderAddedTypeList();body.innerHTML=rows.map(editorRow).join('');
    el.querySelector('#p79OtStatus').textContent='已匯入'+rows.length+'筆，請核對後按儲存。';
   }catch(error){el.querySelector('#p79OtStatus').textContent='❌ '+error.message}finally{event.target.value=''}};
   el.querySelector('#p79OtSave').onclick=async()=>{
    const b=el.querySelector('#p79OtSave');if(b.disabled||!cloudReady)return;b.disabled=true;
    try{
     const draft=validate(getRows()),fresh=await loadRules();
     if(JSON.stringify(fresh.rows)!==loadedRows&&JSON.stringify(fresh.rows)!==JSON.stringify(draft))throw Error('換算表已由其他人修改，請關閉後重新載入再編輯');
     if(JSON.stringify(fresh.config[TYPECONFIG]||[])!==loadedTypes&&JSON.stringify(fresh.config[TYPECONFIG]||[])!==JSON.stringify(customTypes))throw Error('加班類型已被其他人修改，請重新載入');
     const config={...fresh.config,[CONFIG]:draft,[TYPECONFIG]:customTypes};
     if(new TextEncoder().encode(JSON.stringify(config)).length>8800)throw Error('共用設定已達容量上限，尚未儲存；請匯出試算表保留，再改用獨立試算表分頁');
     if(!Object.prototype.hasOwnProperty.call(fresh.config,CONFIG)||!Object.prototype.hasOwnProperty.call(fresh.config,TYPECONFIG)||JSON.stringify(fresh.rows)!==JSON.stringify(draft)||JSON.stringify(fresh.config[TYPECONFIG]||[])!==JSON.stringify(customTypes))await rpc('saveConfig',{config});const check=await loadRules();
     if(!Object.prototype.hasOwnProperty.call(check.config,CONFIG)||!Object.prototype.hasOwnProperty.call(check.config,TYPECONFIG)||JSON.stringify(check.rows)!==JSON.stringify(draft))throw Error('雲端尚未保存這份加班選項，未確認儲存成功；請保留視窗再試');
     loadedRows=JSON.stringify(check.rows);loadedTypes=JSON.stringify(check.config[TYPECONFIG]||[]);if(loadedTypes!==JSON.stringify(customTypes))throw Error('加班類型讀回不一致');
     const current=global.p79OvertimeContext?.config?.();if(current)Object.assign(current,check.config);try{global.p79OvertimeContext?.persistConfig?.();}catch(error){console.warn('加班選項已在雲端保存，本機快取更新失敗',error);}global.dispatchEvent?.(new CustomEvent('p79-overtime-options-saved'));el.querySelector('#p79OtStatus').textContent='✅ 加班類型與出勤時段已儲存，之後申報可直接選用。';
    }catch(e){el.querySelector('#p79OtStatus').textContent='❌ '+e.message;}finally{b.disabled=false}
   };
   const setReady=ready=>{
    cloudReady=ready;
    ['p79OtAdd','p79AddType','p79OtSave','p79OtImport'].forEach(id=>el.querySelector('#'+id).disabled=!ready);
    body.querySelectorAll('input,select,button').forEach(input=>input.disabled=!ready);
   };
   const reload=async()=>{
    if(reading)return;
    let dirty=false;try{dirty=cloudReady&&(JSON.stringify(validate(getRows()))!==loadedRows||JSON.stringify(customTypes)!==loadedTypes);}catch(error){el.querySelector('#p79OtStatus').textContent='修改內容尚未通過驗證：'+error.message+'；請先修正或匯出，未重新載入。';return;}
    if(dirty){
     el.querySelector('#p79OtStatus').textContent='有尚未儲存的修改，請先儲存或匯出；未重新載入覆蓋你的內容。';return;
    }
    reading=true;setReady(false);el.querySelector('#p79OtReload').disabled=true;
    try{
     const loaded=await loadRules();if(!el.isConnected)return;
     rows=loaded.rows;loadedRows=JSON.stringify(validate(rows));customTypes=JSON.parse(JSON.stringify(loaded.config[TYPECONFIG]||[]));loadedTypes=JSON.stringify(customTypes);
     body.innerHTML=rows.map(editorRow).join('');
     if(cached){for(const key of [CONFIG,TYPECONFIG])if(!Object.prototype.hasOwnProperty.call(loaded.config,key))delete cached[key];Object.assign(cached,loaded.config);}
     try{global.p79OvertimeContext?.persistConfig?.();}catch(error){console.warn('加班選項本機快取未更新',error);}
     global.dispatchEvent?.(new CustomEvent('p79-overtime-options-saved'));
     setReady(true);el.querySelector('#p79OtStatus').textContent=Object.prototype.hasOwnProperty.call(loaded.config,CONFIG)?'已讀取雲端儲存的加班選項；修改後按儲存。':'雲端尚未儲存加班選項，目前顯示預設表；請按儲存建立雲端設定。';
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
  if(!handoff||String(handoff.id)!==String(draft.leaveHandoffId)||!Array.isArray(handoff.entries))return null;
  const index=handoff.entries.findIndex(e=>String(e.empId)===String(draft.empId)&&e.date===draft.date&&String(e.forEmpId||'')===String(draft.forEmpId||''));
  if(index<0)return null;
  handoff.entries.splice(index,1);
  if(handoff.entries.length)sessionStorage.setItem(key,JSON.stringify(handoff));else sessionStorage.removeItem(key);
  return {remaining:handoff.entries.length};
 }
 function showReportLoading(){const el=dialog('申報加班','<p id="p79OtStatus">正在同時核對代班安排與加班選項…</p>');el.onclose=()=>el.remove();return el;}
 async function openReport(prefill={}){
  const loading=showReportLoading();
  try{
   if((!global.p79OvertimeContext?.canReport?.()||!global.p79OvertimeContext?.employees?.().length)&&global.p79OvertimeContext?.refreshAccess)await global.p79OvertimeContext.refreshAccess();
   if(loading.isConnected===false)return;
   if(!global.p79OvertimeContext?.canReport?.()){loading.remove?.();return alert('沒有申報加班權限');}
  }catch(error){loading.querySelector('#p79OtStatus').textContent='人員載入失敗：'+error.message;return;}
  const el=dialog('申報加班','<p id="p79OtStatus">正在讀取加班換算表…</p>');
  try{
   const extra=[],window=prefill.attendance&&declarationWindow(prefill.attendance.start,prefill.attendance.end,prefill.date,prefill.roster);
   if(window&&window.minutes>0){const hour=new Date(window.start+8*3600000).getUTCHours();extra.push([hour||24,window.minutes/60]);}
   let rows=specialRows(reportRules(),global.p79OvertimeContext.config(),extra);
   if(prefill.attendance&&prefill.roster&&!prefill.savedReport){
    const kinds=global.P79SpecialOvertime?.forShift(prefill.attendance.start,prefill.attendance.end)||[];
    const special=kinds.flatMap(p=>p.kinds).filter(k=>['颱','選'].includes(k.code));
    if(special.length){const inferred=suggestRule(prefill.attendance.start,prefill.attendance.end,prefill.date,prefill.roster,rows,special);if(inferred)prefill={...prefill,code:inferred[1],category:inferred[0],preferredType:ruleType(inferred),requirePeriodSelection:false};}
   }
   const people=global.p79OvertimeContext.employees();
   el.insertAdjacentHTML('beforeend','<div class="p79-report-grid"><label>加班類型<select id="p79OtKind" style="'+inputStyle+'"></select></label><label>加班日期<input id="p79OtDate" type="date" style="'+inputStyle+'"></label><label id="p79OtLeaveDatesWrap" style="display:none">請假日期（依核准紀錄）<select id="p79OtLeaveDates" style="'+inputStyle+'"></select></label><label id="p79OtForWrap">請假人員<select id="p79OtForEmp" style="'+inputStyle+'"></select></label><label>職稱篩選<select id="p79OtRole" style="'+inputStyle+'"></select></label><label>代班／加班人員<select id="p79OtEmp" style="'+inputStyle+'"></select></label><label>出勤時段<select id="p79OtCode" style="'+inputStyle+'"></select></label><label>備註<input id="p79OtNote" maxlength="200" style="'+inputStyle+'"></label></div><div id="p79OtPreview" style="padding:8px;border-radius:8px"></div><p style="font-size:12px;color:#64748b;margin:4px 0">每位人員分別儲存一筆；儲存後可切換下一位人員繼續申報。</p><button id="p79OtStage" type="button" style="background:#0369a1;color:white;padding:9px 16px;border-radius:8px">儲存加班申報</button>');
   el.querySelector('#p79OtDate').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
   const forSelect=el.querySelector('#p79OtForEmp'),empSelect=el.querySelector('#p79OtEmp');
   const dateInput=el.querySelector('#p79OtDate'),leaveDateSelect=el.querySelector('#p79OtLeaveDates'),leaveDateWrap=el.querySelector('#p79OtLeaveDatesWrap');
   const leaveRecords=global.p79OvertimeContext?.approvedLeaves?.()||[];
   let approvedDates=[];
   const stroke=new Intl.Collator('zh-TW-u-co-stroke',{numeric:true});
   const sortedPeople=[...people].sort((a,b)=>stroke.compare(String(a.name||''),String(b.name||''))||String(a.empId).localeCompare(String(b.empId)));
   const sorted=()=>sortedPeople;
   const roleSelect=el.querySelector('#p79OtRole');
   const roleOf=e=>String(e.jobTitle||e.role||e.position||'未設定職稱').trim()||'未設定職稱';
   const roles=[...new Set(sortedPeople.map(roleOf))].sort((a,b)=>stroke.compare(a,b));
   roleSelect.innerHTML='<option value="">全部職稱</option>'+roles.map(role=>'<option value="'+esc(role)+'">'+esc(role)+'</option>').join('');
   forSelect.innerHTML='<option value="">請選擇請假人員</option>'+sorted().map(e=>'<option value="'+esc(e.empId)+'">'+esc(e.name+'（'+e.empId+'）'+(e.dept?'｜'+e.dept:''))+'</option>').join('');
   function refreshPairPeople(){
    const rule=select.selectedIndex<0?null:rows[Number(select.value)],target=people.find(e=>String(e.empId)===String(forSelect.value)),previous=empSelect.value;
    const allowed=prefill.allowedEmpIds?.length?prefill.allowedEmpIds:prefill.leaveHandoffId?[prefill.empId]:null;
    const matches=sorted().filter(e=>(!roleSelect.value||roleOf(e)===roleSelect.value)&&(!allowed||allowed.some(id=>String(id)===String(e.empId)))&&(rule?.[0]!=='代'||target&&String(target.dept||'').trim()&&String(e.dept||'').trim()===String(target.dept||'').trim()&&String(e.empId)!==String(target.empId)));
    empSelect.innerHTML='<option value="">'+(rule?.[0]==='代'&&!target?'先選左邊請假人員':matches.length?'請選擇代班人員':'同部門沒有可代班人員')+'</option>'+matches.map(e=>'<option value="'+esc(e.empId)+'">'+esc(e.name+'（'+e.empId+'）')+'</option>').join('');
    if(matches.some(e=>String(e.empId)===previous))empSelect.value=previous;
   }
   const kind=el.querySelector('#p79OtKind'),select=el.querySelector('#p79OtCode');
   const matches=r=>matchesReportType(r,kind.value);

   const findPrefill=(code,category)=>{const exact=rows.findIndex(r=>r[1]===code&&r[0]===category);if(exact>=0)return exact;if(category!=='延')return -1;const m=String(code||'').match(/(\d{2}(?::\d{2})?)-(\d{2}(?::\d{2})?)$/);if(!m)return -1;const candidates=rows.map((r,i)=>({r,i})).filter(({r})=>r[0]==='延'&&((hour(m[1])%1440===hour(r[6])%1440&&hour(m[2])%1440===hour(r[7])%1440)||(hour(m[1])%1440===hour(r[8]==='after'?r[4]:r[6])%1440&&hour(m[2])%1440===hour(r[8]==='after'?r[7]:r[5])%1440)));return candidates.length===1?candidates[0].i:-1;};
   const refresh=()=>{const previous=select.value;select.innerHTML=rows.map((r,i)=>({r,i})).filter(({r})=>matches(r)).map(({r,i})=>'<option data-ot-category="'+r[0]+'" value="'+i+'">'+esc(displayPeriodCode(r))+'</option>').join('');if(previous!==''&&rows[Number(previous)]&&matches(rows[Number(previous)]))select.value=previous;preview()};
   function preview(){const r=select.selectedIndex<0?null:rows[Number(select.value)];for(const field of [kind,select,el.querySelector('#p79OtPreview')])field.setAttribute?.('data-ot-category',r?.[0]||'');refreshPairPeople();forSelect.disabled=!!prefill.leaveHandoffId||!['代','延'].includes(r?.[0]);empSelect.disabled=!!prefill.leaveHandoffId&&r?.[0]==='代'&&!(prefill.allowedEmpIds?.length>1);if(empSelect.disabled)empSelect.value=String(prefill.empId||'');el.querySelector('#p79OtForWrap').style.display=['代','延'].includes(r?.[0])?'flex':'none';if(prefill.leaveHandoffId)forSelect.value=String(prefill.forEmpId||'');else if(!['代','延'].includes(r?.[0]))forSelect.value='';el.querySelector('#p79OtPreview').textContent=r&&matches(r)?'出勤時段 '+displayPeriodCode(r)+(r[0]==='延'?'｜正常班 '+r[4]+'-'+r[5]:'')+'｜申報 '+r[2]+' 小時｜換算 '+(r[3]===''?'未設定':r[3]+' 小時'):'尚未設定這類加班規則';if(r?.[0]==='代'){const worker=people.find(e=>String(e.empId)===String(empSelect.value)),target=people.find(e=>String(e.empId)===String(forSelect.value));el.querySelector('#p79OtPreview').textContent+='｜代班：'+(worker?.name||'未選擇')+'｜請假：'+(target?.name||'未選擇');}}
   const refreshTypes=()=>{const previous=kind.value,options=typeOptions(global.p79OvertimeContext?.config?.()||{},rows);kind.innerHTML=options.map(x=>'<option data-ot-category="'+x.category+'" value="'+esc(x.name)+'">'+esc(x.name)+'</option>').join('');if(options.some(x=>x.name===previous))kind.value=previous;refresh();};
   function syncApprovedLeaveDate(){
    const forId=String(forSelect.value||'');
    approvedDates=approvedLeaveDateChoices(leaveRecords,forId);
    leaveDateWrap.style.display=forId?'flex':'none';
    leaveDateSelect.innerHTML='<option value="">'+(approvedDates.length?'請選核准請假日期':'沒有可核對的已核准請假日期')+'</option>'+approvedDates.map(d=>'<option value="'+d+'">'+d.replaceAll('-','/')+'</option>').join('');
    if(!forId)return;
    if(prefill.leaveHandoffId){
     dateInput.value=prefill.date||'';
     if(approvedDates.includes(dateInput.value))leaveDateSelect.value=dateInput.value;
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
   roleSelect.onchange=()=>{refreshPairPeople();preview();};kind.onchange=()=>{prefill.preferredType='';refresh();};select.onchange=preview;
   forSelect.onchange=()=>{syncApprovedLeaveDate();preview();};
   leaveDateSelect.onchange=()=>{dateInput.value=leaveDateSelect.value;refresh();};
   empSelect.onchange=refresh;
   dateInput.onchange=()=>{if(forSelect.value&&approvedDates.length)leaveDateSelect.value=approvedDates.includes(dateInput.value)?dateInput.value:'';refresh();};
   refreshTypes();el.querySelector('#p79OtStatus').textContent='請選擇員工、日期與出勤時段。';
   if(prefill.empId||prefill.forEmpId){
    el.querySelector('#p79OtDate').value=prefill.date||el.querySelector('#p79OtDate').value;
    if(prefill.forEmpId)forSelect.value=String(prefill.forEmpId);
    const match=findPrefill(prefill.code,prefill.category);
    const categoryMatch=match>=0?match:rows.findIndex(r=>r[0]===prefill.category);
    if(categoryMatch>=0){kind.value=ruleType(rows[categoryMatch]);refresh();}
    if(match>=0){select.value=String(match);preview();}
    else if(prefill.code||prefill.requirePeriodSelection){select.selectedIndex=-1;select.value='';el.querySelector('#p79OtStatus').textContent=prefill.periodHint|| (prefill.code?'班表時段 '+prefill.code+' 尚無相符選項，請新增或選擇正確時段。':'代班已確認；班表無法推算時段，請自行選擇正確出勤時段。');}
    const prefilledWorker=people.find(e=>String(e.empId)===String(prefill.empId));
    if(prefilledWorker&&roleSelect.value&&roleOf(prefilledWorker)!==roleSelect.value)roleSelect.value='';
    refreshPairPeople();empSelect.value=String(prefill.empId);syncApprovedLeaveDate();preview();
   }
   function applyPreferredType(){
    const requested=prefill.preferredType;if(!requested)return;
    if(!typeOptions(global.p79OvertimeContext?.config?.()||{},rows).some(x=>x.name===requested)){select.selectedIndex=-1;select.value='';el.querySelector('#p79OtStatus').textContent='原選加班類型已變更，請重新選擇類型與出勤時段。';return;}
    kind.value=requested;refresh();
    const period=String(prefill.code||'').match(/(\d{2}(?::\d{2})?)-(\d{2}(?::\d{2})?)$/);
    const candidates=rows.map((r,i)=>({r,i})).filter(({r})=>matchesReportType(r,requested)&&(r[1]===prefill.code||period&&hour(period[1])%1440===hour(r[6])%1440&&hour(period[2])%1440===hour(r[7])%1440));
    if(candidates.length===1){select.value=String(candidates[0].i);preview();}
    else{select.selectedIndex=-1;select.value='';preview();el.querySelector('#p79OtStatus').textContent='已帶入「'+requested+'」，請選擇本位人員的出勤時段。';}
   }
   applyPreferredType();
   el.insertAdjacentHTML('beforeend',' <button id="p79OtManageOptions" type="button" style="margin-left:10px;padding:10px;border:1px solid #0369a1;border-radius:8px">＋新增／儲存加班選項</button>');el.querySelector('#p79OtManageOptions').onclick=openRules;el.querySelector('#p79OtManageOptions').style.display=global.p79OvertimeContext?.canEditRules?.()?'inline-block':'none';
   function applyReportRows(nextRows){
    const previous=select.selectedIndex>=0?rows[Number(select.value)]:null;
    rows=specialRows(nextRows,global.p79OvertimeContext.config(),extra);refreshTypes();
    const code=previous?.[1]||prefill.code,category=previous?.[0]||prefill.category;
    const index=findPrefill(code,category);
    if(index>=0){if(!matches(rows[index])){kind.value=ruleType(rows[index]);refresh();}select.value=String(index);preview();}
    else if(code||prefill.requirePeriodSelection){select.selectedIndex=-1;select.value='';preview();}
    if(prefill.preferredType&&!previous)applyPreferredType();
   }
   const optionsSaved=()=>{if(el.isConnected)applyReportRows(reportRules());};
   el.insertAdjacentHTML('beforeend','<button id="p79OtReloadOptions" type="button">更新雲端時段選項</button>');
   el.querySelector('#p79OtReloadOptions').onclick=async()=>{const button=el.querySelector('#p79OtReloadOptions');if(button.disabled)return;button.disabled=true;try{const loaded=await loadRules();Object.assign(global.p79OvertimeContext.config(),loaded.config);global.p79OvertimeContext.persistConfig?.();applyReportRows(loaded.rows);el.querySelector('#p79OtStatus').textContent='已更新 '+rows.length+' 個出勤時段選項。';}catch(error){el.querySelector('#p79OtStatus').textContent='選項更新失敗：'+error.message;}finally{button.disabled=false}};
   // Render cached options immediately; reconcile missing legacy labels with authoritative cloud rows.
   if(prefill.code&&findPrefill(prefill.code,prefill.category)<0){
    loadRules().then(loaded=>{if(!el.isConnected)return;Object.assign(global.p79OvertimeContext.config(),loaded.config);global.p79OvertimeContext.persistConfig?.();applyReportRows(loaded.rows);el.querySelector('#p79OtStatus').textContent=select.selectedIndex>=0?'已從雲端更新並帶入出勤時段。':'已更新雲端選項；請選擇符合的出勤時段。';}).catch(error=>{if(el.isConnected)el.querySelector('#p79OtStatus').textContent='雲端時段更新失敗：'+error.message+'；可按更新雲端時段選項重試。';});
   }
   global.addEventListener?.('p79-overtime-options-saved',optionsSaved);
   el.p79Cleanup=()=>global.removeEventListener?.('p79-overtime-options-saved',optionsSaved);
   el.onclose=()=>{el.p79Cleanup();el.remove();};
   el.querySelector('#p79OtStage').onclick=async()=>{
    try{if(select.selectedIndex<0)throw Error('請先選擇正確出勤時段；若沒有符合的選項，請新增加班規則');
     const date=el.querySelector('#p79OtDate').value,empId=el.querySelector('#p79OtEmp').value;
     if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!empId)throw Error('請選擇員工與日期');
     validateLeaveLinkedOvertimeDate(date,forSelect.value,approvedDates,prefill.leaveHandoffId?prefill.date:'');
     if(prefill.attendance&&String(prefill.empId)===String(empId)&&prefill.date===date){const issue=ruleAttendanceIssue(prefill.attendance.start,prefill.attendance.end,date,rows[Number(select.value)]);if(issue)throw Error(issue);}
     const draft={id:crypto.randomUUID(),empId,date,rule:report(rows[Number(select.value)]),...reportPair(prefill.leaveHandoffId?'代':rows[Number(select.value)][0],empId,prefill.leaveHandoffId?prefill.forEmpId:forSelect.value,people),note:el.querySelector('#p79OtNote').value,createdAt:Date.now(),gasUrl:auth().url,autoSave:true,leaveHandoffId:prefill.leaveHandoffId||''};
     try{const pending=JSON.parse(sessionStorage.getItem(KEY)||'null');
      if(pending&&pending.gasUrl===draft.gasUrl&&pending.empId===draft.empId&&pending.date===draft.date&&pending.forEmpId===draft.forEmpId&&pending.note===draft.note&&pending.leaveHandoffId===draft.leaveHandoffId&&JSON.stringify(pending.rule)===JSON.stringify(draft.rule)){draft.id=pending.id;draft.createdAt=pending.createdAt;}
     }catch(ignore){}
     sessionStorage.setItem(KEY,JSON.stringify(draft));
     if(typeof global.p79OvertimeContext?.saveReport==='function'){
      const button=el.querySelector('#p79OtStage');if(button.disabled)return;let completed=false;button.disabled=true;el.querySelector('#p79OtStatus').textContent='正在確認出勤時段並儲存加班…';
      try{
       await ensureSpecialRule(rows[Number(select.value)]);
       const result=await global.p79OvertimeContext.saveReport(draft);
       if(result?.ok!==true||result.directOvertimeSaved!==true||result.id!==draft.id)throw Error('尚未收到加班儲存確認，已保留申報內容');
       sessionStorage.removeItem(KEY);el.querySelector('#p79OtStatus').textContent=result.report?.planned?'✅ 預排加班已儲存；待實際出勤完成後核算，不會先填入打卡時間。':'✅ 加班申報已儲存，已更新加班管理。';
       global.dispatchEvent?.(new CustomEvent('p79-overtime-report-saved',{detail:{draft,result}}));
       if(draft.leaveHandoffId&&typeof global.p79OpenLeaveOvertimeHandoff==='function'){
        completed=true;
        try{
         const progress=advanceLeaveHandoff(draft);
         if(progress&&progress.remaining){el.close();await global.p79OpenLeaveOvertimeHandoff();}
         else if(progress){el.querySelector('#p79OtStatus').textContent='✅ 本次請假代班的加班申報已全部完成。';button.textContent='全部申報完成';el.close();}
         else el.querySelector('#p79OtStatus').textContent='✅ 本筆已儲存；待申報清單已變更，請按接續申報核對剩餘項目。';
        }catch(error){el.querySelector('#p79OtStatus').textContent='✅ 本筆已儲存；接續申報未完成：'+error.message+'。請按接續申報核對剩餘項目。';}
       }else{completed=true;el.close();}

      }finally{button.disabled=completed}
     }else throw Error('申報儲存模組尚未載入；內容已保留，請重新整理後接續申報。');
    }catch(e){el.querySelector('#p79OtStatus').textContent='❌ '+e.message}
   };
  }catch(e){el.querySelector('#p79OtStatus').textContent='❌ '+e.message}
 }
 global.P79Overtime={specialRows,ensureSpecialRule,suggestRule,declarationEnd,declarationWindow,ruleAttendanceIssue,advanceLeaveHandoff,KEY,CONFIG,defaults,validate,excelRows,parseExcelRows,report,interval,overtimeMinutes,inferRule,matchReport,reportRules,showReportLoading,loadRules,resolveLeaveCoverReport,matchesReportType,displayPeriodCode,filterReportEmployees,reportPair,approvedLeaveDateChoices,validateLeaveLinkedOvertimeDate,typeOptions,ruleType,openRules,openReport,time};
})(typeof window==='undefined'?globalThis:window);



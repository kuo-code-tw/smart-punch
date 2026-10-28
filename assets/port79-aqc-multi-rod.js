/* AQC multi-rod operations: isolated from official vessel job totals. */
(function(g){
 'use strict';
 const ID='view-multi-rod';
 // Current site-wide operating limit; not an inferred total from overlapping service windows.
 // Raise this only when physical equipment capacity actually increases.
 const CURRENT_AQC_CAPACITY=4;
 const $=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const session=()=>{try{return JSON.parse(sessionStorage.getItem('admin_session')||sessionStorage.getItem('port79_user_session')||'null')}catch(_){return null}};
 const key=()=>{const s=session();return 'p79-aqc-multi-rod-v1:'+String(s?.empId||s?.id||'unknown').trim().toUpperCase()};
 const canEdit=()=>typeof g.canManageEfficiency==='function'&&g.canManageEfficiency();
 const canView=()=>typeof g.requireEfficiencyAccess==='function'&&g.requireEfficiencyAccess();
 let state={scope:'',rows:[],revision:'',checked:0,epoch:0},loading=null,busy=false,pending=null;
 const identity=()=>{const s=session();return canView()?JSON.stringify([key(),s?.adminRole||'',s?.unit||'',s?.department||'',typeof getGasUrl==='function'?getGasUrl():'',s?.systemPermissions||{},s?.finePermissions||{},s?.dataScope||{},s?.jobScopes||{}]):''};
 const cacheKey=scope=>'p79-aqc-cloud-v1:'+scope;
 function current(){const scope=identity();if(scope!==state.scope){state={scope,rows:[],revision:'',checked:0,epoch:0};pending=null;if(scope)try{const v=JSON.parse(localStorage.getItem(cacheKey(scope))||'null');if(v&&Array.isArray(v.rows)&&v.revision){state.rows=v.rows;state.revision=v.revision;state.checked=Date.now();}}catch(_){} }return state;}
 const getRows=()=>current().rows;
 const legacyRows=()=>{try{const rows=JSON.parse(localStorage.getItem(key())||'[]');return Array.isArray(rows)?rows:[]}catch(_){return []}};
 function persist(){try{if(state.scope)localStorage.setItem(cacheKey(state.scope),JSON.stringify({rows:state.rows,revision:state.revision}));}catch(_){notice('雲端已確認，本機快取空間不足；下次將重新讀取。',true);}}
 async function sync(force=false){
  const st=current();if(!st.scope)return;if(loading?.scope===st.scope)return loading.promise;
  if(!force&&Date.now()-st.checked<600000)return;
  const scope=st.scope,epoch=st.epoch,token=typeof gcToken!=='undefined'?gcToken:'';
  const promise=(async()=>{try{
   notice(st.revision?'先顯示本機快取，正在核對雲端版本…':'正在讀取 AQC 雲端紀錄…');
   const result=await apiGetQuick('gcGetAqcMultiRod',st.revision?{revision:st.revision}:{},25000);
   if(identity()!==scope||state.epoch!==epoch||(typeof gcToken!=='undefined'&&gcToken!==token))return;
   if(!result.unchanged){if(!Array.isArray(result.records))throw Error('GAS 未回傳完整 AQC 紀錄，請確認後端部署');state.rows=result.records;}
   state.revision=String(result.revision);state.checked=Date.now();persist();render();notice('人工登錄雲端已核對，共 '+state.rows.length+' 筆；既有船舶作業會另外自動判讀。');
  }catch(err){if(identity()===scope&&state.epoch===epoch)notice('雲端核對失敗：'+err.message+'。目前顯示本機快取，尚未確認最新資料。',true);}
  finally{if(loading?.scope===scope){loading=null;if(identity()===scope&&state.epoch!==epoch)void sync(true);}}})();loading={scope,promise};return promise;
 }
 function mutationId(){return 'MRM-'+(g.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2));}
 async function write(item,operation,expectedVersion){
  const scope=identity(),token=typeof gcToken!=='undefined'?gcToken:'';if(!scope)throw Error('請先登入');
  const request={record:item,operation,expectedVersion},signature=JSON.stringify(request);
  if(!pending||pending.signature!==signature)pending={signature,id:mutationId()};
  const result=await apiPost('gcSaveAqcMultiRod',{...request,mutationId:pending.id});
  if(identity()!==scope||(typeof gcToken!=='undefined'&&gcToken!==token))throw Error('登入身分已變更，請由原帳號核對儲存結果');
  const saved=result.record;
  if(!saved||saved.id!==item.id||saved.version!==expectedVersion+1||saved.deleted!==(operation==='delete')||Object.keys(item).some(k=>saved[k]!==item[k]))throw Error('AQC 雲端內容未通過讀回確認，請保留表單重試');
  const st=current();st.epoch++;st.rows=st.rows.filter(r=>r.id!==saved.id);if(!saved.deleted)st.rows.push(saved);
  // This receipt verifies one row, not the completeness of the cached collection.
  st.checked=0;persist();pending=null;return saved;
 }
 function editAllowed(action){const s=session();return canEdit()&&(String(s?.adminRole||'').toLowerCase()==='superadmin'||s?.finePermissions?.efficiency?.[action]!==false);}
 const val=id=>$(id)?.value??'';
 function notice(msg,isError){const box=$('multiRodNotice');if(!box)return;box.textContent=msg;box.className='text-sm font-semibold '+(isError?'text-rose-700':'text-emerald-700');}
 function utcLocalTime(date){const d=new Date(date);if(!Number.isFinite(d.getTime()))return '';const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(d);const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return v.year+'-'+v.month+'-'+v.day+'T'+v.hour+':'+v.minute}
 function mount(){
  if($(ID)||!$('view-dashboard'))return;
  const section=document.createElement('section');section.id=ID;section.className='hidden space-y-4';
  section.innerHTML=[
  '<div class="card p-4 sm:p-5 space-y-4">',
  '<div class="flex flex-wrap gap-3 items-center justify-between"><div><h2 class="text-xl font-black text-slate-900">⚓ AQC 多桿作業管理</h2><p class="text-sm text-slate-500 mt-1">找出整個碼頭同一時段使用 4 隻以上 AQC 的作業，包含多艘船合計；先讀快取立即顯示。</p></div>',
  '<button type="button" id="multiRodAdd" class="btn bg-indigo-600 text-white">人工修正（選用）</button></div>',
  '<p class="rounded-xl bg-sky-50 text-sky-900 border border-sky-200 p-3 text-sm">目前現場同時作業上限為 <b>4 桿</b>。WORKING SHEET 開工至完工是作業涵蓋區間，不代表全程連續動桿。若來源出現 5 桿以上重疊，標為「上限 4 桿／待核對」，不能當成已確認五桿；每支 AQC 與各船分配仍可展開核對。日後現場設備增加時可更新實際上限。原船舶請款資料不變。</p>',
  '<div class="flex flex-wrap gap-3 items-end">',
  '<label class="text-sm font-bold">查詢日期<input id="multiRodDate" type="date" class="block border rounded-xl px-3 py-2 mt-1"></label>',
  '<label class="text-sm font-bold">最低桿數<input id="multiRodMin" type="number" min="1" step="1" value="4" class="block border rounded-xl px-3 py-2 mt-1 w-28"></label>',
  '<label class="text-sm font-bold">顯示<select id="multiRodMode" class="block border rounded-xl px-3 py-2 mt-1"><option value="day">指定日期</option><option value="month">整個月份</option><option value="all">全部紀錄</option></select></label>',
  '<button type="button" id="multiRodRefresh" class="btn bg-slate-100">重新核對雲端</button><button type="button" id="multiRodImport" class="btn bg-amber-50">匯入此帳號舊本機紀錄</button>',
  '<button type="button" id="multiRodExport" class="btn bg-emerald-600 text-white">📥 匯出 Excel（明細＋彙總）</button></div>',
  '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">',
  '<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs text-slate-500">顯示船舶</div><div id="multiRodShips" class="text-xl font-black">0 艘</div></div>',
  '<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs text-slate-500">作業組數</div><div id="multiRodEvents" class="text-xl font-black">0 筆</div></div>',
  '<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs text-slate-500">現場上限／來源峰值</div><div id="multiRodContainers" class="text-xl font-black">0</div></div>',
  '<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs text-slate-500">資料來源</div><div id="multiRodHatches" class="text-xl font-black">0／0</div></div></div>',
  '<div id="multiRodSourceState" class="text-sm text-slate-600" role="status"></div>',
  '<details class="bg-slate-50 border rounded-xl p-3"><summary class="cursor-pointer font-bold text-sm text-slate-700">🔎 檢查資料日期與各船桿數（包含未達 4 桿）</summary><div id="multiRodSourceAudit" class="mt-3 text-sm text-slate-700"></div><div id="multiRodSourcePreview" class="mt-3 text-xs space-y-1"></div></details>',
  '<div class="overflow-x-auto"><table class="tbl w-full min-w-[780px] text-center"><thead><tr><th>作業開始</th><th>作業結束</th><th>同時作業船舶／期間各船來源峰值</th><th>期間來源最高桿數</th><th>來源／AQC 起訖核對</th></tr></thead><tbody id="multiRodBody"></tbody></table></div>',
  '<div id="multiRodNotice" role="status" aria-live="polite" class="text-sm text-slate-600"></div></div>',
  '<div id="multiRodEditor" class="card p-4 sm:p-5 space-y-4 hidden">',
  '<h3 id="multiRodFormTitle" class="text-lg font-black">新增 AQC 作業紀錄</h3>',
  '<form id="multiRodForm" class="space-y-3"><input id="multiRodEditId" type="hidden">',
  '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">',
  '<label class="text-sm font-bold">船名 *<input id="multiRodShip" list="multiRodShipOptions" maxlength="120" required class="block w-full border rounded-xl px-3 py-2 mt-1" placeholder="選擇現有船名或自行輸入"><datalist id="multiRodShipOptions"></datalist></label>',
  '<label class="text-sm font-bold">航次<input id="multiRodVoyage" maxlength="60" class="block w-full border rounded-xl px-3 py-2 mt-1" placeholder="選填"></label>',
  '<label class="text-sm font-bold">AQC 桿數 *<input id="multiRodRods" type="number" required min="1" step="1" class="block w-full border rounded-xl px-3 py-2 mt-1" value="4"></label>',
  '<label class="text-sm font-bold">作業開始時間 *<input id="multiRodStart" type="datetime-local" required class="block w-full border rounded-xl px-3 py-2 mt-1"></label>',
  '<label class="text-sm font-bold">作業結束時間<input id="multiRodEnd" type="datetime-local" class="block w-full border rounded-xl px-3 py-2 mt-1"><span class="text-xs text-slate-500">尚未結束可留空，跨日請輸入隔日日期。</span></label>',
  '<label class="text-sm font-bold">櫃數<input id="multiRodBoxes" type="number" min="0" step="1" value="0" class="block w-full border rounded-xl px-3 py-2 mt-1"></label>',
  '<label class="text-sm font-bold">艙蓋數<input id="multiRodHC" type="number" min="0" step="1" value="0" class="block w-full border rounded-xl px-3 py-2 mt-1"></label>',
  '<label class="text-sm font-bold">翻艙數<input id="multiRodShift" type="number" min="0" step="1" value="0" class="block w-full border rounded-xl px-3 py-2 mt-1"></label>',
  '<label class="text-sm font-bold md:col-span-2 lg:col-span-3">備註<textarea id="multiRodNote" maxlength="500" rows="2" class="block w-full border rounded-xl px-3 py-2 mt-1" placeholder="加減桿、停機、作業說明"></textarea></label>',
  '</div><div class="flex flex-wrap gap-2"><button type="submit" class="btn bg-indigo-600 text-white">儲存至雲端</button><button type="button" id="multiRodCancel" class="btn bg-slate-100">取消</button></div></form></div>'
  ].join('');
  $('view-dashboard').parentNode.insertBefore(section,$('view-dashboard'));
  $('multiRodDate').value=today();
  $('multiRodDate').addEventListener('change',()=>{render();void syncSource()});
  $('multiRodMin').addEventListener('input',render);
  $('multiRodMode').addEventListener('change',render);
  $('multiRodAdd').addEventListener('click',()=>openEditor());
  $('multiRodCancel').addEventListener('click',()=>{$('multiRodEditor').classList.add('hidden')});
  $('multiRodForm').addEventListener('submit',save);
  $('multiRodExport').addEventListener('click',exportExcel);
  $('multiRodRefresh').addEventListener('click',()=>{void sync(true);void syncSource(true)});
  $('multiRodImport').addEventListener('click',importLegacy);

 }
 function candidates(){
  const raw=typeof shipMasters!=='undefined'&&Array.isArray(shipMasters)?shipMasters:[];
  const uniq=new Map();
  raw.forEach(s=>{const vessel=String(s.vessel||'').trim();if(vessel&&!uniq.has(vessel))uniq.set(vessel,s)});
  return [...uniq.values()].sort((a,b)=>String(a.vessel).localeCompare(String(b.vessel),'zh-Hant'));
 }
 function options(){
  const el=$('multiRodShipOptions');if(el)el.innerHTML=candidates().map(s=>'<option value="'+esc(s.vessel)+'"></option>').join('');
 }
 function openEditor(row){
  if(busy)return;if(!editAllowed(row&&!['auto','sheet','master','overlap'].includes(row.source)?'records.edit':'records.create')){alert('目前帳號沒有此項效率管理權限');return}
  options();$('multiRodForm').reset();pending=null;$('multiRodEditId').value=['auto','sheet','master','overlap'].includes(row?.source)?'':(row?.id||'');$('multiRodEditId').dataset.version=String(row?.version||0);
  $('multiRodEditor').dataset.scope=identity();
  $('multiRodFormTitle').textContent=['auto','sheet','master','overlap'].includes(row?.source)?'確認現有船舶多桿作業':row?'編輯 AQC 作業紀錄':'新增 AQC 作業紀錄';
  $('multiRodShip').value=row?.ship||'';$('multiRodVoyage').value=row?.voyage||'';
  $('multiRodRods').value=row?.rods??4;$('multiRodStart').value=row?.hasActualTimes===false?'':row?.start||utcLocalTime(new Date());
  $('multiRodEnd').value=row?.end||'';$('multiRodBoxes').value=row?.containers??0;
  $('multiRodHC').value=row?.hatches??0;$('multiRodShift').value=row?.shiftMoves??0;
  $('multiRodNote').value=row?.note||'';
  $('multiRodEditor').classList.remove('hidden');
  $('multiRodEditor').scrollIntoView({behavior:'smooth',block:'start'});
 }
 function integer(id,min,max){
  const raw=val(id).trim();const n=Number(raw);if(raw===''||!Number.isSafeInteger(n)||n<min||n>max)throw Error(id==='multiRodRods'?'桿數須為 1 以上的整數':'櫃數、艙蓋與翻艙須為非負整數');return n;
 }
 async function save(e){
  e.preventDefault();if(busy)return;if(!editAllowed(Number($('multiRodEditId').dataset.version||0)>0?'records.edit':'records.create')){notice('沒有新增或修改權限',true);return}
  busy=true;const submit=$('multiRodForm').querySelector('[type=submit]');submit.disabled=true;
  try{
   if($('multiRodEditor').dataset.scope!==identity())throw Error('登入身分已變更，請重新開啟編輯');
   const ship=val('multiRodShip').trim(),start=val('multiRodStart'),end=val('multiRodEnd');
   if(!ship||!start)throw Error('請輸入船名及作業開始時間');
   if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start)||!Number.isFinite(Date.parse(start)))throw Error('作業開始時間格式錯誤');
   if(end&&(!Number.isFinite(Date.parse(end))||Date.parse(end)<Date.parse(start)))throw Error('結束時間不能早於開始時間');
   const rows=getRows(),id=val('multiRodEditId');
   const old=rows.find(x=>x.id===id);
   if(id&&!old&&Number($('multiRodEditId').dataset.version)>0)throw Error('原紀錄已不存在，請重新開啟');
   const master=candidates().find(x=>String(x.vessel).trim()===ship);
   const item={id:id||('MR-'+Date.now()+'-'+Math.random().toString(36).slice(2,10)),ship,voyage:val('multiRodVoyage').trim()||String(master?.voyageE||master?.voyageI||'').trim(),workingNo:String(old?.workingNo||master?.workingNo||'').trim(),start,end,rods:integer('multiRodRods',1,999999),containers:integer('multiRodBoxes',0,99999999),hatches:integer('multiRodHC',0,99999999),shiftMoves:integer('multiRodShift',0,99999999),note:val('multiRodNote').trim()};
   if(!id){$('multiRodEditId').value=item.id;$('multiRodEditId').dataset.version='0';}
   notice('正在儲存並核對雲端，請保留表單…');
   await write(item,'save',Number($('multiRodEditId').dataset.version||0));
   $('multiRodDate').value=start.slice(0,10);$('multiRodMode').value='day';
   $('multiRodEditor').classList.add('hidden');render();notice('已儲存至正式雲端，內容讀回核對成功。');void sync(true);
  }catch(err){notice(err.message||'輸入資料不正確',true)}finally{busy=false;submit.disabled=false;}
 }
 function payload(row){const out={};['id','ship','voyage','workingNo','start','end','note','rods','containers','hatches','shiftMoves'].forEach(k=>{const value=row[k]??(k==='note'||k==='voyage'||k==='workingNo'||k==='end'?'':row[k]);out[k]=typeof value==='string'?value.trim():value;});return out;}
 async function remove(id){
  if(busy||!editAllowed('records.delete'))return;
  const row=getRows().find(x=>x.id===id);if(!row)return;
  if(!confirm('確認刪除「'+row.ship+'」'+row.start.replace('T',' ')+' 的雲端動桿紀錄？系統會保留刪除前內容。'))return;
  busy=true;try{await write(payload(row),'delete',row.version);render();notice('雲端紀錄已刪除，異動留痕已保留。');void sync(true);}catch(err){notice(err.message,true);}finally{busy=false;}
 }
 async function importLegacy(){
  if(busy||!editAllowed('records.create'))return;
  const scope=identity(),rows=legacyRows();if(!rows.length){notice('此帳號沒有舊本機紀錄');return;}
  if(!confirm('將此帳號的 '+rows.length+' 筆舊本機紀錄匯入正式雲端？原本機資料會保留；已有同ID的紀錄不會覆寫。'))return;
  busy=true;let count=0,skipped=0;
  try{
   // Read a complete authoritative collection before deciding which IDs already exist.
   const remote=await apiGetQuick('gcGetAqcMultiRod',{},25000);if(identity()!==scope)throw Error('登入身分已變更');if(!Array.isArray(remote.records))throw Error('未取得完整雲端紀錄');
   state.epoch++;state.rows=remote.records;state.revision=String(remote.revision);persist();
   for(const row of rows){if(identity()!==scope)throw Error('登入身分已變更');if(state.rows.some(r=>r.id===row.id)){skipped++;continue;}await write(payload(row),'save',0);count++;notice('匯入雲端 '+count+'／'+rows.length+' 筆…');}
   render();notice('雲端匯入完成 '+count+' 筆；'+skipped+' 筆同ID紀錄未覆寫。原本機資料已保留。');void sync(true);
  }catch(err){notice('已匯入 '+count+' 筆後停止：'+err.message+'。原本機資料保留，可再次匯入。',true);}finally{busy=false;}
 }

 // Automatically derive distinct AQC equipment used on a ship from official WORKING REPORT.
 // This is a daily vessel-level usage count, not an assertion that all cranes ran simultaneously.
 let sourceBusy=null,sourceLoaded=new Set();
 function concurrencyIndex(){
  return g.P79AqcConcurrent?.index(typeof records!=='undefined'?records:[],
   typeof shipMasters!=='undefined'?shipMasters:[])||null;
 }
 function concurrentResult(){
  const idx=concurrencyIndex();
  return idx?g.P79AqcConcurrent.compute(idx,getRows(),{
   date:val('multiRodDate')||today(),mode:val('multiRodMode')||'day',
   min:Math.max(1,Math.floor(Number(val('multiRodMin'))||4)),capacity:CURRENT_AQC_CAPACITY
  }):{rows:[],peak:0,rawIntervals:0,sourceReportCount:0,pending:[],duplicateCraneConflicts:0,slotsChecked:0,intervalCount:0};
 }
 function cachedPeriod(month){
  const idx=concurrencyIndex();if(!idx)return false;
  const selected=val('multiRodDate')||today(),mode=val('multiRodMode')||'day';
  let first=Date.parse(month+'-01T00:00:00+08:00');
  const [y,m]=month.split('-').map(Number);
  let last=Date.parse(new Date(Date.UTC(y,m,1)).toISOString().slice(0,10)+'T00:00:00+08:00');
  // The month may have older reports while today's operations are still missing.
  // Check the day itself for day mode or the current month selected on today's date.
  if(mode==='day'||(mode==='month'&&selected===today())){
   first=Date.parse(selected+'T00:00:00+08:00');last=first+86400000;
  }
  return idx.raw.some(x=>x.start<last&&x.end>first);
 }
 function sourceCheckKey(month){return 'p79-aqc-source-check:'+key()+':'+month}
 async function syncSource(force=false){
  if(!canView())return;
  const month=String(val('multiRodDate')||today()).slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(month))return;
  if(!force&&(cachedPeriod(month)||sourceLoaded.has(month)||Date.now()-Number(sessionStorage.getItem(sourceCheckKey(month))||0)<600000))return; // Cache-first; missing periods checked at most once per 10 minutes per session.
  if(sourceBusy)return sourceBusy;
  const scope=identity(),token=typeof gcToken!=='undefined'?String(gcToken):'';
  sourceBusy=(async()=>{
   try{
    if(force)notice('正在重新核對船舶資料，不會清除現有快取…');
    const result=await apiGetQuick('gcGetData',{month},25000);
    if(identity()!==scope||(typeof gcToken!=='undefined'&&String(gcToken)!==token))return;
    if((Array.isArray(result?.records)||Array.isArray(result?.shipMasters))&&typeof mergeEfficiencyCloudData==='function'){
     mergeEfficiencyCloudData(result);if(typeof saveLocal==='function')saveLocal();
    }
    if(!cachedPeriod(month)){
     const fallback=await apiGetQuick('historyGetMonthData',{type:'vessel',month},25000);
     if(identity()!==scope||(typeof gcToken!=='undefined'&&String(gcToken)!==token))return;
     if((Array.isArray(fallback?.records)||Array.isArray(fallback?.shipMasters))&&typeof mergeEfficiencyCloudData==='function'){
      mergeEfficiencyCloudData(fallback);if(typeof saveLocal==='function')saveLocal();
     }
    }
    sourceLoaded.add(month);try{sessionStorage.setItem(sourceCheckKey(month),String(Date.now()))}catch(_){}g.P79AqcConcurrent?.invalidate();render();
    notice('已核對船舶資料；多桿作業先由快取計算，只有手動重新核對才下載。');
   }catch(err){notice('船舶雲端核對失敗，仍保留快取結果：'+(err?.message||err),true)}
   finally{sourceBusy=null}
  })();
  return sourceBusy;
 }
 function filtered(){
  const date=val('multiRodDate')||today(),mode=val('multiRodMode')||'day';
  const min=Math.max(1,Math.floor(Number(val('multiRodMin'))||4));
  return getRows().filter(r=>Number(r.rods)>=min&&(mode==='all'||(mode==='month'?String(r.start).slice(0,7)===date.slice(0,7):String(r.start).slice(0,10)===date)))
   .sort((a,b)=>String(a.start).localeCompare(String(b.start))||String(a.ship).localeCompare(String(b.ship)));
 }
 function render(){
  mount();if(!$(ID))return;current();
  if(!canView()){$('multiRodBody').innerHTML='';return;}
  const result=concurrentResult(),list=g.P79AqcConcurrent?.groupSegments(result.rows)||result.rows,allShips=new Set(list.flatMap(r=>r.ships.map(s=>s.workingNo||s.ship+'|'+s.voyage)));
  $('multiRodAdd').disabled=!editAllowed('records.create');
  $('multiRodImport').hidden=!legacyRows().length;$('multiRodImport').disabled=!editAllowed('records.create');
  $('multiRodShips').textContent=allShips.size+' 艘';
  $('multiRodEvents').textContent=list.filter(r=>!r.capacityConflict).length+' 組未超限／'+list.filter(r=>r.capacityConflict).length+' 組待核';
  $('multiRodContainers').textContent='上限 '+result.physicalCapacity+' 桿'+(result.sourcePeak>result.physicalCapacity?'／來源最高 '+result.sourcePeak+' 支':'');
  $('multiRodHatches').textContent=result.sourceReportCount.toLocaleString('zh-TW')+' 筆快取明細';
  const sourceStatus=$('multiRodSourceState');
  if(sourceStatus)sourceStatus.textContent='快取工作明細 '+result.sourceReportCount+' 筆、可辨識 AQC 區間 '+result.intervalCount+' 段；現場同時作業上限 '+result.physicalCapacity+' 桿。來源時間重疊超過上限 '+result.capacityConflictCount+' 段；同一組船舶連續作業合併成 '+list.length+' 組，增減桿不重複計筆。超額來源仍待核對。WORKING SHEET 的起訖時間不代表該桿在整段都持續動作。';
  const audit=$('multiRodSourceAudit'),preview=$('multiRodSourcePreview');
  if(audit){
   const period=val('multiRodDate')||today(),mode=val('multiRodMode')||'day';
   const label=mode==='all'?'全部快取期間':mode==='month'?period.slice(0,7):period;
   audit.textContent='查詢範圍：'+label+'。可辨識時間區間 '+result.rawIntervals+' 筆；現場最大 '+result.physicalCapacity+' 桿，來源重疊最高 '+result.sourcePeak+' 支（非已證實同時作業）。符合篩選 '+result.rows.length+' 個增減桿時段，合併為 '+list.length+' 組船舶作業；其中 '+list.filter(x=>x.capacityConflict).length+' 組來源超額待核。'+
    (result.pending.length?'另有 '+result.pending.length+' 艘船的主檔只有配置桿數、缺少各 AQC 起訖時間，不能當成同時作業。':'')+
    (result.duplicateCraneConflicts?'偵測到重疊時段重複 AQC 編號，已按設備編號去重。':'')+
    (!result.rawIntervals?'所選期間未找到可計算的起訖時間；請確認快取所含月份或重新核對雲端。':'');
  }
  if(preview){
   preview.innerHTML=list.slice(0,30).map(x=>
    '<div class="flex flex-wrap justify-between border-b py-1 gap-2"><span>'+esc(x.start.replace('T',' '))+'～'+esc(x.end.replace('T',' '))+'｜'+
    esc(x.ships.map(s=>s.ship+' 來源最高'+s.rods+'桿').join('、'))+'｜'+esc(x.segments?.length||1)+' 個變化時段</span><span class="font-bold">'+
    (x.capacityConflict?'來源峰值 '+esc(x.totalRods)+' 支（超過上限 '+esc(x.physicalCapacity)+'，待核）':'來源峰值 '+esc(x.totalRods)+' 支')+'</span></div>').join('')||
    '<div class="text-amber-800">所選期間尚無可確認符合最低桿數的時段；不代表沒有船舶作業。</div>';
  }
  $('multiRodBody').innerHTML=list.map(r=>{
   const ships=r.ships.map(s=>'<div class="text-left py-0.5">'+esc(s.ship)+(s.voyage?' <span class="text-xs text-slate-500">'+esc(s.voyage)+'</span>':'')+'：<b>期間來源最多 '+esc(s.rods)+' 桿'+(r.capacityConflict?'（實際分配待核）':'')+'</b>'+(s.aqcNumbers?.length?' <span class="text-xs text-slate-500">曾記錄 AQC '+esc(s.aqcNumbers.join('、'))+'</span>':'')+'</div>').join('');
   const evidence=r.ships.flatMap(s=>(s.evidence||[]).map(e=>({ship:s.ship,unit:e.unit,source:e.source,start:e.start,end:e.end})));
   const handoffs=(result.transfers||[]).filter(x=>x.finished>=r._start-3600000&&x.started<=r._end+3600000&&evidence.some(e=>e.unit===x.unit));
   const periodDetail=(r.segments||[r]).map((part,i)=>
    '<div class="border-b py-1">變化 '+(i+1)+'：'+esc(part.start.replace('T',' '))+'～'+esc(part.end.replace('T',' '))+
    '｜來源合計 '+esc(part.totalRods)+' 支'+(part.capacityConflict?'（超過上限，待核）':'')+
    '｜'+part.ships.map(item=>esc(item.ship)+' '+esc(item.rods)+' 支（AQC '+esc((item.aqcNumbers||[]).join('、'))+'）').join('；')+'</div>').join('');
   const detail='<details class="text-left max-w-[380px]"><summary class="cursor-pointer font-semibold text-sky-800">查看 AQC 開工／完工比對（'+esc(r.segments?.length||1)+' 段變化）</summary>'+
    '<div class="mt-2 text-xs space-y-1"><div class="font-semibold">同組船舶作業的桿數變化（不是獨立作業筆數）</div>'+periodDetail+'</div>'+
    '<div class="mt-2 text-xs space-y-1">'+(evidence.length?evidence.map(e=>'<div class="border-b pb-1">'+esc(e.ship)+'｜AQC '+esc(e.unit)+'｜'+esc(utcLocalTime(new Date(e.start)).replace('T',' '))+' → '+esc(utcLocalTime(new Date(e.end)).replace('T',' '))+' <span class="text-slate-500">('+esc(e.source)+')</span></div>').join(''):'此時段僅有人工作業紀錄，無各支 AQC 起訖時間')+(handoffs.length?'<div class="mt-2 font-semibold">同桿跨船接桿核對</div>'+handoffs.map(x=>'<div class="border-b py-1">AQC '+esc(x.unit)+'：'+esc(x.fromShip)+' 完工 '+esc(utcLocalTime(new Date(x.finished)).replace('T',' '))+' → '+esc(x.toShip)+' 開工 '+esc(utcLocalTime(new Date(x.started)).replace('T',' '))+'｜'+(x.gapMinutes>=0?'間隔 '+esc(x.gapMinutes)+' 分鐘':'⚠ 時間重疊 '+esc(Math.abs(x.gapMinutes))+' 分鐘')+'</div>').join(''):'')+'</div></details>';
   const sourceLabel=r.capacityConflict?'期間來源峰值超過現場4桿上限，待核對':r.needsReview?'部分時間待核對':r.verifiedRods===r.totalRods?'WORKING SHEET 起訖時間比對':'部分由 WORKING REPORT 時段推估';
   const totalText='來源峰值 '+esc(r.totalRods)+' 支'+(r.needsReview?'（待核）':'');
   const totalHint=r.capacityConflict?'<div class="text-xs text-amber-800">來源 '+esc(r.totalRods)+' 支區間重疊，不能證明同時作業；實際各船使用桿數待核對</div>':r.needsReview?'<div class="text-xs text-amber-800">來源時間仍待確認</div>':'';
   return '<tr><td>'+esc(r.start.replace('T',' '))+'</td><td>'+esc(r.end.replace('T',' '))+'</td><td>'+ships+'</td><td class="font-black">'+totalText+totalHint+'</td>'+
    '<td><div class="text-xs '+(r.needsReview?'text-amber-800':'text-sky-800')+'">'+sourceLabel+'</div>'+detail+'</td></tr>';
  }).join('')||'<tr><td colspan="5" class="p-6 text-slate-500">'+
   (result.rawIntervals?'查詢期間內有 AQC 作業，但沒有同一時間合計達到 '+esc(val('multiRodMin')||4)+' 桿的時段。':'此日期沒有足夠的 AQC 起訖資料可判讀；先顯示快取，可按「重新核對雲端」補讀資料。')+'</td></tr>';
 }
 async function exportExcel(){
  if(!canView()){notice('沒有查看效率資料的權限',true);return}
  const sess=session();if(String(sess?.adminRole||'').toLowerCase()!=='superadmin'&&sess?.finePermissions?.efficiency?.['records.export']===false){notice('沒有匯出權限',true);return}
  const scope=identity(),result=concurrentResult(),rows=g.P79AqcConcurrent?.groupSegments(result.rows)||result.rows;
  if(!rows.length){notice('此日期沒有符合同時桿數門檻的時段可匯出。',true);return}
  try{
   if(typeof g.p79EnsureXlsx!=='function')throw Error('Excel 元件未載入');
   await g.p79EnsureXlsx();
   if(identity()!==scope)throw Error('登入身分已變更，已停止匯出');
   if(!g.XLSX?.utils)throw Error('Excel 元件載入失敗');
   const book=XLSX.utils.book_new();
   const detail=[['作業日期','時段開始（台灣）','時段結束（台灣）','實際同時桿數（待核留空）','現場上限桿數','來源時間重疊桿數（非已確認）','核對狀態','船舶總數','船名','航次','WORKING NO.','期間各船來源最高桿數','期間曾記錄 AQC 編號','櫃數','艙蓋','翻艙','資料來源','備註']];
   for(const r of rows)for(const ship of r.ships){
    // Quantities can only be attributed to the overlap when a confirmed manual
    // record exactly matches its start/end, not from vessel-wide totals.
    const exact=(r.segments?.length||1)===1&&ship.manualStart===r._start&&ship.manualEnd===r._end;
    detail.push([r.date,r.start.replace('T',' '),r.end.replace('T',' '),'',r.physicalCapacity,r.sourceOverlapRods,
     r.capacityConflict?'連續作業期間來源峰值超過上限，實際桿數待核對':'連續作業期間來源峰值未超限，實際動桿仍未確認',r.shipCount,
     ship.ship,ship.voyage||'',ship.workingNo||'',ship.rods,(ship.aqcNumbers||[]).join('、'),
     exact?ship.containers:'',exact?ship.hatches:'',exact?ship.shiftMoves:'',
     ship.source,'同組船舶 '+(r.segments?.length||1)+' 段增減桿時段；'+(r.capacityConflict?'來源超限，實際桿數待核':exact?'人工區間有數量記錄':'期間櫃數與艙蓋不能依起訖分攤')]);
   }
   // Main sheet: ONE ship-pair job. Audit sheet: ALL original crane-change intervals.
   const auditDetail=[['主紀錄開始','主紀錄結束','變化時段開始','變化時段結束','船名','航次','WORKING NO.','來源該船支數','來源合計支數','AQC 設備','是否來源超限待核','實際動桿數（無證據留空）']];
   const groupOfSegment=new Map();
   for(const group of rows)for(const part of group.segments||[group]){
    groupOfSegment.set(part,group.id);
    for(const ship of part.ships)auditDetail.push([group.start.replace('T',' '),group.end.replace('T',' '),
     part.start.replace('T',' '),part.end.replace('T',' '),ship.ship,ship.voyage||'',ship.workingNo||'',
     ship.rods,part.totalRods,(ship.aqcNumbers||[]).join('、'),part.capacityConflict?'待核對':'','']);
   }
   const daily=new Map();
   for(const r of result.rows)for(const ship of r.ships){
    const key=r.date+'|'+(ship.workingNo||ship.ship+'|'+ship.voyage);
    if(!daily.has(key))daily.set(key,{date:r.date,ship:ship.ship,voyage:ship.voyage||'',peak:0,sourcePeak:0,conflicts:new Set(),minutes:0,groups:new Set()});
    const d=daily.get(key),groupKey=groupOfSegment.get(r)||r.id;
    d.groups.add(groupKey);if(!r.capacityConflict)d.peak=Math.max(d.peak,ship.rods);else d.conflicts.add(groupKey);
    d.sourcePeak=Math.max(d.sourcePeak,ship.rods);d.minutes+=r.durationMinutes;
   }
   const summary=[['日期','船名','航次','連續作業組數','來源未超限最高各船桿數','來源各船最高重疊桿數','來源超限待核組數','參與來源達標時段分鐘數','說明'],
    ...[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.ship.localeCompare(b.ship)).map(x=>[x.date,x.ship,x.voyage,x.groups.size,x.peak||'',x.sourcePeak,x.conflicts.size,x.minutes,'現場同時上限 '+CURRENT_AQC_CAPACITY+' 桿；區間重疊不等於持續實際動桿，超額時段不能認列實際桿數'])];
   XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(detail),'AQC作業明細');
   XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(summary),'每日船舶彙總');
   XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(auditDetail),'時段變化核對');
   XLSX.writeFile(book,'AQC同時多桿作業_'+(val('multiRodMode')==='all'?'全部':val('multiRodMode')==='month'?(val('multiRodDate')||today()).slice(0,7):val('multiRodDate')||today())+'.xlsx');
   notice('已匯出 '+rows.length+' 組船舶作業，附 '+result.rows.length+' 段增減桿時段供核對；不將來源五支視為實際五桿。');
  }catch(err){notice('Excel 匯出失敗：'+(err.message||err),true)}
 }
 function activate(){render();void sync();void syncSource();}
 g.P79AqcMultiRod={mount,render:activate,filtered:()=>concurrentResult().rows,openEditor,exportExcel,sync};
 g.addEventListener('focus',()=>{if($(ID)&&!$(ID).classList.contains('hidden'))activate();});
 g.addEventListener('storage',()=>{if($(ID)&&!$(ID).classList.contains('hidden')){current();g.P79AqcConcurrent?.invalidate();render();void sync();}});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(window);
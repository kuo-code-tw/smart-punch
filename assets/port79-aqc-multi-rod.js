/* AQC multi-rod operations: isolated from official vessel job totals. */
(function(g){
 'use strict';
 const ID='view-multi-rod';
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
 function current(){const scope=identity();if(scope!==state.scope){state={scope,rows:[],revision:'',checked:0,epoch:0};pending=null;if(scope)try{const v=JSON.parse(localStorage.getItem(cacheKey(scope))||'null');if(v&&Array.isArray(v.rows)&&v.revision){state.rows=v.rows;state.revision=v.revision;}}catch(_){} }return state;}
 const getRows=()=>current().rows;
 const legacyRows=()=>{try{const rows=JSON.parse(localStorage.getItem(key())||'[]');return Array.isArray(rows)?rows:[]}catch(_){return []}};
 function persist(){try{if(state.scope)localStorage.setItem(cacheKey(state.scope),JSON.stringify({rows:state.rows,revision:state.revision}));}catch(_){notice('雲端已確認，本機快取空間不足；下次將重新讀取。',true);}}
 async function sync(force=false){
  const st=current();if(!st.scope)return;if(loading?.scope===st.scope)return loading.promise;
  if(!force&&Date.now()-st.checked<30000)return;
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
  '<div class="flex flex-wrap gap-3 items-center justify-between"><div><h2 class="text-xl font-black text-slate-900">⚓ AQC 多桿作業管理</h2><p class="text-sm text-slate-500 mt-1">自動整理現有船舶 WORKING REPORT 的當日 AQC 動桿資料；可另行確認並登錄桿數。</p></div>',
  '<button type="button" id="multiRodAdd" class="btn bg-indigo-600 text-white">＋ 新增作業紀錄</button></div>',
  '<p class="rounded-xl bg-sky-50 text-sky-900 border border-sky-200 p-3 text-sm">自動推算資料來自現有船舶 WORKING REPORT（按同船同日不同 AQC 編號計算，不代表同時開動）；手動確認紀錄儲存在正式 GAS。兩種來源會標示並去重，不改動原船舶櫃數或請款統計。</p>',
  '<div class="flex flex-wrap gap-3 items-end">',
  '<label class="text-sm font-bold">查詢日期<input id="multiRodDate" type="date" class="block border rounded-xl px-3 py-2 mt-1"></label>',
  '<label class="text-sm font-bold">最低桿數<input id="multiRodMin" type="number" min="1" step="1" value="4" class="block border rounded-xl px-3 py-2 mt-1 w-28"></label>',
  '<label class="text-sm font-bold">顯示<select id="multiRodMode" class="block border rounded-xl px-3 py-2 mt-1"><option value="day">指定日期</option><option value="month">整個月份</option><option value="all">全部紀錄</option></select></label>',
  '<button type="button" id="multiRodRefresh" class="btn bg-slate-100">重新核對雲端</button><button type="button" id="multiRodImport" class="btn bg-amber-50">匯入此帳號舊本機紀錄</button>',
  '<button type="button" id="multiRodExport" class="btn bg-emerald-600 text-white">📥 匯出 Excel（明細＋彙總）</button></div>',
  '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">',
  '<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs text-slate-500">顯示船舶</div><div id="multiRodShips" class="text-xl font-black">0 艘</div></div>',
  '<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs text-slate-500">動桿事件</div><div id="multiRodEvents" class="text-xl font-black">0 筆</div></div>',
  '<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs text-slate-500">櫃數</div><div id="multiRodContainers" class="text-xl font-black">0</div></div>',
  '<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs text-slate-500">艙蓋／翻艙</div><div id="multiRodHatches" class="text-xl font-black">0／0</div></div></div>',
  '<div id="multiRodSourceState" class="text-sm text-slate-600" role="status"></div>',
  '<details class="bg-slate-50 border rounded-xl p-3"><summary class="cursor-pointer font-bold text-sm text-slate-700">🔎 檢查資料日期與各船桿數（包含未達 4 桿）</summary><div id="multiRodSourceAudit" class="mt-3 text-sm text-slate-700"></div><div id="multiRodSourcePreview" class="mt-3 text-xs space-y-1"></div></details>',
  '<div class="overflow-x-auto"><table class="tbl w-full min-w-[1100px] text-center"><thead><tr><th>作業開始</th><th>作業結束</th><th>船名／航次</th><th>桿數</th><th>櫃數</th><th>艙蓋</th><th>翻艙</th><th>來源</th><th>操作</th></tr></thead><tbody id="multiRodBody"></tbody></table></div>',
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
  $('multiRodBody').addEventListener('click',e=>{const btn=e.target.closest('button[data-id]');if(!btn)return;const id=btn.dataset.id;if(btn.dataset.action==='edit')openEditor(getRows().find(r=>r.id===id));if(btn.dataset.action==='confirm')openEditor([...actualCandidates(),...masterCandidates(val('multiRodDate')||today(),1),...monthMasterCandidates((val('multiRodDate')||today()).slice(0,7),1)].find(r=>r.id===id));if(btn.dataset.action==='delete')remove(id)});
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
  if(busy)return;if(!editAllowed(row&&!['auto','sheet','master'].includes(row.source)?'records.edit':'records.create')){alert('目前帳號沒有此項效率管理權限');return}
  options();$('multiRodForm').reset();pending=null;$('multiRodEditId').value=['auto','sheet','master'].includes(row?.source)?'':(row?.id||'');$('multiRodEditId').dataset.version=String(row?.version||0);
  $('multiRodEditor').dataset.scope=identity();
  $('multiRodFormTitle').textContent=['auto','master'].includes(row?.source)?'確認現有船舶多桿作業':row?'編輯 AQC 作業紀錄':'新增 AQC 作業紀錄';
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
 function sourceRows(){
  const raw=typeof records!=='undefined'&&Array.isArray(records)?records:[];
  const wr=raw.filter(r=>String(r?.source||'')==='working-report');
  return typeof canonicalOperationalRecords==='function'?canonicalOperationalRecords(wr):wr;
 }
 const normShip=v=>String(v||'').trim().toUpperCase().replace(/\s+/g,' ');
 function autoCandidates(){
  const masters=typeof shipMasters!=='undefined'&&Array.isArray(shipMasters)?shipMasters:[];
  const byNo=new Map(masters.filter(s=>String(s.workingNo||'').trim()).map(s=>[String(s.workingNo).trim(),s]));
  const groups=new Map();
  const nextDate=date=>{const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10)};
  for(const r of sourceRows()){
   const date=normalizeDate(r.workDate);
   if(!date)continue;
   const aqc=typeof normalizeAqcNo==='function'?normalizeAqcNo(r.number||r.gcNo):String(r.number||r.gcNo||'').trim();
   if(!/^\d{1,6}$/.test(String(aqc)))continue;
   const no=String(r.workingNo||r.workNo||'').trim(),master=byNo.get(no);
   const ship=String(r.shipName||master?.vessel||r.vessel||'').trim();
   if(!ship)continue;
   const voyage=String(r.voyageE||r.voyageI||r.voyage||master?.voyageE||master?.voyageI||'').trim();
   const matchTime=t=>String(t||'').match(/^(\d{1,2}):(\d{2})/);
   const s=matchTime(r.startTime),e=matchTime(r.endTime);
   const sm=s?Number(s[1])*60+Number(s[2]):null,em=e?Number(e[1])*60+Number(e[2]):null;
   const next=nextDate(date),crosses=sm!==null&&em!==null&&sm<1440&&em<1440&&em<sm;
   const startDateTime=s?date+'T'+s[1].padStart(2,'0')+':'+s[2]:'';
   const endDateTime=e?(crosses?next:date)+'T'+e[1].padStart(2,'0')+':'+e[2]:'';
   const segments=[{date,start:startDateTime,end:endDateTime,quantity:true}];
   if(crosses&&em>0){
    segments[0].end=next+'T00:00';
    segments.push({date:next,start:next+'T00:00',end:endDateTime,quantity:false});
   }
   for(const seg of segments){
    const key=JSON.stringify([seg.date,no?'NO:'+no:'SHIP:'+normShip(ship)+'|'+voyage]);
    if(!groups.has(key))groups.set(key,{date:seg.date,ship,voyage,workingNo:no,aqcs:new Set(),segments:[],containers:0,hatches:0,sourceCount:0,quantityCount:0});
    const g=groups.get(key);g.aqcs.add(String(aqc));
    if(seg.start&&seg.end)g.segments.push({start:seg.start,end:seg.end});
    if(seg.quantity){
     const disc=Number(r.disc),load=Number(r.load),boxes=Number(r.containers);
     const quantity=Number.isFinite(disc)&&Number.isFinite(load)?disc+load:Number.isFinite(boxes)?boxes:0;
     g.containers+=Math.max(0,quantity);
     g.hatches+=Math.max(0,Number(r.hatches)||0);
     g.quantityCount++;
    }
    g.sourceCount++;
   }
  }
  return [...groups.values()].map(g=>{
   const starts=g.segments.map(x=>x.start).sort(),ends=g.segments.map(x=>x.end).sort();
   const m=byNo.get(g.workingNo),first=normalizeDate(m?.firstDate),last=normalizeDate(m?.lastDate);
   const dailyShift=first===g.date&&last===g.date&&m?.shiftMoves!==undefined&&m?.shiftMoves!==null&&Number.isFinite(Number(m.shiftMoves))?Number(m.shiftMoves):null;
   return {source:'auto',id:'AUTO:'+g.date+'|'+g.workingNo+'|'+g.ship+'|'+g.voyage,
    ship:g.ship,voyage:g.voyage,workingNo:g.workingNo,date:g.date,
    rods:g.aqcs.size,aqcNumbers:[...g.aqcs].sort((a,b)=>Number(a)-Number(b)),
    start:starts[0]||g.date+'T00:00',end:ends.at(-1)||'',hasActualTimes:starts.length>0,
    containers:g.quantityCount?g.containers:null,hatches:g.quantityCount?g.hatches:null,
    shiftMoves:dailyShift,sourceCount:g.sourceCount};
  });
 }

 const normalizeDate=v=>{
  const m=String(v||'').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  return m?m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):'';
 };
 const tzDate=ts=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ts));
 const tzDateTime=ts=>{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ts));
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;
 };
 const taipeiDateStart=date=>Date.parse(date+'T00:00:00+08:00');
 function instant(value){
  if(value instanceof Date)return Number.isFinite(value.getTime())?value.getTime():NaN;
  if(typeof value==='number')return value>100000000000?value:NaN;
  const s=String(value||'').trim();if(!s)return NaN;
  if(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}[ T]\d{1,2}:\d{2}(?::\d{2})?$/.test(s))return Date.parse(s.replace(/\//g,'-').replace(' ','T')+'+08:00');
  return Date.parse(s);
 }
 // WORKING SHEET contains per-AQC commence/complete timestamps. They are operational
 // evidence; an overall aqcCount alone is NOT evidence of activity on a given date.
 function sheetActivityCandidates(){
  const masters=typeof shipMasters!=='undefined'&&Array.isArray(shipMasters)?shipMasters:[];
  const groups=new Map();
  for(const s of masters){
   const aqcs=Array.isArray(s.aqcs)&&s.aqcs.length?s.aqcs:Array.isArray(s.workingSheetSource?.aqcs)?s.workingSheetSource.aqcs:[];
   const ship=String(s.vessel||'').trim(),workingNo=String(s.workingNo||'').trim();
   if(!ship||!aqcs.length)continue;
   const voyage=String(s.voyageE||s.voyageI||'').trim();
   for(const a of aqcs){
    const number=typeof normalizeAqcNo==='function'?String(normalizeAqcNo(a.number||a.gcNo||'')):String(a.number||a.gcNo||'').trim();
    if(!number||!/^\d{1,6}$/.test(number))continue;
    const begin=instant(a.commence||a.start),finish=instant(a.complete||a.end);
    if(!Number.isFinite(begin))continue;
    const closed=Number.isFinite(finish)&&finish>=begin;
    const end=closed?finish:begin+60000;
    let cursor=tzDate(begin),last=tzDate(Math.max(begin,end-1));
    for(let i=0;i<35&&cursor<=last;i++){
     const dayStart=taipeiDateStart(cursor),dayEnd=dayStart+86400000;
     const intervalStart=Math.max(begin,dayStart),intervalEnd=Math.min(end,dayEnd);
     if(intervalStart<intervalEnd){
      const key=JSON.stringify([cursor,workingNo?'NO:'+workingNo:'SHIP:'+normShip(ship)+'|'+voyage]);
      if(!groups.has(key))groups.set(key,{date:cursor,ship,voyage,workingNo,aqcs:new Set(),starts:[],ends:[],unclosed:false,master:s});
      const g=groups.get(key);g.aqcs.add(number);g.starts.push(tzDateTime(intervalStart));
      if(closed)g.ends.push(tzDateTime(intervalEnd));else g.unclosed=true;
     }
     const next=new Date(dayEnd+12*3600000);cursor=tzDate(next.getTime());
    }
   }
  }
  return [...groups.values()].map(g=>{
   const sameDay=normalizeDate(g.master.firstDate)===g.date&&normalizeDate(g.master.lastDate)===g.date;
   return {id:'SHEET:'+g.date+'|'+g.workingNo+'|'+g.ship,source:'sheet',date:g.date,
    ship:g.ship,voyage:g.voyage,workingNo:g.workingNo,rods:g.aqcs.size,
    aqcNumbers:[...g.aqcs].sort((a,b)=>Number(a)-Number(b)),
    start:g.starts.sort()[0],end:g.unclosed?'':g.ends.sort().at(-1)||'',
    hasActualTimes:true,containers:sameDay?Number(g.master.totalContainers??0):null,
    hatches:sameDay?Number(g.master.hatches??0):null,shiftMoves:sameDay?Number(g.master.shiftMoves??0):null,
    note:'船舶 WORKING SHEET AQC 起訖時間推算（每日去重）'};
  });
 }

 // WORKING SHEET master fallback: a vessel spanning the selected date with >=min listed AQC units
 // is only a review candidate, NOT proof those units worked that date.
 function masterCandidates(date,min){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return [];
  const masters=typeof shipMasters!=='undefined'&&Array.isArray(shipMasters)?shipMasters:[];
  return masters.filter(s=>{
   const from=normalizeDate(s.firstDate||s._cloudFirstDate||s.compareDate||s.workingSheetSource?.compareDate||'');
   const to=normalizeDate(s.lastDate||s._cloudLastDate||from);
   const n=Number(s.aqcCount)||((Array.isArray(s.aqcs)?s.aqcs:[]).length);
   return from&&from<=date&&date<=to&&Number.isFinite(n)&&n>=min;
  }).map(s=>({
   source:'master',id:'MASTER:'+date+'|'+String(s.workingNo||'')+'|'+String(s.vessel||''),
   ship:String(s.vessel||'').trim(),voyage:String(s.voyageE||s.voyageI||'').trim(),
   workingNo:String(s.workingNo||'').trim(),date,rods:Number(s.aqcCount)||((s.aqcs||[]).length),
   start:date+'T00:00',end:'',hasActualTimes:false,containers:null,hatches:null,shiftMoves:null
  })).filter(s=>s.ship);
 }
 function sameVesselDay(a,b){
  const sameDate=String(a.start||'').slice(0,10)===String(b.date||b.start||'').slice(0,10);
  const aNo=String(a.workingNo||'').trim(),bNo=String(b.workingNo||'').trim();
  return sameDate&&(aNo&&bNo?aNo===bNo:normShip(a.ship)===normShip(b.ship)&&String(a.voyage||'')===String(b.voyage||''));
 }

 function monthMasterCandidates(month,min){
  if(!/^\d{4}-\d{2}$/.test(month))return [];
  const first=month+'-01',last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0,12)).toISOString().slice(0,10);
  const masters=typeof shipMasters!=='undefined'&&Array.isArray(shipMasters)?shipMasters:[];
  const output=[];
  for(const s of masters){
   const from=normalizeDate(s.firstDate||s._cloudFirstDate||s.compareDate||s.workingSheetSource?.compareDate),to=normalizeDate(s.lastDate||s._cloudLastDate||from);
   const count=Number(s.aqcCount)||((Array.isArray(s.aqcs)?s.aqcs:[]).length);
   if(!from||from>last||to<first||count<min)continue;
   const date=from>first?from:first;
   output.push({source:'master',id:'MASTER:'+date+'|'+String(s.workingNo||'')+'|'+String(s.vessel||''),date,
    ship:String(s.vessel||'').trim(),voyage:String(s.voyageE||s.voyageI||'').trim(),
    workingNo:String(s.workingNo||'').trim(),rods:count,
    start:date+'T00:00',end:'',hasActualTimes:false,containers:null,hatches:null,shiftMoves:null});
  }
  return output.filter(s=>s.ship);
 }
 function actualCandidates(){
  const report=autoCandidates(),sheet=sheetActivityCandidates(),merged=[...report];
  for(const s of sheet){
   const index=merged.findIndex(r=>sameVesselDay(r,s));
   if(index<0){merged.push(s);continue;}
   const r=merged[index];
   const numbers=[...new Set([...(r.aqcNumbers||[]),...(s.aqcNumbers||[])])].sort((a,b)=>Number(a)-Number(b));
   merged[index]={...r,source:'sheet',rods:numbers.length,aqcNumbers:numbers,
    start:[r.start,s.start].filter(Boolean).sort()[0]||'',end:[r.end,s.end].filter(Boolean).sort().at(-1)||'',
    hasActualTimes:true,containers:r.containers??s.containers,hatches:r.hatches??s.hatches,
    shiftMoves:r.shiftMoves??s.shiftMoves,
    note:'WORKING SHEET AQC 起訖時間＋WORKING REPORT 作業明細'};
  }
  return merged;
 }
 function combinedFiltered(){
  const manual=filtered(),date=val('multiRodDate')||today(),mode=val('multiRodMode')||'day';
  const min=Math.max(1,Math.floor(Number(val('multiRodMin'))||4));
  const allActual=actualCandidates();
  const qualified=allActual.filter(r=>r.rods>=min&&(mode==='all'||(mode==='month'?r.date.slice(0,7)===date.slice(0,7):r.date===date)));
  const recorded=getRows();
  const inferred=qualified.filter(a=>!recorded.some(r=>sameVesselDay(r,a)));
  const candidates=mode==='day'?masterCandidates(date,min):mode==='month'?monthMasterCandidates(date.slice(0,7),min):[];
  const sameMonthVessel=(r,a)=>String(r.start||r.date||'').slice(0,7)===a.date.slice(0,7)&&(r.workingNo&&a.workingNo?String(r.workingNo)===String(a.workingNo):normShip(r.ship)===normShip(a.ship)&&String(r.voyage||'')===String(a.voyage||''));
  const masterFallback=candidates.filter(a=>!recorded.some(r=>mode==='month'?sameMonthVessel(r,a):sameVesselDay(r,a))&&!allActual.some(r=>r.rods>=min&&(mode==='month'?sameMonthVessel(r,a):sameVesselDay(r,a))));
  return [...manual,...inferred,...masterFallback].sort((a,b)=>String(a.start||'').localeCompare(String(b.start||''))||String(a.ship||'').localeCompare(String(b.ship||'')));
 }
 let sourceBusy=null,sourceLoaded=new Set();
 async function syncSource(force=false){
  if(!canView())return;
  const month=String(val('multiRodDate')||today()).slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(month))return;
  if(sourceBusy)return sourceBusy;
  const selectedDate=String(val('multiRodDate')||today()),mode=val('multiRodMode')||'day';
  const existing=sourceRows().some(r=>{const d=normalizeDate(r.workDate);return mode==='day'?d===selectedDate:d.slice(0,7)===month;});
  if(!force&&(existing||sourceLoaded.has(month)))return;
  const scope=identity(),token=typeof gcToken!=='undefined'?String(gcToken):'';
  sourceBusy=(async()=>{
   try{
    const result=await apiGetQuick('gcGetData',{month},25000);
    if(identity()!==scope||(typeof gcToken!=='undefined'&&String(gcToken)!==token))return;
    if(Array.isArray(result?.records)||Array.isArray(result?.shipMasters)){
     if(typeof mergeEfficiencyCloudData==='function')mergeEfficiencyCloudData(result);
     if(typeof saveLocal==='function')saveLocal();
    }
    if(!sourceRows().some(r=>{const d=normalizeDate(r.workDate);return mode==='day'?d===selectedDate:d.slice(0,7)===month;})){
     const fallback=await apiGetQuick('historyGetMonthData',{type:'vessel',month},25000);
     if(identity()!==scope||(typeof gcToken!=='undefined'&&String(gcToken)!==token))return;
     if(Array.isArray(fallback?.records)||Array.isArray(fallback?.shipMasters)){
      if(typeof mergeEfficiencyCloudData==='function')mergeEfficiencyCloudData(fallback);
      if(typeof saveLocal==='function')saveLocal();
     }
    }
    sourceLoaded.add(month);render();
   }catch(err){notice('船舶作業來源更新失敗：'+(err?.message||err)+'；仍顯示本機已讀入的 WORKING REPORT。',true)}
   finally{sourceBusy=null;if(identity()===scope&&String(val('multiRodDate')||today()).slice(0,7)!==month)void syncSource()}
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
  const list=combinedFiltered(),sum=k=>list.reduce((s,r)=>s+(Number(r[k])||0),0);
  const auto=list.filter(r=>r.source==='auto'||r.source==='sheet'),masters=list.filter(r=>r.source==='master'),manual=list.length-auto.length-masters.length;
  const sourceTotal=sourceRows().length;
  $('multiRodAdd').disabled=!editAllowed('records.create');
  $('multiRodImport').hidden=!legacyRows().length;$('multiRodImport').disabled=!editAllowed('records.create');
  $('multiRodShips').textContent=new Set(list.map(r=>r.ship)).size+' 艘';
  $('multiRodEvents').textContent=list.length+' 筆';
  $('multiRodContainers').textContent=sum('containers').toLocaleString('zh-TW');
  $('multiRodHatches').textContent=sum('hatches').toLocaleString('zh-TW')+'／'+sum('shiftMoves').toLocaleString('zh-TW');
  const sourceStatus=$('multiRodSourceState');
  if(sourceStatus)sourceStatus.textContent='目前船舶 WORKING REPORT 明細已讀入 '+sourceTotal+' 筆；符合本篩選的自動判讀 '+auto.length+' 筆，主檔待確認 '+masters.length+' 筆，另有人工雲端紀錄 '+manual+' 筆。WORKING REPORT 推算桿數代表當日不同 AQC 編號數，不等於同時作業。主檔待確認只代表該船日期範圍與配置 AQC 數達門檻，尚不能證明當天實際用了這些桿；需核對作業時間與數量。';
  const scopeDate=val('multiRodDate')||today(),scopeMode=val('multiRodMode')||'day',scopeMonth=scopeDate.slice(0,7);
  const raw=sourceRows(),dates=raw.map(r=>normalizeDate(r.workDate)).filter(Boolean).sort();
  const scopeSource=raw.filter(r=>{const d=normalizeDate(r.workDate);return scopeMode==='all'||(scopeMode==='month'?d.slice(0,7)===scopeMonth:d===scopeDate)});
  const allActual=actualCandidates(),scopeActual=allActual.filter(r=>scopeMode==='all'||(scopeMode==='month'?r.date.slice(0,7)===scopeMonth:r.date===scopeDate));
  const maximum=Math.max(0,...scopeActual.map(r=>Number(r.rods)||0));
  const audit=$('multiRodSourceAudit'),preview=$('multiRodSourcePreview');
  if(audit){
   const coverage=dates.length?dates[0]+' ～ '+dates[dates.length-1]:'無可辨識日期';
   const reason=scopeSource.length===0&&scopeActual.length===0?'所選期間沒有已讀入的 AQC 作業明細；全系統累計數不代表這個月份有資料。':maximum<Number(val('multiRodMin')||4)?'這段期間按現有明細辨識到的最高桿數低於門檻；如實際有更多桿，請確認 WORKING SHEET 的 AQC 起訖時間是否已匯入。':'本期間已有符合桿數條件的船舶。';
   audit.textContent='已讀入 WORKING REPORT '+raw.length+' 筆（日期涵蓋 '+coverage+'）；目前所選期間 '+scopeSource.length+' 筆，從 AQC 作業起訖時間辨識的船舶日期 '+scopeActual.length+' 筆，最高 '+maximum+' 桿。'+reason;
  }
  if(preview){
   const selected=scopeActual.sort((a,b)=>Number(b.rods)-Number(a.rods)||String(b.date).localeCompare(String(a.date))).slice(0,20);
   preview.innerHTML=selected.map(x=>'<div class="flex flex-wrap justify-between border-b py-1 gap-2"><span>'+esc(x.date)+'｜'+esc(x.ship)+' '+esc(x.voyage||'')+'</span><span class="font-bold">'+esc(x.rods)+' 桿｜'+(x.source==='sheet'?'WORKING SHEET 起訖':'WORKING REPORT')+'</span></div>').join('')||'<div class="text-amber-800">沒有可判讀的船舶作業時間；請檢查原船舶明細匯入日期及 AQC 編號。</div>';
  }
  $('multiRodBody').innerHTML=list.map(r=>{
   const derived=['auto','sheet','master'].includes(r.source),editButton=derived?'<button type="button" class="btn bg-amber-50 text-amber-900 text-xs" data-action="confirm" data-id="'+esc(r.id)+'">確認並登錄</button>':(editAllowed('records.edit')?'<button type="button" class="btn bg-slate-100 text-xs" data-action="edit" data-id="'+esc(r.id)+'">編輯</button> ':'')+(editAllowed('records.delete')?'<button type="button" class="btn bg-rose-50 text-rose-800 text-xs" data-action="delete" data-id="'+esc(r.id)+'">刪除</button>':'');
   const from=r.hasActualTimes===false?'時間待確認':String(r.start||'').replace('T',' '),to=r.hasActualTimes===false?'時間待確認':r.end?String(r.end).replace('T',' '):'進行中';
   return '<tr><td>'+esc(from)+'</td><td>'+esc(to)+'</td><td class="font-bold">'+esc(r.ship)+(r.voyage?' <span class="text-xs text-slate-500">'+esc(r.voyage)+'</span>':'')+'</td><td class="font-black">'+esc(r.rods)+'</td><td>'+esc(r.containers)+'</td><td>'+esc(r.hatches)+'</td><td>'+esc(r.shiftMoves??'—')+'</td><td><span class="text-xs font-bold '+(derived?'text-amber-800':'text-emerald-700')+'">'+(r.source==='master'?'主檔待確認':r.source==='sheet'?'WORKING SHEET 起訖確認':derived?'WORKING REPORT 推算':'雲端人工登錄')+'</span></td><td>'+editButton+'</td></tr>';
  }).join('')||'<tr><td colspan="9" class="p-6 text-slate-500">'+(sourceTotal?'這個日期沒有達到指定桿數門檻的船舶紀錄。':'尚未載入 WORKING REPORT 船舶作業明細；請按「重新核對雲端」，或確認原船舶作業明細是否已匯入。')+'</td></tr>';
 }
 async function exportExcel(){
  if(!canView()){notice('沒有查看效率資料的權限',true);return}
  const s=session();if(String(s?.adminRole||'').toLowerCase()!=='superadmin'&&s?.finePermissions?.efficiency?.['records.export']===false){notice('沒有匯出權限',true);return;}
  const scope=identity();
  try{
   const st=current(),epoch=st.epoch;
   const remote=await apiGetQuick('gcGetAqcMultiRod',{export:'1',...(st.revision?{revision:st.revision}:{})},25000);
   if(identity()!==scope||state.epoch!==epoch)throw Error('資料或登入身分已變更，請重新匯出');
   if(!remote.unchanged){if(!Array.isArray(remote.records))throw Error('未取得完整雲端紀錄');state.rows=remote.records;}
   state.epoch++;state.revision=String(remote.revision);state.checked=Date.now();persist();render();
   const rows=combinedFiltered();if(!rows.length){notice('沒有符合條件的資料可匯出',true);return;}
   if(typeof g.p79EnsureXlsx!=='function')throw Error('Excel 元件未載入');
   await g.p79EnsureXlsx();
   if(identity()!==scope)throw Error('登入身分已變更，已停止匯出');
   if(!g.XLSX?.utils)throw Error('Excel 元件載入失敗');
   const wb=XLSX.utils.book_new();
   const detail=[['作業日期','船名','航次','WORKING NO.','開始時間（台灣）','結束時間（台灣）','AQC桿數','櫃數','艙蓋','翻艙','來源','AQC編號','備註','修改時間','修改人員']];
   rows.forEach(r=>detail.push([String(r.start).slice(0,10),r.ship,r.voyage||'',r.workingNo||'',r.start.replace('T',' '),r.end?r.end.replace('T',' '):'',r.rods,r.containers??'',r.hatches??'',r.shiftMoves??'',r.source==='master'?'WORKING SHEET主檔待核對':r.source==='sheet'?'WORKING SHEET AQC起訖時間':r.source==='auto'?'WORKING REPORT自動推算':'GAS人工登錄',(r.aqcNumbers||[]).join('、'),r.note||'',r.updatedAt||'',r.updatedBy||'']));
   const grouped=new Map();
   rows.forEach(r=>{const k=r.start.slice(0,10)+'|'+r.ship+'|'+(r.voyage||'');let x=grouped.get(k);if(!x){x={date:r.start.slice(0,10),ship:r.ship,voyage:r.voyage||'',events:0,maxRods:0,containers:0,hatches:0,shiftMoves:0};grouped.set(k,x)}x.events++;x.maxRods=Math.max(x.maxRods,Number(r.rods)||0);x.containers+=Number(r.containers)||0;x.hatches+=Number(r.hatches)||0;x.shiftMoves+=Number(r.shiftMoves)||0});
   const summary=[['作業日期','船名','航次','作業次數','最高桿數（自動為當日不同AQC編號）','櫃數合計','艙蓋合計','翻艙合計'],...[...grouped.values()].map(x=>[x.date,x.ship,x.voyage,x.events,x.maxRods,x.containers,x.hatches,x.shiftMoves])];
   XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(detail),'AQC作業明細');
   XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),'每日船舶彙總');
   XLSX.writeFile(wb,'AQC多桿作業_'+(val('multiRodMode')==='all'?'全部':val('multiRodDate')||today())+'.xlsx');
   notice('已匯出 '+rows.length+' 筆作業與每日船舶彙總');
  }catch(err){notice('Excel 匯出失敗：'+(err.message||err),true)}
 }
 function activate(){render();void sync();void syncSource();}
 g.P79AqcMultiRod={mount,render:activate,filtered,openEditor,exportExcel,sync};
 g.addEventListener('focus',()=>{if($(ID)&&!$(ID).classList.contains('hidden'))activate();});
 g.addEventListener('storage',()=>{if($(ID)&&!$(ID).classList.contains('hidden')){current();render();void sync(true);}});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(window);
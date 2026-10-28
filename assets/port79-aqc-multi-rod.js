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
   state.revision=String(result.revision);state.checked=Date.now();persist();render();notice('雲端版本已核對，共 '+state.rows.length+' 筆。');
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
  '<div class="flex flex-wrap gap-3 items-center justify-between"><div><h2 class="text-xl font-black text-slate-900">⚓ AQC 多桿作業管理</h2><p class="text-sm text-slate-500 mt-1">手動記錄實際動桿事件；4 桿為預設門檻，不限制可輸入的最大桿數。</p></div>',
  '<button type="button" id="multiRodAdd" class="btn bg-indigo-600 text-white">＋ 新增作業紀錄</button></div>',
  '<p class="rounded-xl bg-sky-50 text-sky-900 border border-sky-200 p-3 text-sm">紀錄由正式 GAS 儲存，授權人員可跨電腦查看；先顯示本機快取，再核對雲端版本。儲存成功須通過雲端讀回確認，不影響原船舶櫃數與請款統計。</p>',
  '<div class="flex flex-wrap gap-3 items-end">',
  '<label class="text-sm font-bold">查詢日期<input id="multiRodDate" type="date" class="block border rounded-xl px-3 py-2 mt-1"></label>',
  '<label class="text-sm font-bold">最低桿數<input id="multiRodMin" type="number" min="1" step="1" value="4" class="block border rounded-xl px-3 py-2 mt-1 w-28"></label>',
  '<label class="text-sm font-bold">顯示<select id="multiRodMode" class="block border rounded-xl px-3 py-2 mt-1"><option value="day">指定日期</option><option value="month">整個月份</option><option value="all">全部紀錄</option></select></label>',
  '<button type="button" id="multiRodRefresh" class="btn bg-slate-100">重新核對雲端</button><button type="button" id="multiRodImport" class="btn bg-amber-50">匯入此帳號舊本機紀錄</button>',
  '<button type="button" id="multiRodExport" class="btn bg-emerald-600 text-white">📥 匯出 Excel（明細＋彙總）</button></div>',
  '<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">',
  '<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs text-slate-500">符合船舶</div><div id="multiRodShips" class="text-xl font-black">0 艘</div></div>',
  '<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs text-slate-500">動桿事件</div><div id="multiRodEvents" class="text-xl font-black">0 筆</div></div>',
  '<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs text-slate-500">櫃數</div><div id="multiRodContainers" class="text-xl font-black">0</div></div>',
  '<div class="bg-slate-50 rounded-xl p-3"><div class="text-xs text-slate-500">艙蓋／翻艙</div><div id="multiRodHatches" class="text-xl font-black">0／0</div></div></div>',
  '<div class="overflow-x-auto"><table class="tbl w-full min-w-[960px] text-center"><thead><tr><th>作業開始</th><th>作業結束</th><th>船名／航次</th><th>桿數</th><th>櫃數</th><th>艙蓋</th><th>翻艙</th><th>操作</th></tr></thead><tbody id="multiRodBody"></tbody></table></div>',
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
  $('multiRodDate').addEventListener('change',render);
  $('multiRodMin').addEventListener('input',render);
  $('multiRodMode').addEventListener('change',render);
  $('multiRodAdd').addEventListener('click',()=>openEditor());
  $('multiRodCancel').addEventListener('click',()=>{$('multiRodEditor').classList.add('hidden')});
  $('multiRodForm').addEventListener('submit',save);
  $('multiRodExport').addEventListener('click',exportExcel);
  $('multiRodRefresh').addEventListener('click',()=>sync(true));
  $('multiRodImport').addEventListener('click',importLegacy);
  $('multiRodBody').addEventListener('click',e=>{const btn=e.target.closest('button[data-id]');if(!btn)return;const id=btn.dataset.id;if(btn.dataset.action==='edit')openEditor(getRows().find(r=>r.id===id));if(btn.dataset.action==='delete')remove(id)});
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
  if(busy)return;if(!editAllowed(row?'records.edit':'records.create')){alert('目前帳號沒有此項效率管理權限');return}
  options();$('multiRodForm').reset();pending=null;$('multiRodEditId').value=row?.id||'';$('multiRodEditId').dataset.version=String(row?.version||0);
  $('multiRodEditor').dataset.scope=identity();
  $('multiRodFormTitle').textContent=row?'編輯 AQC 作業紀錄':'新增 AQC 作業紀錄';
  $('multiRodShip').value=row?.ship||'';$('multiRodVoyage').value=row?.voyage||'';
  $('multiRodRods').value=row?.rods??4;$('multiRodStart').value=row?.start||utcLocalTime(new Date());
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
 function filtered(){
  const date=val('multiRodDate')||today(),mode=val('multiRodMode')||'day';
  const min=Math.max(1,Math.floor(Number(val('multiRodMin'))||4));
  return getRows().filter(r=>Number(r.rods)>=min&&(mode==='all'||(mode==='month'?String(r.start).slice(0,7)===date.slice(0,7):String(r.start).slice(0,10)===date)))
   .sort((a,b)=>String(a.start).localeCompare(String(b.start))||String(a.ship).localeCompare(String(b.ship)));
 }
 function render(){
  mount();if(!$(ID))return;current();if(!canView()){$('multiRodBody').innerHTML='';return;}
  const list=filtered(),sum=k=>list.reduce((s,r)=>s+(Number(r[k])||0),0);
  $('multiRodAdd').disabled=!editAllowed('records.create');
  $('multiRodImport').hidden=!legacyRows().length;$('multiRodImport').disabled=!editAllowed('records.create');
  $('multiRodShips').textContent=new Set(list.map(r=>r.ship)).size+' 艘';
  $('multiRodEvents').textContent=list.length+' 筆';
  $('multiRodContainers').textContent=sum('containers').toLocaleString('zh-TW');
  $('multiRodHatches').textContent=sum('hatches').toLocaleString('zh-TW')+'／'+sum('shiftMoves').toLocaleString('zh-TW');
  $('multiRodBody').innerHTML=list.map(r=>'<tr><td>'+esc(r.start.replace('T',' '))+'</td><td>'+esc(r.end?r.end.replace('T',' '):'進行中')+'</td><td class="font-bold">'+esc(r.ship)+(r.voyage?' <span class="text-xs text-slate-500">'+esc(r.voyage)+'</span>':'')+'</td><td class="font-black">'+esc(r.rods)+'</td><td>'+esc(r.containers)+'</td><td>'+esc(r.hatches)+'</td><td>'+esc(r.shiftMoves)+'</td><td>'+(canEdit()?'<button type="button" class="btn bg-slate-100 text-xs" data-action="edit" data-id="'+esc(r.id)+'">編輯</button> <button type="button" class="btn bg-rose-50 text-rose-800 text-xs" data-action="delete" data-id="'+esc(r.id)+'">刪除</button>':'—')+'</td></tr>').join('')||'<tr><td colspan="8" class="p-6 text-slate-500">本日期沒有符合門檻的 AQC 多桿作業紀錄。</td></tr>';
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
   state.revision=String(remote.revision);state.checked=Date.now();persist();render();
   const rows=filtered();if(!rows.length){notice('沒有符合條件的資料可匯出',true);return;}
   if(typeof g.p79EnsureXlsx!=='function')throw Error('Excel 元件未載入');
   await g.p79EnsureXlsx();
   if(identity()!==scope)throw Error('登入身分已變更，已停止匯出');
   if(!g.XLSX?.utils)throw Error('Excel 元件載入失敗');
   const wb=XLSX.utils.book_new();
   const detail=[['作業日期','船名','航次','WORKING NO.','開始時間（台灣）','結束時間（台灣）','AQC桿數','櫃數','艙蓋','翻艙','備註','修改時間','修改人員']];
   rows.forEach(r=>detail.push([String(r.start).slice(0,10),r.ship,r.voyage||'',r.workingNo||'',r.start.replace('T',' '),r.end?r.end.replace('T',' '):'',r.rods,r.containers,r.hatches,r.shiftMoves,r.note||'',r.updatedAt||'',r.updatedBy||'']));
   const grouped=new Map();
   rows.forEach(r=>{const k=r.start.slice(0,10)+'|'+r.ship+'|'+(r.voyage||'');let x=grouped.get(k);if(!x){x={date:r.start.slice(0,10),ship:r.ship,voyage:r.voyage||'',events:0,maxRods:0,containers:0,hatches:0,shiftMoves:0};grouped.set(k,x)}x.events++;x.maxRods=Math.max(x.maxRods,Number(r.rods)||0);x.containers+=Number(r.containers)||0;x.hatches+=Number(r.hatches)||0;x.shiftMoves+=Number(r.shiftMoves)||0});
   const summary=[['作業日期','船名','航次','作業次數','最大同時桿數','櫃數合計','艙蓋合計','翻艙合計'],...[...grouped.values()].map(x=>[x.date,x.ship,x.voyage,x.events,x.maxRods,x.containers,x.hatches,x.shiftMoves])];
   XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(detail),'AQC作業明細');
   XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),'每日船舶彙總');
   XLSX.writeFile(wb,'AQC多桿作業_'+(val('multiRodMode')==='all'?'全部':val('multiRodDate')||today())+'.xlsx');
   notice('已匯出 '+rows.length+' 筆作業與每日船舶彙總');
  }catch(err){notice('Excel 匯出失敗：'+(err.message||err),true)}
 }
 function activate(){render();void sync();}
 g.P79AqcMultiRod={mount,render:activate,filtered,openEditor,exportExcel,sync};
 g.addEventListener('focus',()=>{if($(ID)&&!$(ID).classList.contains('hidden'))activate();});
 g.addEventListener('storage',()=>{if($(ID)&&!$(ID).classList.contains('hidden')){current();render();void sync(true);}});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(window);
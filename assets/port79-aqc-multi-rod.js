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
 const getRows=()=>{try{const v=JSON.parse(localStorage.getItem(key())||'[]');return Array.isArray(v)?v.filter(x=>x&&typeof x==='object'):[]}catch(_){return []}};
 function persist(rows){try{localStorage.setItem(key(),JSON.stringify(rows));return true}catch(err){alert('無法儲存到此電腦：'+(err?.message||err));return false}}
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
  '<p class="rounded-xl bg-amber-50 text-amber-900 border border-amber-200 p-3 text-sm">目前是<strong>本機紀錄版</strong>：只儲存在此瀏覽器、目前登入帳號的資料區；不會同步到其他電腦／帳號，也不會改動正式船舶主檔或請款統計。請定期匯出 Excel 備份。</p>',
  '<div class="flex flex-wrap gap-3 items-end">',
  '<label class="text-sm font-bold">查詢日期<input id="multiRodDate" type="date" class="block border rounded-xl px-3 py-2 mt-1"></label>',
  '<label class="text-sm font-bold">最低桿數<input id="multiRodMin" type="number" min="1" step="1" value="4" class="block border rounded-xl px-3 py-2 mt-1 w-28"></label>',
  '<label class="text-sm font-bold">顯示<select id="multiRodMode" class="block border rounded-xl px-3 py-2 mt-1"><option value="day">指定日期</option><option value="month">整個月份</option><option value="all">全部紀錄</option></select></label>',
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
  '</div><div class="flex flex-wrap gap-2"><button type="submit" class="btn bg-indigo-600 text-white">儲存本機紀錄</button><button type="button" id="multiRodCancel" class="btn bg-slate-100">取消</button></div></form></div>'
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
  if(!canEdit()){alert('目前帳號沒有效率系統管理權限');return}
  options();$('multiRodForm').reset();$('multiRodEditId').value=row?.id||'';
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
 function save(e){
  e.preventDefault();if(!canEdit()){notice('沒有新增或修改權限',true);return}
  try{
   const ship=val('multiRodShip').trim(),start=val('multiRodStart'),end=val('multiRodEnd');
   if(!ship||!start)throw Error('請輸入船名及作業開始時間');
   if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start)||!Number.isFinite(Date.parse(start)))throw Error('作業開始時間格式錯誤');
   if(end&&(!Number.isFinite(Date.parse(end))||Date.parse(end)<Date.parse(start)))throw Error('結束時間不能早於開始時間');
   const now=new Date().toISOString(),rows=getRows(),id=val('multiRodEditId');
   const old=rows.find(x=>x.id===id);
   if(id&&!old)throw Error('原紀錄已不存在，請重新開啟');
   const master=candidates().find(x=>String(x.vessel).trim()===ship);
   const item={id:old?.id||('MR-'+Date.now()+'-'+Math.random().toString(36).slice(2,10)),ship,voyage:val('multiRodVoyage').trim()||String(master?.voyageE||master?.voyageI||''),workingNo:old?.workingNo||String(master?.workingNo||''),start,end,rods:integer('multiRodRods',1,999999),containers:integer('multiRodBoxes',0,99999999),hatches:integer('multiRodHC',0,99999999),shiftMoves:integer('multiRodShift',0,99999999),note:val('multiRodNote').trim(),createdAt:old?.createdAt||now,updatedAt:now,updatedBy:String(session()?.empId||'')};
   const next=old?rows.map(x=>x.id===id?item:x):rows.concat(item);
   if(!persist(next))return;
   $('multiRodDate').value=start.slice(0,10);$('multiRodMode').value='day';
   $('multiRodEditor').classList.add('hidden');render();notice('已儲存至此電腦的登入帳號資料區（尚未雲端同步）。');
  }catch(err){notice(err.message||'輸入資料不正確',true)}
 }
 function remove(id){
  if(!canEdit())return;
  const row=getRows().find(x=>x.id===id);if(!row)return;
  if(!confirm('確認刪除「'+row.ship+'」'+row.start.replace('T',' ')+' 的本機動桿紀錄？'))return;
  if(persist(getRows().filter(x=>x.id!==id))){render();notice('本機紀錄已刪除')}
 }
 function filtered(){
  const date=val('multiRodDate')||today(),mode=val('multiRodMode')||'day';
  const min=Math.max(1,Math.floor(Number(val('multiRodMin'))||4));
  return getRows().filter(r=>Number(r.rods)>=min&&(mode==='all'||(mode==='month'?String(r.start).slice(0,7)===date.slice(0,7):String(r.start).slice(0,10)===date)))
   .sort((a,b)=>String(a.start).localeCompare(String(b.start))||String(a.ship).localeCompare(String(b.ship)));
 }
 function render(){
  mount();if(!$(ID))return;
  const list=filtered(),sum=k=>list.reduce((s,r)=>s+(Number(r[k])||0),0);
  $('multiRodAdd').disabled=!canEdit();
  $('multiRodShips').textContent=new Set(list.map(r=>r.ship)).size+' 艘';
  $('multiRodEvents').textContent=list.length+' 筆';
  $('multiRodContainers').textContent=sum('containers').toLocaleString('zh-TW');
  $('multiRodHatches').textContent=sum('hatches').toLocaleString('zh-TW')+'／'+sum('shiftMoves').toLocaleString('zh-TW');
  $('multiRodBody').innerHTML=list.map(r=>'<tr><td>'+esc(r.start.replace('T',' '))+'</td><td>'+esc(r.end?r.end.replace('T',' '):'進行中')+'</td><td class="font-bold">'+esc(r.ship)+(r.voyage?' <span class="text-xs text-slate-500">'+esc(r.voyage)+'</span>':'')+'</td><td class="font-black">'+esc(r.rods)+'</td><td>'+esc(r.containers)+'</td><td>'+esc(r.hatches)+'</td><td>'+esc(r.shiftMoves)+'</td><td>'+(canEdit()?'<button type="button" class="btn bg-slate-100 text-xs" data-action="edit" data-id="'+esc(r.id)+'">編輯</button> <button type="button" class="btn bg-rose-50 text-rose-800 text-xs" data-action="delete" data-id="'+esc(r.id)+'">刪除</button>':'—')+'</td></tr>').join('')||'<tr><td colspan="8" class="p-6 text-slate-500">本日期沒有符合門檻的 AQC 多桿作業紀錄。</td></tr>';
 }
 async function exportExcel(){
  if(!canView()){notice('沒有查看效率資料的權限',true);return}
  const rows=filtered();if(!rows.length){notice('沒有符合條件的資料可匯出',true);return}
  try{
   if(typeof g.p79EnsureXlsx!=='function')throw Error('Excel 元件未載入');
   await g.p79EnsureXlsx();
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
 g.P79AqcMultiRod={mount,render,filtered,openEditor,exportExcel};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(window);
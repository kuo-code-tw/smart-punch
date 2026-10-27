(function(g){
'use strict';
const KEYS={typhoon:'p79-manual-typhoon-days-v1',election:'p79-manual-election-days-v1',configured:'p79-election-days-configured-v1'};
const BACKUP_KEY='p79-special-days-precloud-backup-v1',MIRROR_KEY='p79-special-days-cloud-mirror-v1';
let service=null,cloud=null,pending=null,legacy=null;
const valid=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return false;
 const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
};
function readLocal(){
 let typhoon=[],election=[];
 try{typhoon=JSON.parse(g.localStorage.getItem(KEYS.typhoon)||'[]')}catch(_){}
 try{election=JSON.parse(g.localStorage.getItem(KEYS.election)||'[]')}catch(_){}
 if(g.localStorage.getItem(KEYS.configured)!=='1')election=g.P79SpecialOvertime.electionDates();
 return normalize([
  ...(Array.isArray(typhoon)?typhoon:[]).filter(valid).map(date=>({date,kind:'typhoon'})),
  ...(Array.isArray(election)?election:[]).filter(valid).map(date=>({date,kind:'election'}))
 ]);
}
function read(){return cloud?cloud.rows.slice():readLocal()}
function pendingLegacy(){if(!cloud||!legacy)return [];const known=new Set(cloud.rows.map(r=>r.kind+'|'+r.date));return legacy.filter(r=>!known.has(r.kind+'|'+r.date));}
function captureLegacy(){
 if(legacy!==null)return;
 try{const saved=JSON.parse(g.localStorage.getItem(BACKUP_KEY)||'null');if(Array.isArray(saved?.rows)){legacy=normalize(saved.rows);return}}catch(_){}
 legacy=g.localStorage.getItem(MIRROR_KEY)?[]:readLocal();
 if(legacy.length)try{g.localStorage.setItem(BACKUP_KEY,JSON.stringify({rows:legacy,backupAt:new Date().toISOString()}))}catch(_){}
}
function mirror(state){
 const previous=Object.values(KEYS).map(key=>[key,g.localStorage.getItem(key)]);
 try{
  g.localStorage.setItem(KEYS.typhoon,JSON.stringify(state.rows.filter(r=>r.kind==='typhoon').map(r=>r.date)));
  g.localStorage.setItem(KEYS.election,JSON.stringify(state.rows.filter(r=>r.kind==='election').map(r=>r.date)));
  g.localStorage.setItem(KEYS.configured,'1');
  g.localStorage.setItem(MIRROR_KEY,state.revision);
 }catch(error){
  for(const [key,value]of previous)try{if(value===null)g.localStorage.removeItem(key);else g.localStorage.setItem(key,value)}catch(_){}
  throw Error('雲端日期已讀取，但本機顯示快取寫入失敗：'+error.message);
 }
}
function configure(connector){
 if(!connector||typeof connector.read!=='function'||typeof connector.write!=='function')throw Error('未設定 GAS 特殊日期端點');
 service=connector;
}
function receive(reply){
 if(reply?.ok!==true||reply.source!=='cloud'||reply.schemaVersion!==1||!Array.isArray(reply.rows)||!reply.revision)throw Error('GAS 未傳回有效特殊日期資料');
 const state={revision:String(reply.revision),rows:normalize(reply.rows)};
 mirror(state);const changed=!cloud||JSON.stringify(state.rows)!==JSON.stringify(cloud.rows);cloud=state;
 if(changed)service?.onChange?.(state.rows);
 return cloud;
}
async function refresh(){
 if(!service)throw Error('特殊日期尚未連接 GAS，禁止只存本機');
 if(pending)return pending;
 captureLegacy();
 pending=Promise.resolve().then(()=>service.read()).then(receive);
 try{return await pending}finally{pending=null}
}
function normalize(rows){
 const seen=new Set();return rows.map(row=>{
  if(!valid(row.date)||!['typhoon','election'].includes(row.kind))throw Error('請填寫有效日期及類型。');
  return {date:row.date,kind:row.kind};
 }).filter(row=>{const key=row.kind+'|'+row.date;if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>a.date.localeCompare(b.date)||a.kind.localeCompare(b.kind));
}
function range(from,to,kind){
 if(!valid(from)||!valid(to)||to<from)throw Error('請選擇有效的起訖日期，結束日不可早於開始日。');
 const span=(Date.parse(to)-Date.parse(from))/86400000;
 if(span>365)throw Error('每次最多新增一年內的日期。');
 return normalize(Array.from({length:span+1},(_,i)=>({kind,date:new Date(Date.parse(from)+i*86400000).toISOString().slice(0,10)})));
}
function signature(){return cloud?cloud.revision:''}
async function save(rows,expected){
 if(!service)throw Error('未連接 GAS，禁止只存本機');
 if(!cloud)await refresh();
 if(!expected||expected!==cloud.revision)throw Error('雲端日期版本已變更，請重新開啟清單');
 const reply=await service.write({rows:normalize(rows),expectedRevision:expected});
 if(reply?.conflict)throw Error(reply.error||'另一台電腦已修改日期，請重新讀取');
 receive(reply);
 return cloud.rows;
}
async function open({month='',onSave}={}){
 if(g.document.getElementById('p79SpecialDaysDialog'))return;
 try{await refresh()}catch(e){g.alert?.('特殊日期無法確認雲端版本，為避免資料被覆蓋，暫停編輯。\n'+e.message);return}
 let draft=normalize(read()),initial=signature();
 const dialog=g.document.createElement('dialog');dialog.id='p79SpecialDaysDialog';
 dialog.setAttribute('aria-labelledby','p79SpecialDaysTitle');
 dialog.innerHTML=`<style>
 #p79SpecialDaysDialog{width:min(680px,calc(100vw - 24px));max-height:90vh;overflow:auto;border:1px solid #cbd5e1;border-radius:20px;padding:24px;background:#fff;color:#0f172a;box-shadow:0 24px 80px #0f172a44}#p79SpecialDaysDialog::backdrop{background:#0f172a88}
 #p79SpecialDaysDialog h2{font-size:21px;font-weight:900;margin:0 0 8px}#p79SpecialDaysDialog p{font-size:13px;line-height:1.7;color:#64748b;margin:8px 0 16px}#p79SpecialDaysDialog label{font-size:12px;font-weight:700;display:grid;gap:5px}#p79SpecialDaysDialog input,#p79SpecialDaysDialog select,#p79SpecialDaysDialog button{border:1px solid #cbd5e1;border-radius:9px;padding:9px;background:#fff;color:inherit;min-width:0;font-size:14px}#p79SpecialDaysDialog button{cursor:pointer;font-weight:700}#p79SpecialDaysDialog .p79-days-add{display:grid;grid-template-columns:1fr 1.25fr 1.25fr;gap:10px;background:#f1f5f9;padding:14px;border-radius:12px}#p79SpecialDaysDialog .p79-days-add button{grid-column:1/-1;background:#e0f2fe;color:#075985}#p79SpecialDaysDialog .p79-days-row{display:grid;grid-template-columns:1fr 1.5fr auto;gap:10px;align-items:end;margin:10px 0}#p79SpecialDaysDialog .p79-days-footer{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}#p79SpecialDaysDialog .primary{background:#2563eb;color:white;border-color:#2563eb}#p79SpecialDaysDialog .danger{color:#be123c}#p79-days-error{color:#b91c1c;font-size:13px;min-height:20px;margin-top:12px}#p79-days-list{max-height:36vh;overflow:auto;margin-top:16px}
 html.dark #p79SpecialDaysDialog{background:#0f172a;color:#e2e8f0}html.dark #p79SpecialDaysDialog input,html.dark #p79SpecialDaysDialog select,html.dark #p79SpecialDaysDialog button{background:#1e293b;color:#e2e8f0;color-scheme:dark}html.dark #p79SpecialDaysDialog .p79-days-add{background:#172033}html.dark #p79SpecialDaysDialog .primary{background:#2563eb}html.dark #p79SpecialDaysDialog p{color:#94a3b8}@media(max-width:480px){#p79SpecialDaysDialog{padding:16px}.p79-days-row{gap:5px!important}#p79SpecialDaysDialog .p79-days-add{grid-template-columns:1fr 1fr}#p79SpecialDaysDialog .p79-days-add label:first-child{grid-column:1/-1}}
 </style><h2 id="p79SpecialDaysTitle">颱風假／選舉日管理</h2>
 <p>可新增多個日期或連續多天。颱風假／選舉日正式資料儲存在 GAS 雲端，其他電腦會同步。新增日期請先核對正式公告，完成雲端儲存才算生效。具排班與請假管理權限的管理員儲存後，系統會核對雲端請假，經確認才會連動取消完全落在颱風假內的請假、代班安排及相關代班加班；部分跨日重疊的請假會保留並提示人工調整。處理備註：「颱風停班免計假（自動取消）」。日期標記不會自動建立加班申報。</p>
 <div class="p79-days-add"><label>類型<select id="p79-days-kind"><option value="typhoon">颱風假</option><option value="election">選舉日</option></select></label><label>開始日期<input type="date" id="p79-days-from"></label><label>結束日期<input type="date" id="p79-days-to"></label><button type="button" id="p79-days-add">＋ 新增日期／區間</button></div>
 <div id="p79-days-list" aria-label="已設定日期"></div><div id="p79-days-import" style="margin-top:10px"></div><div id="p79-days-error" role="status" aria-live="polite"></div>
 <div class="p79-days-footer"><button type="button" id="p79-days-cancel">取消</button><button type="button" class="primary" id="p79-days-save">儲存至 GAS 雲端</button></div>`;
 const $=id=>dialog.querySelector('#'+id),error=message=>{$('p79-days-error').textContent=message;};
 const paint=()=>{
  const list=$('p79-days-list');list.replaceChildren();
  if(!draft.length){const empty=g.document.createElement('p');empty.textContent='尚未設定日期，請在上方新增。';list.appendChild(empty);}
  draft.forEach((row,i)=>{
   const el=g.document.createElement('div');el.className='p79-days-row';
   el.innerHTML='<label>類型<select><option value="typhoon">颱風假</option><option value="election">選舉日</option></select></label><label>日期<input type="date"></label><button type="button" class="danger">刪除</button>';
   const kind=el.querySelector('select'),date=el.querySelector('input');kind.value=row.kind;date.value=row.date;
   kind.onchange=()=>{draft[i].kind=kind.value;};date.onchange=()=>{draft[i].date=date.value;};
   el.querySelector('button').onclick=()=>{draft.splice(i,1);paint();};list.appendChild(el);
  });
  const slot=$('p79-days-import');slot.replaceChildren();
  const unmerged=pendingLegacy();
  if(unmerged.length){
   const hint=g.document.createElement('div');hint.style.cssText='background:#fef9c3;padding:10px;border-radius:8px;color:#854d0e';
   hint.textContent='偵測到這台電腦有 '+unmerged.length+' 個尚未存到雲端的舊日期。';
   const btn=g.document.createElement('button');btn.type='button';btn.textContent='核對並加入編輯清單';
   btn.onclick=()=>{if(!g.confirm?.('將舊日期加入目前草稿，儲存前可以逐筆確認或刪除。確定嗎？'))return;draft=normalize([...draft,...unmerged]);paint();error('舊日期已加入草稿；確認無誤後，按「儲存至 GAS 雲端」。')};
   hint.appendChild(btn);slot.appendChild(hint);
  }
 };
 const close=()=>{dialog.close();dialog.remove();};
 $('p79-days-cancel').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 $('p79-days-add').onclick=()=>{try{draft=normalize([...draft,...range($('p79-days-from').value,$('p79-days-to').value||$('p79-days-from').value,$('p79-days-kind').value)]);paint();error('已加入清單，按「儲存日期」才會生效。');}catch(e){error(e.message)}};
 $('p79-days-save').onclick=async()=>{
  const button=$('p79-days-save');button.disabled=true;
  try{await save(draft,initial);close();onSave?.();g.showScheduleNotice?.('颱風假／選舉日已同步 GAS 雲端','success')}
  catch(e){error('雲端未確認，尚未儲存：'+e.message+'。請重新開啟核對雲端資料。')}
  finally{button.disabled=false}
 };
 const today=g.scheduleTaipeiTodayKey?.()||new Date().toISOString().slice(0,10),suggestion=today.startsWith(month+'-')?today:/^\d{4}-\d{2}$/.test(month)?month+'-01':today;
 $('p79-days-from').value=suggestion;$('p79-days-to').value=suggestion;
 $('p79-days-from').onchange=()=>{if($('p79-days-to').value<$('p79-days-from').value)$('p79-days-to').value=$('p79-days-from').value;};
 g.document.body.appendChild(dialog);paint();dialog.showModal();
}
g.P79SpecialDaysEditor={open,read,save,range,normalize,valid,signature,configure,refresh,pendingLegacy,state:()=>cloud};
g.addEventListener?.('storage',event=>{
 if(!Object.values(KEYS).includes(event.key))return;
 void refresh().catch(()=>{});
});
})(window);

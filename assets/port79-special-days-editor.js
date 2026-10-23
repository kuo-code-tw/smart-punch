(function(g){
'use strict';
const KEYS={typhoon:'p79-manual-typhoon-days-v1',election:'p79-manual-election-days-v1',configured:'p79-election-days-configured-v1'};
const valid=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return false;
 const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
};
function read(){
 let typhoon=[];try{typhoon=JSON.parse(g.localStorage.getItem(KEYS.typhoon)||'[]')}catch(_){}
 return [...(Array.isArray(typhoon)?typhoon:[]).filter(valid).map(date=>({date,kind:'typhoon'})),...g.P79SpecialOvertime.electionDates().filter(valid).map(date=>({date,kind:'election'}))];
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
function signature(){return JSON.stringify(Object.values(KEYS).map(key=>g.localStorage.getItem(key)));}
function save(rows,expected){
 const clean=normalize(rows);
 if(expected!==undefined&&signature()!==expected)throw Error('日期已在另一個視窗變更，請關閉後重新開啟再編輯。');
 const previous=Object.values(KEYS).map(key=>[key,g.localStorage.getItem(key)]);
 try{
  g.localStorage.setItem(KEYS.typhoon,JSON.stringify(clean.filter(r=>r.kind==='typhoon').map(r=>r.date)));
  g.localStorage.setItem(KEYS.election,JSON.stringify(clean.filter(r=>r.kind==='election').map(r=>r.date)));
  g.localStorage.setItem(KEYS.configured,'1');
 }catch(error){
  for(const [key,value] of previous)try{if(value===null)g.localStorage.removeItem(key);else g.localStorage.setItem(key,value)}catch(_){}
  throw Error('無法儲存日期，請確認瀏覽器儲存空間後重試。');
 }
 return clean;
}
function open({month='',onSave}={}){
 g.document.getElementById('p79SpecialDaysDialog')?.remove();
 let draft=normalize(read()),initial=signature();
 const dialog=g.document.createElement('dialog');dialog.id='p79SpecialDaysDialog';
 dialog.setAttribute('aria-labelledby','p79SpecialDaysTitle');
 dialog.innerHTML=`<style>
 #p79SpecialDaysDialog{width:min(680px,calc(100vw - 24px));max-height:90vh;overflow:auto;border:1px solid #cbd5e1;border-radius:20px;padding:24px;background:#fff;color:#0f172a;box-shadow:0 24px 80px #0f172a44}#p79SpecialDaysDialog::backdrop{background:#0f172a88}
 #p79SpecialDaysDialog h2{font-size:21px;font-weight:900;margin:0 0 8px}#p79SpecialDaysDialog p{font-size:13px;line-height:1.7;color:#64748b;margin:8px 0 16px}#p79SpecialDaysDialog label{font-size:12px;font-weight:700;display:grid;gap:5px}#p79SpecialDaysDialog input,#p79SpecialDaysDialog select,#p79SpecialDaysDialog button{border:1px solid #cbd5e1;border-radius:9px;padding:9px;background:#fff;color:inherit;min-width:0;font-size:14px}#p79SpecialDaysDialog button{cursor:pointer;font-weight:700}#p79SpecialDaysDialog .p79-days-add{display:grid;grid-template-columns:1fr 1.25fr 1.25fr;gap:10px;background:#f1f5f9;padding:14px;border-radius:12px}#p79SpecialDaysDialog .p79-days-add button{grid-column:1/-1;background:#e0f2fe;color:#075985}#p79SpecialDaysDialog .p79-days-row{display:grid;grid-template-columns:1fr 1.5fr auto;gap:10px;align-items:end;margin:10px 0}#p79SpecialDaysDialog .p79-days-footer{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}#p79SpecialDaysDialog .primary{background:#2563eb;color:white;border-color:#2563eb}#p79SpecialDaysDialog .danger{color:#be123c}#p79-days-error{color:#b91c1c;font-size:13px;min-height:20px;margin-top:12px}#p79-days-list{max-height:36vh;overflow:auto;margin-top:16px}
 html.dark #p79SpecialDaysDialog{background:#0f172a;color:#e2e8f0}html.dark #p79SpecialDaysDialog input,html.dark #p79SpecialDaysDialog select,html.dark #p79SpecialDaysDialog button{background:#1e293b;color:#e2e8f0;color-scheme:dark}html.dark #p79SpecialDaysDialog .p79-days-add{background:#172033}html.dark #p79SpecialDaysDialog .primary{background:#2563eb}html.dark #p79SpecialDaysDialog p{color:#94a3b8}@media(max-width:480px){#p79SpecialDaysDialog{padding:16px}.p79-days-row{gap:5px!important}#p79SpecialDaysDialog .p79-days-add{grid-template-columns:1fr 1fr}#p79SpecialDaysDialog .p79-days-add label:first-child{grid-column:1/-1}}
 </style><h2 id="p79SpecialDaysTitle">颱風假／選舉日管理</h2>
 <p>可新增多個日期或連續多天，也可直接修改、刪除下方清單。設定保存在此瀏覽器，同一瀏覽器的考勤、工時共用；其他裝置不會自動同步。日期標記不會自動建立加班申報。</p>
 <div class="p79-days-add"><label>類型<select id="p79-days-kind"><option value="typhoon">颱風假</option><option value="election">選舉日</option></select></label><label>開始日期<input type="date" id="p79-days-from"></label><label>結束日期<input type="date" id="p79-days-to"></label><button type="button" id="p79-days-add">＋ 新增日期／區間</button></div>
 <div id="p79-days-list" aria-label="已設定日期"></div><div id="p79-days-error" role="status" aria-live="polite"></div>
 <div class="p79-days-footer"><button type="button" id="p79-days-cancel">取消</button><button type="button" class="primary" id="p79-days-save">儲存日期</button></div>`;
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
 };
 const close=()=>{dialog.close();dialog.remove();};
 $('p79-days-cancel').onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 $('p79-days-add').onclick=()=>{try{draft=normalize([...draft,...range($('p79-days-from').value,$('p79-days-to').value||$('p79-days-from').value,$('p79-days-kind').value)]);paint();error('已加入清單，按「儲存日期」才會生效。');}catch(e){error(e.message)}};
 $('p79-days-save').onclick=()=>{try{save(draft,initial);}catch(e){error(e.message);return;}close();onSave?.();g.showScheduleNotice?.('颱風假／選舉日已儲存','success');};
 const today=g.scheduleTaipeiTodayKey?.()||new Date().toISOString().slice(0,10),suggestion=today.startsWith(month+'-')?today:/^\d{4}-\d{2}$/.test(month)?month+'-01':today;
 $('p79-days-from').value=suggestion;$('p79-days-to').value=suggestion;
 $('p79-days-from').onchange=()=>{if($('p79-days-to').value<$('p79-days-from').value)$('p79-days-to').value=$('p79-days-from').value;};
 g.document.body.appendChild(dialog);paint();dialog.showModal();
}
g.P79SpecialDaysEditor={open,read,save,range,normalize,valid,signature};
g.addEventListener?.('storage',event=>{
 if(!Object.values(KEYS).includes(event.key))return;
 g.renderRoleScheduleView?.();
});
})(window);

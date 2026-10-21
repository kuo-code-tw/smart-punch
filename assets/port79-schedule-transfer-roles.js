(function(g){
'use strict';
const role=e=>String(e.role||e.jobTitle||'未設定').trim()||'未設定',esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function filter(people,roles){const selected=new Set(roles||[]);return people.filter(e=>selected.has(role(e)));}
let active=null;
function select({employees,mode,month,priority=()=>0}){
 if(active)return Promise.resolve(null);
 const counts=new Map();for(const e of employees)counts.set(role(e),(counts.get(role(e))||0)+1);
 const roles=[...counts.keys()].sort((a,b)=>priority(a)-priority(b)||a.localeCompare(b,'zh-Hant'));if(!roles.length){alert('目前沒有可選擇的人員職稱');return Promise.resolve(null);}
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');active=dialog;dialog.id='p79ScheduleTransferRoles';
  dialog.innerHTML=`<style>#p79ScheduleTransferRoles{width:min(520px,calc(100vw - 28px));max-height:85dvh;border:1px solid #cbd5e1;border-radius:14px;padding:18px;background:#fff;color:#0f172a;font:14px sans-serif}#p79ScheduleTransferRoles::backdrop{background:#0f172a88}#p79ScheduleTransferRoles h2{font-size:18px;margin:0 0 8px}#p79ScheduleTransferRoles .sr-tools,#p79ScheduleTransferRoles footer{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:12px}#p79ScheduleTransferRoles .sr-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-height:45dvh;overflow:auto;margin:12px 0}#p79ScheduleTransferRoles label{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #dbe4ef;border-radius:8px}#p79ScheduleTransferRoles input{width:18px;height:18px}#p79ScheduleTransferRoles button{border:0;border-radius:8px;padding:9px 12px;background:#e2e8f0;color:#0f172a;cursor:pointer}#p79ScheduleTransferRoles .primary{background:#0369a1;color:#fff}#p79ScheduleTransferRoles button:disabled{opacity:.45;cursor:default}</style>
   <h2>${mode==='import'?'匯入':'匯出'}班表｜選擇職稱</h2><p>${esc(month)}　可勾選多個職稱</p><div class="sr-tools"><div><button type="button" data-all>全選</button> <button type="button" data-none>全部取消</button></div><span data-count role="status"></span></div><div class="sr-list">${roles.map((r,i)=>`<label><input type="checkbox" data-role-index="${i}" checked><span>${esc(r)}（${counts.get(r)}人）</span></label>`).join('')}</div><footer><button type="button" data-cancel>取消</button><button type="button" data-confirm class="primary"></button></footer>`;
  const choices=()=>roles.filter((r,i)=>dialog.querySelector('[data-role-index="'+i+'"]').checked);
  const paint=()=>{const picked=choices(),n=filter(employees,picked).length;dialog.querySelector('[data-count]').textContent='已選 '+picked.length+' 個職稱／'+n+' 人';const button=dialog.querySelector('[data-confirm]');button.disabled=!n;button.textContent=(mode==='import'?'選擇匯入檔案':'匯出已勾選')+'（'+n+'人）';};
  let done=false;const finish=value=>{if(done)return;done=true;active=null;dialog.close();dialog.remove();resolve(value);};
  dialog.querySelector('[data-all]').onclick=()=>{dialog.querySelectorAll('input').forEach(e=>e.checked=true);paint();};dialog.querySelector('[data-none]').onclick=()=>{dialog.querySelectorAll('input').forEach(e=>e.checked=false);paint();};dialog.onchange=paint;
  dialog.querySelector('[data-cancel]').onclick=()=>finish(null);dialog.oncancel=e=>{e.preventDefault();finish(null);};dialog.querySelector('[data-confirm]').onclick=()=>{const picked=choices();if(picked.length)finish(picked);};
  document.body.appendChild(dialog);dialog.showModal();paint();
 });
}
g.P79ScheduleTransferRoles={role,filter,select};
})(window);

(function(){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function init(){
 const toolbar=document.getElementById('attendanceRecordsToolbar'),admin=document.getElementById('viewAdmin');
 if(!toolbar||document.getElementById('p79SessionCandidateBtn'))return;
 const btn=document.createElement('button');btn.id='p79SessionCandidateBtn';btn.type='button';btn.textContent='🔎 漏卡登入核對（試用）';
 btn.className='px-3 py-2 rounded-xl border border-indigo-300 bg-indigo-50 text-indigo-800 text-xs font-bold';
 btn.addEventListener('click',()=>{
  if(admin.classList.contains('hidden'))return;
  document.getElementById('p79SessionCandidateDialog')?.remove();
  const dlg=document.createElement('dialog');dlg.id='p79SessionCandidateDialog';
  dlg.style.cssText='width:min(620px,calc(100vw - 24px));max-height:85vh;overflow:auto;border:1px solid #cbd5e1;border-radius:16px;padding:18px;background:white;color:#0f172a';
  dlg.innerHTML='<h3 style="font-weight:800;font-size:18px">漏卡登入／登出候選紀錄（試用）</h3><p style="margin:8px 0;font-size:12px">只供核對，不會自動補卡、修改正式考勤或計算加班。登入不代表上班，登出不代表下班。</p><label>員工編號 <input id="p79SessionEmp" placeholder="輸入完整員工編號" style="border:1px solid #cbd5e1;padding:8px;width:100%"></label><label style="display:block;margin-top:8px">要核對的工作日期 <input type="date" id="p79SessionDate" style="border:1px solid #cbd5e1;padding:8px;width:100%"></label><div style="display:flex;gap:8px;margin-top:12px"><button id="p79SessionFind" style="padding:9px;background:#3730a3;color:white;border-radius:8px">查詢候選時間</button><button id="p79SessionClose" style="padding:9px;border:1px solid #cbd5e1;border-radius:8px">關閉</button></div><div id="p79SessionResult" aria-live="polite" style="margin-top:12px;font-size:13px"></div>';
  document.body.appendChild(dlg);
  dlg.querySelector('#p79SessionDate').value=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  dlg.querySelector('#p79SessionClose').onclick=()=>dlg.close();
  dlg.querySelector('#p79SessionFind').onclick=()=>{
   const id=dlg.querySelector('#p79SessionEmp').value.trim().toUpperCase(),date=dlg.querySelector('#p79SessionDate').value,out=dlg.querySelector('#p79SessionResult');
   if(!id||!/^\d{4}-\d{2}-\d{2}$/.test(date)){out.textContent='請輸入員工編號和日期';return;}
   let local=[];try{local=JSON.parse(localStorage.getItem('sp_session_logs_v1')||'[]');}catch(e){}
   let current=[];try{if(typeof sessionLogs!=='undefined'&&Array.isArray(sessionLogs))current=sessionLogs;}catch(e){}
   const logs=[...local,...current].filter(x=>x&&String(x.empId||'').trim().toUpperCase()===id&&['LOGIN','LOGOUT'].includes(x.action));
   const byId=new Map(logs.map(x=>[String(x.id||x.empId+'|'+x.action+'|'+x.timeStr),x]));
   const from=Date.parse(date+'T00:00:00+08:00'),to=from+48*3600000;
   const candidate=[...byId.values()].filter(x=>{const t=Date.parse(String(x.timeStr||'').replace(/\//g,'-').replace(' ','T')+'+08:00');return Number.isFinite(t)&&t>=from&&t<to;}).sort((a,b)=>String(a.timeStr).localeCompare(String(b.timeStr)));
   out.innerHTML=candidate.length?'<strong>找到 '+candidate.length+' 筆候選紀錄（含當日及隔日，跨日僅供人工核對）</strong><ul style="padding-left:18px;margin-top:8px">'+candidate.map(x=>'<li>'+esc(x.timeStr)+'｜'+(x.action==='LOGIN'?'登入':'登出')+'｜'+esc(x.source||'未知來源')+'</li>').join('')+'</ul>':'沒有找到可用的登入／登出紀錄。舊紀錄可能未曾儲存、同步失敗或超過本機保留範圍；不能推算打卡時間。';
  };
  dlg.showModal();
  dlg.addEventListener('close',()=>dlg.remove(),{once:true});
 });
 toolbar.appendChild(btn);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
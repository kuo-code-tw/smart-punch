(function(){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function shiftWindow(id,date){
 let roster=[];try{if(typeof schedules!=='undefined'&&Array.isArray(schedules))roster=schedules;}catch(e){}
 const schedule=roster.find(x=>String(x?.empId||'').trim().toUpperCase()===id)?.schedule||{};
 const label=schedule[date]??schedule[date.replace(/-/g,'/')]??schedule[String(Number(date.slice(-2)))];
 const ranges={早:[8,16],中:[16,24],晚:[24,32]};
 const range=ranges[label],base=Date.parse(date+'T00:00:00+08:00');
 return {label:String(label||'未知班別'),start:range?base+range[0]*3600000:null,end:range?base+range[1]*3600000:null};
}
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
   const shift=shiftWindow(id,date),base=Date.parse(date+'T00:00:00+08:00');
   const from=shift.start===null?base:shift.start-7200000;
   const to=shift.end===null?base+48*3600000:shift.end+7200000;
   const candidate=[...byId.values()].filter(x=>{const t=Date.parse(String(x.timeStr||'').replace(/\\//g,'-').replace(' ','T')+'+08:00');return Number.isFinite(t)&&t>=from&&t<=to;}).sort((a,b)=>String(a.timeStr).localeCompare(String(b.timeStr)));
   const heading='<strong>排班：'+esc(shift.label)+'</strong><p style="font-size:12px;margin:5px 0">'+(shift.start===null?'未找到可辨識的班別，保留當日及隔日查詢。':'依班別起迄前後各2小時查詢；跨日依工作日期處理。')+'</p>';
   out.innerHTML=heading+(candidate.length?'<strong>找到 '+candidate.length+' 筆候選紀錄</strong><ul style="padding-left:18px;margin-top:8px">'+candidate.map(x=>'<li>'+esc(x.timeStr)+'｜'+(x.action==='LOGIN'?'登入':'登出')+'｜'+esc(x.source||'未知來源')+'</li>').join('')+'</ul>':'沒有找到可用的登入／登出紀錄，請人工核對。');
  };
  dlg.showModal();
  dlg.addEventListener('close',()=>dlg.remove(),{once:true});
 });
 toolbar.appendChild(btn);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
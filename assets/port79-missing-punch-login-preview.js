(function(g){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=s=>String(s??'').trim().toUpperCase();
function timestamp(value){
 const text=String(value||'').trim(),m=text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
 return m?Date.parse(m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0')+'T'+m[4].padStart(2,'0')+':'+m[5]+':'+(m[6]||'00')+'+08:00'):NaN;
}
function dateRange(start,end){
 const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 if(!valid(start)||!valid(end)||end<start)throw Error('請選擇正確的開始與結束日期');
 const count=(Date.parse(end)-Date.parse(start))/86400000+1;
 if(count>31)throw Error('一次最多搜尋31天，請縮小日期區間');
 return Array.from({length:count},(_,i)=>new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10));
}
function shiftWindow(date,label){
 const base=Date.parse(date+'T00:00:00+08:00'),text=String(label||'').trim();
 let range=({早:[8,16],中:[16,24],晚:[24,32]})[text];
 const m=text.match(/^(?:休|例|國|代|延)?\s*(\d{1,2})(?::(\d{2}))?\s*[-~～至]\s*(\d{1,2})(?::(\d{2}))?$/);
 if(m){const a=Number(m[1])+Number(m[2]||0)/60;let b=Number(m[3])+Number(m[4]||0)/60;if(b<=a)b+=24;if(a<=24&&Number(m[3])<=24&&b<=48&&Number(m[2]||0)<60&&Number(m[4]||0)<60)range=[a,b];}
 return range?{start:base+range[0]*3600000,end:base+range[1]*3600000}:null;
}
function candidates(logs,empId,date,label){
 const window=shiftWindow(date,label),base=Date.parse(date+'T00:00:00+08:00'),seen=new Set();
 return logs.filter(x=>x&&id(x.empId)===id(empId)&&['LOGIN','LOGOUT'].includes(x.action)&&(!x.role||x.role==='employee')).filter(x=>{
  const time=timestamp(x.timeStr),key=[x.id||'',id(x.empId),x.action,time].join('|');
  if(!Number.isFinite(time)||time<(window?window.start-7200000:base)||time>(window?window.end+7200000:base+48*3600000)||seen.has(key))return false;
  seen.add(key);return true;
 }).sort((a,b)=>timestamp(a.timeStr)-timestamp(b.timeStr));
}
function missingRows(dailyRows,logs,start,end,now=Date.now()){
 const today=new Date(now+8*3600000).toISOString().slice(0,10),byEmployee=new Map();
 logs.forEach(log=>{const key=id(log?.empId);if(!byEmployee.has(key))byEmployee.set(key,[]);byEmployee.get(key).push(log);});
 return dailyRows.slice(1).filter(r=>r[0]>=start&&r[0]<=end&&r[0]<=today).flatMap(r=>{
  const [date,attNo,empId,name,dept,role,label,clockIn,clockOut]=r;
  if(clockIn&&clockOut)return [];
  const shift=shiftWindow(date,label);
  // An active shift has not missed its clock-out yet. No-card rest/leave
  // dates are not evidence of a missed punch and never become absence here.
  if(!clockOut&&(shift?now<shift.end:date>=today))return [];
  if(!clockIn&&!clockOut&&!shift)return [];
  const kind=clockIn?'OUT':clockOut?'IN':'BOTH';
  return [{date,attNo,empId,name,dept,role,label,clockIn,clockOut,kind,logs:candidates(byEmployee.get(id(empId))||[],empId,date,label)}];
 });
}
function filterRows(rows,query,kind){
 const text=id(query);return rows.filter(r=>(!kind||r.kind===kind)&&(!text||[r.name,r.empId,r.attNo,r.dept,r.role].some(x=>id(x).includes(text))));
}
async function load(start,end){
 const dates=dateRange(start,end),months=[...new Set(dates.map(d=>d.slice(0,7)))];
 if(!hasAuthoritativeAdminSession())throw Error('請以管理帳號登入考勤系統');
 if(!isVerifiedSuperAdminSession()&&!['view','manage'].includes(getFourSystemPermissions(currentEmp||{}).schedule))throw Error('搜尋排班漏卡需要查看排班的權限');
 const token=getAttendanceEmployeeMasterToken(),backend=getActiveGasUrl();
 const assertCurrent=()=>{if(!hasAuthoritativeAdminSession()||getAttendanceEmployeeMasterToken()!==token||getActiveGasUrl()!==backend)throw Error('登入身分已變更，請重新搜尋');};
 const people=getAdminAttendanceEmployees().map(p=>({...p}));
 const url=new URL(backend);url.searchParams.set('action','getData');url.searchParams.set('token',token);url.searchParams.set('gcToken',token);url.searchParams.set('t',String(Date.now()));
 // The read is explicit and read-only; never merge search snapshots into the
 // current attendance page or reuse local logs as an authoritative cloud reply.
 const logPromise=fetchGasJsonWithRetry(url.toString(),'登入／登出核對',1,25000).then(data=>{
  assertCurrent();if(!data?.ok)throw Error(data?.error||'登入／登出紀錄讀取失敗');
  return Array.isArray(data.sessionLogs)?{rows:data.sessionLogs,available:true}:{rows:[],available:false};
 }).catch(error=>({rows:[],available:false,error:String(error?.message||error)}));
 try{
  const daily=[];
  for(const month of months){
   assertCurrent();
   const [scope,roster]=await Promise.all([p79ReadAttendanceExportScope(month),p79ReadAttendanceExportSource('getScheduleDataSecure',month)]);
   assertCurrent();
   const report=p79BuildScheduleAttendanceExport(month,people,scope.source.filter(canCurrentAdminViewDataRow),roster);
   daily.push(...report.dailyRows.slice(1));
  }
  const logs=await logPromise;assertCurrent();
  const rows=missingRows([[],...daily],logs.rows,start,end);
  return {rows,logsAvailable:logs.available,assertCurrent};
 }catch(error){await logPromise;throw error;}
}
function init(){
 const toolbar=document.getElementById('attendanceRecordsToolbar'),admin=document.getElementById('viewAdmin');
 if(!toolbar||document.getElementById('p79SessionCandidateBtn'))return;
 const btn=document.createElement('button');btn.id='p79SessionCandidateBtn';btn.type='button';btn.textContent='🔎 漏卡搜尋／登入核對';
 btn.className='px-3 py-2 rounded-xl border border-indigo-300 bg-indigo-50 text-indigo-800 text-xs font-bold';
 btn.addEventListener('click',()=>{
  if(admin.classList.contains('hidden')||!hasAuthoritativeAdminSession())return;
  document.getElementById('p79SessionCandidateDialog')?.remove();
  const dlg=document.createElement('dialog');dlg.id='p79SessionCandidateDialog';
  dlg.style.cssText='width:min(1280px,calc(100vw - 24px));max-height:90vh;overflow:auto;border:1px solid #cbd5e1;border-radius:16px;padding:18px;background:white;color:#0f172a';
  dlg.innerHTML=`<style>#p79SessionCandidateDialog *{box-sizing:border-box}#p79SessionCandidateDialog .mp-fields{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:14px 0}#p79SessionCandidateDialog label{display:flex;flex-direction:column;gap:4px;font-size:13px}#p79SessionCandidateDialog input,#p79SessionCandidateDialog select{border:1px solid #cbd5e1;border-radius:8px;padding:8px;min-height:40px;color:#0f172a;background:white}#p79SessionCandidateDialog button{padding:9px 14px;border:1px solid #cbd5e1;border-radius:9px;color:#172e4b;background:#f1f5f9;cursor:pointer}#p79SessionCandidateDialog #p79SessionFind{background:#3730a3;color:white}#p79SessionCandidateDialog .mp-scroll{overflow:auto;max-height:55vh;border:1px solid #dbe3ee;border-radius:10px}#p79SessionCandidateDialog table{width:100%;min-width:950px;border-collapse:separate;border-spacing:0;font-size:13px}#p79SessionCandidateDialog th{position:sticky;top:0;background:#eaf1f8;z-index:1}#p79SessionCandidateDialog th,#p79SessionCandidateDialog td{padding:10px;text-align:center;border-bottom:1px solid #e2e8f0;white-space:nowrap}#p79SessionCandidateDialog .mp-missing{color:#b91c1c;font-weight:800}#p79SessionCandidateDialog p{font-size:13px;line-height:1.6;margin:8px 0}</style><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><h3 style="font-weight:800;font-size:18px">漏卡搜尋／登入登出比對</h3><button id="p79SessionClose" type="button">關閉</button></div><p>選日期後搜尋全部可查看人員；姓名、工號、考勤號可輸入部分文字篩選。跨日依工作日期核對，尚未結束的班次不列為漏下班卡。</p><div class="mp-fields"><label>開始日期<input type="date" id="p79SessionDate"></label><label>結束日期<input type="date" id="p79SessionEnd"></label><label>搜尋人員<input id="p79SessionEmp" placeholder="姓名／工號／考勤號／職稱"></label><label>缺卡類型<select id="p79SessionKind"><option value="">全部缺卡</option><option value="IN">缺上班卡</option><option value="OUT">缺下班卡</option><option value="BOTH">排班整天無卡</option></select></label><button id="p79SessionFind" type="button">搜尋漏卡</button></div><p id="p79SessionStatus" role="status">請選日期並按「搜尋漏卡」，不需要先輸入完整員工編號。</p><div id="p79SessionResult"></div><p>登入／登出時間僅供人工比對，不能當作正式上下班卡。整天無卡仍須核對休假，不會由此搜尋自動補卡或更動排班。</p>`;
  document.body.appendChild(dlg);
  const $=id=>dlg.querySelector('#'+id),today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  $('p79SessionDate').value=today;$('p79SessionEnd').value=today;
  $('p79SessionDate').max=today;$('p79SessionEnd').max=today;
  let snapshot=null,generation=0;
  const paint=()=>{
   if(!snapshot)return;
   try{snapshot.assertCurrent();}catch(error){snapshot=null;$('p79SessionResult').textContent='';$('p79SessionStatus').textContent=error.message;return;}
   const rows=filterRows(snapshot.rows,$('p79SessionEmp').value,$('p79SessionKind').value);
   const counts=k=>snapshot.rows.filter(r=>r.kind===k).length;
   $('p79SessionStatus').textContent=`找到 ${snapshot.rows.length} 筆：缺上班 ${counts('IN')}、缺下班 ${counts('OUT')}、排班整天無卡 ${counts('BOTH')}；目前顯示 ${rows.length} 筆。`+(snapshot.logsAvailable?'':' 登入／登出紀錄未完整讀取，候選時間暫無法核對。');
   const cells=rows.map(r=>'<tr>'+[r.date,r.attNo,r.name+'（'+r.empId+'）',r.role,r.label||'未排班',r.kind==='IN'?'缺上班卡':r.kind==='OUT'?'缺下班卡':'整天無卡（待核對休假）',r.clockIn||'—',r.clockOut||'—',snapshot.logsAvailable?(r.logs.filter(x=>x.action==='LOGIN').map(x=>x.timeStr).join('、')||'無候選紀錄'):'未讀取完成',snapshot.logsAvailable?(r.logs.filter(x=>x.action==='LOGOUT').map(x=>x.timeStr).join('、')||'無候選紀錄'):'未讀取完成'].map((v,i)=>'<td'+(i===5?' class="mp-missing"':'')+'>'+esc(v)+'</td>').join('')+'</tr>').join('');
   $('p79SessionResult').innerHTML=rows.length?'<div class="mp-scroll"><table><thead><tr>'+['工作日期','考勤號','姓名／工號','職稱','排班','缺卡情形','上班卡','下班卡','登入候選','登出候選'].map(v=>'<th>'+v+'</th>').join('')+'</tr></thead><tbody>'+cells+'</tbody></table></div>':'<p>此條件沒有查到已結束班次的缺卡紀錄。</p>';
  };
  $('p79SessionEmp').oninput=paint;$('p79SessionKind').onchange=paint;
  const reset=()=>{generation++;snapshot=null;$('p79SessionResult').textContent='';$('p79SessionStatus').textContent='日期已更改，請重新搜尋';$('p79SessionFind').disabled=false;};
  $('p79SessionDate').onchange=reset;$('p79SessionEnd').onchange=reset;
  $('p79SessionClose').onclick=()=>dlg.close();
  $('p79SessionFind').onclick=async()=>{
   const attempt=++generation;snapshot=null;$('p79SessionResult').textContent='';$('p79SessionFind').disabled=true;$('p79SessionStatus').textContent='正在讀取正式考勤、跨日紀錄、排班與登入紀錄…';
   try{const start=$('p79SessionDate').value,end=$('p79SessionEnd').value;dateRange(start,end);if(end>today)throw Error('請選擇今天或之前的日期');const result=await load(start,end);if(attempt!==generation||!dlg.open)return;snapshot=result;paint();}
   catch(error){if(attempt===generation&&dlg.open)$('p79SessionStatus').textContent='搜尋未完成：'+String(error?.message||error);}
   finally{if(attempt===generation&&dlg.open)$('p79SessionFind').disabled=false;}
  };
  dlg.showModal();dlg.addEventListener('close',()=>{generation++;snapshot=null;dlg.remove();},{once:true});
 });
 const actions=toolbar.querySelector(':scope > div:nth-child(2)');
 (actions||toolbar).appendChild(btn);
}
g.P79MissingPunchSearch={timestamp,dateRange,shiftWindow,candidates,missingRows,filterRows,load};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);

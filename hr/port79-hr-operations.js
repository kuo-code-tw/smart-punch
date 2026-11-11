/* HR additions: authorized draft payroll and training ledger. No cloud writes. */
(function(){
'use strict';
const MET=window.P79HrVerifiedMetrics;
if(!MET)return;
const $=id=>document.getElementById(id);let training=[],drafts=[],mounted=false,lastSessionIdentity='';
const elEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v??'').trim();
function roster(){try{return typeof employees!=='undefined'&&Array.isArray(employees)?employees:[]}catch(e){return []}}
function session(){try{return JSON.parse(sessionStorage.getItem('port79_user_session')||sessionStorage.getItem('admin_session')||'null')}catch(e){return null}}
function role(){const s=session();return String(s?.adminRole||s?.role||s?.actualAdminRole||'').toLowerCase()}
function access(view){
 const s=session(),r=role();
 if(!s||!['admin','superadmin'].includes(r)||s.punchOnly)return false;
 if(r==='superadmin')return true;
 if(!['view','manage'].includes(String(s.systemPermissions?.hr||'')))return false;
 if(view==='payroll')return s.finePermissions?.hr?.['payroll.view']===true;
 if(view==='training')return s.finePermissions?.hr?.['people.view']===true;
 return false;
}
function clearIfIdentityChanged(){
 const s=session(),key=String(s?.empId||'')+'|'+String(sessionStorage.getItem('port79_user_token')||sessionStorage.getItem('port79_admin_token')||'');
 if(lastSessionIdentity&&key!==lastSessionIdentity){
  drafts=[];training=[];
  for(const type of ['payroll','training']){const p=$('p79rOp'+type);if(p){p.dataset.installed='0';p.innerHTML=''}}
 }
 lastSessionIdentity=key;
}
function lookup(id){
 const e=roster().find(e=>norm(e.empId).toUpperCase()===norm(id).toUpperCase());return e||null;
}
function employeesOptions(kind){
 const source=roster().filter(e=>MET.isWorking(e,new Date().toISOString().slice(0,10)));
 return '<option value="">請選擇員工</option>'+source.sort((a,b)=>norm(a.empId).localeCompare(norm(b.empId),'zh-TW',{numeric:true})).map(e=>
 '<option value="'+elEscape(e.empId)+'">'+elEscape(e.empId+'｜'+(e.name||'未命名')+'｜'+(e.dept||'未設定'))+'</option>').join('');
}
function csvEsc(value){
 let s=String(value??'');
 if(/^[=+\-@\t\r]/.test(s))s="'"+s;
 return '"'+s.replaceAll('"','""')+'"';
}
function exportCsv(name,headers,rows){
 const csv='\uFEFF'+[headers,...rows].map(row=>row.map(csvEsc).join(',')).join('\r\n')+'\r\n';
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function payrollHtml(){
 return '<section class="p79r-panel p79r-ops"><h2 class="p79r-title">💰 薪資作業｜授權試算</h2>'+
 '<p class="p79r-warning"><b>試算工具，非正式薪資結算。</b> 欄位金額必須由授權人員輸入；不會自動推估底薪、勞健保、稅款或加班費率，並且不會儲存在雲端。離開或重整此頁後暫存試算可能消失，請自行匯出核對。</p>'+
 '<p class="p79r-note" id="p79rPayrollStatus">只有超級管理員或明確具有薪資檢視權限者可使用；功能僅在目前瀏覽器記憶體中運作。</p>'+
 '<form id="p79rPayrollForm" autocomplete="off">'+
 '<div class="p79r-ops-fields"><label>員工<select name="employee" id="p79rPayrollEmployee" required></select></label>'+
 '<label>計薪月份<input type="month" name="month" id="p79rPayrollMonth" required></label>'+
 '<label>底薪／固定薪資 (NT$)<input type="number" inputmode="decimal" min="0" max="100000000" step="0.01" name="base" value="0" required></label>'+
 '<label>津貼／獎金 (NT$)<input type="number" min="0" max="100000000" step="0.01" name="allowance" value="0" required></label>'+
 '<label>加班費（已核算金額）(NT$)<input type="number" min="0" max="100000000" step="0.01" name="overtime" value="0" required></label>'+
 '<label>扣款（請人工確認）(NT$)<input type="number" min="0" max="100000000" step="0.01" name="deductions" value="0" required></label></div>'+
 '<div class="p79r-ops-actions"><button type="submit">計算並加入暫存表</button><button type="button" id="p79rPayrollExport">匯出暫存試算 CSV</button><button type="button" id="p79rPayrollClear">清空暫存試算</button></div>'+
 '</form><div id="p79rPayrollResult" role="status" aria-live="polite"></div>'+
 '<div class="p79r-ops-table"><table><thead><tr><th>月份</th><th>工號</th><th>姓名</th><th>底薪</th><th>津貼</th><th>加班費</th><th>扣款</th><th>總應發</th><th>試算實領</th><th>操作</th></tr></thead><tbody id="p79rPayrollRows"><tr><td colspan="10">尚無試算紀錄</td></tr></tbody></table></div></section>';
}
function trainingHtml(){
 return '<section class="p79r-panel p79r-ops"><h2 class="p79r-title">🎓 教育訓練｜台帳整理</h2>'+
 '<p class="p79r-warning"><b>訓練台帳尚未串接正式雲端資料庫。</b> 可以輸入、刪除、匯入和匯出 CSV 供管理員核對；資料只保留在目前頁面，並非正式的教育訓練完成認證，也不會改動原本人資主檔。</p>'+
 '<form id="p79rTrainingForm" autocomplete="off">'+
 '<div class="p79r-ops-fields"><label>員工<select name="employee" id="p79rTrainingEmployee" required></select></label>'+
 '<label>課程名稱<input name="course" maxlength="100" required placeholder="請輸入實際課程"></label>'+
 '<label>上課日期<input type="date" name="date" required></label>'+
 '<label>課程時數<input type="number" name="hours" min="0.5" max="1000" step="0.5" required></label>'+
 '<label>完成狀態<select name="status"><option>計畫中</option><option>進行中</option><option>已完成</option></select></label>'+
 '<label>證照有效期限（如無可留空）<input type="date" name="expiry"></label></div>'+
 '<div class="p79r-ops-actions"><button type="submit">加入本次台帳</button><button type="button" id="p79rTrainingExport">匯出 CSV</button><label class="p79r-ops-import">匯入 CSV<input type="file" id="p79rTrainingImport" accept=".csv,text/csv"></label><button type="button" id="p79rTrainingClear">清空本次台帳</button></div>'+
 '</form><div id="p79rTrainingResult" role="status" aria-live="polite"></div>'+
 '<div class="p79r-ops-table"><table><thead><tr><th>工號</th><th>姓名</th><th>課程</th><th>上課日期</th><th>時數</th><th>進度</th><th>證照效期</th><th>操作</th></tr></thead><tbody id="p79rTrainingRows"><tr><td colspan="8">尚未建立訓練台帳</td></tr></tbody></table></div></section>';
}
function show(v){
 if(!mounted)return;
 clearIfIdentityChanged();
 for(const k of ['payroll','training']){const panel=$('p79rOp'+k);if(panel)panel.hidden=v!==k}
 if(!['payroll','training'].includes(v))return;
 const panel=$('p79rOp'+v);
 if(!access(v)){panel.dataset.installed='0';panel.innerHTML='<section class="p79r-panel p79r-ops"><h2 class="p79r-title">'+(v==='payroll'?'薪資作業':'教育訓練')+'</h2><p class="p79r-warning">此帳號未取得對應資料權限，無法操作。</p></section>';return}
 if(panel.dataset.installed==='1'){
  const select=$('p79r'+(v==='payroll'?'Payroll':'Training')+'Employee');
  if(select)select.innerHTML=employeesOptions(v);
  return
 }
 panel.innerHTML=v==='payroll'?payrollHtml():trainingHtml();
 panel.dataset.installed='1';
 if(v==='payroll')bindPayroll();
 else bindTraining();
}
function renderPayroll(){
 const tbody=$('p79rPayrollRows');if(!tbody)return;
 tbody.innerHTML=drafts.length?drafts.map((r,i)=>
 '<tr><td>'+elEscape(r.month)+'</td><td>'+elEscape(r.empId)+'</td><td>'+elEscape(r.name)+'</td>'+
 [r.base,r.allowance,r.overtime,r.deductions,r.gross,r.net].map(n=>'<td>'+n.toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2})+'</td>').join('')+
 '<td><button type="button" data-payroll-delete="'+i+'">刪除</button></td></tr>').join(''):'<tr><td colspan="10">尚無試算紀錄</td></tr>';
 tbody.querySelectorAll('[data-payroll-delete]').forEach(b=>b.onclick=()=>{drafts.splice(Number(b.dataset.payrollDelete),1);renderPayroll()});
}
function bindPayroll(){
 const form=$('p79rPayrollForm'),result=$('p79rPayrollResult');$('p79rPayrollEmployee').innerHTML=employeesOptions('payroll');
 $('p79rPayrollMonth').value=new Date().toISOString().slice(0,7);
 form.addEventListener('submit',function(ev){
  ev.preventDefault();
  if(!access('payroll')){result.textContent='權限已變更，試算停止';return}
  const data=new FormData(form),person=lookup(data.get('employee'));
  if(!person){result.textContent='找不到此員工，請重新同步人資主檔';return}
  const month=String(data.get('month')||''),calc=MET.payDraft(Object.fromEntries(data));
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!calc.ok){result.textContent=calc.error||'請輸入有效月份';return}
  drafts=drafts.filter(r=>!(r.empId===person.empId&&r.month===month));
  drafts.push({empId:person.empId,name:person.name||'',month,...calc});
  result.textContent='已完成試算：應發 NT$ '+calc.gross.toFixed(2)+'，試算實領 NT$ '+calc.net.toFixed(2)+'（未儲存雲端）';
  renderPayroll();
 });
 $('p79rPayrollExport').onclick=()=>{
  if(!access('payroll')||!drafts.length){result.textContent='權限不足或尚無試算資料';return}
  exportCsv('薪資試算-'+new Date().toISOString().slice(0,10)+'.csv',
   ['月份','工號','姓名','底薪','津貼獎金','加班費','扣款','總應發','試算實領','備註'],
   drafts.map(r=>[r.month,r.empId,r.name,r.base,r.allowance,r.overtime,r.deductions,r.gross,r.net,'非正式薪資結算／無雲端儲存']));
 };
 $('p79rPayrollClear').onclick=()=>{if(confirm('確定清空尚未匯出的暫存薪資試算？')){drafts=[];renderPayroll()}};
}
function validateTraining(input){
 const person=lookup(input.empId);
 if(!person)return'工號不在人資主檔';
 if(!norm(input.course)||norm(input.course).length>100)return'課程名稱不可空白或超過100字';
 if(MET.date(input.date)!==input.date)return'上課日期無效';
 if(input.expiry&&MET.date(input.expiry)!==input.expiry)return'證照有效日期無效';
 if(!/^\d+(?:\.5)?$/.test(String(input.hours))||Number(input.hours)<.5||Number(input.hours)>1000)return'課程時數不合法';
 if(!['計畫中','進行中','已完成'].includes(input.status))return'完成狀態不合法';
 return '';
}
function renderTraining(){
 const tbody=$('p79rTrainingRows');if(!tbody)return;
 tbody.innerHTML=training.length?training.map((r,i)=>
 '<tr><td>'+elEscape(r.empId)+'</td><td>'+elEscape(lookup(r.empId)?.name||'')+'</td><td>'+elEscape(r.course)+'</td><td>'+elEscape(r.date)+'</td><td>'+elEscape(r.hours)+'</td><td>'+elEscape(r.status)+'</td><td>'+elEscape(r.expiry||'—')+'</td><td><button type="button" data-training-delete="'+i+'">刪除</button></td></tr>').join(''):'<tr><td colspan="8">尚未建立訓練台帳</td></tr>';
 tbody.querySelectorAll('[data-training-delete]').forEach(b=>b.onclick=()=>{training.splice(Number(b.dataset.trainingDelete),1);renderTraining()});
}
function parseCsv(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted&&c==='"'&&text[i+1]==='"'){cell+='"';i++;continue}
  if(c==='"'){quoted=!quoted;continue}
  if(c===','&&!quoted){row.push(cell);cell='';continue}
  if((c==='\n'||c==='\r')&&!quoted){
   if(c==='\r'&&text[i+1]==='\n')i++;
   row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';continue
  }cell+=c
 }
 if(quoted)throw Error('CSV 引號未正確關閉');
 row.push(cell);if(row.some(v=>v!==''))rows.push(row);
 return rows;
}
function bindTraining(){
 const form=$('p79rTrainingForm'),result=$('p79rTrainingResult');$('p79rTrainingEmployee').innerHTML=employeesOptions('training');
 form.addEventListener('submit',ev=>{
  ev.preventDefault();if(!access('training'))return;
  const data=new FormData(form),record={empId:norm(data.get('employee')),course:norm(data.get('course')),date:norm(data.get('date')),hours:norm(data.get('hours')),status:norm(data.get('status')),expiry:norm(data.get('expiry'))};
  const error=validateTraining(record);if(error){result.textContent=error;return}
  training.push(record);result.textContent='已加入本次暫存訓練台帳（尚未儲存雲端）';renderTraining();
 });
 $('p79rTrainingExport').onclick=()=>{
  if(!access('training')||!training.length){result.textContent='權限不足或目前沒有訓練紀錄';return}
  exportCsv('教育訓練台帳-'+new Date().toISOString().slice(0,10)+'.csv',
   ['工號','姓名','課程名稱','日期','時數','狀態','證照效期'],
   training.map(r=>[r.empId,lookup(r.empId)?.name||'',r.course,r.date,r.hours,r.status,r.expiry]));
 };
 $('p79rTrainingImport').onchange=async function(){
  if(!access('training')||!this.files?.[0])return;
  try{
   const file=this.files[0];if(file.size>2000000)throw Error('請使用小於 2MB 的 CSV');
   const data=parseCsv((await file.text()).replace(/^\uFEFF/,''));
   if(!data.length)throw Error('CSV 沒有有效資料');
   const [head,...rows]=data;if(head.slice(0,7).join(',')!=='工號,姓名,課程名稱,日期,時數,狀態,證照效期')throw Error('CSV 欄位不符，請先匯出模板');
   const incoming=rows.map(r=>({empId:norm(r[0]),course:norm(r[2]),date:norm(r[3]),hours:norm(r[4]),status:norm(r[5]),expiry:norm(r[6])}));
   for(const [index,row]of incoming.entries()){const e=validateTraining(row);if(e)throw Error('第 '+(index+2)+' 行：'+e)}
   if(!access('training'))throw Error('操作權限已變更');
   training.push(...incoming);result.textContent='已匯入 '+incoming.length+' 筆（仍僅本次暫存）';renderTraining();
  }catch(e){result.textContent='匯入失敗：'+String(e.message||e)}finally{this.value=''}
 };
 $('p79rTrainingClear').onclick=()=>{if(confirm('確定清空本次暫存訓練紀錄？')){training=[];renderTraining()}};
}
function mount(){
 if(mounted)return;
 const main=document.querySelector('main.wrap');if(!main||!$('p79rDashboard'))return;
 for(const name of ['payroll','training']){
  const d=document.createElement('section');d.id='p79rOp'+name;d.hidden=true;
  main.insertBefore(d,$('p79rDashboard').nextSibling);
 }
 const original=window.p79HrDashboardGo;
 window.p79HrDashboardGo=function(view){
  if(view!=='payroll'&&view!=='training'){
   original(view);show(view);return
  }
  original('dashboard');
  document.body.dataset.p79HrView=view;
  document.querySelectorAll('#p79HrShellV103 [data-hr-view]').forEach(el=>el.classList.toggle('active',el.dataset.hrView===view));
  show(view);
 };
 const quick=$('p79rDashboard')?.querySelector('.p79r-quick');
 if(quick)quick.insertAdjacentHTML('beforeend','<button type="button" data-hr-extra="payroll"><span class="icon">💰</span>薪資試算</button><button type="button" data-hr-extra="training"><span class="icon">🎓</span>教育訓練</button>');
 document.querySelectorAll('[data-hr-extra]').forEach(btn=>btn.addEventListener('click',()=>window.p79HrDashboardGo(btn.dataset.hrExtra)));
 mounted=true;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
window.P79HrOperations={access,validateTraining};
})();
/* Read-only leave dashboard presentation, 2026-11.
   This file never writes employee/leave/balance data or calls cloud APIs. */
(function(){
'use strict';
function init(){
 const main=document.querySelector('body[data-p79-system="leave"] > main');
 const admin=document.getElementById('adminMode');
 const balanceMode=document.getElementById('adminBalanceMode');
 if(!main||!admin||document.getElementById('p79LeaveVisualStats'))return;
 const create=(tag,cls)=>{const x=document.createElement(tag);if(cls)x.className=cls;return x;};
 const heading=create('div','p79-leave-visual-heading');
 heading.id='p79LeaveVisualHeading';
 heading.innerHTML='<div class="p79-leave-visual-heading-title"><span aria-hidden="true">♧</span><strong>請假管理</strong><small>請假申請・審核・紀錄查詢</small></div><div class="p79-leave-visual-heading-right">依原有權限與正式資料顯示</div>';
 main.insertBefore(heading,main.firstElementChild);
 const tabs=document.getElementById('leaveStickyTabs');
 const adminTab=document.getElementById('tabAdmin');
 const employeeTab=document.getElementById('tabEmployee');
 const balancePanel=document.getElementById('adminBalancePanel');
 if(tabs&&adminTab&&balancePanel){
   // A third presentation tab reuses the actual existing annual-balance
   // table. No table, leave record or quota is copied or recomputed.
   const balanceTab=create('button','tab hidden');
   balanceTab.id='tabLeaveBalances';
   balanceTab.type='button';
   balanceTab.textContent='🏖️ 員工年假剩餘天數';
   balanceTab.setAttribute('aria-controls','adminBalancePanel');
   tabs.insertBefore(balanceTab,adminTab.nextSibling);
   const closeBalance=()=>{
     document.documentElement.classList.remove('p79-leave-balance-only');
     balanceTab.classList.remove('active');
   };
   const syncBalancePermission=()=>{
     const unavailable=adminTab.classList.contains('hidden')||admin.classList.contains('hidden');
     balanceTab.classList.toggle('hidden',adminTab.classList.contains('hidden'));
     if(unavailable)closeBalance();
   };
   balanceTab.addEventListener('click',()=>{
     if(adminTab.classList.contains('hidden'))return;
     if(typeof switchMode==='function')switchMode('balance');
     if(!balanceMode||balanceMode.classList.contains('hidden'))return;
     document.documentElement.classList.add('p79-leave-balance-only');
     adminTab.classList.remove('active');
     balanceTab.classList.add('active');
     balancePanel.open=true;
     if(typeof renderAdminBalances==='function')renderAdminBalances();
   });
   adminTab.addEventListener('click',closeBalance);
   employeeTab?.addEventListener('click',closeBalance);
   const permissionWatcher=new MutationObserver(syncBalancePermission);
   permissionWatcher.observe(adminTab,{attributes:true,attributeFilter:['class']});
   syncBalancePermission();
 }
 const statusBanner=create('div','p79-leave-cloud-unverified-banner');
 statusBanner.id='p79LeaveCloudUnverified';
 statusBanner.setAttribute('role','status');
 statusBanner.textContent='正式請假紀錄尚未完成雲端核對。若顯示零筆或上次快取，均不是已確認的最新資料；請使用原本的「重新整理」重讀正式雲端。';
 statusBanner.hidden=true;
 // Outside the review card so the warning remains visible on the annual
 // balance tab as well, while never covering or altering the original rows.
 tabs?.insertAdjacentElement('afterend',statusBanner);
 const stats=create('section','p79-leave-visual-stats');
 stats.id='p79LeaveVisualStats';
 stats.setAttribute('aria-label','請假狀態統計');
 const kinds=[['pending','▤','待審核','件'],['approved','☑','已核准','件'],['rejected','⊗','已駁回','件'],['month','◷','本月請假','人次'],['days','▦','本月請假天數','天']];
 for(const [key,icon,label,unit] of kinds){
   const card=create('div','p79-leave-visual-stat p79-leave-visual-stat-'+key);
   const emblem=create('span','p79-leave-visual-stat-icon');emblem.textContent=icon;
   const inner=create('span','p79-leave-visual-stat-info');
   const title=create('span','p79-leave-visual-stat-title');title.textContent=label;
   const amt=create('span','p79-leave-visual-stat-amount');
   const num=create('strong');num.dataset.leaveVisualStat=key;num.textContent='—';
   const suffix=create('span');suffix.textContent=unit;
   amt.append(num,suffix);inner.append(title,amt);card.append(emblem,inner);stats.append(card);
 }
 admin.insertBefore(stats,admin.firstElementChild);
 const rail=create('aside','p79-leave-visual-side');
 rail.id='p79LeaveVisualSide';
 const quota=create('section','p79-leave-visual-panel p79-leave-visual-quota');
 quota.innerHTML='<div class="p79-leave-visual-panel-head"><strong>♙ 請假額度</strong><small>原有年假基準</small></div><div class="p79-leave-visual-person-filters"><label for="p79LeaveVisualJob">職稱<select id="p79LeaveVisualJob" aria-label="依目前單位選擇職稱"><option value="">請先選擇單位</option></select></label><label for="p79LeaveVisualPerson">姓名<select id="p79LeaveVisualPerson" aria-label="目前單位及職稱的人員"><option value="">請先選擇職稱</option></select></label></div><div class="p79-leave-visual-quota-grid"><div><small>可休合計</small><strong id="p79LeaveVisualEntitled">—</strong></div><div><small>已休</small><strong id="p79LeaveVisualUsed">—</strong></div><div><small>目前未休</small><strong id="p79LeaveVisualRemain">—</strong></div></div><p id="p79LeaveVisualQuotaNote">僅顯示現有年假餘額資料。</p>';
 const calendar=create('section','p79-leave-visual-panel p79-leave-visual-calendar');
 calendar.innerHTML='<div class="p79-leave-visual-panel-head"><strong>▣ 本月請假日曆</strong><small id="p79LeaveVisualMonth">—</small></div><div class="p79-leave-visual-weekdays" aria-hidden="true"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div id="p79LeaveVisualCalendarGrid" class="p79-leave-visual-calendar-grid" aria-label="實際請假紀錄月曆"></div><div class="p79-leave-visual-calendar-legend"><span><i class="annual"></i>特休</span><span><i class="personal"></i>事假</span><span><i class="sick"></i>病假</span><span><i class="other"></i>其他</span></div>';
 rail.append(quota,calendar);
 // The balance panel now lives in a separate section. Insert the rail in the
 // actual admin grid; insertBefore with a non-child throws NotFoundError.
 admin.append(rail);
 const personSelect=document.getElementById('p79LeaveVisualPerson');
 const jobSelect=document.getElementById('p79LeaveVisualJob');
 const people=()=>typeof employees!=='undefined'&&Array.isArray(employees)?employees:[];
 const records=()=>typeof leaveRecords!=='undefined'&&Array.isArray(leaveRecords)?leaveRecords:[];
 const permitted=record=>{
   try{return !window.p79OrgScope||typeof window.p79OrgScope.matches!=='function'||window.p79OrgScope.matches(record);}
   catch(_){return false;}
 };
 const dayKey=x=>(String(x||'').match(/\d{4}-\d{2}-\d{2}/)||[])[0]||'';
 const localMonth=()=>{
   const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).formatToParts(new Date());
   return (parts.find(p=>p.type==='year')?.value||'2026')+'-'+(parts.find(p=>p.type==='month')?.value||'01');
 };
 const month=()=>{
   const v=document.getElementById('filterMonth')?.value||'';
   return /^\d{4}-(0[1-9]|1[0-2])$/.test(v)?v:localMonth();
 };
 const overlaps=(r,m)=>{
   const start=dayKey(r.startDate||r.startTime),end=dayKey(r.endDate||r.endTime)||start;
   const [y,n]=m.split('-').map(Number),last=m+'-'+String(new Date(Date.UTC(y,n,0)).getUTCDate()).padStart(2,'0');
   return !!start&&start<=last&&end>=m+'-01';
 };
 const color=t=>/特休|年假/.test(String(t||''))?'annual':/事假/.test(String(t||''))?'personal':/病假|傷病/.test(String(t||''))?'sick':'other';
 // Left: job title. Right: names belonging to the selected UNIT and job.
 // The unit comes from the official existing #filterDept control. Never show
 // an all-company name list when the unit is unselected.
 const leaveStrokeCollator=new Intl.Collator('zh-TW-u-co-stroke',{numeric:true,sensitivity:'variant'});
 const personTitle=x=>String(x?.jobTitle||x?.deptDetail||x?.position||'未設定職稱').trim();
 const personName=x=>String(x?.name||x?.empName||x?.empId||'').trim();
 const selectedUnit=()=>String(document.getElementById('filterDept')?.value||'').trim();
 const officialUnit=x=>typeof p79LeaveUnitOfPerson==='function'?p79LeaveUnitOfPerson(x):
   typeof window!=='undefined'&&window.Port79OrgContext?.value?window.Port79OrgContext.value(x,'sections'):'';
 const activeEmployee=x=>typeof leaveEmployeeIsActive==='function'&&leaveEmployeeIsActive(x);
 const unitPeople=()=>{
   const unit=selectedUnit();
   return unit?people().filter(x=>x&&x.empId&&String(x.empId).toUpperCase()!=='ADMIN'&&
     permitted(x)&&activeEmployee(x)&&officialUnit(x)===unit):[];
 };
 function updatePeople(){
   const unit=selectedUnit();
   // Job titles are selectable even when the unit filter is on 全部單位.
   // Names remain limited to the explicitly selected unit, never all company.
   const eligible=people().filter(x=>x&&x.empId&&String(x.empId).toUpperCase()!=='ADMIN'&&
     permitted(x)&&activeEmployee(x));
   const allowed=unit?eligible.filter(x=>officialUnit(x)===unit):[];
   const jobSource=unit?allowed:eligible;
   const jobs=[...new Set(jobSource.map(personTitle).filter(Boolean))]
     .sort((a,b)=>leaveStrokeCollator.compare(a,b));
   const previousJob=jobSelect.value;
   const job=jobs.includes(previousJob)?previousJob:'';
   const shown=job?allowed.filter(x=>personTitle(x)===job)
     .slice().sort((a,b)=>leaveStrokeCollator.compare(personName(a),personName(b))||
       String(a.empId).localeCompare(String(b.empId),'zh-TW',{numeric:true})):[];
   const sig=unit+'|'+job+'|'+jobs.join(';')+'|'+jobSource.map(x=>
     x.empId+'|'+personName(x)+'|'+personTitle(x)).join(';');
   if(sig===personSelect.dataset.sourceSignature)return;
   const previousPerson=personSelect.value;
   jobSelect.replaceChildren();
   const jobDefault=document.createElement('option');
   jobDefault.value='';jobDefault.textContent=jobs.length?'請選擇職稱':'目前沒有可選職稱';
   jobSelect.append(jobDefault);
   for(const title of jobs){
     const opt=document.createElement('option');opt.value=title;opt.textContent=title;
     jobSelect.append(opt);
   }
   jobSelect.value=job;
   personSelect.replaceChildren();
   const choose=document.createElement('option');choose.value='';
   choose.textContent=!unit?'請先選擇單位':!job?'請先選擇職稱':shown.length?'請選擇姓名':'此職稱無符合人員';
   personSelect.append(choose);
   const counts=new Map();
   shown.forEach(x=>counts.set(personName(x),(counts.get(personName(x))||0)+1));
   shown.forEach(x=>{
     const opt=document.createElement('option');opt.value=String(x.empId);
     opt.textContent=personName(x)+(counts.get(personName(x))>1?'（'+x.empId+'）':'');
     personSelect.append(opt);
   });
   personSelect.value=shown.some(x=>String(x.empId)===previousPerson)?previousPerson:'';
   personSelect.dataset.sourceSignature=sig;
 }
 const showDays=(id,n)=>{
   document.getElementById(id).textContent=n!==null&&n!==undefined&&Number.isFinite(Number(n))?Number(n).toLocaleString('zh-TW',{maximumFractionDigits:1})+' 天':'—';
 };
 function updateQuota(){
   const e=jobSelect.value?unitPeople().find(x=>String(x.empId)===personSelect.value&&personTitle(x)===jobSelect.value):null;
   let info=null;try{if(e&&typeof leaveBalanceInfo==='function')info=leaveBalanceInfo(e);}catch(_){}
   showDays('p79LeaveVisualEntitled',info?.entitled??null);
   showDays('p79LeaveVisualUsed',info?.used??null);
   showDays('p79LeaveVisualRemain',info?.effectiveRemaining??null);
   document.getElementById('p79LeaveVisualQuotaNote').textContent=!selectedUnit()?'請先在上方選擇單位。':!jobSelect.value?'請先選擇職稱。':!e?'請選擇姓名。':info?.effectiveRemaining==null?'此人員尚無可核實的年假餘額。':'原有年假基準月份：'+String(e.leaveBalance?.asOf||'未註明');
 }
 function updateStats(rs,m,unverified=false){
   if(unverified){
     stats.querySelectorAll('[data-leave-visual-stat]').forEach(node=>{node.textContent='—';});
     return;
   }
   const matching=rs.filter(x=>overlaps(x,m));
   const count=s=>rs.filter(x=>String(x.status||'待審核').trim()===s).length;
   const values={pending:count('待審核'),approved:count('已核准'),rejected:count('已駁回'),month:matching.length,
     days:Math.round(matching.reduce((sum,x)=>{const n=Number(x.days??x.hours??0);return sum+(Number.isFinite(n)&&n>0?n:0);},0)*10)/10};
   for(const [key,v] of Object.entries(values)){const node=stats.querySelector('[data-leave-visual-stat="'+key+'"]');if(node)node.textContent=String(v);}
 }
 function updateCalendar(rs,m){
   document.getElementById('p79LeaveVisualMonth').textContent=m;
   const grid=document.getElementById('p79LeaveVisualCalendarGrid');
   const [y,n]=m.split('-').map(Number);
   const startDay=new Date(Date.UTC(y,n-1,1)).getUTCDay();
   const total=new Date(Date.UTC(y,n,0)).getUTCDate();
   const fragment=document.createDocumentFragment();
   for(let i=0;i<startDay;i++){const empty=create('span','p79-leave-visual-calendar-empty');empty.setAttribute('aria-hidden','true');fragment.append(empty);}
   for(let i=1;i<=total;i++){
     const date=m+'-'+String(i).padStart(2,'0');
     const matching=rs.filter(x=>{const a=dayKey(x.startDate||x.startTime),b=dayKey(x.endDate||x.endTime)||a;return !!a&&a<=date&&date<=b;});
     const cell=create('span','p79-leave-visual-calendar-day');
     if(new Date(Date.UTC(y,n-1,i)).getUTCDay()===0)cell.classList.add('sunday');
     const number=create('strong');number.textContent=String(i);cell.append(number);
     if(matching.length){
       cell.classList.add('has-leave');cell.title='請假紀錄 '+matching.length+' 筆';
       const dots=create('span','p79-leave-visual-calendar-dots');
       [...new Set(matching.map(x=>color(x.leaveType)))].slice(0,3).forEach(k=>dots.append(create('i',k)));
       cell.append(dots);
     }
     fragment.append(cell);
   }
   grid.replaceChildren(fragment);
 }
 let queued=false;
 function refresh(){
   if(queued)return;queued=true;
   Promise.resolve().then(()=>{
     queued=false;
     const active=!admin.classList.contains('hidden')||!!balanceMode&&!balanceMode.classList.contains('hidden');
     document.documentElement.classList.toggle('p79-leave-reference-admin',active);
     if(!active){
       statusBanner.hidden=true;
       document.documentElement.classList.remove('p79-leave-cloud-unverified');
       return;
     }
     updatePeople();updateQuota();
     const rs=records().filter(permitted),m=month();
     // A failed getLeaveData with HR-only fallback must never paint a
     // false "0 records" business conclusion. This is display-only.
     const cloudReady=typeof p79LeaveCloudDataReady!=='undefined'&&p79LeaveCloudDataReady===true;
     const unverified=!cloudReady;
     document.documentElement.classList.toggle('p79-leave-cloud-unverified',unverified);
     statusBanner.hidden=!unverified;
     const officialSummary=document.getElementById('adminLeaveSummary');
     if(unverified&&rs.length===0){
       // The original controller's zero-row fallback is NOT an official
       // getLeaveData result. Replace ONLY these UI text nodes with an
       // explicit unknown state; never touch leaveRecords or cloud storage.
       if(officialSummary){
         const warning='請假正式雲端紀錄尚未同步｜筆數待確認（目前不是 0 筆的正式核對結果）';
         if(officialSummary.textContent!==warning)officialSummary.textContent=warning;
       }
       const emptyRow=document.querySelector('#adminLeaveBody td[colspan="9"]');
       if(emptyRow){
         const message='正式請假紀錄讀取未完成，請按原本的「重新整理」讀取；目前尚無法確認請假筆數。';
         if(emptyRow.textContent!==message)emptyRow.textContent=message;
       }
     }
     updateStats(rs,m,unverified);updateCalendar(rs,m);
   });
 }
 personSelect.addEventListener('change',updateQuota);
 jobSelect.addEventListener('change',()=>{personSelect.value='';updatePeople();updateQuota();});
 document.getElementById('filterDept')?.addEventListener('change',()=>{
   // Retain the job if the new unit offers it; never retain an old employee.
   personSelect.value='';updatePeople();updateQuota();
 });
 for(const id of ['filterMonth','filterDept','filterJob','filterStatus'])document.getElementById(id)?.addEventListener('change',refresh);
 const observer=new MutationObserver(refresh);
 observer.observe(admin,{attributes:true,attributeFilter:['class']});
 if(balanceMode)observer.observe(balanceMode,{attributes:true,attributeFilter:['class']});
 observer.observe(document.getElementById('adminLeaveBody'),{childList:true});
 const readStatus=document.getElementById('globalStatus');
 if(readStatus)observer.observe(readStatus,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
 window.addEventListener('pageshow',refresh);
 refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

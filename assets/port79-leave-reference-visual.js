/* Read-only leave dashboard presentation, 2026-11.
   This file never writes employee/leave/balance data or calls cloud APIs. */
(function(){
'use strict';
function init(){
 const main=document.querySelector('body[data-p79-system="leave"] > main');
 const admin=document.getElementById('adminMode');
 if(!main||!admin||document.getElementById('p79LeaveVisualStats'))return;
 const create=(tag,cls)=>{const x=document.createElement(tag);if(cls)x.className=cls;return x;};
 const heading=create('div','p79-leave-visual-heading');
 heading.id='p79LeaveVisualHeading';
 heading.innerHTML='<div class="p79-leave-visual-heading-title"><span aria-hidden="true">♧</span><strong>請假管理</strong><small>請假申請・審核・紀錄查詢</small></div><div class="p79-leave-visual-heading-right">依原有權限與正式資料顯示</div>';
 main.insertBefore(heading,main.firstElementChild);
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
 quota.innerHTML='<div class="p79-leave-visual-panel-head"><strong>♙ 請假額度</strong><small>原有年假基準</small></div><label for="p79LeaveVisualPerson">檢視人員</label><select id="p79LeaveVisualPerson" aria-label="檢視年假額度"><option value="">請選擇人員</option></select><div class="p79-leave-visual-quota-grid"><div><small>可休合計</small><strong id="p79LeaveVisualEntitled">—</strong></div><div><small>已休</small><strong id="p79LeaveVisualUsed">—</strong></div><div><small>目前未休</small><strong id="p79LeaveVisualRemain">—</strong></div></div><p id="p79LeaveVisualQuotaNote">僅顯示現有年假餘額資料。</p>';
 const calendar=create('section','p79-leave-visual-panel p79-leave-visual-calendar');
 calendar.innerHTML='<div class="p79-leave-visual-panel-head"><strong>▣ 本月請假日曆</strong><small id="p79LeaveVisualMonth">—</small></div><div class="p79-leave-visual-weekdays" aria-hidden="true"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div id="p79LeaveVisualCalendarGrid" class="p79-leave-visual-calendar-grid" aria-label="實際請假紀錄月曆"></div><div class="p79-leave-visual-calendar-legend"><span><i class="annual"></i>特休</span><span><i class="personal"></i>事假</span><span><i class="sick"></i>病假</span><span><i class="other"></i>其他</span></div>';
 rail.append(quota,calendar);
 admin.insertBefore(rail,document.getElementById('adminBalancePanel')||null);
 const personSelect=document.getElementById('p79LeaveVisualPerson');
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
 function updatePeople(){
   const shown=people().filter(x=>x&&x.empId&&String(x.empId).toUpperCase()!=='ADMIN'&&permitted(x));
   const sig=shown.map(x=>x.empId+'|'+x.name).join(';');
   if(sig===personSelect.dataset.sourceSignature)return;
   const previous=personSelect.value;personSelect.dataset.sourceSignature=sig;
   personSelect.replaceChildren();
   const choose=document.createElement('option');choose.value='';choose.textContent='請選擇人員';personSelect.append(choose);
   shown.forEach(x=>{const opt=document.createElement('option');opt.value=String(x.empId);opt.textContent=String(x.name||x.empId)+'（'+x.empId+'）';personSelect.append(opt);});
   if(shown.some(x=>String(x.empId)===previous))personSelect.value=previous;
 }
 const showDays=(id,n)=>{
   document.getElementById(id).textContent=n!==null&&n!==undefined&&Number.isFinite(Number(n))?Number(n).toLocaleString('zh-TW',{maximumFractionDigits:1})+' 天':'—';
 };
 function updateQuota(){
   const e=people().find(x=>String(x.empId)===personSelect.value&&permitted(x));
   let info=null;try{if(e&&typeof leaveBalanceInfo==='function')info=leaveBalanceInfo(e);}catch(_){}
   showDays('p79LeaveVisualEntitled',info?.entitled??null);
   showDays('p79LeaveVisualUsed',info?.used??null);
   showDays('p79LeaveVisualRemain',info?.effectiveRemaining??null);
   document.getElementById('p79LeaveVisualQuotaNote').textContent=!e?'選取人員可查看原有年假額度。':info?.effectiveRemaining==null?'此人員尚無可核實的年假餘額。':'原有年假基準月份：'+String(e.leaveBalance?.asOf||'未註明');
 }
 function updateStats(rs,m){
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
     const active=!admin.classList.contains('hidden');
     document.documentElement.classList.toggle('p79-leave-reference-admin',active);
     if(!active)return;
     updatePeople();updateQuota();
     const rs=records().filter(permitted),m=month();
     updateStats(rs,m);updateCalendar(rs,m);
   });
 }
 personSelect.addEventListener('change',updateQuota);
 for(const id of ['filterMonth','filterDept','filterJob','filterStatus'])document.getElementById(id)?.addEventListener('change',refresh);
 const observer=new MutationObserver(refresh);
 observer.observe(admin,{attributes:true,attributeFilter:['class']});
 observer.observe(document.getElementById('adminLeaveBody'),{childList:true});
 window.addEventListener('pageshow',refresh);
 refresh();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

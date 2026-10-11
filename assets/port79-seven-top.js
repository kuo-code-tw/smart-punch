(function(){
'use strict';

const GLOBAL_THEME_KEY='port79_global_theme_v1';
// 所有子系統共用安全登出：返回首頁時強制回到帳號／密碼登入畫面。
const PORT79_LOGOUT_SESSION_KEYS=[
 'port79_user_session','port79_user_token','port79_home_emp_id','port79_leave_emp_id',
 'admin_session','aqc_admin_logged_in','aqc_admin_id','aqc_admin_role','aqc_admin_name',
 'aqc_admin_active_tab','port79_admin_token','port79_gc_token',
 'port79_gc_superadmin_token','port79_sso_verified','p79_workhours_permission'
];
window.p79LogoutToSevenSystemHome=function(){
 try{PORT79_LOGOUT_SESSION_KEYS.forEach(k=>sessionStorage.removeItem(k));}catch(e){}
 location.replace('../?logout=1&t='+Date.now());
};
function p79IsReturnHome(el){
 const label=String(el.textContent||'').replace(/\s+/g,'').trim();
 return /返回首頁|回首頁|登出系統/.test(label) ||
        (el.dataset?.action==='home') ||
        (el.classList?.contains('home') && /首頁/.test(label));
}
function p79NormalizeExitControls(root=document){
 root.querySelectorAll?.('a,button').forEach(el=>{
   if(!p79IsReturnHome(el))return;
   if(/返回首頁|回首頁/.test(el.textContent||'')){
     [...el.childNodes].forEach(n=>{if(n.nodeType===3)n.nodeValue=n.nodeValue.replace(/返回首頁|回首頁/g,'登出系統')});
     if(!/登出系統/.test(el.textContent||''))el.textContent='↪ 登出系統';
   }
   el.title='登出系統並重新輸入帳號及密碼';
   el.dataset.p79SystemLogout='1';
 });
}
document.addEventListener('click',e=>{
 const el=e.target?.closest?.('a,button');
 if(!el || !(el.dataset?.p79SystemLogout==='1'||p79IsReturnHome(el)))return;
 e.preventDefault();e.stopImmediatePropagation();
 window.p79LogoutToSevenSystemHome();
},true);
function p79BootLogoutControls(){
 p79NormalizeExitControls();
 new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{
   if(n.nodeType!==1)return;
   if(n.matches?.('a,button'))p79NormalizeExitControls(n.parentElement||document);
   else p79NormalizeExitControls(n);
 }))).observe(document.documentElement,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',p79BootLogoutControls,{once:true});
else p79BootLogoutControls();


/* Attendance anomaly legend: compact, aligned 3+2 grid inside its existing filter row. */
(function(){
 const words=['已整合','缺少簽到','缺少簽退','上班分鐘','下班分鐘'];
 function adjust(){
  if(currentSystem()!=='attendance')return;
  const nodes=[...document.querySelectorAll('span')];
  const header=nodes.find(x=>x.textContent?.includes('異常顏色') && x.children.length===0);
  if(!header)return;
  const host=header.parentElement;
  if(!host || host.dataset.p79AlignedLegend==='1')return;
  const tags=words.map(w=>[...host.querySelectorAll('span')].find(x=>x!==header && !x.children.length && x.textContent?.includes(w)));
  if(tags.some(x=>!x))return;
  const grid=document.createElement('div');
  grid.className='p79-anomaly-legend-grid';
  tags[0].before(grid);
  tags.forEach(t=>grid.appendChild(t));
  host.dataset.p79AlignedLegend='1';
  host.classList.add('p79-anomaly-legend-host');
  header.classList.add('p79-anomaly-legend-title');
 }
 const style=document.createElement('style');
 style.id='p79-anomaly-legend-aligned-v1';
 style.textContent=`
 .p79-anomaly-legend-host{display:flex!important;align-items:center!important;flex-wrap:nowrap!important;gap:6px!important;min-width:0!important;padding:4px 7px!important}
 .p79-anomaly-legend-title{flex:none!important;font-size:10px!important;white-space:nowrap!important}
 .p79-anomaly-legend-grid{display:grid!important;grid-template-columns:repeat(3,max-content);grid-template-rows:repeat(2,20px);gap:3px 5px;align-items:stretch;max-width:100%;min-width:0}
 .p79-anomaly-legend-grid>span{display:inline-flex!important;justify-content:center!important;align-items:center!important;box-sizing:border-box!important;width:100%!important;height:20px!important;min-height:20px!important;padding:0 5px!important;margin:0!important;font-size:10px!important;line-height:1.1!important;white-space:nowrap!important;border-radius:5px!important}
 @media(max-width:760px){.p79-anomaly-legend-host{flex-wrap:wrap!important}.p79-anomaly-legend-grid{grid-template-columns:repeat(3,max-content)}.p79-anomaly-legend-grid>span{font-size:9px!important;padding:0 3px!important}}
 `;
 document.head.appendChild(style);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',adjust,{once:true});else adjust();
 const obs=new MutationObserver(()=>{if(!document.querySelector('.p79-anomaly-legend-host'))adjust()});
 obs.observe(document.documentElement,{childList:true,subtree:true});
})();

const META={
 attendance:['🕒','考勤管理','員工打卡・考勤紀錄・即時動態'],
 workhours:['📊','加班管理','出勤統計・加班統計・月結工時'],
 leave:['📝','請假管理','請假申請・審核・特休資訊'],
 schedule:['📅','排班管理','人員班表・組別・今日出勤'],
 efficiency:['🚢','效率管理','船舶作業・效率統計・月報比對'],
 hr:['👥','人資管理','員工主檔・部門職稱・權限設定'],
 history:['🗄️','歷史資料管理','考勤・排班・船舶歷史查詢']
};
const NAV=[
 ['attendance','🕒','考勤管理','../attendance/'],['workhours','📊','加班管理','../work-hours/'],
 ['leave','📝','請假管理','../leave/'],['schedule','📅','排班管理','../schedule/'],
 ['efficiency','🚢','效率管理','../aqc-efficiency/'],['hr','👥','人資管理','../hr/'],
 ['history','🗄️','歷史資料管理','../history-data/']
];
const SYSTEMS=[['attendance','考勤管理'],['workhours','加班管理'],['leave','請假管理'],['schedule','排班管理'],['efficiency','效率管理'],['hr','人資管理'],['history','歷史資料管理']];
let statusBusy=false,statusTimer=null,lastSignature='';

function currentSystem(){
 const p=location.pathname.toLowerCase();
 if(p.includes('/work-hours/'))return 'workhours';if(p.includes('/attendance/'))return 'attendance';
 if(p.includes('/leave/'))return 'leave';if(p.includes('/schedule/'))return 'schedule';
 if(p.includes('/aqc-efficiency/'))return 'efficiency';if(p.includes('/hr/'))return 'hr';
 if(p.includes('/history-data/'))return 'history';
 const b=String(document.body?.dataset?.p79System||'').toLowerCase();return b==='work-hours'?'workhours':(META[b]?b:'attendance');
}
function roleText(){try{const s=JSON.parse(sessionStorage.getItem('port79_user_session')||sessionStorage.getItem('admin_session')||'null');const r=String(s?.adminRole||s?.role||sessionStorage.getItem('aqc_admin_role')||'').toLowerCase();return r==='superadmin'?'超級管理員':r==='admin'?'管理員':'一般員工'}catch(e){return'登入使用者'}}
function userInfo(){try{const s=JSON.parse(sessionStorage.getItem('port79_user_session')||sessionStorage.getItem('admin_session')||'null')||{};const name=String(s.name||s.empName||s.employeeName||s.empId||sessionStorage.getItem('aqc_admin_name')||'登入使用者').trim();return{name,role:roleText()}}catch(e){return{name:'登入使用者',role:roleText()}}}
function gasUrl(){try{if(typeof GAS_URL!=='undefined'&&GAS_URL)return String(GAS_URL)}catch(e){}try{if(window.GAS_URL)return String(window.GAS_URL)}catch(e){}try{for(const k of ['port79_gas_url','gasUrl','GAS_URL']){const v=sessionStorage.getItem(k)||localStorage.getItem(k);if(v&&/script\.google\.com/i.test(v))return v}}catch(e){}return''}

function normalizedTheme(v){return String(v||'').toLowerCase()==='dark'?'dark':'light'}
function savedGlobalTheme(){
 let v='';try{v=localStorage.getItem(GLOBAL_THEME_KEY)||''}catch(e){}
 if(v)return normalizedTheme(v);
 try{v=localStorage.getItem('aqc_theme')||localStorage.getItem('leave_theme')||localStorage.getItem('port79_schedule_theme')||localStorage.getItem('port79_efficiency_theme')||localStorage.getItem('port79_theme')||''}catch(e){}
 return v?normalizedTheme(v):'light';
}
function applyGlobalTheme(theme,{save=true}={}){
 theme=normalizedTheme(theme);const dark=theme==='dark';
 try{
  if(save)localStorage.setItem(GLOBAL_THEME_KEY,theme);
  // 同步舊系統各自的 key，避免頁面自己的初始化把共用主題覆蓋掉。
  ['aqc_theme','leave_theme','port79_schedule_theme','port79_efficiency_theme','port79_theme'].forEach(k=>localStorage.setItem(k,theme));
 }catch(e){}
 const h=document.documentElement;
 h.classList.toggle('dark',dark);h.setAttribute('data-theme',theme);h.style.colorScheme=theme;
 document.body?.classList?.toggle('dark',dark);
 updateThemeMenuLabel(theme);
 try{window.dispatchEvent(new CustomEvent('port79-global-theme-change',{detail:{theme}}))}catch(e){}
 return theme;
}
function toggleGlobalTheme(){return applyGlobalTheme(savedGlobalTheme()==='dark'?'light':'dark')}
function updateThemeMenuLabel(theme=savedGlobalTheme()){
 const b=document.querySelector('#p79SevenStandardMenu [data-action="global-theme"]');
 if(b)b.textContent=theme==='dark'?'☀️ 全系統顯示模式：深色（切換亮色）':'🌙 全系統顯示模式：亮色（切換深色）';
}
window.p79ApplyGlobalTheme=applyGlobalTheme;window.p79ToggleGlobalTheme=toggleGlobalTheme;
window.addEventListener('storage',e=>{if(e.key===GLOBAL_THEME_KEY&&e.newValue)applyGlobalTheme(e.newValue,{save:false})});
applyGlobalTheme(savedGlobalTheme(),{save:false});

const MENU={
 attendance:[
  ['clearDeleted','🗑️ 清空已刪除考勤'],
  ['attendance-import','考勤匯入'],['attendance-export','考勤匯出'],['attendance-compare','Excel 比對'],
  ['year','📆 年份顯示']
 ],
 workhours:[['year','📆 年份顯示']],
 leave:[['leave-edit','✎ 編輯／審核模式']],
 schedule:[['schedule-mode','📅 排班模式'],['import','📥 匯入'],['export','📤 匯出'],['reset-cloud','↻ 重設雲端排班']],
 efficiency:[['import','📥 匯入'],['compare','🔎 比對月報'],['year','📆 年份顯示']],
 hr:[['permissions','🔐 權限總覽'],['logs','🧾 登入紀錄'],['org','⚙️ 部門／職稱／單位'],['export','📥 匯出'],['year','📆 年份顯示']],
 history:[]
};
function scheduleLockMenuState(){
 if(currentSystem()!=='schedule')return null;
 try{
  if(typeof window.p79GetScheduleLockInfo==='function'){
   const x=window.p79GetScheduleLockInfo();
   if(x&&typeof x==='object')return x;
  }
 }catch(e){}
 return null;
}
function scheduleLockMenuLabel(info=scheduleLockMenuState()){
 if(!info)return '🔒 編輯鎖定：確認中…';
 const who=String(info.ownerLabel||info.ownerName||info.ownerEmpId||'').trim();
 if(info.mine)return '🔒 編輯鎖定：'+(who||userInfo().name)+'（我）';
 if(info.locked)return '🔒 編輯鎖定：'+(who||'其他人員');
 return '🔓 編輯鎖定：目前無人';
}
function refreshScheduleLockMenu(root=document){
 if(currentSystem()!=='schedule')return;
 const b=root?.querySelector?.('#p79SevenStandardMenu [data-action="schedule-lock"]')||
         root?.querySelector?.('[data-action="schedule-lock"]')||
         document.querySelector('#p79SevenStandardMenu [data-action="schedule-lock"]');
 if(!b)return;
 const info=scheduleLockMenuState();
 b.textContent=scheduleLockMenuLabel(info);
 if(info){
  b.dataset.lockState=info.mine?'mine':(info.locked?'other':'free');
  const who=String(info.ownerLabel||info.ownerName||info.ownerEmpId||'').trim();
  b.title=info.mine
   ? '目前由 '+(who||userInfo().name)+' 鎖定編輯；點擊可解除'
   : (info.locked
      ? '目前由 '+(who||'其他人員')+' 鎖定編輯'
      : '目前沒有人鎖定；點擊可取得編輯權');
 }
}
window.p79RefreshScheduleLockMenu=refreshScheduleLockMenu;

function closeMenu(){document.getElementById('p79SevenStandardMenu')?.classList.remove('open')}
function toggleMenu(e){e?.stopPropagation();refreshScheduleLockMenu();document.getElementById('p79SevenStandardMenu')?.classList.toggle('open')}

async function runAction(sys,a){closeMenu();try{
 if(a==='global-theme')return toggleGlobalTheme();
 if(a==='data-cache')return window.Port79DataCache?.openCenter?.();
 if(a==='year'){
   if(typeof window.p79ToggleYearModeFromMenu==='function')return window.p79ToggleYearModeFromMenu();
   const k='port79_year_mode';try{localStorage.setItem(k,localStorage.getItem(k)==='roc'?'gregorian':'roc')}catch(e){}location.reload();return;
 }
 if(sys==='attendance'){
  if(a==='records'){window.switchView?.('admin');return window.switchAdminTab?.('records')}
  if(a==='settings'){window.switchView?.('admin');return window.switchAdminTab?.('settings')}
  if(a==='clearDeleted')return await window.clearDeletedAttendanceGoogleSheet?.();
  if(a==='attendance-import'){window.switchView?.('admin');window.switchAdminTab?.('records');document.getElementById('attendanceExcelInput')?.click();return}
  if(a==='attendance-export'){window.switchView?.('admin');window.switchAdminTab?.('records');return window.openExportRecordsModal?.()}
  if(a==='attendance-compare'){window.switchView?.('admin');window.switchAdminTab?.('records');return window.showAttendanceImportAuditModal?.()}
  if(a==='save-cloud')return await window.syncAllDataToCloud?.();
  if(a==='read-cloud')return await window.manualCloudRefresh?.();
  if(a==='employee')return window.switchView?.('employee');
 }
 if(sys==='workhours'){
  if(a==='stats'){location.hash='stats';return window.switchAdminTab?.('stats')}
  if(a==='overtime'){location.hash='overtime';return window.switchAdminTab?.('overtime')}
  if(a==='read-cloud')return await window.manualCloudRefresh?.();
 }
 if(sys==='leave'){
  if(a==='leave-edit'){
    if(typeof window.p79ToggleUnifiedEditMode==='function')return window.p79ToggleUnifiedEditMode();
    const admin=document.getElementById('adminMode');if(admin){admin.scrollIntoView({behavior:'smooth',block:'start'});return}
  }
 }
 if(sys==='schedule'){
  if(a==='schedule-lock')return window.p79ToggleScheduleLock?.();
  if(a==='schedule-save')return await window.saveCurrentTabSchedule?.();
  if(a==='schedule-mode')return window.p79OpenScheduleModeModal?.();
  if(a==='import')return window.openScheduleImportPicker?.();
  if(a==='export')return window.exportScheduleToExcel?.();
  if(a==='reset-cloud')return window.resetToDefaultData?.();
 }
 if(sys==='efficiency'){
  if(a==='save-cloud')return await window.manualCloudSync?.();
  if(a==='import'){document.getElementById('excelImport')?.click();return}
  if(a==='compare'){document.getElementById('compareExcelInput')?.click();return}
  if(a==='export')return window.openExportDialog?.();
 }
 if(sys==='hr'){
  if(a==='permissions')return window.openPermissionOverview?.();if(a==='logs')return await window.openSessionLogs?.();
  if(a==='org')return window.openOrgSettings?.();if(a==='export')return window.exportEmployees?.();if(a==='add')return window.openEditor?.();
 }
 if(sys==='history'&&a==='history-load')return document.getElementById('loadBtn')?.click();
 }catch(e){console.error(sys+' 功能選單執行失敗',e);alert('功能執行失敗：'+(e?.message||e))}}

function buildMenu(sys){
 const menu=document.createElement('div');menu.id='p79SevenStandardMenu';menu.className='p79-seven-standard-menu';
 const account=userInfo();
 const accountTitle=document.createElement('div');accountTitle.className='menu-title';accountTitle.textContent='登入資訊';menu.appendChild(accountTitle);
 const accountInfo=document.createElement('div');accountInfo.className='p79-seven-account-info';accountInfo.textContent='👤 '+account.name+'｜'+account.role;menu.appendChild(accountInfo);
 const accountSep=document.createElement('div');accountSep.className='sep';menu.appendChild(accountSep);
 // 七大系統共用固定排序：資料管理→系統設定→權限管理→紀錄查詢→進階工具→顯示設定→登出。
 const GROUPS=[
  ['資料管理',['attendance-import','attendance-export','import','export']],
  ['系統設定',['schedule-mode','org','reset-cloud']],
  ['權限管理',['permissions','leave-edit']],
  ['紀錄查詢',['logs','attendance-compare','compare']],
  ['進階工具',['clearDeleted','data-cache']],
  ['顯示設定',['year','global-theme']],
  ['登出系統',['logout-system']]
 ];
 const items=new Map((MENU[sys]||[]).map(entry=>[entry[0],entry]));
 function addAction(a,label,cls){
   const b=document.createElement('button');
   b.type='button';b.dataset.action=a;b.textContent=label;
   if(cls)String(cls).split(/\s+/).filter(Boolean).forEach(c=>b.classList.add(c));
   if(a==='logout-system')b.classList.add('danger');
   b.addEventListener('click',()=>a==='logout-system'?window.p79LogoutToSevenSystemHome():runAction(sys,a));
   menu.appendChild(b);
 }
 GROUPS.forEach(([heading,actions])=>{
   const included=actions.filter(a=>items.has(a)||['data-cache','global-theme','logout-system'].includes(a));
   if(!included.length)return;
   const title=document.createElement('div');title.className='menu-title';title.textContent=heading;menu.appendChild(title);
   included.forEach(a=>{
     if(a==='data-cache')addAction(a,'☁️ 資料快取中心','common');
     else if(a==='global-theme')addAction(a,'🌙 全系統顯示模式','common theme');
     else if(a==='logout-system')addAction(a,'↪ 登出系統','danger');
     else {const [,label,cls]=items.get(a);addAction(a,label,cls)}
   });
 });
 updateThemeMenuLabel();
 return menu;
}
function ensureStandardMenu(sys){
 const wrap=document.getElementById('p79SevenMenuWrap');
 if(!wrap)return false;
 const old=document.getElementById('p79SevenStandardMenu');
 if(old)old.remove();
 wrap.appendChild(buildMenu(sys));
 if(sys==='schedule')refreshScheduleLockMenu();
 const btn=document.getElementById('p79SevenMenuButton');
 if(btn&&!btn.dataset.p79StandardMenuBound){
   btn.dataset.p79StandardMenuBound='1';
   btn.addEventListener('click',toggleMenu);
 }
 return true;
}

function applyAttendanceAuditCompactLayout(){
 if(currentSystem()!=='attendance')return;
 if(document.getElementById('p79-attendance-audit-compact-v20261007'))return;
 const st=document.createElement('style');
 st.id='p79-attendance-audit-compact-v20261007';
 st.textContent=`
 #attendanceImportAuditModal{font-size:11px!important}
 #attendanceImportAuditModal>div{max-width:min(1420px,calc(100vw - 24px))!important}
 #attendanceImportAuditModal h3{font-size:14px!important;line-height:1.25!important}
 #attendanceImportAuditSummary{font-size:10px!important}
 #attendanceImportAuditModal table{min-width:1120px!important;font-size:10.5px!important;table-layout:fixed!important}
 #attendanceImportAuditModal th,#attendanceImportAuditModal td{padding:5px 6px!important;line-height:1.25!important;vertical-align:middle!important}
 #attendanceImportAuditModal th:nth-child(1),#attendanceImportAuditModal td:nth-child(1){width:34px!important}
 #attendanceImportAuditModal th:nth-child(2),#attendanceImportAuditModal td:nth-child(2){width:70px!important}
 #attendanceImportAuditModal th:nth-child(3),#attendanceImportAuditModal td:nth-child(3){width:92px!important}
 #attendanceImportAuditModal th:nth-child(4),#attendanceImportAuditModal td:nth-child(4){width:82px!important}
 #attendanceImportAuditModal th:nth-child(5),#attendanceImportAuditModal td:nth-child(5),
 #attendanceImportAuditModal th:nth-child(6),#attendanceImportAuditModal td:nth-child(6),
 #attendanceImportAuditModal th:nth-child(7),#attendanceImportAuditModal td:nth-child(7),
 #attendanceImportAuditModal th:nth-child(8),#attendanceImportAuditModal td:nth-child(8){width:145px!important}
 #attendanceImportAuditModal th:nth-child(9),#attendanceImportAuditModal td:nth-child(9){width:82px!important}
 #attendanceImportAuditModal th:nth-child(10),#attendanceImportAuditModal td:nth-child(10){width:46px!important}
 #attendanceImportAuditModal th:nth-child(11),#attendanceImportAuditModal td:nth-child(11){width:250px!important;white-space:normal!important;word-break:break-word!important}
 #attendanceImportAuditModal th:nth-child(12),#attendanceImportAuditModal td:nth-child(12){width:128px!important}
 #attendanceImportAuditModal td:nth-child(2),
 #attendanceImportAuditModal td:nth-child(3),
 #attendanceImportAuditModal td:nth-child(4),
 #attendanceImportAuditModal td:nth-child(5),
 #attendanceImportAuditModal td:nth-child(6),
 #attendanceImportAuditModal td:nth-child(7),
 #attendanceImportAuditModal td:nth-child(8),
 #attendanceImportAuditModal td:nth-child(9),
 #attendanceImportAuditModal td:nth-child(10){white-space:nowrap!important}
 #attendanceImportAuditModal button{font-size:10px!important;line-height:1.15!important;padding:5px 8px!important;border-radius:8px!important}
 #attendanceImportAuditModal td:nth-child(12) .flex{min-width:0!important;gap:4px!important}
 #attendanceImportAuditModal td:nth-child(12) button{min-width:0!important;width:auto!important;white-space:nowrap!important}
 #attendanceImportAuditModal .sticky.top-0{padding:9px 12px!important}
 #attendanceImportAuditModal .sticky.bottom-0{padding:8px 10px!important}
 @media(max-width:900px){
   #attendanceImportAuditModal table{min-width:1080px!important}
 }
 `;
 document.head.appendChild(st);
}

function applyAttendanceMenuLayout(){
 if(currentSystem()!=='attendance')return;
 ['btnAttendanceImport','btnAttendanceExport'].forEach(id=>{
   const el=document.getElementById(id);
   if(el)el.style.setProperty('display','none','important');
 });
}
// 打卡模式只保留原有員工打卡內容，不載入七大系統管理導覽。
function isAttendancePunchOnly(){
 if(currentSystem()!=='attendance')return false;
 try{
  const session=JSON.parse(sessionStorage.getItem('port79_user_session')||'null');
  return session?.punchOnly===true;
 }catch(e){return false}
}
function syncPunchOnlyNavigation(){
 if(currentSystem()!=='attendance')return;
 const punch=isAttendancePunchOnly();
 document.documentElement.classList.toggle('p79-punch-only',punch);
 const bar=document.getElementById('p79SevenTop');
 if(bar)bar.hidden=punch;
}
function p79NormalizeLegacyTop(sys){
 const m=META[sys]||META.attendance;
 // 以單一共用頂部為準；保留舊頁面的事件與資料節點，不刪除業務區塊。
 const selectors=['#p79LeaveTop','#p79HrShellV103','#p79UnifiedShell','#p79UnifiedShellV102','#p79UnifiedShellV103','#p79EfficiencyTop','#p79ScheduleTop'];
 selectors.forEach(sel=>{const el=document.querySelector(sel);if(el){el.style.setProperty('display','none','important');el.setAttribute('aria-hidden','true')}});
 document.body?.setAttribute('data-p79-system',sys);
 document.title=m[1]+'｜79號碼頭雲端智慧系統';
}
function mount(){
 const sys=currentSystem(),m=META[sys]||META.attendance;
 p79NormalizeLegacyTop(sys);
 if(isAttendancePunchOnly()){syncPunchOnlyNavigation();return}
 applyAttendanceMenuLayout();
 const existing=document.getElementById('p79SevenTop');
 if(existing){
   ensureStandardMenu(sys);
   applyGlobalTheme(savedGlobalTheme(),{save:false});
   ensureCacheButtonInLegacyMenus();
   return;
 }
 const root=document.createElement('div');root.id='p79SevenTop';
 root.innerHTML=`<div class="top-row"><div class="brand"><div class="logo">${m[0]}</div><div><div class="brand-name">${m[1]}</div><div class="brand-sub">79號碼頭雲端智慧系統｜${m[2]}</div></div></div><nav id="p79SevenNav">${NAV.map(n=>`<a class="${n[0]===sys?'active':''}" href="${n[3]}">${n[1]} ${n[2]}</a>`).join('')}</nav><div class="action"><div id="p79SevenMenuWrap"><button id="p79SevenMenuButton" type="button">☰ 功能選單</button></div></div></div><div id="p79SevenStatus"><span class="cloud-title">☁️ 雲端</span>${SYSTEMS.map(([k,l])=>`<span class="sys" data-sys="${k}" data-state="idle"><b>${l}</b><span>● 待命</span></span>`).join('')}</div>`;
 document.body.insertBefore(root,document.body.firstChild);
 ensureStandardMenu(sys);
 document.addEventListener('click',e=>{if(!e.target?.closest?.('#p79SevenMenuWrap'))closeMenu()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});
 applyGlobalTheme(savedGlobalTheme(),{save:false});
}

function ensureCacheButtonInLegacyMenus(){
 const selectors=['#p79SystemMenu','#p79HrSystemMenu','#p79UnifiedMenu','#attendanceDrawer','#p79UnifiedShell .p79u-actions','#p79HrShellV103 .p79v103-menu'];
 selectors.forEach(sel=>{
   const menu=document.querySelector(sel);
   if(!menu)return;
   if(menu.querySelector('[data-p79-cache-center-legacy="1"]'))return;
   const btn=document.createElement('button');
   btn.type='button';
   btn.dataset.p79CacheCenterLegacy='1';
   btn.className='p79-cache-center-legacy-btn';
   btn.textContent='☁️ 資料快取中心';
   btn.addEventListener('click',()=>{
     try{window.Port79DataCache?.openCenter?.()}catch(e){console.error(e)}
   });
   const buttons=[...menu.querySelectorAll('button')];
   const theme=buttons.find(b=>/全系統顯示模式|深淺色|亮色|暗色/.test(String(b.textContent||'')));
   if(theme)menu.insertBefore(btn,theme); else menu.appendChild(btn);
 });
}

function render(data){const systems={...(data?.systems||{})};
if(!systems.workhours){
  systems.workhours={active:[],passive:true,lastCompleted:null};
}const signature=SYSTEMS.map(([k])=>{const s=systems[k]||{},a=Array.isArray(s.active)?s.active:[],j=a[0]||{},last=s.lastCompleted||{};return[k,a.length,j.operation,j.action,j.label,last.ok,last.action,Math.floor(Number(last.ageMs||0)/10000)].join(':')}).join('|');if(signature===lastSignature)return;lastSignature=signature;SYSTEMS.forEach(([k])=>{const el=document.querySelector(`#p79SevenStatus [data-sys="${k}"]`);if(!el)return;const span=el.querySelector('span'),s=systems[k]||{},a=Array.isArray(s.active)?s.active:[];let state='idle',txt=(k==='workhours'&&s.passive?'● 被動':'● 待命');if(a.length){const j=a.find(x=>x.operation==='write')||a.find(x=>x.operation==='read')||a[0]||{};state='busy';txt=(j.operation==='write'?'✍️ ':'↙ ')+(j.operationLabel||'讀取')+'中｜'+(j.label||j.action||'雲端資料')}else if(s.lastCompleted&&Number(s.lastCompleted.ageMs||0)<15000){state=s.lastCompleted.ok===false?'error':'done';txt=(state==='done'?'✓ ':'! ')+(s.lastCompleted.operationLabel||'讀取')+'完成'}el.dataset.state=state;if(span.textContent!==txt)span.textContent=txt})}
async function poll(){if(statusBusy||document.visibilityState==='hidden')return;const url=gasUrl();if(!url)return;statusBusy=true;let ctrl,to;try{ctrl=new AbortController();to=setTimeout(()=>ctrl.abort(),4500);const r=await fetch(url+(url.includes('?')?'&':'?')+'action=getCloudActivity&_='+Date.now(),{cache:'no-store',signal:ctrl.signal});const d=await r.json();if(d?.ok)render(d)}catch(e){}finally{if(to)clearTimeout(to);statusBusy=false}}
function start(){mount();syncPunchOnlyNavigation();if(currentSystem()==='attendance')setInterval(syncPunchOnlyNavigation,1500);applyAttendanceMenuLayout();applyAttendanceAuditCompactLayout();setTimeout(applyAttendanceMenuLayout,300);setTimeout(applyAttendanceMenuLayout,1500);setTimeout(applyAttendanceAuditCompactLayout,300);setTimeout(applyAttendanceAuditCompactLayout,1500);ensureCacheButtonInLegacyMenus();setTimeout(ensureCacheButtonInLegacyMenus,300);setTimeout(ensureCacheButtonInLegacyMenus,1500);poll();statusTimer=setInterval(()=>{if(document.visibilityState==='visible')poll()},15000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,20),{once:true});else setTimeout(start,20);
})();

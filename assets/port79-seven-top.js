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
 const words=['重複已整合','缺上班卡','缺下班卡','上班核對','下班核對'];
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
 efficiency:['🚢','船舶管理','船舶作業・效率統計・月報比對'],
 hr:['👥','人資管理','員工主檔・部門職稱・權限設定'],
 history:['🗄️','歷史資料管理','考勤・排班・船舶歷史查詢']
};
const NAV=[
 ['attendance','🕒','考勤管理','../attendance/'],['leave','📝','請假管理','../leave/'],
 ['workhours','📊','加班管理','../work-hours/'],['schedule','📅','排班管理','../schedule/'],
 ['efficiency','🚢','船舶管理','../aqc-efficiency/'],['hr','👥','人資管理','../hr/'],
 ['history','🗄️','歷史資料管理','../history-data/']
];
const SYSTEMS=[['attendance','考勤管理'],['workhours','加班管理'],['leave','請假管理'],['schedule','排班管理'],['efficiency','船舶管理'],['hr','人資管理'],['history','歷史資料管理']];
let statusBusy=false,statusTimer=null,lastSignature='';

function currentSystem(){
 const p=location.pathname.toLowerCase();
 if(p.includes('/work-hours/'))return 'workhours';if(p.includes('/attendance/'))return 'attendance';
 if(p.includes('/leave/'))return 'leave';if(p.includes('/schedule/'))return 'schedule';
 if(p.includes('/aqc-efficiency/'))return 'efficiency';if(p.includes('/hr/'))return 'hr';
 if(p.includes('/history-data/'))return 'history';
 const b=String(document.body?.dataset?.p79System||'').toLowerCase();return b==='work-hours'?'workhours':(META[b]?b:'attendance');
}
function navigationSession(){try{return JSON.parse(sessionStorage.getItem('port79_user_session')||sessionStorage.getItem('admin_session')||'null')}catch(e){return null}}
function systemLevel(key,session=navigationSession()){
 if(!session)return 'none';
 const role=String(session.adminRole||session.role||'employee').toLowerCase();
 if(role==='superadmin'&&!session.punchOnly)return 'manage';
 if(role==='employee'||session.punchOnly){if(!['attendance','leave'].includes(key))return 'none';return session.systemPermissions?.[key]==='none'?'none':'view';}
 const raw=session.systemPermissions?.[key];
 if(raw===undefined)return key==='attendance'||(role==='employee'&&key==='leave')?'view':'none';
 return ['view','manage'].includes(String(raw).toLowerCase())?String(raw).toLowerCase():'none';
}
function actionAllowed(sys,action){
 if(['global-theme','logout-system'].includes(action))return true;
 const level=systemLevel(sys);if(level==='none')return false;
 const manage=['add','import','attendance-import','balance-import','leave-edit','schedule-continue','schedule-lock','schedule-takeover','schedule-mode','reset-cloud','org','permissions','overtime-options','settings','clearDeleted'];
 if(action==='schedule-takeover')return roleText()==='超級管理員';
 return !manage.includes(action)||level==='manage';
}
let navigationSignature='';
function syncPermissionNavigation(){
 const allowed=NAV.filter(n=>systemLevel(n[0])!=='none');
 const signature=JSON.stringify([navigationSession(),currentSystem()]);if(signature===navigationSignature)return;
 navigationSignature=signature;
 const nav=document.getElementById('p79SevenNav');if(nav)nav.innerHTML=allowed.map(n=>`<a class="${n[0]===currentSystem()?'active':''}" href="${n[3]}">${n[1]} ${n[2]}</a>`).join('')||'<span>目前沒有可開啟的管理系統，請聯絡管理員確認權限。</span>';
 document.querySelectorAll('#p79SevenStatus [data-sys]').forEach(el=>{if(systemLevel(el.dataset.sys)==='none')el.style.setProperty('display','none','important');else el.style.removeProperty('display');});
 ensureStandardMenu(currentSystem());
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
  ['attendance-import','匯入考勤'],['attendance-export','匯出考勤'],['attendance-compare','考勤比對'],
  ['settings','📍 定位地點設定（多地點）'],
  ['year','📆 年份顯示']
 ],
 workhours:[['stats','📅 出勤天數統計'],['overtime-summary','📊 加班時數統計表'],['overtime-application','📄 加班申報表'],['project-bonus','💰 專案獎金'],['overtime-reload','↻ 重新讀取加班'],['overtime-export','📤 匯出加班'],['overtime-print','🖨️ 列印比對'],['overtime-options','⚙️ 加班選項管理'],['overtime-policy','📖 勞基法規則說明'],['year','📆 年份顯示']],
 leave:[['leave-edit','✎ 編輯／審核模式'],['balance-import','📥 匯入請假可休天數'],['balance-export','📤 匯出請假可休天數']],
 schedule:[['schedule-continue','📅 延續到下個月'],['schedule-lock','🔒 排班計畫鎖定'],['schedule-takeover','🚨 踢除管理員並接管編輯權'],['schedule-mode','📅 排班模式'],['import','📥 匯入排班'],['export','📤 匯出排班'],['reset-cloud','↻ 重設雲端排班']],
 efficiency:[['import','📥 匯入船舶資料'],['monthly-export','📥 匯出船舶月作業量表'],['compare','🔎 比對月報'],['year','📆 年份顯示']],
 hr:[['import','📥 匯入人資名冊'],['add','＋ 新增人員'],['overtime-options','⚙️ 加班選項管理'],['permissions','🔐 權限總覽'],['logs','🧾 登入紀錄'],['org','⚙️ 部門／職稱／單位'],['export','📥 匯出人資名冊'],['year','📆 年份顯示']],
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

const WORKFLOWS={
 attendance:{title:'考勤系統',steps:[['查詢考勤','選擇月份、日期與人員，查看上下班紀錄。'],['找缺卡','使用缺上班卡／缺下班卡篩選，比對班表與跨日班次。'],['修改與補卡','有管理權限時選擇紀錄，修改時間或補卡；按儲存並確認成功。'],['匯入與匯出','從功能選單選擇匯入、匯出；匯入前先檢查人員及日期。']]},
 workhours:{title:'加班管理',steps:[['選擇月份與人員','先選月份，再依姓名、職稱或單位篩選。'],['申報加班','選擇日期、類型、人員及時段，確認後儲存；收到成功確認後視窗自動關閉。'],['核對已申報','開啟已申報／撤銷紀錄，依狀態與假別查詢；待核對不代表已撤銷。'],['撤銷與列印','確認休假超額後再勾選撤銷；以雲端讀回結果為準。需要報表時從功能選單匯出。']]},
 schedule:{title:'排班系統',steps:[['選擇月份','選月份、單位與組別，確認人員名單。離職人員不列操作名單，歷史資料保留。'],['調任支援','在人員名冊修改單位或組別。系統先取得編輯權，保留既有每日班別；他人持鎖時不得修改。'],['修改班別','選擇早／中／晚／例／休／國／颱等班別；颱為颱風假，不扣例休國。連結請假或代班時先處理連動。'],['儲存與核對','確認雲端儲存成功。人工班別保留；無卡待核表示需核對考勤，不能視為已出勤。']]},
 leave:{title:'請假系統',steps:[['填寫申請','選擇人員、假別與起迄時間，核對天數。'],['送出申請','確認內容後送出，等待核准。'],['審核與安排','管理人員核對申請並審核；需要代班時逐日安排人員及時段。'],['變更或取消','從原申請處理修改／取消，確認排班及代班連動結果。']]},
 efficiency:{title:'船舶效率系統',steps:[['選擇資料','依月份、船舶或人員查詢作業。'],['維護作業','有管理權限時填寫船名、作業時間與裝卸櫃數。'],['儲存核對','確認儲存成功，再核對船名、人員與櫃數合計。'],['匯出報表','從功能選單選擇匯出或每月作業量表，確認月份及範圍。']]},
 hr:{title:'人資系統',steps:[['查詢人員','以姓名、工號、部門與在職狀態查詢。'],['維護主檔','有權限時新增／修改到職、報到、部門與職稱，確認後儲存。'],['離職與復職','使用辦理離職／恢復在職，核對日期；歷史紀錄會保留。'],['設定權限','依工作需要設定各系統查看或管理權限，儲存後確認生效。']]},
 history:{title:'歷史資料管理',steps:[['選擇期間','選擇月份及要查看的資料類型。'],['讀取歷史','按讀取並等待完成；讀取失敗時依提示重新讀取。'],['立即備份','需要保存目前月份時使用立即備份，等待各資料類型的完成結果。'],['查看與匯出','核對班表、考勤或船舶內容，再選擇匯出；備份不代表刪除現有資料。']]}
};
function openWorkflow(sys){
 const prior=document.getElementById('p79WorkflowDialog');if(prior){prior.focus();return;}
 const guide=WORKFLOWS[sys];if(!guide)return;
 const dialog=document.createElement('dialog');dialog.id='p79WorkflowDialog';dialog.setAttribute('aria-labelledby','p79WorkflowTitle');
 dialog.innerHTML=`<style>#p79WorkflowDialog{width:min(660px,calc(100vw - 28px));max-height:85dvh;overflow:auto;padding:24px;border:1px solid #cbd5e1;border-radius:16px;background:#fff;color:#17354b;font:15px/1.7 'Microsoft JhengHei',sans-serif}#p79WorkflowDialog::backdrop{background:#0f172a88}#p79WorkflowDialog h2{margin:0;font-size:21px}#p79WorkflowDialog ol{padding-left:26px}#p79WorkflowDialog li{padding:9px 0}#p79WorkflowDialog p{margin:3px 0;color:#526677}#p79WorkflowDialog button{padding:8px 22px;border:0;border-radius:8px;background:#126487;color:white;cursor:pointer}#p79WorkflowDialog footer{text-align:right}</style><h2 id="p79WorkflowTitle">${esc(guide.title)}｜操作流程</h2><ol>${guide.steps.map(([title,text])=>`<li><b>${esc(title)}</b><p>${esc(text)}</p></li>`).join('')}</ol><p>可使用的功能依帳號權限顯示；儲存未確認或失敗時，請保留內容並核對狀態。</p><footer><button type="button" autofocus>關閉</button></footer>`;
 dialog.querySelector('button').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();document.body.appendChild(dialog);dialog.showModal();
}
function closeMenu(){document.getElementById('p79SevenStandardMenu')?.classList.remove('open')}
function toggleMenu(e){e?.stopPropagation();refreshScheduleLockMenu();document.getElementById('p79SevenStandardMenu')?.classList.toggle('open')}

async function runAction(sys,a){closeMenu();try{
 if(!actionAllowed(sys,a))return alert('沒有此功能的操作權限，請聯絡管理員確認授權');
 if(a==='workflow')return openWorkflow(sys);
 if(a==='overtime-options')return await window.P79Overtime?.openRules?.();
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
  if(a==='overtime-reload')return await window.p79ReloadOvertimeMonth?.(document.getElementById('p79ReloadOvertimeButton'));
  if(a==='overtime-export')return await window.p79ExportOvertimeComparison?.(false);
  if(a==='overtime-summary')return window.P79OvertimeMonthlyMatrix?.open();
  if(a==='overtime-application')return window.P79OvertimeApplication?.open();
  if(a==='project-bonus')return window.P79ProjectBonus?.open();
  if(a==='overtime-print')return await window.p79ExportOvertimeComparison?.(true);
  if(a==='overtime-policy')return window.openOvertimePolicyModal?.();
  if(a==='stats'){document.body.dataset.p79WorkhoursUserOpened='1';location.hash='stats';return window.switchAdminTab?.('stats')}
  if(a==='overtime'){location.hash='overtime';return window.switchAdminTab?.('overtime')}
  if(a==='read-cloud')return await window.manualCloudRefresh?.();
 }
 if(sys==='leave'){
  if(a==='balance-import')return window.openLeaveBalanceImport?.();
  if(a==='balance-export')return window.exportLeaveBalanceXlsx?.();
  if(a==='leave-edit'){
    if(typeof window.p79ToggleUnifiedEditMode==='function')return window.p79ToggleUnifiedEditMode();
    const admin=document.getElementById('adminMode');if(admin){admin.scrollIntoView({behavior:'smooth',block:'start'});return}
  }
 }
 if(sys==='schedule'){
  if(a==='schedule-lock')return window.p79ToggleScheduleLock?.();
  if(a==='schedule-takeover')return window.p79ForceTakeoverScheduleEditLock?.();
  if(a==='schedule-save')return await window.saveCurrentTabSchedule?.();
  if(a==='schedule-continue')return window.P79ScheduleContinuation?.open();
  if(a==='schedule-mode')return window.p79OpenScheduleModeModal?.();
  if(a==='import')return window.openScheduleImportPicker?.();
  if(a==='export')return window.exportScheduleToExcel?.();
  if(a==='reset-cloud')return window.resetToDefaultData?.();
 }
 if(sys==='efficiency'){
  if(a==='save-cloud')return await window.manualCloudSync?.();
  if(a==='import'){document.getElementById('excelImport')?.click();return}
  if(a==='compare'){document.getElementById('compareExcelInput')?.click();return}
  if(a==='monthly-export')return window.openVesselMonthlyExportDialog?.();
  if(a==='export')return window.openExportDialog?.();
 }
 if(sys==='hr'){
  if(a==='import')return window.P79HrImport?.open();
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
  ['資料管理',['overtime-reload','overtime-export','add','attendance-import','attendance-export','balance-import','balance-export','schedule-continue','import','export','monthly-export']],
  ['系統設定',['overtime-options','settings','schedule-lock','schedule-takeover','schedule-mode','org','reset-cloud']],
  ['權限管理',['permissions','leave-edit']],
  ['紀錄查詢',['stats','overtime-summary','overtime-application','project-bonus','overtime-print','overtime-policy','logs','attendance-compare','compare']],
  ['操作說明',['workflow']],
  ['進階工具',['clearDeleted','data-cache']],
  ['顯示設定',['year','global-theme']],
  ['登出系統',['logout-system']]
 ];
 const items=new Map((MENU[sys]||[]).map(entry=>[entry[0],entry]));
 function addAction(a,label,cls){
   const b=document.createElement('button');
   b.type='button';b.dataset.action=a;b.textContent=label;
   if(sys==='workhours'&&a==='overtime-reload')b.id='p79ReloadOvertimeButton';
   if(cls)String(cls).split(/\s+/).filter(Boolean).forEach(c=>b.classList.add(c));
   if(a==='logout-system')b.classList.add('danger');
   b.addEventListener('click',()=>a==='logout-system'?window.p79LogoutToSevenSystemHome():runAction(sys,a));
   menu.appendChild(b);
 }
 GROUPS.forEach(([heading,actions])=>{
   const included=actions.filter(a=>actionAllowed(sys,a)&&(a!=='schedule-takeover'||roleText()==='超級管理員')&&(items.has(a)||['workflow','data-cache','global-theme','logout-system'].includes(a)));
   if(!included.length)return;
   const title=document.createElement('div');title.className='menu-title';title.textContent=heading;menu.appendChild(title);
   included.forEach(a=>{
     if(a==='workflow')addAction(a,'📖 操作流程','common');
     else if(a==='data-cache')addAction(a,'☁️ 資料快取中心','common');
     else if(a==='global-theme')addAction(a,'🌙 全系統顯示模式','common theme');
     else if(a==='logout-system')addAction(a,'↪ 登出系統','danger');
     else {const [,label,cls]=items.get(a);addAction(a,sys==='schedule'&&a==='schedule-lock'?scheduleLockMenuLabel():label,cls)}
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
  const session=navigationSession();
  const mode=String(sessionStorage.getItem('port79_entry_mode')||session?.entryMode||'').toLowerCase();
  if(mode==='punch'||session?.punchOnly===true)return true;
  const role=String(session?.adminRole||session?.role||'').toLowerCase();
  return !session||!['admin','superadmin'].includes(role);
 }catch(e){return true}
}
function syncPunchOnlyNavigation(){
 if(currentSystem()!=='attendance')return;
 const punch=isAttendancePunchOnly();
 document.documentElement.classList.toggle('p79-punch-only',punch);
 document.documentElement.classList.toggle('p79-attendance-management-chrome',!punch);
 const bar=document.getElementById('p79SevenTop');
 if(bar){bar.hidden=punch;bar.setAttribute('aria-hidden',String(punch));if(punch)bar.style.setProperty('display','none','important');else bar.style.removeProperty('display');}
 else if(!punch)mount();
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
 root.innerHTML=`<div class="top-row"><div class="brand"><div class="logo">${m[0]}</div><div><div class="brand-name">${m[1]}</div><div class="brand-sub">79號碼頭雲端智慧系統｜${m[2]}</div></div></div><nav id="p79SevenNav">${NAV.filter(n=>systemLevel(n[0])!=='none').map(n=>`<a class="${n[0]===sys?'active':''}" href="${n[3]}">${n[1]} ${n[2]}</a>`).join('')}</nav><div class="action"><div id="p79SevenMenuWrap"><button id="p79SevenMenuButton" type="button">☰ 功能選單</button></div></div></div><div id="p79SevenStatus"><span class="cloud-title">☁️ 雲端</span>${SYSTEMS.map(([k,l])=>`<span class="sys" data-sys="${k}" data-state="idle"><span class="p79-sys-icon" aria-hidden="true">${META[k]?.[0]||'☁️'}</span><b>${l}</b><span class="p79-sys-state">● 待命</span></span>`).join('')}</div>`;
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

function computerSyncModel(status={}){
 const state=status.state||'idle',colors={done:'#86efac',busy:'#93c5fd',permission:'#fdba74',error:'#fca5a5',idle:'#cbd5e1'},dots={done:'●',busy:'●',permission:'●',error:'●',idle:'●'};
 const saved=status.savedAt?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(status.savedAt)):'';
 const label=(dots[state]||dots.idle)+' '+(status.label||'檢查中')+(state==='done'&&saved?' '+saved:'');
 const detail=[status.folder?'資料夾：'+status.folder:'',status.savedAt?'最近成功保存：'+new Date(status.savedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'',status.error||'','點擊開啟資料快取中心'].filter(Boolean).join('｜');
 return {state,label,color:colors[state]||colors.idle,detail};
}
let computerSyncBusy=false;
async function refreshComputerSync(){
 const host=document.getElementById('p79SevenStatus');if(!host||document.visibilityState==='hidden'||isAttendancePunchOnly()||computerSyncBusy)return;
 let button=document.getElementById('p79ComputerSync');
 if(!button){
  button=document.createElement('button');button.id='p79ComputerSync';button.type='button';button.className='sys';
  button.style.cssText='font:inherit;cursor:pointer;color:inherit';
  const icon=document.createElement('span');icon.className='p79-sys-icon';icon.textContent='💻';icon.setAttribute('aria-hidden','true');
  const name=document.createElement('b');name.textContent='電腦';const text=document.createElement('span');text.className='p79-sys-state';text.textContent='⚪ 檢查中';text.setAttribute('aria-live','polite');button.appendChild(icon);button.appendChild(name);button.appendChild(text);
  button.addEventListener('click',()=>window.Port79DataCache?.openCenter?.());host.insertBefore(button,host.querySelector('[data-sys]'));
 }
 computerSyncBusy=true;
 try{
  const api=window.Port79DataCache;
  const status=api?.getFolderSyncStatus?await api.getFolderSyncStatus():{state:'idle',label:'待載入資料夾狀態'};
  const model=computerSyncModel(status),text=button.querySelector('.p79-sys-state');
  button.dataset.state=model.state;button.title=model.detail;button.setAttribute('aria-label','電腦資料夾：'+model.label+'；'+model.detail);
  if(text.textContent!==model.label)text.textContent=model.label;text.style.color=model.color;
 }catch(_){const text=button.querySelector('.p79-sys-state');text.textContent='🔴 狀態讀取失敗';text.style.color='#fca5a5';button.dataset.state='error';}
 finally{computerSyncBusy=false;}
}
function render(data){
 const systems={...(data?.systems||{})};
 if(!systems.workhours)systems.workhours={active:[],passive:true};
 const colors={idle:'#cbd5e1',busy:'#93c5fd',done:'#86efac',error:'#fca5a5'};
 SYSTEMS.forEach(([key,name])=>{
  const el=document.querySelector(`#p79SevenStatus [data-sys="${key}"]`);if(!el)return;
  const info=systems[key]||{},jobs=Array.isArray(info.active)?info.active:[],last=info.lastCompleted;
  let state='idle',label=info.passive?'被動待命':'待命',details=[];
  const describe=j=>window.P79Messages?.operation(j.label||j.action)||j.label||j.action||'雲端資料';
  if(jobs.length){state='busy';label=jobs.some(j=>j.operation==='write')?'寫入中':'讀取中';details=jobs.map(j=>(j.operation==='write'?'寫入：':'讀取：')+describe(j));}
  else if(last){
   if(Number(last.ageMs||0)<15000){state=last.ok===false?'error':'done';label=last.ok===false?'工作失敗':'工作完成';}
   details.push('最近工作：'+describe(last)+'（'+(last.ok===false?'失敗':'完成')+'）');
   if(Number.isFinite(Number(last.ageMs)))details.push('最近完成時間：'+new Date(Date.now()-Number(last.ageMs)).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}));
   if(last.error||last.message)details.push(String(last.error||last.message));
  }else details.push(info.passive?'依其他系統資料更新，目前無主動工作':'目前沒有進行中的工作');
  const span=el.querySelector('.p79-sys-state');el.dataset.state=state;span.textContent='● '+label;span.style.color=colors[state];
  el.title=name+'｜'+label+'\n'+details.join('\n');el.tabIndex=0;el.setAttribute('aria-label',el.title);
 });
}
async function poll(){if(isAttendancePunchOnly()||statusBusy||document.visibilityState==='hidden')return;const url=gasUrl();if(!url)return;statusBusy=true;let ctrl,to;try{ctrl=new AbortController();to=setTimeout(()=>ctrl.abort(),4500);const r=await fetch(url+(url.includes('?')?'&':'?')+'action=getCloudActivity&_='+Date.now(),{cache:'no-store',signal:ctrl.signal});const d=await r.json();if(d?.ok)render(d)}catch(e){}finally{if(to)clearTimeout(to);statusBusy=false}}
function start(){mount();refreshComputerSync();setInterval(refreshComputerSync,60000);window.addEventListener?.('p79-folder-sync-changed',refreshComputerSync);window.addEventListener?.('focus',refreshComputerSync);syncPermissionNavigation();setInterval(syncPermissionNavigation,1000);syncPunchOnlyNavigation();if(currentSystem()==='attendance')setInterval(syncPunchOnlyNavigation,1500);applyAttendanceMenuLayout();applyAttendanceAuditCompactLayout();setTimeout(applyAttendanceMenuLayout,300);setTimeout(applyAttendanceMenuLayout,1500);setTimeout(applyAttendanceAuditCompactLayout,300);setTimeout(applyAttendanceAuditCompactLayout,1500);ensureCacheButtonInLegacyMenus();setTimeout(ensureCacheButtonInLegacyMenus,300);setTimeout(ensureCacheButtonInLegacyMenus,1500);poll();statusTimer=setInterval(()=>{if(document.visibilityState==='visible')poll()},15000)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,20),{once:true});else setTimeout(start,20);
})();



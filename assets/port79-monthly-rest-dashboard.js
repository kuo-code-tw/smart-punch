/* Monthly unused-leave overtime: presentation-only dashboard.
 * Sources of truth remain the existing monthly-rest controller and verified cloud data.
 * No API calls, cloud writes, synthetic attendance, or new approval logic here. */
(function(global, document){
'use strict';
if(global.P79MonthlyRestDashboard)return;
const $=(root,sel)=>root.querySelector(sel);
const $$=(root,sel)=>Array.from(root.querySelectorAll(sel));
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;' ,'"':'&quot;',"'":'&#39;'}[ch]));
const text=(root,sel)=>$(root,sel)?.textContent?.trim()||'';
const norm=value=>String(value||'').trim().toLowerCase();
const hasDataRow=tr=>tr&&tr.hasAttribute('data-row');
function periodLabel(value){
 const raw=String(value||'').trim();
 const match=raw.match(/^(.*?)(\d{2})-(\d{2})$/);
 return match?match[1]+' '+match[2]+':00 – '+match[3]+':00':raw||'時段待核';
}
function sourceRows(el){
 const ready=$$(el,'#mrRows tr[data-row]').map(tr=>{
  const td=tr.cells,pick=$(tr,'.pick');
  return {kind:'ready',id:tr.dataset.row,date:$(tr,'.date')?.value||'',name:$(tr,'.person')?.firstChild?.textContent?.trim()||'',
   category:$(tr,'.category')?.value||'',period:$(tr,'.rule')?.selectedOptions?.[0]?.textContent||'',hours:td[5]?.textContent?.trim()||'—',
   status:td[6]?.textContent?.trim()||'',checked:!!pick?.checked,disabled:!!pick?.disabled,
   audit:$(tr,'[data-audit]')?.dataset.audit||''};
 }).filter(r=>r.date);
 const planned=$$(el,'#mrPlannedRows tr').filter(tr=>$(tr,'.plan-pick')).map(tr=>{
  const td=tr.cells,pick=$(tr,'.plan-pick');
  return {kind:'plan',id:pick.dataset.planIndex,date:td[1]?.textContent?.trim()||'',name:td[3]?.textContent?.trim()||'',
    category:td[4]?.textContent?.trim()||'',period:td[5]?.textContent?.trim()||'',hours:'—',
    status:td[6]?.textContent?.trim()||'預排待核',checked:!!pick.checked,disabled:!!pick.disabled};
 });
 const prior=$$(el,'#mrExistingRows tr').filter(tr=>tr.cells.length===8).map(tr=>{
  const td=tr.cells;
  return {kind:'existing',id:td[7]?.textContent?.trim()||'',date:td[0]?.textContent?.trim()||'',name:td[2]?.textContent?.trim()||'',
    category:td[3]?.textContent?.trim()||'',period:td[4]?.textContent?.trim()||'',hours:'—',
    status:td[5]?.textContent?.trim()||'',source:td[6]?.textContent?.trim()||''};
 });
 // The controller audits the full authorized roster, including employees who
 // have no eligible date or existing report. Surface these person-level rows
 // separately from dated declarations; never manufacture a date or hours.
 const roster=new Map();
 for(const tr of $$(el,'#mrNeedRows tr')){
  const pick=$(tr,'.need-plan'),td=tr.cells;
  if(!pick||td.length!==6)continue;
  const id=String(pick.dataset.emp||td[1]?.textContent||'').trim();
  if(!id||roster.has(id.toUpperCase()))continue;
  const quota=td[4]?.textContent?.trim()||'尚無法計算',reason=td[5]?.textContent?.trim()||'須核對正式班表與考勤';
  const missing=tr.dataset?.reviewType==='missing'||quota==='尚無法計算'||/班表缺漏/.test(reason);
  const counts=quota.match(/^例(\d+(?:\.\d+)?)／休(\d+(?:\.\d+)?)／國(\d+(?:\.\d+)?)$/);
  const due=missing?null:counts?counts.slice(1).reduce((sum,n)=>sum+Number(n),0):null;
  const reviewType=due===null?'missing':due>0?'deficit':'exception';
  // Zero remaining quota does not mean the source has no attendance exception.
  // The controller already excludes people with no deficit and no exceptions.
  let suggestions=[];try{const parsed=JSON.parse(tr.dataset?.periodSuggestions||'[]');if(Array.isArray(parsed))suggestions=parsed.filter(x=>x&&typeof x.date==='string'&&typeof x.period==='string'&&x.period.trim());}catch{}
  if(reviewType!=='deficit')suggestions=[];
  const period=suggestions.length?suggestions.map(x=>x.date+' '+periodLabel(x.period)+'（'+x.note+'）').join('；'):reviewType==='deficit'?'無可參考的月底班表時段':'—';
  roster.set(id.toUpperCase(),{kind:'roster',id,date:'',name:td[3]?.textContent?.trim()||'',role:td[2]?.textContent?.trim()||'',category:reviewType==='missing'?'尚無法計算':reviewType==='exception'?'無缺額':quota,period,suggestions,canPreplan:reviewType==='deficit'&&tr.dataset?.canPreplan==='true',hours:'—',reviewType,due,status:reviewType==='missing'?'缺資料':reviewType==='deficit'?'未休缺額':'出勤／申報待核對',source:reason,checked:false,disabled:true});
 }
 return {ready,planned,prior,roster:[...roster.values()]};
}
// Selection for inspection is independent of the official submit checkbox.
 // Pending/uncertain rows may be inspected even when cloud rules block filing.
function selectionKey(row){return JSON.stringify([row.kind,row.id,row.date,row.name,row.category,row.period]);}
function selectionMode(row){
 if(!row)return 'none';
 if(row.kind==='roster')return 'review';
 if(row.kind==='existing')return row.status==='已核對出勤'?'none':'review';
 if(row.kind==='plan')return row.disabled?'review':'native';
 if(row.kind==='ready')return !row.disabled&&/可申報/.test(row.status)&&
   !/缺|不足|無法|失敗|錯誤/.test(row.status)?'native':'review';
 return 'none';
}
function markForReview(selected,row,checked){
 if(selectionMode(row)!=='review')return false;
 const key=selectionKey(row);
 if(checked)selected.add(key);else selected.delete(key);
 return true;
}
function reviewSelected(selected,row){return selectionMode(row)==='review'&&selected.has(selectionKey(row));}
function mount(el){
 if(!el||el.id!=='p79MonthlyRest'||$(el,'#mrUxRoot'))return;
 const body=$(el,'.body'),originalMonth=$(el,'#mrMonth'),originalDept=$(el,'#mrDept'),originalJob=$(el,'#mrJob');
 if(!body||!originalMonth||!originalDept||!originalJob)return;
 const style=document.createElement('style');style.id='mrUxStyle';
 style.textContent=`
 #p79MonthlyRest{width:min(1560px,calc(100vw - 24px))!important;max-height:95dvh!important;border-radius:20px!important;overflow:hidden!important;background:#f8fbff!important;color:#172b4d!important}
 #p79MonthlyRest>.body{max-height:calc(95dvh - 92px)!important;padding:0!important;overflow:auto!important;display:block!important;background:#f8fbff}
 #p79MonthlyRest>.body>:not(#mrUxRoot){display:none!important}
 #p79MonthlyRest>header{padding:17px 24px!important;background:linear-gradient(108deg,#fff 65%,#e9f4ff)!important;min-height:77px;display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px!important} #p79MonthlyRest>header [data-close]{grid-column:2;grid-row:1/span 2;align-self:center}
 #p79MonthlyRest>header>b{font-size:24px;color:#122b54}
 #p79MonthlyRest>header [data-close]{background:#e4edf8!important;color:#315072!important;font-weight:700}
 #p79MonthlyRest>footer:not(#mrUxFooter){display:none!important}
 #p79MonthlyRest #mrUxRoot{display:flex;flex-direction:column;gap:16px;padding:16px 21px 18px;min-width:0;font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif}
 #p79MonthlyRest #mrUxRoot *{box-sizing:border-box}
 #p79MonthlyRest #mrUxSubtitle{font-size:12px;color:#527297;font-weight:600;margin-top:3px}
 #p79MonthlyRest .mr-ux-banner{border-radius:13px;background:linear-gradient(95deg,#e5f1ff,#dbeaff);color:#214a80;padding:11px 15px;font-size:13px;font-weight:650;display:flex;align-items:center;gap:10px;min-height:44px}
 #p79MonthlyRest .mr-ux-banner .mr-ux-info{display:inline-grid;place-items:center;width:25px;height:25px;flex:none;border-radius:50%;background:#4b9afb;color:white;font-weight:900}
 #p79MonthlyRest #mrUxProgress{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 #p79MonthlyRest .mr-ux-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
 #p79MonthlyRest .mr-ux-stat{display:flex;align-items:center;gap:12px;border:1px solid #c7ddf8;border-radius:15px;padding:13px 17px;background:linear-gradient(145deg,#fff,#eff6ff);min-height:94px}
 #p79MonthlyRest .mr-ux-stat:nth-child(2){background:linear-gradient(145deg,#fff,#ecfbf4);border-color:#bbdfcf}
 #p79MonthlyRest .mr-ux-stat:nth-child(3){background:linear-gradient(145deg,#fff,#fff9ed);border-color:#e6dfc7}
 #p79MonthlyRest .mr-ux-stat:nth-child(4){background:linear-gradient(145deg,#fff,#f3f0ff);border-color:#d7d0f5}
 #p79MonthlyRest .mr-ux-symbol{display:grid;place-items:center;flex:none;width:48px;height:48px;border-radius:13px;background:#e4f1ff;font-size:26px;color:#1468d9}
 #p79MonthlyRest .mr-ux-stat:nth-child(2) .mr-ux-symbol{background:#e4f8ec;color:#047857}
 #p79MonthlyRest .mr-ux-stat:nth-child(3) .mr-ux-symbol{background:#fff2d8;color:#b96900}
 #p79MonthlyRest .mr-ux-stat:nth-child(4) .mr-ux-symbol{background:#ebeaff;color:#5447c7}
 #p79MonthlyRest .mr-ux-stat span:not(.mr-ux-symbol){display:block;color:#253f66;font-size:14px;font-weight:800}
 #p79MonthlyRest .mr-ux-stat strong{display:block;color:#1554a4;font-size:28px;line-height:1.25}
 #p79MonthlyRest .mr-ux-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:white;border:1px solid #dce7f6;border-radius:15px;padding:12px;box-shadow:0 3px 12px #174f8510}
 #p79MonthlyRest .mr-ux-tools>label{flex:0 1 auto;display:flex;flex-direction:row;align-items:center;gap:8px;font-weight:700;font-size:13px;white-space:nowrap}
 #p79MonthlyRest .mr-ux-tools input,#p79MonthlyRest .mr-ux-tools select{height:40px;min-width:145px;border:1px solid #d2ddef;border-radius:9px;padding:7px 10px;color:#1f3557;background:#fff;font-size:13px}
 #p79MonthlyRest .mr-ux-tools #mrUxName{width:150px;min-width:130px}
 #p79MonthlyRest .mr-ux-tools .mr-ux-spacer{flex:1}
 #p79MonthlyRest .mr-ux-primary{background:linear-gradient(#2581ff,#055de5)!important;color:#fff!important;box-shadow:0 4px 8px #125de324;font-weight:800}
 #p79MonthlyRest .mr-ux-outline{background:#f8fbff!important;border:1px solid #bed1e9!important;color:#245077!important;font-weight:750}
 #p79MonthlyRest .mr-ux-tools button{min-height:40px;white-space:nowrap;padding:7px 11px}
 #p79MonthlyRest .mr-ux-grid{display:grid;grid-template-columns:minmax(0,3fr) minmax(245px,1fr);gap:13px;min-height:250px}
 #p79MonthlyRest .mr-ux-card{min-width:0;background:white;border:1px solid #dce7f6;border-radius:16px;padding:14px;box-shadow:0 3px 11px #174f850d}
 #p79MonthlyRest .mr-ux-tabs{display:flex;border-bottom:1px solid #d9e6f6;gap:18px;padding:0 4px 10px}
 #p79MonthlyRest .mr-ux-tabs button{background:none!important;border:0!important;padding:6px 10px!important;font-size:15px!important;font-weight:800!important;color:#637894!important}
 #p79MonthlyRest .mr-ux-tabs button[aria-selected="true"]{color:#0864dc!important;border-bottom:3px solid #0d7cf7!important;border-radius:0!important}
 #p79MonthlyRest .mr-ux-table-scroll{overflow:auto;max-height:43dvh}
 #p79MonthlyRest .mr-ux-table{width:100%;border-collapse:collapse;white-space:nowrap;min-width:740px;font-size:13px}
 #p79MonthlyRest .mr-ux-table th{background:#e9f3ff;padding:13px 10px;color:#344d71;font-size:13px}
 #p79MonthlyRest .mr-ux-table td{padding:11px 9px;border-bottom:1px solid #e2eaf5;vertical-align:middle}
 #p79MonthlyRest .mr-ux-table td:first-child,#p79MonthlyRest .mr-ux-table th:first-child{width:36px}
 #p79MonthlyRest .mr-ux-table input[type=checkbox]{width:18px!important;height:18px!important;min-height:18px!important}
 #p79MonthlyRest .mr-ux-pill{display:inline-flex;align-items:center;border-radius:99px;padding:5px 10px;font-size:12px;font-weight:800}
 #p79MonthlyRest .mr-ux-pill.ready{background:#daf6e4;color:#056b3d}
 #p79MonthlyRest .mr-ux-pill.review{background:#fff0ce;color:#b66b00}
 #p79MonthlyRest .mr-ux-pill.missing{background:#fee5e5;color:#bf3030}
 #p79MonthlyRest .mr-ux-pill.done{background:#e4ecff;color:#315eaf}
 #p79MonthlyRest .mr-ux-kind{border-radius:8px;background:#e2f0ff;color:#1357a8;padding:5px 9px;font-weight:800}
 #p79MonthlyRest .mr-ux-table button{padding:4px 5px!important;color:#2e588e!important;background:transparent!important;font-size:12px!important;font-weight:800}
 #p79MonthlyRest .mr-ux-table button:disabled{opacity:.35}
 #p79MonthlyRest .mr-ux-reasons h3{font-size:17px;margin:5px 2px 14px;color:#123359}
 #p79MonthlyRest .mr-ux-reason{padding:12px;border-radius:11px;background:#eaf3ff;margin:8px 0;line-height:1.55}
 #p79MonthlyRest .mr-ux-reason b{display:block;font-size:13px;color:#183b6c}
 #p79MonthlyRest .mr-ux-reason small{display:block;font-size:11px;color:#526e91}
 #p79MonthlyRest #mrUxFooter{position:sticky;bottom:-18px;z-index:5;border-radius:12px;background:#e0edfe!important;padding:10px 15px!important;display:flex!important;gap:12px;align-items:center;flex-wrap:wrap;box-shadow:0 -3px 10px #174f850c}
 #p79MonthlyRest #mrUxFooter .mr-ux-spacer{flex:1}
 #p79MonthlyRest #mrUxFooter button{min-height:42px;min-width:118px;font-size:15px;font-weight:800}
 #p79MonthlyRest #mrUxFooter button:disabled{opacity:.45;cursor:not-allowed}
 #p79MonthlyRest #mrUxHint{color:#597394;font-size:11px}
 @media(max-width:1100px){#p79MonthlyRest .mr-ux-grid{grid-template-columns:1fr}#p79MonthlyRest .mr-ux-reasons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}#p79MonthlyRest .mr-ux-reasons h3{grid-column:1/-1}#p79MonthlyRest .mr-ux-reason{margin:0}}
 @media(max-width:750px){#p79MonthlyRest #mrUxRoot{padding:10px;gap:10px}#p79MonthlyRest .mr-ux-stats{grid-template-columns:repeat(2,minmax(0,1fr))}#p79MonthlyRest .mr-ux-stat{padding:9px;min-height:76px}#p79MonthlyRest .mr-ux-stat strong{font-size:22px}#p79MonthlyRest .mr-ux-grid{grid-template-columns:1fr}#p79MonthlyRest .mr-ux-reasons{display:block}#p79MonthlyRest .mr-ux-tools>label{flex:1 1 40%}#p79MonthlyRest .mr-ux-tools input,#p79MonthlyRest .mr-ux-tools select{min-width:0;max-width:100%}#p79MonthlyRest .mr-ux-tools .mr-ux-spacer{display:none}#p79MonthlyRest #mrUxFooter{bottom:-10px}}
 `;
 el.appendChild(style);
 const subtitle=document.createElement('div');subtitle.id='mrUxSubtitle';subtitle.textContent='自動編排、快速核對、正式申報一頁完成';
 const header=$(el,'header');if(header){$(header,'b')?.after(subtitle);}
 const shell=document.createElement('section');shell.id='mrUxRoot';
 shell.innerHTML=`
 <div class="mr-ux-banner"><span class="mr-ux-info">i</span><span id="mrUxProgress">正在核對正式班表、出勤及申報資料…</span><button type="button" id="mrUxReload" class="mr-ux-outline" title="重新讀取雲端資料">↻</button></div>
 <div class="mr-ux-stats">
 <div class="mr-ux-stat"><span class="mr-ux-symbol">⌛</span><div><span>待處理日期</span><strong id="mrUxPending">—</strong></div></div>
 <div class="mr-ux-stat"><span class="mr-ux-symbol">✓</span><div><span>可正式申報</span><strong id="mrUxReady">—</strong></div></div>
 <div class="mr-ux-stat"><span class="mr-ux-symbol">⚲</span><div><span>未休缺額人員</span><strong id="mrUxReview">—</strong></div></div>
 <div class="mr-ux-stat"><span class="mr-ux-symbol">✓</span><div><span>已完成</span><strong id="mrUxDone">—</strong></div></div>
 </div>
 <div class="mr-ux-tools">
 <label>月份 <input type="month" id="mrUxMonth"></label>
 <label>部門 <select id="mrUxDept"></select></label>
 <label>職稱 <select id="mrUxJob"><option value="">全部職稱</option></select></label>
 <label>姓名 <input type="search" id="mrUxName" placeholder="搜尋姓名" autocomplete="off"></label>
 <label>狀態 <select id="mrUxState"><option value="">全部狀態</option><option value="ready">可申報</option><option value="review">待核對</option><option value="missing">缺資料</option><option value="plan">預排建議</option></select></label>
 <span class="mr-ux-spacer"></span>
 <button type="button" id="mrUxAuto" class="mr-ux-primary">✦ 一鍵自動編排</button>
 <button type="button" id="mrUxBatch" class="mr-ux-outline">☑ 批次核對</button>
 <button type="button" id="mrUxExport" class="mr-ux-outline">⇧ 匯出</button>
 </div>
 <div class="mr-ux-grid">
 <section class="mr-ux-card"><div class="mr-ux-tabs">
 <button type="button" id="mrUxTabPending" aria-selected="true">▤ 待處理名單 <span id="mrUxPendingTab"></span></button>
 <button type="button" id="mrUxTabAudit" aria-selected="false">已預排／待核對 <span id="mrUxAuditTab"></span></button>
 <button type="button" id="mrUxTabDone" aria-selected="false">✓ 已完成 <span id="mrUxDoneTab"></span></button>
 </div>
 <div class="mr-ux-table-scroll"><table class="mr-ux-table"><thead><tr>
 <th><input type="checkbox" id="mrUxAll" aria-label="全選目前可處理項目"></th>
 <th>日期</th><th>姓名</th><th>休假類型／缺額</th><th>建議日期／時段</th><th>工時</th><th>狀態</th><th>操作</th>
 </tr></thead><tbody id="mrUxRows"></tbody></table></div>
 <p id="mrUxListHint" style="font-size:11px;color:#617e9f;margin:9px 3px 0">所有數字均取自當月正式來源，尚未核實的預排不等於已申報。</p>
 </section>
 <aside class="mr-ux-card mr-ux-reasons"><h3>ⓘ 待核對原因</h3>
 <div id="mrUxReviewSummary" role="status" aria-live="polite" style="font-size:12px;color:#476587;line-height:1.55;margin:8px 2px">勾選待核對資料後，可在這裡檢視所選項目；不會直接申報。</div>
 <div class="mr-ux-reason"><b>▤ 時段衝突</b><small>建議時段與既有排班／打卡不一致時需重新核對。</small></div>
 <div class="mr-ux-reason"><b>▧ 缺少必要資料</b><small>班表、出勤或人員資料缺漏時不允許直接申報。</small></div>
 <div class="mr-ux-reason"><b>♙ 人員異動</b><small>到職、離職、職稱或權限變更時依正式資料重新確認。</small></div>
 </aside></div>
 <footer id="mrUxFooter"><span id="mrUxSelected">已勾選 0 筆</span><span class="mr-ux-spacer"></span>
 <span id="mrUxHint"></span><button type="button" id="mrUxSavePlan" class="mr-ux-outline" disabled>▣ 儲存預排</button>
 <button type="button" id="mrUxSubmit" class="mr-ux-primary" disabled>➤ 正式申報</button></footer>`;
 body.prepend(shell);
 const q=sel=>$(shell,sel);
 const state={tab:'pending',name:'',status:'',hint:'',snapshot:null,rendering:false,disposed:false,reviewSelected:new Set()};
 function rows(){
  const data=sourceRows(el);
  const pendingReports=data.prior.filter(r=>r.status!=='已核對出勤'&&!/已取消|歷史版本/.test(r.status));
  const verified=data.prior.filter(r=>r.status==='已核對出勤'&&!/已取消|歷史版本/.test(r.status));
  const suggestions=data.planned.filter(r=>!r.disabled||r.checked);
  const deficits=data.roster.filter(r=>r.reviewType==='deficit');
  const exceptions=data.roster.filter(r=>r.reviewType!=='deficit');
  const pending=[...data.ready,...suggestions,...deficits];
  const audit=[...pendingReports,...exceptions];
  return {data,pending,audit,verified,deficits,exceptions};
 }
 function kind(row){
  if(row.kind==='roster')return row.status==='缺資料'?'missing':'review';
  if(row.kind==='existing')return row.status==='已核對出勤'?'done':'review';
  if(row.kind==='plan')return 'plan';
  if(/缺|不足|無法|失敗|錯誤/.test(row.status))return 'missing';
  if(!row.disabled&&/可申報/.test(row.status))return 'ready';
  return 'review';
 }
 function label(row){if(row.kind==='roster')return row.status;if(row.kind==='existing'&&/^預排/.test(row.status))return row.status;const type=kind(row);return {ready:'可申報',review:'待核對',missing:'缺資料',plan:'預排建議',done:'已完成'}[type];}
 function currentView(){const data=rows();let shown=state.tab==='done'?data.verified:state.tab==='audit'?data.audit:data.pending;
  if(state.name)shown=shown.filter(r=>norm(r.name).includes(norm(state.name)));
  if(state.status&&state.tab!=='done')shown=shown.filter(r=>kind(r)===state.status);
  return {...data,shown};
 }
 function render(){
  if(state.disposed||state.rendering)return;state.rendering=true;
  try{
   const originalState=text(el,'#mrStatus');
   const month=originalMonth.value;
   if(q('#mrUxMonth').value!==month)q('#mrUxMonth').value=month;
   const sourceOptions=originalDept.innerHTML;
   if(q('#mrUxDept').innerHTML!==sourceOptions)q('#mrUxDept').innerHTML=sourceOptions;
   if(q('#mrUxDept').value!==originalDept.value)q('#mrUxDept').value=originalDept.value;
   if(q('#mrUxJob').innerHTML!==originalJob.innerHTML)q('#mrUxJob').innerHTML=originalJob.innerHTML;
   if(q('#mrUxJob').value!==originalJob.value)q('#mrUxJob').value=originalJob.value;
   q('#mrUxJob').disabled=originalJob.disabled;
   const view=currentView(),{data,pending,audit,verified,shown,deficits,exceptions}=view;
   // Discard local inspection picks for rows no longer in the live source.
   const reviewKeys=new Set([...pending,...audit].filter(r=>selectionMode(r)==='review').map(selectionKey));
   for(const key of state.reviewSelected)if(!reviewKeys.has(key))state.reviewSelected.delete(key);
   const isPicked=r=>selectionMode(r)==='review'?reviewSelected(state.reviewSelected,r):!!r.checked;
   const selectedPending=(state.tab==='done'?[]:state.tab==='audit'?audit:pending).filter(isPicked);
   const selectedReview=selectedPending.filter(r=>selectionMode(r)==='review');
   const selectedNative=selectedPending.length-selectedReview.length;
   const needs=deficits.length;
   const ready=data.ready.filter(r=>kind(r)==='ready').length;
   const sourceLoaded=!!text(el,'#mrAuditSummary');
   const pendingTotal=pending.filter(r=>r.kind!=='roster').length;
   q('#mrUxPending').textContent=sourceLoaded?pendingTotal+' 筆':'—';
   q('#mrUxReady').textContent=sourceLoaded?ready+' 筆':'—';
   q('#mrUxReview').textContent=sourceLoaded?needs+' 人':'—';
   q('#mrUxDone').textContent=sourceLoaded?verified.length+' 筆':'—';
   q('#mrUxPendingTab').textContent=sourceLoaded?'('+pendingTotal+' 筆／'+needs+' 人)':'';
   q('#mrUxAuditTab').textContent=sourceLoaded?'('+audit.filter(r=>r.kind!=='roster').length+' 筆／'+exceptions.length+' 人)':'';
   q('#mrUxDoneTab').textContent=sourceLoaded?'('+verified.length+')':'';
   const info=originalState.replace(/\s+/g,' ').slice(0,115);
   const sourceFailed=!sourceLoaded&&/讀取失敗|核對失敗|錯誤|無法取得|無法載入/.test(info);
   q('#mrUxProgress').textContent=sourceFailed?'資料讀取失敗｜'+(info||'請按右側重新讀取'):state.hint||info||'正在讀取正式雲端資料…';
   q('#mrUxProgress').setAttribute('role',sourceFailed?'alert':'status');
   q('#mrUxReload').title=sourceFailed?'重新讀取正式班表與考勤':'重新讀取雲端資料';
   q('#mrUxTabPending').setAttribute('aria-selected',String(state.tab==='pending'));
   q('#mrUxTabAudit').setAttribute('aria-selected',String(state.tab==='audit'));
   q('#mrUxTabDone').setAttribute('aria-selected',String(state.tab==='done'));
   const eligible=state.tab!=='done'?shown.filter(r=>selectionMode(r)!=='none'):[];
   q('#mrUxAll').disabled=eligible.length===0;
   q('#mrUxAll').checked=eligible.length>0&&eligible.every(isPicked);
   q('#mrUxAll').indeterminate=eligible.some(isPicked)&&!q('#mrUxAll').checked;
   const countLabel=list=>{const people=list.filter(r=>r.kind==='roster').length;return (list.length-people)+' 筆'+(people?'／'+people+' 人':'');};
   q('#mrUxSelected').textContent='已勾選 '+countLabel(selectedPending)+'（待核對 '+countLabel(selectedReview)+'／可處理 '+selectedNative+' 筆）';
   q('#mrUxReviewSummary').innerHTML=selectedPending.length?
     '<b>已選取 '+countLabel(selectedPending)+' 供核對（其中 '+countLabel(selectedReview)+' 僅供檢視）</b>'+
     selectedPending.slice(0,8).map(r=>'<div style="border-top:1px solid #dbe8f9;margin-top:7px;padding-top:7px">'+
       esc(r.date||'本月')+'｜'+esc(r.name)+'｜'+esc(label(r))+
       '<small style="display:block;color:#657b95">'+esc(r.source||r.status||'需核對正式班表及出勤')+'</small></div>').join('')+
     (selectedPending.length>8?'<small>另有 '+(selectedPending.length-8)+' 項已勾選</small>':''):
     '勾選待核對資料後，可在這裡檢視所選項目；不會直接申報。';
   const nativeSave=$(el,'#mrSave'),nativePlan=$(el,'#mrSavePlans');
   q('#mrUxSavePlan').disabled=!!nativePlan?.disabled||!data.planned.some(r=>r.checked&&!r.disabled);
   q('#mrUxSavePlan').textContent='▣ 儲存預排（'+data.planned.filter(r=>r.checked&&!r.disabled).length+' 筆）';
   q('#mrUxSubmit').disabled=!data.ready.some(r=>r.checked&&!r.disabled)||!/申報/.test(nativeSave?.textContent||'');
   // In automatic planning mode the existing footer saves plans, not reports.
   // The real formal-submit action can still enter the official manual path.
   if(q('#mrUxSubmit').disabled&&data.ready.some(r=>r.checked&&!r.disabled)&&!$(el,'#mrManualMode')?.checked)
    q('#mrUxSubmit').disabled=false;
   if(state.tab!=='pending'){q('#mrUxSavePlan').disabled=true;q('#mrUxSubmit').disabled=true;}
   q('#mrUxHint').textContent=state.tab==='audit'?'異常核對唯讀，不代表尚有休假缺額':state.tab==='done'?'已完成項目唯讀，不會重複申報':data.planned.some(r=>r.checked)?'預排不等於正式申報':'正式申報需核實完整出勤';
   q('#mrUxRows').innerHTML=shown.map(r=>{
    const type=kind(r),status=label(r),selectable=state.tab!=='done'&&selectionMode(r)!=='none';
    const id=esc(r.id),kindKey=esc(r.kind),key=esc(selectionKey(r));
    const operations=r.kind==='roster'&&r.canPreplan&&!originalMonth.disabled?
     '<button type="button" data-action="preplan" data-key="'+key+'">＋ 預排申報</button><button type="button" data-action="view" data-key="'+key+'">◎ 檢視</button>':r.kind==='ready'?
     '<button type="button" data-action="edit" data-kind="ready" data-id="'+id+'" data-key="'+key+'">✎ 編輯</button><button type="button" data-action="view" data-kind="ready" data-id="'+id+'" data-key="'+key+'">◎ 檢視</button>':
     '<button type="button" data-action="view" data-kind="'+kindKey+'" data-id="'+id+'" data-key="'+key+'">◎ 檢視</button>';
    return '<tr><td><input type="checkbox" data-action="pick" data-kind="'+kindKey+'" data-id="'+id+'" data-key="'+key+'" '+(isPicked(r)?'checked ':'')+(selectable?'':'disabled ')+
      'aria-label="勾選 '+esc(r.name)+' '+esc(r.date)+'"></td><td>'+esc(r.date||'本月')+'</td><td>'+esc(r.name)+(r.kind==='roster'?'<small style="display:block;color:#64748b">'+esc(r.role)+'｜'+(r.reviewType==='deficit'?'未休缺額':'異常核對')+'</small>':'')+'</td>'+
      '<td><span class="mr-ux-kind">'+esc(r.category)+'</span></td><td>'+(r.suggestions?.length?r.suggestions.map(x=>'<div style="margin:3px 0"><b>'+esc(x.date.slice(5))+' '+esc(periodLabel(x.period))+'</b><small style="display:block;color:'+(x.referenceOnly&&!x.eligible?'#9a6700':'#64748b')+'">'+(x.referenceOnly?(x.eligible?'預排可核對｜':'班表參考｜'):'')+esc(x.note)+'</small></div>').join(''):esc(periodLabel(r.period)))+'</td><td>'+esc(r.hours)+'</td>'+
      '<td><span class="mr-ux-pill '+(type==='plan'?'review':type)+'">'+esc(status)+'</span>'+(r.kind==='roster'?'<small style="display:block;white-space:normal;max-width:220px;color:#64748b">'+esc(r.source)+'</small>':'')+'</td><td>'+operations+'</td></tr>';
   }).join('')||'<tr><td colspan="8" style="padding:24px;color:#64748b">'+(sourceFailed?'讀取失敗，請按上方 ↻ 重新讀取。':!sourceLoaded?'正在讀取雲端資料，完成後顯示名單。':'目前篩選沒有資料；請確認月份、部門或雲端核對狀態。')+'</td></tr>';
   q('#mrUxListHint').textContent='顯示 '+countLabel(shown)+'；'+(state.tab==='audit'?'零缺額但有異常、缺資料與既有待核申報在此列示，不列為未休缺額人員。':state.tab==='done'?'已完成申報不重複申報。':'僅列剩餘例／休／國大於零的人員及日期候選；可按個別預排申報設定日期與時段，或勾選自動編排建議後儲存預排；實際出勤後才可正式申報。零缺額異常另列。');
   q('#mrUxExport').disabled=!shown.length;
  }finally{state.rendering=false;}
 }
 function updatePick(row,checked){
  if(!row)return;
  if(selectionMode(row)==='review'){markForReview(state.reviewSelected,row,checked);return;}
  if(selectionMode(row)==='native')nativePick(row,checked);
 }
 function nativePick(row,checked){
  if(!row||!['ready','plan'].includes(row.kind))return;
  const input=row.kind==='plan'?
    $(el,'#mrPlannedRows .plan-pick[data-plan-index="'+row.id+'"]'):
    $(el,'#mrRows tr[data-row="'+row.id+'"] .pick');
  if(!input||input.disabled)return;
  input.checked=checked;input.dispatchEvent(new Event('change',{bubbles:true}));
 }
 function details(row){
  if(!row)return;
  const source=row.kind==='ready'?$(el,'#mrRows tr[data-row="'+row.id+'"] [data-audit]'):null;
  if(source){source.click();return;}
  global.alert([row.name,row.date,row.category,periodLabel(row.period),row.status,row.source||''].filter(Boolean).join(' ｜ '));
 }
 function edit(row){
  if(!row||row.kind!=='ready')return;
  const source=$(el,'#mrRows tr[data-row="'+row.id+'"]');
  if(!source)return;
  const date=$(source,'.date'),category=$(source,'.category'),rule=$(source,'.rule');
  if(!date||!category||!rule)return;
  const editor=document.createElement('dialog');editor.className='mr-ux-editor';
  editor.style.cssText='width:min(470px,calc(100vw - 32px));padding:22px;border:1px solid #c4d9f5;border-radius:14px;box-shadow:0 18px 60px #1233;background:white;color:#173a64;font:14px system-ui';
  editor.innerHTML='<h3 style="margin-top:0">編輯未休假申報候選</h3><p>'+esc(row.name)+'｜'+esc(row.date)+'</p>'+
    '<label style="display:block;margin:12px 0">日期 <input id="mrUxEditDate" type="date" min="'+esc(date.min)+'" max="'+esc(date.max)+'" value="'+esc(date.value)+'" style="width:100%"></label>'+
    '<label style="display:block;margin:12px 0">假別 <select id="mrUxEditCategory" style="width:100%">'+category.innerHTML+'</select></label>'+
    '<label style="display:block;margin:12px 0">出勤時段 <select id="mrUxEditRule" style="width:100%">'+rule.innerHTML+'</select></label>'+
    '<p style="font-size:12px;color:#526e91">此處只修改待核候選。正式送出前仍會重新核對班表、出勤、假別與雲端額度。</p>'+
    '<div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" id="mrUxEditCancel">取消</button><button type="button" id="mrUxEditApply" style="background:#1167e9;color:white">套用變更</button></div>';
  document.body.appendChild(editor);
  const cat=$(editor,'#mrUxEditCategory'),code=$(editor,'#mrUxEditRule');cat.value=category.value;code.value=rule.value;
  const close=()=>{editor.close();editor.remove();};
  $(editor,'#mrUxEditCancel').onclick=close;editor.oncancel=()=>{editor.remove();};
  $(editor,'#mrUxEditApply').onclick=()=>{
   const locate=()=>$(el,'#mrRows tr[data-row="'+row.id+'"]');
   const apply=(selector,value)=>{const control=$(locate(),selector);if(!control||control.disabled)return;control.value=value;control.dispatchEvent(new Event('change',{bubbles:true}));};
   const nextCat=cat.value,nextRule=code.value,nextDate=$(editor,'#mrUxEditDate').value;
   if(!nextDate)return;
   const catChanged=nextCat!==category.value;
   if(catChanged)apply('.category',nextCat);
   else if(nextRule!==rule.value)apply('.rule',nextRule);
   if(nextDate!==row.date)apply('.date',nextDate);
   state.hint='候選資料已更新；正式申報前仍須再次雲端核對。';
   close();render();
  };
  editor.showModal();
 }
 q('#mrUxMonth').onchange=e=>{if(!originalMonth.disabled){state.reviewSelected.clear();originalMonth.value=e.target.value;originalMonth.dispatchEvent(new Event('change',{bubbles:true}));}};
 q('#mrUxDept').onchange=e=>{if(!originalDept.disabled){originalDept.value=e.target.value;originalDept.dispatchEvent(new Event('change',{bubbles:true}));}};
 q('#mrUxJob').onchange=e=>{if(!originalJob.disabled){state.reviewSelected.clear();originalJob.value=e.target.value;originalJob.dispatchEvent(new Event('change',{bubbles:true}));render();}};
 q('#mrUxName').oninput=e=>{state.name=e.target.value;render();};
 q('#mrUxState').onchange=e=>{state.status=e.target.value;render();};
 q('#mrUxTabPending').onclick=()=>{state.tab='pending';render();};
 q('#mrUxTabAudit').onclick=()=>{state.tab='audit';state.status='';q('#mrUxState').value='';render();};
 q('#mrUxTabDone').onclick=()=>{state.tab='done';render();};
 q('#mrUxReload').onclick=()=>{state.hint='';state.reviewSelected.clear();$(el,'#mrLoad')?.click();render();};
 q('#mrUxAuto').onclick=()=>{
  const mode=$(el,'#mrAutoMode');if(!mode||mode.disabled)return;
  mode.checked=true;mode.dispatchEvent(new Event('change',{bubbles:true}));
  state.tab='pending';state.hint='已依正式排班及未休額度產生可用的預排建議；須勾選並儲存才會成立，並非正式申報。';render();
 };
 q('#mrUxBatch').onclick=()=>{
  const view=currentView();
  const selected=(state.tab==='audit'?view.audit:state.tab==='pending'?view.pending:[]).filter(r=>selectionMode(r)==='review'?
   reviewSelected(state.reviewSelected,r):!!r.checked);
  if(!selected.length){
   state.hint='請先勾選待核對資料；可以勾選灰色狀態的項目查看原因，但不會直接申報。';
  }else{
   const blocked=selected.filter(r=>selectionMode(r)==='review').length;
   state.hint='已選取 '+selected.length+' 項核對資料，其中 '+blocked+' 項待查核；右側顯示所選項目，尚未修改正式申報狀態。';
  }
  render();
 };
 q('#mrUxAll').onchange=e=>{for(const r of currentView().shown.filter(r=>selectionMode(r)!=='none'))updatePick(r,e.target.checked);render();};
 q('#mrUxRows').addEventListener('change',e=>{
  const target=e.target;if(target.dataset.action!=='pick')return;
  const row=currentView().shown.find(x=>selectionKey(x)===target.dataset.key);
  updatePick(row,target.checked);render();
 });
 q('#mrUxRows').addEventListener('click',e=>{
  const button=e.target.closest('[data-action]');if(!button)return;
  const row=currentView().shown.find(x=>selectionKey(x)===button.dataset.key);
  if(button.dataset.action==='view')details(row);
  if(button.dataset.action==='edit')edit(row);
  if(button.dataset.action==='preplan'&&row?.kind==='roster'&&row.canPreplan&&!originalMonth.disabled)el.p79OpenMonthlyRestPlan?.(row.id);
 });
 q('#mrUxSavePlan').onclick=()=>{if(state.tab!=='pending')return;const button=$(el,'#mrSavePlans');if(button&&!button.disabled)button.click();};
 q('#mrUxSubmit').onclick=()=>{
  if(state.tab!=='pending')return;
  let submit=$(el,'#mrSave');
  if(!submit||!sourceRows(el).ready.some(r=>r.checked&&!r.disabled))return;
  // The native automatic current-month footer means 'save plan'; never
  // route a formal submit through that alternate action.
  if(/預排/.test(submit.textContent||'')){
   const mode=$(el,'#mrManualMode');
   if(!mode||mode.disabled)return;
   mode.checked=true;mode.dispatchEvent(new Event('change',{bubbles:true}));
   submit=$(el,'#mrSave');
  }
  if(!submit.disabled&&/申報/.test(submit.textContent||''))submit.click();
  else{state.hint='目前尚未通過正式申報條件；請先核對出勤、日期與申報開放日。';render();}
 };
 q('#mrUxExport').onclick=()=>{
  const records=currentView().shown;if(!records.length)return;
  const clean=x=>{let v=String(x??'');if(/^[=+@\-]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';};
  const rows=[['日期','姓名','職稱','假別／缺額','建議日期／時段','工時','狀態','來源類型','核對原因'],...records.map(r=>[r.date,r.name,r.role||'',r.category,periodLabel(r.period),r.hours,label(r),r.kind==='roster'?(r.reviewType==='deficit'?'人員缺額核對':'人員異常核對'):r.kind,r.source||r.status])];
  const csv='\uFEFF'+rows.map(r=>r.map(clean).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download='每月未休假加班-'+(originalMonth.value||'')+'.csv';
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  global.setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const observers=[];
 for(const selector of ['#mrRows','#mrPlannedRows','#mrExistingRows','#mrNeedRows','#mrAutoSupplementRows','#mrAuditSummary','#mrStatus','#mrSave','#mrSavePlans']){
  const node=$(el,selector);if(!node)continue;
  const observer=new MutationObserver(()=>render());
  // DOM MutationObserver forbids attributeFilter together with attributes:false.
  // This previously threw on the first table observer, leaving every KPI as '—'.
  const button=['#mrSave','#mrSavePlans'].includes(selector);
  const options={childList:true,subtree:selector==='#mrStatus'||selector==='#mrAuditSummary',characterData:selector==='#mrStatus'};
  if(button){options.attributes=true;options.attributeFilter=['disabled'];}
  observer.observe(node,options);
  observers.push(observer);
 }
 // If an upstream request remains unresolved, show a bounded diagnostic
 // instead of an endless loading banner; do not assume zero reports or submit.
 const slowCheck=global.setTimeout?.(()=>{
  if(state.disposed||text(el,'#mrAuditSummary'))return;
  const status=text(el,'#mrStatus');
  if(!/讀取失敗|錯誤|無法|未完成/.test(status)){
   state.hint='正式資料仍未讀取完成。請確認網路，或關閉視窗後重新開啟；未取得資料前不能申報。';
   render();
  }
 },45000);
 el.addEventListener('close',()=>{
  state.disposed=true;observers.forEach(o=>o.disconnect());
  if(slowCheck!=null)global.clearTimeout?.(slowCheck);
 },{once:true});
 render();
}
global.P79MonthlyRestDashboard={mount,sourceRows,periodLabel,selectionKey,selectionMode,markForReview,reviewSelected};
})(window,document);

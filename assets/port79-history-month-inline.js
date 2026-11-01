/* Read-only archived-month viewer shared by existing PORT79 pages.
   Never changes a current-month screen or sends a write request.
   Requires the historyGetArchivedModuleMonth GET route for new modules.
*/
(function (w,d) {
'use strict';
const sourceTypes={
  attendance:'考勤歷史',schedule:'排班歷史',vessel:'船舶作業歷史',
  leave:'請假歷史','leave-cover':'代班歷史',overtime:'加班異動歷史',
  'overtime-export':'加班匯出歷史',workhours:'工時歷史',
  efficiency:'作業效率歷史',shipping:'船期歷史',hr:'人資歷史',
  'login-audit':'登入稽核歷史','raw-punch':'原始打卡歷史',
  'attendance-edit':'考勤修改歷史','deleted-punch':'刪除考勤歷史',
  'delete-index':'刪除保護索引歷史'
};
const legacy=new Set(['attendance','schedule','vessel']);
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function taiwanMonth(){
  const p=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).formatToParts(new Date());
  const n=k=>p.find(x=>x.type===k)?.value||'';
  return n('year')+'-'+n('month');
}
function archiveMonth(v){
  const s=String(v||'').trim();const m=s.match(/^(\d{4})-(\d{1,2})(?:月)?$/);
  return m&&Number(m[2])>=1&&Number(m[2])<=12?m[1]+'-'+m[2].padStart(2,'0'):'';
}
function gasUrl(){
  let url='';
  try{if(typeof GAS_URL!=='undefined')url=String(GAS_URL||'');}catch(e){}
  if(!url)try{url=String(sessionStorage.getItem('port79_gas_url')||'');}catch(e){}
  if(!url&&typeof w.GAS_URL==='string')url=w.GAS_URL;
  // Prevent token disclosure to arbitrary URLs injected through storage/markup.
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:[?].*)?$/.test(url)?url:'';
}
function userToken(){
  try{return ['port79_gc_superadmin_token','port79_admin_token','port79_gc_token','port79_user_token'].map(k=>sessionStorage.getItem(k)||'').find(Boolean)||'';}catch(e){return '';}
}
function rowsFromLegacy(type,r){
  if(type==='attendance'){
    return {headers:['工號','姓名','日期/時間','狀態'],rows:(r.records||[]).map(x=>[x.empId||'',x.name||'',x.timeStr||x.time||'',x.status||'']),totalRows:(r.records||[]).length};
  }
  if(type==='schedule'){
    const rows=(r.schedules||[]).map(x=>{
      const s=x.schedule||{};return [x.empId||'',x.name||'',x.group||'',...Array.from({length:31},(_,i)=>s[r.month+'-'+String(i+1).padStart(2,'0')]||'')];
    });
    return {headers:['工號','姓名','組別',...Array.from({length:31},(_,i)=>String(i+1)+'日')],rows,totalRows:rows.length};
  }
  const masters=r.shipMasters||[];
  return {headers:['WORKING NO','船名','完工日'],rows:masters.map(x=>[x.workingNo||'',x.vessel||x.shipName||'',x.lastDate||x.endDate||'']),totalRows:masters.length};
}
function enhance(config){
  const kind=String(config.type||'').toLowerCase();
  if(!sourceTypes[kind])return;
  const selector=d.querySelector(config.selector||'');
  if(!selector)return;
  const host=selector.closest('.field')||selector.parentElement||selector;
  const panel=d.createElement('section');
  panel.className='p79-archived-inline';
  panel.style.cssText='display:none;max-width:100%;margin:12px 0;padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;color:#0f172a;font:14px/1.5 system-ui,sans-serif';
  panel.setAttribute('aria-live','polite');
  host.insertAdjacentElement('afterend',panel);
  let generation=0;
  let page=1;
  function renderTable(data,month){
    const headers=data.headers||[];
    const rows=data.rows||[];
    const offset=(data.page-1)*(data.pageSize||100);
    const head='<tr>'+headers.map(v=>'<th style="padding:6px;border-bottom:1px solid #cbd5e1;white-space:nowrap">'+escapeHtml(v)+'</th>').join('')+'</tr>';
    const body=rows.map(a=>'<tr>'+headers.map((_,i)=>'<td style="padding:6px;border-bottom:1px solid #e2e8f0;white-space:nowrap">'+escapeHtml(a[i]||'')+'</td>').join('')+'</tr>').join('');
    const link=/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+\//.test(data.sourceUrl||'')
      ? '<a style="margin-left:12px" href="'+escapeHtml(data.sourceUrl)+'" target="_blank" rel="noopener noreferrer">開啟歷史 Google 試算表／下載 Excel</a>':'';
    panel.innerHTML='<strong>'+escapeHtml(month+'｜'+sourceTypes[kind])+'</strong> '
      +'<small style="color:#475569">'+escapeHtml(data.archiveStatus||data.sourceLabel||'歷史月份唯讀')+'</small>'+link
      +'<div style="overflow:auto;max-height:380px;margin-top:8px"><table style="border-collapse:collapse;text-align:left;font-size:12px"><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div>'
      +'<small>共 '+Number(data.totalRows||0)+' 筆；本頁 '+Number(offset+1)+'～'+Number(offset+rows.length)+' 筆</small>'
      +(data.hasMore?'<button type="button" data-history-next style="margin-left:12px">讀取下一頁</button>':'');
    const next=panel.querySelector('[data-history-next]');
    if(next)next.addEventListener('click',()=>load(page+1));
  }
  async function load(nextPage){
    const month=archiveMonth(selector.value);
    const serial=++generation;
    if(!month||month>=taiwanMonth()){panel.style.display='none';return;}
    panel.style.display='block';panel.textContent='從歷史資料庫讀取 '+month+'…';
    const gas=gasUrl(),token=userToken();
    if(!gas||!token){panel.textContent='需要已驗證的管理員登入與正式 GAS 連線才能讀取歷史月份';return;}
    try{
      const u=new URL(gas);u.searchParams.set('action',legacy.has(kind)?'historyGetMonthData':'historyGetArchivedModuleMonth');
      u.searchParams.set('type',kind);u.searchParams.set('month',month);
      if(!legacy.has(kind)){u.searchParams.set('page',String(nextPage||1));u.searchParams.set('pageSize','100');}
      u.searchParams.set('gcToken',token);u.searchParams.set('token',token);u.searchParams.set('_',String(Date.now()));
      const response=await fetch(u.toString(),{cache:'no-store',redirect:'follow'});
      let data=await response.json();
      if(serial!==generation)return;
      if(!data.ok)throw new Error(data.error||'雲端歷史資料讀取失敗');
      if(kind==='schedule'&&Array.isArray(data.schedules)&&!data.schedules.length){
        const fallback=new URL(gas);
        fallback.searchParams.set('action','historyGetProvisionalScheduleMonth');
        fallback.searchParams.set('type','schedule');fallback.searchParams.set('month',month);
        fallback.searchParams.set('token',token);fallback.searchParams.set('gcToken',token);
        fallback.searchParams.set('_',String(Date.now()));
        const response=await fetch(fallback.toString(),{cache:'no-store',redirect:'follow'});
        const candidate=await response.json();
        if(serial!==generation)return;
        if(!candidate.ok||!candidate.provisional||candidate.month!==month)
          throw new Error(candidate.error||'沒有可用的歷史排班，不能以零筆代替');
        data=candidate;
      }
      const result=legacy.has(kind)?rowsFromLegacy(kind,data):data;
      if(data.provisional===true){
        result.archiveStatus=data.archiveStatus||'備援資料（未核對月底異動）';
        result.sourceUrl=data.sourceUrl||'';
      }
      if(!legacy.has(kind)){result.page=data.page;result.pageSize=data.pageSize;result.hasMore=data.hasMore;}
      else{result.page=1;result.pageSize=result.totalRows;result.hasMore=false;result.sourceLabel=data.sourceLabel;}
      page=nextPage||1;renderTable(result,month);
    }catch(error){
      if(serial!==generation)return;
      panel.textContent=month+' 歷史資料無法讀取：'+String(error.message||error)+'。原系統當期資料未變動。';
    }
  }
  selector.addEventListener('change',()=>load(1));
  if(archiveMonth(selector.value)&&archiveMonth(selector.value)<taiwanMonth())load(1);
  return {reload:()=>load(1)};
}
w.P79HistoryMonthInline={enhance,archiveMonth,taiwanMonth,rowsFromLegacy};
})(window,document);

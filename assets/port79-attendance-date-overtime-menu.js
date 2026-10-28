/* 考勤日期右鍵報表：原頁內開啟既有加班申報表，保留考勤查詢與篩選狀態。 */
(function(){
 'use strict';
 let menu;

 // 「已查核」只表示人工看過此日期，不代表正式申報；不寫入考勤、班表或加班資料。
 // 目前使用同一瀏覽器的 localStorage 保存，避免用正式雲端申報欄位假冒查核紀錄。
 const reviewKey='p79.attendance.date.reviewed.v1';
 const dateValid=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
 function loadReviews(){
  try{
   const values=JSON.parse(window.localStorage?.getItem(reviewKey)||'[]');
   return new Set(Array.isArray(values)?values.filter(dateValid).slice(-1500):[]);
  }catch(_){return new Set();}
 }
 let reviewed=loadReviews();
 function saveReviews(next){
  try{
   if(!window.localStorage)return false;
   window.localStorage.setItem(reviewKey,JSON.stringify([...next].sort()));
   return true;
  }catch(_){return false;}
 }
 function paintReviews(){
  if(!document.head?.appendChild)return;
  let style=document.getElementById?.('p79AttendanceReviewedDateStyle');
  if(!style){
   style=document.createElement('style');
   style.id='p79AttendanceReviewedDateStyle';
   document.head.appendChild(style);
  }
  // 用日期選擇器套用白色，不依賴按鈕是否被重新渲染，亦不反覆掃描考勤表。
  style.textContent=[...reviewed].filter(dateValid).map(date=>
   '#p79AttendanceDateStrip [data-p79-attendance-date="'+date+'"]'+
   '{background-color:#fff!important;color:#334155!important;border-color:#64748b!important;box-shadow:inset 0 0 0 1px #64748b!important;}'+
   '#p79AttendanceDateStrip [data-p79-attendance-date="'+date+'"]::after'+
   '{content:" ✓";color:#166534;font-weight:900;}'
  ).join('\n');
 }
 function changeReviewed(date,wantReviewed){
  if(!dateValid(date))return false;
  const next=new Set(reviewed);
  if(wantReviewed)next.add(date);else next.delete(date);
  if(!saveReviews(next)){
   alert('無法儲存已查核日期：請確認瀏覽器允許本站使用本機儲存空間。');
   return false;
  }
  reviewed=next;paintReviews();
  return true;
 }
 paintReviews();
 window.addEventListener('storage',function(event){
  if(event.key===reviewKey){reviewed=loadReviews();paintReviews();}
 });
 function close(){if(menu){menu.remove();menu=null;}}
 function openReportHere(date){
  if(document.getElementById('p79AttendanceOvertimeReportHost'))return;
  const host=document.createElement('dialog');
  host.id='p79AttendanceOvertimeReportHost';
  host.setAttribute('aria-label','加班申報表');
  host.style.cssText='width:min(1250px,calc(100vw - 18px));height:min(94dvh,960px);max-width:none;max-height:none;box-sizing:border-box;padding:0;border:1px solid #cbd5e1;border-radius:14px;background:white;box-shadow:0 22px 65px #0f172a55;overflow:hidden';
  const title=document.createElement('div');
  title.style.cssText='position:absolute;top:8px;left:12px;z-index:2;font:600 13px system-ui,sans-serif;color:#475569;pointer-events:none';
  title.textContent='考勤系統　／　'+date+' 加班申報表';
  const exit=document.createElement('button');
  exit.type='button';exit.textContent='✕ 關閉報表';
  exit.style.cssText='position:absolute;right:10px;top:7px;z-index:3;border:1px solid #cbd5e1;border-radius:8px;padding:6px 10px;background:white;color:#334155;cursor:pointer;font:600 12px system-ui,sans-serif';
  exit.addEventListener('click',()=>host.close());
  const frame=document.createElement('iframe');
  frame.title=date+' 加班申報表';
  frame.style.cssText='display:block;width:100%;height:100%;border:0;visibility:hidden;background:#fff';
  // 沿用原加班申報表及其雲端權限與計算，僅嵌入本頁；不修改出勤或跳轉考勤頁面。
  const url=new URL('../work-hours/',location.href);
  url.searchParams.set('overtimeExportDate',date);
  frame.src=url.toString();
  const status=document.createElement('div');
  status.style.cssText='position:absolute;inset:0;display:grid;place-items:center;background:#f8fafc;color:#475569;font:600 15px system-ui,sans-serif;padding:32px;text-align:center';
  status.textContent='正在開啟加班申報表…';
  let observer=null,opened=false;
  frame.addEventListener('load',()=>{
   try{
    const doc=frame.contentDocument;
    if(!doc?.body)throw Error('無法讀取內嵌申報表');
    // 工作時數系統在背景提供原申報資料，畫面只顯示正式報表視窗。
    const style=doc.createElement('style');
    style.textContent='body > :not(#p79OvertimeApplication){visibility:hidden!important}#p79OvertimeApplication{visibility:visible!important}';
    doc.head.appendChild(style);
    const check=()=>{
     const report=doc.getElementById('p79OvertimeApplication');
     if(report?.open){
      opened=true;frame.style.visibility='visible';status.hidden=true;status.style.display='none';
     }else if(opened&&!report&&host.isConnected){host.close();}
    };
    observer?.disconnect();
    observer=new MutationObserver(check);
    observer.observe(doc.body,{childList:true});
    check();
   }catch(_){
    status.textContent='無法在目前畫面載入加班申報表，請關閉後重新登入或再試一次。';
   }
  });
  frame.addEventListener('error',()=>{status.textContent='加班申報表載入失敗，請關閉後再試一次。';});
  host.append(frame,status,title,exit);
  host.addEventListener('close',()=>{observer?.disconnect();frame.src='about:blank';host.remove();});
  document.body.appendChild(host);host.showModal();
  setTimeout(()=>{if(host.isConnected&&!opened)status.textContent='申報表尚未開啟，請確認登入權限，或關閉後再試一次。';},45000);
 }
 document.addEventListener('contextmenu',function(event){
  const button=event.target.closest?.('#p79AttendanceDateStrip [data-p79-attendance-date]');
  if(!button)return;
  const date=button.getAttribute('data-p79-attendance-date');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return;
  event.preventDefault();event.stopPropagation();close();
  menu=document.createElement('div');menu.id='p79AttendanceDateOvertimeMenu';
  menu.style.cssText='position:fixed;z-index:2147483000;min-width:230px;padding:6px;background:white;color:#0f172a;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 12px 32px #0003;font:600 13px system-ui,sans-serif';
  const header=document.createElement('div');header.textContent=date+'　考勤日期';header.style.cssText='padding:8px 10px;color:#64748b;font-size:12px';
  const review=document.createElement('button');review.type='button';
  const isReviewed=reviewed.has(date);
  review.textContent=isReviewed?'↩ 取消已查核｜恢復日期原色':'☑ 已查核｜日期變白色';
  review.style.cssText='width:100%;padding:10px;text-align:left;background:#f1f5f9;border:0;border-radius:8px;color:#334155;font:inherit;cursor:pointer;margin-bottom:5px';
  review.title='人工查核標記，只存在本瀏覽器，不會修改正式雲端申報或考勤';
  review.addEventListener('click',function(){
   close();
   changeReviewed(date,!isReviewed);
  });
  const reported=document.createElement('button');reported.type='button';
  reported.textContent='✅ 已申報｜查看當日正式紀錄';
  reported.style.cssText='width:100%;padding:10px;text-align:left;background:#dcfce7;border:0;border-radius:8px;color:#166534;font:inherit;cursor:pointer;margin-bottom:5px';
  reported.title='只讀取雲端正式有效申報；不是手動變更此日狀態';
  reported.addEventListener('click',function(){
   close();
   if(typeof window.P79AttendanceOvertimeExport?.openReported==='function')
    void window.P79AttendanceOvertimeExport.openReported(date);
   else alert('正式申報查詢功能尚未載入，請重新整理考勤頁。');
  });
  const item=document.createElement('button');item.type='button';item.textContent='🖨️ 列印／匯出當日加班申報表';
  item.style.cssText='width:100%;padding:10px;text-align:left;background:#e0f2fe;border:0;border-radius:8px;color:#075985;font:inherit;cursor:pointer';
  item.addEventListener('click',function(){close();openReportHere(date);});
  menu.append(header,review,reported,item);document.body.appendChild(menu);
  menu.style.left=Math.max(8,Math.min(event.clientX,innerWidth-menu.offsetWidth-8))+'px';
  menu.style.top=Math.max(8,Math.min(event.clientY,innerHeight-menu.offsetHeight-8))+'px';
 },true);
 document.addEventListener('click',function(event){if(!event.target.closest?.('#p79AttendanceDateOvertimeMenu'))close();},true);
 document.addEventListener('keydown',function(event){if(event.key==='Escape')close();});
 window.addEventListener('scroll',close,true);
})();

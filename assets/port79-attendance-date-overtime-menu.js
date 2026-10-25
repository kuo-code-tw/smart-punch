(function(){
 'use strict';
 let menu;
 function close(){if(menu){menu.remove();menu=null;}}
 document.addEventListener('contextmenu',function(event){
  const button=event.target.closest?.('#p79AttendanceDateStrip [data-p79-attendance-date]');
  if(!button)return;
  const date=button.getAttribute('data-p79-attendance-date');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return;
  event.preventDefault();event.stopPropagation();close();
  menu=document.createElement('div');menu.id='p79AttendanceDateOvertimeMenu';
  menu.style.cssText='position:fixed;z-index:2147483000;min-width:230px;padding:6px;background:white;color:#0f172a;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 12px 32px #0003;font:600 13px system-ui,sans-serif';
  const header=document.createElement('div');header.textContent=date+'　考勤日期';header.style.cssText='padding:8px 10px;color:#64748b;font-size:12px';
  const item=document.createElement('button');item.type='button';item.textContent='📥 匯出當日加班明細（含已匯出紀錄）';
  item.style.cssText='width:100%;padding:10px;text-align:left;background:#e0f2fe;border:0;border-radius:8px;color:#075985;font:inherit;cursor:pointer';
  item.addEventListener('click',function(){
   close();const url=new URL('../work-hours/',location.href);
   url.searchParams.set('overtimeExportDate',date);location.assign(url.toString());
  });
  menu.append(header,item);document.body.appendChild(menu);
  menu.style.left=Math.max(8,Math.min(event.clientX,innerWidth-menu.offsetWidth-8))+'px';
  menu.style.top=Math.max(8,Math.min(event.clientY,innerHeight-menu.offsetHeight-8))+'px';
 },true);
 document.addEventListener('click',function(event){if(!event.target.closest?.('#p79AttendanceDateOvertimeMenu'))close();},true);
 document.addEventListener('keydown',function(event){if(event.key==='Escape')close();});
 window.addEventListener('scroll',close,true);
})();

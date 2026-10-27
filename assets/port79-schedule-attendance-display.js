(function(g){
'use strict';
// A read-only marker for actual attendance across every employee and company.
function resolve({state='',shift='',approvedLeave=false}={}){
 const code=String(shift||'').trim();
 const rest=/^(休|例|國)(?=$|[0-9]{1,2}(?::[0-9]{2})?[-–][0-9]{1,2}(?::[0-9]{2})?$)/.test(code);
 const worked=state==='worked',pending=state==='missing';
 const level=worked?'worked':pending?'pending':'';
 const label=worked?(rest?'休假日有出勤':'已出勤'):(pending?'打卡待核':'');
 const tooltip=worked
  ?(rest?'已核對完整上下班打卡：原排班 '+code+' 保留，實際出勤另列；此日不列已休天數。正式加班仍須依申報核對。':'已核對完整上下班打卡；正式排班不因打卡被覆寫。')
  :(pending?'有單邊打卡或跨日配對待核；不視為已確認出勤，不自動改班或扣除休假額度。':'');
 return {worked,pending,rest,level,label,tooltip,excludeRestCount:worked&&rest&&!approvedLeave};
}
g.P79ScheduleAttendanceDisplay={resolve};
})(window);

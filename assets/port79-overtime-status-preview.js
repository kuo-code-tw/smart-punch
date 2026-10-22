(function(g){
'use strict';
const labels={reported:'已申報',review:'休假超額・待核對',revoked:'休假超額・已撤銷'};
function status(row){
 const audit=row.revocation;
 if(audit?.confirmed===true&&audit.reportId===row.id&&audit.reason==='休假超額'&&audit.actor&&audit.at)return 'revoked';
 if(['例','休','國'].includes(row.category)&&Number(row.excessDays)>0)return 'review';
 return 'reported';
}
function filter(rows,query={}){
 const name=String(query.name||'').trim().toLowerCase();
 return rows.filter(row=>(!query.status||status(row)===query.status)&&(!query.category||row.category===query.category)&&(!query.month||row.date.slice(0,7)===query.month)&&(!name||[row.name,row.empId].some(v=>String(v||'').toLowerCase().includes(name))));
}
function counts(rows){const result={all:rows.length,reported:0,review:0,revoked:0};rows.forEach(row=>result[status(row)]++);return result;}
async function revoke(row,send){
 if(status(row)!=='review')throw Error('僅能撤銷待核對的申報');
 const receipt=await send({reportId:row.id,date:row.date,empId:row.empId,reason:'休假超額'});
 if(receipt?.ok!==true||receipt.confirmed!==true||receipt.reportId!==row.id||receipt.reason!=='休假超額'||!receipt.actor||!receipt.at)throw Error('撤銷尚未確認，原申報及狀態保留');
 return {...row,revocation:{confirmed:true,reportId:receipt.reportId,reason:receipt.reason,actor:receipt.actor,at:receipt.at}};
}
function apply(rows,revoked){
 const previous=rows.find(r=>r.id===revoked.id);
 if(!previous||status(previous)!=='review'||status(revoked)!=='revoked')throw Error('沒有已確認的撤銷結果');
 return rows.map(row=>{
  const r=row.id===revoked.id?revoked:row;
  return r.empId===previous.empId&&r.date.slice(0,7)===previous.date.slice(0,7)&&r.category===previous.category?{...r,excessDays:Math.max(0,Number(r.excessDays)-1)}:r;
 });
}
g.P79OvertimeStatusPreview={labels,status,filter,counts,revoke,apply};
})(window);

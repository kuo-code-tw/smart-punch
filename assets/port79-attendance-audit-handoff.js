/* Home audit -> the real attendance-management screen. Never duplicate its write path. */
(function(root){
'use strict';
const KEY='port79_attendance_audit_handoff_v1';
const LIMIT_MS=120000;
const norm=v=>String(v??'').trim().toUpperCase();
const normAtt=v=>norm(v).replace(/^0+/,'')||norm(v);
const clock=v=>String(v||'').trim().replace(/-/g,'/');
const dateKey=v=>String(v||'').replace(/\//g,'-').slice(0,10);
let pending=null,busy=false,tries=0,watch=null;
function read(){
 try{
  const data=JSON.parse(root.sessionStorage.getItem(KEY)||'null');
  if(!data||data.source!=='home-early-audit'||!['IN','OUT'].includes(data.side)||
    !Number.isFinite(data.createdAt)||Date.now()-data.createdAt>LIMIT_MS||
    Date.now()<data.createdAt-60000){root.sessionStorage.removeItem(KEY);return null;}
  return data;
 }catch(_){return null;}
}
function clear(){try{root.sessionStorage.removeItem(KEY);}catch(_){}}
function notice(message){
 try{if(typeof root.showToast==='function')root.showToast(message,'warning');
 else if(typeof showToast==='function')showToast(message,'warning');
 else console.warn('[PORT79] '+message);}catch(_){}
}
function matchingIdentity(r,p){
 const a=norm(p.empId),b=norm(r.empId),x=normAtt(p.attNo),y=normAtt(r.attNo);
 const n=norm(p.name).replace(/\s+/g,''),m=norm(r.name).replace(/\s+/g,'');
 if(a&&b&&a!==b)return false;
 if(x&&y&&x!==y)return false;
 if(n&&m&&n!==m)return false;
 return !!((a&&b)||(x&&y)||(n&&m));
}
function recordType(r){
 if(typeof root.getAttendanceRecordType==='function')return root.getAttendanceRecordType(r);
 if(typeof getAttendanceRecordType==='function')return getAttendanceRecordType(r);
 const status=String(r.status||'');
 return status==='上班簽到'||status==='加班上班'?'IN':status==='下班簽退'||status==='加班下班'?'OUT':'';
}
function availableRecords(){
 try{
  if(typeof records!=='undefined'&&Array.isArray(records))return records;
  if(Array.isArray(root.records))return root.records;
 }catch(_){}
 return null;
}
function dayAfter(date){
 const ms=Date.parse(dateKey(date)+'T00:00:00Z');
 return Number.isFinite(ms)?new Date(ms+86400000).toISOString().slice(0,10):dateKey(date);
}
function fail(message){
 pending=null;clear();if(watch){root.clearInterval(watch);watch=null;}
 notice(message+'；請在目前的考勤管理原始列表手動確認，系統沒有新增或修改任何卡。');
}
async function openOriginal(){
 if(busy||!pending)return false;
 const p=pending,d=root.document;
 const edit=typeof root.openEditRecordModal==='function'?root.openEditRecordModal:
   (typeof openEditRecordModal==='function'?openEditRecordModal:null);
 const add=typeof root.openRowManualAdd==='function'?root.openRowManualAdd:
   (typeof openRowManualAdd==='function'?openRowManualAdd:null);
 if(!d?.getElementById('viewAdmin')||!edit||!add)return false;
 if(typeof isAdminLoggedIn!=='undefined'&&!isAdminLoggedIn)return false;
 const rows=availableRecords();
 if(!rows)return false;
 const matches=Array.isArray(p.side==='IN'?p.clockInEvents:p.clockOutEvents)?
   (p.side==='IN'?p.clockInEvents:p.clockOutEvents):[];
 if(matches.length>1){fail('此班同側有多筆打卡，無法唯一確認要修改哪一筆');return true;}
 if(matches.length===1&&!String(matches[0]?.id||'')){fail('原始紀錄缺少可驗證編號');return true;}
 let source=null;
 if(matches.length===1){
  const ev=matches[0];
  const found=rows.filter(r=>norm(r.id)===norm(ev.id)&&clock(r.timeStr)===clock(ev.timeStr)&&
    recordType(r)===p.side&&matchingIdentity(r,p));
  if(found.length>1){fail('正式考勤中有重複的原始紀錄編號');return true;}
  if(!found.length)return false;
  source=found[0];
 }else{
  const opposite=p.side==='IN'?p.clockOutEvents:p.clockInEvents;
  const anchor=Array.isArray(opposite)&&opposite.length===1?opposite[0]:null;
  if(Array.isArray(opposite)&&opposite.length>1){fail('有多筆原班次配對卡，不能自動決定補卡目標');return true;}
  if(anchor?.id){
   const other=rows.filter(r=>norm(r.id)===norm(anchor.id)&&clock(r.timeStr)===clock(anchor.timeStr)&&
    recordType(r)===(p.side==='IN'?'OUT':'IN')&&matchingIdentity(r,p));
   if(other.length>1){fail('補卡配對目標有重複紀錄');return true;}
   if(!other.length)return false;
  }
  const base=dateKey(p.date),next=dayAfter(base);
  if(rows.some(r=>matchingIdentity(r,p)&&recordType(r)===p.side&&[base,next].includes(dateKey(r.timeStr)))){
   fail('同一人同日的正式考勤已有此側打卡，避免重複補卡');return true;
  }
 }
 busy=true;pending=null;clear();
 if(watch){root.clearInterval(watch);watch=null;}
 try{
  if(source)await edit(source.id,p.side,source.timeStr,
   {empId:p.empId,attNo:p.attNo,name:p.name},null,true);
  else{
   const opposite=p.side==='IN'?p.clockOutEvents:p.clockInEvents;
   const anchor=Array.isArray(opposite)&&opposite.length===1?opposite[0]:null;
   const date=p.shift==='晚'&&!anchor?dayAfter(p.date):dateKey(p.date);
   await add(encodeURIComponent(p.empId||p.attNo||p.name||''),encodeURIComponent(date),
    p.side==='IN'?'上班簽到':'下班簽退',encodeURIComponent(anchor?.id||''),
    encodeURIComponent(p.attNo||''),encodeURIComponent(p.name||''),
    encodeURIComponent(anchor?.timeStr||''));
  }
 }catch(error){notice('無法開啟原本的考勤表單：'+String(error?.message||error));}
 finally{busy=false;}
 return true;
}
function start(){
 pending=read();if(!pending)return;
 const tick=()=>{
  if(!pending)return;
  if(++tries>150){fail('考勤管理尚未載入這筆正式資料，不能冒險自動選錯');return;}
  void openOriginal();
 };
 watch=root.setInterval(tick,400);tick();
}
if(root.document?.readyState==='complete')start();
else root.addEventListener('load',start,{once:true});
if(typeof module==='object'&&module.exports)module.exports={read,matchingIdentity,recordType,openOriginal};
})(typeof window!=='undefined'?window:globalThis);

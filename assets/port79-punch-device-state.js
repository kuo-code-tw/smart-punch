(function(g){
'use strict';
let pending=null;
const id=x=>String(x||'').trim().toUpperCase();
async function read(employee){
 const empId=id(employee?.empId),endpoint=getActiveGasUrl(),session=sessionStorage.getItem('port79_user_session')||'';
 let user=null;try{user=JSON.parse(session||'null');}catch(_){}
 const token=(String(user?.adminRole||user?.role||'').toLowerCase()==='employee'?sessionStorage.getItem('port79_user_token'):'')||getAttendanceEmployeeMasterToken();
 const same=()=>id(currentEmp?.empId)===empId&&getActiveGasUrl()===endpoint;
 if(!empId)throw Error('員工登入資料尚未就緒，請重新登入');
 const key=[empId,endpoint,token].join('|');if(pending?.key===key)return pending.promise;
 const entry={key};entry.promise=(async()=>{
  let tk=token;
  const fetchMaster=async()=>{const url=new URL(endpoint);url.searchParams.set('action','getAttendanceEmployeeMaster');url.searchParams.set('token',tk);url.searchParams.set('fresh','1');url.searchParams.set('t',String(Date.now()));return fetchGasJsonWithRetry(url.toString(),'本人手機綁定狀態',1,12000);};
  let data=tk?await fetchMaster():{ok:false,error:'登入 Token 已逾時'};
  if(!same()||sessionStorage.getItem('port79_user_session')!==session)throw Error('登入身分已變更，請重試');
  if(!data?.ok&&/登入驗證(?:資料不存在|已逾時|資料失效)|登入 Token 已逾時/.test(String(data?.error||''))){
   const user=JSON.parse(session||'null');
   if(id(user?.empId)!==empId||String(user?.adminRole||user?.role||'').toLowerCase()!=='employee')throw Error(data.error);
   const url=new URL(endpoint);url.searchParams.set('action','verifyUser');url.searchParams.set('loginMode','punch');url.searchParams.set('empId',empId);url.searchParams.set('t',String(Date.now()));
   const renewed=await fetchGasJsonWithRetry(url.toString(),'員工打卡登入更新',1,12000);
   if(!same()||sessionStorage.getItem('port79_user_session')!==session)throw Error('登入身分已變更，請重試');
   if(!renewed?.ok||id(renewed.empId)!==empId||renewed.punchOnly!==true||String(renewed.adminRole||'').toLowerCase()!=='employee'||!String(renewed.userToken||'').trim())throw Error(renewed?.error||'本人登入核對未完成');
   tk=String(renewed.userToken);sessionStorage.setItem('port79_user_token',tk);data=await fetchMaster();
  }
  if(!same()||sessionStorage.getItem('port79_user_session')!==session)throw Error('登入身分已變更，請重試');
  if(!data?.ok||!Array.isArray(data.employees))throw Error(data?.error||'本人手機綁定狀態未讀取完成');
  const matches=data.employees.filter(e=>id(e?.empId)===empId);
  if(matches.length!==1||!Object.prototype.hasOwnProperty.call(matches[0],'deviceId')||typeof matches[0].deviceId!=='string')throw Error('雲端未回傳完整手機綁定狀態');
  const master=matches[0];if(/^(resigned|terminated|inactive|disabled|離職|停用)$/i.test(String(master.employmentStatus||'').trim()))throw Error('此員工帳號目前無法打卡，請聯絡管理員');
  return {...master};
 })();pending=entry;
 try{return await entry.promise;}finally{if(pending===entry)pending=null;}
}
g.P79PunchDeviceState={read};
})(window);

(function(g){
'use strict';
function failure(kind,message,retryable){const e=new Error(message);e.kind=kind;e.retryable=retryable===true;return e;}
function invalidResponse(text,status){
 if(status===401||status===403||/accounts\.google\.com|ServiceLogin|signin\/|authorization is required|登入您的 Google|Sign in with Google/i.test(text))return failure('access','雲端回傳登入或授權頁，沒有取得歷史資料；請確認登入及雲端服務存取設定。',false);
 if(status===404||/Script function not found|找不到指令碼函式/i.test(text))return failure('deployment','歷史資料服務入口不存在，請確認正式部署版本與連線網址。',false);
 return failure('service','雲端暫時回傳錯誤網頁，未取得完整歷史資料；請稍後重新讀取。',true);
}
async function read(url,options){
 const opt=options||{},request=opt.fetch||g.fetch.bind(g),timeout=opt.timeoutMs||90000,forceCloud=opt.forceCloud===true;
 if(!forceCloud&&g.Port79DataCache?.getHistoryPreview){
  const cached=await Promise.race([g.Port79DataCache.getHistoryPreview(url).catch(()=>null),new Promise(resolve=>setTimeout(()=>resolve(null),150))]);
  if(cached)return cached;
 }
 for(let attempt=0;attempt<2;attempt++){
  const controller=forceCloud?new AbortController():null;let timer=0;
  try{
   const target=new URL(url);target.searchParams.set('_',Date.now()+'-'+attempt);
   const init={method:'GET',cache:forceCloud?'no-store':'default',redirect:'follow'};
   if(controller)init.signal=controller.signal;
   const operation=(async()=>{
    const response=await request(target.toString(),init);
    const body=(await response.text()).replace(/^\uFEFF/,'').trim();let data;
    try{data=JSON.parse(body);}catch(ignore){throw invalidResponse(body,response.status);}
    if(!data||typeof data!=='object'||Array.isArray(data))throw failure('format','雲端未回傳完整的歷史資料，請重新讀取。',true);
    if(data.ok!==true)throw failure('api',String(data.error||'雲端讀取失敗'),false);
    if(!response.ok)throw invalidResponse('',response.status);
    return data;
   })();
   const timedOut=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller?.abort();reject(failure('timeout','歷史資料讀取逾時，尚未取得完整資料；請稍後重新讀取。',false));},timeout)});
   return await Promise.race([operation,timedOut]);
  }catch(error){
   if(controller?.signal.aborted||error?.name==='AbortError'||error?.kind==='timeout')throw failure('timeout','歷史資料讀取逾時，尚未取得完整資料；請稍後重新讀取。',false);
   const known=typeof error?.retryable==='boolean',problem=known?error:failure('network','歷史資料連線中斷，請確認網路後重新讀取。',true);
   if(attempt===0&&problem.retryable)continue;
   throw problem;
  }finally{clearTimeout(timer);}
 }
}
g.P79HistoryRead={read};
})(window);

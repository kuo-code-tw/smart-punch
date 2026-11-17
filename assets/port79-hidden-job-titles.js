/* Official read-only hidden-job-title policy shared by management selectors.
 * HR owns hrOrgOptionsV2.hiddenJobTitles; never infer it from employee records.
 * Fail closed when official config cannot be verified: no stale all-title list. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.Port79JobTitleVisibility=api;
})(typeof window==='undefined'?null:window,function(){
 'use strict';
 const state={status:'idle',keys:new Set(),revision:0,endpoint:'',identity:'',updated:0,pending:null};
 const key=value=>String(value??'').normalize('NFKC').replace(/[\s\/_-]+/g,'').toUpperCase();
 function hiddenFromConfig(config){
  if(!config||typeof config!=='object')throw Error('人資組織設定格式錯誤');
  const legacy=config.hrOrgOptionsV1,extended=config.hrOrgOptionsV2;
  if(!legacy&&!extended&&!Array.isArray(config.jobTitles))throw Error('未取得正式人資職稱設定');
  if(extended!=null&&typeof extended!=='object')throw Error('人資職稱設定格式錯誤');
  const hidden=extended?.hiddenJobTitles;
  if(hidden!==undefined&&!Array.isArray(hidden))throw Error('隱藏職稱設定格式錯誤');
  return [...new Set((hidden||[]).map(key).filter(Boolean))];
 }
 function ready(){return state.status==='ready';}
 function isHidden(title){return !ready()||state.keys.has(key(title));}
 function isVisible(title){return ready()&&!state.keys.has(key(title));}
 function status(){return state.status;}
 function revision(){return state.revision;}
 async function load({gasUrl,token,force=false,timeoutMs=16000}={}){
  const endpoint=String(gasUrl||'').trim(),identity=String(token||'').trim();
  if(!endpoint||!identity)throw Error('缺少正式雲端登入資訊，職稱選單暫不開放');
  const changed=endpoint!==state.endpoint||identity!==state.identity;
  if(changed){state.endpoint=endpoint;state.identity=identity;state.status='idle';state.keys=new Set();state.updated=0;state.revision++;}
  if(!force&&ready()&&Date.now()-state.updated<45000)return true;
  if(state.pending)return state.pending;
  state.status='loading';state.keys=new Set();state.revision++;
  const controller=typeof AbortController!=='undefined'?new AbortController():null;
  const query=endpoint+'?action=hrGetOrgOptions&token='+encodeURIComponent(identity)+'&t='+Date.now();
  const task=(async()=>{
   let timer=null;
   try{
    if(controller)timer=setTimeout(()=>controller.abort(),timeoutMs);
    const response=await fetch(query,{method:'GET',cache:'no-store',redirect:'follow',signal:controller?.signal});
    if(!response.ok)throw Error('人資職稱設定讀取 HTTP '+response.status);
    const data=await response.json();
    if(data?.ok!==true)throw Error(String(data?.error||'無權讀取人資職稱設定'));
    const list=hiddenFromConfig(data.config);
    if(endpoint===state.endpoint&&identity===state.identity){
     state.keys=new Set(list);state.status='ready';state.updated=Date.now();state.revision++;
    }
    return true;
   }catch(error){
    if(endpoint===state.endpoint&&identity===state.identity){
     state.keys=new Set();state.status='error';state.updated=0;state.revision++;
    }
    throw error;
   }finally{if(timer!==null)clearTimeout(timer);}
  })();
  state.pending=task;
  try{return await task}finally{if(state.pending===task)state.pending=null;}
 }
 return{key,hiddenFromConfig,ready,isHidden,isVisible,status,revision,load};
});

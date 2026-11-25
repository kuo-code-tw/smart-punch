/* Persistent, account-scoped local outbox for existing planned overtime reviews.
 * No credentials on disk. Never replay an uncertain POST. */
(function(g){
 'use strict';
 if(g.P79OvertimeUploadQueue)return;
 const d=g.document,PREFIX='p79_overtime_review_outbox_v1:';
 let running=false,panel=null,notice='',scheduled=false;
 const labels={queued:'等待上傳',checking:'核對正式資料',writing:'寫入雲端',confirming:'確認儲存結果',done:'正式儲存成功',failed:'尚未寫入／待處理',review:'寫入結果待核對'};
 const activeStates=new Set(['queued','checking','writing','confirming']);
 function identity(){
  try{
   const c=g.p79OvertimeContext,x=c?.uploadIdentity?.(),token=c?.token?.(),url=c?.gasUrl?.();
   if(!x?.owner||!token||!url||!c.canReport?.()||!g.navigator?.locks?.request)return null;
   return {owner:x.owner,scope:x.scope,url,token,prefix:PREFIX+encodeURIComponent(JSON.stringify([x.owner,x.scope,url]))+':'};
  }catch(_){return null;}
 }
 function same(s){const x=identity();return !!x&&x.prefix===s.prefix&&x.token===s.token;}
 function parse(k){try{return JSON.parse(g.localStorage.getItem(k)||'null');}catch(_){return null;}}
 function list(s){
  if(!s)return [];
  const rows=[];for(let i=0;i<g.localStorage.length;i++){const k=g.localStorage.key(i);if(k?.startsWith(s.prefix)){const r=parse(k);if(r&&r.key===k)rows.push(r);}}
  return rows.sort((a,b)=>a.createdAt-b.createdAt);
 }
 function put(row){g.localStorage.setItem(row.key,JSON.stringify(row));}
 function update(row,state,detail=''){
  row={...row,state,detail:String(detail).slice(0,240),updatedAt:Date.now(),posted:row.posted===true||state==='writing'||state==='confirming'};
  put(row);paint();return row;
 }
 function cleanup(s){
  const done=list(s).filter(r=>r.state==='done');
  for(const row of done.slice(0,Math.max(0,done.length-12)))g.localStorage.removeItem(row.key);
 }
 function add(tag,text,parent){const el=d.createElement(tag);if(text)el.textContent=text;if(parent)parent.appendChild(el);return el;}
 function button(text,fn,parent){const b=add('button',text,parent);b.type='button';b.style.cssText='border:1px solid #a8c4de;background:white;color:#17466f;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer';b.onclick=fn;return b;}
 function ensurePanel(){
  if(panel)return panel;
  panel=add('aside','',d.body);panel.id='p79OvertimeUploadPanel';
  panel.style.cssText='position:fixed;right:16px;bottom:108px;width:min(350px,calc(100vw - 32px));max-height:55vh;overflow:auto;z-index:12990;padding:12px;border:1px solid #9bbbd8;border-radius:13px;box-shadow:0 5px 24px #143a5a29;background:#f5faff;color:#15334e;font:13px/1.5 system-ui,"Microsoft JhengHei",sans-serif';
  panel.setAttribute('aria-label','加班背景上傳');return panel;
 }
 function paint(){
  if(!d.body)return;
  let s,rows;try{s=identity();rows=list(s);}catch(_){return;}
  if(!s||!rows.length){if(panel)panel.hidden=true;return;}
  const p=ensurePanel(),done=rows.filter(r=>r.state==='done').length,failed=rows.filter(r=>['failed','review'].includes(r.state)).length,active=rows.find(r=>['checking','writing','confirming'].includes(r.state));
  p.hidden=false;p.replaceChildren();
  const heading=add('strong','加班背景上傳｜'+(active?'處理中':failed?'有待核對項目':done===rows.length?'已完成':'等待上傳'),p);
  heading.style.fontSize='14px';
  add('div','正式完成 '+done+'/'+rows.length+' 筆'+(failed?'｜待處理 '+failed+' 筆':''),p);
  const bar=add('progress','',p);bar.max=rows.length;bar.value=done;bar.style.cssText='width:100%;height:8px;accent-color:#1984dc';
  for(const row of [...rows.filter(r=>r.state!=='done'),...rows.filter(r=>r.state==='done').slice(-3)]){
   const line=add('div','',p);line.style.cssText='border-top:1px solid #d6e5f3;padding:6px 0;display:flex;gap:6px;align-items:flex-start';
   const copy=add('div','',line);copy.style.flex='1';
   add('div',row.empId+'｜'+row.date+'｜'+(labels[row.state]||row.state),copy);
   if(row.detail)add('small',row.detail,copy).style.color=row.state==='failed'||row.state==='review'?'#9c3b22':'#375d7a';
   if(row.state==='failed')button('重試核對',()=>void action(row.key,'retry'),line);
   if(row.state==='review')button('讀回核對',()=>void action(row.key,'check'),line);
   if(['queued','failed'].includes(row.state))button('取消',()=>void action(row.key,'cancel'),line);
  }
  if(active){
   const stages={checking:1,writing:2,confirming:3};
   add('small','本筆步驟 '+stages[active.state]+'/4｜'+active.detail,p);
   const stepBar=add('progress','',p);stepBar.max=4;stepBar.value=stages[active.state];stepBar.style.cssText='width:100%;height:6px;accent-color:#1984dc';
  }
  if(notice)add('small',notice,p).style.color='#9c3b22';
  add('small','已保存於本機；未收到雲端確認不算正式申報。離開本頁後，下次進入加班管理將接續核對。',p);
  if(done===rows.length)button('關閉完成通知',()=>void action('','clear'),p);
 }
 function announce(row,result,s){
  if(!same(s))return;
  try{g.dispatchEvent(new CustomEvent('p79-overtime-report-saved',{detail:{draft:row.draft,result}}));}catch(_){}
 }
 function finish(row,result,s){
  const next={key:row.key,empId:row.empId,date:row.date,createdAt:row.createdAt,updatedAt:Date.now(),state:'done',posted:true,detail:'雲端已確認原申報編號'};
  put(next);announce(row,result,s);cleanup(s);paint();
 }
 function wake(){if(scheduled)return;scheduled=true;g.setTimeout(()=>{scheduled=false;void drain();},50);}
 async function enqueue(draft){
  const s=identity();if(!s)throw Error('本機上傳佇列尚未取得登入權限，請保留申報視窗');
  const safe=JSON.parse(JSON.stringify(draft));
  if(!safe.id||safe.plannedReview!==true||safe.preventReplace!==true||safe.leaveHandoffId||safe.forEmpId||safe.gasUrl!==s.url||safe.date!==safe.overtimeDate||safe.date!==safe.coverDate)throw Error('此申報不支援本機背景上傳');
  const key=s.prefix+encodeURIComponent(String(safe.id));
  await g.navigator.locks.request(s.prefix+'enqueue',async()=>{
   if(!same(s))throw Error('登入已變更，未保存');
   const prior=parse(key);
   if(prior&&prior.state!=='done')throw Error('此筆已在背景上傳清單，請查看右下角進度，避免重複送出');
   if(list(s).filter(r=>r.state!=='done').length>=50)throw Error('待處理清單已滿，請先核對現有申報');
   // Only after successful synchronous local persistence may the form close.
   put({key,empId:String(safe.empId),date:safe.date,createdAt:Date.now(),state:'queued',posted:false,detail:'已保存電腦，等待雲端',draft:safe});
  });
  notice='';paint();wake();return true;
 }
 async function drain(){
  const s=identity();if(!s||running||g.navigator.onLine===false||!g.P79Overtime?.runQueuedReview)return;
  running=true;
  try{await g.navigator.locks.request(s.prefix+'worker',{ifAvailable:true},async lock=>{
   if(!lock||!same(s))return;
   for(let row of list(s)){
    if(!same(s)||g.navigator.onLine===false)break;
    if(['checking','writing','confirming'].includes(row.state)){
     // If another tab was holding the worker lock, we could not acquire it.
     // Therefore a persisted active state here is an interrupted task.
     row=update(row,row.posted?'review':'queued',row.posted?'上次上傳中斷，僅允許讀回核對':'上次核對中斷，尚未寫入');
    }
    if(row.state!=='queued')continue;
    try{
     row=update(row,'checking','核對加班換算及出勤');
     const draft=JSON.parse(JSON.stringify(row.draft));
     const result=await g.P79Overtime.runQueuedReview(draft,(phase,detail)=>{
      if(!same(s))throw Error('登入已變更');
      row=update(row,phase,detail);
     },()=>same(s));
     if(!same(s))throw Error('登入已變更，結果待核對');
     finish(row,result,s);
    }catch(e){
     const current=parse(row.key)||row;
     update(current,current.posted?'review':'failed',String(e?.message||e));
    }
   }
  });}catch(e){notice=String(e?.message||e);paint();}
  finally{running=false;}
 }
 async function action(key,kind){
  const s=identity();if(!s)return;
  try{await g.navigator.locks.request(s.prefix+'worker',{ifAvailable:true},async lock=>{
   if(!lock||!same(s)){notice='目前正在處理另一筆申報，可繼續操作，完成後再核對此筆。';paint();return;}
   const row=key&&parse(key);
   if(kind==='clear'){for(const r of list(s))if(r.state==='done')g.localStorage.removeItem(r.key);paint();return;}
   if(!row||!key.startsWith(s.prefix))return;
   if(kind==='cancel'&&['queued','failed'].includes(row.state)&&!row.posted&&g.confirm('取消此筆本機待上傳？原正式申報不會更動。'))g.localStorage.removeItem(key);
   if(kind==='retry'&&row.state==='failed'&&!row.posted)update(row,'queued','重新排入核對');
   if(kind==='check'&&row.state==='review'){
    try{const result=await g.P79Overtime.checkQueuedReview(JSON.parse(JSON.stringify(row.draft)),()=>same(s));if(same(s))finish(row,result,s);}
    catch(e){update(row,'review',String(e?.message||e));}
   }
   notice='';paint();
  });}catch(e){notice=String(e?.message||e);paint();}
  wake();
 }
 function boot(){paint();wake();g.addEventListener('online',wake);g.addEventListener('storage',e=>{if(!e.key||e.key.startsWith(PREFIX)){paint();if(e.key)wake();}});g.setInterval(()=>{paint();if(!running){const s=identity();try{if(s&&list(s).some(r=>activeStates.has(r.state)))wake();}catch(_){}}},4000);}
 g.P79OvertimeUploadQueue={available:()=>!!identity(),enqueue};
 if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
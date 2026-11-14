/* All-system backup UI. Only verified server receipts can mark a row complete.
 * Local yard imports are account-scoped and sent only during an explicit backup.
 */
(function(g){
'use strict';
const TYPES=[['personnel','人資'],['attendance','出勤'],['schedule','排班'],['leave','請假'],['overtime','加班'],['workhours','工時'],['efficiency','作業效率'],['vessel','船舶'],['sailing','船期'],['audit','系統稽核'],['gate','碼頭進出站'],['routes','碼頭航線'],['yard','碼頭儲量']];
let busy=false,batch=null,controller=null;
const d=g.document,$=id=>d.getElementById(id);
function session(){try{return JSON.parse(g.sessionStorage.getItem('port79_user_session')||'null');}catch(_){return null;}}
function token(){return String(g.sessionStorage.getItem('port79_user_token')||g.sessionStorage.getItem('port79_admin_token')||'');}
function endpoint(){const raw=String(g.sessionStorage.getItem('port79_gas_url')||'');const url=new URL(raw);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname))throw Error('備份連線網址不正確，請重新登入');return url.href;}
// Highest administrators have history management access on the home page; old login
// sessions omitted history from systemPermissions. Server authorization remains authoritative.
function allowed(s){return !!s&&!s.punchOnly&&String(s.adminRole||s.role||'').toLowerCase()==='superadmin'&&!!token();}
function same(c){try{const s=session();return allowed(s)&&s.empId===c.actor&&token()===c.token&&endpoint()===c.endpoint;}catch(_){return false;}}
function message(text){const n=$('p79AllBackupStatus');if(n)n.textContent=text;}
function link(value){const u=new URL(value);if(u.protocol!=='https:'||!['docs.google.com','drive.google.com'].includes(u.hostname)||!/^\/(spreadsheets\/d|file\/d)\/[A-Za-z0-9_-]+(?:\/|$)/.test(u.pathname))throw Error('備份回傳的檔案連結無法核對');return u.href;}
async function request(c,payload,get){
 if(!same(c))throw Error('登入身分已變更，已停止備份');controller=new AbortController();const abort=controller,timer=g.setTimeout(()=>abort.abort(),180000);
 try{let url=c.endpoint,options={cache:'no-store',redirect:'follow',signal:abort.signal};if(get){const u=new URL(url);u.searchParams.set('action','historyBackupCapabilities');u.searchParams.set('gcToken',c.token);u.searchParams.set('_',Date.now());url=u.href;}else options={...options,method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,action:'historyBackupMonth',backupMode:'all-systems-v1',gcToken:c.token,token:c.token})};
 const res=await g.fetch(url,options);let data;try{data=await res.json();}catch(_){throw Error('雲端沒有回傳備份結果，請檢查正式服務版本');}if(!same(c))throw Error('登入身分已變更，未套用備份結果');if(!res.ok||data?.ok!==true)throw Error(String(data?.error||'雲端備份未完成'));return data;
 }catch(e){if(e.name==='AbortError')throw Error('連線逾時，尚未取得完成確認；重試會先核對先前結果');throw e;}finally{g.clearTimeout(timer);if(controller===abort)controller=null;}
}
async function digest(bytes){const hash=await g.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');}
async function yardSnapshot(actor){
 const suffix=encodeURIComponent(String(actor).slice(0,120));let data=null,capacity={},allowance={};
 try{data=JSON.parse(g.localStorage.getItem('p79_yard_private_v1_'+suffix)||'null');capacity=JSON.parse(g.localStorage.getItem('p79_yard_capacity_overrides_v1_'+suffix)||'{}');allowance=JSON.parse(g.localStorage.getItem('p79_yard_allowed_container_counts_v1_'+suffix)||'{}');}catch(_){throw Error('本機儲量資料無法讀取，請先重新匯入並核對');}
 if(!data)return null;if(!Array.isArray(data.rows)||data.rows.length>3000)throw Error('本機儲量格式不正確，尚未備份');return {rows:data.rows,fileName:String(data.fileName||''),updatedAt:String(data.updatedAt||''),capacity,allowance};
}
function db(){return new Promise((resolve,reject)=>{if(!g.indexedDB)return reject(Error('此瀏覽器不支援原始Excel保存'));const r=g.indexedDB.open('P79YardOriginals',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('imports'))r.result.createObjectStore('imports',{keyPath:'id'});};r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result);});}
async function records(){if(!g.indexedDB)return [];const conn=await db();try{return await new Promise((resolve,reject)=>{const r=conn.transaction('imports','readonly').objectStore('imports').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{conn.close();}}
async function put(record){const conn=await db();try{await new Promise((resolve,reject)=>{const t=conn.transaction('imports','readwrite');t.objectStore('imports').put(record);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('Excel保存中斷'));});}finally{conn.close();}}
async function rememberYardImport(file){const s=session();if(!s?.empId||s.punchOnly)throw Error('登入身分未驗證，未保存Excel原檔');const actor=s.empId,bytes=await file.arrayBuffer(),hash=await digest(bytes);if(session()?.empId!==actor)throw Error('登入身分已變更，未保存Excel原檔');const existing=(await records()).find(r=>r.id===actor+'|'+hash);if(existing)return;await put({id:actor+'|'+hash,actor,name:file.name,bytes,hash,importedAt:new Date().toISOString(),receipt:null});}
function base64(bytes){const u=new Uint8Array(bytes);let s='';for(let i=0;i<u.length;i+=16384)s+=String.fromCharCode(...u.subarray(i,i+16384));return g.btoa(s);}
function render(){
 if(!batch)return;
 const list=$('p79AllBackupResults');
 if(!list)return;
 list.replaceChildren();
 for(const item of batch.items){
  const kind=item.result?'done':item.error?'error':item.running?'running':'pending';
  const title=item.type==='yardFile'?'儲量原檔':item.label;
  const summary=item.result?(item.result.unchanged?'無異動，已核對既有備份':'已備份 '+Number(item.result.rows||0).toLocaleString('zh-TW')+' 筆'):item.error?'未完成：'+item.error:item.running?'備份及讀回核對中…':'等待備份';
  const detail=(item.type==='yardFile'?(item.original?.name||'Excel原檔')+' · ':'')+summary;
  const li=d.createElement('li');
  li.className='p79-backup-light p79-backup-'+kind;
  const tip=title+'：'+detail+(item.result?'；點擊開啟歷史資料':item.error?'；點擊單獨重試':'');
  li.title=tip;
  const control=d.createElement(item.result?'a':item.error?'button':'span');
  control.className='p79-backup-light-control';
  control.title=tip;
  control.setAttribute('aria-label',tip);
  const lamp=d.createElement('span');
  lamp.className='p79-backup-lamp';
  lamp.setAttribute('aria-hidden','true');
  const label=d.createElement('span');
  label.className='p79-backup-light-label';
  label.textContent=title;
  control.append(lamp,label);
  if(item.result){
   control.href=item.result.backupUrl;
   control.target='_blank';
   control.rel='noopener';
  }else if(item.error){
   control.type='button';
   control.disabled=busy;
   control.addEventListener('click',()=>start(item.id));
  }
  li.append(control);
  list.append(li);
 }
 const done=batch.items.filter(i=>i.result).length;
 const failed=batch.items.some(i=>i.error);
 const progress=$('p79AllBackupProgress');
 if(progress){progress.max=batch.items.length;progress.value=done;progress.hidden=false;}
 message(done===batch.items.length?'完成 '+done+'/'+batch.items.length:busy?'備份 '+done+'/'+batch.items.length:failed?'完成 '+done+'/'+batch.items.length+' · 可重試':'待核對 '+done+'/'+batch.items.length);
 const btn=$('p79AllBackupButton');
 if(btn){btn.disabled=busy;btn.textContent=busy?'正在備份…':failed?'重試未完成項目':'備份資料庫';}
}
async function start(onlyId=null){
 if(busy||!allowed(session()))return;const feedback=$('p79AllBackupFeedback');if(feedback)feedback.hidden=false;let c;try{c={actor:session().empId,token:token(),endpoint:endpoint()};}catch(e){message(e.message);return;}busy=true;const btn=$('p79AllBackupButton');if(btn)btn.disabled=true;message('正在核對備份服務與各分類資料來源…');
 try{
  const caps=await request(c,null,true);if(caps.allSystemsBackupVersion!==1||!Array.isArray(caps.groups)||TYPES.some(([t])=>!caps.groups.some(x=>x.type===t)))throw Error('正式雲端尚未啟用全部系統備份，沒有執行任何備份');
  const yard=await yardSnapshot(c.actor),fingerprint=await digest(new TextEncoder().encode(JSON.stringify(yard))),originals=(await records()).filter(r=>r.actor===c.actor&&!r.receipt);
  if(!same(c))throw Error('登入身分已變更，已停止備份');
  if(!batch||batch.actor!==c.actor||batch.endpoint!==c.endpoint||batch.fingerprint!==fingerprint){
   if(onlyId)throw Error('備份資料來源已變更，請使用「備份資料庫」重新核對清單');
   batch={actor:c.actor,endpoint:c.endpoint,fingerprint,items:[...originals.map(r=>({type:'yardFile',label:'儲量Excel原檔：'+r.name,id:g.crypto.randomUUID(),original:r})),...TYPES.map(([type,label])=>({type,label,id:g.crypto.randomUUID()}))]};
  }
  if(onlyId&&!batch.items.some(item=>item.id===onlyId&&!item.result))throw Error('此分類不在待重試清單，請重新執行備份');
  for(const item of batch.items){if(item.result||(onlyId&&item.id!==onlyId))continue;if(!same(c))throw Error('登入身分已變更，已停止後續備份');item.error='';item.running=true;render();
   try{const payload={type:item.type,requestId:item.id};if(item.type==='yard')payload.yard=yard;if(item.original)payload.original={name:item.original.name,hash:item.original.hash,base64:base64(item.original.bytes)};
    const result=await request(c,payload,false);if(result.verified!==true||result.sourceUnchanged!==true||result.type!==item.type||result.requestId!==item.id||!result.backupId)throw Error('未取得此分類的完整備份確認');result.backupUrl=link(result.backupUrl);item.result=result;
    if(item.original){item.original.receipt={backupId:result.backupId,backupUrl:result.backupUrl};await put(item.original);}
    if(item.type==='yard'&&yard&&same(c)){try{g.localStorage.setItem('p79_yard_backup_receipt_v1_'+encodeURIComponent(c.actor),JSON.stringify({fingerprint,backupUrl:result.backupUrl,backupAt:result.backupAt,updatedAt:yard.updatedAt}));}catch(_){}}
   }catch(e){if(!same(c))throw e;item.error=String(e.message||e).slice(0,240);}finally{item.running=false;}render();
  }
 }catch(e){if(!c||same(c))message(String(e.message||e).slice(0,240));}
 finally{busy=false;if(c&&same(c)){render();if(btn){btn.disabled=false;if(!batch)btn.textContent='備份資料庫';}if(batch?.items.every(i=>i.result))batch=null;}else refresh();}
}
function refresh(){
 const s=session(),role=String(s?.adminRole||s?.role||'').toLowerCase();
 const isManager=!!s&&!s.punchOnly&&['admin','superadmin'].includes(role)&&!!token();
 const canRun=allowed(s),panel=$('p79AllBackupPanel'),button=$('p79AllBackupButton');
 if(panel)panel.hidden=!isManager;
 if(button){button.disabled=!canRun||busy;button.title=canRun?'執行前會先核對雲端是否支援全部分類':'僅最高管理員可以執行全系統備份';}
 if(isManager&&!canRun)message('這裡是全系統歷史備份入口；僅最高管理員可以操作。請以最高管理員身分登入後執行。');
 if(!canRun){if(controller)controller.abort();batch=null;const feedback=$('p79AllBackupFeedback');if(feedback)feedback.hidden=true;}
}
function init(){const b=$('p79AllBackupButton');if(b)b.addEventListener('click',()=>start());refresh();}
g.Port79AllBackup={start,refresh,rememberYardImport,types:TYPES.map(([type,label])=>({type,label})),yardSnapshot};
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);

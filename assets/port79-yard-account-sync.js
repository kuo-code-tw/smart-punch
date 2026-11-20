(function(g){
'use strict';
function credentials(){
 const store=g.sessionStorage;
 const base=store.getItem('port79_gas_url')||'';
 const token=store.getItem('port79_user_token')||store.getItem('port79_admin_token')||store.getItem('port79_gc_superadmin_token')||'';
 if(!token||!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(base))throw Error('找不到正式儲量服務或登入已失效');
 return {base,token};
}
async function sync(account,rows){
 const {base,token}=credentials();
 const result=await g.fetch(base,{
  method:'POST',
  headers:{'Content-Type':'text/plain;charset=UTF-8'},
  body:JSON.stringify({action:rows?'yardAccountWrite':'yardAccountRead',token,account,rows}),
  signal:AbortSignal.timeout(30000)
 });
 if(!result.ok)throw Error('儲量服務回傳 HTTP '+result.status);
 const data=await result.json();
 if(credentials().token!==token)throw Error('登入已變更，已停止顯示儲量');
 if(data?.ok!==true||data?.version!==1||!Array.isArray(data.rows))throw Error(data?.error||'正式儲量同步尚未啟用');
 return data.rows;
}
function merge(account,cloud){
 const key='p79_yard_private_v1_'+account;
 const prior=JSON.parse(g.localStorage.getItem(key)||'null');
 const rows=new Map((prior?.rows||[]).map(row=>[row.date,row]));
 cloud.forEach(row=>rows.set(row.date,row));
 if(rows.size)g.localStorage.setItem(key,JSON.stringify({
  rows:[...rows.values()].sort((a,b)=>a.date.localeCompare(b.date)),
  fileName:prior?.fileName||'雲端同步',
  updatedAt:new Date().toISOString()
 }));
}
g.Port79YardAccountSync={sync,merge};
})(window);

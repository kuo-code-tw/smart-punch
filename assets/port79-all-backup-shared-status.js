/* PORT79 V119 - 只讀雲端共用備份完成時間；不是本機 session 的備份進度。 */
(function (g) {
  'use strict';
  const d = g.document;
  const order = ['personnel','attendance','schedule','leave','overtime','workhours','efficiency','vessel','gate','routes','yard'];
  const excluded = ['sailing','audit'];
  const last = { identity:'', status:null, at:0, pending:null, error:'' };
  let observer = null;
  function current() {
    try {
      const s = JSON.parse(g.sessionStorage.getItem('port79_user_session')||'null');
      const tok = g.sessionStorage.getItem('port79_user_token') || g.sessionStorage.getItem('port79_admin_token');
      const raw = g.sessionStorage.getItem('port79_gas_url');
      if (!s || s.punchOnly || String(s.adminRole||s.role).toLowerCase()!=='superadmin' || !tok || !raw) return null;
      const url = new URL(raw);
      if(url.protocol!=='https:' || url.hostname!=='script.google.com' || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)) return null;
      return {id:String(s.empId||''),token:tok,endpoint:url.href,key:String(s.empId||'')+'|'+tok+'|'+url.href};
    } catch (_) {return null;}
  }
  function safeLink(link) {
    try {
      const u = new URL(String(link||''));
      return u.protocol==='https:' && ['docs.google.com','drive.google.com'].includes(u.hostname) && /^\/(spreadsheets\/d|file\/d)\/[A-Za-z0-9_-]+(?:\/|$)/.test(u.pathname) ? u.href : '';
    } catch (_) {return '';}
  }
  function localTime(stamp) {
    const s=String(stamp||'');
    const m=/^(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)$/.exec(s);
    if(m)return m[1]+'/'+m[2]+'/'+m[3]+' '+m[4]+':'+m[5]+':'+m[6];
    const date=new Date(s);
    if(isNaN(date.getTime()))return '';
    return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date);
  }
  function apply() {
    const who=current(), data=last.status;
    if(!who || !data || who.key!==last.identity)return;
    const list=d.getElementById('p79AllBackupResults'),status=d.getElementById('p79AllBackupStatus');
    if(!list || list.children.length!==order.length)return;
    const byType=new Map(data.groups.filter(x=>x&&typeof x.type==='string').map(x=>[x.type,x]));
    order.forEach((type,i)=>{
      const receipt=byType.get(type),li=list.children[i];
      if(!li || !receipt || receipt.verified!==true)return;
      const time=localTime(receipt.excelBackupAt||receipt.backupAt);
      if(!time)return;
      const control=li.querySelector('.p79-backup-light-control');
      if(!control)return;
      let stamp=li.querySelector('.p79-backup-history-time');
      if(!stamp){
        stamp=d.createElement('small');
        stamp.className='p79-backup-history-time';
        control.append(stamp);
      }
      stamp.textContent='上次 '+time;
      li.classList.add('p79-backup-has-history');
      if(!li.classList.contains('p79-backup-error')&&!li.classList.contains('p79-backup-running')){
        li.classList.remove('p79-backup-pending');
        li.classList.add('p79-backup-done');
      }
      const url=safeLink(receipt.excelBackupUrl||receipt.backupUrl);
      if(url && control.tagName!=='A' && control.tagName!=='BUTTON') {
        const a=d.createElement('a');
        a.className=control.className;
        a.append(...Array.from(control.childNodes));
        control.replaceWith(a);
        a.href=url;a.target='_blank';a.rel='noopener';
      }else if(url && control.tagName==='A' && control.href!==url){control.href=url;control.target='_blank';control.rel='noopener';}
      li.title='上次雲端備份完成：'+time+'（所有電腦共用）';
    });
    const done=order.filter(type=>byType.get(type)?.verified===true).length;
    const other=excluded.filter(type=>byType.get(type)?.verified===true).length;
    const allTimes=data.groups.filter(x=>x.verified&&x.backupAt).map(x=>({raw:x.excelBackupAt||x.backupAt,time:localTime(x.excelBackupAt||x.backupAt)})).sort((a,b)=>a.raw.localeCompare(b.raw));
    const latest=allTimes.length?allTimes[allTimes.length-1].time:'尚無紀錄';
    if(status && (/尚未開始備份|待核對|雲端備份紀錄/.test(status.textContent||''))){
      status.textContent='雲端備份紀錄 · '+done+'/'+order.length+' 類已備份（另有 '+other+'/'+excluded.length+' 項其他備份） · 最近完成 '+latest+'（台灣時間；所有電腦共用）';
    }
  }
  async function load(force) {
    const who=current();
    if(!who){last.identity='';last.status=null;return;}
    if(who.key!==last.identity){last.identity=who.key;last.status=null;last.at=0;last.error='';}
    if(last.pending)return last.pending;
    if(!force&&Date.now()-last.at<45000){apply();return;}
    const promise=(async()=>{
      try{
        const u=new URL(who.endpoint);
        u.searchParams.set('action','historyBackupStatus');
        u.searchParams.set('gcToken',who.token);
        u.searchParams.set('_',Date.now());
        const ac=new AbortController();
        const timeout=g.setTimeout(()=>ac.abort(),20000);
        let response;
        try{response=await g.fetch(u.href,{cache:'no-store',redirect:'follow',signal:ac.signal});}
        finally{g.clearTimeout(timeout);}
        const data=await response.json();
        if(!response.ok||data?.ok!==true||data?.sharedStatusVersion!==1||!Array.isArray(data.groups))throw Error('跨電腦備份狀態尚未啟用');
        if(current()?.key!==who.key)return;
        last.status=data;last.at=Date.now();last.error='';
        apply();
      }catch(error){
        if(current()?.key!==who.key)return;
        last.at=Date.now();last.error=String(error?.message||error);
        const status=d.getElementById('p79AllBackupStatus');
        if(status && /尚未開始備份 · 0\//.test(status.textContent||'')){
          status.textContent='尚未取得雲端共用備份紀錄；畫面 0 項不代表雲端沒有備份。';
        }
      }
    })();
    last.pending=promise;
    try{await promise;}finally{if(last.pending===promise)last.pending=null;}
  }
  function init() {
    if(!d.getElementById('p79BackupSharedStyle')){const style=d.createElement('style');style.id='p79BackupSharedStyle';style.textContent="#systems #p79AllBackupResults li.p79-backup-has-history{height:54px!important;min-height:54px!important;max-height:54px!important;}\n#systems #p79AllBackupResults li.p79-backup-has-history .p79-backup-light-control{height:54px!important;min-height:54px!important;max-height:54px!important;display:flex!important;align-content:center;flex-wrap:wrap;column-gap:7px;row-gap:0;}\n#systems #p79AllBackupResults li.p79-backup-has-history .p79-backup-light-label{max-width:calc(100% - 25px);}\n#systems #p79AllBackupResults .p79-backup-history-time{display:block;flex:0 0 100%;color:var(--muted,#64748b);font-size:10px;line-height:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}";d.head.append(style);}
    const list=d.getElementById('p79AllBackupResults');
    if(list && g.MutationObserver){
      observer=new MutationObserver(()=>{if(last.status)g.queueMicrotask(apply);});
      observer.observe(list,{childList:true});
    }
    g.addEventListener('focus',()=>load(true));
    d.addEventListener('visibilitychange',()=>{if(!d.hidden)load(true);});
    d.addEventListener('click',()=>{if(current())g.setTimeout(()=>load(false),600);});
    g.setInterval(()=>load(false),15000);
    load(false);
  }
  if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
  g.Port79SharedBackupStatus={refresh:()=>load(true),get:()=>{const who=current();return who&&who.key===last.identity?last.status:null;}};
})(window);

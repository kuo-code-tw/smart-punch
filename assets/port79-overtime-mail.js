(function(g){
'use strict';
// Front-end stores no mail credentials or recipient allowlist.
// "Sent" is shown only after authoritative cloud readback.
const uid=x=>String(x||'').trim().toUpperCase();
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function canonical(x){
 if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
 if(x&&typeof x==='object')return '{'+Object.keys(x).filter(k=>x[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
 return JSON.stringify(x===undefined?null:x);
}
function collect(snapshot,people,month){
 const allowed=new Map((people||[]).map(p=>[uid(p.empId),p]));
 const rows=[],seen=new Set();
 for(const entry of snapshot?.schedules||[]){
  const emp=allowed.get(uid(entry.empId));if(!emp)continue;
  for(const [date,m] of Object.entries(entry.schedule?.__meta||{})){
   if(!date.startsWith(month+'-')||!m||m.overtimeExcluded===true)continue;
   for(const r of [m.overtimeReport,...(Array.isArray(m.overtimeReports)?m.overtimeReports:[])].filter(Boolean)){
    if(!r.id||(m.overtimeRevocations||[]).some(a=>a?.confirmed===true&&String(a.reportId)===String(r.id)))continue;
    const key=uid(emp.empId)+'|'+date+'|'+r.id;if(seen.has(key))continue;seen.add(key);
    rows.push({empId:uid(emp.empId),name:emp.name||emp.empId,date,id:String(r.id),
     type:r.typeName||({國:'國定假日加班',休:'休息日加班',例:'例假加班',代:'休假代班加班',延:'平日延長加班'}[r.category]||'加班'),
     code:String(r.code||''),hours:r.declaredHours,report:JSON.parse(JSON.stringify(r))});
   }
  }
 }
 return rows.sort((a,b)=>b.date.localeCompare(a.date)||a.name.localeCompare(b.name,'zh-Hant'));
}
function receiptStatus(row,receipts,recipientId=''){
 const relevant=(receipts||[]).filter(r=>uid(r.empId)===uid(row.empId)&&r.date===row.date&&(!recipientId||r.recipientId===recipientId));
 const same=r=>r.reportId===row.id&&r.reportJson&&(()=>{try{return canonical(JSON.parse(r.reportJson))===canonical(row.report)}catch(_){return false}})();
 const sent=relevant.find(r=>r.status==='sent'&&same(r));if(sent)return {kind:'sent',receipt:sent};
 const pending=relevant.find(r=>r.status==='sending'&&same(r));if(pending)return {kind:'pending',receipt:pending};
 const stale=relevant.filter(r=>r.status==='sent').sort((a,b)=>String(b.sentAt||'').localeCompare(String(a.sentAt||'')))[0];
 return stale?{kind:'stale',receipt:stale}:{kind:'new',receipt:null};
}

/* Send exactly one message per date. Every person in this table is merely
 * a preview row; none creates its own email. */
function dailyItems(rows,date){
 return (rows||[]).filter(r=>r.date===date).map(r=>({
  empId:r.empId,id:r.id,report:r.report
 })).sort((a,b)=>a.empId.localeCompare(b.empId)||a.id.localeCompare(b.id));
}
function dayStatus(date,items,receipts,recipientId){
 const current=canonical(items);
 const daily=(receipts||[]).filter(r=>r.empId==='__DAY__'&&r.date===date&&r.recipientId===recipientId);
 const exact=r=>r.reportId==='DAY:'+date&&r.reportJson===current;
 const sent=daily.find(r=>r.status==='sent'&&exact(r));
 if(sent)return {kind:'sent',receipt:sent};
 const pending=daily.find(r=>r.status==='sending'&&exact(r));
 if(pending)return {kind:'pending',receipt:pending};
 const old=daily.find(r=>r.status==='sent');
 return old?{kind:'stale',receipt:old}:{kind:'new',receipt:null};
}
function open(){
 const ctx=g.p79OvertimeMailContext;
 if(!ctx?.canSend?.())return g.alert('沒有發送加班申報 Mail 的權限');
 const previous=g.document.getElementById('p79OvertimeMailDialog');
 if(previous){previous.focus();return;}
 const el=g.document.createElement('dialog');
 el.id='p79OvertimeMailDialog';
 el.style.cssText='width:min(1040px,96vw);max-height:92dvh;overflow:auto;border:1px solid #d5e1eb;border-radius:14px;padding:18px;background:#fff;color:#20364d';
 el.innerHTML='<style>'+
 '#p79OvertimeMailDialog *{box-sizing:border-box}'+
 '#p79OvertimeMailDialog .om-head{display:flex;gap:12px;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid #e2e8f0}'+
 '#p79OvertimeMailDialog .om-head h2{margin:0;font-weight:800;font-size:19px;color:#075985}'+
 '#p79OvertimeMailDialog .om-intro{font-size:12px;line-height:1.6;color:#64748b;margin:10px 0}'+
 '#p79OvertimeMailDialog .om-controls{display:grid;grid-template-columns:minmax(155px,200px) minmax(160px,210px) minmax(220px,1fr) 140px;gap:11px;padding:13px;border-radius:11px;background:#eff6ff;border:1px solid #dbeafe;align-items:end}'+
 '#p79OvertimeMailDialog label{display:grid;gap:6px;font-size:12px;font-weight:700;color:#334155;min-width:0}'+
 '#p79OvertimeMailDialog input,#p79OvertimeMailDialog select,#p79OvertimeMailDialog button{font:inherit;border:1px solid #cbd5e1;background:#fff;color:#193550;border-radius:8px;padding:8px 11px;min-height:39px}'+
 '#p79OvertimeMailDialog input,#p79OvertimeMailDialog select{width:100%;min-width:0}'+
 '#p79OvertimeMailDialog button{font-weight:700;cursor:pointer}'+
 '#p79OvertimeMailDialog button:disabled{opacity:.5;cursor:not-allowed}'+
 '#p79OvertimeMailDialog button:focus-visible,#p79OvertimeMailDialog input:focus-visible,#p79OvertimeMailDialog select:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}'+
 '#p79OvertimeMailDialog .om-blue{color:#fff!important;background:#2563eb!important;border-color:#1d4ed8!important}'+
 '#p79OvertimeMailDialog .om-blue:hover:not(:disabled){background:#1d4ed8!important}'+
 '#p79OvertimeMailDialog .om-green{color:#fff!important;background:#0e7490!important;border-color:#0e7490!important}'+
 '#p79OvertimeMailDialog .om-green:hover:not(:disabled){background:#155e75!important}'+
 '#p79OvertimeMailDialog .om-muted{background:#f1f5f9!important;color:#475569!important}'+
 '#p79OvertimeMailDialog .om-address-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 0}'+
 '#p79OvertimeMailDialog .om-address-actions button{min-height:32px;font-size:12px;padding:6px 10px}'+
 '#p79OvertimeMailDialog .om-recipient-editor{padding:12px;background:#ecfeff;border:1px solid #bae6fd;border-radius:10px;margin-bottom:10px}'+
 '#p79OvertimeMailDialog .om-recipient-editor>div{display:flex;gap:9px;align-items:end;flex-wrap:wrap}'+
 '#p79OvertimeMailDialog .om-recipient-editor label{flex:1 1 190px}'+
 '#p79OvertimeMailDialog .om-recipient-editor button{min-height:39px}'+
 '#p79OvertimeMailDialog .om-summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px;background:#f8fafc;border-radius:10px;margin:8px 0}'+
 '#p79OvertimeMailDialog .om-day-links{display:flex;align-items:center;gap:6px;max-width:100%;overflow-x:auto;white-space:nowrap;padding:4px 2px 9px}'+
 '#p79OvertimeMailDialog .om-day-links button{min-height:30px;padding:5px 9px;font-size:11px;background:#eff6ff;color:#075985;border:1px solid #bfdbfe}'+
 '#p79OvertimeMailDialog .om-day-links button[aria-pressed="true"]{background:#075985;color:#fff;border-color:#075985}'+
 '#p79OvertimeMailDialog .om-day-links small{font-size:11px;color:#64748b;flex:0 0 auto}'+
 '#p79OvertimeMailDialog .om-summary strong{font-size:15px}'+
 '#p79OvertimeMailDialog .om-status{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800}'+
 '#p79OvertimeMailDialog .om-status.sent{background:#dbeafe;color:#1d4ed8}'+
 '#p79OvertimeMailDialog .om-status.stale{background:#ffedd5;color:#9a3412}'+
 '#p79OvertimeMailDialog .om-status.pending{background:#fae8ff;color:#86198f}'+
 '#p79OvertimeMailDialog .om-status.new{background:#e2e8f0;color:#475569}'+
 '#p79OvertimeMailDialog .om-list{overflow:auto;border:1px solid #dbe5ef;border-radius:9px;max-height:42vh}'+
 '#p79OvertimeMailDialog table{width:100%;border-collapse:collapse;font-size:13px;min-width:610px}'+
 '#p79OvertimeMailDialog th,#p79OvertimeMailDialog td{padding:10px;text-align:center;border-bottom:1px solid #e5e7eb}'+
 '#p79OvertimeMailDialog th{position:sticky;top:0;background:#e0f2fe;color:#0c4a6e}'+
 '#p79OvertimeMailDialog tbody tr:nth-child(even){background:#f8fafc}'+
 '#p79OvertimeMailDialog .om-bottom{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px}'+
 '#p79OvertimeMailDialog .om-message{white-space:pre-wrap;color:#475569;font-size:12px;line-height:1.6;flex:1 1 320px}'+
 '@media(max-width:850px){#p79OvertimeMailDialog .om-controls{grid-template-columns:repeat(2,minmax(0,1fr))}}'+
 '@media(max-width:510px){#p79OvertimeMailDialog .om-controls{grid-template-columns:minmax(0,1fr)}#p79OvertimeMailDialog .om-bottom button{width:100%}}'+
 '</style>'+
 '<div class="om-head"><h2>加班申報｜發送 Mail</h2><button id="omClose" class="om-muted" type="button">✕ 關閉</button></div>'+
 '<p class="om-intro">選擇月份與日期，將當天所有有效加班申報彙整為一封 Mail。可在下方新增收件信箱；每次寄送前都會重新核對雲端版本。</p>'+
 '<div class="om-controls"><label>加班月份<input id="omMonth" type="month" value="'+esc(ctx.month()||'')+'"></label>'+
 '<label>選擇申報日期<input id="omDate" type="date"></label>'+
 '<label>發送到哪個 Mail？<select id="omRecipient"><option value="">讀取 Mail 名單…</option></select></label>'+
 '<button id="omReload" class="om-blue" type="button">重新核對雲端</button></div>'+
 '<div class="om-address-actions"><button id="omAddRecipient" type="button" class="om-green">＋ 新增 Mail</button>'+
 '<button id="omRemoveRecipient" type="button" class="om-muted">移除選取信箱</button>'+
 '<span style="font-size:11px;color:#64748b">信箱僅儲存於受權限保護的 Google 後端設定</span></div>'+
 '<div id="omRecipientEditor" class="om-recipient-editor" hidden><div>'+
 '<label>收件人名稱<input id="omRecipientName" maxlength="60" placeholder="例如：會計／主管"></label>'+
 '<label>Mail 信箱<input id="omRecipientEmail" type="email" placeholder="name@company.com"></label>'+
 '<button id="omSaveRecipient" class="om-green" type="button">儲存 Mail</button>'+
 '<button id="omCancelRecipient" class="om-muted" type="button">取消</button></div></div>'+
 '<div id="omSummary" class="om-summary"><strong>請先核對申報日期</strong></div>'+ 
 '<div id="omDayLinks" class="om-day-links" aria-label="有加班申報的日期"></div>'+
 '<details id="omDetails" style="margin:8px 0"><summary style="cursor:pointer;color:#075985;font-size:13px;font-weight:750;padding:8px 0">查看當日加班申報明細（點擊展開）</summary>'+ 
 '<div class="om-list"><table><thead><tr><th>申報日期</th><th>姓名／工號</th><th>加班類型／時段</th><th>時數</th></tr></thead>'+
 '<tbody id="omRows"><tr><td colspan="4">載入中…</td></tr></tbody></table></div></details>'+
 '<div class="om-bottom"><div id="omMessage" class="om-message" role="status"></div>'+
 '<button id="omSendDay" class="om-green" type="button" disabled>發送當日 Mail</button></div>';
 g.document.body.appendChild(el);
 el.showModal();
 const q=id=>el.querySelector(id);
 const initialAccount=ctx.identity();
 let busy=false,ready=false,mailReady=false,snapshotFresh=false,rows=[],receipts=[],recipients=[],lastMonth='',canManage=false;
 const guard=()=>{if(initialAccount!==ctx.identity()||!ctx.canSend())throw Error('登入身分或發送權限已變更，請重新開啟')};
 const msg=text=>{q('#omMessage').textContent=text};
 const recipient=()=>recipients.find(r=>r.id===q('#omRecipient').value);
 const date=()=>q('#omDate').value;
 function range(month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return null;
  const y=Number(month.slice(0,4)),m=Number(month.slice(5,7));
  const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  return [month+'-01',month+'-'+String(last).padStart(2,'0')];
 }
 function paint(){
  const filtered=ready?rows.filter(r=>r.date===date()):[];
  const items=dailyItems(rows,date());
  const target=recipient();
  const state=target?dayStatus(date(),items,receipts,target.id):{kind:'new'};
  const statusLabel={sent:'當日目前版本已發送',stale:'舊版已發送／目前版本須重寄',pending:'發送結果待核對',new:'尚未確認發送'}[state.kind];
  const sum=filtered.reduce((v,r)=>v+(Number(r.hours)||0),0);
  const people=new Set(filtered.map(r=>r.empId)).size;
  q('#omSummary').innerHTML='<strong>'+esc(date()||'尚未選擇日期')+'</strong>'+
   '<span>'+(ready?(people+' 人｜'+filtered.length+' 筆申報｜'+Number(sum.toFixed(2))+' 小時'):'申報明細尚未成功載入')+'</span>'+
   '<span class="om-status '+state.kind+'">'+statusLabel+'</span>'+
   (state.receipt?'<small>已記錄：'+esc(state.receipt.sentAt||'待核對')+'</small>':'');
  const availableDates=ready?[...new Set(rows.map(r=>r.date))].sort().reverse():[];
  q('#omDayLinks').innerHTML=availableDates.length?'<small>快速選日期：</small>'+availableDates.map(d=>
   '<button type="button" data-mail-date="'+esc(d)+'" aria-pressed="'+(d===date())+'">'+esc(d.slice(5).replace('-','/'))+'</button>').join(''):
   '<small>'+(ready?'本月份沒有有效申報日期':'待讀取班表資料')+'</small>';
  q('#omRows').innerHTML=filtered.length?filtered.map(r=>
   '<tr><td>'+esc(r.date)+'</td><td>'+esc(r.name)+
   '<div style="color:#64748b;font-size:11px">'+esc(r.empId)+'</div></td>'+
   '<td>'+esc(r.type)+'<div style="color:#64748b;font-size:11px">'+esc(r.code)+'</div></td>'+
   '<td>'+esc(r.hours)+' 小時</td></tr>').join(''):
   '<tr><td colspan="4">'+(ready?'此日期沒有有效加班申報，請改選其他日期':'加班資料尚未載入成功，請查看下方提示')+'</td></tr>';
  q('#omSendDay').disabled=busy||!ready||!mailReady||!snapshotFresh||!filtered.length||!target||state.kind==='sent'||state.kind==='pending';
  q('#omSendDay').textContent=state.kind==='stale'?'重新發送當日 Mail':'發送當日 Mail（'+filtered.length+'筆）';
  for(const id of ['omMonth','omDate','omRecipient','omReload','omAddRecipient','omRemoveRecipient',
                    'omSaveRecipient','omRecipientName','omRecipientEmail','omCancelRecipient'])q('#'+id).disabled=busy;
  q('#omAddRecipient').disabled=false; // The address form remains openable during initial cloud checks.
  q('#omRemoveRecipient').disabled=busy||!canManage||!target;
  q('#omSaveRecipient').disabled=busy;
 }
 function fillRecipients(preferred){
  q('#omRecipient').innerHTML='<option value="">請選擇 Mail 信箱</option>'+
   recipients.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.name+'（'+r.email+'）')+'</option>').join('');
  if(preferred&&recipients.some(r=>r.id===preferred))q('#omRecipient').value=preferred;
 }
 async function load(preferred){
  guard();
  const month=q('#omMonth').value,limits=range(month);
  if(!limits)throw Error('請選擇有效月份');
  const previousDate=date();
  ready=false;mailReady=false;snapshotFresh=false;rows=[];receipts=[];recipients=[];canManage=false;
  q('#omDate').min=limits[0];q('#omDate').max=limits[1];
  paint();
  msg('分別讀取正式加班申報與 Mail 服務狀態…');
  // Mail RPC can be unimplemented while secure schedule reads still work.
  // Never let an unavailable optional Mail action erase an authorized roster preview.
  const [rosterResult,mailResult]=await Promise.allSettled([
   ctx.snapshot(month),
   ctx.request('getOvertimeMailOptions',{month})
  ]);
  guard();
  let rosterError='',mailError='',cached=false;
  if(rosterResult.status==='fulfilled'&&Array.isArray(rosterResult.value?.schedules)){
   rows=collect(rosterResult.value,ctx.employees(),month);
   ready=true;snapshotFresh=true;
  }else{
   rosterError=rosterResult.status==='rejected'?
    String(rosterResult.reason?.message||rosterResult.reason):
    '雲端沒有回傳可核實的申報班表';
   // Display-only cached roster is permitted, but sending requires a fresh
   // authoritative cloud read and comparison against full-day snapshots.
   const cachedRoster=ctx.preview?.(month);
   if(Array.isArray(cachedRoster?.schedules)){
    rows=collect(cachedRoster,ctx.employees(),month);ready=true;cached=true;
   }
  }
  if(mailResult.status==='fulfilled'){
   const config=mailResult.value;
   if(config?.overtimeMailVersion===2&&Array.isArray(config.recipients)&&Array.isArray(config.receipts)){
    recipients=config.recipients;receipts=config.receipts;canManage=config.canManageRecipients===true;mailReady=true;
   }else{
    mailError='目前 Apps Script 不是「每日一封 Mail」第 2 版，需在原專案更新寄信路由';
   }
  }else{
   const reason=String(mailResult.reason?.message||mailResult.reason);
   mailError=reason.includes('未知操作')?
    '目前 Apps Script 未辨識 getOvertimeMailOptions，需要更新原專案的 Mail 操作路由':
    reason;
  }
  fillRecipients(preferred);
  const dates=[...new Set(rows.map(r=>r.date))].sort().reverse();
  q('#omDate').value=dates.includes(previousDate)?previousDate:(dates[0]||limits[0]);
  lastMonth=month;paint();
  const result=ready?('已讀取 '+rows.length+' 筆有效申報'+(cached?'（來自已讀取的考勤班表快取，僅供預覽）':'（來自雲端班表）')+
   '，可選日期查看當天明細。'):('加班申報讀取失敗：'+rosterError);
  msg(result+(cached?'\n目前顯示的快取只供查詢；正式申報重新核對成功以前不會開放發送。':'')+
   (mailError?'\nMail 功能未就緒：'+mailError+'。可查看明細，但不能儲存信箱或發送 Mail。':
    (mailReady&&snapshotFresh?'\n已確認 Mail 服務，可選擇核准收件信箱並發送。':'')));
 }
 function updateDateRange(){
  const limits=range(q('#omMonth').value);
  if(limits){q('#omDate').min=limits[0];q('#omDate').max=limits[1];q('#omDate').value=limits[0];}
 }
 q('#omClose').onclick=()=>el.close();el.onclose=()=>el.remove();
 q('#omDate').onchange=paint;q('#omRecipient').onchange=paint;
 q('#omDayLinks').onclick=event=>{const button=event.target.closest('button[data-mail-date]');if(!button||busy)return;
  q('#omDate').value=button.dataset.mailDate;paint();};
 q('#omMonth').onchange=()=>{ready=false;mailReady=false;snapshotFresh=false;rows=[];receipts=[];canManage=false;updateDateRange();paint();msg('已切換月份，請按「重新核對雲端」')};
 q('#omReload').onclick=async()=>{if(busy)return;busy=true;paint();try{await load(q('#omRecipient').value)}
  catch(e){mailReady=false;snapshotFresh=false;msg('讀取或權限驗證失敗：'+(e.message||e)+'。不會發送 Mail，請核對管理權限。')}
  finally{busy=false;paint()}};
 q('#omAddRecipient').onclick=()=>{const e=q('#omRecipientEditor');e.hidden=!e.hidden;if(!e.hidden)q('#omRecipientName').focus()};
 q('#omCancelRecipient').onclick=()=>{q('#omRecipientEditor').hidden=true};
 q('#omSaveRecipient').onclick=async()=>{
  if(busy)return;
  const name=q('#omRecipientName').value.trim(),email=q('#omRecipientEmail').value.trim();
  if(!name||!q('#omRecipientEmail').checkValidity())return msg('請輸入收件人名稱及有效的 Mail 信箱');
  if(!g.confirm('要將 '+name+'（'+email+'）加入核准的 Mail 收件名單？'))return;
  busy=true;paint();
  try{
   guard();
   const result=await ctx.request('manageOvertimeMailRecipients',{operation:'add',name,email});
   guard();
   if(result.overtimeMailVersion!==2||!result.recipients?.some(r=>r.email.toLowerCase()===email.toLowerCase()))throw Error('雲端未確認新增成功');
   const added=result.recipients.find(r=>r.email.toLowerCase()===email.toLowerCase());
   recipients=result.recipients;fillRecipients(added.id);
   q('#omRecipientEditor').hidden=true;
   q('#omRecipientName').value='';q('#omRecipientEmail').value='';
   msg('已將 Mail 信箱儲存在雲端核准名單：'+added.name+'（'+added.email+'）');
  }catch(e){msg('新增 Mail 未完成：'+(e.message||e)+(String(e.message||e).includes('未知操作')?'。目前使用中的 Apps Script 未開放 manageOvertimeMailRecipients，請更新原部署的後端路由。':''))}
  finally{busy=false;paint()}
 };
 q('#omRemoveRecipient').onclick=async()=>{
  if(busy||!canManage||!recipient())return;
  const r=recipient();
  if(!g.confirm('確定移除 Mail 收件信箱：'+r.name+'（'+r.email+'）？\n已寄出的歷史紀錄會保留。'))return;
  busy=true;paint();
  try{
   guard();
   const result=await ctx.request('manageOvertimeMailRecipients',{operation:'remove',recipientId:r.id});
   guard();
   if(result.overtimeMailVersion!==2||result.recipients?.some(x=>x.id===r.id))throw Error('雲端未確認移除完成');
   recipients=result.recipients;fillRecipients('');
   msg('已從核准名單移除 Mail 信箱；歷史紀錄仍保留');
  }catch(e){msg('移除 Mail 失敗：'+(e.message||e))}
  finally{busy=false;paint()}
 };
 q('#omSendDay').onclick=async()=>{
  if(busy||!ready||!mailReady||!snapshotFresh||q('#omMonth').value!==lastMonth)return;
  const to=recipient(),selectedDate=date(),items=dailyItems(rows,selectedDate),status=to?dayStatus(selectedDate,items,receipts,to.id):{kind:'new'};
  if(!to||!items.length||['sent','pending'].includes(status.kind))return;
  const staff=new Set(items.map(r=>r.empId)).size;
  if(!g.confirm('確認發送 Mail？\n\n日期：'+selectedDate+'\n人數：'+staff+' 人\n申報：'+items.length+' 筆\n收件人：'+to.name+'（'+to.email+'）\n\n只發送一封包含當日全部申報的 Mail。'+
   (status.kind==='stale'?'\n\n先前版本已寄過，會發送新的完整版本。':'')))return;
  busy=true;paint();msg('正在重新核對當日全部申報並發送一封 Mail…');
  try{
   guard();
   const requestId='otmailday_'+(g.crypto?.randomUUID?.()||String(Date.now())+'_'+Math.random().toString(36).slice(2));
   const response=await ctx.request('sendOvertimeAccountingDayMail',{
    date:selectedDate,recipientId:to.id,requestId,expectedReports:items
   });
   guard();
   if(response.overtimeMailVersion!==2||response.sent!==true||response.receipt?.status!=='sent'||
     response.receipt.reportId!=='DAY:'+selectedDate||response.receipt.recipientId!==to.id)
     throw Error('伺服器未回覆可靠的每日寄送憑據');
   const rechecked=await ctx.request('getOvertimeMailOptions',{month:lastMonth});
   guard();
   if(rechecked.overtimeMailVersion!==2||!rechecked.receipts?.some(r=>
      r.status==='sent'&&r.requestId===response.receipt.requestId&&
      dayStatus(selectedDate,items,[r],to.id).kind==='sent'))
      throw Error('Mail 可能已寄出，但雲端回條尚未讀回；請先核對，勿重複發送');
   receipts=rechecked.receipts;
   msg('已發送 '+selectedDate+' 的完整加班申報，共 '+staff+' 人／'+items.length+' 筆，雲端寄送紀錄已確認。');
   try{g.localStorage?.setItem('p79_overtime_mail_updated_v1',JSON.stringify({month:lastMonth,at:Date.now()}))}catch(_){}
   ctx.onSent?.(lastMonth);
  }catch(e){msg('發送結果未確認：'+(e.message||e)+'。請先查詢 Mail 或雲端紀錄，避免重複發送。')}
  finally{busy=false;paint()}
 };
 updateDateRange();paint();q('#omReload').click();
}
g.P79OvertimeMail={canonical,collect,receiptStatus,dailyItems,dayStatus,open};
})(window);

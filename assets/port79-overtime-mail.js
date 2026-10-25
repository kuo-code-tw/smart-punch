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
   const r=m.overtimeReport;
   if(!r?.id||(m.overtimeRevocations||[]).some(a=>a?.confirmed===true&&String(a.reportId)===String(r.id)))continue;
   const key=uid(emp.empId)+'|'+date+'|'+r.id;if(seen.has(key))continue;seen.add(key);
   rows.push({empId:uid(emp.empId),name:emp.name||emp.empId,date,id:String(r.id),
    type:r.typeName||({國:'國定假日加班',休:'休息日加班',例:'例假加班',代:'休假代班加班',延:'平日延長加班'}[r.category]||'加班'),
    code:String(r.code||''),hours:r.declaredHours,report:JSON.parse(JSON.stringify(r))});
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
function open(){
 const ctx=g.p79OvertimeMailContext;
 if(!ctx?.canSend?.())return g.alert('沒有寄送加班申報給會計的權限');
 const prior=g.document.getElementById('p79OvertimeMailDialog');if(prior){prior.focus();return}
 const el=g.document.createElement('dialog');el.id='p79OvertimeMailDialog';
 el.style.cssText='width:min(1150px,97vw);max-height:92dvh;overflow:auto;border:1px solid #d6e0e9;border-radius:14px;padding:18px;background:white;color:#193550';
 el.innerHTML='<style>'+
  '#p79OvertimeMailDialog *{box-sizing:border-box}#p79OvertimeMailDialog h2{margin:0;font-size:20px}'+
  '#p79OvertimeMailDialog .om-head,#p79OvertimeMailDialog .om-controls{display:flex;flex-wrap:wrap;align-items:center;gap:12px;justify-content:space-between}'+
  '#p79OvertimeMailDialog .om-controls{margin:14px 0;padding:12px;background:#f4f7fb;border-radius:10px;justify-content:flex-start}'+
  '#p79OvertimeMailDialog label{font-size:13px;display:grid;gap:5px;font-weight:650}'+
  '#p79OvertimeMailDialog select,#p79OvertimeMailDialog input,#p79OvertimeMailDialog button{font:inherit;padding:9px 10px;border-radius:7px;border:1px solid #cad5e2;background:white;color:#173b54}'+
  '#p79OvertimeMailDialog button{cursor:pointer;font-weight:700}#p79OvertimeMailDialog button:disabled{opacity:.45;cursor:not-allowed}'+
  '#p79OvertimeMailDialog .om-main{overflow:auto;max-height:50vh;border:1px solid #e2e8f0;border-radius:9px}'+
  '#p79OvertimeMailDialog table{border-collapse:collapse;width:100%;min-width:750px;font-size:13px}'+
  '#p79OvertimeMailDialog th{position:sticky;top:0;background:#eaf1f8;white-space:nowrap}'+
  '#p79OvertimeMailDialog td,#p79OvertimeMailDialog th{padding:10px;border-bottom:1px solid #e5edf3;text-align:center}'+
  '#p79OvertimeMailDialog .om-state{font-weight:750}#p79OvertimeMailDialog .om-state.sent{color:#1d4ed8}'+
  '#p79OvertimeMailDialog .om-state.stale{color:#b45309}#p79OvertimeMailDialog .om-state.pending{color:#a21caf}'+
  '#p79OvertimeMailDialog .om-state.new{color:#64748b}#p79OvertimeMailDialog .om-send{background:#075985;color:white;border-color:#075985}'+
  '#p79OvertimeMailDialog .om-hint{font-size:12px;color:#536779;line-height:1.7}#p79OvertimeMailDialog .om-message{font-size:13px;margin-top:12px;white-space:pre-wrap;min-height:24px}'+
  '#p79OvertimeMailDialog .om-head{padding-bottom:14px;border-bottom:1px solid #e2e8f0;align-items:center}'+
  '#p79OvertimeMailDialog .om-head h2{font-size:20px;font-weight:800;color:#075985}'+
  '#p79OvertimeMailDialog .om-controls{display:grid!important;grid-template-columns:minmax(170px,190px) minmax(250px,340px) 160px;align-items:end!important;justify-content:start!important;gap:12px!important;background:#eff6ff!important;border:1px solid #dbeafe;border-radius:12px;padding:16px!important}'+
  '#p79OvertimeMailDialog .om-controls label{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:7px!important;min-width:0;font-weight:750;color:#334155}'+
  '#p79OvertimeMailDialog .om-controls input,#p79OvertimeMailDialog .om-controls select{width:100%!important;min-width:0!important;height:42px!important;min-height:42px!important;border:1px solid #cbd5e1!important;border-radius:9px!important;background:#fff!important;color:#0f172a!important;padding:8px 12px!important;text-align:left}'+
  '#p79OvertimeMailDialog #omReload{height:42px!important;min-height:42px!important;align-self:end!important;margin:0!important;padding:8px 12px!important;background:#2563eb!important;color:#fff!important;border-color:#1d4ed8!important;border-radius:9px!important;white-space:nowrap!important}'+
  '#p79OvertimeMailDialog #omReload:hover{background:#1d4ed8!important}'+
  '#p79OvertimeMailDialog #omClose{background:#f1f5f9!important;color:#475569!important;border-color:#cbd5e1!important;padding:8px 13px!important}'+
  '#p79OvertimeMailDialog #omClose:hover{background:#e2e8f0!important}'+
  '#p79OvertimeMailDialog .om-send{background:#0284c7!important;border-color:#0369a1!important;color:#fff!important;border-radius:8px!important;padding:7px 12px!important}'+
  '#p79OvertimeMailDialog .om-send:hover:not(:disabled){background:#0369a1!important}'+
  '#p79OvertimeMailDialog .om-state{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:5px 10px;white-space:nowrap}'+
  '#p79OvertimeMailDialog .om-state.sent{background:#dbeafe;color:#1d4ed8}'+
  '#p79OvertimeMailDialog .om-state.stale{background:#ffedd5;color:#9a3412}'+
  '#p79OvertimeMailDialog .om-state.pending{background:#fae8ff;color:#86198f}'+
  '#p79OvertimeMailDialog .om-state.new{background:#f1f5f9;color:#475569}'+
  '#p79OvertimeMailDialog th{background:#e0f2fe!important;color:#0c4a6e!important}'+
  '#p79OvertimeMailDialog button:focus-visible,#p79OvertimeMailDialog input:focus-visible,#p79OvertimeMailDialog select:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}'+
  '@media(max-width:780px){#p79OvertimeMailDialog .om-controls{grid-template-columns:repeat(2,minmax(0,1fr))!important}#p79OvertimeMailDialog #omReload{grid-column:1/-1;justify-self:start}}'+
  '@media(max-width:520px){#p79OvertimeMailDialog .om-controls{grid-template-columns:minmax(0,1fr)!important}#p79OvertimeMailDialog #omReload{grid-column:auto;width:100%}}'+
  '</style><div class="om-head"><h2>加班申報｜寄送 Mail</h2><button id="omClose" type="button">✕ 關閉</button></div>'+
  '<p class="om-hint">請選擇管理員核准的會計收件人，再逐筆確認寄送。只寄送該筆申報摘要，不寄送整月考勤名冊。郵件服務確認且雲端留存紀錄後才標記已寄送；不代表收件人已閱讀。</p>'+
  '<div class="om-controls"><label>加班月份<input id="omMonth" type="month" value="'+esc(ctx.month()||'')+'"></label>'+
  '<label>寄送收件人<select id="omRecipient"><option value="">讀取核准名單中…</option></select></label>'+
  '<button id="omReload" type="button">重新核對雲端</button></div>'+
  '<div id="omCount" class="om-hint"></div>'+
  '<div class="om-main"><table><thead><tr><th>申報日期</th><th>姓名／工號</th><th>加班類型／時段</th><th>時數</th><th>郵件狀態</th><th>操作</th></tr></thead><tbody id="omRows"></tbody></table></div>'+
  '<div id="omMessage" class="om-message" role="status"></div>';
 g.document.body.appendChild(el);el.showModal();
 const q=s=>el.querySelector(s);
 let busy=false,ready=false,rows=[],receipts=[],recipients=[],lastMonth='',account=ctx.identity();
 const message=t=>{q('#omMessage').textContent=t};
 const guard=()=>{if(account!==ctx.identity()||!ctx.canSend())throw Error('登入身分或寄送權限已變更，請重新開啟')};
 const selected=()=>q('#omRecipient').value;
 function paint(){
  q('#omCount').textContent=ready?'符合條件 '+rows.length+' 筆有效申報':'請先從雲端核對';
  q('#omRows').innerHTML=ready&&rows.length?rows.map((r,i)=>{
   const state=receiptStatus(r,receipts,selected());
   const label={sent:'已寄送此版本',stale:'舊版已寄／須重寄',pending:'寄送結果待核對',new:'尚未寄給此人'}[state.kind];
   const tip=state.receipt?(state.receipt.recipientName||'')+'／'+(state.receipt.sentAt||'待核對'):'尚未留存寄送紀錄';
   return '<tr><td>'+esc(r.date)+'</td><td>'+esc(r.name)+'<div style="font-size:11px;color:#64748b">'+esc(r.empId)+'</div></td>'+
    '<td>'+esc(r.type)+'<div style="font-size:11px;color:#64748b">'+esc(r.code)+'</div></td>'+
    '<td>'+esc(r.hours)+' 小時</td><td title="'+esc(tip)+'"><span class="om-state '+state.kind+'">'+label+'</span></td>'+
    '<td><button class="om-send" type="button" data-send="'+i+'" '+(busy||!selected()||state.kind==='sent'||state.kind==='pending'?'disabled':'')+'>'+
    (state.kind==='stale'?'重新寄送':'寄給會計')+'</button></td></tr>';
  }).join(''):'<tr><td colspan="6">'+(ready?'這個月份沒有可寄送的有效申報':'正在核對寄送權限與加班申報')+'</td></tr>';
  for(const id of ['omClose','omMonth','omRecipient','omReload'])q('#'+id).disabled=busy;
 }
 async function load(){
  guard();ready=false;rows=[];receipts=[];paint();
  const month=q('#omMonth').value;
  if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month))throw Error('請選擇正確月份');
  message('正在核對收件人、申報版本與雲端寄送紀錄…');
  const config=await ctx.request('getOvertimeMailOptions',{month});guard();
  if(config.overtimeMailVersion!==1||!Array.isArray(config.recipients)||!Array.isArray(config.receipts))
   throw Error('雲端尚未啟用安全寄信與稽核紀錄，已禁止寄送');
  recipients=config.recipients.filter(r=>r.id&&r.name&&r.email);
  const priorSelection=selected();
  q('#omRecipient').innerHTML='<option value="">請選擇收件人</option>'+recipients.map(r=>
    '<option value="'+esc(r.id)+'">'+esc(r.name+'（'+r.email+'）')+'</option>').join('');
  if(recipients.some(r=>r.id===priorSelection))q('#omRecipient').value=priorSelection;
  receipts=config.receipts;
  const snapshot=await ctx.snapshot(month);guard();
  rows=collect(snapshot,ctx.employees(),month);ready=true;lastMonth=month;paint();
  message(recipients.length?'已讀取雲端核准名單與有效申報，選擇收件人後逐筆寄送。':'尚未設定會計收件人，請管理員先完成雲端安全名單設定。');
 }
 q('#omClose').onclick=()=>el.close();el.onclose=()=>el.remove();
 q('#omRecipient').onchange=paint;
 q('#omMonth').onchange=()=>{ready=false;rows=[];receipts=[];paint();message('月份已變更，請按重新核對雲端。')};
 q('#omReload').onclick=async()=>{if(busy)return;busy=true;paint();
  try{await load()}catch(error){ready=false;rows=[];message('目前無法寄送：'+(error.message||error))}
  finally{busy=false;paint()}
 };
 q('#omRows').onclick=async event=>{
  const index=event.target.closest('[data-send]')?.dataset.send;
  if(index===undefined||busy||!ready||q('#omMonth').value!==lastMonth)return;
  const row=rows[Number(index)],recipient=recipients.find(r=>r.id===selected());
  if(!row||!recipient)return;
  const state=receiptStatus(row,receipts,recipient.id);
  if(['sent','pending'].includes(state.kind))return;
  if(!g.confirm('確認寄送加班申報給 '+recipient.name+'（'+recipient.email+'）？\n\n'+
     row.name+'｜'+row.date+'｜'+row.type+'｜'+row.code+'｜'+row.hours+' 小時\n申報編號：'+row.id+
     (state.kind==='stale'?'\n注意：舊版曾寄送，請會計以最新通知為準。':'')))return;
  busy=true;paint();message('正在寄送並核對雲端回條，請勿重複點擊…');
  try{
   guard();
   const requestId='otmail_'+(g.crypto?.randomUUID?.()||String(Date.now())+'_'+Math.random().toString(36).slice(2));
   const sent=await ctx.request('sendOvertimeAccountingMail',
    {empId:row.empId,date:row.date,reportId:row.id,recipientId:recipient.id,expectedReport:row.report,requestId});
   guard();
   if(sent.overtimeMailVersion!==1||sent.sent!==true||sent.receipt?.status!=='sent'||
       sent.receipt.reportId!==row.id||sent.receipt.recipientId!==recipient.id)
    throw Error('伺服器未提供可確認的寄送回條');
   const checked=await ctx.request('getOvertimeMailOptions',{month:lastMonth});guard();
   if(checked.overtimeMailVersion!==1||!checked.receipts?.some(r=>
     r.status==='sent'&&r.requestId===sent.receipt.requestId&&receiptStatus(row,[r],recipient.id).kind==='sent'))
    throw Error('寄送已回覆成功，但稽核讀回未完成；請查核紀錄，勿直接重送');
   receipts=checked.receipts;paint();
   message('雲端已確認郵件服務接受寄送並保存紀錄。考勤日期會顯示已寄送（不代表對方已閱讀）。');
   try{g.localStorage?.setItem('p79_overtime_mail_updated_v1',JSON.stringify({month:lastMonth,at:Date.now()}))}catch(_){}
   ctx.onSent?.(lastMonth);
  }catch(error){message('寄送結果未確認：'+(error.message||error)+'。請先重新核對雲端或請會計查收，避免重複發信。')}
  finally{busy=false;paint()}
 };
 paint();q('#omReload').click();
}
g.P79OvertimeMail={canonical,collect,receiptStatus,open};
})(window);

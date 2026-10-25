(function(g){
'use strict';
const uid=x=>String(x||'').trim().toUpperCase(),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round=x=>Math.round((x+Number.EPSILON)*100)/100,fmt=x=>x===null?'待核對':String(round(x));
function dates(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('請選擇月份');return Array.from({length:new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate()},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));}
function leaveDays(leaves,empId,month){
 const selected=new Set(dates(month)),byDate=new Map(),seen=new Set();
 for(const l of leaves){if(uid(l.empId)!==uid(empId))continue;if(l.id&&seen.has(String(l.id)))continue;if(l.id)seen.add(String(l.id));
  const start=String(l.start||'').slice(0,10),end=String(l.end||start).slice(0,10),a=Date.parse(start+'T00:00:00Z'),b=Date.parse(end+'T00:00:00Z'),n=Math.round((b-a)/86400000)+1,total=Number(l.days);
  if(!Number.isFinite(a)||!Number.isFinite(b)||new Date(a).toISOString().slice(0,10)!==start||new Date(b).toISOString().slice(0,10)!==end||n<1||n>3660||!Number.isFinite(total)||total<0||total>n)throw Error('請假天數或日期待核對');
  const perDay=total/n;
  for(let i=0;i<n;i++){const d=new Date(a+i*86400000).toISOString().slice(0,10);if(selected.has(d))byDate.set(d,Math.min(1,(byDate.get(d)||0)+perDay));}
 }
 return round([...byDate.values()].reduce((a,b)=>a+b,0));
}
function model(snapshot,people,month,manual={},collect){
 if(!Array.isArray(snapshot.approvedLeaves)||!Array.isArray(snapshot.schedules))throw Error('請假或班表資料未完成讀取');
 const ds=dates(month),rank={領班:0,船上指揮手:1,指揮手:1,AQC:2,ARMG:3,'F/L':4};
 return [...people].sort((a,b)=>(rank[a.jobTitle]??99)-(rank[b.jobTitle]??99)||uid(a.empId).localeCompare(uid(b.empId),'en',{numeric:true})||String(a.name||'').localeCompare(String(b.name||''),'zh-Hant-u-co-stroke')).map(emp=>{
  const input=manual.people?.[uid(emp.empId)]||{},days=leaveDays(snapshot.approvedLeaves,emp.empId,month),raw=input.efficiency===undefined||input.efficiency===''?(manual.efficiency??''):input.efficiency,eff=raw===''?null:Number(raw);
  if(eff!==null&&(!Number.isFinite(eff)||eff<0))throw Error('人工效率須為非負數');
  const result=collect([snapshot],[emp],ds,'',[],'actual');
  const converted=result.issues.length||result.rows.some(r=>r.converted===null)?null:round(result.rows.reduce((n,r)=>n+r.converted,0));
  const factor=Math.max(0,30-days);
  return {empId:emp.empId,name:emp.name,job:emp.jobTitle||emp.role||'',efficiency:eff,override:input.efficiency??'',leave:days,factor,adjusted:eff===null?null:round(eff*(days?factor/30:1)),converted,containers:input.containers??'',note:input.note||'',issues:result.issues};
 });
}
function filterPeople(people,prefixes=null){return prefixes===null?people.slice():people.filter(e=>prefixes.some(prefix=>uid(e.empId).startsWith(prefix)));}
const blankZero=x=>x!==null&&x!==undefined&&x!==''&&Number(x)===0?'':x??'';
const DEFAULT_HEADERS=['編號','員工編號','職稱','員工姓名','效率','櫃數','加班換算時數','備註'];
const WIDTHS=[5,14,12,10,8,4,4,4,4,2,2,2,2,2,13,12];
function reportSettings(manual={},month){return {title:String(manual.title||((Number(month.slice(0,4))-1911)+'年'+Number(month.slice(5))+'月 79W效率表(專案獎金)')),headers:DEFAULT_HEADERS.map((x,i)=>String(manual.headers?.[i]||x)),signatures:['副總','協理','經理'].map((x,i)=>String(manual.signatures?.[i]||x))};}
function paginate(rows){const pages=[];for(let i=0;i<Math.max(1,rows.length);i+=30){const page=rows.slice(i,i+30);while(page.length<30)page.push(null);pages.push(page);}return pages;}
function rowHtml(r,i,print=false){
 const input=(field,value)=>print?esc(field==='note'?value:blankZero(value)):'<input aria-label="'+esc(r.name)+' '+(field==='efficiency'?'效率':field==='containers'?'櫃數':'備註')+'" data-id="'+esc(uid(r.empId))+'" data-field="'+field+'" '+(field==='note'?'type="text"':'type="number" min="0" step="0.01"')+' style="width:100%;min-width:0;box-sizing:border-box;border:0!important;border-radius:0!important;background:transparent!important;text-align:center;padding:2px" value="'+esc(field==='note'?value:blankZero(value))+'">';
 const cells=r?[{v:i+1},{v:esc(r.empId)},{v:esc(r.job)},{v:esc(r.name)},
  {v:input('efficiency',r.efficiency)}, {v:r.leave?'×':''}, {v:r.leave?blankZero(r.factor):''}, {v:r.leave?'/':''}, {v:r.leave?30:''},
  {v:input('containers',r.containers),span:5},{v:r.converted===null?'待核對':blankZero(round(r.converted))},{v:input('note',r.note)}]:Array.from({length:12},(_,j)=>({v:'',...(j===9?{span:5}:{})}));
 return '<tr>'+cells.map((c,j)=>'<td'+(c.span?' colspan="'+c.span+'"':'')+' style="padding:2px;height:30px;border:1px solid #94a3b8;'+(j>=4&&j<=8?'border-left:0;'+(j<8?'border-right:0;':''):'')+'text-align:center;overflow:hidden">'+c.v+'</td>').join('')+'</tr>';
}
function reportHtml(rows,month,manual={},print=false){const cfg=reportSettings(manual,month),pages=paginate(rows);
 return pages.map((page,p)=>'<section class="pb-page"><h2>'+esc(cfg.title)+'</h2><table class="pb-table"><colgroup>'+WIDTHS.map(w=>'<col style="width:'+w+'%">').join('')+'</colgroup><thead><tr>'+cfg.headers.map((label,i)=>'<th'+([4,5].includes(i)?' colspan="5"':'')+'>'+esc(label)+'</th>').join('')+'</tr></thead><tbody>'+page.map((r,i)=>rowHtml(r,p*30+i,print)).join('')+'</tbody></table><table class="pb-signatures"><tbody><tr>'+cfg.signatures.map(x=>'<td>'+esc(x)+'：</td>').join('')+'</tr><tr>'+cfg.signatures.map(()=>'<td style="height:48px"></td>').join('')+'</tr></tbody></table><div class="pb-page-number">第 '+(p+1)+' / '+pages.length+' 頁</div></section>').join('');
}
const reportCss='.pb-page{background:white;color:#18314b;margin:12px 0 22px;break-inside:avoid}.pb-page h2{font-size:18px;text-align:center;margin:10px 0}.pb-table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:12px}.pb-table th{border:1px solid #94a3b8;background:#eef2f6;padding:5px 2px;font-weight:600;white-space:normal}.pb-signatures{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:0;font-size:13px}.pb-signatures td{border:1px solid #94a3b8;padding:4px 7px;text-align:left;vertical-align:top}.pb-page-number{text-align:right;font-size:11px;margin-top:4px}@media print{@page{size:A4 portrait;margin:10mm}.pb-page{break-after:page;margin:0}.pb-page:last-child{break-after:auto}.pb-page h2{font-size:14px;margin:0 0 3mm}.pb-table{font-size:9px}.pb-table td{height:6mm!important;padding:1px!important}.pb-table th{height:7mm}.pb-signatures{font-size:11px}.pb-signatures td{height:7mm}.pb-page-number{font-size:9px}}';
function excelRows(rows,month,manual={}){const cfg=reportSettings(manual,month),h=cfg.headers;const output=[[cfg.title],[],[],[h[0],h[1],h[2],h[3],h[4],'','','','',h[5],'','','','',h[6],h[7]]];
 rows.forEach((r,i)=>output.push(r?[i+1,r.empId,r.job,r.name,blankZero(r.efficiency),r.leave?'X':'',r.leave?blankZero(r.factor):'',r.leave?'/':'',r.leave?30:'',blankZero(r.containers),'','','','',r.converted===null?'待核對':blankZero(r.converted),r.note]:Array(16).fill('')));return output;}
function excelSheet(rows,month,manual={}){
 const cfg=reportSettings(manual,month),pages=paginate(rows),out={rows:[],heights:[],widths:WIDTHS.map(w=>w*.93),merges:[],breaks:[]};
 pages.forEach((page,p)=>{
  const base=out.rows.length,values=excelRows(page,month,manual);
  page.forEach((r,i)=>{if(r)values[i+4][0]=p*30+i+1;});
  values.push([cfg.signatures[0]+'：','','','','',cfg.signatures[1]+'：','','','','',cfg.signatures[2]+'：']);
  values.push([]);values.push(['第 '+(p+1)+' / '+pages.length+' 頁']);
  values.forEach((values,r)=>{
   out.rows.push(Array.from({length:16},(_,c)=>({value:values[c]??'',style:r<3?1:r===3?2:r<34?(c>=4&&c<=7?4:c===8?5:3):r<36?6:7})));
   out.heights.push(r<3?10:r===3?24:r<34?17.01:r===34?20:r===35?36:12);
  });
  const merge=(a,b,c,d)=>out.merges.push(String.fromCharCode(65+a)+(base+b+1)+':'+String.fromCharCode(65+c)+(base+d+1));
  merge(0,0,15,2);merge(4,3,8,3);merge(9,3,13,3);
  for(let i=4;i<34;i++)merge(9,i,13,i);
  for(const r of [34,35]){merge(0,r,4,r);merge(5,r,9,r);merge(10,r,15,r);}
  merge(0,36,15,36);
  if(p<pages.length-1){out.rows.push(Array.from({length:16},()=>({value:'',style:0})));out.heights.push(8);out.breaks.push(out.rows.length);}
 });
 return out;
}
const dialogCss=`
#p79ProjectBonus{padding:0!important;border:1px solid #dbe4ef!important;border-radius:16px!important;box-shadow:0 24px 80px #16324f40;background:#f5f7fb!important;overflow:auto;font:14px/1.5 sans-serif}
#p79ProjectBonus::backdrop{background:#142b4966}
#p79ProjectBonus .pb-dialog-head{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;background:#fff;border-bottom:1px solid #dfe7f1}
#p79ProjectBonus .pb-dialog-head h1{margin:0;font-size:22px;font-weight:750;letter-spacing:.4px;color:#173650}
#p79ProjectBonus .pb-dialog-head p{margin:3px 0 0;color:#708198;font-size:12px}
#p79ProjectBonus .pb-dialog-body{padding:18px 24px 24px;display:grid;gap:16px}
#p79ProjectBonus .pb-card{background:#fff;border:1px solid #dce5ef;border-radius:12px;padding:16px 18px;box-shadow:0 2px 5px #23496b04}
#p79ProjectBonus .pb-card h2{font-size:14px;font-weight:750;color:#29475e;margin:0 0 12px}
#p79ProjectBonus .pb-controls{display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:18px;align-items:start}
#p79ProjectBonus .pb-controls>label,#p79ProjectBonus .pb-settings label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#60738a;font-weight:600;min-width:0}
#p79ProjectBonus .pb-controls input:not([type=checkbox]),#p79ProjectBonus .pb-settings input{width:100%!important;min-width:0;box-sizing:border-box;height:40px!important;padding:8px 11px!important;border:1px solid #cbd8e5!important;border-radius:7px!important;background:#fff!important;color:#18364d!important;font:14px sans-serif!important;box-shadow:none!important}
#p79ProjectBonus .pb-controls input:focus,#p79ProjectBonus .pb-settings input:focus{outline:2px solid #b4dafb;outline-offset:1px;border-color:#3986bc!important}
#p79ProjectBonus .pb-controls fieldset{margin:0;padding:0;border:0;min-width:0}
#p79ProjectBonus .pb-controls legend{padding:0;margin:0 0 6px;font-size:12px;color:#60738a;font-weight:600}
#p79ProjectBonus .pb-prefixes{display:flex;align-items:center;gap:8px;min-height:40px}
#p79ProjectBonus .pb-prefixes label{display:inline-flex;align-items:center;gap:7px;border:1px solid #d4e0eb;border-radius:7px;padding:8px 11px;color:#304a62;background:#f9fbfe;cursor:pointer}
#p79ProjectBonus .pb-prefixes label:has(input:checked){background:#edf6ff;border-color:#9cc7e7;color:#155f96}
#p79ProjectBonus .pb-prefixes input{width:15px;height:15px;margin:0;accent-color:#216fa5}
#p79ProjectBonus .pb-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid #edf1f6}
#p79ProjectBonus .pb-actions button,#p79ProjectBonus #pbClose{height:38px;padding:8px 15px!important;border:1px solid #cbd8e5!important;border-radius:7px!important;background:#fff!important;color:#2d4e68!important;font:600 13px sans-serif!important;cursor:pointer;white-space:nowrap}
#p79ProjectBonus #pbLoad{background:#196f9c!important;border-color:#196f9c!important;color:#fff!important}
#p79ProjectBonus #pbExport{background:#edf8f3!important;border-color:#b8decd!important;color:#226a4d!important}
#p79ProjectBonus .pb-actions button:disabled{opacity:.45;cursor:default}
#p79ProjectBonus .pb-settings .pb-title-field{margin-bottom:14px}
#p79ProjectBonus #pbLabels{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
#p79ProjectBonus .pb-stamp-labels{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:3px;padding-top:13px;border-top:1px solid #edf1f6}
#p79ProjectBonus #pbStatus{padding:9px 12px;border:1px solid #d9e7f3;background:#edf5fb;border-radius:7px;color:#37617f;font-size:13px}
#p79ProjectBonus .pb-help{margin:0;color:#78899b;font-size:12px}
#p79ProjectBonus #pbRows{padding:0 8px;background:#fff;border-radius:10px;border:1px solid #dce5ef}
#p79ProjectBonus #pbRows:empty{display:none}
@media(max-width:760px){#p79ProjectBonus .pb-dialog-head{padding:16px}#p79ProjectBonus .pb-dialog-body{padding:12px}#p79ProjectBonus .pb-controls{grid-template-columns:1fr;gap:12px}#p79ProjectBonus #pbLabels{grid-template-columns:repeat(2,minmax(0,1fr))}#p79ProjectBonus .pb-stamp-labels{grid-template-columns:1fr}#p79ProjectBonus .pb-actions button{flex:1 1 40%}}
`;
function dialogHtml(){return '<style>'+dialogCss+reportCss+'</style><header class="pb-dialog-head"><div><h1>79號碼頭專案獎金</h1><p>每月效率與加班換算報表</p></div><button id="pbClose" aria-label="關閉專案獎金">關閉</button></header><div class="pb-dialog-body"><section class="pb-card"><h2>查詢與效率</h2><div class="pb-controls"><label>報表月份<input id="pbMonth" type="month"></label><fieldset><legend>員工編號篩選</legend><div class="pb-prefixes"><label><input id="pbAll" type="checkbox" checked>全部</label><label><input id="pbAN" type="checkbox" checked>AN</label><label><input id="pbAP" type="checkbox" checked>AP</label></div></fieldset><label>效率（人工填寫）<input id="pbEfficiency" type="number" min="0" step="0.01" placeholder="輸入本月效率"></label></div><div class="pb-actions"><button id="pbLoad">讀取請假及加班時數</button><button id="pbSave" title="儲存在目前瀏覽器">儲存人工欄位</button><button id="pbExport" disabled>匯出專案獎金</button><button id="pbPrint" disabled>列印／另存 PDF</button></div></section><section class="pb-card pb-settings"><h2>報表抬頭與欄位名稱</h2><label class="pb-title-field">每頁抬頭<input id="pbTitle" maxlength="120"></label><div id="pbLabels"></div></section><div id="pbStatus" role="status">請選月份並讀取資料。</div><p class="pb-help">請假依已核准紀錄折算，公司每月固定30天。效率格可直接修改；未另填時沿用上方效率。</p><div id="pbRows" style="overflow:auto;max-height:62vh"></div></div>';}
async function open(){
 const a=g.p79ProjectBonusContext;if(!a?.canOpen())return alert('沒有專案獎金檢視或匯出權限');if(document.getElementById('p79ProjectBonus'))return;
 const el=document.createElement('dialog');el.id='p79ProjectBonus';el.style.cssText='width:min(1200px,96vw);max-height:90vh;padding:18px;border:0;border-radius:12px;color:#18314b;background:#fff';
 el.innerHTML=dialogHtml();
 document.body.appendChild(el);el.showModal();const q=s=>el.querySelector(s),status=x=>q('#pbStatus').textContent=x;let snapshot=null,rows=[],manual={},busy=false,loadedMonth='';
 const account=a.account(),session=a.session(),valid=()=>a.canOpen()&&a.account()===account&&a.session()===session,key=()=> 'port79_project_bonus_v1|'+account+'|'+q('#pbMonth').value;
 function readManual(){try{manual=JSON.parse(g.localStorage.getItem(key())||'{}')||{};}catch(_){manual={};}q('#pbEfficiency').value=manual.efficiency??'';const cfg=reportSettings(manual,q('#pbMonth').value);q('#pbTitle').value=cfg.title;q('#pbLabels').innerHTML=cfg.headers.map((x,i)=>'<label>'+esc(DEFAULT_HEADERS[i])+'欄位名稱<input data-kind="headers" data-index="'+i+'" maxlength="40" value="'+esc(x)+'" style="width:100px"></label>').join('')+'<div class="pb-stamp-labels">'+cfg.signatures.map((x,i)=>'<label>用印 '+(i+1)+' 名稱<input data-kind="signatures" data-index="'+i+'" maxlength="40" value="'+esc(x)+'" style="width:100px"></label>').join('')+'</div>';}
 function reset(){snapshot=null;rows=[];loadedMonth='';q('#pbRows').innerHTML='';q('#pbExport').disabled=q('#pbPrint').disabled=true;readManual();}
 function update(){if(!snapshot)return;const prefixes=q('#pbAll').checked?null:['AN','AP'].filter(prefix=>q('#pb'+prefix).checked);rows=model(snapshot,filterPeople(a.employees(),prefixes),loadedMonth,manual,g.P79OvertimeApplication.collect);q('#pbRows').innerHTML=rows.length?reportHtml(rows,loadedMonth,manual):'<p>目前勾選範圍沒有可列出的人員。</p>';q('#pbExport').disabled=q('#pbPrint').disabled=!rows.length;}
 q('#pbMonth').value=a.month()||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date()).slice(0,7);readManual();
 q('#pbAll').onchange=()=>{q('#pbAN').checked=q('#pbAP').checked=q('#pbAll').checked;update();};for(const prefix of ['AN','AP'])q('#pb'+prefix).onchange=()=>{q('#pbAll').checked=q('#pbAN').checked&&q('#pbAP').checked;update();};
 q('#pbTitle').oninput=()=>{manual.title=q('#pbTitle').value;update();};q('#pbLabels').oninput=e=>{const kind=e.target.dataset.kind,index=Number(e.target.dataset.index);if(!['headers','signatures'].includes(kind))return;manual[kind]=manual[kind]||[];manual[kind][index]=e.target.value;update();};
 q('#pbMonth').onchange=()=>{reset();status('月份已變更，請重新讀取。');};q('#pbEfficiency').oninput=()=>{manual.efficiency=q('#pbEfficiency').value;try{update();}catch(e){status(e.message);q('#pbExport').disabled=q('#pbPrint').disabled=true;}};
 q('#pbRows').onchange=e=>{const id=e.target.dataset.id,field=e.target.dataset.field;if(!id||!field)return;manual.people=manual.people||{};manual.people[id]={...(manual.people[id]||{}),[field]:e.target.value};try{update();}catch(err){status(err.message);q('#pbExport').disabled=q('#pbPrint').disabled=true;}};
 q('#pbSave').onclick=()=>{try{if(!valid())throw Error('登入身分已變更');g.localStorage.setItem(key(),JSON.stringify(manual));status('人工欄位已儲存在此瀏覽器；請假與加班資料仍由雲端讀取。');}catch(e){status('儲存失敗：'+e.message);}};
 q('#pbLoad').onclick=async()=>{if(busy)return;busy=true;snapshot=null;rows=[];loadedMonth='';q('#pbRows').innerHTML='';q('#pbExport').disabled=q('#pbPrint').disabled=true;el.querySelectorAll('input,button').forEach(n=>n.disabled=true);const month=q('#pbMonth').value;try{if(!valid())throw Error('登入或權限已變更');dates(month);status('正在讀取 '+month+' 核准請假與正式加班…');const data=await a.snapshot(month);if(!el.isConnected)return;if(!valid()||q('#pbMonth').value!==month)throw Error('月份或登入身分已變更');snapshot=data;loadedMonth=month;update();const issueCount=rows.reduce((n,r)=>n+r.issues.length,0);status('已讀取 '+rows.length+' 人。'+(issueCount?'有 '+issueCount+' 筆加班待核對，相關人員不顯示為0。':''));}catch(e){snapshot=null;status('讀取失敗：'+e.message);}finally{busy=false;el.querySelectorAll('input,button').forEach(n=>n.disabled=false);q('#pbExport').disabled=q('#pbPrint').disabled=!snapshot||!rows.length;}};
 q('#pbExport').onclick=()=>{try{if(!valid()||!snapshot||loadedMonth!==q('#pbMonth').value)throw Error('請重新讀取資料');update();if(!rows.length)throw Error('請勾選要匯出的人員範圍');if(!g.P79BonusXlsx)throw Error('試算表匯出元件尚未載入，請重新整理');g.P79BonusXlsx.download(excelSheet(rows,loadedMonth,manual),'79號碼頭專案獎金_'+loadedMonth+'.xlsx');}catch(e){status('匯出失敗：'+e.message);}};
 q('#pbPrint').onclick=()=>{try{if(!valid()||!snapshot||loadedMonth!==q('#pbMonth').value)throw Error('請重新讀取資料');update();if(!rows.length)throw Error('請勾選要列印的人員範圍');const popup=g.open('','_blank');if(!popup)throw Error('請允許開啟列印視窗');popup.document.write('<!doctype html><html lang="zh-Hant"><meta charset="UTF-8"><title>'+esc(reportSettings(manual,loadedMonth).title)+'</title><style>'+reportCss+'</style><body>'+reportHtml(rows,loadedMonth,manual,true)+'</body></html>');popup.document.close();popup.focus();popup.print();}catch(e){status('列印失敗：'+e.message);}};
 q('#pbClose').onclick=()=>el.close();el.onclose=()=>el.remove();
}
g.P79ProjectBonus={open,dates,leaveDays,model,excelRows,excelSheet,rowHtml,paginate,reportSettings,reportHtml,reportCss,filterPeople,dialogHtml};
})(window);

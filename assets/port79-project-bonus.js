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
 return [...people].sort((a,b)=>(rank[a.jobTitle]??99)-(rank[b.jobTitle]??99)||String(a.name||'').localeCompare(String(b.name||''),'zh-Hant-u-co-stroke')).map(emp=>{
  const input=manual.people?.[uid(emp.empId)]||{},days=leaveDays(snapshot.approvedLeaves,emp.empId,month),raw=input.efficiency===undefined||input.efficiency===''?(manual.efficiency??''):input.efficiency,eff=raw===''?null:Number(raw);
  if(eff!==null&&(!Number.isFinite(eff)||eff<0))throw Error('人工效率須為非負數');
  const result=collect([snapshot],[emp],ds,'',[],'actual');
  const converted=result.issues.length||result.rows.some(r=>r.converted===null)?null:round(result.rows.reduce((n,r)=>n+r.converted,0));
  const factor=Math.max(0,30-days);
  return {empId:emp.empId,name:emp.name,job:emp.jobTitle||emp.role||'',efficiency:eff,override:input.efficiency??'',leave:days,factor,adjusted:eff===null?null:round(eff*(days?factor/30:1)),converted,containers:input.containers??'',note:input.note||'',issues:result.issues};
 });
}
function excelRows(rows,month){const output=[[(Number(month.slice(0,4))-1911)+'年'+Number(month.slice(5))+'月 79W效率表(專案獎金)'],[],[],['編號','員工編號','職稱','員工姓名','效率','','','','','櫃數','','','','','加班換算時數','備註']];
 rows.forEach((r,i)=>output.push([i+1,r.empId,r.job,r.name,r.efficiency??'',r.leave?'X':'',r.leave?r.factor:'',r.leave?'/':'',r.leave?30:'',r.containers,'','','','',r.converted===null?'待核對':r.converted,r.note]));return output;}
async function open(){
 const a=g.p79ProjectBonusContext;if(!a?.canOpen())return alert('沒有專案獎金檢視或匯出權限');if(document.getElementById('p79ProjectBonus'))return;
 const el=document.createElement('dialog');el.id='p79ProjectBonus';el.style.cssText='width:min(1200px,96vw);max-height:90vh;padding:18px;border:0;border-radius:12px;color:#18314b;background:#fff';
 el.innerHTML='<div style="display:flex;justify-content:space-between"><b>79號碼頭專案獎金</b><button id="pbClose">關閉</button></div><div style="display:flex;gap:12px;flex-wrap:wrap;margin:14px 0"><label>月份 <input id="pbMonth" type="month"></label><label>效率（人工填寫） <input id="pbEfficiency" type="number" min="0" step="0.01" style="width:100px"></label><button id="pbLoad">讀取請假及加班時數</button><button id="pbSave">儲存人工欄位（此瀏覽器）</button><button id="pbExport" disabled>匯出 Excel</button></div><div id="pbStatus" role="status">請選月份並讀取資料。</div><p style="font-size:12px;color:#64748b">請假依已核准紀錄；公司固定30天，請假5天顯示 ×25/30。沒請假不顯示折算。個別效率留白時沿用上方效率。</p><div style="overflow:auto;max-height:62vh"><table style="width:100%;border-collapse:collapse;white-space:nowrap;font-size:13px"><thead><tr>'+['編號','員工編號','職稱','姓名','個別效率','效率折算','請假天數','櫃數','加班換算時數','備註'].map(x=>'<th style="padding:8px;border:1px solid #cbd5e1;background:#eef2f6">'+x+'</th>').join('')+'</tr></thead><tbody id="pbRows"></tbody></table></div>';
 document.body.appendChild(el);el.showModal();const q=s=>el.querySelector(s),status=x=>q('#pbStatus').textContent=x;let snapshot=null,rows=[],manual={},busy=false,loadedMonth='';
 const account=a.account(),session=a.session(),valid=()=>a.canOpen()&&a.account()===account&&a.session()===session,key=()=> 'port79_project_bonus_v1|'+account+'|'+q('#pbMonth').value;
 function readManual(){try{manual=JSON.parse(g.localStorage.getItem(key())||'{}')||{};}catch(_){manual={};}q('#pbEfficiency').value=manual.efficiency??'';}
 function reset(){snapshot=null;rows=[];loadedMonth='';q('#pbRows').innerHTML='';q('#pbExport').disabled=true;readManual();}
 function update(){if(!snapshot)return;rows=model(snapshot,a.employees(),loadedMonth,manual,g.P79OvertimeApplication.collect);q('#pbRows').innerHTML=rows.map((r,i)=>'<tr>'+[i+1,esc(r.empId),esc(r.job),esc(r.name),'<input data-id="'+esc(uid(r.empId))+'" data-field="efficiency" type="number" min="0" step="0.01" style="width:76px" value="'+esc(r.override)+'">',(r.efficiency===null?'待填寫':fmt(r.efficiency))+(r.leave?' × '+fmt(r.factor)+' / 30':'') ,fmt(r.leave),'<input data-id="'+esc(uid(r.empId))+'" data-field="containers" type="number" min="0" style="width:70px" value="'+esc(r.containers)+'">',fmt(r.converted),'<input data-id="'+esc(uid(r.empId))+'" data-field="note" style="width:100px" value="'+esc(r.note)+'">'].map(x=>'<td style="padding:5px;border:1px solid #cbd5e1">'+x+'</td>').join('')+'</tr>').join('');q('#pbExport').disabled=false;}
 q('#pbMonth').value=a.month()||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date()).slice(0,7);readManual();
 q('#pbMonth').onchange=()=>{reset();status('月份已變更，請重新讀取。');};q('#pbEfficiency').oninput=()=>{manual.efficiency=q('#pbEfficiency').value;try{update();}catch(e){status(e.message);q('#pbExport').disabled=true;}};
 q('#pbRows').onchange=e=>{const id=e.target.dataset.id,field=e.target.dataset.field;if(!id||!field)return;manual.people=manual.people||{};manual.people[id]={...(manual.people[id]||{}),[field]:e.target.value};try{update();}catch(err){status(err.message);q('#pbExport').disabled=true;}};
 q('#pbSave').onclick=()=>{try{if(!valid())throw Error('登入身分已變更');g.localStorage.setItem(key(),JSON.stringify(manual));status('人工欄位已儲存在此瀏覽器；請假與加班資料仍由雲端讀取。');}catch(e){status('儲存失敗：'+e.message);}};
 q('#pbLoad').onclick=async()=>{if(busy)return;busy=true;snapshot=null;rows=[];loadedMonth='';q('#pbRows').innerHTML='';q('#pbExport').disabled=true;el.querySelectorAll('input,button').forEach(n=>n.disabled=true);const month=q('#pbMonth').value;try{if(!valid())throw Error('登入或權限已變更');dates(month);status('正在讀取 '+month+' 核准請假與正式加班…');const data=await a.snapshot(month);if(!el.isConnected)return;if(!valid()||q('#pbMonth').value!==month)throw Error('月份或登入身分已變更');snapshot=data;loadedMonth=month;update();const issueCount=rows.reduce((n,r)=>n+r.issues.length,0);status('已讀取 '+rows.length+' 人。'+(issueCount?'有 '+issueCount+' 筆加班待核對，相關人員不顯示為0。':''));}catch(e){snapshot=null;status('讀取失敗：'+e.message);}finally{busy=false;el.querySelectorAll('input,button').forEach(n=>n.disabled=false);q('#pbExport').disabled=!snapshot;}};
 q('#pbExport').onclick=async()=>{try{if(!valid()||!snapshot||loadedMonth!==q('#pbMonth').value)throw Error('請重新讀取資料');update();await a.ensureXlsx();const wb=g.XLSX.utils.book_new(),ws=g.XLSX.utils.aoa_to_sheet(excelRows(rows,loadedMonth));ws['!merges']=[{s:{r:0,c:0},e:{r:2,c:15}},{s:{r:3,c:4},e:{r:3,c:8}},{s:{r:3,c:9},e:{r:3,c:13}}];ws['!cols']=[{wch:6},{wch:15},{wch:14},{wch:12},...Array.from({length:5},()=>({wch:7})),{wch:10},...Array.from({length:4},()=>({wch:4})),{wch:18},{wch:20}];g.XLSX.utils.book_append_sheet(wb,ws,'專案獎金');g.XLSX.writeFile(wb,'79號碼頭專案獎金_'+loadedMonth+'.xlsx');}catch(e){status('匯出失敗：'+e.message);}};
 q('#pbClose').onclick=()=>el.close();el.onclose=()=>el.remove();
}
g.P79ProjectBonus={open,dates,leaveDays,model,excelRows};
})(window);

(function(global){
 'use strict';
 const KEY='port79_overtime_report_draft_v1',CONFIG='overtimeConversionRowsV1';
 const types=['休','國','例','代','延'];
 const TYPECONFIG='overtimeReportTypesV1';
 const typeLabel={休:'休息日加班',國:'國定假日加班',例:'例假加班',代:'代班加班',延:'平日延長加班'};
 function typeOptions(config={},rows=[]){const map=new Map(types.map(c=>[typeLabel[c],c]));for(const r of config[TYPECONFIG]||[]){if(!Array.isArray(r)||!types.includes(r[1])||!String(r[0]).trim())throw Error('加班類型設定無效');map.set(String(r[0]).trim(),r[1]);}for(const r of rows)if(r[9])map.set(r[9],r[0]);return [...map].map(([name,category])=>({name,category}));}
 const ruleType=r=>r[9]||typeLabel[r[0]];
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const hour=x=>{const m=String(x).match(/^(\d{2})(?::(\d{2}))?$/);if(!m)return NaN;const h=Number(m[1]),n=Number(m[2]||0);return h<=24&&n<60&&(h!==24||n===0)?h*60+n:NaN};
 const span=(a,b)=>{const x=hour(a),y=hour(b);return Number.isFinite(x)&&Number.isFinite(y)&&x%1440!==y%1440?(y-x+1440)%1440:NaN};
 const time=x=>/^24(?::00)?$/.test(String(x))?'00:00':String(x).includes(':')?x:String(x)+':00';
 // Compact cloud rows: category, code, declared hours, converted hours, normal start/end, overtime start/end, position.
 function defaults(){
  const rest=[['08-16',8,12.7],['10-18',8,12.7],['12-20',8,12.7],['16-24',8,12.7],['24-08',8,12.7],['08-14',6,9.36],['14-20',6,9.36],['08-20',12,23.36],['24-04',4,6.02],['04-08',4,6.02],['08-18',10,18.02],['16-20',4,6.02],['20-22',2,2.68],['20-24',4,6.02],['20-01',5,7.67],['20-02',6,9.36],['20-03',7,11.03],['20-04',8,12.7],['20-05',9,15.35],['20-06',10,18.02],['20-07',11,20.69],['20-08',12,23.36],['14-24',10,18.02],['04-07',3,4.35]];
  const national=[['08-14',8,8],['14-20',8,8],['20-24',8,8],['24-04',8,8],['08-16',8,8],['04-08',8,8],['20-05',9,9.33],['20-06',10,10.68],['20-07',11,12.03],['16-24',8,8],['24-08',8,8],['10-18',8,8],['20-04',8,8]];
  const out=[...rest.map(r=>['休','休'+r[0],r[1],r[2],'','',...r[0].split('-'),'full']),...national.map(r=>['國','國'+r[0],r[1],r[2],'','',...r[0].split('-'),'full'])];
  out.push(['代','代08-16',8,'','','','08','16','full'],['延','代16-20',4,'','08','16','16','20','after'],['延','代20-08',4,'','24','08','20','24','before']);
  return out;
 }
 function validate(rows){
  if(!Array.isArray(rows)||rows.length>150)throw Error('換算表必須為表格，最多150筆');
  const seen=new Set();
  return rows.map((r,i)=>{
   if(!Array.isArray(r)||![9,10].includes(r.length))throw Error('第'+(i+1)+'列格式錯誤');
   const v=r.map(x=>String(x??'').trim()),code=v[1];
   if(!types.includes(v[0])||!/^.{1,12}?\d{2}(?::\d{2})?-\d{2}(?::\d{2})?$/.test(code))throw Error('第'+(i+1)+'列類型或代碼有誤');
   const key=(v[9]||typeLabel[v[0]])+'|'+code;if(seen.has(key))throw Error('同一加班類型的出勤時段重複：'+code);seen.add(key);
   if(!(Number(v[2])>0&&Number(v[2])<=24)||v[3]!==''&&!(Number.isFinite(Number(v[3]))&&Number(v[3])>=0&&Number(v[3])<=100))throw Error(code+' 時數無效');
   if(!Number.isFinite(span(v[6],v[7])))throw Error(code+' 加班起迄時間無效');
   if(v[0]==='延'){
    if(!['before','after'].includes(v[8])||span(v[4],v[5])!==480)throw Error(code+' 正常班須為8小時，並選擇班前或班後');
    if(v[8]==='before'&&hour(v[7])%1440!==hour(v[4])%1440||v[8]==='after'&&hour(v[5])%1440!==hour(v[6])%1440)throw Error(code+' 正常班與加班必須相接');
   }else{v[4]='';v[5]='';v[8]='full';}
   const label=code.match(/(\d{2}(?::\d{2})?)-(\d{2}(?::\d{2})?)$/);
   if(v[0]!=='延'&&(hour(label[1])%1440!==hour(v[6])%1440||hour(label[2])%1440!==hour(v[7])%1440))throw Error(code+' 代碼時段與加班時段不一致');
   if(v[0]==='延'&&v[8]==='before'&&(hour(label[1])%1440!==hour(v[6])%1440||hour(label[2])%1440!==hour(v[5])%1440))throw Error(code+' 班前加班代碼須包含完整出勤時段');
   if(v.length===10&&(!v[9]||v[9]===typeLabel[v[0]]))v.pop();
   return v;
  });
 }
 function normalizeStored(value){return value===undefined?defaults():validate(value);}
 function report(row){
  const r=validate([row])[0];return {version:1,category:r[0],typeName:ruleType(r),code:r[1],declaredHours:Number(r[2]),convertedHours:r[3]===''?null:Number(r[3]),normalStart:r[4],normalEnd:r[5],overtimeStart:r[6],overtimeEnd:r[7],position:r[8]};
 }
 function interval(date,start,end,offset=0){
  const base=Date.parse(date+'T00:00:00+08:00'),a=hour(start),duration=span(start,end);
  if(!Number.isFinite(base)||!Number.isFinite(duration))throw Error('日期或時段無效');
  const x=base+(a+offset*1440)*60000;return [x,x+duration*60000];
 }
 function overtimeMinutes(start,end,date,meta){
  const r=meta?.overtimeReport;if(!r||!(end>start))return null;
  let offset=0;
  if(r.position==='after'){
   const normal=interval(date,r.normalStart,r.normalEnd);
   const base=Date.parse(date+'T00:00:00+08:00');offset=Math.floor((normal[1]-base)/86400000);
  }
  const[a,b]=interval(date,r.overtimeStart,r.overtimeEnd,offset);
  return Math.max(0,Math.floor((Math.min(end,b)-Math.max(start,a))/60000));
 }
 function matchReport(start,end,date,map){
  const direct=map?.[date]||null,base=Date.parse(date+'T00:00:00+08:00');
  if(!Number.isFinite(base))return {meta:direct,date,minutes:null};
  let best=null;
  for(const offset of [-1,0,1]){
   // toISOString is UTC; restore Taipei date for the logical roster day.
   const key=new Date(base+offset*86400000+8*3600000).toISOString().slice(0,10);
   const meta=map?.[key];if(!meta?.overtimeReport)continue;
   const minutes=overtimeMinutes(start,end,key,meta);
   if(minutes>0&&(!best||minutes>best.minutes))best={meta,date:key,minutes};
  }
  return best||{meta:direct,date,minutes:direct?.overtimeReport?overtimeMinutes(start,end,date,direct):null};
 }
 function auth(){
  const token=sessionStorage.getItem('port79_user_token')||sessionStorage.getItem('port79_admin_token')||sessionStorage.getItem('port79_gc_superadmin_token')||sessionStorage.getItem('port79_gc_token')||'';
  const url=global.p79OvertimeContext?.gasUrl?.();if(!url||!token)throw Error('請先登入管理員');return {url,token};
 }
 async function rpc(action,payload){
  const {url,token}=auth(),ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),45000);
  try{const endpoint=payload?url:url+'?action='+encodeURIComponent(action)+'&token='+encodeURIComponent(token)+'&gcToken='+encodeURIComponent(token)+'&t='+Date.now();
   const options=payload?{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,action,token,gcToken:token,userToken:token})}:{cache:'no-store'};
   const res=await fetch(endpoint,{...options,signal:ctl.signal});if(!res.ok)throw Error('雲端HTTP '+res.status);
   const d=await res.json();if(d?.ok!==true)throw Error(d?.error||'雲端未確認成功');return d;
  }finally{clearTimeout(timer)}
 }
 function reportRules(){
  const config=global.p79OvertimeContext?.config?.();
  if(config&&Object.prototype.hasOwnProperty.call(config,CONFIG))return normalizeStored(config[CONFIG]);
  return defaults();
 }
 function filterReportEmployees(people,department='',jobTitle=''){
  const dept=e=>String(e.dept||'一般'),title=e=>String(e.jobTitle||e.deptDetail||'未設定');
  const unique=xs=>[...new Set(xs)].sort((a,b)=>a.localeCompare(b,'zh-Hant',{numeric:true}));
  const scoped=people.filter(e=>!department||dept(e)===department);
  return {departments:unique(people.map(dept)),jobTitles:unique(scoped.map(title)),employees:scoped.filter(e=>!jobTitle||title(e)===jobTitle)};
 }
 async function loadRules(){const d=await rpc('getData');if(!d.config||typeof d.config!=='object')throw Error('雲端設定不完整，未使用預設值覆蓋');return {config:d.config,rows:normalizeStored(d.config[CONFIG])};}
 function dialog(title,content,id='p79OvertimeDialog'){
  const previous=document.getElementById(id);previous?.p79Cleanup?.();previous?.remove();
  const el=document.createElement('dialog');el.id=id;el.className='p79-overtime-dialog';el.style.cssText='box-sizing:border-box;width:min(1200px,calc(100vw - 32px));max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);padding:20px;border:1px solid #cbd5e1;border-radius:16px;color:#0f172a;background:white;overflow:auto;text-align:center;';
  el.innerHTML=`<style>
   .p79-overtime-dialog,.p79-overtime-dialog *{box-sizing:border-box!important}
   .p79-overtime-dialog[open]{display:flex;flex-direction:column;gap:10px}
   .p79-overtime-dialog>div,.p79-overtime-dialog>p{min-width:0;max-width:100%;flex-shrink:0}
   .p79-overtime-dialog p,.p79-overtime-dialog h2,.p79-overtime-dialog label,.p79-overtime-dialog th,.p79-overtime-dialog td{text-align:center!important}
   .p79-overtime-dialog input,.p79-overtime-dialog select{min-width:0!important;max-width:100%!important;text-align:center!important}
   .p79-overtime-dialog label{min-width:0}
   .p79-ot-dialog-header{position:relative;display:flex;align-items:center;justify-content:center;min-height:36px;padding:0 90px}
   .p79-ot-dialog-header h2{margin:0;font-size:20px;font-weight:900}
   .p79-ot-dialog-header button{position:absolute;right:0;top:50%;transform:translateY(-50%)}
   .p79-overtime-dialog button{max-width:100%;white-space:normal;text-align:center}
   .p79-ot-new-type-controls,.p79-ot-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px}
   .p79-ot-actions{position:sticky;bottom:0;z-index:4;margin-top:6px;padding:10px 0;background:white}
   #p79OvertimeOptionsDialog .p79-ot-table-wrap{flex:1 1 auto;min-height:120px;max-height:55vh;width:100%;overflow:auto;overscroll-behavior:contain;border:1px solid #e2e8f0;border-radius:8px}
   #p79OvertimeOptionsDialog table{width:100%!important;min-width:1000px!important;max-width:none!important;table-layout:fixed;border-collapse:collapse}
   #p79OvertimeOptionsDialog th{position:sticky;top:0;z-index:2;white-space:normal!important;overflow-wrap:anywhere;vertical-align:middle;padding:8px 4px!important}
   #p79OvertimeOptionsDialog td{padding:6px 4px!important;vertical-align:middle;overflow:hidden}
   #p79OvertimeOptionsDialog th:first-child{width:6%}
   #p79OvertimeOptionsDialog th:nth-child(2){width:11%}
   #p79OvertimeOptionsDialog th:nth-child(9){width:7%}
   #p79OvertimeOptionsDialog th:nth-child(10){width:13%}
   #p79OvertimeOptionsDialog th:last-child{width:6%}
   #p79OvertimeOptionsDialog td input,#p79OvertimeOptionsDialog td select{width:100%!important;padding:7px 3px!important}
   @media(max-width:600px){.p79-overtime-dialog{padding:12px!important;width:calc(100vw - 20px)!important;max-width:calc(100vw - 20px)!important;max-height:calc(100dvh - 20px)!important}.p79-ot-dialog-header{padding:0 65px}.p79-ot-dialog-header h2{font-size:17px}.p79-ot-new-type-controls input,.p79-ot-new-type-controls select{width:100%!important}.p79-ot-actions button{padding:8px!important}}
  </style><div class="p79-ot-dialog-header"><h2>`+esc(title)+'</h2><button type="button" id="p79OtClose">✕ 關閉</button></div>'+content;
  document.body.appendChild(el);el.querySelector('#p79OtClose').onclick=()=>el.close();el.showModal();return el;
 }
 const inputStyle='box-sizing:border-box;width:100%;min-width:0;max-width:100%;text-align:center;padding:7px;border:1px solid #cbd5e1;border-radius:5px;font-size:13px;background:white;color:#0f172a';
 function editorRow(row){return '<tr>'+[...row.slice(0,9),ruleType(row)].map((v,j)=>'<td style="padding:4px">'+(j===0?'<select data-col="0" style="'+inputStyle+'">'+types.map(t=>'<option '+(v===t?'selected':'')+'>'+t+'</option>').join('')+'</select>':j===8?'<select data-col="8" style="'+inputStyle+'">'+[['full','全段'],['after','班後'],['before','班前']].map(([val,label])=>'<option value="'+val+'" '+(v===val?'selected':'')+'>'+label+'</option>').join('')+'</select>':'<input data-col="'+j+'" style="'+inputStyle+'" value="'+esc(v)+'" '+([2,3].includes(j)?'type="number" min="0" step="0.01"':'type="text"')+'>')+'</td>').join('')+'<td><button type="button" class="p79OtDelete">刪除</button></td></tr>';}
 async function openRules(){
  if(!global.p79OvertimeContext?.canEditRules?.()&&!global.p79OvertimeContext?.canReport?.())return alert('沒有管理加班選項的權限');
  const el=dialog('加班選項管理','<p id="p79OtStatus">正在讀取已儲存的選項…</p>','p79OvertimeOptionsDialog');
  try{
   const loaded=global.p79OvertimeContext?.config?.()?{config:global.p79OvertimeContext.config(),rows:reportRules()}:await loadRules();
   const rows=loaded.rows;let loadedRows=JSON.stringify(rows),customTypes=JSON.parse(JSON.stringify(loaded.config[TYPECONFIG]||[])),loadedTypes=JSON.stringify(customTypes);
   el.insertAdjacentHTML('beforeend','<p style="margin:12px 0;color:#475569">依你圖片預填換算值，可自行修改。時間使用08、16、24或08:30。申報時數與時段長度分開保存。空白換算時數表示尚未設定。</p><div class="p79-ot-table-wrap"><table style="width:100%;border-collapse:collapse"><thead><tr>'+['假別','出勤時段','實際加班時數','換算時數','正常起','正常迄','加班起','加班迄','位置','加班類型名稱','操作'].map(t=>'<th style="padding:8px;white-space:nowrap;background:#e0f2fe">'+t+'</th>').join('')+'</tr></thead><tbody id="p79OtRuleRows">'+rows.map(editorRow).join('')+'</tbody></table></div><div class="p79-ot-actions"><button id="p79OtAdd" type="button">＋新增出勤時段</button><button id="p79OtExport" type="button">匯出CSV</button><button id="p79OtSave" type="button" style="background:#0369a1;color:white;padding:8px 18px;border-radius:8px">儲存加班類型與出勤時段</button></div>');
   el.querySelector('#p79OtStatus').insertAdjacentHTML('afterend','<div style="padding:12px;margin:12px 0;background:#f0f9ff;border-radius:10px"><b>新增加班類型</b><div class="p79-ot-new-type-controls" style="margin-top:8px"><input id="p79NewTypeName" placeholder="例如：吊櫃作業休息日" maxlength="40" style="'+inputStyle+';width:240px"><select id="p79NewTypeCategory" style="'+inputStyle+';width:170px">'+types.map(c=>'<option value="'+c+'">'+esc(typeLabel[c])+'</option>').join('')+'</select><button type="button" id="p79AddType">新增類型</button></div><p style="font-size:12px;color:#475569">先新增類型，再新增該類型的出勤時段，最後按下方儲存。</p></div>');
   el.querySelector('#p79AddType').onclick=()=>{
    const name=el.querySelector('#p79NewTypeName').value.trim(),category=el.querySelector('#p79NewTypeCategory').value;
    if(!name)return el.querySelector('#p79OtStatus').textContent='請填加班類型名稱';
    if(typeOptions({[TYPECONFIG]:customTypes},rows).some(x=>x.name===name))return el.querySelector('#p79OtStatus').textContent='此類型已存在';
    customTypes.push([name,category]);el.querySelector('#p79NewTypeName').value='';el.querySelector('#p79OtStatus').textContent='已新增「'+name+'」，請新增出勤時段後儲存。';
   };
   const body=el.querySelector('#p79OtRuleRows'),getRows=()=>[...body.rows].map(tr=>[...tr.querySelectorAll('[data-col]')].map(i=>i.value));
   body.addEventListener('click',e=>{if(e.target.closest('.p79OtDelete'))e.target.closest('tr').remove()});
   el.querySelector('#p79OtStatus').textContent='已載入雲端規則；修改後按儲存。';
   el.querySelector('#p79OtAdd').onclick=()=>{
    const choices=typeOptions({[TYPECONFIG]:customTypes},getRows()),form=dialog('新增出勤時段','<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0"><label>加班類型<select id="p79PeriodType" style="'+inputStyle+'">'+choices.map((x,i)=>'<option value="'+i+'">'+esc(x.name)+'</option>').join('')+'</select></label><label>出勤時段名稱<input id="p79PeriodCode" placeholder="例如：休08-16、代16-20" style="'+inputStyle+'"></label>'+['正常起','正常迄','加班起','加班迄'].map((label,i)=>'<label>'+label+'<select id="p79PeriodTime'+i+'" style="'+inputStyle+'">'+Array.from({length:25},(_,h)=>'<option value="'+String(h).padStart(2,'0')+'">'+String(h).padStart(2,'0')+'</option>').join('')+'</select></label>').join('')+'<label>加班位置<select id="p79PeriodPosition" style="'+inputStyle+'"><option value="full">整段加班</option><option value="after">正常班後加班</option><option value="before">正常班前加班</option></select></label><label>實際加班時數<input id="p79PeriodActual" type="number" step="0.01" style="'+inputStyle+'"></label><label>換算加班時數<input id="p79PeriodConverted" type="number" step="0.01" style="'+inputStyle+'"></label></div><p id="p79PeriodMessage"></p><button id="p79PeriodAdd" type="button" style="background:#0369a1;color:white;padding:10px;border-radius:8px">加入出勤時段</button>','p79OvertimePeriodDialog');
    [8,16,8,16].forEach((h,i)=>form.querySelector('#p79PeriodTime'+i).value=String(h).padStart(2,'0'));form.querySelector('#p79PeriodActual').value='8';
    form.querySelector('#p79PeriodAdd').onclick=()=>{try{
     const chosen=choices[Number(form.querySelector('#p79PeriodType').value)],times=[0,1,2,3].map(i=>form.querySelector('#p79PeriodTime'+i).value),position=form.querySelector('#p79PeriodPosition').value;
     const code=form.querySelector('#p79PeriodCode').value.trim()||(chosen.category+times[2]+'-'+times[3]);
     const row=[chosen.category,code,form.querySelector('#p79PeriodActual').value,form.querySelector('#p79PeriodConverted').value,...(chosen.category==='延'?times.slice(0,2):['','']),...times.slice(2),position,chosen.name];
     validate([...getRows(),row]);body.insertAdjacentHTML('beforeend',editorRow(row));form.close();el.querySelector('#p79OtStatus').textContent='已加入「'+chosen.name+'／'+code+'」，請按儲存。';
    }catch(error){form.querySelector('#p79PeriodMessage').textContent=error.message}};
   };
   el.querySelector('#p79OtExport').onclick=()=>{const rows=getRows(),csv='\uFEFF'+[['類型','代碼','申報時數','換算時數','正常起','正常迄','加班起','加班迄','位置'],...rows].map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');const a=document.createElement('a'),u=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.href=u;a.download='加班換算表.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};
   el.querySelector('#p79OtSave').onclick=async()=>{
    const b=el.querySelector('#p79OtSave');if(b.disabled)return;b.disabled=true;
    try{
     const draft=validate(getRows()),fresh=await loadRules();
     if(JSON.stringify(fresh.rows)!==loadedRows&&JSON.stringify(fresh.rows)!==JSON.stringify(draft))throw Error('換算表已由其他人修改，請關閉後重新載入再編輯');
     if(JSON.stringify(fresh.config[TYPECONFIG]||[])!==loadedTypes&&JSON.stringify(fresh.config[TYPECONFIG]||[])!==JSON.stringify(customTypes))throw Error('加班類型已被其他人修改，請重新載入');
     const config={...fresh.config,[CONFIG]:draft,[TYPECONFIG]:customTypes};
     if(new TextEncoder().encode(JSON.stringify(config)).length>8800)throw Error('共用設定已達容量上限，尚未儲存；請匯出CSV保留，再改用獨立試算表分頁');
     if(JSON.stringify(fresh.rows)!==JSON.stringify(draft)||JSON.stringify(fresh.config[TYPECONFIG]||[])!==JSON.stringify(customTypes))await rpc('saveConfig',{config});const check=await loadRules();
     if(JSON.stringify(check.rows)!==JSON.stringify(draft))throw Error('雲端讀回不一致，尚未確認儲存');
     loadedRows=JSON.stringify(check.rows);loadedTypes=JSON.stringify(check.config[TYPECONFIG]||[]);if(loadedTypes!==JSON.stringify(customTypes))throw Error('加班類型讀回不一致');
     const current=global.p79OvertimeContext?.config?.();if(current)Object.assign(current,check.config);global.dispatchEvent?.(new CustomEvent('p79-overtime-options-saved'));el.querySelector('#p79OtStatus').textContent='✅ 加班類型與出勤時段已儲存，之後申報可直接選用。';
    }catch(e){el.querySelector('#p79OtStatus').textContent='❌ '+e.message;}finally{b.disabled=false}
   };
  }catch(e){el.querySelector('#p79OtStatus').textContent='❌ '+e.message}
 }
 async function openReport(){
  if(!global.p79OvertimeContext?.canReport?.())return alert('沒有申報加班權限');
  const el=dialog('申報加班','<p id="p79OtStatus">正在讀取加班換算表…</p>');
  try{
   let rows=reportRules();const people=global.p79OvertimeContext.employees();
   el.insertAdjacentHTML('beforeend','<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0"><label>部門<select id="p79OtDept" style="'+inputStyle+'"></select></label><label>職稱<select id="p79OtTitle" style="'+inputStyle+'"></select></label><label>員工<select id="p79OtEmp" style="'+inputStyle+'">'+people.map(e=>'<option value="'+esc(e.empId)+'">'+esc(e.empId+' '+e.name)+'</option>').join('')+'</select></label><label>加班日期<input id="p79OtDate" type="date" style="'+inputStyle+'"></label><label>加班類型<select id="p79OtKind" style="'+inputStyle+'"></select></label><label>出勤時段<select id="p79OtCode" style="'+inputStyle+'"></select></label></div><div id="p79OtPreview" style="padding:14px;background:#f0f9ff;border-radius:10px"></div><label style="display:block;margin:12px 0">備註<input id="p79OtNote" maxlength="200" style="'+inputStyle+'"></label><p style="font-size:13px;color:#64748b">下一步帶入班表「代」，確認日期、人員及時段後按儲存。未完成班表儲存前，申報尚未送出。同一人同一天再次申報會更新該日的代班設定。</p><button id="p79OtStage" type="button" style="margin-top:12px;background:#0369a1;color:white;padding:10px 18px;border-radius:8px">帶入班表確認</button>');
   el.querySelector('#p79OtDate').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
   const deptSelect=el.querySelector('#p79OtDept'),titleSelect=el.querySelector('#p79OtTitle'),empSelect=el.querySelector('#p79OtEmp');
   const fillSelect=(select,label,values)=>{const previous=select.value;select.innerHTML='<option value="">全部'+label+'</option>'+values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');select.value=values.includes(previous)?previous:'';};
   fillSelect(deptSelect,'部門',filterReportEmployees(people).departments);
   const filterPeople=()=>{
    const options=filterReportEmployees(people,deptSelect.value);
    fillSelect(titleSelect,'職稱',options.jobTitles);
    const matches=filterReportEmployees(people,deptSelect.value,titleSelect.value).employees,previous=empSelect.value;
    empSelect.innerHTML=matches.length?matches.map(e=>'<option value="'+esc(e.empId)+'">'+esc(e.empId+' '+e.name)+'</option>').join(''):'<option value="">沒有符合條件的人員</option>';
    if(matches.some(e=>String(e.empId)===previous))empSelect.value=previous;
   };
   deptSelect.onchange=filterPeople;titleSelect.onchange=filterPeople;filterPeople();
   const kind=el.querySelector('#p79OtKind'),select=el.querySelector('#p79OtCode');
   const refresh=()=>{select.innerHTML=rows.map((r,i)=>({r,i})).filter(({r})=>ruleType(r)===kind.value).map(({r,i})=>'<option value="'+i+'">'+esc(r[1])+'</option>').join('');preview()};
   function preview(){const r=select.selectedIndex<0?null:rows[Number(select.value)];el.querySelector('#p79OtPreview').textContent=r&&ruleType(r)===kind.value?'加班 '+r[6]+'-'+r[7]+(r[0]==='延'?'｜正常班 '+r[4]+'-'+r[5]:'')+'｜申報 '+r[2]+' 小時｜換算 '+(r[3]===''?'未設定':r[3]+' 小時'):'尚未設定這類加班規則';}
   const refreshTypes=()=>{const previous=kind.value,options=typeOptions(global.p79OvertimeContext?.config?.()||{},rows);kind.innerHTML=options.map(x=>'<option value="'+esc(x.name)+'">'+esc(x.name)+'</option>').join('');if(options.some(x=>x.name===previous))kind.value=previous;refresh();};
   kind.onchange=refresh;select.onchange=preview;refreshTypes();el.querySelector('#p79OtStatus').textContent='請選擇員工、日期與出勤時段。';
   el.insertAdjacentHTML('beforeend',' <button id="p79OtManageOptions" type="button" style="margin-left:10px;padding:10px;border:1px solid #0369a1;border-radius:8px">＋新增／儲存加班選項</button>');el.querySelector('#p79OtManageOptions').onclick=openRules;
   const optionsSaved=()=>{if(el.isConnected){rows=reportRules();refreshTypes();}};
   global.addEventListener?.('p79-overtime-options-saved',optionsSaved);
   el.p79Cleanup=()=>global.removeEventListener?.('p79-overtime-options-saved',optionsSaved);
   el.onclose=()=>{el.p79Cleanup();el.remove();};
   el.querySelector('#p79OtStage').onclick=()=>{
    try{if(select.selectedIndex<0)throw Error('請先新增這類加班規則');
     const date=el.querySelector('#p79OtDate').value,empId=el.querySelector('#p79OtEmp').value;
     if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!empId)throw Error('請選擇員工與日期');
     const draft={id:crypto.randomUUID(),empId,date,rule:report(rows[Number(select.value)]),note:el.querySelector('#p79OtNote').value,createdAt:Date.now(),gasUrl:auth().url};
     sessionStorage.setItem(KEY,JSON.stringify(draft));location.href='../schedule/?overtimeReport=1';
    }catch(e){el.querySelector('#p79OtStatus').textContent='❌ '+e.message}
   };
  }catch(e){el.querySelector('#p79OtStatus').textContent='❌ '+e.message}
 }
 global.P79Overtime={KEY,CONFIG,defaults,validate,report,interval,overtimeMinutes,matchReport,reportRules,filterReportEmployees,typeOptions,ruleType,openRules,openReport,time};
})(typeof window==='undefined'?globalThis:window);


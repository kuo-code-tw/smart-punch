(function(global){
'use strict';
const fields={empId:['工號','員工編號','員工工號','empid'],name:['姓名','員工姓名','name'],attNo:['考勤號','考勤號碼','考勤編號','attno'],dept:['部門','dept'],unit:['單位','unit'],jobTitle:['職稱','職務','jobtitle'],phone:['電話','手機','手機號碼','phone'],startDate:['到職日','到職日期','startdate'],birthday:['生日','出生日期','birthday']};
const text=v=>String(v??'').trim(),id=v=>text(v).toUpperCase(),header=v=>text(v).replace(/[\s_]/g,'').toLowerCase();
const esc=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function date(v){
 if(typeof v==='number'){if(!Number.isFinite(v)||v<1||v>100000)throw Error('試算表日期無效');return new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);}
 const m=text(v).match(/^(\d{3,4})[年/.-](\d{1,2})[月/.-](\d{1,2})(?:日|\s.*)?$/);if(!m)throw Error('日期請使用YYYY-MM-DD或民國年/月/日');
 const y=Number(m[1])+(m[1].length===3?1911:0),mo=Number(m[2]),d=Number(m[3]),dt=new Date(Date.UTC(y,mo-1,d));if(dt.getUTCFullYear()!==y||dt.getUTCMonth()+1!==mo||dt.getUTCDate()!==d)throw Error('日期不存在');return dt.toISOString().slice(0,10);
}
function buildPlan(matrix,people,permissions){
 if(!Array.isArray(matrix)||matrix.length<2)throw Error('檔案沒有可匯入的人員');
 const columns={},seenHeaders=new Set();matrix[0].forEach((h,i)=>{const key=Object.keys(fields).find(k=>fields[k].includes(header(h)));if(key){if(seenHeaders.has(key))throw Error('欄位重複：'+h);seenHeaders.add(key);columns[key]=i;}});
 if(columns.empId===undefined||columns.name===undefined)throw Error('第一列必須包含「工號」及「姓名」欄位');
 const data=matrix.slice(1).map((row,i)=>({row,line:i+2})).filter(({row})=>row.some(v=>text(v)));if(data.length>1000)throw Error('每次最多匯入1000人，請分批處理');
 const byId=new Map(),attOwners=new Map();people.forEach(e=>{const key=id(e.empId);if(byId.has(key))throw Error('雲端工號重複，請先核對：'+key);byId.set(key,e);if(text(e.attNo))attOwners.set(String(Number(e.attNo)||e.attNo),key);});
 const seen=new Set(),result=[];
 for(const {row,line} of data){
  const empId=id(row[columns.empId]),existing=byId.get(empId),kind=existing?'更新':'新增',patch={},errors=[];
  if(!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(empId))errors.push('工號格式無效');
  if(empId==='ADMIN'&&!existing)errors.push('系統保留工號，請使用個人人員編輯');
  if(seen.has(empId))errors.push('檔案內工號重複');seen.add(empId);
  if(!text(row[columns.name]))errors.push('姓名不可空白');
  if(!(existing?permissions.edit:permissions.create))errors.push('沒有'+kind+'人員權限');
  for(const [key,index] of Object.entries(columns)){
   const raw=row[index];if(key==='empId'||!text(raw))continue;
   try{
    let value=['startDate','birthday'].includes(key)?date(raw):text(raw);
    if(key==='phone'){value=value.replace(/[\s()-]/g,'').replace(/^\+?886/,'0');if(/^9\d{8}$/.test(value))value='0'+value;if(!/^\d{6,15}$/.test(value))throw Error('電話格式無效');}
    else if(!['startDate','birthday'].includes(key)&&/^[=+\-@]/.test(value))throw Error('文字欄位不可使用公式開頭');
    patch[key]=value;
   }catch(error){errors.push((fields[key][0]||key)+'：'+error.message);}
  }
  if(patch.attNo){const attKey=String(Number(patch.attNo)||patch.attNo),owner=attOwners.get(attKey);if(owner&&owner!==empId)errors.push('考勤號已由 '+owner+' 使用');else attOwners.set(attKey,empId);}
  result.push({line,empId,kind,patch,existing,errors,state:'待匯入'});
 }
 return result;
}
function employeePayload(item,existing){
 const base=existing?{...existing}:{empId:item.empId,adminRole:'employee',employmentStatus:'active',phone:'',dept:'',unit:'',jobTitle:'',attNo:'',systemPermissions:{attendance:'view',workhours:'view',leave:'view',schedule:'none',efficiency:'none',hr:'none',history:'none'}};
 const employee={...base,...item.patch,empId:item.empId};if(Object.hasOwn(item.patch,'jobTitle'))employee.deptDetail=item.patch.jobTitle;return employee;
}
async function writeOne(ctx,item,existing){
 if(!(existing?ctx.canEdit():ctx.canCreate()))throw Error('人員'+(existing?'更新':'新增')+'權限已變更');
 for(let attempt=0;attempt<3;attempt++){try{const r=await ctx.upsert(employeePayload(item,existing));if(!r?.ok)throw Error(r?.error||'雲端未確認成功');return;}catch(error){if(attempt===2||!/雲端目前正在處理其他資料/.test(error.message))throw error;await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}}
}
async function open(){
 const ctx=global.p79HrImportContext;if(!ctx?.canCreate()&&!ctx?.canEdit())return alert('沒有新增或修改人員的權限');
 if(document.getElementById('p79HrImportDialog')){const previous=document.getElementById('p79HrImportDialog');if(previous.p79Running)return previous.showModal();previous.remove();}
 const el=document.createElement('dialog');el.id='p79HrImportDialog';el.style.cssText='width:min(1100px,calc(100vw - 24px));max-height:90vh;padding:18px;box-sizing:border-box;overflow:auto;text-align:center';
 el.innerHTML=`<style>#p79HrImportDialog *{box-sizing:border-box}#p79HrImportDialog table{min-width:850px;width:100%;font-size:12px}#p79HrImportDialog th,#p79HrImportDialog td{text-align:center;padding:8px}#p79HrImportDialog .import-actions{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;margin:12px 0}</style><div style="display:flex;justify-content:space-between;align-items:center"><h2>匯入人資名冊</h2><button id="hrImportClose" type="button">關閉</button></div><p>第一列為欄名，必須有「工號、姓名」。可匯入：考勤號、部門、單位、職稱、電話、到職日、生日。</p><p>依工號新增或更新；空白欄位保留原值。新增為一般員工；角色、權限、假別餘額及裝置設定請在人員編輯中設定。</p><div class="import-actions"><input id="hrImportFile" type="file" accept=".xlsx,.xls,.csv,.tsv" style="max-width:400px"><select id="hrImportSheet" style="max-width:220px" disabled></select><button id="hrImportPreview" type="button" disabled>讀取並預覽</button><button id="hrImportTemplate" type="button">下載人資匯入範本</button></div><p id="hrImportStatus" role="status">選擇檔案後預覽，確認後才寫入雲端。</p><div style="max-height:48vh;overflow:auto"><table><thead><tr><th>列</th><th>動作</th><th>工號</th><th>姓名</th><th>部門</th><th>單位</th><th>職稱</th><th>考勤號</th><th>結果／問題</th></tr></thead><tbody id="hrImportRows"></tbody></table></div><div class="import-actions"><button id="hrImportApply" type="button" disabled>確認匯入人資名冊</button><button id="hrImportStop" type="button" disabled>停止後續人資匯入</button></div>`;
 document.body.appendChild(el);el.showModal();const $=key=>el.querySelector('#'+key);let workbook=null,matrix=null,plan=[],stop=false;
 const message=s=>$('hrImportStatus').textContent=s;
 function render(){ $('hrImportRows').innerHTML=plan.map(item=>{const e=employeePayload(item,item.existing);return '<tr>'+[item.line,item.kind,item.empId,e.name,e.dept,e.unit,e.jobTitle,e.attNo,item.errors.length?item.errors.join('；'):item.state].map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>';}).join(''); }
 function running(value,writing=false){el.p79Running=value&&writing;['hrImportFile','hrImportSheet','hrImportPreview','hrImportApply','hrImportClose'].forEach(key=>$(key).disabled=value);$('hrImportClose').disabled=value&&writing;$('hrImportStop').disabled=!(value&&writing);}
 $('hrImportClose').onclick=()=>{if(!el.p79Running){el.close();el.remove();}};el.addEventListener('cancel',event=>{if(el.p79Running){event.preventDefault();stop=true;message('正在完成目前這筆，之後停止匯入…');}});
 $('hrImportTemplate').onclick=async()=>{try{await ctx.ensureXlsx();const wb=global.XLSX.utils.book_new();global.XLSX.utils.book_append_sheet(wb,global.XLSX.utils.aoa_to_sheet([['工號','姓名','考勤號','部門','單位','職稱','電話','到職日','生日']]),'人資匯入');global.XLSX.writeFile(wb,'人資匯入範本.xlsx');}catch(error){message('❌ '+error.message);}};
 $('hrImportStop').onclick=()=>{stop=true;message('正在完成目前這筆，之後停止匯入…');};
 $('hrImportFile').onchange=async()=>{try{
  running(true);$('hrImportApply').disabled=true;plan=[];render();workbook=null;matrix=null;const file=$('hrImportFile').files[0];if(!file)return;if(file.size>10*1024*1024)throw Error('檔案上限10MB');
  message('正在讀取檔案…');await ctx.ensureXlsx();const bytes=await file.arrayBuffer();
  if(/\.(csv|tsv)$/i.test(file.name)){let csv=new TextDecoder('utf-8').decode(bytes);if(csv.includes('\uFFFD'))csv=new TextDecoder('big5').decode(bytes);workbook=global.XLSX.read(csv,{type:'string'});}else workbook=global.XLSX.read(bytes,{type:'array'});
  $('hrImportSheet').innerHTML=workbook.SheetNames.map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('');$('hrImportSheet').disabled=false;$('hrImportPreview').disabled=false;message('請選擇分頁並按「讀取並預覽」。');
 }catch(error){message('❌ '+error.message);}finally{running(false);$('hrImportPreview').disabled=!workbook;$('hrImportSheet').disabled=!workbook;$('hrImportApply').disabled=true;}};
 $('hrImportSheet').onchange=()=>{$('hrImportApply').disabled=true;plan=[];matrix=null;render();message('已切換分頁，請重新預覽。');};
 $('hrImportPreview').onclick=async()=>{try{running(true);message('正在讀取雲端人員並比對工號…');const people=await ctx.readEmployees();matrix=global.XLSX.utils.sheet_to_json(workbook.Sheets[$('hrImportSheet').value],{header:1,defval:'',raw:true});plan=buildPlan(matrix,people,{create:ctx.canCreate(),edit:ctx.canEdit()});render();const errors=plan.filter(r=>r.errors.length).length;message(`共 ${plan.length} 人｜新增 ${plan.filter(r=>r.kind==='新增').length}｜更新 ${plan.filter(r=>r.kind==='更新').length}｜問題 ${errors} 筆`);}catch(error){plan=[];render();message('❌ '+error.message);}finally{running(false);$('hrImportApply').disabled=!plan.length||plan.some(item=>item.errors.length);}};
 $('hrImportApply').onclick=async()=>{if(el.p79Running||!plan.length||plan.some(item=>item.errors.length))return;stop=false;running(true,true);let written=0;
  try{
   message('正在確認最新雲端人員…');const people=await ctx.readEmployees(),fresh=buildPlan(matrix,people,{create:ctx.canCreate(),edit:ctx.canEdit()});if(fresh.some(item=>item.errors.length))throw Error('雲端資料或權限已改變，請重新預覽');
   for(let i=0;i<plan.length;i++){const old=plan[i],item=fresh[i];if(old.state==='已確認')continue;if(old.kind!==item.kind)throw Error('工號 '+item.empId+' 的新增／更新狀態已改變，請重新預覽');for(const key of Object.keys(old.patch))if(text(old.existing?.[key])!==text(item.existing?.[key])&&text(item.patch[key])!==text(item.existing?.[key]))throw Error('工號 '+item.empId+' 的 '+key+' 已被其他人修改，請重新預覽');}
   for(let i=0;i<plan.length;i++){if(stop)break;const item=plan[i];if(item.state==='已確認')continue;message(`正在匯入 ${i+1}/${plan.length}：${item.empId}`);try{await writeOne(ctx,item,fresh[i].existing);item.state='已送出，正在讀回';written++;render();}catch(error){item.state='未確認：'+error.message;render();throw error;}}
   const verified=await ctx.readEmployees(),byId=new Map(verified.map(e=>[id(e.empId),e]));for(const item of plan){if(item.state!=='已送出，正在讀回')continue;const e=byId.get(item.empId);item.state=e&&Object.entries(item.patch).every(([key,value])=>key==='attNo'?Number(e[key])===Number(value)||text(e[key])===text(value):['startDate','birthday'].includes(key)?text(e[key]).slice(0,10).replace(/\//g,'-')===value:text(e[key])===value)?'已確認':'已送出，讀回尚未一致';}
   render();message(`${stop?'已停止後續匯入':'匯入完成'}｜本次送出 ${written} 筆｜已讀回確認 ${plan.filter(item=>item.state==='已確認').length}/${plan.length} 筆。`);
  }catch(error){for(const item of plan)if(item.state==='已送出，正在讀回')item.state='已送出，請核對雲端';render();message('❌ '+error.message+'；已處理的列保留結果，請核對後重新預覽。');}
  finally{running(false);$('hrImportApply').disabled=plan.every(item=>item.state==='已確認');}
 };
}
global.P79HrImport={open,buildPlan,employeePayload,date,writeOne};
})(typeof window==='undefined'?globalThis:window);

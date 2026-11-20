/* PORT79 homepage automatic Excel routing.
 * Classify workbook signatures only; original Gate/Yard/Vessel pages own all
 * validation, authorized automatic import, data mutation and persistence. No duplicate importer.
 */
(function(w){
'use strict';
const d=w.document,root=d.getElementById('p79HomeDropImport');
if(!root)return;
const $=id=>d.getElementById(id);
const modal=$('p79HomeImportDialog'),frame=$('p79HomeImportFrame'),picker=$('p79HomeImportInput');
const title=$('p79HomeImportTitle'),fileLabel=$('p79HomeImportFile');
const status=$('p79HomeImportStatus'),bar=$('p79HomeImportProgressBar'),progress=$('p79HomeImportProgress');
const review=$('p79HomeImportReview'),reviewText=$('p79HomeImportReviewText');
const yes=$('p79HomeImportReviewYes'),no=$('p79HomeImportReviewNo'),close=$('p79HomeImportClose');
const names={gate:'Gate 進出站',yard:'Yard 儲量',vessel:'船舶作業'};
const targets={
 gate:'./gate-import/index.html?embed=1&homeImport=1',
 yard:'./yard-dashboard/index.html?embed=1&homeImport=1',
 vessel:'./aqc-efficiency/index.html?homeImport=1'
};
let busy=false,taskId=0,approval=null,lastVesselError='',resultLog=[];
function canUse(){
 let s=null;try{s=JSON.parse(w.sessionStorage.getItem('port79_user_session')||'null')}catch(_){}
 const role=String(s?.adminRole||s?.role||'').toLowerCase();
 const token=String(w.sessionStorage.getItem('port79_user_token')||
  w.sessionStorage.getItem('port79_admin_token')||
  w.sessionStorage.getItem('port79_gc_superadmin_token')||'').trim();
 return !!s&&!s.punchOnly&&role==='superadmin'&&!!token;
}
function refresh(){root.hidden=!canUse();}
function pct(n,tone){
 const p=Math.max(0,Math.min(100,Math.round(Number(n)||0)));
 if(bar)bar.style.width=p+'%';
 if(progress){
  progress.dataset.tone=tone||'info';
  progress.setAttribute('aria-valuenow',String(p));
  progress.setAttribute('aria-valuetext',p+'%（工作階段進度，非雲端寫入百分比）');
 }
}
function display(message,tone,percent){
 if(status){status.textContent=String(message||'');status.dataset.tone=tone||'info';}
 if(percent!==undefined)pct(percent,tone);
}
function normalize(v){return String(v??'').replace(/\s+/g,'').trim().toUpperCase()}
function getCell(sheet,address){
 const cell=sheet?.[address];
 return String(cell?.v??cell?.w??'').trim();
}
async function identify(file){
 const name=String(file?.name||'');
 if(!/\.(xlsx|xls|csv)$/i.test(name))throw Error(name+'：僅支援 xlsx、xls、csv');
 if(file.size>30*1024*1024)throw Error(name+'：單檔超過 30 MB 上限');
 if(!file.arrayBuffer)throw Error(name+'：瀏覽器無法讀取檔案');
 if(/\.csv$/i.test(name)){
  if(!/(gate|進出站|交空櫃|交重櫃)/i.test(name))throw Error(name+'：無法辨識 CSV 來源；Gate CSV 請包含 Gate 或進出站識別名稱');
  if(file.size>10*1024*1024)throw Error(name+'：Gate 單檔不可超過 10 MB');
  return {file,kind:'gate',evidence:'Gate CSV'};
 }
 if(!w.XLSX?.read)throw Error('Excel 辨識元件尚未載入；請確認網路連線');
 const bytes=await file.arrayBuffer();
 // SheetJS can interpret arbitrary bytes as text/CSV even when a file is
 // incorrectly named .xlsx. Check the container before trusting cell values.
 if(/\.xlsx$/i.test(name)){
  const head=new Uint8Array(bytes,0,Math.min(8,bytes.byteLength));
  const zip=head[0]===0x50&&head[1]===0x4b&&
   ((head[2]===3&&head[3]===4)||(head[2]===5&&head[3]===6)||(head[2]===7&&head[3]===8));
  const ole=[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((n,i)=>head[i]===n);
  if(!zip&&!ole)throw Error(name+'：檔案內容不是正常 Excel 活頁簿（副檔名為 .xlsx，但內容不是 ZIP/Excel 格式）。未匯入任何資料，請重新取得原始 Excel 檔案');
 }
 const book=w.XLSX.read(bytes,{type:'array',cellDates:false,cellHTML:false,sheetRows:90});
 const sheets=(book.SheetNames||[]).map(n=>String(n||''));
 const canon=sheets.map(normalize);
 const has=n=>canon.includes(n);
 const vessel=has('WORKINGSHEET')&&has('WORKINGREPORT');
 const yard=sheets.some(n=>{
  const sh=book.Sheets[n];
  return getCell(sh,'A2').includes('重櫃')&&getCell(sh,'A3').includes('進口櫃')&&
   getCell(sh,'A29').includes('空櫃')&&/LONG[- ]?STAY/i.test(getCell(sh,'A77'));
 });
 const gate=sheets.some(n=>{
  const sh=book.Sheets[n];
  return normalize(getCell(sh,'B2'))==='交空櫃'&&
   normalize(getCell(sh,'B3'))==='交重櫃'&&
   normalize(getCell(sh,'B7'))==='領空櫃'&&
   getCell(sh,'A15').includes('本日進站卡車數');
 });
 const signs=[vessel&&'vessel',yard&&'yard',gate&&'gate'].filter(Boolean);
 if(signs.length>1)throw Error(name+'：同時符合多種報表特徵，為避免匯錯資料庫已停止');
 if(signs.length===1)return {file,kind:signs[0],evidence:'工作表內容確認'};
 // Never treat a filename as proof of a Gate/Yard workbook. A mislabeled
 // binary file was previously routed to Gate, where B2 appeared as garbage.
 const gateHint=/(?:^|[\s_.-])GATE(?:[\s_.-]|$)|進出站/i.test(name);
 const yardHint=/(?:^|[\s_.-])YARD(?:[\s_.-]|$)|堆場|儲量/i.test(name);
 const vesselHint=/TALLY|WORKING[\s_-]*SHEET|船舶作業|WAN\s*HAI|XINDE/i.test(name)||
  has('WORKINGSHEET')||has('WORKINGREPORT');
 const gateLabels=[['B2','交空櫃'],['B3','交重櫃'],['B4','交空櫃'],['B5','交重櫃'],
  ['B7','領空櫃'],['B8','領重櫃'],['B9','領空櫃'],['B10','領重櫃']];
 if(gateHint){
  const shName=sheets[0]||'（沒有工作表）',sh=book.Sheets[shName];
  const wrong=gateLabels.find(([addr,expected])=>normalize(getCell(sh,addr))!==expected);
  if(wrong){
   const [addr,expected]=wrong;
   const got=getCell(sh,addr);
   const printable=got&&got.length<=20&&!/[\x00-\x1F\uFFFD]/.test(got)
    &&/^[\p{L}\p{N}\s_.()\/-]+$/u.test(got);
   throw Error(name+'：不是可辨識的 Gate 標準報表。工作表「'+shName+'」'+addr+
    ' 應是「'+expected+'」，目前是'+(printable?'「'+got+'」':'異常或空白文字')+
    '；未匯入任何資料。請核對檔案內容');
  }
  throw Error(name+'：Gate 分類列部分符合，但其餘必要欄位不完整；為避免寫入錯誤資料已停止');
 }
 if(yardHint)throw Error(name+'：沒有找到符合「重櫃、進口櫃、空櫃、Long-Stay」分類的 Yard 工作表；未匯入任何資料');
 if(vesselHint)throw Error(name+'：船舶報表需要 WORKING SHEET 和 WORKING REPORT 兩張工作表；實際為「'+sheets.slice(0,6).join('、')+'」。未匯入任何資料');
 throw Error(name+'：Excel 內容不符合 Yard、Gate 或船舶報表特徵；不依檔名猜測，未匯入任何資料');
}
function settle(ok){
 if(!approval)return;
 const resolve=approval;approval=null;
 if(review)review.hidden=true;
 resolve(ok===true);
}
function confirmImport(message,source){
 if(!busy||!modal.open||!canUse()||source!==frame.contentWindow||approval)return Promise.resolve(false);
 if(reviewText)reviewText.textContent=String(message||'');
 if(review)review.hidden=true;
 display('原系統核對完成，正在自動匯入…','info');
 return Promise.resolve(true);
}
function reportImportIssue(message,source){
 if(!busy||source!==frame.contentWindow)return false;
 lastVesselError=String(message||'匯入核對失敗').slice(0,500);
 display(lastVesselError,'error');
 return true;
}
yes?.addEventListener('click',()=>{settle(true);display('已確認，交由原系統完成匯入…','info');});
no?.addEventListener('click',()=>{settle(false);display('已取消本次匯入，原資料保留','pending');});
function updateGateStatus(){
 let el=null;try{el=frame.contentDocument?.getElementById('gateMessage')}catch(_){}
 return {message:String(el?.textContent||'').trim(),kind:el?.dataset?.kind||''};
}
function waitGateResult(){
 return new Promise((resolve,reject)=>{
  let el=null;try{el=frame.contentDocument?.getElementById('gateMessage')}catch(_){}
  if(!el){reject(Error('Gate 原系統的狀態區無法讀取'));return;}
  let finished=false;
  const observer=new MutationObserver(check);
  const timer=setTimeout(()=>done(Error('Gate 雲端確認逾時：無法確定是否已寫入，請先在原系統核對後再決定是否重匯')),120000);
  function done(err,text){
   if(finished)return;finished=true;
   observer.disconnect();clearTimeout(timer);
   if(err)reject(err);else resolve(text);
  }
  function check(){
   const state=updateGateStatus();
   if(/已寫入正式資料庫/.test(state.message)){done(null,state.message);return;}
   if(state.kind==='error'){done(Error(state.message||'Gate 核對失敗'));return;}
   if(state.message)display('Gate｜'+state.message,'info',72);
  }
  observer.observe(el,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['data-kind']});
  check();
 });
}
async function loadOriginal(kind){
 const url=targets[kind];if(!url)throw Error('不支援的匯入類型');
 return new Promise((resolve,reject)=>{
  let settled=false;
  const timer=setTimeout(()=>finish(Error(names[kind]+' 原系統載入逾時')),45000);
  function finish(err){
   if(settled)return;settled=true;clearTimeout(timer);frame.onload=null;frame.onerror=null;
   if(err)reject(err);else resolve();
  }
  frame.onload=()=>{
   try{
    // WebView2 virtual-host mappings need an explicit HTML file path.
    // If the embedded page failed to load, inspecting cross-origin location
    // itself throws SecurityError. Stop before giving it any File objects.
    const location=frame.contentWindow.location;
    const actual=new URL(location.href||location.origin+location.pathname);
    const expected=new URL(url,w.location.href||w.location.origin+'/');
    if(actual.origin!==expected.origin||actual.pathname!==expected.pathname)
     throw Error('匯入來源不符，已停止');
    const path=actual.pathname;
    if(!path.includes(kind==='vessel'?'/aqc-efficiency/':kind==='yard'?'/yard-dashboard/':'/gate-import/'))
     throw Error('載入的原系統不是指定匯入頁');
    finish();
   }catch(err){finish(Error(names[kind]+' 原系統無法從同一網域載入，請更新 Windows 程式檔案後重試；未寫入任何資料'))}
  };
  frame.onerror=()=>finish(Error('原系統載入失敗'));
  frame.src=url+'&homeDropVersion=20261116-auto-import-v2';
 });
}
async function runKind(kind,files){
 const child=frame.contentWindow;
 try{
  if(!child||child.location.origin!==w.location.origin)throw Error('來源不符');
 }catch(_){
  throw Error(names[kind]+' 匯入視窗無法同網域存取；已停止匯入，沒有變更正式資料。請更新 Windows 程式。');
 }
 if(kind==='gate'){
  if(typeof child.P79GateImport?.chooseFile!=='function')throw Error('Gate 原匯入程式尚未載入');
  const done=waitGateResult();
  await child.P79GateImport.chooseFile(files[0]);
  return {message:await done,tone:'success'};
 }
 if(kind==='yard'){
  if(typeof child.P79YardDashboard?.importFile!=='function')throw Error('Yard 原匯入程式尚未載入');
  await child.P79YardDashboard.importFile(files[0]);
  let el=null;try{el=frame.contentDocument?.getElementById('yardStatus')}catch(_){}
  const text=String(el?.textContent||'').trim();
  if(el?.dataset?.tone!=='success')throw Error(text||'Yard 原系統匯入未完成');
  return {message:'Yard｜'+(text||'原系統已儲存'),tone:'success'};
 }
 if(kind==='vessel'){
  if(typeof child.P79VesselHomeImport?.importFiles!=='function')throw Error('船舶原匯入程式尚未載入');
  lastVesselError='';
  const result=await child.P79VesselHomeImport.importFiles(files);
  const total=Number(result?.processed)||0,ok=Number(result?.success)||0,failed=Number(result?.failed)||0;
  if(!total||failed||ok!==total)
   throw Error(lastVesselError||('船舶原系統未完成：解析成功 '+ok+'/'+Math.max(total,files.length)+'；請核對檔案工作表與人員明細'));
  if(result?.cloudConfirmed===true)return {message:'船舶｜雲端寫入與讀回確認成功 '+ok+'/'+total+' 份',tone:'success'};
  return {message:'船舶｜解析 '+ok+'/'+total+' 份；'+String(result?.cloudIssue||'尚未取得雲端資料讀回確認')+'。請先核對後再處理',tone:'pending'};
 }
 throw Error('未知匯入目標');
}
async function start(input){
 if(!canUse())return;
 if(busy){display('前一批還在匯入，請先完成這一批','error');return;}
 const files=Array.from(input||[]);
 if(!files.length)return;
 if(files.length>32){modal.showModal();display('單次最多 32 個檔案：Gate 1、Yard 1、船舶 30','error',0);return;}
 busy=true;taskId++;const id=taskId;resultLog=[];lastVesselError='';
 if(review)review.hidden=true;
 if(fileLabel)fileLabel.textContent=files.map(f=>f.name).join('、');
 if(title)title.textContent='自動辨識 · 原系統匯入';
 if(!modal.open)modal.showModal();
 display('正在辨識 '+files.length+' 份 Excel 的來源…','info',5);
 try{
  const detected=[];
  for(let i=0;i<files.length;i++){
   if(!canUse()||id!==taskId)throw Error('登入狀態已變更，已停止');
   detected.push(await identify(files[i]));
   display('已辨識 '+(i+1)+'/'+files.length+'：'+names[detected[i].kind],'info',5+15*(i+1)/files.length);
  }
  const grouped={gate:[],yard:[],vessel:[]};
  for(const item of detected)grouped[item.kind].push(item.file);
  if(grouped.gate.length>1||grouped.yard.length>1||grouped.vessel.length>30)
   throw Error('同一批次 Gate／Yard 各限 1 份、船舶最多 30 份；為避免重複覆蓋已停止');
  const groups=['gate','yard','vessel'].filter(k=>grouped[k].length);
  for(let i=0;i<groups.length;i++){
   const kind=groups[i],list=grouped[kind];
   display('已分流至 '+names[kind]+'，正在啟動原系統…','info',20+65*i/groups.length);
   await loadOriginal(kind);
   display(names[kind]+' 原系統已載入，正在核對與匯入 '+list.length+' 份檔案…','info',25+65*i/groups.length);
   try{
    const outcome=await runKind(kind,list);
    resultLog.push({kind,tone:outcome.tone,message:outcome.message});
   }catch(err){
    resultLog.push({kind,tone:'error',message:names[kind]+'：'+String(err?.message||err)});
   }
   display('已處理 '+(i+1)+'/'+groups.length+' 個原系統','info',20+65*(i+1)/groups.length);
  }
  const failures=resultLog.filter(r=>r.tone==='error'),uncertain=resultLog.some(r=>r.tone==='pending');
  const summary=resultLog.map(r=>r.message).join('\n');
  display((failures.length?'匯入未全部完成：\n':uncertain?'已完成原系統處理：\n':'匯入完成：\n')+summary,
    failures.length?'error':uncertain?'pending':'success',100);
  if(!failures.length&&!uncertain&&id===taskId){
   if(typeof w.CustomEvent==='function'&&typeof w.dispatchEvent==='function'){
    try{w.dispatchEvent(new w.CustomEvent('p79-home-import-complete',{detail:{kinds:resultLog.map(r=>r.kind)}}));}
    catch(error){console.warn('匯入已成功，但首頁更新通知失敗',error);}
   }
   if(modal.open)modal.close();
  }
 }catch(err){
  display('已停止：'+String(err?.message||err),'error',100);
 }finally{busy=false;settle(false);}
}
function choose(){if(!canUse()||busy)return;picker?.click();}
root.querySelectorAll('[data-p79-drop-kind]').forEach(zone=>{
 zone.addEventListener('click',choose);
 zone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}});
 zone.addEventListener('dragover',e=>{if(!canUse())return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';});
 zone.addEventListener('drop',e=>{if(!canUse())return;e.preventDefault();e.stopPropagation();void start(e.dataTransfer?.files);});
});
picker?.addEventListener('change',()=>{if(picker.files?.length)void start(picker.files);picker.value='';});
d.addEventListener('dragover',e=>{
 if(canUse()&&!root.hidden&&Array.from(e.dataTransfer?.types||[]).includes('Files')){e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';}
});
d.addEventListener('drop',e=>{
 if(canUse()&&!root.hidden&&e.dataTransfer?.files?.length){e.preventDefault();void start(e.dataTransfer.files);}
});
w.addEventListener('message',e=>{
 if(!busy||e.origin!==w.location.origin||e.source!==frame.contentWindow)return;
 if(e.data?.type==='p79-vessel-import-progress'){
  const st=String(e.data.stage||'').slice(0,450);
  if(e.data.state==='error'&&st&&(!lastVesselError||/^❌|失敗：|核對不一致|讀取失敗/i.test(st)))lastVesselError=st;
  if(!approval&&(!review||review.hidden)&&st)display('船舶｜'+st,'info');
 }
});
function dismiss(){
 if(approval){settle(false);return;}
 if(busy){display('原系統仍在匯入，請完成後再關閉，避免中斷資料寫入','pending');return;}
 if(modal.open)modal.close();
}
close?.addEventListener('click',dismiss);
modal?.addEventListener('cancel',e=>{if(busy){e.preventDefault();dismiss();}});
w.Port79HomeDropImport={refresh,canUse,confirmImport,reportImportIssue,start};
refresh();
})(window);

/* PORT79 Yard Storage: sensitive data is NEVER bundled in public site assets.
 * The user imports XLSX into authenticated browser-local, account-scoped storage.
 * No fake default data, no GAS write claim, and no duplicate inventory categories.
 */
(function(g){
'use strict';
const d=g.document, $=id=>d.getElementById(id);
const FIELD_ROWS={
 imp20:4,imp40:5,impTeu:6,exp20:8,exp40:9,expTeu:10,
 trans20:12,trans40:13,transTeu:14,reefer20:16,reefer40:17,reeferTeu:18,
 heavyTotal:20,heavyCap:21,heavyPct:22,
 heavyPlug20Cap:24,heavyPlug40Cap:25,heavyPlug20Pct:26,heavyPlug40Pct:27,
 genEmpty20:30,genEmpty40:31,genEmptyTeu:32,
 pti20Cap:34,pti40Cap:35,reeferEmpty20:38,reeferEmpty40:39,reeferEmptyTeu:40,
 pti20:43,pti40:44,emptyPlug20Pct:46,emptyPlug40Pct:47,
 emptyTotal:49,emptyCap:50,emptyPct:51,
 specialEmpty20:54,specialEmpty40:55,specialEmptyTeu:56,
 specialHeavy20:59,specialHeavy40:60,specialHeavyCount:61,specialHeavyTeu:62,
 longImp20:66,longImp40:67,longImpTeu:68,
 longExp20:70,longExp40:71,longExpTeu:72,
 longTrans20:74,longTrans40:75,longTransTeu:76,longTotal:77
};
const RATE_FIELDS=new Set(['heavyPct','emptyPct','heavyPlug20Pct','heavyPlug40Pct','emptyPlug20Pct','emptyPlug40Pct']);
const STORAGE_PREFIX='p79_yard_private_v1_';
const CAPACITY_STORAGE_PREFIX='p79_yard_capacity_overrides_v1_';
const ALLOWANCE_STORAGE_PREFIX='p79_yard_allowed_container_counts_v1_';
const fmt=n=>Number(n).toLocaleString('zh-TW',{maximumFractionDigits:2});
const pct=n=>Number(n).toFixed(2)+'%';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rows=[],selectedDate='',view='overview',fileName='',updatedAt='',accountId='',storageKey='';
let capacityOverrides=Object.create(null);
let allowedCounts={heavy:null,empty:null};
let allowanceEditable=false;
let importBusy=false;
function identity(){
 let s=null,admin=null;
 try{s=JSON.parse(g.sessionStorage.getItem('port79_user_session')||'null')}catch(_){}
 try{admin=JSON.parse(g.sessionStorage.getItem('admin_session')||'null')}catch(_){}
 const role=x=>String(x?.adminRole||x?.role||'').toLowerCase();
 const sess=['admin','superadmin'].includes(role(s))?s:['admin','superadmin'].includes(role(admin))?admin:null;
 const token=g.sessionStorage.getItem('port79_user_token')||g.sessionStorage.getItem('port79_admin_token')||g.sessionStorage.getItem('port79_gc_superadmin_token');
 if(!sess||sess.punchOnly||!token)return '';
 const allowed=role(sess)==='superadmin'||['view','edit','manage'].includes(String(sess.systemPermissions?.efficiency||'').toLowerCase());
 if(!allowed)return '';
 const id=String(sess.empId||sess.employeeId||sess.id||sess.accountId||sess.email||sess.username||'').trim();
 return id ? encodeURIComponent(id.slice(0,120)) : '';
}
function canEditAllowedCounts(){
 let s=null;try{s=JSON.parse(g.sessionStorage.getItem('port79_user_session')||g.sessionStorage.getItem('admin_session')||'null')}catch(_){}
 const role=String(s?.adminRole||s?.role||'').toLowerCase();
 return !!identity()&&(role==='superadmin'||role==='admin'&&['manage','edit'].includes(String(s?.systemPermissions?.efficiency||'').toLowerCase()));
}
function message(t,tone){const n=$('yardStatus');if(n){n.textContent=t;n.dataset.tone=tone||'info';}}
function parseDate(value){
 if(value instanceof Date&&!Number.isNaN(value.getTime()))return [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');
 if(typeof value==='number'&&g.XLSX?.SSF?.parse_date_code){
   const c=g.XLSX.SSF.parse_date_code(value);
   if(c)value=[c.y,c.m,c.d].join('-');
 }
 const m=String(value??'').trim().match(/^(20\d{2})[.\/-](\d{1,2})[.\/-](\d{1,2})/);
 if(!m)throw Error('無法辨識 Excel 日期：'+String(value));
 const iso=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
 const dt=new Date(iso+'T00:00:00Z');
 if(!Number.isFinite(dt.getTime())||dt.toISOString().slice(0,10)!==iso)throw Error('日期無效：'+iso);
 return iso;
}
function amount(v,label){
 if(v===null||v===undefined||String(v).trim()==='')throw Error(label+' 欄位空白，請先核對 Excel');
 const n=typeof v==='number'?v:Number(String(v).replace(/,/g,'').trim());
 if(!Number.isFinite(n)||n<0||n>100000000)throw Error(label+' 數字無效：'+String(v));
 return n;
}
function assertNear(a,b,label,accuracy){
 if(Math.abs(Number(a)-Number(b))>(accuracy??0.02))throw Error(label+'：小計 '+fmt(a)+' 與明細 '+fmt(b)+' 不一致，已停止匯入');
}
function validateRecord(r){
 const tag=r.date;
 for(const k of Object.keys(FIELD_ROWS))amount(r[k],tag+' '+k);
 for(const key of ['heavyCap','emptyCap','heavyPlug20Cap','heavyPlug40Cap','pti20Cap','pti40Cap'])
   if(r[key]<=0)throw Error(tag+' '+key+' 容量必須大於 0');
 assertNear(r.heavyTotal,r.impTeu+r.expTeu+r.transTeu+r.reeferTeu,tag+' 重櫃');
 assertNear(r.emptyTotal,r.genEmptyTeu+r.reeferEmptyTeu,tag+' 空櫃');
 assertNear(r.longTotal,r.longImpTeu+r.longExpTeu+r.longTransTeu,tag+' Long-Stay');
 assertNear(r.specialHeavyCount,r.specialHeavy20+r.specialHeavy40,tag+' 特殊重櫃櫃數');
 for(const [total,cap,rate,label] of [['heavyTotal','heavyCap','heavyPct','重櫃使用率'],['emptyTotal','emptyCap','emptyPct','空櫃使用率'],['reefer20','heavyPlug20Cap','heavyPlug20Pct','20呎冷凍重櫃插座'],['reefer40','heavyPlug40Cap','heavyPlug40Pct','40呎冷凍重櫃插座']])
   assertNear(r[rate],r[total]/r[cap]*100,tag+' '+label,0.065);
 // Special containers, Long-Stay, and PTI are classified/subset figures,
 // not additive lines in the official daily container totals.
 return r;
}
function parseBook(book){
 const candidate=book.SheetNames.map(name=>({name,sheet:book.Sheets[name]})).find(({sheet})=>{
  if(!sheet)return false;
  const a=g.XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null,blankrows:true});
  return String(a[1]?.[0]||'').includes('重櫃') &&
    String(a[2]?.[0]||'').includes('進口櫃') &&
    String(a[28]?.[0]||'').includes('空櫃') &&
    String(a[76]?.[0]||'').includes('Long-Stay');
 });
 if(!candidate)throw Error('找不到符合 yard.xlsx 格式的堆場工作表（需包含重櫃、空櫃與 Long-Stay 欄位）');
 const matrix=g.XLSX.utils.sheet_to_json(candidate.sheet,{header:1,raw:true,defval:null,blankrows:true});
 const rawDates=matrix[0]||[],result=[],seen=new Set();
 for(let c=2;c<rawDates.length;c++){
  const v=rawDates[c];if(v===null||v===undefined||String(v).trim()==='')continue;
  const date=parseDate(v);
  if(seen.has(date))throw Error('同一檔案日期重複：'+date);
  seen.add(date);
  const r={date};
  for(const [key,index] of Object.entries(FIELD_ROWS)){
   const val=matrix[index-1]?.[c];
   r[key]=amount(val,date+' 第 '+index+' 列 '+key);
  }
  result.push(validateRecord(r));
 }
 if(!result.length||result.length>366)throw Error('檔案沒有有效的每日資料，或單次超過 366 天');
 return result.sort((a,b)=>a.date.localeCompare(b.date));
}
// Manual TEU capacities overlay existing Excel totals and never mutate source records.
function capacityValue(raw){
 const trimmed=String(raw??'').trim();
 const value=Number(trimmed);
 if(!trimmed||!Number.isFinite(value)||value<=0||value>100000000||Math.abs(value*100-Math.round(value*100))>0.000001){
  throw Error('容量必須輸入大於 0、最多兩位小數且不超過 100,000,000 的 TEU 數值');
 }
 return value;
}
function effectiveRecord(raw,overrides=capacityOverrides){
 if(!raw)return null;
 const manual=overrides?.[raw.date]||{};
 const row={...raw};
 if(Object.prototype.hasOwnProperty.call(manual,'heavyCap')){
  row.heavyCap=capacityValue(manual.heavyCap);
  row.heavyPct=row.heavyTotal/row.heavyCap*100;
  row._manualHeavyCap=true;
 }
 if(Object.prototype.hasOwnProperty.call(manual,'emptyCap')){
  row.emptyCap=capacityValue(manual.emptyCap);
  row.emptyPct=row.emptyTotal/row.emptyCap*100;
  row._manualEmptyCap=true;
 }
 return row;
}
function restoreCapacityOverrides(){
 capacityOverrides=Object.create(null);
 try{
  const parsed=JSON.parse(g.localStorage.getItem(CAPACITY_STORAGE_PREFIX+accountId)||'{}');
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.keys(parsed).length>3000)throw Error('容量設定格式錯誤');
  for(const [date,entry] of Object.entries(parsed)){
   if(!/^20\d\d-\d\d-\d\d$/.test(date)||!rows.some(r=>r.date===date)||!entry||typeof entry!=='object'||Array.isArray(entry))continue;
   const values={};
   for(const key of ['heavyCap','emptyCap']){
    if(Object.prototype.hasOwnProperty.call(entry,key))values[key]=capacityValue(entry[key]);
   }
   if(Object.keys(values).length)capacityOverrides[date]=values;
  }
 }catch(error){capacityOverrides=Object.create(null);message('已忽略無效的本機容量設定，原 Excel 資料保持不變：'+String(error.message||error),'error');}
}
function setCapacityOverride(date,patch){
 const raw=rows.find(r=>r.date===date);
 if(!raw||!accountId)throw Error('所選日期尚未匯入資料，或目前沒有儲存權限');
 const overrides={...capacityOverrides};
 const entry={...(overrides[date]||{})};
 for(const key of ['heavyCap','emptyCap']){
  if(!Object.prototype.hasOwnProperty.call(patch,key))continue;
  const rawValue=patch[key];
  if(rawValue===null){
   delete entry[key];
   continue;
  }
  const n=capacityValue(rawValue);
  if(n===raw[key])delete entry[key];
  else entry[key]=n;
 }
 if(Object.keys(entry).length)overrides[date]=entry;
 else delete overrides[date];
 // Commit in one localStorage write. If it fails, keep the old effective capacities.
 try{g.localStorage.setItem(CAPACITY_STORAGE_PREFIX+accountId,JSON.stringify(overrides))}
 catch(error){throw Error('容量儲存失敗，原值保留：'+String(error.message||error))}
 capacityOverrides=overrides;
 return effectiveRecord(raw);
}
function saveCapacityPatch(date,patch){
 try{
  setCapacityOverride(date,patch);render();
  message(date+' 儲位容量設定已儲存於此瀏覽器；重櫃／空櫃使用率已重新計算，Excel 原檔未修改。','success');
 }catch(error){
  render();message('容量設定失敗：'+String(error.message||error),'error');
 }
}

function allowedCountValue(value){
 const t=String(value??'').trim(),n=Number(t);
 if(!t||!Number.isSafeInteger(n)||n<1||n>100000000)throw Error('容許櫃量須為 1～100,000,000 的正整數（櫃）');
 return n;
}
function optionalAllowedCountValue(value){
 if(value===undefined||value===null||String(value).trim()==='')return null;
 return allowedCountValue(value);
}
function allowedTeuValue(value){
 if(value===null||value===undefined||String(value).trim()==='')return null;
 const n=Number(String(value).trim());
 if(!Number.isSafeInteger(n)||n<1||n>200000000)throw Error('容許 TEU 上限須為 1～200,000,000 的正整數；不設定請留空');
 return n;
}
// Supports legacy total-only limits. As soon as any 20ft/40ft field is filled,
// the size breakdown becomes the authoritative source of both limit fields.
// The optional third size preserves legacy 20/40-foot calls.
function allowedSizeLimit(raw20,raw40,raw45){
 const a=String(raw20??'').trim(),b=String(raw40??'').trim(),c=String(raw45??'').trim();
 if(!a&&!b&&!c)return null;
 const parse=str=>{
  const n=str===''?0:Number(str);
  if(!Number.isSafeInteger(n)||n<0||n>100000000)throw Error('20／40／45 呎容許櫃數須為 0～100,000,000 的整數');
  return n;
 };
 const twenty=parse(a),forty=parse(b),fortyfive=parse(c),count=twenty+forty+fortyfive,teu=twenty+2*forty+2*fortyfive;
 if(count<1||count>100000000||teu>200000000)throw Error('20／40／45 呎合計必須大於 0，且容許櫃數不超過 100,000,000');
 const result={twenty,forty,count,teu};
 if(c!=='')result.fortyfive=fortyfive;
 return result;
}
// Physical stock: reefer heavy and reefer empty form a monitored *subset*
// of heavy and empty, never an extra additive category.
function containerBreakdown(r){
 if(!r)return null;
 const total=keys=>{
  const a=keys.map(k=>r[k]);
  if(a.some(v=>v===undefined||v===null||!Number.isSafeInteger(Number(v))||Number(v)<0))return null;
  return a.reduce((n,v)=>n+Number(v),0);
 };
 const heavy20=total(['imp20','exp20','trans20','reefer20']);
 const heavy40=total(['imp40','exp40','trans40','reefer40']);
 const empty20=total(['genEmpty20','reeferEmpty20']);
 const empty40=total(['genEmpty40','reeferEmpty40']);
 const reefer20=total(['reefer20','reeferEmpty20']);
 const reefer40=total(['reefer40','reeferEmpty40']);
 const make=(n20,n40)=>n20===null||n40===null?
  {count:null,teu:null,twenty:n20,forty:n40}:
  {count:n20+n40,teu:n20+2*n40,twenty:n20,forty:n40};
 return {heavy:make(heavy20,heavy40),empty:make(empty20,empty40),reefer:make(reefer20,reefer40)};
}
function containerCounts(r){
 const b=containerBreakdown(r);
 return b?{heavy:b.heavy.count,empty:b.empty.count,reefer:b.reefer.count}:null;
}
function compareAllowedCounts(r,limits=allowedCounts){
 const b=containerBreakdown(r);if(!b)return null;
 const result={};
 for(const key of ['heavy','empty','reefer']){
  const value=b[key],actual=value.count,teuActual=value.teu;
  const limit=Number.isSafeInteger(limits?.[key])&&limits[key]>0?limits[key]:null;
  const teuLimit=Number.isSafeInteger(limits?.[key+'Teu'])&&limits[key+'Teu']>0?limits[key+'Teu']:null;
  const remaining=actual===null||limit===null?null:limit-actual;
  const teuRemaining=teuActual===null||teuLimit===null?null:teuLimit-teuActual;
  result[key]={actual,limit,remaining,exceeded:remaining!==null&&remaining<0,
   twenty:value.twenty,forty:value.forty,teuActual,teuLimit,teuRemaining,teuExceeded:teuRemaining!==null&&teuRemaining<0};
 }
 return result;
}
function blankAllowedCounts(){
 return {heavy:null,empty:null,reefer:null,heavyTeu:null,emptyTeu:null,reeferTeu:null,
  heavy20:null,heavy40:null,heavy45:null,empty20:null,empty40:null,empty45:null,reefer20:null,reefer40:null};
}
function restoreAllowedCounts(){
 allowedCounts=blankAllowedCounts();
 try{
  const raw=g.localStorage.getItem(ALLOWANCE_STORAGE_PREFIX+accountId);
  if(!raw)return;
  const data=JSON.parse(raw);
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('資料格式錯誤');
  const next=blankAllowedCounts();
  next.heavy=allowedCountValue(data.heavy);
  next.empty=allowedCountValue(data.empty);
  next.reefer=optionalAllowedCountValue(data.reefer);
  for(const key of ['heavy','empty','reefer']){
   next[key+'Teu']=allowedTeuValue(data[key+'Teu']);
   const size=allowedSizeLimit(data[key+'20'],data[key+'40'],key==='reefer'?null:data[key+'45']);
   if(size){
    next[key+'20']=size.twenty;
    next[key+'40']=size.forty;
    if(Object.prototype.hasOwnProperty.call(size,'fortyfive')&&key!=='reefer')next[key+'45']=size.fortyfive;
     next[key]=size.count;
    next[key+'Teu']=size.teu;
   }
  }
  allowedCounts=next;
 }catch(e){allowedCounts=blankAllowedCounts();message('容許櫃量／TEU 設定無法核對，已停止套用；Excel 原始資料保持不變：'+String(e.message||e),'error')}
}
function setAllowedCounts(heavy,empty,heavyTeu=null,emptyTeu=null,reefer=null,reeferTeu=null,sizeValues={}){
 if(!accountId||!allowanceEditable)throw Error('請先登入具修改權限的管理員，才能儲存容許櫃量');
 const next={heavy:allowedCountValue(heavy),empty:allowedCountValue(empty)};
 const numeric={heavyTeu:allowedTeuValue(heavyTeu),emptyTeu:allowedTeuValue(emptyTeu),
  reefer:optionalAllowedCountValue(reefer),reeferTeu:allowedTeuValue(reeferTeu)};
 for(const [key,val] of Object.entries(numeric))if(val!==null)next[key]=val;
 for(const key of ['heavy','empty','reefer']){
  const size=sizeValues?.[key];
  if(!size)continue;
  const parsed=allowedSizeLimit(size.twenty,size.forty,key==='reefer'?null:size.fortyfive);
  if(!parsed)continue;
  next[key+'20']=parsed.twenty;
  next[key+'40']=parsed.forty;
  if(Object.prototype.hasOwnProperty.call(parsed,'fortyfive')&&key!=='reefer')next[key+'45']=parsed.fortyfive;
   next[key]=parsed.count;
  next[key+'Teu']=parsed.teu;
 }
 try{g.localStorage.setItem(ALLOWANCE_STORAGE_PREFIX+accountId,JSON.stringify(next))}
 catch(e){throw Error('容許櫃量／TEU 儲存失敗，原設定保持不變：'+String(e.message||e))}
 allowedCounts=Object.assign(blankAllowedCounts(),next);
 return next;
}
function clearAllowedCounts(){
 if(!accountId||!allowanceEditable)throw Error('請先登入具修改權限的管理員，才能清除容許櫃量');
 try{g.localStorage.removeItem(ALLOWANCE_STORAGE_PREFIX+accountId)}
 catch(e){throw Error('清除失敗，原設定保持不變：'+String(e.message||e))}
 allowedCounts=blankAllowedCounts();
}
function allowedSummary(k,c){
 if(!c||c.actual===null)return 'Excel 櫃數無法核對';
 if(c.limit===null)return '容許上限：未設定';
 return c.exceeded?'容許 '+fmt(c.limit)+' 櫃｜超量 '+fmt(-c.remaining)+' 櫃':'容許 '+fmt(c.limit)+' 櫃｜剩餘 '+fmt(c.remaining)+' 櫃';
}
function allowedTeuSummary(c){
 if(!c||c.teuActual===null)return '換算 TEU：無法核對';
 const actual=fmt(c.teuActual)+' TEU';
 if(c.teuLimit===null)return '換算 '+actual+'｜TEU 上限未設定';
 return c.teuExceeded?'換算 '+actual+'｜上限 '+fmt(c.teuLimit)+' TEU，超量 '+fmt(-c.teuRemaining)+' TEU'
   :'換算 '+actual+'｜上限 '+fmt(c.teuLimit)+' TEU，剩餘 '+fmt(c.teuRemaining)+' TEU';
}
function refreshAllowedAuto(key){
 const prefix='yard'+key[0].toUpperCase()+key.slice(1)+'Allowed';
 const v20=$(prefix+'20').value,v40=$(prefix+'40').value,v45=key==='reefer'?'':$(prefix+'45').value;
 const preview=$(prefix+'Preview'),total=$(prefix),teu=$(prefix+'Teu');
 try{
  const size=allowedSizeLimit(v20,v40,v45);
  total.readOnly=!!size;teu.readOnly=!!size;
  if(!size){
   preview.textContent='未填尺寸時，可自行輸入總櫃數與 TEU 上限；只有總櫃數無法判斷尺寸比例。';
   return null;
  }
  total.value=String(size.count);teu.value=String(size.teu);
  preview.textContent='自動換算：20 呎 '+fmt(size.twenty)+' 櫃 ×1 ＋ 40 呎 '+fmt(size.forty)+' 櫃 ×2 '+(key==='reefer'?'':'＋ 45 呎 '+fmt(size.fortyfive??0)+' 櫃 ×2 ')+'＝ '+fmt(size.teu)+' TEU；合計 '+fmt(size.count)+' 櫃。';
  return size;
 }catch(e){
  total.readOnly=false;teu.readOnly=false;
  preview.textContent='請修正尺寸櫃數：'+String(e.message||e);
  return null;
 }
}
function renderAllowedSettings(r){
 for(const key of ['heavy','empty','reefer']){
  const prefix='yard'+key[0].toUpperCase()+key.slice(1)+'Allowed';
  $(prefix).value=allowedCounts[key]===null?'':String(allowedCounts[key]);
  $(prefix+'Teu').value=allowedCounts[key+'Teu']===null?'':String(allowedCounts[key+'Teu']);
  $(prefix+'20').value=allowedCounts[key+'20']===null?'':String(allowedCounts[key+'20']);
  $(prefix+'40').value=allowedCounts[key+'40']===null?'':String(allowedCounts[key+'40']);
   if(key!=='reefer')$(prefix+'45').value=allowedCounts[key+'45']===null?'':String(allowedCounts[key+'45']);
  refreshAllowedAuto(key);
  for(const id of [prefix,prefix+'Teu',prefix+'20',prefix+'40',...(key==='reefer'?[]:[prefix+'45'])])$(id).disabled=!allowanceEditable;
 }
 $('yardAllowanceClear').disabled=!allowanceEditable||['heavy','empty','reefer'].every(k=>allowedCounts[k]===null||k==='reefer'&&allowedCounts[k]===null);
 $('yardAllowanceSave').disabled=!allowanceEditable;
 const c=compareAllowedCounts(r);
 $('yardAllowanceTeuBreakdown').textContent=c
  ?['heavy','empty','reefer'].map((key,i)=>{
    const v=c[key],name=['重櫃','空櫃','冷凍櫃'][i];
    return name+'：20 呎 '+fmt(v.twenty)+' ×1 ＋ 40 呎 '+fmt(v.forty)+' ×2 ＝ '+fmt(v.teuActual)+' TEU';
   }).join('；')+'。冷凍櫃已包含於重／空櫃，不重複相加。'
  :'Excel 實際 TEU：20 呎 ×1 ＋ 40 呎 ×2；匯入資料後自動計算。';
 $('yardAllowanceStatus').textContent=(allowanceEditable?'':'此帳號僅能查看，需修改權限才可儲存上限。')+(c
  ?'所選日期 '+r.date+'｜'+['heavy','empty','reefer'].map((key,i)=>{
    const v=c[key],name=['重櫃','空櫃','冷凍櫃'][i];
    return name+' '+(v.actual===null?'無法核對':fmt(v.actual)+' 櫃')+'：'+allowedSummary(key,v)+'；'+allowedTeuSummary(v);
   }).join('。')
  :'可先設定 20／40 呎容許櫃數，會自動換算總櫃數及 TEU；匯入 Excel 後對照實際占用。');
}
function renderAllowedSummary(r){
 const c=compareAllowedCounts(r);
 for(const [key,id,name,teuName] of [
  ['heavy','yardHeavyCount','yardHeavyLimitSummary','yardHeavyTeuSummary'],
  ['empty','yardEmptyCount','yardEmptyLimitSummary','yardEmptyTeuSummary'],
  ['reefer','yardReeferCount','yardReeferLimitSummary','yardReeferTeuSummary']
 ]){
  $(id).textContent=!c||c[key].actual===null?'—':fmt(c[key].actual);
  $(name).textContent=allowedSummary(key,c?.[key]);
  $(name).dataset.exceeded=String(!!c?.[key].exceeded);
  $(teuName).textContent=allowedTeuSummary(c?.[key]);
  $(teuName).dataset.exceeded=String(!!c?.[key].teuExceeded);
 }
}
function saveAllowedFromInputs(){
 try{
  const fields={},sizeValues={};
  for(const key of ['heavy','empty','reefer']){
   const prefix='yard'+key[0].toUpperCase()+key.slice(1)+'Allowed';
   const v20=$(prefix+'20').value,v40=$(prefix+'40').value,v45=key==='reefer'?'':$(prefix+'45').value;
   const size=allowedSizeLimit(v20,v40,v45);
   if(size)sizeValues[key]={twenty:size.twenty,forty:size.forty,...(Object.prototype.hasOwnProperty.call(size,'fortyfive')?{fortyfive:size.fortyfive}:{})};
   fields[key]=size?size.count:$(prefix).value;
   fields[key+'Teu']=size?size.teu:$(prefix+'Teu').value;
  }
  setAllowedCounts(fields.heavy,fields.empty,fields.heavyTeu,fields.emptyTeu,
   fields.reefer,fields.reeferTeu,sizeValues);
  render();message('已儲存重櫃／空櫃／冷凍櫃容許櫃數及 TEU，20 呎＝1 TEU、40／45 呎＝2 TEU 自動換算；原 Excel 不變。','success');
 }catch(e){message('容許櫃量／TEU 設定失敗：'+String(e.message||e),'error')}
}

function restore(){
 try{
  const obj=JSON.parse(g.localStorage.getItem(storageKey)||'null');
  if(!obj||!Array.isArray(obj.rows)||obj.rows.length>3000)return;
  const unique=new Map();
  obj.rows.forEach(r=>{if(r&&typeof r.date==='string'&&/^20\d\d-\d\d-\d\d$/.test(r.date))unique.set(r.date,validateRecord(r));});
  rows=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date));
  fileName=String(obj.fileName||'')||'先前匯入的 Excel';
  updatedAt=String(obj.updatedAt||'');
 }catch(err){rows=[];message('本機資料無法驗證，請重新匯入 Excel：'+String(err.message||err),'error');}
}
function persist(){
 const data={rows,fileName,updatedAt};
 try{g.localStorage.setItem(storageKey,JSON.stringify(data));return true}
 catch(err){message('資料已載入目前畫面，但無法保存在此瀏覽器：'+String(err.message||err),'error');return false}
}
async function importFile(file){
 if(!file)return;
 if(importBusy)return message('Excel 正在匯入與核對中，請完成本次匯入後再試。','info');
 if(!/\.xlsx?$/i.test(file.name))return message('僅支援 .xlsx / .xls 堆場報表','error');
 if(file.size>12*1024*1024)return message('檔案超過 12 MB，請先檢查檔案內容','error');
 if(!g.XLSX)return message('Excel 解析元件尚未載入，請確認網路後重新整理','error');
 importBusy=true;
 message('正在核對 Excel 的每日櫃數、TEU、容量及使用率…');
 try{
  const book=g.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false,cellHTML:false});
  const imported=parseBook(book),existing=new Map(rows.map(r=>[r.date,r]));
  const changed=imported.filter(r=>existing.has(r.date)&&Object.keys(FIELD_ROWS).some(k=>existing.get(r.date)[k]!==r[k]));
  if(changed.length&&!g.confirm('這份報表有 '+changed.length+' 個已儲存日期的數字不同。確認以新 Excel 的原始資料覆蓋這些日期？\n（其他日期會保留，不會累加。）')){
    message('已取消覆蓋，原資料保持不變');return;
  }
  imported.forEach(r=>existing.set(r.date,r));
  rows=[...existing.values()].sort((a,b)=>a.date.localeCompare(b.date));
  fileName=file.name;updatedAt=new Date().toISOString();selectedDate=imported[imported.length-1].date;
  const saved=persist();render();
  if(saved){
   let originalSaved=false;
   try{if(g.Port79AllBackup?.rememberYardImport){await g.Port79AllBackup.rememberYardImport(file);originalSaved=true;}}
   catch(error){message('每日資料已匯入，但Excel原檔未保存：'+String(error.message||error)+'。請保留原檔並重新匯入。','error');return;}
   message('Excel 核對通過：已匯入 '+imported.length+' 天（'+imported[0].date+' 至 '+imported[imported.length-1].date+'）。資料已存此瀏覽器'+(originalSaved?'，原始Excel也已保存':'')+'；請至首頁按「全部系統備份到歷史資料庫」完成雲端備份。','success');
  }
 }catch(err){message('匯入失敗：'+String(err.message||err),'error')}
 finally{importBusy=false;if($('yardFile'))$('yardFile').value='';}
}
function bar(id,n){const el=$(id);if(el)el.style.width=Math.max(0,Math.min(100,n))+'%'}
function donutGradient(segments,total){
 const colors=['#287ef2','#ff861c','#22964f','#9048dc','#15a9b6'];
 if(!(total>0))return '#e1ebfa';
 let angle=0;
 const stops=[];
 segments.forEach((s,i)=>{
  if(!(s.value>0))return;
  const start=angle;angle+=s.value/total*100;
  // Keep each category's original color even when prior categories are zero.
  stops.push(colors[i%colors.length]+' '+start.toFixed(4)+'% '+angle.toFixed(4)+'%');
 });
 return stops.length?'conic-gradient('+stops.join(',')+')':'#e1ebfa';
}
function donut(id,centerId,legendId,segments,total){
 const colors=['#287ef2','#ff861c','#22964f','#9048dc','#15a9b6'];
 $(id).style.background=donutGradient(segments,total);
 $(centerId).textContent=fmt(total);
 $(legendId).innerHTML=segments.map((s,i)=>{
  const share=total>0?s.value/total*100:0;
  return '<div class="yard-legend-row"><i style="background:'+colors[i%colors.length]+'"></i><span class="yard-legend-label">'+safe(s.label)+'</span><span class="yard-legend-value">'+fmt(s.value)+' TEU <small>('+share.toFixed(1)+'%)</small></span></div>';
 }).join('');
 $(id).setAttribute('aria-label',segments.map(s=>s.label+' '+fmt(s.value)+' TEU').join('，'));
}
function meter(rate){const tone=rate>100?'danger':rate>=80?'warn':'';return '<div class="yard-meter '+tone+'"><i style="width:'+Math.max(0,Math.min(100,rate))+'%"></i></div>'}
function renderKpis(r){
 for(const [id,key] of [['yardHeavyTotal','heavyTotal'],['yardEmptyTotal','emptyTotal'],['yardHeavyCap','heavyCap'],['yardLongTotal','longTotal'],['yardEmptyCap','emptyCap']])$(id).textContent=fmt(r[key]);
 $('yardHeavyRate').textContent=pct(r.heavyPct);$('yardEmptyRate').textContent=pct(r.emptyPct);
 bar('yardHeavyBar',r.heavyPct);bar('yardEmptyBar',r.emptyPct);
}
function renderDonuts(r){
 donut('yardHeavyDonut','yardHeavyCenter','yardHeavyLegend',[
  {label:'進口',value:r.impTeu},{label:'出口',value:r.expTeu},{label:'轉口',value:r.transTeu},{label:'冷凍重櫃',value:r.reeferTeu}
 ],r.heavyTotal);
 donut('yardEmptyDonut','yardEmptyCenter','yardEmptyLegend',[
  {label:'一般空櫃',value:r.genEmptyTeu},{label:'冷凍空櫃',value:r.reeferEmptyTeu}
 ],r.emptyTotal);
 $('yardHeavySub').textContent='('+fmt(r.heavyTotal)+' TEU)';
 $('yardEmptySub').textContent='('+fmt(r.emptyTotal)+' TEU)';
}
function plugRow(label,cap,used,rate){return '<tr><td>'+label+'</td><td>'+fmt(cap)+'</td><td>'+fmt(used)+'</td><td><div class="usage-cell"><strong class="'+(rate>100?'yard-error':'')+'">'+pct(rate)+'</strong>'+meter(rate)+'</div></td></tr>'}
function renderPlugs(r){
 const combined=100*(r.reefer20+r.reefer40)/(r.heavyPlug20Cap+r.heavyPlug40Cap);
 $('yardPlugRows').innerHTML=plugRow('20 呎',r.heavyPlug20Cap,r.reefer20,r.heavyPlug20Pct)+
 plugRow('40 呎',r.heavyPlug40Cap,r.reefer40,r.heavyPlug40Pct)+
 '<tr class="total"><td>合計</td><td>'+fmt(r.heavyPlug20Cap+r.heavyPlug40Cap)+'</td><td>'+fmt(r.reefer20+r.reefer40)+'</td><td>'+pct(combined)+'</td></tr>';
}
function detailLine(label,a,b,teu,extra){return '<tr'+(extra||'')+'><td>'+safe(label)+'</td><td>'+fmt(a)+'</td><td>'+fmt(b)+'</td><td>'+fmt(teu)+'</td></tr>'}
function renderDaily(r){
 $('yardTableDate').textContent='('+r.date.replace(/-/g,'/')+')';
 $('yardDailyRows').innerHTML=[
 detailLine('重櫃－進口',r.imp20,r.imp40,r.impTeu),
 detailLine('重櫃－出口',r.exp20,r.exp40,r.expTeu),
 detailLine('重櫃－轉口',r.trans20,r.trans40,r.transTeu),
 detailLine('重櫃－冷凍',r.reefer20,r.reefer40,r.reeferTeu),
 '<tr class="total"><td>重櫃合計</td><td>'+fmt(r.imp20+r.exp20+r.trans20+r.reefer20)+'</td><td>'+fmt(r.imp40+r.exp40+r.trans40+r.reefer40)+'</td><td>'+fmt(r.heavyTotal)+'</td></tr>',
 detailLine('一般空櫃',r.genEmpty20,r.genEmpty40,r.genEmptyTeu),
 detailLine('冷凍空櫃',r.reeferEmpty20,r.reeferEmpty40,r.reeferEmptyTeu),
 '<tr class="emptytotal"><td>空櫃合計</td><td>'+fmt(r.genEmpty20+r.reeferEmpty20)+'</td><td>'+fmt(r.genEmpty40+r.reeferEmpty40)+'</td><td>'+fmt(r.emptyTotal)+'</td></tr>'
 ].join('');
}
function trendAxisMax(list){
 const peak=Math.max(0,...list.map(r=>Math.max(Number(r.heavyTotal)||0,Number(r.emptyTotal)||0)));
 if(!(peak>0))return 1;
 const raw=peak/4, magnitude=10**Math.floor(Math.log10(raw));
 const tick=[1,1.25,1.5,2,2.5,3,4,5,6,8,10].find(v=>v*magnitude>=raw)*magnitude;
 return Number((4*tick).toPrecision(12));
}
function trendSvg(list){
 const W=850,H=255,L=55,R=20,T=14,B=42,iw=W-L-R,ih=H-T-B;
 const cap=trendAxisMax(list), Y=n=>T+ih-(n/cap)*ih;
 const X=i=>L+(list.length===1?iw/2:i*iw/(list.length-1));
 let svg='<svg viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="重櫃藍色與空櫃綠色庫存折線圖"><text x="'+L+'" y="10" fill="#64758a" font-size="11">TEU</text>';
 for(let i=0;i<=4;i++){const val=cap*i/4,y=Y(val);svg+='<line x1="'+L+'" y1="'+y+'" x2="'+(W-R)+'" y2="'+y+'" stroke="#e1e9f4"/><text x="'+(L-9)+'" y="'+(y+4)+'" text-anchor="end" fill="#64758a" font-size="11">'+fmt(val)+'</text>';}
 const steps=list.length>22?Math.ceil(list.length/14):1;
 list.forEach((r,i)=>{if(i%steps===0||i===list.length-1)svg+='<text x="'+X(i)+'" y="'+(H-15)+'" text-anchor="middle" fill="#55657c" font-size="11">'+Number(r.date.slice(-2))+'/'+Number(r.date.slice(5,7))+'</text>';});
 for(const [key,color] of [['heavyTotal','#207ae8'],['emptyTotal','#11972e']]){
  const points=list.map((r,i)=>[X(i),Y(r[key])]);
  svg+='<polyline points="'+points.map(p=>p.join(',')).join(' ')+'" fill="none" stroke="'+color+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
  list.forEach((r,i)=>{const x=X(i),y=Y(r[key]);svg+='<circle cx="'+x+'" cy="'+y+'" r="4" fill="white" stroke="'+color+'" stroke-width="2.5"><title>'+r.date+' '+(key==='heavyTotal'?'重櫃':'空櫃')+' '+fmt(r[key])+' TEU</title></circle>';});
 }
 svg+='</svg>';return svg;
}
function alertNotices(r,period,limits=allowedCounts){
 const notices=[];
 for(const x of period){
  const day=x.date.slice(5).replace('-','/');
  const counts=compareAllowedCounts(x,limits);
  if(counts?.heavy.exceeded)notices.push(day+'：重櫃實際 '+fmt(counts.heavy.actual)+' 櫃，超過容許上限 '+fmt(counts.heavy.limit)+' 櫃（超出 '+fmt(-counts.heavy.remaining)+' 櫃）');
  if(counts?.empty.exceeded)notices.push(day+'：空櫃實際 '+fmt(counts.empty.actual)+' 櫃，超過容許上限 '+fmt(counts.empty.limit)+' 櫃（超出 '+fmt(-counts.empty.remaining)+' 櫃）');
  if(counts?.heavy.teuExceeded)notices.push(day+'：重櫃 20／40 呎換算 '+fmt(counts.heavy.teuActual)+' TEU，超過容許 TEU 上限 '+fmt(counts.heavy.teuLimit)+' TEU（超出 '+fmt(-counts.heavy.teuRemaining)+' TEU）');
  if(counts?.empty.teuExceeded)notices.push(day+'：空櫃 20／40 呎換算 '+fmt(counts.empty.teuActual)+' TEU，超過容許 TEU 上限 '+fmt(counts.empty.teuLimit)+' TEU（超出 '+fmt(-counts.empty.teuRemaining)+' TEU）');
  if(counts?.reefer.exceeded)notices.push(day+'：冷凍櫃實際 '+fmt(counts.reefer.actual)+' 櫃，超過容許上限 '+fmt(counts.reefer.limit)+' 櫃（超出 '+fmt(-counts.reefer.remaining)+' 櫃）');
  if(counts?.reefer.teuExceeded)notices.push(day+'：冷凍櫃 20／40 呎換算 '+fmt(counts.reefer.teuActual)+' TEU，超過容許 TEU 上限 '+fmt(counts.reefer.teuLimit)+' TEU（超出 '+fmt(-counts.reefer.teuRemaining)+' TEU）');
  if(x.heavyTotal>x.heavyCap)notices.push(day+'：重櫃場存 '+fmt(x.heavyTotal)+' TEU，超過容量 '+fmt(x.heavyCap)+' TEU');
  if(x.emptyTotal>x.emptyCap)notices.push(day+'：空櫃場存 '+fmt(x.emptyTotal)+' TEU，超過容量 '+fmt(x.emptyCap)+' TEU');
  if(x.heavyPlug20Pct>100)notices.push(day+'：20 呎冷凍重櫃插座 '+pct(x.heavyPlug20Pct)+'（超過容量）');
  if(x.heavyPlug40Pct>100)notices.push(day+'：40 呎冷凍重櫃插座 '+pct(x.heavyPlug40Pct)+'（超過容量）');
 }
 for(let i=1;i<period.length;i++)for(const [key,label] of [['heavyCap','重櫃容量'],['emptyCap','空櫃容量']])
   if(period[i][key]!==period[i-1][key])notices.push(period[i].date.slice(5).replace('-','/')+'：'+label+'由 '+fmt(period[i-1][key])+' 調整為 '+fmt(period[i][key])+' TEU');
 const diff=r.genEmptyTeu-(r.genEmpty20+2*r.genEmpty40);
 if(Math.abs(diff)>0.02)notices.push(r.date.slice(5).replace('-','/')+'：一般空櫃原檔小計與 20／40 呎基本換算相差 '+fmt(diff)+' TEU，保留原檔數值');
 return notices;
}
function alerts(r,period){
 const notices=alertNotices(r,period);
 if(!notices.length){
  $('yardAlerts').innerHTML='<span>已核對現有匯入資料，暫無需提醒的數量或容量異常。</span>';
  $('yardAlerts').parentElement.classList.add('clear');
 }else{
  $('yardAlerts').innerHTML=notices.slice(-6).map(s=>'<span>'+safe(s)+'</span>').join('');
  $('yardAlerts').parentElement.classList.remove('clear');
 }
}
function historyTable(list,keys,headings,capacityKey=''){
 const editable=['heavyCap','emptyCap'].includes(capacityKey);
 return '<div class="yard-tablewrap"><table class="yard-history-table"><thead><tr><th>日期</th>'+headings.map(s=>'<th>'+safe(s)+'</th>').join('')+(editable?'<th>手動容量 TEU</th>':'')+'</tr></thead><tbody>'+
 list.slice().reverse().map(r=>{
  const input=editable?'<td class="yard-capacity-history-cell"><input type="number" min="0.01" max="100000000" step="0.01" class="yard-capacity-inline'+(r[capacityKey==='heavyCap'?'_manualHeavyCap':'_manualEmptyCap']?' is-manual':'')+'" data-yard-cap-key="'+capacityKey+'" data-yard-cap-date="'+safe(r.date)+'" value="'+r[capacityKey]+'" aria-label="'+safe(r.date)+(capacityKey==='heavyCap'?'重櫃':'空櫃')+'容量 TEU" title="輸入容量後按 Enter 或離開欄位即可儲存"><small>'+(r[capacityKey==='heavyCap'?'_manualHeavyCap':'_manualEmptyCap']?'手動':'Excel')+'</small></td>':'';
  return '<tr><td>'+safe(r.date)+'</td>'+keys.map(k=>'<td>'+fmt(r[k])+'</td>').join('')+input+'</tr>';
 }).join('')+'</tbody></table></div>';
}
function detailCard(title,subtitle,html){
 return '<article class="yard-detail-section"><h2>'+title+'</h2><p class="yard-detail-intro">'+subtitle+'</p>'+html+'</article>';
}
function renderDetail(r,list){
 let title='',subtitle='',inner='';
 if(view==='heavy'){
  title='▥ 重櫃管理｜'+r.date;subtitle='分類小計依 Excel 原始 TEU 欄，20／40 呎為櫃數。特殊重櫃與 Long-Stay 為另列分類，不重複加總。';
  inner='<div class="yard-detail-grid"><div>'+historyTable([r],['imp20','imp40','impTeu','expTeu','transTeu','reeferTeu','heavyTotal'],['進口20櫃','進口40櫃','進口TEU','出口TEU','轉口TEU','冷凍TEU','重櫃合計TEU'])+'</div><div>'+
   '<div class="yard-detail-split"><span>進口重櫃</span><b>'+fmt(r.impTeu)+' TEU</b></div><div class="yard-detail-split"><span>出口重櫃</span><b>'+fmt(r.expTeu)+' TEU</b></div><div class="yard-detail-split"><span>轉口重櫃</span><b>'+fmt(r.transTeu)+' TEU</b></div><div class="yard-detail-split"><span>冷凍重櫃</span><b>'+fmt(r.reeferTeu)+' TEU</b></div><hr><div class="yard-detail-split"><span>特殊重櫃（另列）</span><b>'+fmt(r.specialHeavyCount)+' 櫃 / '+fmt(r.specialHeavyTeu)+' TEU</b></div></div></div>'+
   '<h3 class="yard-detail-subhead">逐日重櫃趨勢</h3>'+historyTable(list,['impTeu','expTeu','transTeu','reeferTeu','heavyTotal','heavyCap','heavyPct'],['進口TEU','出口TEU','轉口TEU','冷凍TEU','場存TEU','容量TEU','使用率％']);
 } else if(view==='empty'){
  title='▥ 空櫃管理｜'+r.date;subtitle='一般空櫃＋冷凍空櫃＝空櫃總量；特殊空櫃為另列資訊，可能與總場存重疊，不另加總。';
  inner='<div class="yard-detail-grid"><div><div class="yard-detail-split"><span>一般空櫃</span><b>'+fmt(r.genEmptyTeu)+' TEU</b></div><div class="yard-detail-split"><span>冷凍空櫃</span><b>'+fmt(r.reeferEmptyTeu)+' TEU</b></div><div class="yard-detail-split"><span>空櫃合計</span><b>'+fmt(r.emptyTotal)+' TEU</b></div></div><div><div class="yard-detail-split"><span>儲位容量</span><b>'+fmt(r.emptyCap)+' TEU</b></div><div class="yard-detail-split"><span>儲位使用率</span><b>'+pct(r.emptyPct)+'</b></div><div class="yard-detail-split"><span>特殊空櫃（另列）</span><b>'+fmt(r.specialEmptyTeu)+' TEU</b></div></div></div>'+
   '<h3 class="yard-detail-subhead">逐日空櫃趨勢</h3>'+historyTable(list,['genEmptyTeu','reeferEmptyTeu','emptyTotal','emptyCap','emptyPct','specialEmptyTeu'],['一般TEU','冷凍TEU','總場存TEU','容量TEU','使用率％','特殊櫃TEU']);
 } else if(view==='plugs'){
  title='♧ 冷凍插座｜'+r.date;subtitle='重櫃插座：使用櫃數可由同日冷凍重櫃數驗證；空櫃／PTI 插座只有原 Excel 使用率，不能假設 PTI 櫃數就是使用插座數。';
  inner='<h3 class="yard-detail-subhead">冷凍重櫃插座</h3><div class="yard-tablewrap"><table class="yard-table plugs"><thead><tr><th>櫃型</th><th>插座容量</th><th>冷凍重櫃數</th><th>使用率</th></tr></thead><tbody>'+
   plugRow('20 呎',r.heavyPlug20Cap,r.reefer20,r.heavyPlug20Pct)+plugRow('40 呎',r.heavyPlug40Cap,r.reefer40,r.heavyPlug40Pct)+'</tbody></table></div>'+
   '<h3 class="yard-detail-subhead">冷凍空櫃／PTI 插座（Excel 原始填報）</h3>'+
   '<div class="yard-tablewrap"><table class="yard-table"><thead><tr><th>櫃型</th><th>PTI 插座容量</th><th>使用率</th><th>PTI 冷凍空櫃數</th></tr></thead><tbody>'+
   '<tr><td>20 呎</td><td>'+fmt(r.pti20Cap)+'</td><td>'+pct(r.emptyPlug20Pct)+'</td><td>'+fmt(r.pti20)+'</td></tr><tr><td>40 呎</td><td>'+fmt(r.pti40Cap)+'</td><td>'+pct(r.emptyPlug40Pct)+'</td><td>'+fmt(r.pti40)+'</td></tr></tbody></table></div>'+
   '<p class="yard-discrepancy">PTI 櫃數與插座使用率為原檔不同欄位；目前缺少可核對的實際插座占用櫃數，不使用反推數字。</p>'+
   '<h3 class="yard-detail-subhead">每日重櫃插座使用率</h3>'+historyTable(list,['heavyPlug20Cap','reefer20','heavyPlug20Pct','heavyPlug40Cap','reefer40','heavyPlug40Pct'],['20容量','20櫃數','20使用率％','40容量','40櫃數','40使用率％']);
 } else if(view==='long'){
  title='▣ Long-Stay 長期儲存與歷史｜'+r.date;subtitle='進口、出口、轉口長期重櫃之 TEU 合計；屬重櫃總場存的分類，絕不可再次加總到重櫃場存。';
  inner='<div class="yard-detail-grid"><div><div class="yard-detail-split"><span>進口 Long-Stay</span><b>'+fmt(r.longImpTeu)+' TEU</b></div><div class="yard-detail-split"><span>出口 Long-Stay</span><b>'+fmt(r.longExpTeu)+' TEU</b></div><div class="yard-detail-split"><span>轉口 Long-Stay</span><b>'+fmt(r.longTransTeu)+' TEU</b></div><hr><div class="yard-detail-split"><span>Long-Stay 合計</span><b>'+fmt(r.longTotal)+' TEU</b></div></div><div><div class="yard-detail-split"><span>重櫃場存</span><b>'+fmt(r.heavyTotal)+' TEU</b></div><div class="yard-detail-split"><span>Long-Stay 占重櫃</span><b>'+(r.heavyTotal>0?pct(r.longTotal/r.heavyTotal*100):'—')+'</b></div><p class="yard-discrepancy">此比率為同日長期存放重櫃占比，不是儲位使用率。</p></div></div>'+
   '<h3 class="yard-detail-subhead">每日 Long-Stay 歷史紀錄</h3>'+historyTable(list,['longImpTeu','longExpTeu','longTransTeu','longTotal'],['進口TEU','出口TEU','轉口TEU','Long-Stay總TEU']);
 } 
 $('yardDetailBody').innerHTML=detailCard(title,subtitle,inner);
}
function render(){
 $('yardMonth').innerHTML=[...new Set(rows.map(r=>r.date.slice(0,7)))].reverse().map(m=>'<option value="'+m+'">'+m.replace('-',' 年 ')+' 月</option>').join('');
 if(!selectedDate&&rows.length)selectedDate=rows[rows.length-1].date;
 if(selectedDate){$('yardDate').value=selectedDate;$('yardMonth').value=selectedDate.slice(0,7)}
 const raw=rows.find(x=>x.date===selectedDate);
 const r=raw; // Keep original Excel TEU and percentages; deprecated TEU overrides remain saved but are not applied.
 const allowanceMode=view==='allowance';
 $('yardAllowedSettings').hidden=!allowanceMode;
 $('yardEmpty').hidden=!!r||allowanceMode;$('yardContent').hidden=!r||allowanceMode;
 if(allowanceMode){renderAllowedSettings(r);return;}
 if(!r){
  $('yardEmpty').querySelector('h2').textContent=rows.length?'此日期尚未匯入資料':'請先匯入堆場報表';
  return;
 }
 const list=rows.filter(x=>x.date.slice(0,7)===r.date.slice(0,7)&&x.date<=r.date);
 $('yardOverview').hidden=view!=='overview';$('yardDetails').hidden=view==='overview';
 if(view==='overview'){
  renderKpis(r);renderDonuts(r);renderPlugs(r);renderDaily(r);renderAllowedSummary(r);
  $('yardTrendChart').innerHTML=trendSvg(list);
  $('yardTrendPeriod').textContent='('+list[0].date.slice(5).replace('-','/')+'－'+r.date.slice(5).replace('-','/')+')';
  alerts(r,list);
 }else renderDetail(r,list);
 $('yardSource').textContent='資料來源：'+fileName+'｜當日 '+r.date+'｜共 '+rows.length+' 天｜僅目前瀏覽器，非雲端同步';
}
function setView(next){
 if(!['overview','heavy','empty','plugs','long','allowance'].includes(next))return;
 view=next;d.querySelectorAll('[data-yard-view]').forEach(btn=>{const active=btn.dataset.yardView===view;btn.classList.toggle('selected',active);btn.setAttribute('aria-pressed',String(active));});
 render();
}
function exportCsv(){
 if(!rows.length)return message('尚無資料可匯出','error');
 const headers=['date',...Object.keys(FIELD_ROWS)],body=[headers,...rows.map(r=>headers.map(k=>r[k]))];
 const csv='\ufeff'+body.map(a=>a.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
 const a=d.createElement('a');a.href=url;a.download='PORT79-yard-'+rows[0].date+'-'+rows[rows.length-1].date+'.csv';d.body.appendChild(a);a.click();a.remove();g.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function isExcelFileDrag(event){
 const transfer=event?.dataTransfer;
 return Array.from(transfer?.types||[]).includes('Files')||Number(transfer?.files?.length)>0;
}
function bindExcelDrop(){
 const overlay=$('yardDropOverlay');
 let depth=0;
 const hide=()=>{depth=0;if(overlay)overlay.hidden=true;};
 d.addEventListener('dragenter',event=>{
  if(!isExcelFileDrag(event))return;
  event.preventDefault();depth++;
  if(overlay&&accountId)overlay.hidden=false;
 });
 d.addEventListener('dragover',event=>{
  if(!isExcelFileDrag(event))return;
  event.preventDefault();
  if(event.dataTransfer)event.dataTransfer.dropEffect='copy';
  if(overlay&&accountId)overlay.hidden=false;
 });
 d.addEventListener('dragleave',event=>{
  if(!isExcelFileDrag(event))return;
  depth=Math.max(0,depth-1);
  if(!depth)hide();
 });
 d.addEventListener('drop',event=>{
  if(!isExcelFileDrag(event))return;
  event.preventDefault();hide();
  if(!accountId)return message('請先登入有權限的管理員帳號，再匯入堆場 Excel。','error');
  const files=Array.from(event.dataTransfer?.files||[]);
  if(files.length!==1)return message('每次只能拖入一個 Excel 檔案，請重新選擇。','error');
  void importFile(files[0]);
 });
 d.addEventListener('dragend',hide);
 g.addEventListener?.('blur',hide);
}
function enableEmbed(){
 if(new URLSearchParams(g.location.search).get('embed')!=='1'||g.parent===g)return;
 d.documentElement.classList.add('yard-embedded');
 const notify=()=>{const height=Math.ceil(d.documentElement.scrollHeight);if(height>100)g.parent.postMessage({type:'p79-yard-dashboard-resize',height},g.location.origin)};
 if(g.ResizeObserver)new ResizeObserver(notify).observe(d.body);
 g.addEventListener('load',notify);notify();
}
function init(){
 enableEmbed();
 bindExcelDrop();
 accountId=identity();allowanceEditable=canEditAllowedCounts();
 $('yardAllowanceSave').disabled=!allowanceEditable;
 $('yardAllowanceClear').disabled=!allowanceEditable;
 $('yardHeavyAllowed').disabled=!allowanceEditable;
 $('yardEmptyAllowed').disabled=!allowanceEditable;
 $('yardHeavyAllowedTeu').disabled=!allowanceEditable;
 $('yardEmptyAllowedTeu').disabled=!allowanceEditable;
 for(const k of ['Heavy','Empty','Reefer']){
  for(const suffix of (k==='Reefer'?['20','40']:['20','40','45'])){
   const input=$('yard'+k+'Allowed'+suffix);
   input.disabled=!allowanceEditable;
   input.addEventListener('input',()=>refreshAllowedAuto(k.toLowerCase()));
  }
 }
 $('yardReeferAllowed').disabled=!allowanceEditable;
 $('yardReeferAllowedTeu').disabled=!allowanceEditable;
 if(!accountId){
  $('yardEmpty').hidden=false;$('yardEmpty').querySelector('h2').textContent='請先登入碼頭系統管理';
  $('yardEmpty').querySelector('p').textContent='堆場數據需由有權限的管理員從正式首頁進入，未登入不提供讀取或匯入。';
  $('yardImport').disabled=true;$('yardEmptyImport').disabled=true;$('yardExport').disabled=true;
  message('目前登入身分未驗證，堆場資料不會公開顯示。','error');
  return;
 }
 storageKey=STORAGE_PREFIX+accountId;
 restore();restoreAllowedCounts();render();
 if(rows.length)message('已載入目前登入帳號在本瀏覽器儲存的 '+rows.length+' 天資料（'+safe(fileName)+'）。尚未同步雲端。','success');
 $('yardImport').addEventListener('click',()=>$('yardFile').click());
 $('yardEmptyImport').addEventListener('click',()=>$('yardFile').click());
 $('yardFile').addEventListener('change',e=>void importFile(e.target.files?.[0]));
 $('yardExport').addEventListener('click',exportCsv);
 $('yardAllowanceSave').addEventListener('click',saveAllowedFromInputs);
 $('yardAllowanceClear').addEventListener('click',()=>{
  if(allowedCounts.heavy===null&&allowedCounts.empty===null&&allowedCounts.reefer===null)return;
  if(!g.confirm('確定清除空櫃與重櫃的容許櫃量上限？Excel 原檔不會修改。'))return;
  try{clearAllowedCounts();render();message('已清除容許櫃量設定，Excel 原始數字未變。','success');}
  catch(e){message('清除失敗：'+String(e.message||e),'error')}
 });
 $('yardDate').addEventListener('change',e=>{selectedDate=e.target.value;render();});
 $('yardMonth').addEventListener('change',e=>{const m=e.target.value,days=rows.filter(r=>r.date.startsWith(m));selectedDate=days.length?days[days.length-1].date:'';render();});
 d.querySelectorAll('[data-yard-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.yardView)));
}
g.P79YardDashboard={parseDate,validateRecord,parseBook,fieldRows:FIELD_ROWS,donutGradient,alertNotices,trendAxisMax,trendSvg,containerCounts,containerBreakdown,compareAllowedCounts,allowedCountValue,allowedTeuValue,allowedSizeLimit,setAllowedCounts,clearAllowedCounts,historyTable,capacityValue,effectiveRecord,setCapacityOverride};
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);

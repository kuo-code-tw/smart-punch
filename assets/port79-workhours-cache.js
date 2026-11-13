(function(g){
'use strict';
// Explicit, account-scoped month bundles. Generic no-store/auth/mutation reads
// keep their existing semantics; save/revoke/export audit routes never use this.
const flights=new Map(),metaFlights=new Map(),metaMemo=new Map(),memory=new Map();
// Every consumer of a shared read receives its display preview, including a
// table opened while startup is already checking the same month.
const observers=new Map();
function observe(k,options){
 let entry=observers.get(k);if(!entry){entry={listeners:new Set(),preview:null,roster:null,invalidated:null};observers.set(k,entry);}
 entry.listeners.add(options);
 if(entry.preview&&options.force!==true)deliver(options.onPreview,entry.preview);
 if(entry.invalidated)deliver(options.onInvalidate,entry.invalidated);
 if(entry.roster)deliver(options.onRoster,entry.roster);
}
function deliver(callback,value){try{if(callback)callback(copy(value));}catch(_){}}
function publish(k,type,value){const entry=observers.get(k);if(!entry)return;if(type==='onPreview')entry.preview=value;if(type==='onRoster')entry.roster=value;if(type==='onInvalidate'){entry.preview=null;entry.roster=null;entry.invalidated=value;}for(const options of entry.listeners){if(type==='onPreview'&&options.force===true)continue;deliver(options[type],value);}}
let generation=0,startupFlight=null;
const copy=x=>JSON.parse(JSON.stringify(x));
function remember(k,b){memory.delete(k);memory.set(k,b);while(memory.size>3)memory.delete(memory.keys().next().value);}
const context=()=>g.P79WorkhoursCacheContext;
function mutationStamp(){try{return String(g.sessionStorage?.getItem('port79_cache_mutated_at')||'');}catch(_){return '';}}
function identity(){const c=context(),token=c?.token?.(),viewer=g.Port79DataCache?.viewerKey?.(),url=c?.url?.();if(!token||!viewer||!url||!c.canRead()||c.cacheAccess?.()===false)throw Error('登入或加班查看權限已失效');const endpoint=new URL(url);if(endpoint.origin!=='https://script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint.pathname))throw Error('GAS 網址不正確');return {token,viewer,url,generation,stamp:mutationStamp()};}
function assert(s){const n=identity();if(n.token!==s.token||n.viewer!==s.viewer||n.url!==s.url||n.generation!==s.generation||n.stamp!==s.stamp)throw Error('登入或資料版本已變更，請重新讀取');}
function key(s,month){return s.viewer+'|system|workhours|verified-v1|'+encodeURIComponent(s.url)+'|'+month;}
function monthsFor(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('月份格式不正確');const d=new Date(month+'-01T00:00:00Z'),current=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).format(new Date()),offset=n=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,1)).toISOString().slice(0,7);return [offset(-1),month,...(offset(1)<=current?[offset(1)]:[])];}
async function request(s,action,month){
 assert(s);const u=new URL(s.url);u.searchParams.set('action',action);u.searchParams.set('month',month);u.searchParams.set('token',s.token);u.searchParams.set('gcToken',s.token);
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),45000);
 try{const r=await g.fetch(u.toString(),{cache:'no-store',signal:ctl.signal}),d=await r.json();assert(s);if(r.ok===false||d?.ok!==true||d.retryable)throw Error(d?.error||'雲端讀取未完成');return d;}catch(e){if(e?.name==='AbortError')throw Error('雲端版本或月份讀取逾時，已保留本機資料，請重新核對');throw e;}finally{clearTimeout(timer);}
}
async function meta(s,month,force=false){
 const k=key(s,month)+'|'+s.token+'|'+s.stamp+'|'+s.generation,m=metaMemo.get(k);
 if(!force&&m&&Date.now()-m.at<2000)return m.data;
 if(metaFlights.has(k))return metaFlights.get(k);
 const p=request(s,'getOvertimeReportCacheMeta',month).then(d=>{if(d.cacheSchemaVersion!==1||d.month!==month||!d.version||!d.revisions||d.viewer!==s.viewer.split('@')[0])throw Error('加班快取版本或帳號尚未核對成功');metaMemo.set(k,{at:Date.now(),data:d});return d;}).finally(()=>metaFlights.delete(k));metaFlights.set(k,p);return p;
}
function valid(b,month,s){
 const months=monthsFor(month);
 return b?.schema===1&&b.month===month&&b.viewer===s.viewer&&b.url===s.url&&typeof b.version==='string'&&b.version&&b.config?.ok===true&&b.config.config&&typeof b.config.config==='object'&&b.roster?.ok===true&&b.roster.month===month&&b.meta?.version===b.version&&Array.isArray(b.roster.employees)&&Array.isArray(b.roster.schedules)&&b.roster.schedules.every(r=>r&&String(r.month)===month&&r.schedule&&typeof r.schedule==='object'&&!Array.isArray(r.schedule))&&months.every(m=>b.raw?.[m]?.ok===true&&b.raw[m].month===m&&Array.isArray(b.raw[m].records));
}
async function saved(s,month){
 const k=key(s,month),stamp=Number(s.stamp)||0;if(valid(memory.get(k),month,s)&&Number(memory.get(k).savedAt||0)>=stamp)return memory.get(k);
 let timer;try{const row=await Promise.race([g.Port79DataCache?.get?.(k),new Promise(r=>{timer=setTimeout(()=>r(null),10000);})]);assert(s);if(valid(row?.data,month,s)&&row.savedAt>0&&row.savedAt>=stamp&&row.savedAt<=Date.now()+60000){row.data.savedAt=row.savedAt;remember(k,row.data);return row.data;}}catch(_){}finally{clearTimeout(timer);}return null;
}
function compatible(b,m){
 const r=m.revisions,revision=[r.schedule,r.leave,r.employees,b.month].join(':');
 return b.roster.revision===revision&&Object.values(b.raw).every(d=>String(d.revision)===String(r.attendance)&&String(d.deltaSeq)===String(r.attendanceDelta));
}
function load(month,options={}){
 const s=identity(),k=key(s,month)+'|'+s.token+'|'+s.stamp+'|'+s.generation;
 observe(k,options);
 if(flights.has(k))return flights.get(k).then(b=>{assert(s);return copy(b);});
 const p=(async()=>{
  const metaRead=meta(s,month,options.force===true);metaRead.catch(()=>{});
  const prior=await saved(s,month);assert(s);
  // Preview is explicitly marked unverified; no accounting/save operation gets
  // this result. UI still filters people through the current authenticated scope.
  if(prior)publish(k,'onPreview',{...copy(prior),preview:true,source:'本機快取，背景核對中'});
  let before=await metaRead;assert(s);
  if(prior&&prior.version===before.version){const hit={...prior,source:'本機有效快取',preview:false,meta:before};remember(key(s,month),hit);return hit;}
  // A scope/HR revision change must immediately stop showing old scoped data.
  if(prior&&prior.meta?.revisions?.scope!==before.revisions.scope)publish(k,'onInvalidate',month);
  for(let attempt=0;attempt<2;attempt++){
   // GAS can hold a shared document lock for schedule reads. Fetching the roster,
   // multiple raw months and config together can exhaust its 8-second lock wait.
   // Start with the roster and then read at most two other resources concurrently.
   const months=monthsFor(month);
   // Reuse a just-finished authenticated roster request already made by the
   // visible overtime page. This removes a duplicate GAS sheet read, not its
   // version, identity or per-scope verification.
   let sharedRoster=null;
   try{sharedRoster=await context()?.recentRoster?.(month,s.token,s.stamp);}catch(_){}
   assert(s);
   const roster=sharedRoster?.ok===true&&sharedRoster.month===month&&Array.isArray(sharedRoster.employees)&&Array.isArray(sharedRoster.schedules)
    ? sharedRoster : await request(s,'getScheduleDataSecure',month);
   assert(s);
   // Authenticated roster rows can be displayed before the cross-month raw
   // punches finish. They remain a preview until the final version check.
   publish(k,'onRoster',{month,roster,preview:true,source:'雲端班表已讀取，考勤核對中'});
   const batches=[];
   for(let offset=0;offset<months.length;offset+=2){
    const group=await Promise.all(months.slice(offset,offset+2).map(m=>request(s,'getAttendanceMonthRaw',m)));
    batches.push(...group);assert(s);
   }
   const config=await request(s,'getOvertimeConfig',month);assert(s);
   const raw=Object.fromEntries(months.map((m,i)=>[m,batches[i]]));
   if(Array.isArray(roster.employees))Object.values(raw).forEach(d=>{if(Array.isArray(d.records)&&context().scopeRecords){d.records=context().scopeRecords(d.records,roster.employees);d.recordCount=d.records.length;delete d.missingNameSamples;}});
   const b={schema:1,month,viewer:s.viewer,url:s.url,version:before.version,roster,raw,config,meta:before};
   if(!valid(b,month,s))throw Error('完整班表或跨月考勤尚未讀齊，未覆蓋原快取');
   const after=await meta(s,month,true);assert(s);
   if(before.version!==after.version||!compatible(b,after)){before=after;continue;}
   b.meta=after;b.savedAt=Date.now();b.source='雲端已核對，已保存本機';b.preview=false;remember(key(s,month),b);
   const row={key:key(s,month),kind:'system',system:'workhours',month,savedAt:b.savedAt,size:JSON.stringify(b).length,data:copy(b)};
   // Cache/disk failures cannot hold the rendered result hostage. Account/scope
   // remain in the row key; a late write cannot validate a later version.
   void Promise.resolve(g.Port79DataCache?.put?.(row)).catch(()=>{});
   return b;
  }
  throw Error('雲端資料持續更新，未確認快取版本；請重新讀取');
 })().finally(()=>{flights.delete(k);observers.delete(k);});flights.set(k,p);return p.then(b=>{assert(s);return copy(b);});
}
function invalidate(){generation++;metaMemo.clear();memory.clear();startupFlight=null;}
function startup(){
 const s=identity(),month=context().month(),k=key(s,month)+'|'+s.token+'|'+s.stamp+'|'+s.generation;
 if(startupFlight?.key===k)return startupFlight.promise;
 const flight={key:k,promise:null};startupFlight=flight;
 flight.promise=(async()=>{
  // The existing full download is a read-only preview, never a verified raw
  // month or a write source. The versioned bundle supplies authoritative data.
  let finished=false;
  void Promise.resolve((g.Port79DataCache?.getDisplaySnapshot||g.Port79DataCache?.getSystemSnapshot)?.('workhours',{timeoutMs:10000})).then(row=>{assert(s);if(!finished&&row?.data?.fullDatabase)context().applyFull?.(row.data);}).catch(()=>{});
  try{const b=await load(month,{onPreview:b=>context().applyBundle(b),onRoster:b=>context().applyRoster?.(b),onInvalidate:()=>context().invalidatePreview?.(month)});assert(s);finished=true;context().applyBundle(b);return true;}catch(e){finished=true;context().failed?.(month,e);return false;}
 })().finally(()=>{if(startupFlight===flight)startupFlight=null;});return flight.promise;
}
g.P79WorkhoursCache={load,startup,invalidate,monthsFor,enabled:()=>!!context()?.canRead?.()&&context()?.cacheAccess?.()!==false};
})(window);


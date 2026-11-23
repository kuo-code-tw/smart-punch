'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const JSZip=require('jszip');
const frontend=fs.readFileSync('assets/port79-backup-excel.js','utf8'),backend=fs.readFileSync('backend/backup-readable-excel.gs','utf8');
new vm.Script(frontend);new vm.Script(backend);
function setup(options={}){
 const nodes=new Map(),files=new Map(),calls=[],written=[];let actor='A',role='superadmin',captured;
 const element=(tag='')=>({tag,children:[],querySelector(t){return this.children.find(x=>x.tag===t)||null;},textContent:'',style:{},setAttribute(){},append(...nodes){this.children.push(...nodes);},insertAdjacentElement(where,n){nodes.set(n.id,n);},addEventListener(k,f){this['on'+k]=f;},click(){this.onclick?.();},remove(){}});
 const get=id=>{if(id==='p79BackupDownload'&&!nodes.has(id))return null;if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const data=new Map([['gc_records_v1',JSON.stringify([{empId:'A',name:'測試',password:'secret',token:'never-export',schedule:{'2026-11-01':'早'}}])]]);
 const workbook={utils:{book_new:()=>({sheets:[]}),aoa_to_sheet:rows=>({rows}),book_append_sheet:(b,s,n)=>b.sheets.push({name:n,...s})},write:b=>{captured=b;return Uint8Array.from([80,75,3,4]).buffer;}};
 class Zip{constructor(){this.zip=new JSZip();}file(name,value){files.set(name,value);this.zip.file(name,value);return this;}async generateAsync(opts){return this.zip.generateAsync(opts);}static loadAsync(...args){return JSZip.loadAsync(...args);}}
 const bytes=Buffer.from([80,75,3,4]),digest=crypto.createHash('sha256').update(bytes).digest('hex');
 let pickerCalls=0;const downloads=[];const w={URL:{createObjectURL:b=>{downloads.push(b);return 'blob:fixture';},revokeObjectURL(){}},document:{getElementById:get,createElement:element,body:element()},XLSX:workbook,JSZip:Zip,crypto:crypto.webcrypto,sessionStorage:{getItem:k=>k==='port79_user_session'?JSON.stringify({empId:actor,adminRole:role}):null},localStorage:{getItem:k=>data.get(k)||null},Port79AllBackup:{getLocalOriginals:async()=>[{actor:'B',name:'禁止外洩.xlsx',bytes},{actor:'A',name:'儲量.xlsx',hash:'fixture',bytes}]},Port79DataCache:{viewerKey:()=> 'A@superadmin',all:async()=>[{key:'A@superadmin|system',kind:'system',system:'attendance',data:{rows:[{name:'本人資料'}]}},{key:'B@superadmin|system',kind:'system',data:{rows:[{name:'其他帳號'}]}}]},showSaveFilePicker:async()=>{pickerCalls++;return ({createWritable:async()=>({write:async b=>written.push(b),close:async()=>written.push('closed')})});},setTimeout:(fn,ms)=>options.fast&&ms<=30000?(Promise.resolve().then(()=>{options.onWait?.();fn();}),0):setTimeout(fn,ms),clearTimeout,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),fetch:async(url,opts)=>{const p=JSON.parse(opts.body);calls.push(p);const override=options.before?.(p,calls);if(override)return override;if(p.phase==='local')return {ok:true,json:async()=>({ok:true,verified:true,hash:p.hash})};if(p.phase==='list')return {ok:true,json:async()=>({ok:true,total:2})};if(p.phase==='complete')return {ok:true,json:async()=>({ok:true,verified:true,files:2,backupAt:'2026-11-15T10:00:00Z'})};return {ok:true,json:async()=>({ok:true,verified:true,index:p.index,backupId:p.backupId,file:{name:'歷史資料_第'+p.index+'份.xlsx',hash:digest,base64:bytes.toString('base64')}})};}};
 vm.runInNewContext(frontend,{window:w,URL,AbortController,Uint8Array,Intl,Date,console});
 return {w,pickerCalls:()=>pickerCalls,downloads,calls,files,nodes,written,setRole:v=>role=v,setActor:v=>actor=v,captured:()=>captured};
}
(async()=>{
 const x=setup(),api=x.w.Port79BackupExcel;
 const data=await api.localData({actor:'A',endpoint:'https://example.invalid/exec',same:()=>true});
 assert(!JSON.stringify(data).includes('其他帳號'));assert(!JSON.stringify(data).includes('never-export'));assert(!JSON.stringify(data).includes('secret'));
 api.workbook({...data,長文:[{內容:'甲'.repeat(40000)}]});const book=x.captured();assert(book.sheets.some(s=>s.name.includes('長文字明細')),'long cells preserve full data in readable segments');assert(JSON.stringify(book).includes('工號'));assert(!JSON.stringify(book).includes('secret'));
 const batch={excelDestination:await api.prepare(),items:[{type:'vessel',result:{verified:true,backupId:'backup'}}]};
 await api.run(batch,{actor:'A',endpoint:'https://example.invalid/exec',token:'fixture',same:()=>true});
 assert(batch.excelComplete);assert.equal(x.calls.filter(p=>p.phase==='local').length,1);assert.equal(x.calls.filter(p=>p.index!==undefined).length,2,'all inherited snapshot files are downloaded');
 assert(x.files.has('雲端資料/船舶/歷史資料_第0份.xlsx'));assert(x.files.has('電腦端資料/本機資料.xlsx'));assert(![...x.files.keys()].some(k=>k.includes('禁止外洩')));assert(x.files.has('備份說明/備份範圍.xlsx'));assert.equal(x.written.length,0,'no empty or partial destination file is created');assert.equal(x.pickerCalls(),0,'no save picker creates a placeholder before cloud completion');assert.equal(x.nodes.get('p79BackupDownload').hidden,false);assert.match(x.nodes.get('p79BackupExcelStatus').textContent,/尚未下載/);assert.equal(x.downloads.length,1);const archive=await JSZip.loadAsync(await x.downloads[0].arrayBuffer(),{checkCRC32:true});assert(archive.file('電腦端資料/本機資料.xlsx'));assert(archive.file('雲端資料/船舶/歷史資料_第0份.xlsx'));x.nodes.get('p79BackupDownload').click();assert.match(x.nodes.get('p79BackupExcelStatus').textContent,/已開始下載/);x.nodes.get('p79BackupDownload').click();assert.equal(x.calls.filter(p=>p.phase==='local').length,1,'repeated download never repeats cloud backup');await assert.rejects(api.validateArchive(new Blob([])),/尚未完整/);await assert.rejects(api.validateArchive(new Blob(['not a zip'.repeat(10)])),/格式錯誤/);let corrupt=Buffer.from(await x.downloads[0].arrayBuffer());const signature=Buffer.from([80,75,3,4]);let start=corrupt.indexOf(signature);let dataStart=start+30+corrupt.readUInt16LE(start+26)+corrupt.readUInt16LE(start+28);if(corrupt.readUInt32LE(start+18)===0){start=corrupt.indexOf(signature,start+4);dataStart=start+30+corrupt.readUInt16LE(start+26)+corrupt.readUInt16LE(start+28);}corrupt[dataStart]^=255;await assert.rejects(api.validateArchive(new Blob([corrupt])),/CRC|Corrupted|signature|compression|uncompressed|size/i);
 for(const role of ['admin','employee']){x.setRole(role);await assert.rejects(api.prepare(),/超級管理員/);}
 function makeBatch(){return {items:[{type:'vessel',result:{verified:true,backupId:'backup'}}]};}
 for(const phase of ['local','list','export','complete']){
  let failed=false;const retry=setup({fast:true,before:p=>{if((p.phase||'export')===phase&&!failed){failed=true;throw new TypeError('Failed to fetch');}}}),b=makeBatch();
  await retry.w.Port79BackupExcel.run(b,{actor:'A',endpoint:'https://example.invalid/exec',token:'fixture',same:()=>true});assert(b.excelComplete,'automatic '+phase+' retry completes');
  const repeated=retry.calls.filter(p=>(p.phase||'export')===phase);assert.equal(JSON.stringify(repeated[0]),JSON.stringify(repeated[1]),'lost reply retries identical '+phase+' payload');
 }
 // Reproduce the production error: a local XLSX exceeds the 17 MiB
 // base64 server limit. Verify that every source data row survives in
 // readable, smaller XLSX parts and every upload stays below the limit.
 function fixtureLarge(x){
  const X=x.w.XLSX,rows=[['欄位','內容'],...Array.from({length:26},(_,i)=>['ROW-'+i,'原始內容'+i])];
  let first=true;
  X.read=()=>({SheetNames:['1_本機大量資料'],Sheets:{'1_本機大量資料':{rows}}});
  X.utils.sheet_to_json=s=>s.rows;
  X.write=b=>{
   if(first){first=false;const a=new Uint8Array(11*1024*1024);a.set([80,75,3,4]);return a.buffer;}
   const flat=b.sheets.map(s=>s.rows.map(r=>r[0]));
   const json=Buffer.from(JSON.stringify(flat),'utf8'),count=flat.reduce((n,rs)=>n+Math.max(0,rs.length-1),0);
   const a=new Uint8Array(Math.max(256,json.length+10,count*480000+256));
   a.set([80,75,3,4]);a.set(json,4);return a.buffer;
  };
  return rows;
 }
 const large=setup({before:p=>{if(p.phase==='local'&&p.base64.length>6*1024*1024)return {ok:true,json:async()=>({ok:false,error:'電腦端Excel大小無效'})};}}),largeRows=fixtureLarge(large),largeBatch=makeBatch();
 await large.w.Port79BackupExcel.run(largeBatch,{actor:'A',endpoint:'https://example.invalid/exec',token:'fixture',same:()=>true});
 assert(largeBatch.excelComplete,'oversized local Excel completes via bounded parts');
 const uploads=large.calls.filter(p=>p.phase==='local');
 assert(uploads.length>1,'oversized Excel must be divided into multiple server uploads');
 assert(uploads.every((p,i)=>p.partIndex===i&&p.partTotal===uploads.length&&p.base64.length<6*1024*1024),'no upload may exceed the safe server envelope');
 const localZip=await JSZip.loadAsync(await large.downloads[0].arrayBuffer(),{checkCRC32:true});
 const names=Object.keys(localZip.files).filter(n=>/^電腦端資料\/本機資料.*\.xlsx$/.test(n));
 assert.equal(names.length,uploads.length,'download ZIP must contain every cloud-uploaded workbook part');
 assert(localZip.file('備份說明/本機資料分冊說明.txt'),'user must be told to read all Excel parts');
 const collected=[];
 for(const name of names){
  const b=Buffer.from(await localZip.file(name).async('uint8array'));
  const json=b.subarray(4,b.indexOf(0,4)).toString('utf8');
  collected.push(...JSON.parse(json).flat().filter(v=>v!=='欄位'));
 }
 assert.deepEqual(collected,largeRows.slice(1).map(r=>r[0]),'every original row appears exactly once despite repeated headers');

 let failPart=true;
 const resume=setup({before:p=>{if(p.phase==='local'&&p.partIndex===1&&failPart)return {ok:true,json:async()=>({ok:false,error:'伺服器暫時無法寫入'})};}}),resumeRows=fixtureLarge(resume),resumeBatch=makeBatch(),context={actor:'A',endpoint:'https://example.invalid/exec',token:'fixture',same:()=>true};
 await assert.rejects(resume.w.Port79BackupExcel.run(resumeBatch,context),/伺服器暫時無法寫入/);
 assert.equal(resume.calls.filter(p=>p.phase==='local'&&p.partIndex===0).length,1,'previously confirmed local part must stay complete');
 failPart=false;
 await resume.w.Port79BackupExcel.run(resumeBatch,context);
 assert(resumeBatch.excelComplete);
 assert.equal(resume.calls.filter(p=>p.phase==='local'&&p.partIndex===0).length,1,'manual retry cannot upload the verified first local part twice');
 assert.equal(resume.calls.filter(p=>p.phase==='local'&&p.partIndex===1).length,2,'only the unconfirmed part retries');

 const denied=setup({fast:true,before:()=>({ok:true,json:async()=>({ok:false,error:'登入失效，請重新登入'})})});await assert.rejects(denied.w.Port79BackupExcel.run(makeBatch(),{actor:'A',endpoint:'https://example.invalid/exec',same:()=>true}),/登入失效/);assert.equal(denied.calls.length,1,'authorization refusal never retries');
 let changed=false;const switched=setup({fast:true,onWait:()=>changed=true,before:()=>{throw new TypeError('Failed to fetch');}});await assert.rejects(switched.w.Port79BackupExcel.run(makeBatch(),{actor:'A',endpoint:'https://example.invalid/exec',same:()=>!changed}),/登入已變更/);assert.equal(switched.calls.length,1,'identity change during retry wait blocks another POST');
 let offline=true;const partial=setup({fast:true,before:p=>{if(p.index===1&&offline)throw new TypeError('Failed to fetch');}}),partialBatch=makeBatch(),partialContext={actor:'A',endpoint:'https://example.invalid/exec',same:()=>true};await assert.rejects(partial.w.Port79BackupExcel.run(partialBatch,partialContext),/Failed to fetch/);assert.equal(partial.calls.filter(p=>p.index===1).length,6,'retry budget is bounded');assert(!partialBatch.excelComplete);assert.equal(partial.downloads.length,0,'incomplete export cannot offer download');const diagnostic=partial.nodes.get('p79BackupErrorDetails').querySelector('pre').textContent;assert.match(diagnostic,/船舶.*雲端匯出及下載Excel.*第2\/2份/);assert.match(diagnostic,/Failed to fetch/);assert.match(diagnostic,/台灣時間/);assert(!diagnostic.includes('fixture-token'));assert(fs.readFileSync('assets/port79-messages.js','utf8').includes("closest('[data-p79-raw-error]')"),'raw diagnostic bypasses generic translation');offline=false;await partial.w.Port79BackupExcel.run(partialBatch,partialContext);assert(partialBatch.excelComplete);assert.equal(partial.calls.filter(p=>p.index===0).length,1,'already verified file survives retry and manual continuation');
 let malformed=true;const brokenJson=setup({fast:true,before:p=>{if(p.phase==='list'&&malformed){malformed=false;return {ok:true,json:async()=>{throw new SyntaxError('truncated');}};}}});const jsonBatch=makeBatch();await brokenJson.w.Port79BackupExcel.run(jsonBatch,{actor:'A',endpoint:'https://example.invalid/exec',same:()=>true});assert(jsonBatch.excelComplete,'truncated response automatically rechecks');
 let touches=0;const c={p79HistoryBackupSession_:()=>{throw Error('denied');},getSpreadsheet_:()=>({}),p79ExcelContext_:()=>touches++};vm.createContext(c);vm.runInContext(backend,c);
 for(const phase of ['list','complete','local','export'])assert.throws(()=>c.p79BackupReadableExcel_({phase}),/denied/);assert.equal(touches,0,'no source metadata before superadmin authorization');
 assert.throws(()=>c.p79ExcelFolder_('English'),/中文/);
 // The backend accepts numbered workbook parts but never accepts invalid
 // indices or bypasses the existing SHA-256 and XLSX checks.
 const savedParts=[],partProps=new Map(),partBytes=[80,75,3,4],originalExcelFolder=c.p79ExcelFolder_;
 Object.assign(c,{p79ExcelHash_:()=> 'part-hash',p79ExcelPeriod_:()=> '202611',p79ExcelStamp_:()=> '20261123',
   p79ExcelFolder_:()=>({createFile:blob=>{savedParts.push(blob.name);return {getId:()=> 'part-id',getBlob:()=>({getBytes:()=>partBytes})};}}),
   PropertiesService:{getScriptProperties:()=>({getProperty:k=>partProps.get(k)||null,setProperty:(k,v)=>partProps.set(k,v)})},
   Utilities:{base64Decode:()=>partBytes,newBlob:(b,mime,name)=>({name})}});
 assert.throws(()=>c.p79BackupLocalExcel_({base64:'UEsDBA==',hash:'part-hash',partIndex:2,partTotal:2}),/分冊編號/);
 assert.throws(()=>c.p79BackupLocalExcel_({base64:'UEsDBA==',hash:'part-hash',partIndex:-1,partTotal:2}),/分冊編號/);
 assert.throws(()=>c.p79BackupLocalExcel_({base64:'UEsDBA==',hash:'part-hash',partIndex:0,partTotal:129}),/分冊編號/);
 assert.equal(c.p79BackupLocalExcel_({base64:'UEsDBA==',hash:'part-hash',partIndex:0,partTotal:3}).verified,true);
 assert(savedParts[0].includes('第1份_共3份'),'Drive workbook name identifies its part number');
 c.p79ExcelFolder_=originalExcelFolder;

 const claims=new Map();let core=0,lockOwned=false;
 Object.assign(c,{p79ExcelExisting_:()=>null,PropertiesService:{getScriptProperties:()=>({getProperty:k=>claims.get(k)||null,setProperty:(k,v)=>claims.set(k,v),deleteProperty:k=>claims.delete(k)})},LockService:{getUserLock:()=>({tryLock:()=>{lockOwned=true;return true;},releaseLock:()=>{lockOwned=false;}})},Utilities:{getUuid:()=> 'owner'},p79ExcelExportSourceCore_:()=>{assert.equal(lockOwned,false,'network export must not hold global lock');core++;return {ok:true};}});
 claims.set('P79_EXCEL_BUSY_source',JSON.stringify({owner:'other',at:Date.now()}));assert.throws(()=>c.p79ExcelExportSource_({ids:['source']},0),/正在產生/);assert.equal(core,0,'another computer cannot duplicate an active export');
 claims.clear();assert(c.p79ExcelExportSource_({ids:['source']},0).ok);assert.equal(core,1);assert.equal(claims.size,0,'finished claim always released');
 c.p79ExcelExportSourceCore_=()=>{throw Error('export failed');};assert.throws(()=>c.p79ExcelExportSource_({ids:['source']},0),/export failed/);assert.equal(claims.size,0,'failed claim released for retry');
 
 const yearProps=new Map();let period='202611',locked=false;
 function folder(name){const dirs=new Map();return {name,dirs,getId:()=>name,getFoldersByName:n=>{const values=dirs.has(n)?[dirs.get(n)]:[];return {hasNext:()=>values.length>0,next:()=>values.shift()};},createFolder:n=>{assert(locked);if(dirs.has(n))throw Error('duplicate');const f=folder(n);dirs.set(n,f);return f;}};}
 const root=folder('備份根目錄');Object.assign(c,{p79ExcelRoot_:()=>root,p79ExcelPeriod_:()=>period,p79ExcelPrivate_:f=>f,PropertiesService:{getScriptProperties:()=>({getProperty:k=>yearProps.get(k),setProperty:(k,v)=>yearProps.set(k,v)})},LockService:{getUserLock:()=>({tryLock:()=>{locked=true;return true;},releaseLock:()=>locked=false})}});
 c.p79ExcelFolder_('出勤');assert(root.dirs.get('2026年').dirs.get('11月').dirs.has('出勤'));assert.equal(root.dirs.get('2026年').dirs.size,12);c.p79ExcelFolder_('出勤');assert.equal(root.dirs.get('2026年').dirs.get('11月').dirs.size,1);period='202701';c.p79ExcelFolder_('船舶');assert.equal(root.dirs.get('2027年').dirs.size,12);assert(root.dirs.get('2027年').dirs.get('01月').dirs.has('船舶'));assert(root.dirs.get('2026年').dirs.get('11月').dirs.has('出勤'));
 assert(!backend.includes('setTrashed(')&&!backend.includes('addViewer(')&&!backend.includes('addEditor('),'new backups never delete history or broaden sharing');
 console.log('PASS superadmin-only dual Excel: account isolation, secret redaction, readable long cells, all snapshot references, Chinese folders, verified ZIP CRC, corrupt-file rejection, no placeholder and repeat download');
})().catch(e=>{console.error(e);process.exitCode=1;});

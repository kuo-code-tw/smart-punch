// Read-only point-to-point link audit: homepage -> 7 systems -> local assets -> cloud endpoint wiring.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const systems=['attendance','leave','schedule','work-hours','aqc-efficiency','hr','history-data'];
const files=['index.html',...systems.map(x=>x+'/index.html'),...systems.map(x=>'integration-test/'+x+'/index.html'),'schedule/diagnostics.html','previews/overtime-status/index.html'];
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const canonical='https://script.google.com/macros/s/AKfycbzPD0v8QQol_7cMuMUFGnjHxo-9jFnRLEwoWQhW-n3g5GlbbHnaL7EhRAtcymUcdYOEzg/exec';
const top=read('assets/port79-seven-top.js');
for(const name of systems){
 assert(fs.existsSync(path.join(root,name,'index.html')),name+' entry missing');
 assert(top.includes("'../"+name+"/'"),name+' missing from shared seven-system nav');
 assert(read(name+'/index.html').includes(canonical),name+' must use canonical GAS endpoint');
}
const home=read('index.html');
for(const name of systems)assert(home.includes('./'+name+'/'),name+' missing home launch link');
let totalRefs=0;
for(const file of files){
 const html=read(file);
 const base=(html.match(/<base\b[^>]*href\s*=\s*["']([^"']+)/i)||[])[1];
 let resolvedBase;
 if(base&&base.startsWith('/smart-punch/'))resolvedBase=path.posix.dirname(base.slice('/smart-punch/'.length)+'index.html');
 else resolvedBase=path.posix.dirname(file);
 const markup=html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi,'$1</script>').replace(/<!--[\s\S]*?-->/g,'');
 for(const match of markup.matchAll(/(?:href|src|action)\s*=\s*["']([^"']+)["']/gi)){
  const url=match[1].trim();
  if(!url||/^(?:https?:|\/\/|#|javascript:|data:|mailto:|tel:|about:|\?)/i.test(url)||url.includes('${')||url.includes('\\`'))continue;
  let cleaned=url.split(/[?#]/)[0];
  if(!cleaned)continue;
  let dest;
  if(cleaned.startsWith('/smart-punch/'))dest=cleaned.slice('/smart-punch/'.length);
  else if(cleaned.startsWith('/'))throw Error(file+' uses site-root absolute path instead of /smart-punch/: '+url);
  else dest=path.posix.join(resolvedBase,cleaned);
  dest=path.posix.normalize(dest);
  if(!dest||dest==='.')dest='index.html';
  const actual=path.join(root,dest);
  assert(fs.existsSync(actual)&&(fs.statSync(actual).isDirectory()?fs.existsSync(path.join(actual,'index.html')):true),file+' broken link -> '+url+' (resolved '+dest+')');
  totalRefs++;
 }
}
for(const [file,required] of Object.entries({
 'attendance/index.html':['getAttendanceMonthRaw','getScheduleDataSecure'],
 'leave/index.html':['getLeaveData','getOvertimeReportContext'],
 'schedule/index.html':['getScheduleDataSecure','getScheduleSyncMeta'],
 'work-hours/index.html':['getOvertimeExportAudit','getAttendanceMonthRaw'],
 'aqc-efficiency/index.html':['gcGetData'],
 'hr/index.html':['hrUpsertEmployee'],
 'history-data/index.html':['historyGetMonthData','historyBackupCapabilities']
})){
 const s=read(file);
 for(const action of required)assert(s.includes(action),file+' lost backend action '+action);
}
console.log('PASS seven systems homepage/nav links, '+files.length+' page entrypoints, '+totalRefs+' referenced local files, canonical GAS URL and core action names (static only; no login or live API calls)');

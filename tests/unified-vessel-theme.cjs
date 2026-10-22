const fs=require('fs'),cp=require('child_process'),assert=require('assert');
const pages=['index.html','attendance/index.html','work-hours/index.html','leave/index.html','schedule/index.html','hr/index.html','history-data/index.html','aqc-efficiency/index.html'];
for(const path of pages){
 const html=fs.readFileSync(path,'utf8'),before=cp.execFileSync('git',['show','HEAD:'+path],{encoding:'utf8',maxBuffer:12*1024*1024});
 assert.equal((html.match(/<html\b[^>]*\bdata-p79-design="vessel"/g)||[]).length,1,path);
 assert.equal((html.match(/port79-vessel-theme.css\?v=20261018-unified-design/g)||[]).length,1,path);
 const strip=s=>s.replace(/(port79-missing-punch-login-preview\.js\?v=)[^\"\s]+/g,'$1VERSION').replace(/<style id="p79-attendance-(?:single-line|responsive)-toolbar">[\s\S]*?<\/style>/g,'').replace(/(port79-data-cache\.js\?v=)[^\"\s]+/g,'$1CACHE_VERSION').replace('data-p79-design="vessel" ','').replace(/<link rel="stylesheet" href="(?:\.\.\/)?assets\/port79-vessel-theme.css\?v=20261018-unified-design">\n/,'').replace(/\s+/g,' ').trim();assert.equal(strip(html),strip(before),path+' business code and permissions unchanged');
 const href=html.match(/href="([^"]*port79-vessel-theme.css)[^"]*"/)[1];assert(fs.existsSync(require('path').resolve(require('path').dirname(path),href)));
}
const css=fs.readFileSync('assets/port79-vessel-theme.css','utf8');
for(const text of ['#edf3f8','#123e5c','#176d7e','Microsoft JhengHei','@media(max-width:600px)','data-theme="dark"','[data-p79-system="schedule"] td','focus-visible','overflow:auto'])assert(css.includes(text),text);
assert(css.includes('@media screen'));assert(!/display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none/.test(css));
let level=0;for(const char of css.replace(/\/\*[\s\S]*?\*\//g,'')){if(char==='{')level++;if(char==='}')level--;assert(level>=0)}assert.equal(level,0);
console.log('PASS all eight pages share the vessel theme, valid relative stylesheet links, balanced CSS, mobile/dark/focus/roster rules, no hidden UI or changed business code');

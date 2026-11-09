'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('aqc-efficiency/index.html','utf8');
const css=fs.readFileSync('aqc-efficiency/vessel-tab-palette.css','utf8');
const ids=['dashboard','multi-rod','compare','terminal','personstats','weekly','dispatch','gate'];
const href='./vessel-tab-palette.css?v=20261109-v115';
assert(html.includes('href="'+href+'"'),'load palette with cache-busted href');
assert(html.indexOf(href)>html.indexOf('../assets/port79-vessel-theme.css'),'palette must override legacy vessel theme');
assert(html.indexOf(href)>html.indexOf('../assets/port79-management-workspace.css'),'palette must override workspace theme');
const tags=[...html.matchAll(/<button\b[^>]*\bdata-tab="([^"]+)"[^>]*>/g)].map(m=>m[1]);
for(const id of ids)assert(tags.includes(id),'missing production tab '+id);
assert(css.includes('body[data-p79-system="efficiency"] #efficiencyMainTabs'),'must scope palette to vessel tabs');
assert(!/@import|url\s*\(|display\s*:\s*none|pointer-events\s*:\s*none/.test(css),'no imports, hiding controls or disabling clicks');
const hexes=[],colors=new Set();
for(const id of ids){
 const pattern=new RegExp('button\\.tab\\[data-tab="'+id+'"\\]\\{([^}]+)\\}');
 const match=css.match(pattern);
 assert(match,'palette selector missing '+id);
 const vars=Object.fromEntries([...match[1].matchAll(/--p79-tab-(soft|ink|line|accent):([#a-f0-9]{7})/gi)].map(x=>[x[1],x[2]]));
 for(const v of ['soft','ink','line','accent'])assert(/^#[0-9a-f]{6}$/i.test(vars[v]||''),id+' '+v);
 const lum=hex=>{
  const c=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
 };
 const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
 assert(contrast(vars.soft,vars.ink)>=4.5,id+' idle text must be readable');
 assert(contrast(vars.accent,'#ffffff')>=4.5,id+' active white text must be readable');
 colors.add(vars.accent);hexes.push(id+':'+vars.accent);
}
assert.equal(colors.size,ids.length,'each tab needs a distinct accent');
assert(css.includes('button.tab[data-tab].active{'),'active tab must stand out');
assert(css.includes('button.tab[data-tab]:not(.active):hover{'),'hover state retained');
assert(css.includes('button.tab[data-tab]:focus-visible{'),'keyboard focus retained');
assert(css.includes('prefers-reduced-motion:reduce'),'reduced motion support');
console.log('PASS vessel tab color palette: eight distinct colors, readable contrast, scoped overrides, active, hover, focus, reduced motion');

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
const style=html.match(/<style id="p79-personnel-group-readable-type">([\s\S]*?)<\/style>/)?.[1]||'';
assert(style,'Compact group stylesheet must be present');
assert(style.includes('grid-template-columns:repeat(2,minmax(0,1fr))'),'Wide screens need two columns and two rows for the four groups');
assert(style.includes('@media(min-width:980px)'),'Four-panel desktop layout must work below extra-wide XL screens');
assert(style.includes('gap:10px!important'),'Four panels need less spacing');
assert(style.includes('font-size:12px!important')&&style.includes('height:27px!important'),'Cells must be dense enough to show all workers');
assert(style.includes('max-height:840px')&&style.includes('height:24px!important'),'Small laptop screens should receive denser rows');
assert(style.includes('table.p79-group-table'),'Dense CSS must be scoped only to group tables');
assert(style.includes('min-width:0!important'),'Desktop group tables cannot impose an internal 640px scrollbar');
assert(!style.includes('min-width:640px'),'Oversized legacy minimum width must not reappear');
assert(!style.includes('padding:14px'),'Oversized cell padding must not reappear');
assert(!style.includes('max-height:')||!style.includes('overflow-y:hidden'),'Cards must not truncate employee rows');
const fn=name=>{let start=html.indexOf('function '+name+'(');assert(start>=0,name);const end=html.indexOf('\n}',start);assert(end>start);return html.slice(start,end+2)};
const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:''});return nodes.get(id)};
const ctx={
 document:{getElementById:el},compareDriverNames:(a,b)=>a.localeCompare(b,'zh-Hant'),
 displayPersonName:v=>v,esc:v=>String(v||'').replaceAll('<','&lt;').replaceAll('>','&gt;')
};
vm.createContext(ctx);
for(const name of ['personnelGroupCode','rankedPersonnelEfficiencyPersons','renderPersonnelGroupCards'])vm.runInContext(fn(name),ctx);
const persons=['A','B','C','D'].flatMap(group=>Array.from({length:8},(_,i)=>({
 name:'測試'+group+(i+1),group:group+'組',empId:'AP1234'+group+i,
 hours:20+i,containers:500+i,hc:i,disc:500+i,load:0,
 rows:[{}],eff:(500+i+i)/(20+i)
})));
const dataBefore=JSON.stringify(persons);
ctx.renderPersonnelGroupCards(persons);
const groups=el('personnelGroupCards').innerHTML;
assert.equal((groups.match(/<section /g)||[]).length,4,'All four groups must be rendered at once');
assert.equal((groups.match(/<tr>/g)||[]).length,4*(8+1),'All 32 employees and four headers must remain present');
assert.equal((groups.match(/class="tbl p79-group-table/g)||[]).length,4);
assert(!groups.includes('overflow-y-auto')&&!groups.includes('max-h-'),'No cards may contain internal vertical scrollboxes or clipping');
assert(groups.includes('效率')&&groups.includes('時數')&&groups.includes('櫃數')&&groups.includes('工號'),'No data columns lost from compact display');
for(const code of ['A','B','C','D']){
 const section=groups.split('aria-label="'+code+'組"')[1]?.split('</section>')[0]||'';
 assert(section.includes('第1名'),'Every group retains its own efficiency ranking');
 assert(section.includes('第8名'),'All eight group workers retain a rank');
}
assert.equal(JSON.stringify(persons),dataBefore,'Layout and sorting must not alter source measurements');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
console.log(JSON.stringify({passed:16,failed:0,scope:'2x2 desktop groups, compact typography and headers, responsive smaller screen, no truncation, 32 employees and all ranking values'}));

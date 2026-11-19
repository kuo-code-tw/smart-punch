'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'assets/port79-management-workspace.js'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/port79-home-original-shell.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sharedCss=fs.readFileSync(path.join(root,'assets/port79-management-workspace.css'),'utf8');
assert.doesNotThrow(()=>new Function(js));
assert.match(html,/<h2>79號碼頭 船舶作業 × 考勤人力 智慧管理中心<\/h2>/);
assert.match(html,/<span class="name">效率系統<\/span>/);
assert.match(html,/<span class="name">人資管理系統<\/span>/);
assert.match(js,/function decorateHome\(\)/);
assert(!js.includes('enforceSidebarContrast'),'old JavaScript dark sidebar override must be removed');
assert(!js.includes("shell.style.setProperty('background'"),'do not override light CSS inline');
assert.match(js,/item\.classList\.toggle\('is-available',permitted\)/,'permission-aware status chip must update class in place');
assert.match(js,/className='p79-status-light'/,'status light element is required');
assert(!js.includes("a.style.opacity='0.55'"),'do not fade disabled menu links to unreadable opacity');
assert(!js.includes("available.textContent=permitted?'可使用':'不可使用'"),'homepage must not replace live activity with fixed green availability');
assert(html.includes('port79-home-cloud-status.js?v=20261117-live-cloud-v2'),'live home cloud poller must be loaded');
assert(!js.includes("intro.innerHTML="),'homepage script must not overwrite native title');
assert(!js.includes("card.querySelector('.name').textContent="),'native system names stay unchanged');
assert(!js.includes("card.querySelector('.icon').innerHTML="),'native system icons stay unchanged');
assert.match(js,/const brand=d.createElement\('div'\);brand.className='p79-workspace-brand';brand.innerHTML=logo\+'<div><strong>79號碼頭<\/strong><small>雲端智慧系統<\/small><\/div>'/);
assert.match(js,/if\(home\)tools.append\(buildHomeFunctionMenu\(\)\)/);
assert.match(html,/port79-management-workspace\.js\?v=20261117-home-original-ui-v1/);
assert.match(html,/port79-home-original-shell\.css\?v=20261117-home-original-ui-v1/);
assert.match(css,/#p79WorkspaceSidebar\.p79-workspace-sidebar/);
assert.match(css,/background-color:#f1f8ff!important/,'sidebar must match the reference white background');
assert.match(sharedCss,/color:#203d61!important/,'menu labels must be dark and readable on light background');
assert.match(sharedCss,/background:#d8ebff!important/,'selected home menu must be pale blue');
assert.match(sharedCss,/p79-status-light/,'system status lights require an explicit visual style');
assert.match(sharedCss,/port79-harbor-banner\.webp/,'the original harbor photo must be kept');
assert.match(sharedCss,/p79-nav-collapsed\\{--p79-w-width:0px!important\\}/,'desktop hamburger removes sidebar gutter so content expands');
assert.match(css,/body\\.p79-workspace:has\\(#systems\\.show\\)\\.p79-nav-collapsed\\{--p79-w-width:0px!important\\}/,
 'homepage-specific width must also reset to zero in collapsed mode');
assert(!css.includes('#193964'),'dark theme must never be forced on the left sidebar');

assert.match(sharedCss,/P79 DARK SIDEBAR UNIFIED/,'shared sidebar must define coherent dark-mode theme');
assert.match(css,/P79 HOME DARK SIDEBAR COHERENCE/,'homepage must override light-reference rules only in dark mode');
assert.match(css,/html:is\(\.dark,\[data-theme="dark"\]\) body\.p79-workspace:has\(#systems\.show\)/,'dark overrides must be scoped to actual dark mode');
assert.match(sharedCss,/background:#f1f8ff!important/,'light sidebar must remain white');
assert.match(css,/background:#f1f8ff!important/,'light home sidebar must remain white');
assert.match(css,/background:#10263f!important/,'entire dark sidebar must share the same dark canvas');
assert.match(css,/background:transparent!important;background-image:none!important/,'nav rectangle must not have independent navy background');
assert.match(css,/color:#dceafa!important/,'dark labels need readable light text');
assert.match(css,/background:#26496e!important;color:#fff!important/,'dark selected row must have readable contrast');
assert.match(css,/color:#f5f9ff!important/,'dark sidebar brand must not remain navy on navy');
assert.match(css,/color:#e6f3ff!important/,'dark footer must remain readable');
assert.match(css,/port79-harbor-banner\.webp/,'original shipyard photograph must be preserved');

assert.match(css,/#port79CalendarModeBox\{\s*display:flex!important/,'original year switch remains visible');
assert.match(css,/\.p79-workspace-brand small\{/,'cloud-system subtitle must be shown');
assert(!css.includes('p79-sidebar-footer{display:none'),'original harbor footer remains visible');
assert.match(js,/p79-nav-collapsed/,'hamburger toggle must exist');
assert.match(js,/event.preventDefault\(\);event.stopPropagation\(\)/,'hamburger must not launch another action');
assert.match(css,/#p79HomeFunctionMenu/);
assert.match(css,/#port79CalendarModeBox/);
assert.match(css,/body\.p79-workspace:has\(#systems\.show\)/,'stylesheet affects only authenticated homepage');
assert(!css.includes('data-p79-system="leave"'),'no leave UI overrides');
assert(!css.includes('data-p79-system="schedule"'),'no schedule UI overrides');
function fn(name){
 const begin=js.indexOf('function '+name+'('),end=js.indexOf('\n}',begin);
 assert(begin>=0&&end>begin,'missing '+name);return js.slice(begin,end+2);
}
const links=[];
const list={children:[],replaceChildren(){this.children=[]},append(x){this.children.push(x);}};
const menu={open:true,querySelector:()=>list};
function element(tag='span'){
 const n={tag,className:'',textContent:'',dataset:{},style:{display:''},attrs:{},children:[],
  setAttribute(k,v){this.attrs[k]=v;},append(...items){this.children.push(...items);},
  prepend(...items){this.children.unshift(...items);},
  querySelector(selector){
   if(selector==='.cloud-title')return this.children.find(c=>c.className==='cloud-title')||null;
   if(selector==='.p79-sys-state')return this.children.find(c=>c.className==='p79-sys-state')||null;
   const m=selector.startsWith('[data-sys="')&&selector.endsWith('"]')
    ?[null,selector.slice(11,-2)]:null;
   return m?this.children.find(c=>c.dataset.sys===m[1])||null:null;
  }
 };
 n.classList={toggle(k,enabled){
  const a=new Set(n.className.split(' ').filter(Boolean));
  if(enabled)a.add(k);else a.delete(k);
  n.className=[...a].join(' ');
 },contains(k){return n.className.split(' ').includes(k)}};
 return n;
}
const statuses=element('div');
const ids=['cardAttendance','cardSchedule','cardHr'];
const sources=Object.fromEntries(ids.map((id,i)=>[id,{
 hidden:false,disabled:false,style:{display:''},
 querySelector(){return{textContent:['考勤系統','排班系統','人資管理系統'][i]}},
 click(){links.push(id)}
}]));
const ctx={home:true,order:['attendance','schedule','hr'],meta:{attendance:['考勤管理'],schedule:['排班管理'],hr:['人資管理']},
 d:{getElementById(id){return id==='p79HomeFunctionMenu'?menu:id==='p79SevenStatus'?statuses:sources[id]||null;},createElement:tag=>element(tag)},
 homeNavAllowed:key=>key!=='hr',
 icon:key=>key,
 button:(name,cssName,markup,callback)=>({name,cssName,markup,click:callback})};
const f=new Function('ctx','with(ctx){'+fn('syncHomeFunctionMenu')+';return syncHomeFunctionMenu}')(ctx);
f();
assert.deepEqual(list.children.map(x=>x.name),['考勤系統','排班系統'],'show original permitted system names');
assert.equal(statuses.children.length,8,'cloud heading and all seven system chips remain visible');
const attendance=statuses.querySelector('[data-sys="attendance"]');
const schedule=statuses.querySelector('[data-sys="schedule"]');
const hr=statuses.querySelector('[data-sys="hr"]');
assert(attendance.classList.contains('is-available'));
assert.equal(attendance.querySelector('.p79-sys-state').textContent,'狀態準備中…');
assert.equal(attendance.children[2].className,'p79-status-light');
assert(hr.classList.contains('is-unavailable'));
assert.equal(hr.querySelector('.p79-sys-state').textContent,'無權限');
attendance.querySelector('.p79-sys-state').textContent='寫入中';
f();
assert.strictEqual(statuses.querySelector('[data-sys="attendance"]'),attendance,'status node must not be replaced when permissions are synchronized');
assert.equal(attendance.querySelector('.p79-sys-state').textContent,'寫入中','ongoing real cloud status must not reset to availability');
// Execute the actual hamburger handler with a mock DOM; verify it never navigates.
const toggleBegin=js.indexOf("const toggle=button('切換系統導覽'");
const toggleEnd=js.indexOf('bar.append(toggle);',toggleBegin)+'bar.append(toggle);'.length;
assert(toggleBegin>=0&&toggleEnd>toggleBegin,'hamburger handler exists');
const state=new Set(),classList={
 contains:k=>state.has(k),remove:(...keys)=>keys.forEach(k=>state.delete(k)),
 toggle:k=>state.has(k)?(state.delete(k),false):(state.add(k),true)
};
let mobile=false,prevented=0,stopped=0;
const buttonStub=(_label,_cls,_icon,handler)=>({handler,attrs:{},setAttribute(k,v){this.attrs[k]=v}});
const bodyStub={body:{classList}};
const toggle=new Function('button','icon','matchMedia','d','bar','shell',js.slice(toggleBegin,toggleEnd)+';return toggle;')(
 buttonStub,()=>'',()=>({matches:mobile}),bodyStub,{append(){}},{id:'p79WorkspaceSidebar'});
const event={preventDefault(){prevented++},stopPropagation(){stopped++}};
toggle.handler(event);
assert(state.has('p79-nav-collapsed'),'first desktop click collapses sidebar');
assert.equal(toggle.attrs['aria-expanded'],'false');
toggle.handler(event);
assert(!state.has('p79-nav-collapsed'),'second desktop click restores sidebar');
mobile=true;
toggle.handler(event);
assert(state.has('p79-nav-open'),'mobile click opens drawer without changing route');
toggle.handler(event);
assert(!state.has('p79-nav-open'),'mobile second click closes drawer');
assert.equal(prevented,4);assert.equal(stopped,4);
list.children[1].click();
assert.deepEqual(links,['cardSchedule'],'menu must invoke original native system button');
assert.equal(menu.open,false,'close menu after navigation');
console.log('PASS reference white sidebar, port branding, visible year selector, status lights, hamburger safety, homepage cards and permissions');

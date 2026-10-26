const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function fn(name){const start=html.indexOf('function '+name+'(');assert(start>=0,'missing '+name);const end=html.indexOf('\n}',start);assert(end>start,name);return html.slice(start,end+2);}
const nodes=new Map();
const el=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:''});return nodes.get(id)};
const c={document:{getElementById:el},compareDriverNames:(a,b)=>String(a).localeCompare(String(b),'zh-Hant-u-co-stroke'),displayPersonName:s=>s,esc:s=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')};
vm.createContext(c);
for(const name of ['personnelGroupCode','rankedPersonnelEfficiencyPersons','renderPersonnelGroupCards'])vm.runInContext(fn(name),c);
const person=(name,group,eff,containers=100,hours=10)=>({name,empId:'ID-'+name,group,eff,containers,hours,hc:0,disc:containers,load:0,rows:[{}]});
const a=[
  person('郭耀宗','A組',21.85),person('陳永德','A組',22.31),person('陳駿棋','A組',21.58),
  person('曾俊瑞','A組',22.23),person('楊永慶','A組',21.40),person('葉仲庭','A組',20.52),
  person('鄭文杰','A組',23.02)
];
const b=[
  person('林宏毅','B組',24.06),person('張家旗','B組',23.55),person('管家宏','B組',24.12),
  person('曾建達','B組',21.40),person('蔡裕雄','B組',21.83),person('洪禹任','B組',22.37),
  person('陳信仲','B組',23.15),person('黃柏源','B組',21.43)
];
const expectedA=['鄭文杰','陳永德','曾俊瑞','郭耀宗','陳駿棋','楊永慶','葉仲庭'];
const expectedB=['管家宏','林宏毅','張家旗','陳信仲','洪禹任','蔡裕雄','黃柏源','曾建達'];
const labels=list=>Array.from(c.rankedPersonnelEfficiencyPersons(list),x=>x.name);
assert.deepEqual(labels(a),expectedA,'A group must rank by efficiency descending rather than employee ID');
assert.deepEqual(labels(b),expectedB,'B group must rank by efficiency descending rather than name');
const originals=JSON.stringify([...a,...b]);
c.renderPersonnelGroupCards([...a,...b]);
const groups=el('personnelGroupCards').innerHTML;
const section=code=>groups.split('aria-label="'+code+'組"')[1]?.split('</section>')[0]||'';
for(const [code,expected] of [['A',expectedA],['B',expectedB]]){
  const markup=section(code);
  assert(markup.includes('效率排名'),'Every group needs a visible rank column');
  assert(markup.includes('第1名'),'Top efficiency must rank first');
  assert(markup.includes('第'+expected.length+'名'),'Rank count must cover the group');
  for(let i=0;i<expected.length-1;i++)assert(markup.indexOf('>'+expected[i]+'<')<markup.indexOf('>'+expected[i+1]+'<'),code+' ranking order '+i);
}
assert.equal(JSON.stringify([...a,...b]),originals,'Ranking must not modify original worker records or work totals');
const ties=[person('乙','C組',24.123),person('甲','C組',24.124),person('丙','C組',21.1),person('丁','C組',0,0,0)];
const ranks=Array.from(c.rankedPersonnelEfficiencyPersons(ties),p=>({name:p.name,rank:p.effRank}));
assert.deepEqual(ranks,[{name:'乙',rank:1},{name:'甲',rank:1},{name:'丙',rank:3},{name:'丁',rank:null}],'Displayed two-decimal ties share position; next rank skips and zero hours get no rank');
c.renderPersonnelGroupCards(ties);
const updated=el('personnelGroupCards').innerHTML;
assert(updated.includes('第1名'),'C group shows tied first-place ranks');
assert((updated.match(/第1名/g)||[]).length===2,'Both tied workers show first place');
assert(updated.includes('第3名'),'Rank skips tied position');
assert(updated.includes('>—</td>'),'Zero-hour worker is unranked');
assert(updated.includes('colspan="6"'),'Empty group colspan follows new six-column table');
const xss=person('<img src=x onerror=alert(1)>','A組',40);
c.renderPersonnelGroupCards([xss]);
assert(!el('personnelGroupCards').innerHTML.includes('<img src=x'),'Names must be HTML escaped');
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
console.log(JSON.stringify({passed:10,failed:0,scope:'A/B screenshot-derived efficiency ranks; 2-decimal ties; missing hours; stable source records; safe HTML'}));

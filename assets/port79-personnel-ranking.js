(function(root){
'use strict';
function rankMonth({month,records=[],roster=[],metrics,groupFor,normalize=v=>String(v||'').replace(/\s+/g,''),sortBy='eff'}){
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return [];
 const people=new Map(),names=new Map();
 const realId=v=>{const id=String(v||'').trim().toUpperCase();return id&&!id.startsWith('NAME:')?id:'';};
 const add=(key,name,empId)=>{if(!people.has(key))people.set(key,{key,name,empId,count:0,hours:0,disc:0,load:0,hc:0,groups:new Set(),ships:new Set()});return people.get(key);};
 for(const r of roster){const name=String(r.name||'').trim(),id=realId(r.empId||r.id);if(!name)continue;const key=id?'EMP:'+id:'NAME:'+normalize(name);const p=add(key,name,id);if(r.group)p.groups.add(r.group);const nk=normalize(name);if(!names.has(nk))names.set(nk,new Set());names.get(nk).add(key);}
 for(const r of records){if(r.source!=='working-report'||String(r.workDate||'').slice(0,7)!==month)continue;const name=String(r.name||'').trim()||'未命名',id=realId(r.empId),matches=names.get(normalize(name));const key=id?'EMP:'+id:matches?.size===1?[...matches][0]:'NAME:'+normalize(name);const p=add(key,name,id),m=metrics(r);p.count++;for(const f of ['hours','disc','load','hc'])p[f]+=Number(m[f])||0;if(r.workingNo)p.ships.add(String(r.workingNo));p.groups.add(groupFor(r));}
 const result=[...people.values()].map(p=>({...p,groups:[...p.groups],ships:p.ships.size,containers:p.disc+p.load,eff:p.hours>0?(p.disc+p.load+p.hc)/p.hours:null}));
 const score=p=>p.count&&(sortBy==='containers'||p.hours>0)?(sortBy==='containers'?p.containers:Number(p.eff.toFixed(2))):null;
 result.sort((a,b)=>{const x=score(a),y=score(b);return x===null&&y!==null?1:y===null&&x!==null?-1:(y??0)-(x??0)||a.name.localeCompare(b.name,'zh-Hant-u-co-stroke')||a.key.localeCompare(b.key);});
 let last=null,rank=0;result.forEach((p,i)=>{const value=score(p);if(value===null)p.rank=null;else {if(value!==last)rank=i+1;p.rank=rank;last=value;}});return result;
}
const api={rankMonth};if(typeof module==='object'&&module.exports)module.exports=api;else root.P79PersonnelRanking=api;
})(typeof window!=='undefined'?window:globalThis);

const fs=require('fs'),vm=require('vm'),a=require('assert/strict');
const html=fs.readFileSync('history-data/index.html','utf8'),code=html.slice(html.indexOf('let backupAvailable='),html.indexOf("$('historyBackupNow').addEventListener"));
function setup(fail=''){
 let currentToken='A',requests=[],uuid=0,hold;const nodes=new Map();const node=()=>({textContent:'',disabled:false,appendChild(){}});nodes.set('month',{value:'2026-10'});
 const c={URL,AbortController,setTimeout,clearTimeout,crypto:{randomUUID:()=> 'fixture-request-'+(++uuid)},document:{createElement:node,createTextNode:node},$:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},perms:()=>({level:'manage'}),session:()=>({role:'superadmin'}),token:()=>currentToken,gas:()=> 'https://fixture.invalid',fetch:async(_,opt)=>{const d=JSON.parse(opt.body);requests.push(d);if(hold)await hold;return{ok:true,json:async()=>d.type===fail?{ok:false,error:'fixture failure'}:{ok:true,verified:true,...d,rows:1,sourceUnchanged:true,backupUrl:'https://docs.google.com/spreadsheets/d/fixture'}}}};
 vm.createContext(c);vm.runInContext(code+';backupAvailable=true;',c);return{c,requests,nodes,fail:x=>fail=x,token:x=>currentToken=x,hold:x=>hold=x};
}
(async()=>{
 let t=setup();await t.c.backupNow();a.deepEqual(t.requests.map(r=>r.type),['attendance','schedule','vessel']);a.match(t.nodes.get('historyBackupStatus').textContent,/全部備份完成/);
 t=setup('schedule');await t.c.backupNow();a.match(t.nodes.get('historyBackupStatus').textContent,/部分尚未完成/);const prior=t.requests[1].requestId;t.fail('');await t.c.backupNow();a.equal(t.requests.length,4);a.equal(t.requests[3].type,'schedule');a.equal(t.requests[3].requestId,prior);a.match(t.nodes.get('historyBackupStatus').textContent,/全部備份完成/);
 t=setup();let release;t.hold(new Promise(r=>release=r));let first=t.c.backupNow();await t.c.backupNow();a.equal(t.requests.length,1,'double-click cannot launch another batch');t.token('B');release();await first;a.equal(t.requests.length,1,'account change stops remaining backups');
 console.log('PASS one-click all types, independent outcomes, idempotent failed-only retry, double-click and account guards');
})().catch(e=>{console.error(e);process.exit(1)});

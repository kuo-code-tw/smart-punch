const fs=require('fs'),vm=require('vm'),a=require('assert/strict');
const src=fs.readFileSync('assets/port79-seven-top.js','utf8');
const start=src.indexOf('function computerSyncModel('),end=src.indexOf('function render(data)',start);
function element(){return {dataset:{},style:{},children:[],attrs:{},textContent:'',setAttribute(k,v){this.attrs[k]=v},appendChild(e){this.children.push(e)},addEventListener(k,f){this[k]=f},querySelector(q){return q==='.p79-sys-state'?this.children[2]:null}};}
let button=null,status={state:'idle',label:'未連接'},reads=0,opened=0;
const host={querySelector:()=>null,insertBefore:b=>button=b};
const c={Intl,Date,isAttendancePunchOnly:()=>false,document:{visibilityState:'visible',getElementById:id=>id==='p79SevenStatus'?host:button,createElement:element},window:{Port79DataCache:{getFolderSyncStatus:async()=>{reads++;return status},openCenter:()=>opened++}}};vm.createContext(c);vm.runInContext(src.slice(start,end),c);
(async()=>{
 for(const state of ['idle','busy','done','permission','error']){status={state,label:{idle:'未連接',busy:'保存中',done:'已保存',permission:'需重新授權',error:'保存失敗'}[state],savedAt:state==='done'?Date.parse('2026-10-24T12:00:00Z'):0,folder:'D槽資料夾'};await c.refreshComputerSync();a.equal(button.dataset.state,state);a(button.children[2].textContent.includes(status.label));a(button.attrs['aria-label'].includes('電腦資料夾'));a.equal(button.children[0].textContent,'💻');a.equal(button.children[1].textContent,'電腦');}
 status={state:'done',label:'已保存',savedAt:Date.parse('2026-10-24T12:00:00Z')};await c.refreshComputerSync();a(button.children[2].textContent.includes('20:00:00'),'Taipei actual save timestamp');button.click();a.equal(opened,1);
 const before=reads;c.document.visibilityState='hidden';await c.refreshComputerSync();a.equal(reads,before,'background tabs do not poll disk status');
 a(src.includes("'p79-folder-sync-changed',refreshComputerSync"));a(src.includes('setInterval(refreshComputerSync,60000)'));new vm.Script(src);
 console.log('PASS computer status colors, text/time, accessible labels, cache-center click and hidden-tab guard');
})().catch(e=>{console.error(e);process.exitCode=1});

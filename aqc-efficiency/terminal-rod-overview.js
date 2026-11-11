/* 79/80 berth AQC dual-card overview. Read-only, bound to terminal-ops monthly stats. */
(function(root){
'use strict';
const RODS=Object.freeze({'79':['AQC7901','AQC7902','AQC7903','AQC7905'],'80':['AQC8001','AQC8002','AQC8003','AQC8005','AQC8006']});
const fmt=n=>Number(n).toLocaleString('zh-TW',{maximumFractionDigits:2});
const number=v=>{
 if(v===null||v===undefined||String(v).trim()==='')return null;
 const n=Number(String(v).replace(/,/g,''));
 return Number.isFinite(n)&&n>=0?n:null;
};
function portOf(value){
 const match=String(value??'').trim().toUpperCase().replace(/\s+/g,'').match(/^(79|80)(?:\D|$)/);
 return match?match[1]:'';
}
function craneOf(row){
 for(const value of [row.number,row.gcNo,row.aqc,row.aqcNo,row.craneNo]){
  const raw=String(value??'').toUpperCase();
  if(!raw.trim())continue;
  const matches=[...raw.matchAll(/(?:AQC[\s#-]*)?(79(?:01|02|03|05)|80(?:01|02|03|05|06))(?!\d)/g)].map(m=>'AQC'+m[1]);
  const unique=[...new Set(matches)];
  if(unique.length===1)return unique[0];
  if(unique.length>1)return '';
 }
 return '';
}
function calculate(stats){
 const masterPort=new Map(),ports={};
 for(const ship of stats.ships||[]){
  const no=String(ship.workingNo||ship.sourceWorkingNo||'').trim(),port=portOf(ship.wharf);
  if(no&&port)masterPort.set(no,port);
 }
 for(const code of Object.keys(RODS))ports[code]={
  code,ships:0,billed:0,disc:0,load:0,moves:0,shift:0,shiftMissing:false,
  rods:RODS[code].map(name=>({name,records:0,disc:0,load:0,discOK:true,loadOK:true}))
 };
 for(const s of stats.byWharf||[]){
  const code=portOf(s.wharf),port=ports[code];
  if(!port)continue;
  port.ships+=s.ships||0;port.billed+=s.billed||0;
  port.disc+=s.disc||0;port.load+=s.load||0;port.moves+=s.moves||0;port.shift+=s.shift||0;
 }
 for(const ship of stats.ships||[]){
  const port=ports[portOf(ship.wharf)];
  if(port&&number(ship.shiftMoves)===null&&number(ship.workingSheetSource?.shiftMoves)===null)port.shiftMissing=true;
 }
 let unmatched=0,conflicts=0;
 for(const r of stats.records||[]){
  const name=craneOf(r);
  if(!name){unmatched++;continue}
  const port=ports[name.slice(3,5)];
  if(!port){unmatched++;continue}
  const wharf=portOf(r.wharf)||masterPort.get(String(r.workingNo||'').trim())||'';
  if(wharf&&wharf!==port.code){conflicts++;continue}
  const row=port.rods.find(x=>x.name===name);
  if(!row){unmatched++;continue}
  row.records++;
  const disc=number(r.disc),load=number(r.load);
  if(disc===null)row.discOK=false;else row.disc+=disc;
  if(load===null)row.loadOK=false;else row.load+=load;
 }
 for(const port of Object.values(ports)){
  for(const rod of port.rods){
   rod.discValue=rod.records&&rod.discOK?rod.disc:null;
   rod.loadValue=rod.records&&rod.loadOK?rod.load:null;
   rod.quantity=rod.discValue!==null&&rod.loadValue!==null?rod.discValue+rod.loadValue:null;
   rod.status=!rod.records?'none':rod.quantity===null?'review':'reported';
  }
  port.recorded=port.rods.filter(r=>r.status==='reported').length;
  port.noRecords=port.rods.filter(r=>r.status==='none').length;
  port.needsReview=port.rods.filter(r=>r.status==='review').length;
  port.hasRodData=port.rods.some(r=>r.quantity!==null);
  port.incomplete=port.rods.some(r=>r.status==='review');
  port.rodQuantity=port.rods.reduce((sum,r)=>sum+(r.quantity||0),0);
  port.rodDisc=port.rods.reduce((sum,r)=>sum+(r.discValue||0),0);
  port.rodLoad=port.rods.reduce((sum,r)=>sum+(r.loadValue||0),0);
 }
 return {ports,unmatched,conflicts};
}
function markup(){
 const card=code=>{
  const names=RODS[code].join('、');
  return '<section class="p79-rod-card" aria-label="'+code+'碼頭逐桿作業統計">'+
   '<header class="p79-rod-banner"><strong class="p79-rod-title">⚓ '+code+'碼頭</strong><span class="p79-rod-roster">吊桿：'+names+'</span>'+
   '<div class="p79-rod-port-metrics"><span class="p79-rod-total"><small>本月作業櫃數</small><b id="terminalPort'+code+'Total">—</b></span>'+ 
   '<span class="p79-rod-flip"><small>翻艙 SHIFT（另列）</small><b id="terminalPort'+code+'Flip">—</b></span></div></header>'+
   '<div class="p79-rod-scroll"><table class="p79-rod-table"><thead><tr><th>吊桿編號</th><th>狀態</th><th>作業櫃數</th><th>進口櫃</th><th>出口櫃</th><th>轉運櫃</th></tr></thead>'+
   '<tbody id="terminalRod'+code+'Body"></tbody><tfoot id="terminalRod'+code+'Foot"></tfoot></table></div></section>';
 };
 return '<div class="p79-rod-dashboard"><div class="p79-rod-update" id="terminalOverviewUpdate" aria-live="polite">資料更新：—</div>'+
  '<div class="p79-rod-summary-scroll"><table class="p79-rod-summary"><thead><tr>'+
  '<th>碼頭</th><th>吊桿數</th><th>有紀錄(支)</th><th>無紀錄(支)</th><th>待核(支)</th><th>本月作業櫃數</th><th>翻艙 SHIFT（不加總）</th><th>進口櫃</th><th>出口櫃</th><th>轉運櫃</th><th>合計</th>'+
  '</tr></thead><tbody id="terminalOverviewBody"></tbody></table></div>'+
  '<p class="p79-rod-caption">ⓘ 統計範圍：79／80 碼頭｜按所選月份／WORKING NO. 去重｜「有紀錄」表示本月有回報，非即時設備狀態</p>'+
  '<div class="p79-rod-cards">'+card('79')+card('80')+'</div>'+
  '<p class="p79-rod-footnote">碼頭「本月作業櫃數」維持船舶主檔原數，不另加 SHIFT。翻艙 SHIFT 是船舶主檔的額外作業次數，只在碼頭彙總另列，不能直接視為新增實櫃；逐桿維持 WORKING REPORT 原始 DISC／LOAD，不加、不扣、不分攤翻艙。兩種來源差異需核對口徑，不能直接湊數；缺資料顯示「—」。</p>'+
  '<div class="p79-rod-caution" id="terminalOverviewCaution" role="note"></div></div>';
}
function render(stats,state){
 const mount=document.getElementById('terminalRodOverviewMount');
 if(!mount)return;
 if(!mount.querySelector('#terminalOverviewBody'))mount.innerHTML=markup();
 const s=calculate(stats),amt=(v,has)=>has?fmt(v):'—';
 const top=document.getElementById('terminalOverviewBody');
 top.innerHTML=['79','80'].map(code=>{
  const p=s.ports[code],has=p.ships>0;
  return '<tr data-port="'+code+'"><td class="p79-rod-primary">'+code+'</td><td>'+p.rods.length+'</td>'+
   '<td class="p79-rod-green">'+p.recorded+'</td><td>'+p.noRecords+'</td><td>'+p.needsReview+'</td>'+
   '<td class="p79-rod-strong">'+amt(p.billed,has)+'</td><td class="p79-rod-flip-quantity">'+amt(p.shift,has&&!p.shiftMissing)+'</td><td>'+amt(p.disc,has)+'</td><td class="p79-rod-green">'+amt(p.load,has)+'</td><td>—</td><td class="p79-rod-strong">'+amt(p.billed,has)+'</td></tr>';
 }).join('');
 for(const code of ['79','80']){
  const port=s.ports[code],body=document.getElementById('terminalRod'+code+'Body');
  document.getElementById('terminalPort'+code+'Total').textContent=amt(port.billed,port.ships>0);
  document.getElementById('terminalPort'+code+'Flip').textContent=amt(port.shift,port.ships>0&&!port.shiftMissing);
  const val=(v,cls='')=>'<td class="'+(v===null?'p79-rod-muted ': '')+cls+'">'+(v===null?'—':fmt(v))+'</td>';
  body.innerHTML=port.rods.map(r=>{
   const label=r.status==='reported'?'有紀錄':r.status==='review'?'待核對':'未有紀錄';
   return '<tr><td class="p79-rod-name">'+r.name+'</td><td><span class="p79-rod-pill '+r.status+'">'+label+'</span></td>'+
    val(r.quantity,'p79-rod-strong')+val(r.discValue)+val(r.loadValue,'p79-rod-green')+'<td class="p79-rod-muted">—</td></tr>';
  }).join('');
  const has=port.hasRodData&&!port.incomplete;
  document.getElementById('terminalRod'+code+'Foot').innerHTML='<tr><td colspan="2">'+code+'碼頭 逐桿小計</td><td>'+amt(port.rodQuantity,has)+'</td><td>'+amt(port.rodDisc,has)+'</td><td class="p79-rod-green">'+amt(port.rodLoad,has)+'</td><td>—</td></tr>';
 }
 const stamp=state.loadedMonth===stats.month&&state.loadedAt?
   '↻ 資料更新：'+new Date(state.loadedAt).toLocaleString('zh-TW',{hour12:false}):
   '↻ 本機快取／未驗證更新時間';
 document.getElementById('terminalOverviewUpdate').textContent=stamp;
 const warnings=[];
 if(s.unmatched)warnings.push(s.unmatched+' 筆作業紀錄未能對應到指定的 9 支 AQC（不納入逐桿小計）');
 if(s.conflicts)warnings.push(s.conflicts+' 筆作業紀錄的碼頭與 AQC 編號不一致（待核）');
 for(const code of ['79','80'])if(s.ports[code].shiftMissing)warnings.push(code+'碼頭有船舶缺少 SHIFT 來源，翻艙數量暫不顯示');
 document.getElementById('terminalOverviewCaution').textContent=warnings.join('；');
}
root.P79TerminalRodOverview={render,calculate,portOf,craneOf,RODS};
})(window);

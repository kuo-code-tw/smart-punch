'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const view=fs.readFileSync(path.join(root,'assets/port79-reference-dashboard.js'),'utf8');
const external=fs.readFileSync(path.join(root,'assets/port79-external-ship-schedule.js'),'utf8');
const styles=fs.readFileSync(path.join(root,'assets/port79-reference-dashboard.css'),'utf8');
assert(html.includes('<b>萬海網站船期</b>'),'label must describe original third-party source');
assert(html.includes('id="p79ShipScheduleAll"'),'full-site and full-list button stays available');
assert(html.includes('port79-external-ship-schedule.js?v=20261031-wanhai-berth-v3'),'external adapter must be loaded');
assert(!html.includes('船舶作業重點提醒'));
assert(!view.includes('renderShipSchedule(v,ym)'),'historical vessel rows must not replace outside website data');
assert(!view.includes('function openShipSchedule('),'retired private source dialog must not open');
assert(view.includes('g.P79ExternalShipSchedule?.render?.()'),'external timetable should control its own view');
assert(external.includes("https://khhtml.wanhai.com/web/SailingScheduleList"),'source must be user provided Wan Hai URL');
assert(external.includes("mode:'cors'"),'normal browser CORS, not an invented same-origin proxy');
assert(external.includes("status='error'"),'errors must be surfaced instead of invented data');
assert(external.includes('於萬海原網站查看完整船期'),'source-site fallback must always be available');
assert(!external.includes('setInterval('),'no automatic polling on homepage');
assert(external.includes("uri.searchParams.set('action','wanHaiSailingSchedule')"),'backend integration is present');
assert(external.includes("p79DashRefresh")&&external.includes('addEventListener(\'click\',refresh)'),'manual button should refresh the external source');
assert(styles.includes('#p79WanHaiScheduleDialog')&&styles.includes('.p79-schedule-remote-msg'));
new vm.Script(view);new vm.Script(external);
const website={document:{readyState:'loading',addEventListener(){}},setTimeout(){},clearTimeout(){}};
vm.runInNewContext(external,{window:website,console,Intl,Date,Number,Map,Set});
const {parseSailingTables}=website.P79ExternalShipSchedule;
const cell=t=>({textContent:t});
const table={querySelectorAll:selector=>selector==='tr'?[
 {querySelectorAll:()=>[cell('船名'),cell('航次'),cell('預計抵港 ETA'),cell('預計離港 ETD'),cell('碼頭'),cell('狀態')]},
 {querySelectorAll:()=>[cell('WAN HAI 376'),cell('N036'),cell('2026-11-01 10:00'),cell('2026-11-01 18:00'),cell('79'),cell('預定')]},
 {querySelectorAll:()=>[cell('WAN HAI 376'),cell('N036'),cell('2026-11-01 10:00'),cell('2026-11-01 18:00'),cell('79'),cell('預定')]},
 {querySelectorAll:()=>[cell('<script>alert(1)</script>'),cell('S001'),cell(''),cell(''),cell(''),cell('待補')]},
 ]:[]};
const rows=parseSailingTables({querySelectorAll:()=>[table]});
assert.equal(rows.length,2,'same vessel/voyage/time cannot be duplicated');
assert.equal(rows[0].name,'WAN HAI 376');assert.equal(rows[0].eta,'2026-11-01 10:00');
assert.equal(rows[0].etd,'2026-11-01 18:00');assert.equal(rows[0].berth,'79');
assert(external.includes("class=\"p79-wanhai-berth\"")||external.includes("class=\"p79-wanhai-berth\""),'home row renders independent berthing terminal');
assert(external.includes('<th>靠泊碼頭</th>'),'full list labels the berthing terminal column');
assert(styles.includes('.p79-wanhai-berth'),'berthing terminal style exists');
const headerFor=t=>({querySelectorAll:()=>t.map(cell)});
const specificTable={querySelectorAll:selector=>selector==='tr'?[
 headerFor(['船名','航次','目的港','靠泊碼頭','預計抵港 ETA','預計離港 ETD']),
 headerFor(['WAN HAI 399','N039','高雄','高雄港第79號碼頭','2026-11-08 07:00','2026-11-08 18:00']),
 headerFor(['WAN HAI 399','N039','高雄','第80號碼頭','2026-11-08 07:00','2026-11-08 18:00'])
]:[]};
const terminals=parseSailingTables({querySelectorAll:()=>[specificTable]});
assert.equal(terminals.length,2,'different berthing terminals on same sailing are retained');
assert.equal(terminals[0].berth,'高雄港第79號碼頭','explicit terminal, not destination port');
assert.equal(terminals[1].berth,'第80號碼頭');
const noTerminal={querySelectorAll:selector=>selector==='tr'?[
 headerFor(['船名','航次','目的港','預計抵港 ETA']),
 headerFor(['WAN HAI 400','N040','高雄','2026-11-09 07:00'])
]:[]};
assert.equal(parseSailingTables({querySelectorAll:()=>[noTerminal]})[0].berth,'','no fabricated terminal from destination port');
assert.equal(rows[1].name,'<script>alert(1)</script>','source strings must remain literal until escaped by UI');
const unknown=parseSailingTables({querySelectorAll:()=>[{querySelectorAll:()=>[]} ]});
assert.equal(unknown.length,0,'unknown dynamic website markup must never invent a schedule');
console.log('PASS: homepage Wan Hai public-site source, data parsed only when identifiable, CORS fallback, manual refresh, no historical-data substitution');

'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'assets/port79-external-ship-schedule.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'assets/port79-reference-dashboard.css'),'utf8');
const window={document:{readyState:'loading',addEventListener(){}},setTimeout(){},clearTimeout(){}};
vm.runInNewContext(source,{window,URL,console,Intl,Date});
const parse=window.P79ExternalShipSchedule.parseWanHaiScheduleJson;
const screenshotData={data:[
 {RowNumber:6,VesselEName:'WAN HAI 178',VesselSName:'WH178',VesselName:'萬春',InVoyage:'N076',OutVoyage:'S077',InRoute:'MHT',OutRoute:'MHT',Berth:'W80',ETA:'2026/11/02 14:00',ETB:'2026/11/02 15:00',ETD:'2026/11/03 01:00'},
 {RowNumber:7,VesselEName:'CAPE FELTON',VesselName:'翼爾頓',InVoyage:'N160',OutVoyage:'S611',Berth:'W64',ETA:'2026/11/02 19:00',ETB:'2026/11/02 20:00',ETD:'2026/11/02 22:30'}
]};
const rows=parse(screenshotData);
assert.equal(rows.length,2);
assert.equal(rows[0].name,'WAN HAI 178');
assert.equal(rows[0].localName,'萬春');
assert.equal(rows[0].inVoyage,'N076');assert.equal(rows[0].outVoyage,'S077');
assert.equal(rows[0].eta,'2026/11/02 14:00');
assert.equal(rows[0].etb,'2026/11/02 15:00');
assert.equal(rows[0].etd,'2026/11/03 01:00');
assert.equal(rows[0].berth,'W80');
assert.equal(rows[1].berth,'W64');
assert.equal(parse({unrelated:[{VesselEName:'NOT A SAILING'}]}).length,0,'non-sailing data cannot become a schedule');
assert.equal(parse({data:JSON.stringify(screenshotData)}).length,2,'JSON-wrapped payload supported');
assert(source.includes("await loadSourceHtml(controller.signal)"),'backend fetch remains in place');
assert(source.includes("const structured=result.rows??result.records??result.data??result.payload"),'backend can return verified structured JSON');
assert(source.includes("parseWanHaiScheduleJson(payload)"),'payload parsed as JSON before HTML');
assert(source.includes('ETB 靠泊')&&source.includes('ETA 抵港')&&source.includes('ETD 離港'));
assert(source.includes('<th>靠泊碼頭</th>'));
assert(css.includes('repeat(3,minmax(0,1fr))'));
assert(html.includes('port79-external-ship-schedule.js?v=20261031-wanhai-json-fields-v5'));
assert(!source.includes('setInterval('),'no automatic refresh');
console.log('PASS Wan Hai JSON parser: names, separate voyages, ETA, ETB, ETD, berth, nested JSON, safe empty results, manual update');

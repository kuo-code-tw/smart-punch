// Regression: each company/date renders one table with separate job totals, never a combined company grand total,
// with matching XLSX, readable larger date and unchanged source data.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-overtime-application.js','utf8');
const context={window:{},TextEncoder,Date,Intl,Map,Set,URL,console};
vm.runInNewContext(source,context,{filename:'assets/port79-overtime-application.js'});
const api=context.window.P79OvertimeApplication;
const mk=(date,company,job,name,hours)=>({date,company,job,name,empId:name,periods:['','','','08-16'],
 actual:hours,converted:hours,note:'吊櫃作業',reportId:'R-'+name});
const d1='2026-10-25',d2='2026-10-26';
const first=[
 mk(d1,'亞太國際物流','ARMG','王一',8),
 mk(d1,'亞太國際物流','ARMG','王二',8),
 mk(d1,'亞太國際物流','F/L','柯三',8),
];
const multi=[...first,mk(d1,'亞安企業管理','ARMG','林四',8),mk(d2,'亞太國際物流','ARMG','陳五',6)];
const matches=(s,v)=>(s.match(v)||[]).length;
const splitPages=html=>[...html.matchAll(/<section class="oa-page">([\s\S]*?)<\/section>/g)].map(x=>x[1]);
const parseZip=b=>{
 const buf=Buffer.from(b),files=new Map();let p=0;
 while(p+30<=buf.length&&buf.readUInt32LE(p)===0x04034b50){
  const method=buf.readUInt16LE(p+8),size=buf.readUInt32LE(p+18),
        nameSize=buf.readUInt16LE(p+26),extra=buf.readUInt16LE(p+28);
  assert.equal(method,0,'workbook uses stored XML');
  const start=p+30+nameSize+extra, name=buf.toString('utf8',p+30,p+30+nameSize);
  files.set(name,buf.toString('utf8',start,start+size));p=start+size;
 }
 return files;
};
const page=api.reportHtml(first,false);
assert.equal(matches(page,/合計（小時）/g),2,'ARMG and F/L each have exactly one own subtotal');
assert(page.includes('ARMG 合計（小時）</td><td>16.00</td>'),'ARMG total 16.00');
assert(page.includes('F/L 合計（小時）</td><td>8.00</td>'),'F/L total 8.00');
assert(!page.includes('<td>24.00</td>'),'must not add a company-wide 24.00 grand total');
assert(page.indexOf('職稱：ARMG、F/L')<page.indexOf('ARMG 合計（小時）'),'every job shares one company table');
assert.equal(matches(page,/<table>/g),1,'one company and date must use a single table');
assert.equal(matches(page,/<thead>/g),1,'column headings are not repeated per job');
assert(page.includes('<td>1</td>')&&page.includes('<td>2</td>')&&page.includes('<td>3</td>'),'row numbers run across jobs');
assert(page.includes('115/10/25（星期日）'),'date keeps ROC year and weekday');
assert(!page.includes('加班日期：'),'date must not have prefix');
assert(source.includes('.oa-date{text-align:center;margin:5px 0;font-size:16px;font-weight:800'),'date must be bigger/bold');
assert(source.includes('@media print{')&&source.includes('.oa-date{font-size:15px}'),'printed date must be prominent');
const both=splitPages(api.reportHtml(multi,false));
assert.equal(both.length,2,'each date retains separate report');
assert.equal(matches(both[0],/合計（小時）/g),3,'ARMG and F/L subtotal plus second company ARMG subtotal');
assert.equal(matches(both[0],/<table>/g),2,'two companies must have one table each');
assert.equal(matches(both[0],/<thead>/g),2,'two companies must have one header each');
assert.equal(matches(both[1],/合計（小時）/g),1,'second date also has one total');
assert(both[0].includes('ARMG 合計（小時）</td><td>16.00</td>'),'ARMG own subtotal');
assert(both[0].includes('F/L 合計（小時）</td><td>8.00</td>'),'F/L own subtotal');
assert(both[0].includes('<td>8.00</td>'),'second company totals separately');
assert(!both[0].includes('<td>32.00</td>')&&!both[0].includes('<td>24.00</td>'),'no company or cross-company grand totals');
assert(both[1].includes('<td>6.00</td>'));
assert.equal(matches(both[0],/class="oa-sign"/g),2,'existing company signatures remain');
const hidden=api.reportHtml(first,false,true);
assert.equal(matches(hidden,/合計（小時）/g),2,'hidden converted-hours view keeps separate job subtotals');
const zip=parseZip(api.excelBytes(multi,false));
assert.equal(zip.size>=2,true,'XLSX created');
const sh1=zip.get('xl/worksheets/sheet1.xml'),sh2=zip.get('xl/worksheets/sheet2.xml');
assert(sh1&&sh2);
assert.equal(matches(sh1,/合計（小時）/g),3,'one total per job in every company');
assert.equal(matches(sh1,/員工編號/g),2,'Excel header once for each company, not each job');
assert.equal(matches(sh2,/合計（小時）/g),1);
assert(sh1.includes('ARMG 合計（小時）')&&sh1.includes('F/L 合計（小時）'),'Excel retains distinct job subtotals');
assert(sh1.includes('<v>16</v>'),'ARMG hours 16');
assert(sh1.includes('<v>8</v>'),'second company Excel total is distinct');
assert(!sh1.includes('<v>32</v>')&&!sh1.includes('<v>24</v>'),'Excel must not create extra grand totals');
assert.equal(matches(sh1,/SUM\(I/g),3,'each job gets its own Excel formula');
assert(sh2.includes('<v>6</v>'),'another date has its own total');
assert(sh1.includes('115/10/25（星期日）'),'Excel date has no prefix');
assert(!sh1.includes('加班日期：'));
assert(sh1.includes('SUM(I'),'Excel grand-total formula is recalculable');
const styles=zip.get('xl/styles.xml');
assert(styles.includes('<fonts count="4">')&&styles.includes('<sz val="16"/>'),'Excel date has a larger font');
const complete=first.map((r,i)=>({...r,summary:true,rangeLabel:'統計日期：115/10/25',periods:[i===0?8:0,0,0,0]}));
const agg=api.reportHtml(complete,false);
assert.equal(matches(agg,/合計（小時）/g),2,'summary mode maintains separate job subtotals');
assert(agg.includes('<td>8.00</td>'),'summary hours remain aggregated across jobs');
const missing=[...first.slice(0,2),{...first[2],converted:null}];
assert(api.reportHtml(missing,false).includes('未完整設定'),'missing converted hours remains visible');
assert.equal(matches(api.reportHtml(missing,false),/合計（小時）/g),2);
assert(/<input type="checkbox" id="oaHideConverted" checked>隱藏換算加班時數/.test(source),'hide converted-hours checkbox must be checked on open');
assert(!api.reportHtml(first,false,true).includes('換算加班時數'),'hidden column must not render in detail headers');
assert.equal(matches(hidden,/合計（小時）/g),2,'hidden converted-hours view must retain job totals');
console.log('PASS overtime job subtotals only: per-company shared table, ARMG/F-L independent totals, no grand total, Excel, preview/PDF, checked hide-converted default');

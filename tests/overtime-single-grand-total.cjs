// User screenshot regression: same company/date, AQC + ARMG + F/L each have a
// section heading and header in ONE continuous table, with ONLY ONE total at end.
// All backgrounds are pure white in web preview, print/PDF and XLSX.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-overtime-application.js','utf8');
const c={window:{},TextEncoder,Date,Intl,Map,Set,URL,console};
vm.runInNewContext(source,c,{filename:'port79-overtime-application.js'});
const api=c.window.P79OvertimeApplication;
const d1='2026-10-19',d2='2026-10-20';
const mk=(company,job,name,hours,period='08-16',date=d1)=>({
 date,company,job,name,empId:'TEST'+name,periods:['','','',period],
 actual:hours,converted:hours,note:'吊櫃作業',reportId:'R'+name
});
const yaan=[
 mk('亞安企業管理','AQC','楊文宗',8),
 mk('亞安企業管理','ARMG','蔡欣穎',8,'24-08'),
 mk('亞安企業管理','F/L','林家奕',4,'16-20'),
 mk('亞安企業管理','F/L','謝昱憲',4,'20-24')
];
const other=[
 mk('亞太國際物流','ARMG','王一',8),
 mk('亞太國際物流','F/L','王二',8)
];
const patternCount=(s,p)=>(s.match(p)||[]).length;
const articles=html=>[...html.matchAll(/<article>([\s\S]*?)<\/article>/g)].map(x=>x[1]);
const html=api.reportHtml(yaan,false,true),article=articles(html)[0];
assert.equal(articles(html).length,1,'one company only has one article');
assert.equal(patternCount(article,/<table>/g),1,'one single continuous table, not three tables');
assert.equal(patternCount(article,/class="oa-job-heading"/g),3,'three separate job labels');
assert.equal(patternCount(article,/class="oa-repeat-head"/g),3,'repeat complete header for each job');
assert.equal(patternCount(article,/class="oa-total"/g),1,'one and only one final total');
assert.equal(patternCount(article,/>合計<\/td>/g),1,'total uses exact screenshot label');
assert(article.indexOf('職稱：AQC')<article.indexOf('職稱：ARMG'));
assert(article.indexOf('職稱：ARMG')<article.indexOf('職稱：F/L'));
assert(article.indexOf('職稱：F/L')<article.indexOf('>合計</td>'),'total after all job sections');
assert(article.includes('<td>24.00</td>'),'8+8+4+4 must total 24.00');
assert(!article.includes('合計（小時）'),'no per-job subtotals');
assert.equal(patternCount(article,/class="oa-sign"/g),1,'signatures appear once');
assert(article.includes('115/10/19（星期一）'),'ROC date and day retained');
assert(!article.includes('加班日期：'),'date label removed');
assert(article.includes('亞安企業管理'),'company name retained');
assert.equal(patternCount(article,/<td>1<\/td>/g),3,'job-level numbering restarts as screenshot');
assert.equal(patternCount(article,/<td>2<\/td>/g),1,'F/L has its own second employee');
const h2=api.reportHtml([...yaan,...other,mk('亞安企業管理','ARMG','次日員工',6,'08-16',d2)],false,true);
const a=articles(h2);
assert.equal(a.length,3,'two companies first day, one company second day');
assert.equal(patternCount(a[0],/class="oa-total"/g),1);
assert.equal(patternCount(a[1],/class="oa-total"/g),1);
assert.equal(patternCount(a[2],/class="oa-total"/g),1);
assert(a[0].includes('<td>24.00</td>'));
assert(a[1].includes('<td>16.00</td>'));
assert(a[2].includes('<td>6.00</td>'));
const hidden=api.reportHtml(yaan,false,true);
assert(!hidden.includes('換算加班時數'),'checked hides converted hours');
const shown=api.reportHtml(yaan,false,false);
assert(patternCount(shown,/class="oa-total"/g)===1&&shown.includes('換算加班時數'),'unchecked restores converted column');
assert(source.includes('<input type="checkbox" id="oaHideConverted" checked>'),'hidden conversion starts checked');
assert(source.includes('.oa-repeat-head th{background:#fff}'),'header white');
assert(source.includes('.oa-total{background:#fff;font-weight:bold}'),'total white');
assert(source.includes('.rest,.work,.regular,.national{background:#fff}'),'all period fields white');
assert(source.includes('body{font:11px "Microsoft JhengHei",sans-serif;color:#17202b;margin:0;background:#fff}'),'print white');
assert(!source.includes('th{background:#e8eef5'),'no pastel table header');
assert(!source.includes('oa-total{background:#f1f5f9'),'no gray total');
assert(source.includes('.oa-date{text-align:left;margin:6px 0 5px;font-size:16px'),'date starts at left as screenshot');
function unzipEntries(bytes){
 const b=Buffer.from(bytes),files=new Map();let p=0;
 while(p+30<=b.length&&b.readUInt32LE(p)===0x04034b50){
  const method=b.readUInt16LE(p+8),size=b.readUInt32LE(p+18),
        n=b.readUInt16LE(p+26),extra=b.readUInt16LE(p+28);
  assert.equal(method,0);
  const begin=p+30+n+extra,name=b.toString('utf8',p+30,p+30+n);
  files.set(name,b.toString('utf8',begin,begin+size));p=begin+size;
 }
 return files;
}
const files=unzipEntries(api.excelBytes([...yaan,...other,mk('亞安企業管理','ARMG','次日員工',6,'08-16',d2)],false,true));
const first=files.get('xl/worksheets/sheet1.xml'),second=files.get('xl/worksheets/sheet2.xml'),
  styles=files.get('xl/styles.xml');
assert(first&&second&&styles,'valid XLSX package');
assert.equal(patternCount(first,/合計/g),2,'one total for each company on first date');
assert.equal(patternCount(second,/合計/g),1,'one total second date');
assert.equal(patternCount(first,/員工編號/g),5,'3 role headers for Yaan plus 2 in other company');
assert.equal(patternCount(first,/職稱：/g),5,'one heading per role');
assert(first.includes('<v>24</v>')&&first.includes('<v>16</v>'),'independent company totals');
assert(second.includes('<v>6</v>'));
assert.equal(patternCount(first,/SUM\(I/g),2,'one sum formula per company');
assert(!first.includes('合計（小時）'),'no subtotals in Excel');
assert(first.includes('115/10/19（星期一）'));
assert(!first.includes('加班日期：'));
assert(!styles.includes('FFE8EEF5')&&!styles.includes('FFFFF1F2')&&!styles.includes('FFF1F5F9'),'no pastel Excel fills');
assert.equal(patternCount(styles,/fgColor rgb="FFFFFFFF"/g),5,'every Excel fill is pure white');
assert(styles.includes('<alignment horizontal="left"'),'Excel date left aligned');
const summary=yaan.map(x=>({...x,summary:true,rangeLabel:'統計日期：115/10/19',periods:[x.actual,0,0,0]}));
const sh=api.reportHtml(summary,false,true);
assert.equal(patternCount(sh,/class="oa-total"/g),1,'summary still totals once');
assert(sh.includes('<td>24.00</td>'),'summary 24');
console.log('PASS screenshot-matched overtime: AQC/ARMG/F-L one continuous table, repeated headers, one 24.00 total at end, all-white print and XLSX, default hidden conversion, companies/dates independent');

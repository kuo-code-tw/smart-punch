(function(g){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),id=x=>String(x||'').trim().toUpperCase(),round=x=>Math.round(x*100)/100,app=()=>g.P79OvertimeApplication;
const leaveCodes={'特':'年','休息日':'休','例假日':'例','國定假日':'國','特休假':'年','特別休假':'年','特休':'年','年假':'年','事假':'事','病假':'病','普通傷病假':'病','普通傷病':'病','傷病假':'病','安胎休養請假':'安','育嬰留職停薪':'育','其他公司公告假別':'他','其他':'他','公假':'公','喪假':'喪','婚假':'婚','產假':'產','產檢假':'檢','陪產檢及陪產假':'陪','陪產假':'陪','家庭照顧假':'顧','生理假':'經','安胎休養假':'安','公傷病假':'傷','職災傷病假':'傷','訂婚假':'訂','離職':'離','resigned':'離','terminated':'離'};
const leaveCode=x=>{const text=String(x||'').trim();return leaveCodes[text]||text.match(/^(例|休|國)\d{1,2}(?::\d{2})?-/)?.[1]||(/假/.test(text)?text.slice(0,1):text);},isLeave=x=>['年','事','病','公','喪','婚','產','檢','陪','顧','經','安','傷','訂','育','他'].includes(x),jobGroup=x=>/領班/.test(x)?'領班':/指揮手/.test(x)?'船上指揮手':/AQC/i.test(x)?'AQC':/ARMG/i.test(x)?'ARMG':/F\/L/i.test(x)?'F/L':x;
const rank={領班:0,船上指揮手:1,AQC:2,ARMG:3,'F/L':4},sum=(rows,key)=>rows.some(r=>r[key]===null)?null:round(rows.reduce((n,r)=>n+r[key],0));
function build(snapshot,people,month,company='',jobs=[],mode='actual',context={}){
 const dates=app().datesFor('month','','',month),selectedJobs=new Set(jobs),issues=[],monthEnd=dates.at(-1),leaves=new Map(),reports=app().collect([snapshot],people,dates,company,jobs,mode);issues.push(...reports.issues);
 const reportMap=new Map(reports.rows.map(r=>[id(r.empId)+'|'+r.date,r]));
 const seenLeaves=new Set();for(const leave of snapshot.approvedLeaves||[]){if(!leave.start||!leave.end)continue;const key=leave.id||JSON.stringify(leave);if(seenLeaves.has(key))continue;seenLeaves.add(key);const days=Math.round((Date.parse(leave.end)-Date.parse(leave.start))/86400000)+1;if(!(days>0))continue;const declared=Number(leave.days),fraction=days===1&&Number.isFinite(declared)?Math.min(1,declared):declared===days||!Number.isFinite(declared)?1:null;
  for(const date of dates){if(date<leave.start||date>leave.end)continue;const k=id(leave.empId)+'|'+date,entry=leaves.get(k)||{codes:[],days:0};const code=leaveCode(leave.leaveType);if(code&&!entry.codes.includes(code))entry.codes.push(code);entry.days=entry.days===null||fraction===null?null:Math.min(1,entry.days+fraction);leaves.set(k,entry);}
 }
 const schedules=new Map();for(const row of snapshot.schedules||[]){const key=id(row.empId);if(schedules.has(key))throw Error('同一人員有重複班表，請先核對：'+key);schedules.set(key,row.schedule||{});}
 const rows=[];let missingSchedule=0,missingConversion=0;
 for(const emp of people){const co=app().companyFor(emp),job=String(emp.jobTitle||emp.deptDetail||'未設定');if(company&&company!==co||selectedJobs.size&&!selectedJobs.has(job))continue;const start=context.employmentStart?.(emp)||'',end=String(emp.lastWorkDate||emp.terminationDate||'').replaceAll('/','-').slice(0,10);if(start&&start>monthEnd||end&&end<dates[0])continue;
  const schedule=schedules.get(id(emp.empId))||{},row={empId:emp.empId,name:emp.name||emp.empId,job,group:jobGroup(job),company:co,values:[],actualValues:[],codes:[],converted:0,weekday:0,holiday:0,total:0,leaveDays:0,reports:[]};
  for(const date of dates){const raw=String(schedule[date]||''),meta=schedule.__meta?.[date]||{},report=reportMap.get(id(emp.empId)+'|'+date),leave=leaves.get(id(emp.empId)+'|'+date);let code=leave?.codes.join('／')||leaveCode(raw),days=leave?leave.days:isLeave(code)?1:0;
   if(start&&date<start){row.values.push('—');row.actualValues.push('—');row.codes.push('outside');continue;}
   if(end&&date>end||code==='離'){code='離';days=0;}else if(raw==='休'&&['例','休','國'].includes(leaveCode(meta.restCategory)))code=leaveCode(meta.restCategory);
   if(code==='離'){row.values.push(code);row.actualValues.push(code);row.codes.push(code);if(report)issues.push(row.name+' '+date+' 離職後仍有加班申報，未列入');continue;}
   row.leaveDays=row.leaveDays===null||days===null?null:round(row.leaveDays+days);
   if(report){const category=report.periods[0]?'休':report.periods[2]?'例':report.periods[3]?'國':'延';row.reports.push({...report,category});row.values.push(report.converted===null?'未設定':report.converted);row.actualValues.push(report.actual);row.codes.push(category+'加');row.converted=row.converted===null||report.converted===null?null:round(row.converted+report.converted);row[category==='延'?'weekday':'holiday']=round(row[category==='延'?'weekday':'holiday']+report.actual);row.total=round(row.total+report.actual);if(report.converted===null)missingConversion++;if(leave||isLeave(code))issues.push(row.name+' '+date+' 同時有請假與加班申報，請核對');}
   else{const display=['例','休','國'].includes(code)||isLeave(code)||leave?code:raw?0:'—';row.values.push(display);row.actualValues.push(display);row.codes.push(typeof display==='number'?'zero':display);if(!raw&&!leave)missingSchedule++;}
  }rows.push(row);
 }
 rows.sort((a,b)=>a.company.localeCompare(b.company,'zh-Hant')||(rank[a.group]??99)-(rank[b.group]??99)||a.group.localeCompare(b.group,'zh-Hant')||a.job.localeCompare(b.job,'zh-Hant')||a.name.localeCompare(b.name,'zh-Hant-u-co-stroke')||id(a.empId).localeCompare(id(b.empId)));
 const groups=[...new Set(rows.map(r=>r.group))].sort((a,b)=>(rank[a]??99)-(rank[b]??99)||a.localeCompare(b,'zh-Hant'));
 const summary=groups.map(job=>{const members=rows.filter(r=>r.group===job),hours=sum(members,'total');return {job,hours,people:members.length,average:members.length?round(hours/members.length):0,leaveDays:sum(members,'leaveDays')};});
 if(missingConversion)issues.push(missingConversion+' 筆申報沒有換算設定，以「未設定」顯示，不併入數字合計。');if(rows.some(r=>r.leaveDays===null))issues.push('部分跨日期請假的分日天數不明，請假天數標為待核對。');
 return {month,dates,rows,summary,issues,reports:rows.flatMap(r=>r.reports),planned:mode==='planned'};
}
const display=n=>n===null?'待核對':typeof n==='number'?String(round(n)):String(n??''),title=m=>(Number(m.slice(0,4))-1911)+'年'+Number(m.slice(5))+'月份79碼頭作業課加班時數統計表',weekday=d=>['日','一','二','三','四','五','六'][new Date(d+'T00:00:00Z').getUTCDay()];
function headers(model,hide){return ['工號','姓名','職稱',...model.dates.map(d=>Number(d.slice(8))),...(!hide?['換算合計']:[]),'平日加班','假日加班','實際合計'];}
const palette={例:['FFE4E6','BE123C'],休:['DBEAFE','1D4ED8'],國:['FEF3C7','A16207'],年:['ECFDF5','047857'],事:['FFF7ED','C2410C'],病:['F5F3FF','6D28D9'],公:['ECFEFF','0E7490'],喪:['F1F5F9','334155'],婚:['FDF2F8','BE185D'],離:['E2E8F0','475569'],'延加':['EEF2FF','4338CA'],'休加':['DBEAFE','1D4ED8'],'例加':['FFE4E6','BE123C'],'國加':['FEF3C7','A16207'],'未設定':['FEF2F2','B91C1C'],zero:['FFFFFF','94A3B8'],outside:['F8FAFC','94A3B8']};
Object.assign(palette,{產:['FFF1F2','9F1239'],檢:['FDF4FF','A21CAF'],陪:['F0FDFA','0F766E'],顧:['F7FEE7','4D7C0F'],經:['FCE7F3','9D174D'],安:['FAF5FF','7E22CE'],傷:['FEF2F2','991B1B'],訂:['FFEDD5','9A3412']});
function color(code){return palette[code]||palette[String(code).split('／')[0]]||['F8FAFC','475569'];}
function html(model,hide=false,preparer='',names={},hideZero=false,hideLabels=false){const valueText=n=>hideZero&&n===0?'':display(n);const count=headers(model,hide).length,lastNames=(!hide?['換算合計']:[]).concat(['平日加班','假日加班','實際合計']),widths=[96,78,90,...model.dates.map(()=>30),...lastNames.map(()=>70)],totalWidth=widths.reduce((a,b)=>a+b,0);let company='';
 const main=model.rows.map(row=>{let head='';if(company!==row.company){company=row.company;head='<tr class="mm-company"><th colspan="'+count+'">'+esc(names[company]||company)+'</th></tr>';}
  return head+'<tr><td class="mm-fixed mm-id">'+esc(row.empId)+'</td><td class="mm-fixed mm-name">'+esc(row.name)+'</td><td class="mm-fixed mm-job">'+esc(row.job)+'</td>'+row.actualValues.map((value,i)=>{const [bg,fg]=color(value==='未設定'?'未設定':row.codes[i]);return '<td style="background:#'+bg+'!important;color:#'+fg+'!important;font-weight:'+(value===0?'400':'700')+'">'+esc(hideLabels&&typeof value==='string'?'':valueText(value))+'</td>';}).join('')+(!hide?'<td class="mm-total">'+(row.converted===null?'未設定':valueText(row.converted))+'</td>':'')+'<td>'+valueText(row.weekday)+'</td><td>'+valueText(row.holiday)+'</td><td class="mm-total">'+valueText(row.total)+'</td></tr>';
 }).join('');
 return '<section class="mm-report"><h2>'+esc(title(model.month))+(model.planned?'（預排）':'')+'</h2><p class="mm-caption">每日格：'+'實際加班時數'+'｜平日、假日與實際合計：依申報時段計算的小時數</p><p class="mm-legend">例：例假　休：休息日　國：國定假日　年：特休　事：事假　病：病假　喪：喪假　離：離職　—：未排班／到職前</p><table class="mm-table" style="width:'+totalWidth+'px"><colgroup>'+widths.map(w=>'<col style="width:'+w/totalWidth*100+'%">').join('')+'</colgroup><thead><tr>'+headers(model,hide).map((h,i)=>'<th '+(i<3||i>=3+model.dates.length?'rowspan="2"':'')+'>'+esc(h)+'</th>').join('')+'</tr><tr>'+model.dates.map(d=>'<th>'+weekday(d)+'</th>').join('')+'</tr></thead><tbody>'+main+'<tr class="mm-grand"><th colspan="'+(3+model.dates.length)+'">合計（小時）</th>'+(!hide?'<td>'+(sum(model.rows,'converted')===null?'未完整設定':valueText(sum(model.rows,'converted')))+'</td>':'')+['weekday','holiday','total'].map(k=>'<td>'+valueText(sum(model.rows,k))+'</td>').join('')+'</tr></tbody></table><div class="mm-bottom"><table class="mm-summary"><thead><tr><th>職稱</th><th>實際總時數</th><th>統計人數</th><th>平均時數／人</th><th>請假天數</th></tr></thead><tbody>'+model.summary.map(r=>'<tr>'+[r.job,r.hours,r.people,r.average,r.leaveDays].map(v=>'<td>'+esc(valueText(v))+'</td>').join('')+'</tr>').join('')+'</tbody></table><p>平均時數＝實際總時數÷表內統計人數（含零加班人員）。</p><p>經理：　　　　　　　課長：　　　　　　　製表：'+esc(preparer)+'</p></div></section>';
}
const css=`body{margin:0;color:#172e4b;font:11px "Microsoft JhengHei",sans-serif}.mm-report h2{text-align:center;font-size:19px;margin:8px 0}.mm-caption,.mm-legend{text-align:center;font-size:11px;margin:6px 0}.mm-table{width:100%;table-layout:fixed;border-collapse:collapse}.mm-table th,.mm-table td{border:1px solid #b5c3d2;text-align:center;padding:5px 2px;overflow-wrap:anywhere}.mm-table thead{display:table-header-group;background:#172e4b;color:white}.mm-table thead tr:nth-child(2){background:#e2e8f0;color:#334155}.mm-company th{background:#dbeafe;color:#17365d;text-align:left;padding:7px}.mm-total,.mm-grand{background:#e8eef5;font-weight:bold}.mm-bottom{margin-top:12px;break-inside:avoid;font-size:11px}.mm-summary{width:650px;max-width:100%;border-collapse:collapse}.mm-summary th,.mm-summary td{border:1px solid #b5c3d2;padding:6px;text-align:center}.mm-summary th{background:#e8eef5}tr{break-inside:avoid}@page{size:A3 landscape;margin:8mm}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}.mm-table{font-size:9px;width:100%!important;min-width:0!important}.mm-table th,.mm-table td{padding:4px 1px}.mm-report h2{font-size:16px}.mm-fixed{position:static!important}}`;
function col(index){let name='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;}
function excel(model,hide=false,preparer='',names={}){
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',xml=s=>'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+s,files={},n=headers(model,hide).length,last=col(n-1),styles=[{fill:'FFFFFF',ink:'172E4B'},{fill:'172E4B',ink:'FFFFFF',bold:true},{fill:'E8EEF5',ink:'172E4B',bold:true},{fill:'DBEAFE',ink:'17365D',bold:true},...Object.values(palette).map(([fill,ink])=>({fill,ink,bold:ink!=='94A3B8'}))],styleKeys=Object.keys(palette),st=code=>{const i=styleKeys.indexOf(palette[code]?code:String(code).split('／')[0]);return i<0?0:4+i;};
 const titleStyle=styles.length;styles.push({fill:'172E4B',ink:'FFFFFF',bold:true,size:16});
 files['xl/styles.xml']=xml(`<styleSheet xmlns="${ns}"><numFmts count="2"><numFmt numFmtId="164" formatCode="0.##"/><numFmt numFmtId="165" formatCode="yyyy/mm/dd"/></numFmts><fonts count="${styles.length}">${styles.map(s=>`<font><name val="Microsoft JhengHei"/><sz val="${s.size||10}"/><color rgb="FF${s.ink}"/>${s.bold?'<b/>':''}</font>`).join('')}</fonts><fills count="${styles.length+2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${styles.map(s=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill}"/><bgColor indexed="64"/></patternFill></fill>`).join('')}</fills><borders count="2"><border/><border>${['left','right','top','bottom'].map(s=>`<${s} style="thin"><color rgb="FFB5C3D2"/></${s}>`).join('')}<diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styles.length+1}">${styles.map((s,i)=>`<xf numFmtId="164" fontId="${i}" fillId="${i+2}" borderId="1" xfId="0" applyAlignment="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`).join('')}<xf numFmtId="165" fontId="0" fillId="2" borderId="1" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
 const dateStyle=styles.length,cell=(c,r,value,s=0,formula='')=>{let attr=`r="${col(c)}${r}" s="${s}"`;if(formula)return `<c ${attr}${typeof value==='string'?' t="str"':''}><f>${esc(formula)}</f><v>${esc(value??'')}</v></c>`;if(value===null||value===undefined||value==='')return `<c ${attr}/>`;return typeof value==='number'?`<c ${attr}><v>${value}</v></c>`:`<c ${attr} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;};
 let r=1,body='',merges=[],company='',personRows=[];const add=(values,s=0,height=24,formulas=[],limit=n)=>{body+=`<row r="${r}" ht="${height}" customHeight="1">`+Array.from({length:limit},(_,c)=>cell(c,r,values[c],Array.isArray(s)?s[c]||0:s,formulas[c]||'')).join('')+'</row>';r++;};
 const mergeLine=(text,s=0,height=24)=>{merges.push(`A${r}:${last}${r}`);add([text],s,height);};
 mergeLine(title(model.month)+(model.planned?'（預排）':''),titleStyle,34);mergeLine('每日格：'+'實際加班時數'+'；右側平日、假日及實際合計均為實際時數',0);mergeLine('例：例假　休：休息日　國：國定假日　年：特休　事：事假　病：病假　喪：喪假　離：離職　—：未排班／到職前',0);mergeLine('資料來源：已儲存加班申報、班表與核准請假。時數依申報時段，不依打卡長度。',0);
 add(headers(model,hide),1,34);add(['','','',...model.dates.map(weekday)],2,20);for(const i of [0,1,2,...Array.from({length:n-3-model.dates.length},(_,i)=>3+model.dates.length+i)])merges.push(`${col(i)}5:${col(i)}6`);
 const srcLast=Math.max(2,model.reports.length+1),sourceRange=c=>`'申報來源'!$${c}$2:$${c}$${srcLast}`,actualRange=sourceRange('E'),convertedRange=sourceRange('F'),idsRange=sourceRange('B'),datesRange=sourceRange('C'),catsRange=sourceRange('D'),dataStart=7;
 for(const row of model.rows){if(company!==row.company){company=row.company;mergeLine(names[company]||company,3,25);}const rr=r,values=[row.empId,row.name,row.job,...row.actualValues,...(!hide?[row.converted===null?'未設定':row.converted]:[]),row.weekday,row.holiday,row.total],format=[0,0,0,...row.codes.map((c,i)=>st(row.actualValues[i]==='未設定'?'未設定':c)),...Array(n-3-model.dates.length).fill(2)],formulas=[];
  for(const report of row.reports){const day=model.dates.indexOf(report.date),serial=Math.round(Date.parse(report.date+'T00:00:00Z')/86400000)+25569,base=`${idsRange},$A${rr},${datesRange},${serial}`;formulas[3+day]=`SUMIFS(${actualRange},${base})`;}
  const offset=3+model.dates.length;if(!hide)formulas[offset]=`IF(COUNTIFS(${idsRange},$A${rr},${convertedRange},"未設定")>0,"未設定",SUMIFS(${convertedRange},${idsRange},$A${rr}))`;
  const wd=offset+(hide?0:1);formulas[wd]=`SUMIFS(${actualRange},${idsRange},$A${rr},${catsRange},"延")`;formulas[wd+1]=`SUMIFS(${actualRange},${idsRange},$A${rr},${catsRange},"<>延")`;formulas[wd+2]=`SUM(${col(wd)}${rr}:${col(wd+1)}${rr})`;
  personRows.push(rr);add(values,format,24,formulas);
 }
 const totalsOffset=3+model.dates.length,grand=r;merges.push(`A${r}:${col(totalsOffset-1)}${r}`);const totalValues=Array(n).fill(''),totalFormulas=[];totalValues[0]='合計（小時）';[...(!hide?['converted']:[]),'weekday','holiday','total'].forEach((key,i)=>{const c=totalsOffset+i;totalValues[c]=sum(model.rows,key)===null?'未完整設定':sum(model.rows,key);if(personRows.length){const range=`${col(c)}${dataStart}:${col(c)}${grand-1}`;totalFormulas[c]=key==='converted'?`IF(COUNTIFS(${range},"未設定")>0,"未完整設定",SUM(${range}))`:`SUM(${range})`;}});add(totalValues,2,26,totalFormulas);
 mergeLine('職稱統計：平均＝實際總時數÷表內統計人數（含零加班人員）。',0,24);
 const spans=[[0,2],[3,6],[7,10],[11,14],[15,18]];let summaryStart=r;const addSummary=(values,s=0,formulas=[])=>{const data=Array(n).fill(''),ff=[];spans.forEach(([a,b],i)=>{merges.push(`${col(a)}${r}:${col(b)}${r}`);data[a]=values[i];ff[a]=formulas[i]||'';});add(data,s,26,ff,19);};
 addSummary(['職稱','實際總時數','統計人數','平均時數／人','請假天數'],2);for(const item of model.summary){const rr=r,job=item.job.replaceAll('\"','\"\"'),peopleLast=Math.max(2,model.rows.length+1),jobsRange=`'申報來源'!$K$2:$K$${peopleLast}`,leaveRange=`'申報來源'!$L$2:$L$${peopleLast}`;addSummary([item.job,item.hours,item.people,item.average,item.leaveDays===null?'待核對':item.leaveDays],0,['',`SUMIFS(${actualRange},${sourceRange('G')},"${job}")`,`COUNTIFS(${jobsRange},"${job}")`,`IF(H${rr}=0,0,ROUND(D${rr}/H${rr},2))`,`IF(COUNTIFS(${jobsRange},"${job}",${leaveRange},"待核對")>0,"待核對",SUMIFS(${leaveRange},${jobsRange},"${job}"))`]);}
 mergeLine('經理：　　　　　　　　　課長：　　　　　　　　　製表：'+preparer,0,32);const end=r-1;
 const widths=[15,12,14,...model.dates.map(()=>4.8),...Array(n-3-model.dates.length).fill(10)];
 files['xl/worksheets/sheet1.xml']=xml(`<worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${last}${end}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="3" ySplit="6" topLeftCell="D7" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData><mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0.1" footer="0.1"/><pageSetup paperSize="8" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;R第 &amp;P 頁／共 &amp;N 頁</oddFooter></headerFooter></worksheet>`);
 let sourceBody='<row r="1">'+['申報識別碼','工號','日期','類別','實際時數','換算時數','職稱分類','','工號','姓名','職稱分類','請假天數'].map((v,i)=>cell(i,1,v,1)).join('')+'</row>';
 for(let i=0;i<Math.max(model.reports.length,model.rows.length);i++){const rr=i+2,report=model.reports[i],person=model.rows[i];let cells='';if(report){const serial=Math.round(Date.parse(report.date+'T00:00:00Z')/86400000)+25569;cells+=[report.reportId,report.empId,serial,report.category,report.actual,report.converted===null?'未設定':report.converted,jobGroup(report.job)].map((v,j)=>cell(j,rr,v,j===2?dateStyle:0)).join('');}if(person)cells+=[person.empId,person.name,person.group,person.leaveDays===null?'待核對':person.leaveDays].map((v,j)=>cell(j+8,rr,v)).join('');sourceBody+=`<row r="${rr}">${cells}</row>`;}
 files['xl/worksheets/sheet2.xml']=xml(`<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="1" max="2" width="28" customWidth="1"/><col min="3" max="7" width="16" customWidth="1"/><col min="8" max="8" width="3" customWidth="1"/><col min="9" max="12" width="20" customWidth="1"/></cols><sheetData>${sourceBody}</sheetData></worksheet>`);
 files['xl/workbook.xml']=xml(`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="月加班時數統計" sheetId="1" r:id="rId1"/><sheet name="申報來源" sheetId="2" state="hidden" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'月加班時數統計'!$A$1:$${last}$${end}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">'月加班時數統計'!$1:$6</definedName></definedNames><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1" calcOnSave="1"/></workbook>`);
 files['xl/_rels/workbook.xml.rels']=xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');files['_rels/.rels']=xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');files['[Content_Types].xml']=xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
 return app().zip(files);
}
function screen(model,hide,names,hideRest=false){
 const report=html(model,hide,'',names,true,hideRest);let table=report.slice(report.indexOf('<table class="mm-table"'),report.indexOf('<div class="mm-bottom">'));
 table=table.replace(/style="width:[^"]+"/,'style="width:100%;min-width:0"').replace(/<colgroup>[\s\S]*?<\/colgroup>/,'<colgroup><col style="width:6%"><col style="width:5%"><col style="width:6%">'+model.dates.map(()=>'<col>').join('')+Array.from({length:hide?3:4},()=>'<col style="width:4.5%">').join('')+'</colgroup>');
 return '<div class="mm-rest-legend" style="display:flex;gap:8px;margin:6px 0">'+['例','休','國'].map(code=>{const [bg,fg]=color(code);return '<span style="padding:4px 10px;border-radius:6px;background:#'+bg+';color:#'+fg+';font-weight:bold">'+({例:'例假',休:'休息日',國:'國定假日'}[code])+'</span>';}).join('')+'</div><div class="mm-overview">'+[['統計人數',model.rows.length+' 人'],['實際加班',display(sum(model.rows,'total'))+' 小時'],['平日加班',display(sum(model.rows,'weekday'))+' 小時'],['假日加班',display(sum(model.rows,'holiday'))+' 小時']].map(([label,value])=>'<div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>').join('')+'</div><div class="mm-role-cards">'+model.summary.map(r=>'<div><b>'+esc(r.job)+'</b><span>'+r.people+' 人 · '+display(r.hours)+' 小時</span><span>平均 '+display(r.average)+' 小時／人 · 請假 '+display(r.leaveDays)+' 天</span></div>').join('')+'</div><p class="mm-caption">每日顯示'+'實際加班時數'+'；右側為實際時數。例／休／國／年／事／病等假別以顏色區分。</p><div class="mm-grid" tabindex="0" aria-label="整月每日加班統計，整頁顯示">'+table+'</div>';
}
function open(){const context=g.p79OvertimeApplicationContext;if(!context?.canExport())return alert('沒有統計表匯出權限');if(document.getElementById('p79MonthlyMatrix'))return;const people=context.employees(),companies=[...new Set(people.map(app().companyFor))],jobs=[...new Set(people.map(p=>p.jobTitle||p.deptDetail||'未設定'))],dialog=document.createElement('section');let loaded=null,busy=false,names=app().companyLabels();dialog.id='p79MonthlyMatrix';dialog.style.cssText='position:fixed;inset:0;z-index:2147483646;width:100vw;max-width:none;height:100dvh;margin:0;padding:0;box-sizing:border-box;display:flex;flex-direction:column;background:#f5f7fb;color:#172e4b;font-family:Microsoft JhengHei,sans-serif';dialog.setAttribute('aria-label','加班時數統計表');const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
 const scopedCss=css.split('@page')[0].replace(/([^{}]+)\{/g,(_,ss)=>ss.split(',').map(s=>'#p79MonthlyMatrix .mm-preview'+(s.trim()==='body'?'':' '+s.trim())).join(',')+'{');
 dialog.innerHTML='<style>#p79MonthlyMatrix .mm-header,#p79MonthlyMatrix .mm-footer{position:relative;flex-shrink:0;padding:10px 12px;background:#eef2f6;display:flex;align-items:center;justify-content:space-between;gap:8px}#p79MonthlyMatrix .mm-body{padding:8px 12px;flex:1;min-width:0;min-height:0;overflow:auto;display:flex;flex-direction:column}#p79MonthlyMatrix .mm-controls{display:flex;flex-wrap:wrap;gap:9px;align-items:end}#p79MonthlyMatrix label{display:flex;flex-direction:column;gap:4px;font-size:12px}#p79MonthlyMatrix input,#p79MonthlyMatrix select{padding:7px;border:1px solid #cbd5e1;border-radius:7px;color:#172e4b;background:#fff}#p79MonthlyMatrix button{padding:8px 12px;border:0;border-radius:8px;cursor:pointer;background:#e2e8f0;color:#172e4b}#p79MonthlyMatrix button:disabled{opacity:.5;cursor:wait}#p79MonthlyMatrix .mm-primary{background:#0369a1;color:white}#p79MonthlyMatrix details{position:relative;font-size:12px}#p79MonthlyMatrix .mm-options{position:absolute;z-index:5;right:0;min-width:180px;max-width:calc(100vw - 32px);max-height:min(260px,50dvh);overflow:auto;padding:10px;background:white;border:1px solid #cbd5e1;box-shadow:0 5px 18px #0002}#p79MonthlyMatrix .mm-options label{padding:5px}#p79MonthlyMatrix .mm-preview{display:flex;flex-direction:column;flex:1;min-height:0}#p79MonthlyMatrix .mm-scroll{display:flex;flex-direction:column;flex:1;min-height:180px;margin-top:4px}#p79MonthlyMatrix .mm-table thead th{position:sticky;top:0;z-index:2}#p79MonthlyMatrix .mm-table thead tr:first-child th{height:30px;box-sizing:border-box;background:#172e4b;color:white}#p79MonthlyMatrix .mm-table thead tr:nth-child(2) th{top:30px;background:#e2e8f0}#p79MonthlyMatrix .mm-table thead tr:first-child th:nth-child(1){left:0;z-index:4}#p79MonthlyMatrix .mm-table thead tr:first-child th:nth-child(2){left:96px;z-index:4}#p79MonthlyMatrix .mm-table thead tr:first-child th:nth-child(3){left:174px;z-index:4}#p79MonthlyMatrix .mm-fixed{position:sticky;z-index:1;background:#fff}#p79MonthlyMatrix .mm-id{left:0}#p79MonthlyMatrix .mm-name{left:96px}#p79MonthlyMatrix .mm-job{left:174px}'+scopedCss+'#p79MonthlyMatrix .mm-grid{overflow:auto;flex:1;min-height:140px;min-width:0;scrollbar-gutter:stable;border:1px solid #cbd5e1;background:white;border-radius:8px}#p79MonthlyMatrix .mm-grid .mm-table{font-size:13px;border-collapse:separate;border-spacing:0}#p79MonthlyMatrix .mm-grid td{height:30px;white-space:nowrap;overflow-wrap:normal}#p79MonthlyMatrix .mm-grid th{white-space:nowrap}#p79MonthlyMatrix .mm-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:8px}#p79MonthlyMatrix .mm-overview>div{padding:8px 12px;background:white;border:1px solid #dbe3ee;border-radius:8px}#p79MonthlyMatrix .mm-overview small{display:block;color:#64748b}#p79MonthlyMatrix .mm-overview strong{font-size:22px;display:block;margin-top:4px}#p79MonthlyMatrix .mm-role-cards{display:flex;gap:8px;flex-wrap:wrap}#p79MonthlyMatrix .mm-role-cards>div{display:flex;flex-direction:column;gap:3px;padding:8px 12px;background:#e8eef8;border-radius:7px;font-size:12px}#p79MonthlyMatrix .mm-caption{text-align:left;font-size:12px}@media(max-width:650px){#p79MonthlyMatrix .mm-overview{grid-template-columns:repeat(2,1fr)}#p79MonthlyMatrix .mm-overview strong{font-size:18px}#p79MonthlyMatrix .mm-role-cards{display:none}}#p79MonthlyMatrix .mm-grid{overflow-x:hidden}#p79MonthlyMatrix .mm-grid .mm-table{width:100%;min-width:0;font-size:clamp(8px,.72vw,13px)}#p79MonthlyMatrix .mm-grid .mm-table td{padding:4px 1px;overflow:hidden;text-overflow:ellipsis}#p79MonthlyMatrix .mm-grid .mm-table th{padding:4px 1px!important;white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important;font-size:clamp(9px,.65vw,12px)!important;line-height:1.25!important}#p79MonthlyMatrix .mm-grid .mm-table td{padding:4px 1px!important;font-size:clamp(9px,.65vw,12px)!important;line-height:1.3!important;white-space:nowrap!important;overflow-wrap:normal!important}#p79MonthlyMatrix .mm-grid .mm-table .mm-id{overflow:visible;text-overflow:clip}#p79MonthlyMatrix .mm-grid .mm-table thead tr:first-child th{height:26px}#p79MonthlyMatrix .mm-grid .mm-table thead tr:nth-child(2) th{top:26px}#p79MonthlyMatrix .mm-grid .mm-fixed{position:static}#p79MonthlyMatrix .mm-grid .mm-table thead th{left:auto} </style><div class="mm-header"><b>加班時數統計表｜整月查看</b><button id="mmClose">返回加班管理</button></div><div class="mm-body"><div class="mm-controls"><label>統計月份<input type="month" id="mmMonth" value="'+esc(context.month()||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date()).slice(0,7))+'"></label><label>公司<select id="mmCompany"><option value="">全部公司</option>'+companies.map(c=>'<option value="'+esc(c)+'">'+esc(names[c]||c)+'</option>').join('')+'</select></label><details><summary>職稱（可複選）</summary><div class="mm-options">'+jobs.map(j=>'<label style="flex-direction:row"><input class="mm-job-filter" type="checkbox" value="'+esc(j)+'">'+esc(j)+'</label>').join('')+'<small>未勾選表示全部職稱</small></div></details><label>內容<select id="mmType"><option value="actual">已儲存申報</option><option value="planned">預排申報</option></select></label><label>製表人<input type="text" id="mmPreparer" maxlength="40" value="'+esc(context.preparer?.()||'')+'"></label><label style="flex-direction:row;align-items:center"><input type="checkbox" id="mmHide">隱藏換算合計</label><label style="flex-direction:row;align-items:center"><input type="checkbox" id="mmHideRest">隱藏每日文字（假別等）</label><details><summary>公司名稱設定</summary><div class="mm-options">'+companies.map(c=>'<label>'+esc(c)+'<input type="text" class="mm-company-name" data-company="'+esc(c)+'" maxlength="80" value="'+esc(names[c]||c)+'"></label>').join('')+'<button id="mmSaveNames">儲存公司名稱</button><small>記住此瀏覽器的報表公司名稱</small></div></details><button id="mmLoad" class="mm-primary">重新讀取</button></div><p id="mmStatus" role="status" style="font-size:12px;white-space:pre-line;max-height:64px;overflow:auto;flex-shrink:0;margin:6px 0">依範例顯示整月日期、假別、每日時數與各職稱平均。零加班人員也會列入統計。</p><div class="mm-scroll"><div class="mm-preview" id="mmPreview"></div></div></div><div class="mm-footer"><button id="mmCancel">返回加班管理</button><div><button id="mmPrint" disabled>列印／另存PDF</button> <button id="mmExcel" class="mm-primary" disabled>匯出加班月表</button></div></div>';

 // 只更動統計視窗 UI，沿用現有欄位、權限檢查、讀取及匯出程式。
 const mmStyles=[
 '#p79MonthlyMatrix{background:#f4f7fb!important;color:#18314e!important}',
 '#p79MonthlyMatrix .mm-header{background:linear-gradient(110deg,#fff 0%,#f3f8ff 100%);border-bottom:1px solid #dce6f2;padding:17px clamp(16px,2.2vw,38px);min-height:76px;box-shadow:0 1px 9px #17385b0d}',
 '#p79MonthlyMatrix .mm-brand{display:flex;align-items:center;gap:13px;min-width:0}',
 '#p79MonthlyMatrix .mm-brand-symbol{width:44px;height:44px;display:grid;place-items:center;background:#e0efff;border:1px solid #bbdbff;border-radius:14px;color:#075a9a;font-size:23px;flex-shrink:0}',
 '#p79MonthlyMatrix .mm-brand-label{color:#5680a5;font-size:11px;font-weight:800;letter-spacing:1.4px}',
 '#p79MonthlyMatrix .mm-brand-title{display:block;font-size:clamp(17px,1.6vw,24px);color:#173b5f;font-weight:900;letter-spacing:.5px;line-height:1.35}',
 '#p79MonthlyMatrix .mm-brand-description{margin-top:4px;color:#667c94;font-size:12px}',
 '#p79MonthlyMatrix .mm-back{background:#fff!important;border:1px solid #cbd9e9!important;color:#254c71!important;font-weight:700;white-space:nowrap}',
 '#p79MonthlyMatrix .mm-back:hover{background:#ebf3fd!important}',
 '#p79MonthlyMatrix .mm-body{padding:19px clamp(12px,2.2vw,34px) 22px!important;gap:14px;min-height:0;background:#f4f7fb}',
 '#p79MonthlyMatrix .mm-controls{display:block!important;flex:0 0 auto;min-width:0}',
 '#p79MonthlyMatrix .mm-filter-card{background:#fff;border:1px solid #dce6f0;box-shadow:0 4px 18px #1d3d6010;border-radius:17px;padding:clamp(14px,1.7vw,23px)}',
 '#p79MonthlyMatrix .mm-filter-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:16px}',
 '#p79MonthlyMatrix .mm-filter-heading strong{font-size:16px;font-weight:900;color:#1c4265}',
 '#p79MonthlyMatrix .mm-filter-heading small{font-size:12px;color:#73869b}',
 '#p79MonthlyMatrix .mm-form-grid{display:grid;grid-template-columns:minmax(165px,.8fr) minmax(175px,1fr) minmax(145px,.8fr) minmax(170px,1fr);gap:12px}',
 '#p79MonthlyMatrix .mm-form-grid label{min-width:0;display:flex;flex-direction:column;gap:7px;font-size:12px;font-weight:800;color:#4e6680}',
 '#p79MonthlyMatrix .mm-form-grid input,#p79MonthlyMatrix .mm-form-grid select{width:100%;min-width:0;height:46px;box-sizing:border-box;border:1px solid #cbd9e8;border-radius:11px;background:#fbfdff;color:#1f3c58;padding:9px 12px;font-size:14px;font-weight:700;transition:border-color .16s,box-shadow .16s}',
 '#p79MonthlyMatrix input:focus-visible,#p79MonthlyMatrix select:focus-visible,#p79MonthlyMatrix button:focus-visible,#p79MonthlyMatrix summary:focus-visible{outline:3px solid #70b7f3;outline-offset:2px}',
 '#p79MonthlyMatrix .mm-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px}',
 '#p79MonthlyMatrix .mm-actions button{min-height:42px;padding:10px 16px;font-weight:800;font-size:13px;transition:filter .15s,transform .15s}',
 '#p79MonthlyMatrix .mm-actions button:not(:disabled):hover{filter:brightness(.95);transform:translateY(-1px)}',
 '#p79MonthlyMatrix #mmLoad{background:linear-gradient(120deg,#0a75b6,#07588f)!important;color:#fff!important;box-shadow:0 4px 10px #006bb531}',
 '#p79MonthlyMatrix #mmResetFilters{background:#f0f5fa!important;color:#375571!important;border:1px solid #d8e3ef!important}',
 '#p79MonthlyMatrix .mm-actions-hint{color:#7b8b9e;font-size:12px}',
 '#p79MonthlyMatrix .mm-advanced{margin-top:15px;border-top:1px solid #e7edf5;padding-top:12px;font-size:13px}',
 '#p79MonthlyMatrix .mm-advanced>summary{cursor:pointer;user-select:none;list-style:none;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:#366084;padding:6px 2px}',
 '#p79MonthlyMatrix .mm-advanced>summary::-webkit-details-marker{display:none}',
 '#p79MonthlyMatrix .mm-advanced>summary:before{content:"▸";color:#1683c9;transition:transform .2s}',
 '#p79MonthlyMatrix .mm-advanced[open]>summary:before{transform:rotate(90deg)}',
 '#p79MonthlyMatrix .mm-advanced-content{margin-top:10px;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr);gap:12px}',
 '#p79MonthlyMatrix .mm-advanced-panel{background:#f8fbff;border:1px solid #e0e9f4;border-radius:11px;padding:12px 14px;min-width:0}',
 '#p79MonthlyMatrix .mm-panel-label{font-size:12px;font-weight:900;color:#285779;margin-bottom:6px}',
 '#p79MonthlyMatrix .mm-panel-help{font-size:11px;color:#7990a4;margin-bottom:9px}',
 '#p79MonthlyMatrix .mm-job-options{display:flex;flex-wrap:wrap;gap:6px 12px}',
 '#p79MonthlyMatrix .mm-job-options label,#p79MonthlyMatrix .mm-display-options label{display:inline-flex!important;flex-direction:row!important;gap:7px;align-items:center!important;padding:5px 7px;font-size:12px;font-weight:700;cursor:pointer;color:#385974}',
 '#p79MonthlyMatrix .mm-job-options input,#p79MonthlyMatrix .mm-display-options input{width:16px;height:16px;accent-color:#087db9;margin:0}',
 '#p79MonthlyMatrix .mm-display-options{display:flex;flex-direction:column;gap:5px}',
 '#p79MonthlyMatrix .mm-company-settings{margin-top:12px;border-top:1px dashed #d4e1ef;padding-top:9px}',
 '#p79MonthlyMatrix .mm-company-settings>summary{font-weight:800;color:#446581;cursor:pointer}',
 '#p79MonthlyMatrix .mm-company-settings .mm-options{position:static!important;max-width:none!important;max-height:none!important;box-shadow:none!important;border:0!important;background:transparent!important;padding:6px 0!important;display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:10px}',
 '#p79MonthlyMatrix .mm-company-settings .mm-options label{padding:0!important}',
 '#p79MonthlyMatrix .mm-company-settings .mm-options input{min-width:0;width:100%;box-sizing:border-box}',
 '#p79MonthlyMatrix .mm-company-settings .mm-options button{background:#daeefc!important;font-weight:800;align-self:end}',
 '#p79MonthlyMatrix .mm-company-settings .mm-options small{font-size:11px;color:#7a8da0;align-self:center}',
 '#p79MonthlyMatrix .mm-feedback{display:flex;align-items:flex-start;gap:13px;padding:15px 17px;border-radius:14px;border:1px solid #cee1f3;background:#eef7ff;box-shadow:0 3px 13px #21455a0b;flex:0 0 auto}',
 '#p79MonthlyMatrix .mm-feedback-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;background:#dcecff;color:#1267a3;flex-shrink:0;font-size:19px;font-weight:900}',
 '#p79MonthlyMatrix .mm-feedback-main{flex:1;min-width:0}',
 '#p79MonthlyMatrix .mm-feedback-title{font-size:14px;font-weight:900;color:#205075}',
 '#p79MonthlyMatrix #mmStatus{margin:5px 0 0!important;max-height:120px!important;overflow:auto;font-size:12px!important;line-height:1.6;color:#567087;white-space:pre-line}',
 '#p79MonthlyMatrix .mm-feedback-loading{border-color:#afd5f8;background:#eff7ff}',
 '#p79MonthlyMatrix .mm-feedback-loading .mm-feedback-icon{animation:mmSpin 1.4s linear infinite}',
 '#p79MonthlyMatrix .mm-feedback-success{border-color:#b6e1ce;background:#edfaf3}',
 '#p79MonthlyMatrix .mm-feedback-success .mm-feedback-icon{background:#d4f5e4;color:#177549}',
 '#p79MonthlyMatrix .mm-feedback-warning{border-color:#f1d5a5;background:#fffaf0}',
 '#p79MonthlyMatrix .mm-feedback-warning .mm-feedback-icon{background:#ffefcf;color:#a36a0a}',
 '#p79MonthlyMatrix .mm-feedback-error{border-color:#f1bec4;background:#fff2f2}',
 '#p79MonthlyMatrix .mm-feedback-error .mm-feedback-icon{background:#ffe0e0;color:#b03540}',
 '#p79MonthlyMatrix .mm-progress{height:4px;max-width:450px;background:#d8e8f7;border-radius:10px;overflow:hidden;margin-top:12px}',
 '#p79MonthlyMatrix .mm-progress:before{content:"";display:block;width:33%;height:100%;border-radius:10px;background:#198aca;animation:mmMove 1.5s ease-in-out infinite}',
 '#p79MonthlyMatrix .mm-progress[hidden],#p79MonthlyMatrix #mmDeploymentDiagnostic[hidden]{display:none!important}',
 '#p79MonthlyMatrix .mm-empty{min-height:205px;display:flex;justify-content:center;align-items:center;flex-direction:column;gap:9px;text-align:center;padding:22px;border:1px dashed #c9d8e9;background:#fff;border-radius:16px}',
 '#p79MonthlyMatrix .mm-empty-icon{width:54px;height:54px;display:grid;place-items:center;border-radius:16px;background:#e9f5ff;font-size:26px;color:#1677b2}',
 '#p79MonthlyMatrix .mm-empty strong{font-size:15px;color:#284967}',
 '#p79MonthlyMatrix .mm-empty span{color:#788da2;font-size:12px}',
 '#p79MonthlyMatrix .mm-scroll{flex:1;min-height:120px;margin-top:0!important}',
 '#p79MonthlyMatrix .mm-footer{border-top:1px solid #dce6f2;background:#fff;padding:11px clamp(12px,2.2vw,34px);flex-wrap:wrap}',
 '#p79MonthlyMatrix .mm-footer button{font-weight:800}',
 '@keyframes mmSpin{to{transform:rotate(360deg)}}',
 '@keyframes mmMove{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}',
 '@media(max-width:850px){#p79MonthlyMatrix .mm-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#p79MonthlyMatrix .mm-advanced-content{grid-template-columns:1fr}}',
 '@media(max-width:520px){#p79MonthlyMatrix .mm-header{padding:12px!important;min-height:0}#p79MonthlyMatrix .mm-brand-symbol{width:36px;height:36px;font-size:19px}#p79MonthlyMatrix .mm-brand-title{font-size:16px}#p79MonthlyMatrix .mm-brand-description{display:none}#p79MonthlyMatrix .mm-form-grid{grid-template-columns:1fr}#p79MonthlyMatrix .mm-body{padding:10px!important}#p79MonthlyMatrix .mm-filter-card{padding:12px}#p79MonthlyMatrix .mm-actions button{flex:1}#p79MonthlyMatrix .mm-actions-hint{width:100%}#p79MonthlyMatrix .mm-back{padding:7px!important;font-size:11px}}',
 '#p79MonthlyMatrix .mm-header{padding:10px 20px;min-height:56px}',
 '#p79MonthlyMatrix .mm-brand-symbol{width:36px;height:36px;font-size:19px;border-radius:10px}',
 '#p79MonthlyMatrix .mm-brand-label{font-size:10px;letter-spacing:.7px}',
 '#p79MonthlyMatrix .mm-brand-title{font-size:19px}',
 '#p79MonthlyMatrix .mm-brand-description{display:none}',
 '#p79MonthlyMatrix .mm-body{padding:10px 16px 14px!important;gap:8px}',
 '#p79MonthlyMatrix .mm-filter-card{padding:10px 12px;border-radius:12px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px 10px;align-items:end}',
 '#p79MonthlyMatrix .mm-filter-heading{grid-column:1/-1;margin:0;align-items:center}',
 '#p79MonthlyMatrix .mm-filter-heading strong{font-size:13px}',
 '#p79MonthlyMatrix .mm-filter-heading small{font-size:10px}',
 '#p79MonthlyMatrix .mm-form-grid{grid-column:1;grid-row:2;grid-template-columns:minmax(125px,.82fr) minmax(130px,1fr) minmax(130px,.95fr) minmax(135px,1fr);gap:8px}',
 '#p79MonthlyMatrix .mm-form-grid label{gap:3px;font-size:11px}',
 '#p79MonthlyMatrix .mm-form-grid input,#p79MonthlyMatrix .mm-form-grid select{height:34px;border-radius:8px;padding:5px 8px;font-size:12px}',
 '#p79MonthlyMatrix .mm-actions{grid-column:2;grid-row:2;flex-wrap:nowrap;gap:6px;margin:0;align-self:end}',
 '#p79MonthlyMatrix .mm-actions button{min-height:34px;padding:6px 9px;font-size:11px;white-space:nowrap}',
 '#p79MonthlyMatrix .mm-actions-hint{display:none}',
 '#p79MonthlyMatrix .mm-advanced{grid-column:1/-1;margin:0;padding-top:5px}',
 '#p79MonthlyMatrix .mm-advanced>summary{font-size:11px;padding:3px 0}',
 '#p79MonthlyMatrix .mm-feedback{padding:9px 12px;gap:9px;border-radius:10px}',
 '#p79MonthlyMatrix .mm-feedback-icon{width:30px;height:30px;font-size:15px}',
 '#p79MonthlyMatrix .mm-feedback-title{font-size:12px}',
 '#p79MonthlyMatrix #mmStatus{font-size:11px!important;line-height:1.4}',
 '@media(max-width:1100px){#p79MonthlyMatrix .mm-filter-card{grid-template-columns:1fr}#p79MonthlyMatrix .mm-form-grid{grid-column:1;grid-row:auto}#p79MonthlyMatrix .mm-actions{grid-column:1;grid-row:auto;justify-content:flex-start}#p79MonthlyMatrix .mm-advanced{grid-column:1}}',
 '@media(max-width:850px){#p79MonthlyMatrix .mm-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
 '@media(max-width:520px){#p79MonthlyMatrix .mm-form-grid{grid-template-columns:1fr}#p79MonthlyMatrix .mm-actions{flex-wrap:wrap}#p79MonthlyMatrix .mm-filter-card{padding:10px}#p79MonthlyMatrix .mm-body{padding:8px!important}}',
 '@media(prefers-reduced-motion:reduce){#p79MonthlyMatrix .mm-progress:before,#p79MonthlyMatrix .mm-feedback-loading .mm-feedback-icon{animation:none}}'
 ].join('');
 dialog.querySelector('style').insertAdjacentHTML('afterend','<style id="p79MonthlyMatrixUx">'+mmStyles+'</style>');
 const mmHeader=dialog.querySelector('.mm-header');
 mmHeader.innerHTML='<div class="mm-brand"><span class="mm-brand-symbol" aria-hidden="true">▦</span><div><div class="mm-brand-label">OVERTIME REPORT · 月度統計</div><strong class="mm-brand-title">加班時數統計表</strong><div class="mm-brand-description">整月申報、請假與各職稱時數一目了然</div></div></div><button id="mmClose" class="mm-back" type="button">← 返回加班管理</button>';
 const mmControls=dialog.querySelector('.mm-controls'),mmCard=document.createElement('section');
 mmCard.className='mm-filter-card';
 mmCard.innerHTML='<div class="mm-filter-heading"><strong>篩選統計條件</strong><small>先選擇月份和範圍，再更新報表</small></div>';
 const mmForm=document.createElement('div');mmForm.className='mm-form-grid';
 for(const name of ['mmMonth','mmCompany','mmType','mmPreparer'])mmForm.appendChild(dialog.querySelector('#'+name).closest('label'));
 mmCard.appendChild(mmForm);
 const mmActions=document.createElement('div');mmActions.className='mm-actions';
 const mmLoadButton=dialog.querySelector('#mmLoad');mmLoadButton.textContent='↻ 重新載入統計';
 mmActions.appendChild(mmLoadButton);
 const mmClearButton=document.createElement('button');mmClearButton.id='mmResetFilters';mmClearButton.type='button';mmClearButton.textContent='清除篩選';
 mmActions.appendChild(mmClearButton);
 const mmHint=document.createElement('span');mmHint.className='mm-actions-hint';mmHint.textContent='條件更動後，按「重新載入統計」取得最新資料';
 mmActions.appendChild(mmHint);mmCard.appendChild(mmActions);
 const mmAdvanced=document.createElement('details');mmAdvanced.className='mm-advanced';
 mmAdvanced.innerHTML='<summary>進階篩選與顯示設定</summary>';
 const mmAdvancedContent=document.createElement('div');mmAdvancedContent.className='mm-advanced-content';
 const mmJobs=document.createElement('div');mmJobs.className='mm-advanced-panel';
 mmJobs.innerHTML='<div class="mm-panel-label">職稱篩選（可複選）</div><div class="mm-panel-help">不勾選表示全部職稱</div>';
 const mmJobOptions=document.createElement('div');mmJobOptions.className='mm-job-options';
 const mmOldDetails=[...mmControls.children].filter(n=>n.tagName==='DETAILS');
 const mmJobDropdown=mmOldDetails[0],mmCompanyDropdown=mmOldDetails[1];
 for(const checkbox of mmJobDropdown.querySelectorAll('.mm-job-filter'))mmJobOptions.appendChild(checkbox.closest('label'));
 mmJobs.appendChild(mmJobOptions);
 const mmPreferences=document.createElement('div');mmPreferences.className='mm-advanced-panel';
 mmPreferences.innerHTML='<div class="mm-panel-label">報表顯示</div><div class="mm-panel-help">依報表需求選擇要隱藏的欄位</div>';
 const mmDisplay=document.createElement('div');mmDisplay.className='mm-display-options';
 for(const name of ['mmHide','mmHideRest'])mmDisplay.appendChild(dialog.querySelector('#'+name).closest('label'));
 mmPreferences.appendChild(mmDisplay);
 mmAdvancedContent.appendChild(mmJobs);mmAdvancedContent.appendChild(mmPreferences);
 mmCompanyDropdown.className='mm-company-settings';
 mmAdvanced.appendChild(mmAdvancedContent);mmAdvanced.appendChild(mmCompanyDropdown);
 mmCard.appendChild(mmAdvanced);mmControls.appendChild(mmCard);
 mmJobDropdown.remove();
 const mmStatusElement=dialog.querySelector('#mmStatus'),mmFeedback=document.createElement('div');
 mmFeedback.id='mmFeedback';mmFeedback.className='mm-feedback mm-feedback-idle';
 mmFeedback.innerHTML='<span id="mmFeedbackIcon" class="mm-feedback-icon" aria-hidden="true">ⓘ</span><div class="mm-feedback-main"><div id="mmFeedbackTitle" class="mm-feedback-title">準備產生加班月報</div><div id="mmFeedbackCopy"></div><div class="mm-progress" id="mmProgress" hidden></div></div>';
 mmStatusElement.replaceWith(mmFeedback);
 mmStatusElement.removeAttribute('style');mmStatusElement.removeAttribute('role');mmFeedback.querySelector('#mmFeedbackCopy').appendChild(mmStatusElement);
 const mmEmptyMarkup='<div class="mm-empty"><div class="mm-empty-icon" aria-hidden="true">▦</div><strong>報表會顯示在這裡</strong><span>設定月份與篩選條件，系統將為你整理整月資料。</span></div>';
 const diagnosticLink=document.createElement('a');
 diagnosticLink.id='mmDeploymentDiagnostic';diagnosticLink.hidden=true;diagnosticLink.target='_blank';diagnosticLink.rel='noopener noreferrer';
 diagnosticLink.textContent='檢查目前雲端服務是否可連線（不傳送登入資料）';
 diagnosticLink.style.cssText='display:inline-block;font-size:12px;font-weight:800;color:#075e91;text-decoration:underline;margin-top:7px';
 mmFeedback.querySelector('#mmFeedbackCopy').appendChild(diagnosticLink);

 document.body.appendChild(dialog);
 const q=s=>dialog.querySelector(s),status=t=>q('#mmStatus').textContent=t;
 const feedback=(kind,title,detail)=>{
   const diagnostic=q('#mmDeploymentDiagnostic');if(diagnostic){diagnostic.hidden=true;diagnostic.removeAttribute('href');}
   const node=q('#mmFeedback');node.className='mm-feedback mm-feedback-'+kind;
   q('#mmFeedbackIcon').textContent=({loading:'↻',success:'✓',warning:'!',error:'!',empty:'ⓘ',idle:'ⓘ'})[kind]||'ⓘ';
   q('#mmFeedbackTitle').textContent=title;
   status(detail);
   q('#mmProgress').hidden=kind!=='loading';
 };
 const render=()=>{if(loaded)q('#mmPreview').innerHTML=screen(loaded,q('#mmHide').checked,names,q('#mmHideRest').checked);};
 function reset(){loaded=null;q('#mmPreview').innerHTML=mmEmptyMarkup;q('#mmPrint').disabled=q('#mmExcel').disabled=true;feedback('idle','條件已更新','按「重新載入統計」，即可重新整理月份與職稱資料。');}
 function lock(on){busy=on;dialog.querySelectorAll('.mm-controls input,.mm-controls select,.mm-controls button').forEach(n=>n.disabled=on);q('#mmPrint').disabled=q('#mmExcel').disabled=on||!loaded;q('#mmLoad').textContent=on?'正在整理資料…':'↻ 重新載入統計';}
 q('#mmPreview').innerHTML=mmEmptyMarkup;
 q('#mmClose').onclick=q('#mmCancel').onclick=()=>{document.body.style.overflow=previousOverflow;dialog.remove();};dialog.querySelectorAll('.mm-controls input,.mm-controls select').forEach(n=>{if(!String(n.className||'').includes('mm-company-name'))n.onchange=reset;});q('#mmHide').onchange=q('#mmHideRest').onchange=q('#mmPreparer').onchange=render;
 q('#mmResetFilters').onclick=()=>{
  if(busy)return;
  q('#mmMonth').value=context.month()||new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date()).slice(0,7);
  q('#mmCompany').value='';q('#mmType').value='actual';
  dialog.querySelectorAll('.mm-job-filter').forEach(el=>el.checked=false);
  q('#mmHide').checked=false;q('#mmHideRest').checked=false;
  mmAdvanced.open=false;
  reset();
  q('#mmLoad').click();
 };
 q('#mmSaveNames').onclick=()=>{const next=Object.create(null);for(const field of dialog.querySelectorAll('.mm-company-name')){if(!field.value.trim())return status('公司名稱不可空白');next[field.dataset.company]=field.value.trim();}if(new Set(Object.values(next)).size!==Object.keys(next).length)return status('不同公司請使用不同名稱');names=next;for(const option of q('#mmCompany').options||[]){if(option.value)option.textContent=names[option.value]||option.value;}render();try{g.localStorage.setItem('port79_overtime_application_company_names_v1',JSON.stringify(names));status('公司名稱已儲存並套用。');}catch(_){status('公司名稱已套用本次視窗，瀏覽器無法記住設定。');}};
 q('#mmLoad').onclick=async()=>{
  if(busy)return;
  reset();lock(true);
  try{
   if(!context.canExport())throw Error('登入或匯出權限已失效');
   const month=q('#mmMonth').value;
   app().datesFor('month','','',month);
   const monthLabel=Number(month.slice(0,4))+' 年 '+Number(month.slice(5))+' 月';
   feedback('loading','正在整理 '+monthLabel+' 的加班資料','正在取得雲端班表、已核准請假與正式加班申報。資料量較大時請以此狀態為準。');
   const snapshot=await context.snapshot(month);
   if(!dialog.isConnected)return;
   if(!context.canExport())throw Error('登入或匯出權限已失效');
   feedback('loading','資料已讀取，正在彙整月表','正在核對職稱、出勤日期、假別、正式申報與換算時數。');
   loaded=build(snapshot,context.employees(),month,q('#mmCompany').value,[...dialog.querySelectorAll('.mm-job-filter:checked')].map(x=>x.value),q('#mmType').value,context);
   if(!loaded.rows.length){
    loaded=null;
    feedback('empty','目前沒有符合條件的人員','請檢查公司、職稱與月份，或使用「清除篩選」重新查詢。');
    q('#mmPreview').innerHTML='<div class="mm-empty"><div class="mm-empty-icon" aria-hidden="true">⌕</div><strong>找不到符合條件的統計資料</strong><span>可改選公司、職稱或月份，再重新載入。</span></div>';
    return;
   }
   render();
   if(loaded.issues.length)feedback('warning','統計表已產生，部分資料需核對','已整理 '+loaded.rows.length+' 名人員。以下事項請確認：\n'+loaded.issues.join('\n'));
   else feedback('success','統計表已準備完成','已完成 '+monthLabel+' 共 '+loaded.rows.length+' 名人員的統計。你可以在下方查看月表、列印或匯出 Excel。');
  }catch(e){
   loaded=null;
   const message=String(e?.message||e||'未知錯誤');
   const deploymentMissing=/\bHTTP\s*404\b/i.test(message);
   if(deploymentMissing){
    feedback('error','加班月報雲端服務找不到（HTTP 404）',
     '目前正式班表服務回傳 HTTP 404，並非本月沒有加班資料。請由系統管理員至 Google Apps Script「部署 → 管理部署」核對網頁應用程式是否仍有效、正式 /exec 網址是否變更。若後端部署已更換，需要同步更新系統的正式服務網址。原始加班申報沒有因此被修改。\n詳細訊息：'+message);
    const diagnostic=q('#mmDeploymentDiagnostic');
    if(diagnostic){
     try{
      const base=new URL(context.deploymentUrl?.()||'');
      if(base.protocol==='https:'&&base.hostname==='script.google.com'&&base.pathname.startsWith('/macros/s/')&&base.pathname.endsWith('/exec')){
       base.search='';base.searchParams.set('action','deploymentCheck');
       diagnostic.href=base.toString();diagnostic.hidden=false;
      }
     }catch(ignore){}
    }
   }else{
    feedback('error','雲端資料尚未讀取完成',message+'\n沒有修改任何加班申報資料。請確認網路與權限後，按「重新載入統計」再試。');
   }
   q('#mmPreview').innerHTML='<div class="mm-empty"><div class="mm-empty-icon" aria-hidden="true">!</div><strong>本次沒有產生統計表</strong><span>上方保留詳細原因，核對後可重新讀取。</span></div>';
  }finally{lock(false)}
 };
 q('#mmPrint').onclick=()=>{if(busy||!loaded||!context.canExport())return;const popup=g.open('','_blank');if(!popup)return status('請允許開啟列印視窗');popup.document.write('<!doctype html><html lang="zh-Hant"><meta charset="UTF-8"><title>加班時數統計表</title><style>'+css+'</style><body>'+html(loaded,q('#mmHide').checked,q('#mmPreparer').value,names)+'</body></html>');popup.document.close();popup.focus();popup.print();};
 q('#mmExcel').onclick=()=>{if(busy||!loaded||!context.canExport())return;try{const data=excel(loaded,q('#mmHide').checked,q('#mmPreparer').value,names),url=URL.createObjectURL(new Blob([data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');link.href=url;link.download='加班時數統計表_'+loaded.month+(loaded.planned?'_預排':'')+'.xlsx';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status('試算表 已產生，請查看瀏覽器下載項目。');}catch(e){status('匯出失敗：'+e.message);}};
 q('#mmLoad').onclick();
}
g.P79OvertimeMonthlyMatrix={open,build,html,screen,excel,leaveCode,jobGroup};
})(window);

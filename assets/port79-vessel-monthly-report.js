/* Styled monthly vessel report. ExcelJS is loaded only when an export is requested. */
(function(root){
'use strict';
const DEFAULT_COMPANY='亞安顧問管理',COMPANY_KEY='port79_vessel_monthly_company_v1',SIGNATURE_KEY='port79_vessel_monthly_signature_labels_v1',PAGE_SIZE=45,PRINT_ROWS_PER_PAGE=55;
const DEFAULT_SIGNATURES=['證明：','協理：','經理：','製表：'];
function signatureLabels(values){
 return DEFAULT_SIGNATURES.map((fallback,i)=>{
  if(!Array.isArray(values)||values[i]===undefined||values[i]===null)return fallback;
  return String(values[i]).replace(/[\r\n\t\x00-\x1f]/g,' ').trim().slice(0,40)||fallback;
 });
}
function savedSignatures(){
 try{const saved=JSON.parse(root.localStorage.getItem(SIGNATURE_KEY)||'null');return signatureLabels(saved);}catch(_){return signatureLabels();}
}
function saveSignatures(values){
 const names=signatureLabels(values);
 try{root.localStorage.setItem(SIGNATURE_KEY,JSON.stringify(names));}catch(_){}
 return names;
}
function companyName(value){return String(value||'').trim().slice(0,80)||DEFAULT_COMPANY;}
function savedCompany(){try{return companyName(root.localStorage.getItem(COMPANY_KEY));}catch(_){return DEFAULT_COMPANY;}}
function saveCompany(value){const name=companyName(value);try{root.localStorage.setItem(COMPANY_KEY,name);}catch(_){}return name;}
let loading=null;
function ensureExcelJS(){
 if(root.ExcelJS)return Promise.resolve(root.ExcelJS);
 if(loading)return loading;
 loading=(async()=>{
  for(const url of ['https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js','https://unpkg.com/exceljs@4.4.0/dist/exceljs.min.js']){
   try{
    await new Promise((resolve,reject)=>{
     const script=root.document.createElement('script');let done=false;
     const finish=error=>{if(done)return;done=true;clearTimeout(timer);script.onload=script.onerror=null;if(error){script.remove();reject(error);}else resolve();};
     const timer=setTimeout(()=>finish(Error('試算表 排版元件載入逾時')),20000);
     script.src=url;script.onload=()=>finish(root.ExcelJS?null:Error('試算表 排版元件未載入'));script.onerror=()=>finish(Error('試算表 排版元件載入失敗'));
     root.document.head.appendChild(script);
    });
    return root.ExcelJS;
   }catch(error){if(root.ExcelJS)return root.ExcelJS;}
  }
  throw Error('試算表 排版元件無法載入，請稍後再試');
 })().catch(error=>{loading=null;throw error;});
 return loading;
}
function createWorkbook(ExcelJS,{month,company,rows,signatures}={}){
 const match=/^(20\d{2})-(0[1-9]|1[0-2])$/.exec(String(month||''));
 if(!match)throw Error('請選擇正確的匯出月份');
 if(!Array.isArray(rows)||!rows.length)throw Error('沒有可匯出的船舶資料');
 const wb=new ExcelJS.Workbook();wb.creator='79號碼頭';wb.calcProperties.fullCalcOnLoad=true;
 const sheet=wb.addWorksheet('船邊作業量表',{
  views:[{showGridLines:false}],
  pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:1,
   horizontalCentered:true,verticalCentered:false,
   margins:{left:0.25,right:0.25,top:0.25,bottom:0.25,header:0.1,footer:0.1}}
 });
 const widths=[5,7,7,8,9,9,9,10,9,8,12,12,15];
 sheet.columns=widths.map(width=>({width}));
 const signatureText=signatureLabels(signatures===undefined?savedSignatures():signatures);
 const title=companyName(company),report=`79W ${Number(match[1])-1911}年${Number(match[2])}月份船邊作業量表`;
 const thin={style:'thin',color:{argb:'FF64748B'}};
 const border={top:thin,left:thin,bottom:thin,right:thin};
 const baseFont={name:'Microsoft JhengHei',size:10,color:{argb:'FF111827'}};
 const totals=rows.reduce((t,x)=>t.map((v,i)=>v+Number([x.disc,x.load,x.bill,x.hc,x.shift][i]||0)),[0,0,0,0,0]);
 // Build only the rows actually needed. A fixed 35-row block unnecessarily made 36 ships print on two pages.
 const sections=[];
 let nextRow=1;
 for(let start=0;start<rows.length;start+=PAGE_SIZE){
  const chunk=rows.slice(start,start+PAGE_SIZE),first=nextRow;
  const subtotal=first+4+chunk.length,grand=subtotal+1,footer=grand+1,spacer=footer+1,signature=spacer+1,stamp=signature+1;
  sections.push({chunk,start,first,subtotal,grand,footer,spacer,signature,stamp});
  nextRow=stamp+1;
 }
 const pages=sections.length;
 sheet.pageSetup.fitToHeight=pages===1?1:0;
 for(let page=0;page<pages;page++){
  const {chunk,start,first,subtotal,grand,footer,spacer,signature,stamp}=sections[page];
  for(let r=first;r<=stamp;r++){
   const row=sheet.getRow(r);row.height=12;
   for(let col=1;col<=13;col++){
    const cell=row.getCell(col);
    cell.font={...baseFont};
    cell.alignment={horizontal:'center',vertical:'middle',shrinkToFit:true};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFFFF'}};
    if(r>=first+2&&r<=grand)cell.border=border;
   }
  }
  sheet.mergeCells(first,1,first,13);
  sheet.getCell(first,1).value=title;
  sheet.getCell(first,1).font={...baseFont,size:22,bold:true};
  sheet.getRow(first).height=32;
  sheet.mergeCells(first+1,1,first+1,13);
  sheet.getCell(first+1,1).value=report;
  sheet.getCell(first+1,1).font={...baseFont,size:13,bold:true};
  sheet.getRow(first+1).height=22;
  const headings=['編號','序號','日期','船名','航次','卸船櫃數','裝船櫃數','請款櫃數','翻艙蓋數','翻艙數','效率','','備註'];
  headings.forEach((v,i)=>sheet.getCell(first+2,i+1).value=v);
  for(let col=1;col<=10;col++)sheet.mergeCells(first+2,col,first+3,col);
  sheet.mergeCells(first+2,11,first+2,12);
  sheet.mergeCells(first+2,13,first+3,13);
  sheet.getCell(first+3,11).value='Productivity';
  sheet.getCell(first+3,12).value='(Include HC)';
  for(let r=first+2;r<=first+3;r++){
   sheet.getRow(r).height=19;
   sheet.getRow(r).eachCell(cell=>{cell.font={...baseFont,bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFFFF'}};});
  }
  for(let i=0;i<chunk.length;i++){
   const x=chunk[i],r=first+4+i;
   const date=/^20\d{2}-\d{2}-\d{2}$/.test(String(x.date||''))?new Date(`${x.date}T00:00:00Z`):String(x.date||'');
   const values=[start+i+1,String(x.serial||''),date,String(x.shipName||''),String(x.voyage||''),x.disc,x.load,x.bill,x.hc,x.shift,x.productivity,x.includeHC,''];
   values.forEach((v,col)=>sheet.getCell(r,col+1).value=v);
   sheet.getCell(r,3).numFmt='mm/dd';
   for(let col=6;col<=10;col++)sheet.getCell(r,col).numFmt='#,##0';
   for(let col=11;col<=12;col++)sheet.getCell(r,col).numFmt='0.00';
  }
  sheet.mergeCells(subtotal,1,subtotal,5);
  sheet.getCell(subtotal,1).value='本頁小計';
  sheet.mergeCells(grand,1,grand,5);
  sheet.getCell(grand,1).value='本月合計';
  for(let col=6;col<=10;col++){
   const letter=String.fromCharCode(64+col);
   const sum=chunk.reduce((v,x)=>v+Number([x.disc,x.load,x.bill,x.hc,x.shift][col-6]||0),0);
   const from=first+4,to=subtotal-1;
   sheet.getCell(subtotal,col).value={formula:`SUM(${letter}${from}:${letter}${to})`,result:sum};
   sheet.getCell(grand,col).value={formula:sections.map(p=>`${letter}${p.subtotal}`).join('+'),result:totals[col-6]};
   sheet.getCell(subtotal,col).numFmt=sheet.getCell(grand,col).numFmt='#,##0';
  }
  for(const r of [subtotal,grand]){
   sheet.getRow(r).height=19;
   sheet.getRow(r).eachCell(cell=>{cell.font={...baseFont,bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFFFF'}};});
  }
  sheet.mergeCells(footer,1,footer,13);
  sheet.getCell(footer,1).value=`第 ${page+1} 頁／共 ${pages} 頁`;
  sheet.getRow(footer).height=18;
  sheet.getRow(spacer).height=8;
  // Four visible, editable signature headings, plus a reserved blank area for stamps.
  const ranges=[[1,3],[4,6],[7,9],[10,13]];
  ranges.forEach(([left,right],i)=>{
   sheet.mergeCells(signature,left,signature,right);
   sheet.mergeCells(stamp,left,stamp,right);
   const cell=sheet.getCell(signature,left);
   cell.value=signatureText[i];
   cell.font={...baseFont,size:11,bold:true};
   cell.alignment={horizontal:'center',vertical:'middle',shrinkToFit:true};
   cell.border={top:thin,left:thin,right:thin};
   const blank=sheet.getCell(stamp,left);
   blank.value='';
   blank.border={bottom:thin,left:thin,right:thin};
  });
  sheet.getRow(signature).height=22;
  sheet.getRow(stamp).height=26;
  if(page<pages-1)sheet.getRow(stamp).addPageBreak();
 }
 sheet.pageSetup.printArea=`A1:M${sections[pages-1].stamp}`;
 return wb;
}
async function download(options){
 const ExcelJS=await ensureExcelJS(),wb=createWorkbook(ExcelJS,options),buffer=await wb.xlsx.writeBuffer();
 const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=root.URL.createObjectURL(blob),link=root.document.createElement('a');
 link.href=url;link.download=options.filename;root.document.body.appendChild(link);link.click();link.remove();setTimeout(()=>root.URL.revokeObjectURL(url),1000);
}
const api={companyName,savedCompany,saveCompany,signatureLabels,savedSignatures,saveSignatures,createWorkbook,download,PAGE_SIZE,PRINT_ROWS_PER_PAGE};
if(typeof module==='object'&&module.exports)module.exports=api;else root.P79VesselMonthlyReport=api;
})(typeof window!=='undefined'?window:globalThis);

/* Read-only collapse of truly duplicate imported vessel edit copies.
   A -1/-2 suffix by itself is not evidence of a duplicate: independently
   worked jobs under the same parent number must remain separate. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.P79VesselVersionView=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const txt=v=>String(v??'').trim().replace(/\s+/g,' ').toUpperCase();
 const no=v=>String(v??'').trim().toUpperCase();
 const rootNo=v=>no(v).replace(/-(?:CALL)?\d+$/,'');
 const dateOf=r=>String(r?.compareDate||r?.lastDate||r?._cloudLastDate||r?.firstDate||r?.date||'').slice(0,10);
 const number=v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
 const quantity=r=>({
  containers:number(r?.totalContainers??r?.sheetTotalContainers),
  moves:number(r?.totalMoves??r?.sheetTotalMoves),
  hatches:number(r?.hatches??r?.sheetHatches),
  shifts:number(r?.shiftMoves??r?.sheetShiftMoves)
 });
 const importedAt=r=>Date.parse(String(r?.workingSheetImportedAt||r?.workingSheetSource?.importedAt||r?.importedAt||''))||0;
 function callNumber(r){
  const file=String(r?.sourceFileName||r?.workingSheetSource?.sourceFileName||'');
  const match=file.match(/第\s*([一二三四五六七八九十0-9]+)\s*靠/);
  if(match){const n=Number(match[1])||({'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10})[match[1]];if(n)return n;}
  return Number(no(r?.workingNo).match(/-CALL(\d+)$/)?.[1])||1;
 }
 function identity(r){
  const workingNo=no(r?.workingNo);
  if(!/^\d+(?:-(?:CALL)?\d+)?$/.test(workingNo))return '';
  const date=dateOf(r),vessel=txt(r?.vessel||r?.vesselName||r?.shipName);
  const voyage=txt([r?.voyageI,r?.voyageE||r?.voyage].filter(Boolean).join('/'));
  const q=quantity(r);
  // Missing dates, unnamed vessels, and incomplete totals cannot prove copies.
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!vessel||
    q.containers===null||q.moves===null||q.hatches===null||q.shifts===null)return '';
  // A timestamped import with a complete voyage identifies a revised job
  // independently of corrected quantities. Untimed legacy rows retain the
  // conservative quantity key so unknown history is never discarded.
  const revision=importedAt(r)&&voyage;
  return JSON.stringify([rootNo(workingNo),callNumber(r),date,vessel,voyage,txt(r?.wharf),
    ...(revision?['import-revision']:[q.containers,q.moves,q.hatches,q.shifts])]);
 }
 function choose(a,b){
  const at=importedAt(a),bt=importedAt(b);
  if(at!==bt&&at&&bt)return at>bt?a:b;
  const ac=a?.workingSheetSource?.reportRecordIds?.length||0;
  const bc=b?.workingSheetSource?.reportRecordIds?.length||0;
  if(ac!==bc)return ac>bc?a:b;
  // For equally complete imports, retain the unsuffixed canonical job when
  // present. For two suffixed copies use the last revision.
  const as=/-\d+$/.test(no(a?.workingNo)),bs=/-\d+$/.test(no(b?.workingNo));
  if(as!==bs)return as?b:a;
  const ai=Number(no(a?.workingNo).match(/-(\d+)$/)?.[1]||0);
  const bi=Number(no(b?.workingNo).match(/-(\d+)$/)?.[1]||0);
  return bi>ai?b:a;
 }
 function collapse(rows){
  const kept=[],byIdentity=new Map(),excluded=[];
  for(const r of rows||[]){
   const key=identity(r);
   if(!key||!byIdentity.has(key)){
    kept.push(r);
    if(key)byIdentity.set(key,kept.length-1);
    continue;
   }
   const idx=byIdentity.get(key),prior=kept[idx];
   if(no(prior.workingNo)===no(r.workingNo)){
    // Same number is already merged upstream. This function only handles
    // distinct copied version numbers, not repeated source objects.
    kept.push(r);
    continue;
   }
   const winner=choose(prior,r),loser=winner===prior?r:prior;
   kept[idx]=winner;
   excluded.push(no(loser.workingNo));
  }
  return {rows:kept,excludedWorkingNos:[...new Set(excluded)]};
 }
 return {collapse,identity,rootNo,callNumber};
});

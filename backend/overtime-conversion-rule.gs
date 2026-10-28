// Apply to the selected CLOUD rule before duplicate detection and report planning.
// Explicit configured values, including zero, always win; never infer other categories.
function p79DirectResolvedRule_(row){
  var r=row.slice(),value=r[3];
  if(value===null||value===undefined||String(value).trim()===''){
    r[3]='';
    var time=function(x){return String(x==null?'':x).trim().replace(/:00$/,'').padStart(2,'0');};
    if(r[0]==='延'&&r[8]==='after'&&Number(r[2])===4&&
       time(r[4])==='08'&&time(r[5])==='16'&&time(r[6])==='16'&&time(r[7])==='20'&&
       /^(?:代|延)?(?:08-20|16-20)$/.test(String(r[1]||'').trim()))r[3]=6.02;
  }
  return r;
}
function p79DirectConversionReceipt_(saved,id,rule){
  var r=p79DirectResolvedRule_(rule),empty=function(v){return v===null||v===undefined||String(v).trim()==='';};
  if(!saved||saved.id!==id||saved.category!==r[0]||saved.code!==r[1]||Number(saved.declaredHours)!==Number(r[2]))return false;
  if(empty(saved.convertedHours)!==empty(r[3])||!empty(r[3])&&Number(saved.convertedHours)!==Number(r[3]))return false;
  return [4,5,6,7,8].every(function(i){return String(saved[['normalStart','normalEnd','overtimeStart','overtimeEnd','position'][i-4]]||'')===String(r[i]||'');});
}

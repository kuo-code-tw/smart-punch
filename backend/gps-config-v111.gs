// V111: GPS-only read and validated merge, no attendance/history bootstrap.
// Integration: doGet getGpsConfig requires userRequireToken_(getSpreadsheet_(true), params.token||params.gcToken||'').
// Return jsonOutput(p79GpsConfigOnly_()); catch and return ok:false.
// syncConfig_(data) delegates to p79GpsSaveConfig_(data) under the existing write lock.
// getSpreadsheet_ fast path includes syncConfig/saveConfig; preserve all other routes.
function p79GpsConfigOnly_() {
  var c=getSystemConfig_(), out={};
  ['locationName','lat','lng','radius','extraLocations'].forEach(function(k){if(Object.prototype.hasOwnProperty.call(c,k))out[k]=c[k];});
  return {ok:true,config:out,version:'GPS-V111'};
}
function p79GpsMergeConfig_(old,incoming) {
  if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))throw Error('缺少系統設定 config');
  var merged=Object.assign({},old,incoming);
  function numeric(v,label,min,max){if(v===null||v===undefined||String(v).trim()===''||!isFinite(Number(v))||Number(v)<min||Number(v)>max)throw Error(label+'無效');return Number(v);}
  if(Object.prototype.hasOwnProperty.call(incoming,'lat'))merged.lat=numeric(incoming.lat,'緯度',-90,90);
  if(Object.prototype.hasOwnProperty.call(incoming,'lng'))merged.lng=numeric(incoming.lng,'經度',-180,180);
  if(Object.prototype.hasOwnProperty.call(incoming,'radius'))merged.radius=numeric(incoming.radius,'允許半徑',Number.MIN_VALUE,10000000);
  if(Object.prototype.hasOwnProperty.call(incoming,'extraLocations')){
    var sites=incoming.extraLocations;
    if(!Array.isArray(sites)||sites.length>5)throw Error('額外 GPS 地點最多五筆');
    merged.extraLocations=sites.map(function(site){
      site=site||{};var name=String(site.name||'').trim();
      if(!name){if(site.lat!==null&&site.lat!==undefined&&String(site.lat).trim()!==''||site.lng!==null&&site.lng!==undefined&&String(site.lng).trim()!=='')throw Error('額外 GPS 地點缺少名稱');return {name:'',lat:null,lng:null,radius:100};}
      return {name:name,lat:numeric(site.lat,'額外地點緯度',-90,90),lng:numeric(site.lng,'額外地點經度',-180,180),radius:numeric(site.radius,'額外地點半徑',Number.MIN_VALUE,10000000)};
    });
  }
  return merged;
}
function p79GpsSaveConfig_(data) {
  var merged=p79GpsMergeConfig_(getSystemConfig_(),data&&data.config),serialized=JSON.stringify(merged);
  if(Utilities.newBlob(serialized).getBytes().length>8800)throw Error('系統設定超過雲端容量');
  var props=PropertiesService.getScriptProperties();props.setProperty(SYSTEM_CONFIG_PROPERTY,serialized);
  var saved=getSystemConfig_();
  if(JSON.stringify(saved)!==serialized)throw Error('定位設定寫入後讀回不一致');
  return {ok:true,message:'系統設定已同步至雲端',config:saved};
}

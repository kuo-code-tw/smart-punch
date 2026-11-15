// Cache only complete, successful snapshots under their exact data/auth revision.
// This avoids repeated full-year reads contending on the shared data lock.
function p79VesselSnapshotKey_(options) {
  var opts=options||{};
  var source=JSON.stringify([gcGetRevision_(),getEmployeeAuthRevision_(),String(opts.month||''),String(opts.year||''),String(opts.scope||'')]);
  return 'p79_vessel_snapshot_'+p79VesselSnapshotHash_(source);
}
function p79VesselSnapshotHash_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text)).replace(/=+$/,'');
}
function p79VesselSnapshotRead_(key) {
  try {
    var cache=CacheService.getScriptCache(),raw=cache.get(key);
    if(!raw)return null;
    var meta=JSON.parse(raw);
    if(!Number.isInteger(meta.parts)||meta.parts<1||meta.parts>12)return null;
    var keys=[];for(var i=0;i<meta.parts;i++)keys.push(key+'_'+meta.hash+'_'+i);
    var parts=cache.getAll(keys),packed='';
    for(var j=0;j<keys.length;j++){if(typeof parts[keys[j]]!=='string')return null;packed+=parts[keys[j]];}
    if(p79VesselSnapshotHash_(packed)!==meta.hash)return null;
    var result=JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(packed),'application/x-gzip','snapshot.json.gz')).getDataAsString('UTF-8'));
    if(result.ok!==true||String(result.revision)!==String(gcGetRevision_())||meta.authRevision!==getEmployeeAuthRevision_())return null;
    result.snapshotCached=true;
    return result;
  }catch(error){Logger.log('P79_SNAPSHOT_READ_ERROR: '+String(error.message||error));return null;}
}
function p79VesselSnapshotStore_(key,result) {
  try {
    if(!result||result.ok!==true||String(result.revision)!==String(gcGetRevision_()))return;
    var packed=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(result),'application/json')).getBytes());
    var count=Math.ceil(packed.length/80000);if(count<1||count>12)return;
    var cache=CacheService.getScriptCache(),hash=p79VesselSnapshotHash_(packed),parts={};
    for(var i=0;i<count;i++)parts[key+'_'+hash+'_'+i]=packed.slice(i*80000,(i+1)*80000);
    cache.putAll(parts,60);
    // Publish the manifest only after all immutable chunks have been written.
    cache.put(key,JSON.stringify({hash:hash,parts:count,authRevision:getEmployeeAuthRevision_()}),60);
  }catch(error){Logger.log('P79_SNAPSHOT_STORE_ERROR: '+String(error.message||error));}
}
// Editor-only read probe. Reports timings/counts, never records or credentials.
function p79ProbeVesselReadSnapshot() {
  var ss=getSpreadsheet_(true),start=Date.now();
  var first=gcGetDataSafe_(ss,{}),firstMs=Date.now()-start;
  if(!first||first.ok!==true){Logger.log(JSON.stringify({ok:false,error:first&&first.error,firstMs:firstMs}));return;}
  start=Date.now();var second=gcGetDataSafe_(ss,{}),secondMs=Date.now()-start;
  var same=second&&second.ok===true&&String(first.revision)===String(second.revision)&&
    JSON.stringify(first.records)===JSON.stringify(second.records)&&JSON.stringify(first.shipMasters)===JSON.stringify(second.shipMasters);
  Logger.log(JSON.stringify({ok:same,firstMs:firstMs,secondMs:secondMs,cacheHit:second.snapshotCached===true,records:(first.records||[]).length,ships:(first.shipMasters||[]).length}));
}

"""Build bilingual lookup from MOTC Maritime Port Bureau open monthly CSVs.
Only ship identities/names are redistributed; no movements or private PORT79 data.
"""
import csv, io, json, re, sys, urllib.request, hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'data-sources/vessel-name-sources.json').read_text())
cache=Path('/tmp/port79-official-vessels');cache.mkdir(exist_ok=True)
def read(src):
 p=cache/(src['month']+'.csv')
 if not p.exists():
  p.write_bytes(urllib.request.urlopen(src['url'],timeout=35).read())
 b=p.read_bytes()
 try:s=b.decode('utf-8-sig')
 except UnicodeDecodeError:s=b.decode('cp950',errors='replace')
 rows=list(csv.DictReader(io.StringIO(s)))
 if not rows or not {'英文名稱','中文名稱','IMO號'}.issubset(rows[0]):raise ValueError('Unexpected CSV schema '+src['month'])
 return src,rows
with ThreadPoolExecutor(max_workers=5) as pool:results=list(pool.map(read,manifest['sources']))
entries={};counts={}
for src,rows in results:
 counts[src['month']]=len(rows)
 for row in rows:
  en=row['英文名稱'].strip();cn=row['中文名稱'].strip();imo=re.sub(r'[^0-9]','',row['IMO號'])
  if '\ufffd' in en+cn:continue
  if not re.search(r'[\u3400-\u9fff]',cn) or cn in ['未提供','未知','無','無資料','待定']:continue
  if re.fullmatch(r'WAN\s*HAI\s*[A-Z0-9]+',en,re.I):cn=re.sub(r'輪$','',cn)
  key=re.sub('[^A-Z0-9]','',en.upper())
  if not key:continue
  entries.setdefault(key,set()).add((cn,imo))
for src,rows in results:
 src['sha256']=hashlib.sha256((cache/(src['month']+'.csv')).read_bytes()).hexdigest()
 src['rows']=len(rows)
(ROOT/'data-sources/vessel-name-sources.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
records={key:[list(pair) for pair in sorted(values)] for key,values in sorted(entries.items())}
meta={'provider':'交通部航港局','dataset':manifest['dataset'],'license':manifest['license'],'months':sorted(counts),'records':len(records),'sourceRows':sum(counts.values()),'generated':'2026-11-10','unambiguous':sum(len({x[0] for x in v})==1 and len({x[1] for x in v if x[1]})<=1 for v in records.values())}
runtime='''
function key(name){return String(name||'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function getChineseName(name,imo){
 var candidates=records[key(name)]||[];
 var id=String(imo||'').replace(/[^0-9]/g,'');
 if(id)candidates=candidates.filter(row=>row[1]===id);
 var names=[...new Set(candidates.map(row=>row[0]))];
 var identities=[...new Set(candidates.map(row=>row[1]).filter(Boolean))];
 return names.length===1&&(id||identities.length<=1)?names[0]:'';
}
g.P79VesselNameDirectory=Object.freeze({getChineseName:getChineseName,metadata:Object.freeze(metadata)});
})(typeof window!=='undefined'?window:globalThis);
'''
out='/* Public bilingual ship names from MOTC open data; see data-sources/vessel-name-sources.json. */\n(function(g){\n\'use strict\';\nconst metadata='+json.dumps(meta,ensure_ascii=False,separators=(',',':'))+';\nconst records='+json.dumps(records,ensure_ascii=False,separators=(',',':'))+';\n'+runtime
(ROOT/'assets/port79-vessel-name-directory.js').write_text(out)
print(json.dumps(meta,ensure_ascii=False))
for name in ['WANHAI271','WANHAI371','WANHAI315','WANHAI316']:print(name,records.get(name))

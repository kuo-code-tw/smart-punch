'use strict';
/* Stamp an immutable website version from the exact production Git commit.
 * No personal data; GitHub Pages displays this manifest and Windows ZIP uses
 * the same YYMMDD+five-decimal revision derived from the commit. */
const fs=require('node:fs');
const cp=require('node:child_process');
const path=require('node:path');
function version(commit,day){
 const sha=String(commit||'').trim().toLowerCase();
 const date=String(day||'').trim();
 if(!/^[a-f0-9]{40}$/.test(sha)||!/^20\d{2}-\d{2}-\d{2}$/.test(date))
  throw Error('Invalid immutable build commit/date');
 return 'V'+date.slice(2).replace(/-/g,'')+'.'+
  (Number.parseInt(sha.slice(0,8),16)%100000).toString().padStart(5,'0');
}
function create(destination='.'){
 const commit=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const date=cp.execFileSync('git',['log','-1','--format=%cs'],{encoding:'utf8'}).trim();
 const manifest={version:version(commit,date),commit,kind:'website'};
 const output=path.resolve(destination,'port79-version.json');
 // Stamp the exact same build into the homepage itself, not the repository source.
 const home=path.resolve(destination,'index.html');
 if(fs.existsSync(home)){
  const html=fs.readFileSync(home,'utf8');
  const marker='<meta name="port79-build" content="'+manifest.version+'|'+manifest.commit+'">';
  const placeholder='<meta name="port79-build" content="">';
  if(!html.includes(placeholder))throw Error('Homepage build identity placeholder missing');
  fs.writeFileSync(home,html.replace(placeholder,marker),'utf8');
 }
 fs.writeFileSync(output,JSON.stringify(manifest,null,2)+'\n','utf8');
 process.stdout.write('Published website '+manifest.version+' '+commit+'\n');
 return manifest;
}
if(require.main===module)create(process.argv[2]||'.');
module.exports={version,create};

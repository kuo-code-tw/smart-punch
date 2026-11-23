'use strict';
/* GitHub Pages release-source manifest for the Windows site updater.
 * Generated from the EXACT checked-out production commit, not GitHub API.
 * Contains only public program files and their Git blob SHA-1 hashes.
 */
const fs=require('node:fs');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const path=require('node:path');
const folders=new Set([
 'assets','attendance','schedule','leave','hr','work-hours','aqc-efficiency',
 'history-data','settings','gate-dashboard','gate-import','yard-dashboard',
 'data-cache','data-sources','previews'
]);
const extensions=new Set([
 '.html','.js','.css','.json','.webp','.png','.jpg','.jpeg','.gif',
 '.svg','.ico','.woff','.woff2','.ttf','.md'
]);
function allowed(file){
 if(typeof file!=='string'||file.includes('\\')||file.startsWith('/')||file.includes('//'))return false;
 const parts=file.split('/');
 if(parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.')))return false;
 if(parts.length===1)return file==='index.html'||file==='port79-attendance-core.js';
 return folders.has(parts[0])&&extensions.has(path.posix.extname(file));
}
function hash(contents){
 return crypto.createHash('sha1').update('blob '+contents.length+'\0').update(contents).digest('hex');
}
function create(destination='.'){
 const commit=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Invalid published commit');
 const siteVersion=JSON.parse(fs.readFileSync(path.resolve(destination,'port79-version.json'),'utf8'));
 if(siteVersion.commit!==commit)throw Error('Website source manifest does not match published version');
 const files=cp.execFileSync('git',['ls-files','-z']).toString('utf8')
  .split('\0').filter(allowed).sort().map(file=>{
   const data=fs.readFileSync(path.resolve(destination,file));
   return {path:file,sha:hash(data),type:'blob'};
  });
 if(!files.length||files.length>400||!files.some(e=>e.path==='index.html'))
  throw Error('Public source manifest entries are incomplete or too numerous');
 const output={commit,files};
 fs.writeFileSync(path.resolve(destination,'port79-site-files.json'),
  JSON.stringify(output)+'\n','utf8');
 process.stdout.write('Published API-independent site manifest '+commit+' / '+files.length+' files\n');
 return output;
}
if(require.main===module)create(process.argv[2]||'.');
module.exports={allowed,hash,create};

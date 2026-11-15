'use strict';
const fs=require('fs'),path=require('path');
function apply(source){
 if(source.includes('function p79CurrentCachedAdminSession_('))throw Error('Auth fast lane already installed');
 for(const [name,superOnly] of [['adminRequireToken_',false],['gcRequireSuperAdmin_',true]]){
  const anchor='function '+name+'(ss, token) {\n  const lock = LockService.getScriptLock();';
  if(source.split(anchor).length!==2)throw Error('Expected one original auth lock: '+name);
  source=source.replace(anchor,'function '+name+'(ss, token) {\n  const cached = p79CurrentCachedAdminSession_(token, '+superOnly+');\n  if (cached) return cached;\n  const lock = LockService.getScriptLock();');
 }
 return source+'\n'+fs.readFileSync(path.join(__dirname,'../backend/admin-auth-cache-fastlane.gs'),'utf8');
}
module.exports={apply};

'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {packager}=require('@electron/packager');
const {PUBLIC_DIRS,ROOT_FILES}=require('./app/site-server.cjs');
const root=path.resolve(__dirname,'..'),dist=path.join(__dirname,'dist');
const name='Port79Windows';
function copyPublicFiles(target){
 const copied=[];
 for(const name of [...ROOT_FILES,...PUBLIC_DIRS]){
  const from=path.join(root,name),to=path.join(target,name);
  if(!fs.existsSync(from))throw Error('原系統缺少必要路徑：'+name);
  fs.cpSync(from,to,{recursive:true,force:true});copied.push(name);
 }
 const local=path.join(target,'local-data');
 for(const p of ['BrowserProfile','backups','logs','updates'])fs.mkdirSync(path.join(local,p),{recursive:true});
 fs.writeFileSync(path.join(local,'README.txt'),'本機資料、備份及記錄專用。更新器不會覆蓋此資料夾。請勿將此資料夾放到公用網路分享空間。\r\n','utf8');
 fs.writeFileSync(path.join(target,'Windows使用說明.txt'),
 '79號碼頭 Windows 資料夾測試版\r\n\r\n'+
 '1. 請先將完整 ZIP 解壓縮到可寫入的資料夾（例如 D:\\79號碼頭）。不要只取出 EXE。\r\n'+
 '2. 雙擊 Port79Windows.exe 開啟，本機網站載入原系統 HTML、CSS、JS，依原帳號和雲端權限登入。\r\n'+
 '3. 登入後背景下載正式資料快取並顯示真實進度，無需等全部下載才進入系統。\r\n'+
 '4. 按右上角 X 將隱藏到系統匣；點右下角圖示可再開啟。從系統匣選擇「真正結束程式」才完全退出。\r\n'+
 '5. 程式更新只會下載與 GitHub main 內容完全匹配且已部署到正式網站的公開程式檔，下次啟動才套用；不修改 local-data。\r\n'+
 '6. 請勿認為「本機快取」是正式雲端資料的完整備份。離線時僅保證已快取資料可能可見；寫入、審核與上傳依正式系統及網路狀態。\r\n'+
 '7. 程式更新後請重新登入驗證資料。使用中任何儲存、匯入或備份應以雲端正式回覆為準。\r\n'+
 '8. 此版本還沒完成在您的實際 Windows 電腦上及正式帳號的端對端驗收。\r\n','utf8');
 return copied;
}
async function build(){
 fs.rmSync(dist,{recursive:true,force:true});
 const results=await packager({dir:__dirname,out:dist,name,platform:'win32',arch:'x64',electronVersion:'45.4.1',overwrite:true,asar:false,prune:true,ignore:[/^\/dist(\/|$)/,/^\/tests(\/|$)/]});
 if(results.length!==1)throw Error('預期只產出一個 Windows 資料夾');
 const folder=results[0];
 const copied=copyPublicFiles(folder);
 if(!fs.existsSync(path.join(folder,name+'.exe')))throw Error('Windows EXE 未建立');
 for(const p of copied)if(!fs.existsSync(path.join(folder,p)))throw Error('無法驗證相對應的原系統資料夾 '+p);
 console.log(JSON.stringify({folder,moduleFolders:copied.length,exe:name+'.exe',windows:true},null,2));
}
build().catch(e=>{console.error(e);process.exitCode=1});

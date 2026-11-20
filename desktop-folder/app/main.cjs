'use strict';
const {app,BrowserWindow,Menu,Tray,nativeImage,shell,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const {createServer,PORT,BASE}=require('./site-server.cjs');
const {checkStoredUpdates,prepareUpdates}=require('./update-site.cjs');
const {png}=require('./icon.cjs');
const ORIGIN='http://127.0.0.1:'+PORT,OFFICIAL='https://kuo-code-tw.github.io/smart-punch/';
const ROOT=app.isPackaged?path.dirname(process.execPath):path.resolve(__dirname,'../..');
const DATA=path.join(ROOT,'local-data');
let window=null,tray=null,server=null,quitting=false,updating=false,updateStatus='尚未檢查程式更新';
app.setAppUserModelId('tw.port79.cloud.windows');
fs.mkdirSync(path.join(DATA,'BrowserProfile'),{recursive:true});
app.setPath('userData',path.join(DATA,'BrowserProfile'));
if(!app.requestSingleInstanceLock()){app.quit();process.exit(0)}
app.on('second-instance',()=>{if(window){window.show();window.focus()}});
const START=ORIGIN+BASE;
function eventLog(line){try{const file=path.join(DATA,'logs','desktop.log');fs.mkdirSync(path.dirname(file),{recursive:true});fs.appendFileSync(file,new Date().toISOString()+' '+String(line).slice(0,300)+'\n')}catch{}}
function setStatus(value){updateStatus=value;eventLog(value);updateMenu()}
function updateMenu(){
 if(!tray)return;
 const menu=Menu.buildFromTemplate([
  {label:'開啟 79號碼頭系統',click(){window?.show();window?.focus()}},
  {label:'縮小到系統匣',click(){window?.hide()}},
  {type:'separator'},
  {label:'重新下載電腦資料（登入後）',click(){
   window?.show();window?.focus();
   window?.webContents.executeJavaScript("window.dispatchEvent(new Event('port79-desktop-force-sync'))").catch(()=>{});
  }},
  {label:'檢查原網站程式更新',enabled:!updating,click:()=>void checkUpdates()},
  {label:updateStatus,enabled:false},
  {label:'開啟本機資料夾',click:()=>shell.openPath(DATA)},
  {type:'separator'},
  {label:'真正結束程式',click(){quitting=true;app.quit()}}
 ]);
 tray.setContextMenu(menu);tray.setToolTip('79號碼頭雲端智慧系統｜'+updateStatus.slice(0,45));
}
async function checkUpdates(){
 if(updating)return;updating=true;setStatus('正在檢查網站程式更新');
 try{
  const r=await prepareUpdates(ROOT,DATA,ms=>setStatus(ms));
  setStatus(r.pending?(r.changed?'已下載 '+r.changed+' 個更新，重新啟動後套用':'更新已準備好，重新啟動後套用'):'程式檔案已是目前正式版');
 }catch(err){setStatus('檢查更新暫不可用，保留現有程式');eventLog('update error: '+err.message)}
 finally{updating=false;updateMenu()}
}
function load(){
 window=new BrowserWindow({
  width:1480,height:940,minWidth:1040,minHeight:690,show:false,backgroundColor:'#f3f7fc',autoHideMenuBar:true,
  icon:nativeImage.createFromBuffer(png()),
  webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false,allowRunningInsecureContent:false}
 });
 window.once('ready-to-show',()=>window.show());
 window.webContents.on('did-finish-load',()=>{
  const code=fs.readFileSync(path.join(__dirname,'progress.js'),'utf8');
  window.webContents.executeJavaScript(code).catch(error=>eventLog('progress UI unavailable: '+error.message));
 });
 window.webContents.on('will-navigate',(event,url)=>{
  if(url.startsWith(START))return;
  if(url.startsWith(OFFICIAL)){event.preventDefault();window.loadURL(START+url.slice(OFFICIAL.length));return}
  event.preventDefault();
  if(/^https:\/\//.test(url))shell.openExternal(url).catch(()=>{});
 });
 window.webContents.setWindowOpenHandler(({url})=>{
  if(url.startsWith(OFFICIAL)){window.loadURL(START+url.slice(OFFICIAL.length));return {action:'deny'}}
  if(/^https:\/\//.test(url))shell.openExternal(url).catch(()=>{});
  return {action:'deny'};
 });
 window.on('close',event=>{if(!quitting){event.preventDefault();window.hide();setStatus('視窗已隱藏，原網頁工作階段繼續執行')}});
 window.loadURL(START).catch(err=>{eventLog('window load: '+err.message);dialog.showErrorBox('系統開啟失敗',err.message)});
}
function nativeTray(){
 tray=new Tray(nativeImage.createFromBuffer(png()));
 tray.on('double-click',()=>{window?.show();window?.focus()});
 tray.on('click',()=>{window?.show();window?.focus()});
 updateMenu();
}
app.whenReady().then(async()=>{
 try{
  const r=checkStoredUpdates(ROOT,DATA);if(r.applied)setStatus('已套用 '+r.applied+' 個經過雲端校驗的程式檔案');
 }catch(err){eventLog('rollback / update error: '+err.message);dialog.showMessageBox({type:'warning',title:'程式更新校驗失敗',message:err.message})}
 server=createServer(ROOT,eventLog);
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(PORT,'127.0.0.1',resolve)})}
 catch(err){dialog.showErrorBox('無法啟動本機系統','本機連接埠 '+PORT+' 無法使用：'+err.message);app.quit();return}
 load();nativeTray();setTimeout(()=>void checkUpdates(),20000);
 const interval=setInterval(()=>{if(!updating)void checkUpdates()},30*60*1000);
 interval.unref?.();
}).catch(err=>{eventLog('fatal: '+err.message);app.quit()});
app.on('before-quit',()=>{quitting=true;try{server?.close()}catch{}});
app.on('window-all-closed',()=>{if(quitting)app.quit()});

using System;
using System.IO;
using System.Diagnostics;
using System.Drawing;
using System.Web.Script.Serialization;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;
using Microsoft.Web.WebView2.Core;

namespace Port79Lite {
 public sealed class MainForm : Form {
  private const string Host="port79assets.example";
  private const string LocalRoot="https://"+Host+"/smart-punch/";
  private const string OfficialRoot="https://kuo-code-tw.github.io/smart-punch/";
  private readonly string root=AppDomain.CurrentDomain.BaseDirectory;
  private readonly NotifyIcon tray;
  private readonly WebView2 web;
  private WebView2 cloudWorker;
  private bool cloudWorkerReady=false;
  private bool cloudWorkerJobActive=false;
  private CacheStatusPayload lastCacheStatus;
  private readonly ToolStripMenuItem checkUpdatesMenu;
  private readonly ToolStripMenuItem systemUpdateStatusMenu;
  private readonly ToolStripMenuItem cacheStatusMenu;
  private readonly Label cacheTitle;
  private readonly Label cacheDetail;
  private readonly Label cacheCount;
  private readonly ProgressBar cacheBar;
  private readonly Panel cachePanel;
  private readonly ToolTip cacheTooltip;
  private readonly System.Windows.Forms.Timer cacheDismissTimer;
  private bool exit=false;
  private bool updateBusy=false;
  // Only restart in the background when the user has not begun working.
  private bool userInteractedSinceLaunch=false;
  private bool initiated=false;
  private bool cacheInProgress=false;
  private bool probedImportFrames=false;
  private readonly string displayVersion;

  // The visible title confirms which Windows ZIP was actually extracted
  // and started. It cannot be spoofed by a stale browser download filename.
  private static string InstalledBundleVersion(string appRoot){
   try{
    var path=Path.Combine(appRoot,"site","smart-punch","版本資訊.txt");
    if(!File.Exists(path))return "";
    var text=File.ReadAllText(path);
    var marker="GitHub Commit: ";
    var i=text.IndexOf(marker,StringComparison.Ordinal);
    if(i<0)return "";
    var sha=text.Substring(i+marker.Length).Trim();
    if(sha.Length<40)return "";
    sha=sha.Substring(0,40);
    foreach(var c in sha)if(!Uri.IsHexDigit(c))return "";
    var revision=(Convert.ToUInt32(sha.Substring(0,8),16)%100000).ToString("D5");
    var human=System.Text.RegularExpressions.Regex.Match(text,
     @"(?m)^版本號:\s*(V\d{6}\.\d{5})\s*$");
    if(human.Success&&human.Groups[1].Value.EndsWith(revision,StringComparison.Ordinal))
     return human.Groups[1].Value;
    // Keep the complete Git SHA internal; avoid showing a mismatched version.
    return "";
   }catch{return "";}
  }
  // Clear only stale HTTP UI resources on a new ZIP, never cloud data.
  private async Task InvalidateStaleProgramHttpCache(bool siteChanged){
   var version=InstalledBundleVersion(root);
   var marker=Path.Combine(DataRoot,"updates","webview-program-http-cache-version.txt");
   if(!siteChanged&&version.Length>0&&File.Exists(marker)&&
      String.Equals(File.ReadAllText(marker).Trim(),version,StringComparison.OrdinalIgnoreCase))return;
   await web.CoreWebView2.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache);
   if(version.Length>0){
    Directory.CreateDirectory(Path.GetDirectoryName(marker));
    File.WriteAllText(marker,version);
   }
   Log("Cleared WebView2 HTTP DiskCache only; kept IndexedDB, login and local-data");
  }
  private void OpenCurrentProgramFolder(){
   try{Process.Start(new ProcessStartInfo("explorer.exe","\""+root+"\""){UseShellExecute=true});}catch{}
  }
  public MainForm(){
   displayVersion=InstalledBundleVersion(root);
   Text="79號碼頭雲端智慧系統｜"+(displayVersion.Length>0?displayVersion:"版本待驗證");
   WindowState=FormWindowState.Maximized;
   MinimumSize=new Size(980,640);
   StartPosition=FormStartPosition.CenterScreen;
   Icon=System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
   web=new WebView2{Dock=DockStyle.Fill};
   Controls.Add(web);
   // Tiny icon and slim progress at the upper-right; no full-width strip.
   cachePanel=new Panel {
    Width=222,Height=52,BackColor=Color.FromArgb(246,251,255),
    Padding=new Padding(6,4,6,4),BorderStyle=BorderStyle.FixedSingle,
    Anchor=AnchorStyles.Top|AnchorStyles.Right,Visible=false
   };
   var layout=new TableLayoutPanel { Dock=DockStyle.Fill,ColumnCount=3,RowCount=2,Margin=Padding.Empty };
   layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,66));
   layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,24));
   layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,10));
   layout.RowStyles.Add(new RowStyle(SizeType.Absolute,23));
   layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
   cacheTitle=new Label { Dock=DockStyle.Fill,Text="☁ 下載中",AutoEllipsis=true,
    Font=new Font("Microsoft JhengHei",8,FontStyle.Bold),ForeColor=Color.FromArgb(19,65,113),
    TextAlign=ContentAlignment.MiddleLeft };
   cacheCount=new Label { Dock=DockStyle.Fill,Text="0/7",AutoEllipsis=true,
    TextAlign=ContentAlignment.MiddleRight,Font=new Font("Microsoft JhengHei",8,FontStyle.Bold),
    ForeColor=Color.FromArgb(23,101,169) };
   cacheDetail=new Label { Visible=false,Text="資料下載進度" };
   cacheBar=new ProgressBar { Dock=DockStyle.Fill,Minimum=0,Maximum=7,Value=0,
    Style=ProgressBarStyle.Continuous,Margin=new Padding(3,2,3,2) };
   var dismiss=new Button { Text="×",Dock=DockStyle.Fill,FlatStyle=FlatStyle.Flat,
    TabStop=false,Margin=Padding.Empty,Font=new Font("Microsoft JhengHei",8),AccessibleName="隱藏下載進度" };
   dismiss.FlatAppearance.BorderSize=0;
   dismiss.Click+=(s,e)=>{cachePanel.Visible=false;cacheDismissTimer.Stop();};
   layout.Controls.Add(cacheTitle,0,0);
   layout.Controls.Add(cacheCount,1,0);
   layout.Controls.Add(dismiss,2,0);
   layout.Controls.Add(cacheBar,0,1);layout.SetColumnSpan(cacheBar,3);
   cachePanel.Controls.Add(layout);Controls.Add(cachePanel);
   cacheTooltip=new ToolTip { ShowAlways=true };
   cacheTooltip.SetToolTip(cachePanel,"本機資料下載進度");
   cacheTooltip.SetToolTip(cacheTitle,"本機資料下載進度");
   cachePanel.BringToFront();
   cacheDismissTimer=new System.Windows.Forms.Timer { Interval=6000 };
   cacheDismissTimer.Tick+=(s,e)=>{cacheDismissTimer.Stop();cachePanel.Visible=false;};
   SizeChanged+=(s,e)=>PositionCachePanel();
   PositionCachePanel();
   tray=new NotifyIcon{Icon=Icon ?? SystemIcons.Application,Visible=true,
    Text=SafeStatus("79號碼頭｜"+(displayVersion.Length>0?displayVersion:"版本待驗證"),60)};
   var menu=new ContextMenuStrip();
   menu.Items.Add("開啟系統",null,(s,e)=>ShowWindow());
   menu.Items.Add("縮小到系統匣",null,(s,e)=>Hide());
   menu.Items.Add(new ToolStripSeparator());
   // One update command. Updates both the Windows program and modified
   // website UI/code, preserving local-data; no user-managed ZIP download.
   checkUpdatesMenu=new ToolStripMenuItem("檢查並更新系統（程式及畫面）",null,async(s,e)=>await CheckUpdates(true)){
    ToolTipText="只更新正式發布後有變更的程式與畫面；Windows 主程式更新由系統內部處理。保留本機資料，不用自行下載 ZIP。"
   };
   menu.Items.Add(checkUpdatesMenu);
   var syncDataMenu=new ToolStripMenuItem("重新核對六項基本資料（歷史按月）",null,async(s,e)=>await ForceDownload()){
    ToolTipText="核對考勤、工時、請假、排班、效率、人資；歷史資料到歷史中心選月份讀取，本機快取保留。"
   };
   menu.Items.Add(syncDataMenu);
   systemUpdateStatusMenu=new ToolStripMenuItem("系統更新狀態：啟動後自動檢查"){Enabled=false};
   cacheStatusMenu=new ToolStripMenuItem("資料同步狀態：尚未登入"){Enabled=false};
   menu.Items.Add(systemUpdateStatusMenu);
   menu.Items.Add(cacheStatusMenu);
   menu.Items.Add(new ToolStripSeparator());
   menu.Items.Add("開啟本機資料夾",null,(s,e)=>OpenLocalData());
   menu.Items.Add("開啟目前程式資料夾",null,(s,e)=>OpenCurrentProgramFolder());
   menu.Items.Add(new ToolStripMenuItem("目前程式版本："+(displayVersion.Length>0?displayVersion:"版本待驗證")){
    Enabled=false,ToolTipText=root
   });
   menu.Items.Add("關閉程式",null,(s,e)=>ExitApp());
   tray.ContextMenuStrip=menu;
   tray.DoubleClick+=(s,e)=>ShowWindow();
   FormClosing+=(s,e)=>{if(!exit){e.Cancel=true;Hide();}};
   FormClosed+=(s,e)=>{cacheDismissTimer.Dispose();cacheTooltip.Dispose();tray.Visible=false;tray.Dispose();cloudWorker?.Dispose();web.Dispose();};
   Shown+=async(s,e)=>{
    // A successful update must put the actual Windows main window on screen,
    // not leave only a background process or a tray icon behind.
    ShowWindow();
    await Initialize();
   };
  }
  private void PositionCachePanel(){
   cachePanel.Location=new Point(Math.Max(8,ClientSize.Width-cachePanel.Width-12),8);
  }
  private void ShowWindow(){Show();WindowState=FormWindowState.Maximized;Activate();}
  private void ExitApp(){exit=true;tray.Visible=false;Close();}
  private string DataRoot=>Path.Combine(root,"local-data");
  private void OpenLocalData(){
   Directory.CreateDirectory(DataRoot);
   try{Process.Start(new ProcessStartInfo("explorer.exe","\""+DataRoot+"\""){UseShellExecute=true});}catch{}
  }
  private void Log(string message){
   try {var folder=Path.Combine(DataRoot,"logs");Directory.CreateDirectory(folder);File.AppendAllText(Path.Combine(folder,"windows-lite.log"),DateTime.Now.ToString("o")+" "+message+"\r\n");} catch {}
  }
  private async Task Initialize(){
   if(initiated)return;initiated=true;
   try {
    var site=Path.Combine(root,"site","smart-punch");
    if(!File.Exists(Path.Combine(site,"index.html")))throw new FileNotFoundException("找不到原網站 index.html。請保留整個 ZIP 資料夾。");
    Directory.CreateDirectory(Path.Combine(DataRoot,"BrowserProfile"));
    Directory.CreateDirectory(Path.Combine(DataRoot,"updates"));
    // Only apply staged patches created for THIS bundle, never old ZIPs.
    int appliedSiteFiles=0;
    try {
     appliedSiteFiles=Updater.ApplyIfVerified(site,DataRoot,Log);
     if(appliedSiteFiles>0)systemUpdateStatusMenu.Text="系統檔案：已套用 "+appliedSiteFiles+" 項新版";
    }catch(Exception error){
     Log("staged system update rejected, preserved existing site: "+error.Message);
     systemUpdateStatusMenu.Text="系統檔案：更新未完成，原檔保留";
    }
    var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(DataRoot,"BrowserProfile"));
    await web.EnsureCoreWebView2Async(env);
    // An old BrowserProfile may contain old HTML/CSS/JS even when the ZIP is
    // new. Preserve IndexedDB and login; clear only HTTP cache after upgrades.
    try{await InvalidateStaleProgramHttpCache(appliedSiteFiles>0);}
    catch(Exception error){
     Log("WebView2 program HTTP cache invalidation failed: "+error.Message);
     systemUpdateStatusMenu.Text="版本畫面快取更新未完成；資料保留，詳見更新紀錄";
    }
    web.CoreWebView2.SetVirtualHostNameToFolderMapping(Host,Path.Combine(root,"site"),CoreWebView2HostResourceAccessKind.DenyCors);
    web.CoreWebView2.Settings.IsWebMessageEnabled=true;
    web.CoreWebView2.WebMessageReceived+=OnCacheMessage;
    // The native updater may restart unattended only before any human input.
    await web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
     "(function(){var sent=false;function used(){if(sent)return;sent=true;"+
     "try{window.chrome.webview.postMessage('port79-user-interaction-v1')}catch(e){}}"+
     "['pointerdown','keydown','input','change'].forEach(function(name){"+
     "document.addEventListener(name,used,true)})})()");
    web.CoreWebView2.Settings.AreDevToolsEnabled=false;
    web.CoreWebView2.NewWindowRequested+=(s,e)=>{
     e.Handled=true;
     if(e.Uri.StartsWith(OfficialRoot,StringComparison.OrdinalIgnoreCase)){web.CoreWebView2.Navigate(LocalRoot+e.Uri.Substring(OfficialRoot.Length));return;}
     OpenSafeExternal(e.Uri);
    };
    web.CoreWebView2.NavigationStarting+=(s,e)=>{
     if(cloudWorkerJobActive){
      // This navigation only destroys the visible page, not the independent
      // cloud worker. Keep native progress visible while the user works.
      cachePanel.Visible=true;
      cachePanel.BringToFront();
     }else if(cacheInProgress){
      // Older in-page downloads cannot survive a page reload; do not claim
      // success when the legacy webpage was actually torn down.
      cacheInProgress=false;
      cacheTitle.Text="⏸ 舊式頁面下載已中斷";
      cacheDetail.Text="請使用新版背景雲端同步；已下載資料仍保留。";
      cacheBar.Style=ProgressBarStyle.Continuous;
      cachePanel.Visible=true;
      cacheDismissTimer.Stop();
      cacheStatusMenu.Text="資料同步狀態：舊式頁面下載中斷";
     }
     if(e.Uri.StartsWith(LocalRoot,StringComparison.OrdinalIgnoreCase)){
      var current=new Uri(e.Uri);
      if(current.AbsolutePath.EndsWith("/")){
       e.Cancel=true;
       var target=new UriBuilder(current){Path=current.AbsolutePath+"index.html"};
       web.CoreWebView2.Navigate(target.Uri.AbsoluteUri);
      }
      return;
     }
     e.Cancel=true;
     if(e.Uri.StartsWith(OfficialRoot,StringComparison.OrdinalIgnoreCase)){
      web.CoreWebView2.Navigate(LocalRoot+e.Uri.Substring(OfficialRoot.Length));return;
     }
     OpenSafeExternal(e.Uri);
    };
    web.CoreWebView2.NavigationCompleted+=async(s,e)=>{
     if(e.IsSuccess)Log("navigation success: "+web.Source);
     else Log("navigation failure: "+e.WebErrorStatus);
     if(e.IsSuccess&&web.Source?.AbsoluteUri.StartsWith(LocalRoot,StringComparison.OrdinalIgnoreCase)==true){
      try{
       // Before the injected automatic downloader runs, tell it this native
       // shell owns the separate navigation-safe WebView2 worker.
       await web.CoreWebView2.ExecuteScriptAsync("window.__port79NativeShellHasBackgroundWorker=true");
       var progress=Path.Combine(root,"app","login-progress.js");
       if(File.Exists(progress)) await web.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(progress));
      }catch(Exception x){Log("progress overlay: "+x.Message);}
      await AdvertiseCloudWorker();
      if(cloudWorkerJobActive&&lastCacheStatus!=null)await DisplayInlineCacheProgress(lastCacheStatus);
      if(!probedImportFrames&&Array.Exists(Environment.GetCommandLineArgs(),
       a=>a=="--port79-verify-import-frames")){
       probedImportFrames=true;await ProbeImportFrames();
      }
     }
    };
    // Fresh document URL, same virtual origin and same retained profile.
    var startupVersion=InstalledBundleVersion(root);
    web.CoreWebView2.Navigate(LocalRoot+"index.html?windowsBundle="+
     Uri.EscapeDataString(startupVersion.Length>0?startupVersion:"legacy"));
    // The second WebView2 stays at its own fixed same-origin worker URL.
    // Navigating the visible WebView cannot terminate its fetch or IndexedDB.
    _=InitializeCloudWorker(env);
    // Check immediately on startup, not only after the first ten-minute timer tick.
    // Read-only public program files are verified and staged; active pages are
    // never replaced in-place, so unsaved form edits cannot be interrupted.
    _=CheckUpdates(false);
    // Periodically check for subsequent public site revisions while running.
    var tick=new Timer{Interval=300000};
    tick.Tick+=async(s,e)=>await CheckUpdates();
    tick.Start();
   }catch(Exception ex){
    Log("startup: "+ex);
    MessageBox.Show("無法開啟本機系統。Windows 需要 WebView2 Runtime，並且整個程式資料夾必須完整。\n"+ex.Message,
      "79號碼頭 Windows 版",MessageBoxButtons.OK,MessageBoxIcon.Error);
   }
  }
  private async Task InitializeCloudWorker(CoreWebView2Environment env){
   try{
    var file=Path.Combine(root,"site","smart-punch","assets","port79-cache-worker.html");
    if(!File.Exists(file))throw new FileNotFoundException("背景雲端下載頁缺少，請執行正式系統更新");
    // Keep a live separate browser document, offscreen; Visible=false can
    // suspend initialization on some WebView2 runtime versions.
    cloudWorker=new WebView2 {Location=new Point(-100,-100),Size=new Size(1,1),
     TabStop=false,Visible=true};
    Controls.Add(cloudWorker);
    cloudWorker.SendToBack();
    await cloudWorker.EnsureCoreWebView2Async(env);
    cloudWorker.CoreWebView2.SetVirtualHostNameToFolderMapping(Host,Path.Combine(root,"site"),
     CoreWebView2HostResourceAccessKind.DenyCors);
    cloudWorker.CoreWebView2.Settings.IsWebMessageEnabled=true;
    cloudWorker.CoreWebView2.Settings.AreDevToolsEnabled=false;
    cloudWorker.CoreWebView2.WebMessageReceived+=OnCacheMessage;
    cloudWorker.CoreWebView2.ProcessFailed+=(sender,args)=>{
     cloudWorkerReady=false;
     if(cloudWorkerJobActive){
      cloudWorkerJobActive=false;
      UpdateCacheStatus(new CacheStatusPayload {kind="port79-cache-status-v1",
       phase="interrupted",title="背景同步中斷",
       detail="Windows 背景下載器已停止；已完成快取保留，可重新下載",
       completed=lastCacheStatus?.completed??0,total=7});
     }
     Log("background cache WebView process failed");
    };
    cloudWorker.CoreWebView2.Navigate(LocalRoot+"assets/port79-cache-worker.html");
   }catch(Exception error){
    cloudWorkerReady=false;
    Log("background sync init: "+error.Message);
   }
  }
  private async Task AdvertiseCloudWorker(){
   if(!cloudWorkerReady||web.CoreWebView2==null)return;
   try{await web.CoreWebView2.ExecuteScriptAsync("window.__port79NativeCloudWorkerReady=true");}
   catch(Exception e){Log("cloud worker capability not delivered: "+e.Message);}
  }
  private const string CaptureCloudSessionScript=@"(function(){
   const storage={};
   const permitted=/^(?:port79_[A-Za-z0-9_-]+|aqc_[A-Za-z0-9_-]+|admin_session|gasUrl|GAS_URL)$/;
   try{
    for(let i=0;i<sessionStorage.length&&i<200;i++){
     const key=sessionStorage.key(i);
     if(permitted.test(key)){const val=sessionStorage.getItem(key);if(typeof val==='string'&&val.length<40000)storage[key]=val;}
    }
   }catch(e){return null}
   let token=storage.port79_user_token||storage.port79_admin_token||storage.port79_gc_superadmin_token||'';
   let gas=storage.port79_gas_url||storage.gasUrl||storage.GAS_URL||'';
   try{token=window.P79ManagementContext?.token?.()||token}catch(e){}
   try{gas=window.P79ManagementContext?.gas?.()||window.GAS_URL||gas}catch(e){}
   return {storage,token:String(token||''),gas:String(gas||'')};
  })()";
  // Windows CI-only read-only probe: actually load all three importer iframes
  // from the native virtual host and verify their contentWindow is same-origin.
  // No Excel file is supplied and no cloud data is written.
  private async Task ProbeImportFrames(){
   const string code=@"(async function(){
    const modules=['gate-import','yard-dashboard','aqc-efficiency'];
    for(const moduleName of modules){
     const frame=document.createElement('iframe');
     frame.style.display='none';
     const expected=new URL('./'+moduleName+'/index.html?embed=1&homeImport=1',location.href);
     let timer;
     const result=await new Promise(resolve=>{
      let done=false;
      const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value)};
      frame.onload=()=>{
       try{
        const child=frame.contentWindow;
        const locationCheck=new URL(child.location.href);
        if(locationCheck.origin!==location.origin||locationCheck.pathname!==expected.pathname)
         return finish('ORIGIN MISMATCH '+moduleName+' '+locationCheck.origin);
        if(!frame.contentDocument)return finish('NO CHILD DOM '+moduleName);
        finish('OK '+moduleName);
       }catch(error){finish('CROSS-ORIGIN '+moduleName+' '+String(error.message||error))}
      };
      frame.onerror=()=>finish('FAILED TO LOAD '+moduleName);
      timer=setTimeout(()=>finish('TIMEOUT '+moduleName),45000);
      frame.src=expected.href;document.body.appendChild(frame);
     });
     frame.remove();
     if(!result.startsWith('OK '))return 'FAIL '+result;
    }
    return 'PASS imported frames gate, yard, vessel are same-origin';
   })().then(result=>window.chrome.webview.postMessage(JSON.stringify({
     kind:'port79-import-probe-v1',title:result
    }))).catch(error=>window.chrome.webview.postMessage(JSON.stringify({
     kind:'port79-import-probe-v1',title:'FAIL '+String(error&&error.message||error)
    })))";
   try{
    await web.CoreWebView2.ExecuteScriptAsync(code);
    Log("IMPORT FRAME CHECK: asynchronous probe started");
   }catch(Exception ex){Log("IMPORT FRAME CHECK: FAIL "+ex.Message);}
  }
  // Ignore any progress message not sent by our original locally hosted webpage.
  // It carries status text/counters only; never accepts tokens, credentials, URLs or commands.
  private void OnCacheMessage(object sender,CoreWebView2WebMessageReceivedEventArgs args){
   try {
    if(!Uri.TryCreate(args.Source,UriKind.Absolute,out var source)||
      !source.Host.Equals(Host,StringComparison.OrdinalIgnoreCase)||
      !source.AbsolutePath.StartsWith("/smart-punch/",StringComparison.OrdinalIgnoreCase))return;
    var raw=args.TryGetWebMessageAsString();
    if(raw==null||raw.Length>1600)return;
    if(raw=="port79-user-interaction-v1"&&sender==web.CoreWebView2){
     userInteractedSinceLaunch=true;
     return;
    }
    var payload=new JavaScriptSerializer().Deserialize<CacheStatusPayload>(raw);
    if(payload==null)return;
    if(payload.kind=="port79-import-probe-v1"){
     Log("IMPORT FRAME CHECK: "+SafeStatus(payload.title,320));return;
    }
    if(payload.kind=="port79-background-worker-ready-v1"){
     // Only the fixed local worker page can announce readiness.
     if(source.AbsolutePath.Equals("/smart-punch/assets/port79-cache-worker.html",
       StringComparison.OrdinalIgnoreCase)){
      cloudWorkerReady=true;
      Log("background worker ready");
      _=AdvertiseCloudWorker();
     }
     return;
    }
    if(payload.kind=="port79-cache-command-v1"){
     // A manager clicking the existing cloud-download button may start
     // background sync from any locally hosted application page.
     if(sender==web.CoreWebView2){
      if(payload.action=="download-all")_=ForceDownload();
      else if(payload.action=="download-resume")_=ForceDownload(true);
     }
     return;
    }
    if(payload.kind!="port79-cache-status-v1")return;
    // A newly navigated management page may emit "idle" or "waiting";
    // it must not erase the actual background download progress.
    if(cloudWorkerJobActive&&sender==web.CoreWebView2)return;
    if(sender==cloudWorker?.CoreWebView2&&
      (payload.phase=="complete"||payload.phase=="partial"||
       payload.phase=="failed"||payload.phase=="interrupted"))
     cloudWorkerJobActive=false;
    UpdateCacheStatus(payload);
    // An optional history catalog timeout must not strand a verified Windows
    // update behind an apparently perpetual cloud download. Retry applying
    // staged code only after background sync finishes and before human edits.
    if(sender==cloudWorker?.CoreWebView2&&!cloudWorkerJobActive&&
       !userInteractedSinceLaunch&&!updateBusy&&
       (payload.phase=="complete"||payload.phase=="partial"||payload.phase=="failed"))
     _=CheckUpdates(false);
    // UI-only relay for the compact homepage indicator beside History status.
    // Do not read or change employee records, credentials or download behavior.
    _=DisplayInlineCacheProgress(payload);
   }catch(Exception error){Log("native cache status rejected: "+error.Message);}
  }
  private async Task DisplayInlineCacheProgress(CacheStatusPayload data){
   if(web.CoreWebView2==null)return;
   try{
    var item=new {
     phase=SafeStatus(data.phase,32),
     title=SafeStatus(data.title,90),
     detail=SafeStatus(data.detail,170),
     completed=Math.Max(0,Math.Min(7,data.completed)),
     total=Math.Max(1,Math.Min(7,data.total)),
     monthCompleted=Math.Max(0,Math.Min(240,data.monthCompleted)),
     monthTotal=Math.Max(0,Math.Min(240,data.monthTotal))
    };
    var encoded=new JavaScriptSerializer().Serialize(item);
    var javascript="(function(){"+
     "if(!document.getElementById('p79HomeDownloadProgress'))return false;"+
     "window.dispatchEvent(new CustomEvent('port79-desktop-progress',{detail:"+encoded+"}));"+
     "return true;})()";
    var rendered=await web.CoreWebView2.ExecuteScriptAsync(javascript);
    // If the homepage has the inline status, do not overlay a second
    // native download card at the top-right. Other pages keep the native one.
    if(String.Equals(rendered,"true",StringComparison.OrdinalIgnoreCase))
     cachePanel.Visible=false;
   }catch(Exception e){Log("inline download progress unavailable; native fallback kept: "+e.Message);}
  }
  private sealed class CacheStatusPayload{
   public string kind {get;set;}
   public string action {get;set;}
   public string phase {get;set;}
   public string title {get;set;}
   public string detail {get;set;}
   public int completed {get;set;}
   public int total {get;set;}
   public int monthCompleted {get;set;}
   public int monthTotal {get;set;}
  }
  private static string SafeStatus(string value,int limit=120){
   var text=String.IsNullOrEmpty(value)?"":value.Replace("\r"," ").Replace("\n"," ").Replace("\t"," ");
   return text.Length>limit?text.Substring(0,limit):text;
  }
  private void UpdateCacheStatus(CacheStatusPayload value){
   lastCacheStatus=value;
   var phase=value.phase??"";
   if(phase!="idle"&&phase!="waiting"&&phase!="downloading"&&phase!="stalled"&&phase!="interrupted"&&phase!="complete"&&phase!="partial"&&phase!="failed"&&phase!="cached")return;
   int total=phase=="idle"?6:Math.Max(1,Math.Min(7,value.total));
   int completed=Math.Max(0,Math.Min(total,value.completed));
   cacheTitle.Text="☁ "+SafeStatus(value.title,90);
   cacheDetail.Text=SafeStatus(value.detail,180);
   cacheTooltip.SetToolTip(cachePanel,cacheDetail.Text);
   cacheTooltip.SetToolTip(cacheTitle,cacheDetail.Text);
   cacheTitle.Text=phase=="complete"?"✓ 已完成":phase=="partial"||phase=="failed"?"⚠ 未完成":phase=="interrupted"?"⏸ 已中斷":"☁ 下載中";
   cacheInProgress=phase=="downloading"||phase=="stalled";
   cacheDismissTimer.Stop();
   cachePanel.Visible=phase=="downloading"||phase=="stalled"||phase=="complete"||
                      phase=="partial"||phase=="failed"||phase=="interrupted";
   if(phase=="complete")cacheDismissTimer.Start();
   int monthTotal=Math.Max(0,Math.Min(240,value.monthTotal));
   int monthCompleted=Math.Max(0,Math.Min(monthTotal,value.monthCompleted));
   bool showMonths=cacheInProgress&&monthTotal>0;
   cacheCount.Text=showMonths?monthCompleted+" / "+monthTotal+" 月｜系統 "+completed+"/"+total:completed+" / "+total+" 個系統";
   // Numeric month bar is real completed months, not an estimate. For a long
   // waiting request with no completion progress, revert to animated waiting.
   bool animate=cacheInProgress&&(!showMonths||phase=="stalled");
   cacheBar.Style=animate?ProgressBarStyle.Marquee:ProgressBarStyle.Continuous;
   cacheBar.Maximum=showMonths?monthTotal:total;
   if(!animate){
    if(showMonths)cacheBar.Value=monthCompleted;
    else cacheBar.Value=completed;
   }
   cacheBar.MarqueeAnimationSpeed=animate?25:0;
   cacheStatusMenu.Text=SafeStatus("資料同步："+(String.IsNullOrEmpty(value.detail)?value.title:value.detail),58);
   // Windows notify icons have a limited tooltip length.
   tray.Text=SafeStatus("79號碼頭｜"+(displayVersion.Length>0?displayVersion:"版本待驗證")+"｜"+
    (showMonths?monthCompleted+"/"+monthTotal+"月":"同步"+completed+"/"+total),60);
   if(phase=="complete"||phase=="partial"||phase=="failed"||phase=="interrupted")Log("download "+phase+" "+completed+"/"+total+" "+SafeStatus(value.detail,120));
  }
  private static void OpenSafeExternal(string address){
   if(!Uri.TryCreate(address,UriKind.Absolute,out var u)||u.Scheme!="https")return;
   try{Process.Start(new ProcessStartInfo(u.AbsoluteUri){UseShellExecute=true});}catch{}
  }
  private async Task ForceDownload(bool resumeOnly=false){
   ShowWindow();
   if(cloudWorkerJobActive){
    cachePanel.Visible=true;cachePanel.BringToFront();
    cacheStatusMenu.Text="資料同步狀態：背景下載仍在進行";
    return;
   }
   try{
    if(!cloudWorkerReady||cloudWorker?.CoreWebView2==null)
     throw new InvalidOperationException("背景雲端下載器尚未啟動，請先執行正式系統更新");
    if(web.CoreWebView2==null||web.Source?.AbsoluteUri.StartsWith(LocalRoot,StringComparison.OrdinalIgnoreCase)!=true)
     throw new InvalidOperationException("請先在 79號碼頭管理系統登入後同步雲端資料");
    // Fetch session only from the current trusted local site; credentials
    // stay in the same local WebView2 browser profile and are never logged,
    // sent to a remote updater or written to the Windows release ZIP.
    string current=await web.CoreWebView2.ExecuteScriptAsync(CaptureCloudSessionScript);
    if(String.IsNullOrWhiteSpace(current)||current=="null")
     throw new InvalidOperationException("找不到管理員登入狀態，請重新登入");
    // Pass only a local mode flag; no credential or employee payload is logged.
    // Manager-triggered "重新同步資料" stays a cloud refresh, whereas
    // automatic login resumes already verified browser-profile snapshots.
    var payload=new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(current);
    if(payload==null)throw new InvalidOperationException("無法解析登入狀態");
    payload["resumeOnly"]=resumeOnly;
    var verifiedSession=new JavaScriptSerializer().Serialize(payload);
    cloudWorkerJobActive=true;
    string started=await cloudWorker.CoreWebView2.ExecuteScriptAsync(
     "window.port79StartCloudSync("+verifiedSession+")");
    if(!String.Equals(started,"true",StringComparison.OrdinalIgnoreCase))
     throw new InvalidOperationException("背景同步未能開始：請確認管理員權限、登入 Token 及雲端網址");
    UpdateCacheStatus(new CacheStatusPayload{
     kind="port79-cache-status-v1",phase="downloading",title="背景雲端同步",
     detail=resumeOnly?"正在恢復六項基本資料本機快取；歷史月份按需讀取":"重新核對六項基本資料；歷史資料按需讀取，原快取保留",
     completed=0,total=6
    });
   }catch(Exception error){
    cloudWorkerJobActive=false;
    Log("background cloud sync could not start: "+error.Message);
    UpdateCacheStatus(new CacheStatusPayload{
     kind="port79-cache-status-v1",phase="failed",
     title="背景雲端同步未啟動",detail=error.Message,completed=0,total=7
    });
   }
  }

  private async Task CheckUpdates(bool manual=false){
   if(updateBusy)return;
   updateBusy=true;checkUpdatesMenu.Enabled=false;
   int stagedSite=0;
   bool websitePending=false;
   string siteFailure=null,shellFailure=null;
   ReleaseUpdater.Prepared shell=null;
   try{
    var site=Path.Combine(root,"site","smart-punch");
    var pending=Path.Combine(DataRoot,"updates","pending.json");
    systemUpdateStatusMenu.Text="更新系統：正在比對正式版本…";
    try{
     websitePending=File.Exists(pending);
     if(!websitePending){
      stagedSite=await Updater.StageFromOfficialAsync(site,DataRoot,Log);
      websitePending=stagedSite>0;
     }
    }catch(Exception e){
     siteFailure=e.Message;
     Log("website auto update deferred: "+e.Message);
    }
    // Never make an explicit second ZIP download step mandatory for the user.
    // A release is verified in the app, and kept staged until a safe restart.
    try{
     shell=await ReleaseUpdater.PrepareAsync(root,DataRoot,Log);
    }catch(Exception e){
     shellFailure=e.Message;
     Log("Windows shell auto update deferred: "+e.Message);
    }
    // Explicit menu action already requests restart; do not ask again.
    // Background checks restart only before user input and when sync is idle.
    bool restartSafe=!cloudWorkerJobActive&&!cacheInProgress&&
     (manual||!userInteractedSinceLaunch);
    if(shell!=null){
     if(!restartSafe){
      systemUpdateStatusMenu.Text="更新系統：新版已下載；工作或同步中，待下次安全啟動套用";
      Log("Windows update staged; restart deferred because the user or cloud sync is active");
      return;
     }
     systemUpdateStatusMenu.Text="更新系統：Windows 新版已驗證，準備自動重啟";
     await ReleaseUpdater.LaunchAsync(shell,root,Process.GetCurrentProcess().Id);
     Log("Windows updater accepted handoff; old app closing for automatic restart");
     ExitApp();
     return;
    }
    if(websitePending){
     if(!restartSafe){
      systemUpdateStatusMenu.Text="更新系統：網站新版已下載；工作或同步中，待下次安全啟動套用";
      Log("Website update staged; restart deferred because the user or cloud sync is active");
      return;
     }
     systemUpdateStatusMenu.Text="更新系統：網站新版已驗證，正在自動重啟";
     Log("Website update verified; restart to apply staged site without a prompt");
     exit=true;Application.Restart();Close();
     return;
    }
    if(siteFailure!=null||shellFailure!=null){
     systemUpdateStatusMenu.Text="更新系統：部分檢查失敗，原版保留（詳見更新紀錄）";
     Log("Update check incomplete. Website: "+siteFailure+"; Windows: "+shellFailure);
     return;
    }
    systemUpdateStatusMenu.Text="更新系統：已是目前正式版本";
   }catch(Exception e){
    Log("unified system update error: "+e.Message);
    systemUpdateStatusMenu.Text="更新系統：執行失敗，原資料保留（詳見更新紀錄）";
   }finally{
    updateBusy=false;checkUpdatesMenu.Enabled=true;
   }
  }
 }
}

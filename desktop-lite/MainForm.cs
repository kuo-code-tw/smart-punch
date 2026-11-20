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
  private bool initiated=false;
  private bool cacheInProgress=false;
  private bool probedImportFrames=false;

  public MainForm(){
   Text="79號碼頭雲端智慧系統";
   WindowState=FormWindowState.Maximized;
   MinimumSize=new Size(980,640);
   StartPosition=FormStartPosition.CenterScreen;
   Icon=SystemIcons.Application;
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
   tray=new NotifyIcon{Icon=SystemIcons.Application,Visible=true,Text="79號碼頭雲端智慧系統"};
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
   var syncDataMenu=new ToolStripMenuItem("重新同步資料（考勤等七項）",null,async(s,e)=>await ForceDownload()){
    ToolTipText="僅重新讀取考勤、工時、請假、排班、效率、人資、歷史等資料，不會更新 Windows 程式或碼頭儲量 Excel。"
   };
   menu.Items.Add(syncDataMenu);
   systemUpdateStatusMenu=new ToolStripMenuItem("系統更新狀態：啟動後自動檢查"){Enabled=false};
   cacheStatusMenu=new ToolStripMenuItem("資料同步狀態：尚未登入"){Enabled=false};
   menu.Items.Add(systemUpdateStatusMenu);
   menu.Items.Add(cacheStatusMenu);
   menu.Items.Add(new ToolStripSeparator());
   menu.Items.Add("開啟本機資料夾",null,(s,e)=>OpenLocalData());
   menu.Items.Add("關閉程式",null,(s,e)=>ExitApp());
   tray.ContextMenuStrip=menu;
   tray.DoubleClick+=(s,e)=>ShowWindow();
   FormClosing+=(s,e)=>{if(!exit){e.Cancel=true;Hide();}};
   FormClosed+=(s,e)=>{cacheDismissTimer.Dispose();cacheTooltip.Dispose();tray.Visible=false;tray.Dispose();web.Dispose();};
   Shown+=async(s,e)=>await Initialize();
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
    // Stage files never overwrite the browser profile or cloud data.
    // A corrupt/incomplete staged download must never block the saved local system.
    try {
     var applied=Updater.ApplyIfVerified(site,DataRoot,Log);
     if(applied>0)systemUpdateStatusMenu.Text="系統檔案：已套用 "+applied+" 項新版";
    }catch(Exception error){
     Log("staged system update rejected, preserved existing site: "+error.Message);
     systemUpdateStatusMenu.Text="系統檔案：更新未完成，原檔保留";
    }
    var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(DataRoot,"BrowserProfile"));
    await web.EnsureCoreWebView2Async(env);
    web.CoreWebView2.SetVirtualHostNameToFolderMapping(Host,Path.Combine(root,"site"),CoreWebView2HostResourceAccessKind.DenyCors);
    web.CoreWebView2.Settings.IsWebMessageEnabled=true;
    web.CoreWebView2.WebMessageReceived+=OnCacheMessage;
    web.CoreWebView2.Settings.AreDevToolsEnabled=false;
    web.CoreWebView2.NewWindowRequested+=(s,e)=>{
     e.Handled=true;
     if(e.Uri.StartsWith(OfficialRoot,StringComparison.OrdinalIgnoreCase)){web.CoreWebView2.Navigate(LocalRoot+e.Uri.Substring(OfficialRoot.Length));return;}
     OpenSafeExternal(e.Uri);
    };
    web.CoreWebView2.NavigationStarting+=(s,e)=>{
     if(cacheInProgress){
      cacheInProgress=false;
      cacheTitle.Text="⏸ 本機資料下載已中斷";
      cacheDetail.Text="頁面已切換；已下載的資料仍保留。回到首頁可重新下載。";
      cacheBar.Style=ProgressBarStyle.Continuous;
      cachePanel.Visible=true;
      cacheDismissTimer.Stop();
      cacheStatusMenu.Text="資料同步狀態：頁面切換，下載中斷";
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
       var progress=Path.Combine(root,"app","login-progress.js");
       if(File.Exists(progress)) await web.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(progress));
      }catch(Exception x){Log("progress overlay: "+x.Message);}
      if(!probedImportFrames&&Array.Exists(Environment.GetCommandLineArgs(),
       a=>a=="--port79-verify-import-frames")){
       probedImportFrames=true;await ProbeImportFrames();
      }
     }
    };
    web.CoreWebView2.Navigate(LocalRoot+"index.html");
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
    var payload=new JavaScriptSerializer().Deserialize<CacheStatusPayload>(raw);
    if(payload==null)return;
    if(payload.kind=="port79-import-probe-v1"){
     Log("IMPORT FRAME CHECK: "+SafeStatus(payload.title,320));return;
    }
    if(payload.kind!="port79-cache-status-v1")return;
    UpdateCacheStatus(payload);
   }catch(Exception error){Log("native cache status rejected: "+error.Message);}
  }
  private sealed class CacheStatusPayload{
   public string kind {get;set;}
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
   var phase=value.phase??"";
   if(phase!="idle"&&phase!="waiting"&&phase!="downloading"&&phase!="stalled"&&phase!="interrupted"&&phase!="complete"&&phase!="partial"&&phase!="failed"&&phase!="cached")return;
   int total=phase=="idle"?7:Math.Max(1,Math.Min(7,value.total));
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
   cacheStatusMenu.Text=SafeStatus("資料同步狀態："+value.title,55);
   // Windows notify icons have a limited tooltip length.
   tray.Text=SafeStatus("79號碼頭｜"+(showMonths?monthCompleted+"/"+monthTotal+"月":"系統"+completed+"/"+total)+"｜"+value.title,60);
   if(phase=="complete"||phase=="partial"||phase=="failed"||phase=="interrupted")Log("download "+phase+" "+completed+"/"+total+" "+SafeStatus(value.detail,120));
  }
  private static void OpenSafeExternal(string address){
   if(!Uri.TryCreate(address,UriKind.Absolute,out var u)||u.Scheme!="https")return;
   try{Process.Start(new ProcessStartInfo(u.AbsoluteUri){UseShellExecute=true});}catch{}
  }
  private async Task ForceDownload(){
   ShowWindow();
   if(web.CoreWebView2==null)return;
   // The script rechecks the server-issued manager session before doing any download.
   await web.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new Event('port79-desktop-force-sync'))");
  }
  // One user-facing update action for both public website code and the
  // Windows WebView2 shell; the current user profile and backups are untouched.
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
    if(shell!=null){
     systemUpdateStatusMenu.Text="更新系統：Windows 新版已備妥，待安全重新啟動";
     if(!manual){
      tray.ShowBalloonTip(5000,"79號碼頭：已備妥系統更新",
       "Windows 新版已自動驗證下載；請在不需儲存資料時選「更新系統」套用。",ToolTipIcon.Info);
     }else{
      var answer=MessageBox.Show(
       "已自動下載並驗證 Windows 新版程式"+(websitePending?"及網站更新":"")+"。\n\n"+
       "套用時會先真正關閉舊程式，更新後自動重新開啟。\n"+
       "local-data、考勤、請假、排班和瀏覽器快取都會保留。\n\n"+
       "請先儲存任何正在編輯的內容。現在安全重新啟動並套用嗎？",
       "更新系統",MessageBoxButtons.YesNo,MessageBoxIcon.Question);
      if(answer==DialogResult.Yes){
       ReleaseUpdater.Launch(shell,root,Process.GetCurrentProcess().Id);
       Log("已啟動單一入口 Windows 系統更新：驗證完成、進入安全重啟");
       ExitApp();
      }
     }
     return;
    }
    if(websitePending){
     systemUpdateStatusMenu.Text="更新系統：網站新版已備妥，待重新啟動";
     if(manual){
      var answer=MessageBox.Show(
       "已自動下載並校驗網站程式更新"+(stagedSite>0?" "+stagedSite+" 個檔案":"")+"。\n\n"+
       "不需要重新下載 Windows ZIP，也不會清除 local-data。\n\n"+
       "請先儲存尚未完成的編輯，現在重新啟動套用嗎？",
       "更新系統",MessageBoxButtons.YesNo,MessageBoxIcon.Question);
      if(answer==DialogResult.Yes){
       Log("網站程式更新已驗證，使用 Windows Restart 套用 staged 版本");
       exit=true;Application.Restart();Close();
      }
     }else{
      tray.ShowBalloonTip(4000,"79號碼頭：網站程式更新已下載",
       "下次重新啟動程式後自動套用；local-data 保留。",ToolTipIcon.Info);
     }
     return;
    }
    if(siteFailure!=null||shellFailure!=null){
     systemUpdateStatusMenu.Text="更新系統：部分檢查失敗，原版保留";
     if(manual)MessageBox.Show(
      "程式沒有下載未驗證的檔案，也沒有更動本機資料。\n"+
      (siteFailure!=null?"網站檔案："+siteFailure+"\n":"")+
      (shellFailure!=null?"Windows 程式："+shellFailure+"\n":"")+
      "\n請確認正式版本已成功發佈。",
      "更新系統",MessageBoxButtons.OK,MessageBoxIcon.Warning);
     return;
    }
    systemUpdateStatusMenu.Text="更新系統：已是目前正式版本";
    if(manual)MessageBox.Show(
     "Windows 程式與網站程式已核對，沒有需要下載的更新。\n\n"+
     "請注意：GitHub 測試分支尚未正式發布的修改，不能當成已更新。\n"+
     "本機資料及快取未變更。",
     "更新系統",MessageBoxButtons.OK,MessageBoxIcon.Information);
   }catch(Exception e){
    Log("unified system update error: "+e.Message);
    systemUpdateStatusMenu.Text="更新系統：執行失敗，原資料保留";
    if(manual)MessageBox.Show("此次系統更新未完成，原本資料和程式均保留：\n"+e.Message,
     "更新系統",MessageBoxButtons.OK,MessageBoxIcon.Warning);
   }finally{
    updateBusy=false;checkUpdatesMenu.Enabled=true;
   }
  }
 }
}

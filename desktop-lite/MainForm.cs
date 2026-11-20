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
  private readonly ToolStripMenuItem cacheStatusMenu;
  private readonly ToolStripMenuItem updateWindowsMenu;
  private readonly Label cacheTitle;
  private readonly Label cacheDetail;
  private readonly Label cacheCount;
  private readonly ProgressBar cacheBar;
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
   // Persistent native status stays visible even when the webpage scrolls,
   // changes modules, or the HTML progress popover is hidden.
   var panel=new Panel{Dock=DockStyle.Bottom,Height=74,BackColor=Color.FromArgb(239,248,255),Padding=new Padding(12,7,12,7)};
   var layout=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=2,Margin=Padding.Empty};
   layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,79));
   layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,21));
   layout.RowStyles.Add(new RowStyle(SizeType.Absolute,29));
   layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
   cacheTitle=new Label{Dock=DockStyle.Fill,Text="☁ 本機資料：等待管理員登入",AutoEllipsis=true,Font=new Font("Microsoft JhengHei",10,FontStyle.Bold),ForeColor=Color.FromArgb(19,65,113),TextAlign=ContentAlignment.MiddleLeft};
   cacheCount=new Label{Dock=DockStyle.Fill,Text="0 / 7 個系統",TextAlign=ContentAlignment.MiddleRight,Font=new Font("Microsoft JhengHei",9,FontStyle.Bold),ForeColor=Color.FromArgb(23,101,169)};
   cacheDetail=new Label{Dock=DockStyle.Fill,Text="登入後才開始下載；首次開啟不會預先下載私人資料。",AutoEllipsis=true,Font=new Font("Microsoft JhengHei",9),ForeColor=Color.FromArgb(61,97,130),TextAlign=ContentAlignment.MiddleLeft};
   cacheBar=new ProgressBar{Dock=DockStyle.Fill,Minimum=0,Maximum=7,Value=0,Style=ProgressBarStyle.Continuous,Margin=new Padding(12,5,0,4)};
   layout.Controls.Add(cacheTitle,0,0);layout.Controls.Add(cacheCount,1,0);
   layout.Controls.Add(cacheDetail,0,1);layout.Controls.Add(cacheBar,1,1);
   panel.Controls.Add(layout);Controls.Add(panel);panel.BringToFront();
   tray=new NotifyIcon{Icon=SystemIcons.Application,Visible=true,Text="79號碼頭雲端智慧系統"};
   var menu=new ContextMenuStrip();
   menu.Items.Add("開啟系統",null,(s,e)=>ShowWindow());
   cacheStatusMenu=new ToolStripMenuItem("資料狀態：尚未登入"){Enabled=false};
   menu.Items.Add(cacheStatusMenu);
   menu.Items.Add("縮小到系統匣",null,(s,e)=>Hide());
   menu.Items.Add(new ToolStripSeparator());
   menu.Items.Add("管理員登入後重新下載資料",null,async(s,e)=>await ForceDownload());
   checkUpdatesMenu=new ToolStripMenuItem("檢查原系統程式更新",null,async(s,e)=>await CheckUpdates());
   menu.Items.Add(checkUpdatesMenu);
   updateWindowsMenu=new ToolStripMenuItem("一鍵更新 Windows 程式（保留本機資料）",null,async(s,e)=>await UpgradeWindowsShell());
   menu.Items.Add(updateWindowsMenu);
   menu.Items.Add("開啟電腦資料夾",null,(s,e)=>OpenLocalData());
   menu.Items.Add(new ToolStripSeparator());
   menu.Items.Add("真正結束程式",null,(s,e)=>ExitApp());
   tray.ContextMenuStrip=menu;
   tray.DoubleClick+=(s,e)=>ShowWindow();
   FormClosing+=(s,e)=>{if(!exit){e.Cancel=true;Hide();}};
   FormClosed+=(s,e)=>{tray.Visible=false;tray.Dispose();web.Dispose();};
   Shown+=async(s,e)=>await Initialize();
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
    Updater.ApplyIfVerified(site,DataRoot,Log);
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
      cacheStatusMenu.Text="資料狀態：已切換頁面，下載中斷";
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
    // Software files only: does not download any private database or employee records.
    var tick=new Timer{Interval=600000};
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
   cacheCount.Text=completed+" / "+total+" 個系統";
   cacheInProgress=phase=="downloading"||phase=="stalled";
   // Moving marquee means the current month is still being processed, NOT complete.
   cacheBar.Style=cacheInProgress?ProgressBarStyle.Marquee:ProgressBarStyle.Continuous;
   cacheBar.Maximum=total;
   if(!cacheInProgress)cacheBar.Value=completed;
   cacheBar.MarqueeAnimationSpeed=cacheInProgress?25:0;
   cacheStatusMenu.Text=SafeStatus("資料狀態："+value.title,55);
   // Windows notify icons have a limited tooltip length.
   tray.Text=SafeStatus("79號碼頭｜"+completed+"/"+total+"｜"+value.title,60);
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
  private async Task UpgradeWindowsShell(){
   if(updateBusy)return;
   var answer=MessageBox.Show(
    "將從 79號碼頭官方 GitHub Release 驗證下載新版 Windows 程式，保留 local-data、所有已下載快取與備份。\n\n請先確認沒有正在進行 Excel 匯入、考勤儲存或任何未完成的雲端寫入。\n\n驗證成功後，程式將自動關閉、更新並重新啟動。現在繼續嗎？",
    "一鍵更新 Windows 程式",MessageBoxButtons.YesNo,MessageBoxIcon.Question);
   if(answer!=DialogResult.Yes)return;
   updateBusy=true;updateWindowsMenu.Enabled=false;checkUpdatesMenu.Enabled=false;
   try{
    cacheTitle.Text="正在檢查 Windows 程式版本";
    cacheDetail.Text="從正式發布檢查檔案 SHA-256；不會下載或覆蓋考勤資料庫。";
    var ready=await ReleaseUpdater.PrepareAsync(root,DataRoot,Log);
    if(ready==null){
     cacheTitle.Text="Windows 主程式已是最新版";
     cacheDetail.Text="已核對目前安裝的版本，無需再次下載。";
     MessageBox.Show("Windows 主程式已是最新發布版本。","79號碼頭 Windows 更新",MessageBoxButtons.OK,MessageBoxIcon.Information);
     return;
    }
    ReleaseUpdater.Launch(ready,root,Process.GetCurrentProcess().Id);
    Log("已驗證最新版程式檔；已啟動安全更新工具。系統進入重新啟動流程");
    ExitApp();
   }catch(Exception error){
    Log("Windows 版本更新失敗："+error.Message);
    cacheTitle.Text="Windows 更新未完成";
    cacheDetail.Text=error.Message;
    MessageBox.Show("程式尚未更新，原有資料與 Windows 程式均保留：\n"+error.Message,
     "79號碼頭 Windows 更新",MessageBoxButtons.OK,MessageBoxIcon.Warning);
   }finally{
    updateBusy=false;updateWindowsMenu.Enabled=true;checkUpdatesMenu.Enabled=true;
   }
  }
  private async Task CheckUpdates(){
   if(updateBusy)return;updateBusy=true;checkUpdatesMenu.Enabled=false;
   try{
    var site=Path.Combine(root,"site","smart-punch");
    var result=await Updater.StageFromOfficialAsync(site,DataRoot,Log);
    if(result>0){tray.ShowBalloonTip(4000,"79號碼頭程式更新","已驗證 "+result+" 個新版程式檔，下次啟動時套用。",ToolTipIcon.Info);}
   }catch(Exception ex){Log("check update: "+ex.Message);}
   finally{updateBusy=false;checkUpdatesMenu.Enabled=true;}
  }
 }
}

using System;
using System.IO;
using System.Diagnostics;
using System.Drawing;
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
  private bool exit=false;
  private bool updateBusy=false;
  private bool initiated=false;

  public MainForm(){
   Text="79號碼頭雲端智慧系統";
   WindowState=FormWindowState.Maximized;
   MinimumSize=new Size(980,640);
   StartPosition=FormStartPosition.CenterScreen;
   Icon=SystemIcons.Application;
   web=new WebView2{Dock=DockStyle.Fill};
   Controls.Add(web);
   tray=new NotifyIcon{Icon=SystemIcons.Application,Visible=true,Text="79號碼頭雲端智慧系統"};
   var menu=new ContextMenuStrip();
   menu.Items.Add("開啟系統",null,(s,e)=>ShowWindow());
   menu.Items.Add("縮小到系統匣",null,(s,e)=>Hide());
   menu.Items.Add(new ToolStripSeparator());
   menu.Items.Add("管理員登入後重新下載資料",null,async(s,e)=>await ForceDownload());
   checkUpdatesMenu=new ToolStripMenuItem("檢查原系統程式更新",null,async(s,e)=>await CheckUpdates());
   menu.Items.Add(checkUpdatesMenu);
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
    web.CoreWebView2.Settings.IsWebMessageEnabled=false;
    web.CoreWebView2.Settings.AreDevToolsEnabled=false;
    web.CoreWebView2.NewWindowRequested+=(s,e)=>{
     e.Handled=true;
     if(e.Uri.StartsWith(OfficialRoot,StringComparison.OrdinalIgnoreCase)){web.CoreWebView2.Navigate(LocalRoot+e.Uri.Substring(OfficialRoot.Length));return;}
     OpenSafeExternal(e.Uri);
    };
    web.CoreWebView2.NavigationStarting+=(s,e)=>{
     if(e.Uri.StartsWith(LocalRoot,StringComparison.OrdinalIgnoreCase))return;
     e.Cancel=true;
     if(e.Uri.StartsWith(OfficialRoot,StringComparison.OrdinalIgnoreCase)){
      web.CoreWebView2.Navigate(LocalRoot+e.Uri.Substring(OfficialRoot.Length));return;
     }
     OpenSafeExternal(e.Uri);
    };
    web.CoreWebView2.NavigationCompleted+=async(s,e)=>{
     if(e.IsSuccess&&web.Source?.AbsoluteUri.StartsWith(LocalRoot,StringComparison.OrdinalIgnoreCase)==true){
      try{
       var progress=Path.Combine(root,"app","login-progress.js");
       if(File.Exists(progress)) await web.CoreWebView2.ExecuteScriptAsync(File.ReadAllText(progress));
      }catch(Exception x){Log("progress overlay: "+x.Message);}
     }
    };
    web.CoreWebView2.Navigate(LocalRoot);
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

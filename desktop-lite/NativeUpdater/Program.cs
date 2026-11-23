using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

namespace Port79LiteNativeUpdater {
 // Small independent net48 executable: no PowerShell, no WebView2, no network.
 // The parent verifies the official GitHub ZIP digest before starting us; we
 // independently verify it again BEFORE acknowledging the handoff.
 internal static class Program {
  const string Folder="79號碼頭_Windows輕量版/";
  sealed class Backup {public string Target,Stored;public bool HadOriginal;}
  static readonly List<Backup> Touched=new List<Backup>();
  static string Root="",Updates="",LogFile="",Ready="",Archive="",Digest="";
  static int ParentPid;
  static bool TestOnly,ReadyWritten,Applied,RestartAttempted;
  static Process NewApp;

  [STAThread]
  static int Main(string[] args){
   try{
    var options=Parse(args);
    Root=Path.GetFullPath(Required(options,"--install-root")).TrimEnd(Path.DirectorySeparatorChar);
    Archive=Path.GetFullPath(Required(options,"--archive"));
    Digest=Required(options,"--expected-digest").Trim().ToLowerInvariant();
    ParentPid=int.Parse(Required(options,"--parent-pid"));
    Ready=Path.GetFullPath(Required(options,"--ready-file"));
    TestOnly=options.ContainsKey("--test-only");
    Updates=Path.Combine(Root,"local-data","updates");
    LogFile=Path.Combine(Root,"local-data","logs","windows-upgrade.txt");
    Directory.CreateDirectory(Updates);
    Directory.CreateDirectory(Path.GetDirectoryName(LogFile));
    Log("NATIVE_UPDATER_STARTED parent="+ParentPid+" test="+TestOnly);
    VerifyInputs();
    Log("NATIVE_ARCHIVE_SHA256_OK "+Digest.Substring(0,12));
    // The native process must already be alive when the parent closes.
    // Write the ready flag only after the archive and path checks succeeded.
    File.WriteAllText(Ready,"ready:"+ParentPid,Encoding.ASCII);
    ReadyWritten=true;
    Log("UPDATER_READY parent="+ParentPid);
    WaitForParent();
    Apply();
    Log("NATIVE_UPDATE_SUCCESS");
    return 0;
   }catch(Exception error){
    Log("ERROR "+error.GetType().Name+": "+error.Message);
    // If argument parsing, a missing .NET dependency or an early path check
    // fails BEFORE LogFile is set, preserve a bootstrap error next to the
    // launched helper so the still-running parent can report the real cause.
    try{
     var self=Process.GetCurrentProcess().MainModule.FileName;
     var earlyLog=self+".bootstrap-error.txt";
     File.WriteAllText(earlyLog,error.GetType().Name+": "+error.Message,Encoding.UTF8);
    }catch{}
    // A pre-handoff failure is visible to the old running app.
    try{
     if(!ReadyWritten&&!String.IsNullOrEmpty(Updates))
      File.WriteAllText(Path.Combine(Updates,"native-update-launch-error.txt"),
       error.GetType().Name+": "+error.Message);
    }catch{}
    if(Applied||Touched.Count>0)Rollback();
    return 1;
   }finally{
    try{
     if(!String.IsNullOrEmpty(Updates)){
     var stage=Path.Combine(Updates,"shell-staging");
     if(Directory.Exists(stage))Directory.Delete(stage,true);
     }
    }catch(Exception error){Log("STAGING_CLEANUP_WARNING "+error.Message);}
   }
  }
  static Dictionary<string,string> Parse(string[] args){
   var options=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
   for(var i=0;i<args.Length;i++){
    var key=args[i];
    if(key=="--test-only"){options[key]="true";continue;}
    if(i+1>=args.Length||!key.StartsWith("--"))throw new ArgumentException("Incomplete native update argument");
    options[key]=args[++i];
   }
   return options;
  }
  static string Required(Dictionary<string,string> options,string key){
   string v;
   if(!options.TryGetValue(key,out v)||String.IsNullOrWhiteSpace(v))throw new ArgumentException("Missing "+key);
   return v;
  }
  static void Log(string text){
   try{
    if(String.IsNullOrEmpty(LogFile))return;
    Directory.CreateDirectory(Path.GetDirectoryName(LogFile));
    File.AppendAllText(LogFile,DateTime.Now.ToString("o")+" "+text+Environment.NewLine,Encoding.UTF8);
   }catch{}
  }
  static string Sha256(string path){
   using(var sha=SHA256.Create())using(var stream=File.OpenRead(path))
    return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();
  }
  static bool Inside(string path,string baseDir){
   var full=Path.GetFullPath(path);
   var prefix=Path.GetFullPath(baseDir).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
   return full.StartsWith(prefix,StringComparison.OrdinalIgnoreCase);
  }
  static string NormalizedRelative(string fullName){
   var name=(fullName??"").Replace('\\','/');
   if(!name.StartsWith(Folder,StringComparison.Ordinal))throw new InvalidDataException("更新檔案夾不正確");
   var relative=name.Substring(Folder.Length);
   if(String.IsNullOrEmpty(relative))return "";
   if(relative.StartsWith("/")||relative.Contains(":")||relative.Contains("//")||
      relative.Split('/').Any(part=>part=="."||part==".."))
    throw new InvalidDataException("更新路徑不安全："+relative);
   return relative;
  }
  static bool Permitted(string relative){
   if(relative=="Port79WindowsLite.exe"||relative=="Port79WindowsLite.exe.config"||
      relative=="使用說明.txt")return true;
   if(relative.StartsWith("site/smart-punch/",StringComparison.Ordinal)||
      relative.StartsWith("app/",StringComparison.Ordinal)||
      relative.StartsWith("runtimes/",StringComparison.Ordinal))return true;
   var ext=Path.GetExtension(relative).ToLowerInvariant();
   return relative.IndexOf('/')<0&&new[]{".dll",".xml",".pdb",".config"}.Contains(ext);
  }
  static void VerifyInputs(){
   if(ParentPid<0)throw new ArgumentException("Invalid parent process");
   if(Digest.Length!=64||!Digest.All(x=>(x>='0'&&x<='9')||(x>='a'&&x<='f')))
    throw new InvalidDataException("正式更新檔驗證碼格式錯誤");
   if(!Inside(Archive,Updates))throw new InvalidDataException("ZIP 必須位於本機更新資料夾");
   var expected=Path.Combine(Updates,"runner-ready-"+ParentPid+".flag");
   if(!String.Equals(Ready,Path.GetFullPath(expected),StringComparison.OrdinalIgnoreCase))
    throw new InvalidDataException("更新接手路徑不正確");
   if(!File.Exists(Archive))throw new FileNotFoundException("找不到下載完成的正式更新檔");
   if(new FileInfo(Archive).Length>30L*1024*1024)throw new InvalidDataException("更新檔大小超出限制");
   if(Sha256(Archive)!=Digest)throw new InvalidDataException("正式更新檔 SHA-256 不一致");
   bool hasExe=false,hasSite=false,hasHelper=false;
   using(var zip=ZipFile.OpenRead(Archive)){
    if(zip.Entries.Count>2000)throw new InvalidDataException("更新檔案項目過多");
    foreach(var entry in zip.Entries){
     var name=(entry.FullName??"").Replace('\\','/');
     var rel=NormalizedRelative(name);
     if(String.IsNullOrEmpty(rel))continue;
     var isDirectory=name.EndsWith("/");
     if(rel.StartsWith("local-data/",StringComparison.OrdinalIgnoreCase)){
      if(!isDirectory||entry.Length!=0)throw new InvalidDataException("更新檔不得包含私人資料");
      continue;
     }
     if(!isDirectory){
      if(!Permitted(rel))throw new InvalidDataException("不允許的程式檔案："+rel);
      if(entry.Length>15*1024*1024)throw new InvalidDataException("程式單檔超出限制");
      if(rel=="Port79WindowsLite.exe")hasExe=true;
      if(rel=="site/smart-punch/index.html")hasSite=true;
      if(rel=="app/Port79Updater.exe")hasHelper=true;
     }
    }
   }
   if(!hasExe||!hasSite||!hasHelper)
    throw new InvalidDataException("79號碼頭電腦版更新檔缺少主程式、首頁或原生更新器");
   // Fail before the old app exits if the install directory is read-only.
   var probe=Path.Combine(Root,".port79-native-updater-write-test-"+ParentPid);
   try{File.WriteAllText(probe,"ok");}finally{try{if(File.Exists(probe))File.Delete(probe);}catch{}}
  }
  static void WaitForParent(){
   if(ParentPid==0)return;
   var end=DateTime.UtcNow.AddSeconds(75);
   while(DateTime.UtcNow<end){
    try{
     using(var p=Process.GetProcessById(ParentPid)){
      if(p.HasExited)return;
     }
    }catch(ArgumentException){return;}
    Thread.Sleep(300);
   }
   throw new TimeoutException("舊版程式尚未關閉，已取消套用以保護目前資料");
  }
  static void Apply(){
   var stage=Path.Combine(Updates,"shell-staging");
   var rollback=Path.Combine(Updates,"shell-rollback");
   if(Directory.Exists(stage))Directory.Delete(stage,true);
   if(Directory.Exists(rollback))Directory.Delete(rollback,true);
   Directory.CreateDirectory(stage);
   Directory.CreateDirectory(rollback);
   using(var zip=ZipFile.OpenRead(Archive)){
    foreach(var entry in zip.Entries){
     var name=(entry.FullName??"").Replace('\\','/');
     var relative=NormalizedRelative(name);
     if(String.IsNullOrEmpty(relative)||relative.StartsWith("local-data/",StringComparison.OrdinalIgnoreCase))continue;
     var destination=Path.Combine(stage,name.Replace('/',Path.DirectorySeparatorChar));
     if(!Inside(destination,stage))throw new InvalidDataException("解壓路徑不安全");
     if(name.EndsWith("/")){Directory.CreateDirectory(destination);continue;}
     Directory.CreateDirectory(Path.GetDirectoryName(destination));
     entry.ExtractToFile(destination,true);
    }
   }
   var pkg=Path.Combine(stage,"79號碼頭_Windows輕量版");
   var all=Directory.GetFiles(pkg,"*",SearchOption.AllDirectories);
   foreach(var from in all){
    var rel=from.Substring(pkg.Length).TrimStart(Path.DirectorySeparatorChar);
    var normalized=rel.Replace('\\','/');
    if(!Permitted(normalized))throw new InvalidDataException("不允許的更新項目："+normalized);
    var target=Path.GetFullPath(Path.Combine(Root,rel));
    if(!Inside(target,Root)||Inside(target,Path.Combine(Root,"local-data")))
     throw new InvalidDataException("更新不可寫入私人資料");
    var backup=Path.Combine(rollback,rel);
    var existed=File.Exists(target);
    if(existed){
     Directory.CreateDirectory(Path.GetDirectoryName(backup));
     File.Copy(target,backup,true);
    }
    Touched.Add(new Backup{Target=target,Stored=backup,HadOriginal=existed});
    Directory.CreateDirectory(Path.GetDirectoryName(target));
    File.Copy(from,target,true);
   }
   Applied=true;
   Log("FILES_APPLIED "+Touched.Count+" program files; local-data untouched");
   var exe=Path.Combine(Root,"Port79WindowsLite.exe");
   if(!TestOnly){
    RestartAttempted=true;
    Log("RESTART_REQUESTED "+exe);
    var psi=new ProcessStartInfo(exe){WorkingDirectory=Root,UseShellExecute=true};
    NewApp=Process.Start(psi);
    if(NewApp==null)throw new InvalidOperationException("新版主程式無法開啟");
    var end=DateTime.UtcNow.AddSeconds(30);
    bool visible=false;
    while(DateTime.UtcNow<end){
     Thread.Sleep(750);
     NewApp.Refresh();
     if(NewApp.HasExited)throw new InvalidOperationException("新版在開啟主視窗前結束");
     if(NewApp.MainWindowHandle!=IntPtr.Zero&&
        NewApp.MainWindowTitle.Contains("79號碼頭雲端智慧系統")){visible=true;break;}
    }
    if(!visible)throw new TimeoutException("新版沒有顯示預期的正式視窗");
    Log("WINDOW_VISIBLE_CONFIRMED pid="+NewApp.Id);
   }
   File.WriteAllText(Path.Combine(Updates,"installed-shell-exe-sha256.txt"),Sha256(exe));
   File.WriteAllText(Path.Combine(Updates,"installed-shell-sha256.txt"),Digest);
   Log("AUTO_RESTART_SUCCESS"+(NewApp!=null?" pid="+NewApp.Id:" test-only"));
  }
  static void Rollback(){
   try{
    if(NewApp!=null){
     try{NewApp.Refresh();if(!NewApp.HasExited){NewApp.Kill();NewApp.WaitForExit(10000);}}catch{}
    }
    for(int i=Touched.Count-1;i>=0;i--){
     var item=Touched[i];
     try{
      if(item.HadOriginal&&File.Exists(item.Stored))File.Copy(item.Stored,item.Target,true);
      else if(!item.HadOriginal&&File.Exists(item.Target))File.Delete(item.Target);
     }catch(Exception error){Log("ROLLBACK_WARNING "+error.Message);}
    }
    Log("ROLLBACK_COMPLETED; user local-data untouched");
    if(!TestOnly&&RestartAttempted){
     var exe=Path.Combine(Root,"Port79WindowsLite.exe");
     if(File.Exists(exe)){
      try{
       var p=Process.Start(new ProcessStartInfo(exe){WorkingDirectory=Root,UseShellExecute=true});
       Log("ROLLBACK_RESTART_ATTEMPTED "+(p!=null?p.Id.ToString():""));
      }catch(Exception error){Log("ROLLBACK_RESTART_FAILED "+error.Message);}
     }
    }
   }catch(Exception error){Log("ROLLBACK_ERROR "+error.Message);}
  }
 }
}

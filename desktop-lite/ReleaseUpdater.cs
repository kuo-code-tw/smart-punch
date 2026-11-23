using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Diagnostics;
using System.Web.Script.Serialization;
using System.Threading.Tasks;
using System.Linq;
using System.Text;
using System.Collections.Generic;
using System.IO.Compression;

namespace Port79Lite {
 // Read-only GitHub release updater for the Windows shell itself. Business
 // records, cookies, IndexedDB, and cloud credentials are never uploaded.
 public static class ReleaseUpdater {
  // Resolve the immutable newest release. The mutable 2026-11-20 legacy tag
  // can be cached and must never decide which executable is current.
  const string Api="https://api.github.com/repos/kuo-code-tw/smart-punch/releases/latest";
  const string ReleaseDownloadBase="https://github.com/kuo-code-tw/smart-punch/releases/download/";
  const long Limit=30L*1024*1024;
  public sealed class GitAsset {public string name {get;set;} public string browser_download_url {get;set;} public string digest {get;set;} public long size {get;set;} }
  public sealed class GitRelease {public bool draft {get;set;} public string tag_name {get;set;} public GitAsset[] assets {get;set;} }
  public sealed class Prepared {public string Zip {get;set;} public string Digest {get;set;} public string Helper {get;set;} }
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer {MaxJsonLength=1000000};
  static bool HashValid(string text){return text?.Length==64&&text.All(x=>(x>='0'&&x<='9')||(x>='a'&&x<='f'));}
  static string Sha256(byte[] bytes){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
  public static async Task<Prepared> PrepareAsync(string root,string data,Action<string> log){
   ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
   // Use the updater from the fully SHA-256 verified official release, never
   // depend on a possibly broken or missing updater in the old installation.
   // The running app downloads/releases internally. No manual ZIP is needed.
   using(var client=new HttpClient {Timeout=TimeSpan.FromSeconds(60)}){
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Port79-WindowsLite-Updater/1.0");
    client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
    // An uncached metadata request avoids stale release JSON after publishing.
    var release=Json.Deserialize<GitRelease>(await client.GetStringAsync(
     Api+"?checked="+DateTimeOffset.UtcNow.ToUnixTimeSeconds()).ConfigureAwait(true));
    if(release==null||release.draft||!System.Text.RegularExpressions.Regex.IsMatch(
     release.tag_name??"", @"^port79-windows-lite-[0-9]{8}-[a-f0-9]{12}$"))
     throw new InvalidDataException("未取得可驗證的79號碼頭電腦版正式更新資訊");
    var url=ReleaseDownloadBase+release.tag_name+"/Port79-Windows-Lite.zip";
    var asset=release.assets?.SingleOrDefault(x=>x?.name=="Port79-Windows-Lite.zip");
    if(asset==null||asset.browser_download_url!=url||asset.size<=0||asset.size>Limit||
      asset.digest==null||!asset.digest.StartsWith("sha256:",StringComparison.Ordinal))
      throw new InvalidDataException("79號碼頭電腦版更新檔缺少有效 SHA-256 或來源不符合預期");
    var digest=asset.digest.Substring(7).ToLowerInvariant();
    if(!HashValid(digest))throw new InvalidDataException("79號碼頭電腦版更新檔 SHA-256 格式錯誤");
    var updates=Path.Combine(data,"updates");Directory.CreateDirectory(updates);
    var installedFile=Path.Combine(updates,"installed-shell-sha256.txt");
    var installedExeHash=Path.Combine(updates,"installed-shell-exe-sha256.txt");
    var exeFile=Path.Combine(root,"Port79WindowsLite.exe");
    // The release marker alone is NOT proof the executable was replaced:
    // a failed/rolled-back update or a copied old EXE can leave it stale.
    // Always validate the on-disk EXE against the recorded EXE SHA.
    var markerMatches=File.Exists(installedFile)&&
      String.Equals(File.ReadAllText(installedFile).Trim(),digest,StringComparison.OrdinalIgnoreCase);
    var exeHash=File.Exists(installedExeHash)?File.ReadAllText(installedExeHash).Trim().ToLowerInvariant():"";
    if(markerMatches&&HashValid(exeHash)&&File.Exists(exeFile)&&
       String.Equals(Sha256(File.ReadAllBytes(exeFile)),exeHash,StringComparison.OrdinalIgnoreCase)){
     log("79號碼頭電腦版程式已核對最新版："+digest.Substring(0,12));
     return null;
    }
    if(markerMatches)log("版本紀錄存在但 EXE 尚未核對，重新驗證79號碼頭電腦版主程式，不會清除本機資料");
    var zip=Path.Combine(updates,"pending-windows-release.zip");
    // When the verified release is already staged, pressing "更新系統" again
    // must not download the same complete ZIP for a second time.
    byte[] bytes=null;
    if(File.Exists(zip)&&new FileInfo(zip).Length==asset.size){
     var cached=File.ReadAllBytes(zip);
     if(Sha256(cached)==digest){bytes=cached;log("沿用已驗證的79號碼頭電腦版更新檔，沒有再次下載");}
    }
    if(bytes==null){
     log("正在下載79號碼頭電腦版更新檔，無須自行取得 ZIP…");
     bytes=await client.GetByteArrayAsync(url).ConfigureAwait(true);
     if(bytes.Length>Limit||bytes.LongLength!=asset.size||Sha256(bytes)!=digest)
      throw new InvalidDataException("下載內容與 GitHub 正式發布 SHA-256 不一致；已取消更新");
     File.WriteAllBytes(zip,bytes);
    }
    // Before the previous app exits, verify paths cannot target local-data.
    using(var archive=ZipFile.OpenRead(zip)){
     if(archive.Entries.Count>2000)throw new InvalidDataException("Windows 更新檔包含過多項目");
     bool shell=false,site=false,updater=false;
     foreach(var entry in archive.Entries){
      var n=entry.FullName.Replace('\\','/');
      if(n.Contains("../")||n.StartsWith("/")||n.Contains(":")||n.StartsWith("./"))throw new InvalidDataException("不安全的更新檔案路徑");
      var parts=n.Split('/');
      if(parts.Length<2||parts[0]!="79號碼頭_Windows輕量版")throw new InvalidDataException("Windows 更新資料夾結構不正確");
      var relative=String.Join("/",parts.Skip(1));
      if(relative=="Port79WindowsLite.exe")shell=true;
      if(relative=="site/smart-punch/index.html")site=true;
      if(relative=="app/Port79Updater.exe")updater=true;
      if(relative.StartsWith("local-data/",StringComparison.OrdinalIgnoreCase)&&entry.Length!=0)throw new InvalidDataException("程式更新檔不得包含已寫入的私人資料");
      if(entry.Length>15*1024*1024)throw new InvalidDataException("單一更新程式檔超過安全上限");
     }
     if(!shell||!site||!updater)throw new InvalidDataException("下載 ZIP 缺少 Windows 主程式、原系統首頁或原生更新器");
     // A freshly unpacked official release has no installed-shell marker.
     // Compare all local shell/app files before treating it as an update;
     // site/ files have an independent updater and are intentionally excluded.
     bool identical=true,foundShell=false;
     var prefix="79號碼頭_Windows輕量版/";
     foreach(var entry in archive.Entries){
      var name=entry.FullName.Replace('\\','/');
      if(!name.StartsWith(prefix,StringComparison.Ordinal)||name.EndsWith("/")||
         name.StartsWith(prefix+"site/",StringComparison.Ordinal)||
         name.StartsWith(prefix+"local-data/",StringComparison.Ordinal))continue;
      var relative=name.Substring(prefix.Length);
      if(relative=="Port79WindowsLite.exe")foundShell=true;
      if(relative.Contains("../")||relative.Contains(":")){identical=false;break;}
      var local=Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar));
      if(!File.Exists(local)||new FileInfo(local).Length!=entry.Length){identical=false;break;}
      using(var stream=entry.Open())
      using(var memory=new MemoryStream()){
       stream.CopyTo(memory);
       if(Sha256(memory.ToArray())!=Sha256(File.ReadAllBytes(local))){identical=false;break;}
      }
     }
     if(foundShell&&identical){
      File.WriteAllText(installedExeHash,Sha256(File.ReadAllBytes(exeFile)));
      File.WriteAllText(installedFile,digest);
      log("79號碼頭電腦版程式檔案已與發布版本相同，已核對主程式並保留本機資料");
      return null;
     }
    }
    // Extract a fresh helper ONLY from the verified archive. This avoids a
    // broken older Port79Updater.exe causing repeated one-click failures.
    var helper=Path.Combine(updates,"verified-release-updater.exe");
    var nextHelper=helper+".next";
    try{
     using(var archive=ZipFile.OpenRead(zip)){
      var entry=archive.GetEntry("79號碼頭_Windows輕量版/app/Port79Updater.exe");
      if(entry==null||entry.Length<=0||entry.Length>15*1024*1024)
       throw new InvalidDataException("正式更新檔內缺少有效的原生更新器");
      using(var source=entry.Open())
      using(var target=new FileStream(nextHelper,FileMode.Create,FileAccess.Write,FileShare.None))
       source.CopyTo(target);
     }
     if(File.Exists(helper))File.Delete(helper);
     File.Move(nextHelper,helper);
    }finally{try{if(File.Exists(nextHelper))File.Delete(nextHelper);}catch{}}
    log("已從驗證完成的正式更新包準備原生更新工具，不需手動下載 ZIP");
    return new Prepared{Zip=zip,Digest=digest,Helper=helper};
   }
  }
  // Write parent-side diagnostics even if the native EXE cannot start Main().
  // Diagnostics are best-effort and must never interrupt a verified update.
  private static void HandoffAudit(string root,string message){
   try{
    var dir=Path.Combine(root,"local-data","logs");
    Directory.CreateDirectory(dir);
    var path=Path.Combine(dir,"windows-update-handoff.txt");
    if(File.Exists(path)&&new FileInfo(path).Length>256*1024)File.Delete(path);
    File.AppendAllText(path,DateTime.Now.ToString("o")+" "+message+Environment.NewLine,Encoding.UTF8);
   }catch{}
  }
  static string Quote(string s){
   if(String.IsNullOrEmpty(s)||s.IndexOf('"')>=0||s.IndexOf('\n')>=0||s.IndexOf('\r')>=0)throw new InvalidDataException("Windows 更新路徑含有不合法字元");
   return "\""+s+"\"";
  }
  public static async Task LaunchAsync(Prepared p,string root,int parentPid){
   if(p==null)throw new ArgumentNullException("p");
   if(parentPid<=0)throw new ArgumentOutOfRangeException("parentPid");
   if(!File.Exists(p.Helper))throw new FileNotFoundException(
    "找不到經正式更新檔驗證的79號碼頭更新工具；原程式保持執行。",p.Helper);
   var updateDir=Path.Combine(root,"local-data","updates");
   Directory.CreateDirectory(updateDir);
   var ready=Path.Combine(updateDir,"runner-ready-"+parentPid+".flag");
   var fail=Path.Combine(updateDir,"native-update-launch-error.txt");
   // Some Windows configurations block running a helper from local-data,
   // even when the same verified EXE is allowed beside the original app.
   // Retry from the app directory without downloading the ZIP again.
   var attempts=new[]{
    Path.Combine(updateDir,"native-launch-"+parentPid+"-"+Guid.NewGuid().ToString("N")+".exe"),
    Path.Combine(root,"app","native-recovery-"+parentPid+"-"+Guid.NewGuid().ToString("N")+".exe")
   };
   var reasons=new List<string>();
   for(int attempt=0;attempt<attempts.Length;attempt++){
    var launch=attempts[attempt];
    Process process=null;
    bool accepted=false;
    int? exitCode=null;
    try{
     if(File.Exists(ready))File.Delete(ready);
     if(File.Exists(fail))File.Delete(fail);
     Directory.CreateDirectory(Path.GetDirectoryName(launch));
     File.Copy(p.Helper,launch,false);
     HandoffAudit(root,"HANDOFF_BEGIN attempt="+(attempt+1)+" helper="+p.Helper+" launch="+launch);
     var psi=new ProcessStartInfo(launch){
      Arguments="--archive "+Quote(p.Zip)+" --install-root "+Quote(root)+
       " --parent-pid "+parentPid+" --expected-digest "+Quote(p.Digest)+
       " --ready-file "+Quote(ready),
      UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=root
     };
     process=Process.Start(psi);
     if(process==null)throw new InvalidOperationException("Windows 原生更新器未能建立程序");
     var deadline=DateTime.UtcNow.AddSeconds(30);
     while(DateTime.UtcNow<deadline){
      if(File.Exists(ready)&&File.ReadAllText(ready).Trim()=="ready:"+parentPid){
       accepted=!process.HasExited;
       if(accepted)break;
      }
      if(process.HasExited){exitCode=process.ExitCode;break;}
      await Task.Delay(200).ConfigureAwait(true);
     }
     if(accepted){
      HandoffAudit(root,"HANDOFF_READY_ACKNOWLEDGED parent="+parentPid+" attempt="+(attempt+1));
      return;
     }
     if(!process.HasExited){try{process.Kill();process.WaitForExit(3000);}catch{}}
     if(process.HasExited)exitCode=process.ExitCode;
     var nativeReason=File.Exists(fail)?File.ReadAllText(fail).Trim():"";
     var bootstrap=launch+".bootstrap-error.txt";
     var earlyReason=File.Exists(bootstrap)?File.ReadAllText(bootstrap).Trim():"";
     var log=Path.Combine(root,"local-data","logs","windows-upgrade.txt");
     HandoffAudit(root,"HANDOFF_NO_READY attempt="+(attempt+1)+" exit="+
      (exitCode.HasValue?exitCode.Value.ToString():"timeout")+
      " nativeReason="+(String.IsNullOrEmpty(nativeReason)?"none":SafeAudit(nativeReason))+
      " bootstrapReason="+(String.IsNullOrEmpty(earlyReason)?"none":SafeAudit(earlyReason))+
      " helperLogExists="+File.Exists(log));
     reasons.Add("第"+(attempt+1)+"次接手失敗："+(String.IsNullOrEmpty(nativeReason)?
      (String.IsNullOrEmpty(earlyReason)?"結束代碼 "+(exitCode.HasValue?exitCode.Value.ToString():"逾時"):earlyReason):nativeReason));
    }catch(Exception error){
     HandoffAudit(root,"HANDOFF_PROCESS_START_FAILED attempt="+(attempt+1)+
      " type="+error.GetType().Name+" code="+error.HResult+
      " message="+SafeAudit(error.Message));
     reasons.Add("第"+(attempt+1)+"次啟動失敗："+error.GetType().Name);
    }finally{
     try{if(File.Exists(ready))File.Delete(ready);}catch{}
     if(process!=null)process.Dispose();
     // Never remove a live accepted updater. Failed attempts are disposable
     // copies; all official/local data and the verified ZIP are preserved.
     if(!accepted){
      try{if(File.Exists(launch))File.Delete(launch);}catch{}
     }
    }
   }
   throw new InvalidOperationException(
    "79號碼頭電腦版更新工具無法接手，已自動嘗試兩種原生啟動位置；舊程式、本機資料及已驗證的更新包均保留。\n"+
    String.Join("；",reasons)+"\n"+
    "更新紀錄：local-data\\logs\\windows-update-handoff.txt；"+
    "原生紀錄：local-data\\logs\\windows-upgrade.txt（若沒有代表尚未進入原生程式）");
  }
  private static string SafeAudit(string value){
   if(String.IsNullOrEmpty(value))return "";
   var text=value.Replace("\r"," ").Replace("\n"," ");
   return text.Length>220?text.Substring(0,220):text;
  } }
}

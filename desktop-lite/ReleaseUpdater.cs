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
   var helper=Path.Combine(root,"app","Port79Updater.exe");
   if(!File.Exists(helper))throw new FileNotFoundException(
    "目前的79號碼頭電腦版缺少原生更新器 Port79Updater.exe。為保護 local-data，請只將最新版 ZIP 的程式檔更新一次；不用調整 PowerShell 安全設定。");
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
     bool shell=false,site=false;
     foreach(var entry in archive.Entries){
      var n=entry.FullName.Replace('\\','/');
      if(n.Contains("../")||n.StartsWith("/")||n.Contains(":")||n.StartsWith("./"))throw new InvalidDataException("不安全的更新檔案路徑");
      var parts=n.Split('/');
      if(parts.Length<2||parts[0]!="79號碼頭_Windows輕量版")throw new InvalidDataException("Windows 更新資料夾結構不正確");
      var relative=String.Join("/",parts.Skip(1));
      if(relative=="Port79WindowsLite.exe")shell=true;
      if(relative=="site/smart-punch/index.html")site=true;
      if(relative.StartsWith("local-data/",StringComparison.OrdinalIgnoreCase)&&entry.Length!=0)throw new InvalidDataException("程式更新檔不得包含已寫入的私人資料");
      if(entry.Length>15*1024*1024)throw new InvalidDataException("單一更新程式檔超過安全上限");
     }
     if(!shell||!site)throw new InvalidDataException("下載 ZIP 缺少 Windows 主程式或原系統首頁");
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
   // Native .NET helper is used instead of PowerShell, so Group Policy,
   // execution policy and blocked .ps1 files cannot silently prevent updates.
   if(!File.Exists(p.Helper))throw new FileNotFoundException(
    "找不到79號碼頭電腦版更新工具，現有程式不會關閉；請先修復更新程式檔案。",p.Helper);
   var updateDir=Path.Combine(root,"local-data","updates");
   Directory.CreateDirectory(updateDir);
   var ready=Path.Combine(updateDir,"runner-ready-"+parentPid+".flag");
   var fail=Path.Combine(updateDir,"native-update-launch-error.txt");
   if(File.Exists(ready))File.Delete(ready);
   if(File.Exists(fail))File.Delete(fail);
   // Running a verified copy prevents the helper itself from locking the
   // app/Port79Updater.exe file while installing an updated helper version.
   var launch=Path.Combine(updateDir,
    "native-launch-"+parentPid+"-"+Guid.NewGuid().ToString("N")+".exe");
   HandoffAudit(root,"HANDOFF_BEGIN helper="+p.Helper+" launch="+launch);
   File.Copy(p.Helper,launch,false);
   var psi=new ProcessStartInfo(launch){
    Arguments="--archive "+Quote(p.Zip)+" --install-root "+Quote(root)+
      " --parent-pid "+parentPid+" --expected-digest "+Quote(p.Digest)+
      " --ready-file "+Quote(ready),
    UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=root
   };
   Process process=null;
   bool accepted=false;
   int? exitCode=null;
   try{
    try{process=Process.Start(psi);}
    catch(Exception startError){
     HandoffAudit(root,"HANDOFF_PROCESS_START_FAILED type="+startError.GetType().Name+
      " code="+startError.HResult+" message="+startError.Message);
     throw;
    }
    if(process==null)throw new InvalidOperationException(
     "無法啟動 Windows 原生更新器；目前程式與本機資料均未變更。");
    var deadline=DateTime.UtcNow.AddSeconds(30);
    while(DateTime.UtcNow<deadline){
     if(File.Exists(ready)&&File.ReadAllText(ready).Trim()=="ready:"+parentPid){
      accepted=!process.HasExited;
      if(accepted)break;
     }
     if(process.HasExited){exitCode=process.ExitCode;break;}
     await Task.Delay(200).ConfigureAwait(true);
    }
    if(!accepted){
     if(!process.HasExited){
      try{process.Kill();process.WaitForExit(3000);}catch{}
     }
     if(process.HasExited)exitCode=process.ExitCode;
     var reason=File.Exists(fail)?File.ReadAllText(fail).Trim():"";
     var log=Path.Combine(root,"local-data","logs","windows-upgrade.txt");
     HandoffAudit(root,"HANDOFF_NO_READY exit="+(exitCode.HasValue?exitCode.Value.ToString():"timeout")+
      " nativeReason="+(String.IsNullOrEmpty(reason)?"none":reason)+
      " helperLogExists="+File.Exists(log));
     if(String.IsNullOrEmpty(reason))
      reason="原生更新器沒有回覆接手訊號"+(exitCode.HasValue?"（結束代碼 "+exitCode.Value+"）":"（啟動逾時）");
     throw new InvalidOperationException(
      "79號碼頭電腦版更新工具未完成接手，原有程式與本機資料已保留。\n"+
      reason+"\n"+
      "請查看診斷紀錄：local-data\\logs\\windows-update-handoff.txt；原生紀錄：local-data\\logs\\windows-upgrade.txt"+
      (File.Exists(log)?"":"（沒有原生紀錄；更新工具可能在開始執行前就結束，原因尚未確認）"));
    }
   }finally{
    if(accepted)HandoffAudit(root,"HANDOFF_READY_ACKNOWLEDGED parent="+parentPid);
    try{if(File.Exists(ready))File.Delete(ready);}catch{}
    if(process!=null)process.Dispose();
    // Do not delete the in-use helper; cleanup of old launcher copies occurs
    // when the next app session starts, outside the active updater process.
    if(!accepted){try{if(File.Exists(launch))File.Delete(launch);}catch{}}
   }
  }
 }
}

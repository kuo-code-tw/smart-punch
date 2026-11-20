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
  const string Api="https://api.github.com/repos/kuo-code-tw/smart-punch/releases/tags/port79-windows-lite-20261120";
  const string Url="https://github.com/kuo-code-tw/smart-punch/releases/download/port79-windows-lite-20261120/Port79-Windows-Lite.zip";
  const long Limit=30L*1024*1024;
  public sealed class GitAsset {public string name {get;set;} public string browser_download_url {get;set;} public string digest {get;set;} public long size {get;set;} }
  public sealed class GitRelease {public bool draft {get;set;} public GitAsset[] assets {get;set;} }
  public sealed class Prepared {public string Zip {get;set;} public string Digest {get;set;} public string Runner {get;set;} }
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer {MaxJsonLength=1000000};
  static bool HashValid(string text){return text?.Length==64&&text.All(x=>(x>='0'&&x<='9')||(x>='a'&&x<='f'));}
  static string Sha256(byte[] bytes){using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
  public static async Task<Prepared> PrepareAsync(string root,string data,Action<string> log){
   ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
   var runner=Path.Combine(root,"app","upgrade-windows.ps1");
   if(!File.Exists(runner))throw new FileNotFoundException("缺少內建更新工具 upgrade-windows.ps1，請確認整個程式資料夾完整。");
   using(var client=new HttpClient {Timeout=TimeSpan.FromSeconds(60)}){
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Port79-WindowsLite-Updater/1.0");
    client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
    var release=Json.Deserialize<GitRelease>(await client.GetStringAsync(Api).ConfigureAwait(true));
    if(release==null||release.draft)throw new InvalidDataException("未取得正式 Windows 發布資訊");
    var asset=release.assets?.SingleOrDefault(x=>x?.name=="Port79-Windows-Lite.zip");
    if(asset==null||asset.browser_download_url!=Url||asset.size<=0||asset.size>Limit||
      asset.digest==null||!asset.digest.StartsWith("sha256:",StringComparison.Ordinal))
      throw new InvalidDataException("Windows 發布檔缺少有效 SHA-256 或來源不符合預期");
    var digest=asset.digest.Substring(7).ToLowerInvariant();
    if(!HashValid(digest))throw new InvalidDataException("Windows 發布 SHA-256 格式錯誤");
    var updates=Path.Combine(data,"updates");Directory.CreateDirectory(updates);
    var installedFile=Path.Combine(updates,"installed-shell-sha256.txt");
    if(File.Exists(installedFile)&&String.Equals(File.ReadAllText(installedFile).Trim(),digest,StringComparison.OrdinalIgnoreCase)){
     log("Windows 主程式已是最新版本："+digest.Substring(0,12));
     return null;
    }
    var zip=Path.Combine(updates,"pending-windows-release.zip");
    // When the verified release is already staged, pressing "更新系統" again
    // must not download the same complete ZIP for a second time.
    byte[] bytes=null;
    if(File.Exists(zip)&&new FileInfo(zip).Length==asset.size){
     var cached=File.ReadAllBytes(zip);
     if(Sha256(cached)==digest){bytes=cached;log("沿用已驗證的 Windows 更新檔，沒有再次下載");}
    }
    if(bytes==null){
     log("首次自動下載正式 Windows 更新檔，無須使用者自行取得 ZIP…");
     bytes=await client.GetByteArrayAsync(Url).ConfigureAwait(true);
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
      File.WriteAllText(installedFile,digest);
      log("Windows 主程式檔案已與發佈版本相同，沒有重裝或重複下載");
      return null;
     }
    }
    return new Prepared{Zip=zip,Digest=digest,Runner=runner};
   }
  }
  static string Quote(string s){
   if(String.IsNullOrEmpty(s)||s.IndexOf('"')>=0||s.IndexOf('\n')>=0||s.IndexOf('\r')>=0)throw new InvalidDataException("Windows 更新路徑含有不合法字元");
   return "\""+s+"\"";
  }
  public static void Launch(Prepared p,string root,int parentPid){
   if(p==null)throw new ArgumentNullException("p");
   var psi=new ProcessStartInfo("powershell.exe"){
    Arguments="-NoProfile -ExecutionPolicy Bypass -File "+Quote(p.Runner)+" -Archive "+Quote(p.Zip)+
      " -InstallRoot "+Quote(root)+" -ParentPid "+parentPid+
      " -ExpectedDigest "+Quote(p.Digest),
    UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=root
   };
   var process=Process.Start(psi);
   if(process==null)throw new InvalidOperationException("無法啟動內建 Windows 更新工具");
  }
 }
}

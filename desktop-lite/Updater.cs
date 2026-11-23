using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace Port79Lite {
 // Updates only public site source files. Never copies, deletes, uploads or converts business records.
 public static class Updater {
  const string GitTree="https://api.github.com/repos/kuo-code-tw/smart-punch/git/trees/main?recursive=1";
  const string Published="https://kuo-code-tw.github.io/smart-punch/";
  const string SiteManifest=Published+"port79-site-files.json";
  const int LimitFiles=400;
  const int LimitBytes=30*1024*1024;
  private static readonly HashSet<string> PublicFolders=new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
   "assets","attendance","schedule","leave","hr","work-hours","aqc-efficiency","history-data",
   "settings","gate-dashboard","gate-import","yard-dashboard","data-cache","data-sources","previews"
  };
  private static readonly HashSet<string> Extensions=new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
   ".html",".js",".css",".json",".webp",".png",".jpg",".jpeg",".gif",".svg",".ico",".woff",".woff2",".ttf",".md"
  };
  public sealed class Entry {public string path {get;set;} public string sha {get;set;} public string type {get;set;} }
  public sealed class Tree {public bool truncated {get;set;} public Entry[] tree {get;set;} }
  public sealed class SiteTree {public string commit {get;set;} public Entry[] files {get;set;} }
  public sealed class Manifest {public Entry[] files {get;set;} public string baseBundleVersion {get;set;} }
  // A staged website update is valid only for the bundle from which it was
  // downloaded. Otherwise it could downgrade a newly extracted official ZIP.
  private static string BundleVersion(string site){
   var path=Path.Combine(site,"版本資訊.txt");
   if(!File.Exists(path))return "";
   var text=File.ReadAllText(path);
   var match=System.Text.RegularExpressions.Regex.Match(text,@"GitHub Commit:\s*([a-fA-F0-9]{40})");
   return match.Success?match.Groups[1].Value.ToLowerInvariant():"";
  }
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=int.MaxValue};

  public static bool Allowed(string file) {
   if(String.IsNullOrWhiteSpace(file)||file.Contains("\\")||file.StartsWith("/")||file.Contains("//"))return false;
   var parts=file.Split('/');
   if(parts.Any(p=>p.Length==0||p=="."||p==".."||p.StartsWith(".")))return false;
   if(parts.Length==1)return file=="index.html"||file=="port79-attendance-core.js";
   return PublicFolders.Contains(parts[0])&&Extensions.Contains(Path.GetExtension(file));
  }
  public static string SecureFile(string root,string file){
   if(!Allowed(file))throw new InvalidDataException("禁止更新非原網站程式檔："+file);
   var fullRoot=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
   var target=Path.GetFullPath(Path.Combine(fullRoot,file.Replace('/',Path.DirectorySeparatorChar)));
   if(!target.StartsWith(fullRoot,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("檔案路徑不安全");
   return target;
  }
  public static string Hash(byte[] data) {
   var prefix=Encoding.ASCII.GetBytes("blob "+data.Length+"\0");
   using(var sha=SHA1.Create()){
    var input=new byte[prefix.Length+data.Length];
    Buffer.BlockCopy(prefix,0,input,0,prefix.Length);
    Buffer.BlockCopy(data,0,input,prefix.Length,data.Length);
    return BitConverter.ToString(sha.ComputeHash(input)).Replace("-","").ToLowerInvariant();
   }
  }
  private static void SaveManifest(string path,Manifest manifest){
   Directory.CreateDirectory(Path.GetDirectoryName(path));
   var next=path+".next";
   File.WriteAllText(next,Json.Serialize(manifest));
   if(File.Exists(path))File.Delete(path);
   File.Move(next,path);
  }
  public static int ApplyIfVerified(string site,string data,Action<string> log){
   var updates=Path.Combine(data,"updates");
   var manifestFile=Path.Combine(updates,"pending.json");
   if(!File.Exists(manifestFile))return 0;
   var manifest=Json.Deserialize<Manifest>(File.ReadAllText(manifestFile));
   if(manifest?.files==null||manifest.files.Length>LimitFiles)throw new InvalidDataException("更新清單不完整");
   // Existing local-data/updates may contain a staged patch from an older
   // Windows ZIP. Never apply that patch over a newly extracted ZIP.
   var installedBundle=BundleVersion(site);
   if(installedBundle.Length>0&&
      !String.Equals(manifest.baseBundleVersion,installedBundle,StringComparison.OrdinalIgnoreCase)){
    File.Delete(manifestFile);
    log("已略過上一版 Windows 所留下的網站待更新檔；保留目前新 ZIP 的畫面與原始資料");
    return 0;
   }
   var stage=Path.Combine(updates,"stage");
   // Atomic validation stage: no site files changed until every staged SHA matches the official main tree.
   foreach(var e in manifest.files){
    if(e==null||e.type!="blob"||e.sha==null||e.sha.Length!=40)throw new InvalidDataException("更新檔清單損毀");
    var source=SecureFile(stage,e.path);
    if(!File.Exists(source)||Hash(File.ReadAllBytes(source))!=e.sha)throw new InvalidDataException("程式更新校驗未通過："+e.path);
   }
   var prior=new List<Tuple<string,byte[]>>();
   try {
    foreach(var e in manifest.files){
     var dest=SecureFile(site,e.path);
     var existed=File.Exists(dest)?File.ReadAllBytes(dest):null;
     prior.Add(Tuple.Create(dest,existed));
     Directory.CreateDirectory(Path.GetDirectoryName(dest));
     var next=dest+".new-port79";
     File.Copy(SecureFile(stage,e.path),next,true);
     if(File.Exists(dest))File.Delete(dest);
     File.Move(next,dest);
    }
    File.Delete(manifestFile);
    log("程式已校驗更新 "+manifest.files.Length+" 個檔案；私人資料未變更");
    return manifest.files.Length;
   }catch {
    for(int i=prior.Count-1;i>=0;i--){
     var p=prior[i];
     if(p.Item2==null){if(File.Exists(p.Item1))File.Delete(p.Item1);}
     else File.WriteAllBytes(p.Item1,p.Item2);
    }
    throw;
   }
  }
  public static async Task<int> StageFromOfficialAsync(string site,string data,Action<string> log) {
   var updates=Path.Combine(data,"updates");
   var pending=Path.Combine(updates,"pending.json");
   if(File.Exists(pending))return 0;
   ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
   using(var client=new HttpClient {Timeout=TimeSpan.FromSeconds(35)}){
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Port79-WindowsLite/1.0");
    Tree tree=null;
    try{
     // The same Pages deployment that serves the code publishes this
     // exact-commit manifest. Normal checks no longer consume GitHub API quota.
     var payload=await client.GetStringAsync(SiteManifest+"?checked="+
      DateTimeOffset.UtcNow.ToUnixTimeSeconds()).ConfigureAwait(false);
     if(payload.Length>180000)throw new InvalidDataException("正式網站程式清單過大");
     var published=Json.Deserialize<SiteTree>(payload);
     if(published==null||
        !System.Text.RegularExpressions.Regex.IsMatch(published.commit??"",
         "^[a-f0-9]{40}$")||
        published.files==null||published.files.Length==0||
        published.files.Length>LimitFiles||
        published.files.Any(e=>e==null||e.type!="blob"||!Allowed(e.path)||
         !System.Text.RegularExpressions.Regex.IsMatch(e.sha??"","^[a-f0-9]{40}$"))||
        published.files.Select(e=>e.path).Distinct(StringComparer.Ordinal).Count()!=published.files.Length)
      throw new InvalidDataException("正式網站程式清單校驗失敗");
     tree=new Tree{truncated=false,tree=published.files};
     log("已從79號碼頭正式網站核對程式清單，不使用 GitHub API 次數額度");
    }catch(HttpRequestException e){
     // A pre-manifest deployment may still be used; retain the historic
     // GitHub API path ONLY as compatibility fallback.
     log("網站更新清單暫無法連線，使用原有 GitHub 核對方式："+e.Message);
     var payload=await client.GetStringAsync(GitTree).ConfigureAwait(false);
     tree=Json.Deserialize<Tree>(payload);
    }
    if(tree==null||tree.truncated||tree.tree==null)throw new InvalidDataException("官方目錄資料不完整");
    var matches=tree.tree.Where(e=>e!=null&&e.type=="blob"&&Allowed(e.path)&&e.sha!=null&&e.sha.Length==40).ToArray();
    if(matches.Length>LimitFiles)throw new InvalidDataException("更新檔案數量超過安全上限");
    var changed=matches.Where(e=>{
     var file=SecureFile(site,e.path);
     return !File.Exists(file)||Hash(File.ReadAllBytes(file))!=e.sha;
    }).ToArray();
    if(changed.Length==0){log("程式檔案與 GitHub 正式版一致");return 0;}
    var stage=Path.Combine(updates,"stage");
    if(Directory.Exists(stage))Directory.Delete(stage,true);
    Directory.CreateDirectory(stage);
    int used=0;
    for(int i=0;i<changed.Length;i++){
     var e=changed[i];
     var url=Published+String.Join("/",e.path.Split('/').Select(Uri.EscapeDataString))+"?winlite="+e.sha.Substring(0,12);
     var bytes=await client.GetByteArrayAsync(url).ConfigureAwait(false);
     used+=bytes.Length;
     if(used>LimitBytes||bytes.Length>12*1024*1024)throw new InvalidDataException("程式更新檔案過大");
     if(Hash(bytes)!=e.sha)throw new InvalidDataException("正式網站尚未發布最新版本，保持現有程式："+e.path);
     var target=SecureFile(stage,e.path);
     Directory.CreateDirectory(Path.GetDirectoryName(target));
     File.WriteAllBytes(target,bytes);
     log("程式更新已下載 "+(i+1)+"／"+changed.Length+"（僅程式，不是資料庫）");
    }
    SaveManifest(pending,new Manifest {files=changed,baseBundleVersion=BundleVersion(site)});
    return changed.Length;
   }
  }
 }
}

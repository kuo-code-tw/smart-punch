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
  public sealed class Manifest {public Entry[] files {get;set;} }
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
    var payload=await client.GetStringAsync(GitTree).ConfigureAwait(false);
    var tree=Json.Deserialize<Tree>(payload);
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
    SaveManifest(pending,new Manifest {files=changed});
    return changed.Length;
   }
  }
 }
}

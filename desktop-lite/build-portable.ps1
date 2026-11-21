$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$out=Join-Path $PSScriptRoot 'out'
$dist=Join-Path $PSScriptRoot 'dist'
$target=Join-Path $dist '79號碼頭_Windows輕量版'
Remove-Item $out,$dist -Recurse -Force -ErrorAction SilentlyContinue
& (Join-Path $PSScriptRoot 'generate-icon.ps1')
if(!(Test-Path (Join-Path $PSScriptRoot 'Port79Icon.ico'))){throw 'Windows app icon generation failed'}
dotnet build (Join-Path $PSScriptRoot 'Port79Lite.csproj') --configuration Release --output $out /p:Platform=x64 --no-restore
if($LASTEXITCODE -ne 0){throw 'C# native build failed'}
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item (Join-Path $out '*') $target -Recurse -Force
$public=@('assets','attendance','schedule','leave','hr','work-hours','aqc-efficiency','history-data','settings','gate-dashboard','gate-import','yard-dashboard','data-cache','data-sources','previews')
$site=Join-Path $target 'site/smart-punch'
New-Item -ItemType Directory -Force $site | Out-Null
foreach($folder in $public){
 $src=Join-Path $repo $folder
 if(!(Test-Path $src)){throw "Missing original folder $folder"}
 Copy-Item $src (Join-Path $site $folder) -Recurse -Force
}
foreach($f in @('index.html','port79-attendance-core.js')){
 Copy-Item (Join-Path $repo $f) (Join-Path $site $f) -Force
}
$app=Join-Path $target 'app'
New-Item -ItemType Directory -Force $app | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'app/login-progress.js') (Join-Path $app 'login-progress.js') -Force
Copy-Item (Join-Path $PSScriptRoot 'app/upgrade-windows.ps1') (Join-Path $app 'upgrade-windows.ps1') -Force
foreach($p in @('BrowserProfile','updates','logs','backups')){
 New-Item -ItemType Directory -Force (Join-Path $target "local-data/$p") | Out-Null
}
@'
79號碼頭 Windows 輕量資料夾版

1. 請解壓縮整個 ZIP，不要單獨複製 EXE。
2. 開啟 Port79WindowsLite.exe，會從本機 site/smart-punch 讀取原系統程式畫面。
3. 沒有登入之前，不會下載七大系統的私人雲端資料。正式管理員或超級管理員登入後，才顯示下載進度並背景讀取到 local-data/BrowserProfile 快取。
4. 關閉視窗會縮小到系統匣，在右下角圖示選「真正結束程式」才完全退出。
5. 程式檔（HTML/JS/CSS）可檢查正式網站更新，校驗後在下次啟動套用。不會變更 local-data。本 EXE 核心本身若更改，仍要下載新版 ZIP。
6. 需要 Windows 10/11、.NET Framework 4.8 及 Microsoft Edge WebView2 Runtime（大多數 Windows 11 已有）。如果沒有 WebView2 Runtime，須先安裝。
7. 本機快取不是完整備份。任何新增、審批、刪除、匯入仍走正式原系統雲端權限。
8. 這是測試版，尚未拿正式帳密完成登入雲端與跨帳號同步的實機驗收。

注意：不要移動或更改 site/smart-punch 的資料夾名稱和檔案，避免影響原系統引用路徑。
'@ | Set-Content (Join-Path $target '使用說明.txt') -Encoding UTF8
$exe=Join-Path $target 'Port79WindowsLite.exe'
if(!(Test-Path $exe)){throw "Missing EXE"}
foreach($f in @('index.html','attendance/index.html','schedule/index.html','hr/index.html','leave/index.html','assets/port79-data-cache.js','settings/index.html')){
 $expected=(Get-FileHash (Join-Path $repo $f) -Algorithm SHA256).Hash
 $actual=(Get-FileHash (Join-Path $site $f) -Algorithm SHA256).Hash
 if($expected -ne $actual){throw "Original source is not byte-identical: $f"}
}
Get-ChildItem (Join-Path $target 'local-data') -Recurse -File | ForEach-Object{throw "Delivery must contain no preloaded database or browser profile: $($_.FullName)"}
$zip=Join-Path $dist '79號碼頭_Windows輕量資料夾版.zip'
Compress-Archive -Path $target -DestinationPath $zip -CompressionLevel Optimal -Force
$size=(Get-Item $zip).Length
if($size -gt 31457280){throw "LITE BUILD TOO BIG $size bytes (limit 30 MB)"}
$hash=(Get-FileHash $zip -Algorithm SHA256).Hash
("SHA-256: "+$hash+[Environment]::NewLine+"Bytes: "+$size) | Set-Content (Join-Path $dist 'SHA256.txt')
Write-Host "PASS native lightweight Windows folder build, unchanged original site, no preloaded database"
Write-Host "ZIP SIZE BYTES: $size"
Write-Host "SHA256: $hash"

$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
# Native, read-only UI smoke using a fake old website and an empty test profile.
# Never touch real users' Windows profiles or existing production data.
$base=Join-Path $env:RUNNER_TEMP 'port79-auto-restart-after-update'
if(Test-Path $base){Remove-Item -LiteralPath $base -Recurse -Force}
New-Item -ItemType Directory -Force -Path $base | Out-Null
$dist=(Resolve-Path 'desktop-lite/dist').Path
$archive=Join-Path $dist '79號碼頭_Windows輕量資料夾版.zip'
if(!(Test-Path $archive)){throw 'Native release ZIP not built'}
$sha=(Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($archive,$base)
$root=Join-Path $base '79號碼頭_Windows輕量版'
$site=Join-Path $root 'site/smart-punch/index.html'
if(!(Test-Path $site)){throw 'Release installation missing homepage'}
New-Item -ItemType Directory -Force -Path (Join-Path $root 'local-data/BrowserProfile') | Out-Null
$keep=Join-Path $root 'local-data/BrowserProfile/keep.dat'
[IO.File]::WriteAllText($keep,'SAVED PRIVATE DATA')
# Deliberately stale static file must be replaced while user profile survives.
[IO.File]::WriteAllText($site,'OLD WEBSITE CONTENT')
$childPid=0
try{
 & ./desktop-lite/app/upgrade-windows.ps1 -Archive $archive -InstallRoot $root -ParentPid 0 -ExpectedDigest $sha
 if($LASTEXITCODE -ne 0){throw 'Native updater returned a nonzero exit code'}
 $upgradeLog=Join-Path $root 'local-data/logs/windows-upgrade.txt'
 $lines=Get-Content -LiteralPath $upgradeLog
 $launch=@($lines | Where-Object {$_ -match 'AUTO_RESTART_SUCCESS pid=([0-9]+)'})[-1]
 if(!$launch){throw 'Update completed without automatically reopening Windows app'}
 $match=[regex]::Match([string]$launch,'AUTO_RESTART_SUCCESS pid=([0-9]+)')
 $childPid=[int]$match.Groups[1].Value
 if(!(Get-Process -Id $childPid -ErrorAction SilentlyContinue)){throw 'Relaunched Windows app not running'}
 if([IO.File]::ReadAllText($keep) -ne 'SAVED PRIVATE DATA'){throw 'Auto update damaged BrowserProfile'}
 if([IO.File]::ReadAllText($site) -eq 'OLD WEBSITE CONTENT'){throw 'Update did not apply newer system code'}
 $appLog=Join-Path $root 'local-data/logs/windows-lite.log'
 $ready=$false
 for($i=0;$i -lt 30;$i++){
  Start-Sleep -Seconds 1
  if(Test-Path $appLog){
   $log=Get-Content -LiteralPath $appLog
   if($log -match 'navigation success: https://port79assets.example/smart-punch/'){$ready=$true;break}
   if($log -match 'navigation failure:'){throw 'Auto reopened app but local homepage failed to load'}
  }
  if(!(Get-Process -Id $childPid -ErrorAction SilentlyContinue)){throw 'Auto reopened app exited before homepage loaded'}
 }
 if(!$ready){throw 'Auto reopened app did not reach homepage'}
 Write-Host 'PASS Windows update automatically reopened native homepage, retained private profile and applied new website code'
}finally{
 if($childPid -gt 0){Stop-Process -Id $childPid -Force -ErrorAction SilentlyContinue}
 Get-Process Port79WindowsLite -ErrorAction SilentlyContinue |
  Where-Object {$_.Path -like ($root+'*')} |
  Stop-Process -Force -ErrorAction SilentlyContinue
}

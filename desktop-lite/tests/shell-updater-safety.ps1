$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$code=$null;$parseErrors=$null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path './desktop-lite/app/upgrade-windows.ps1'),[ref]$code,[ref]$parseErrors)|Out-Null
if($parseErrors.Count){throw ('PowerShell updater syntax invalid: '+($parseErrors -join ', '))}
$base=Join-Path $env:RUNNER_TEMP 'port79-shell-update-safety'
if(Test-Path $base){Remove-Item $base -Recurse -Force}
$root=Join-Path $base 'installed'
$pkg=Join-Path $base 'package/79號碼頭_Windows輕量版'
New-Item -ItemType Directory -Force (Join-Path $root 'local-data/BrowserProfile'),(Join-Path $pkg 'site/smart-punch'),(Join-Path $root 'site/smart-punch') | Out-Null
'MY PRIVATE DATA' | Set-Content (Join-Path $root 'local-data/BrowserProfile/keep.dat')
'old' | Set-Content (Join-Path $root 'Port79WindowsLite.exe')
'old site' | Set-Content (Join-Path $root 'site/smart-punch/index.html')
'new' | Set-Content (Join-Path $pkg 'Port79WindowsLite.exe')
'new site' | Set-Content (Join-Path $pkg 'site/smart-punch/index.html')
$zip=Join-Path $base 'mock-release.zip'
Compress-Archive -Path $pkg -DestinationPath $zip -Force
$digest=(Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
$ready=Join-Path $root 'local-data/updates/runner-ready-0.flag'
& ./desktop-lite/app/upgrade-windows.ps1 -Archive $zip -InstallRoot $root -ParentPid 0 -ExpectedDigest $digest -ReadyFile $ready -TestOnly
if(!(Test-Path $ready)){throw 'No native updater handoff marker after verified release'}
if((Get-Content $ready -Raw).Trim() -ne 'ready:0'){throw 'Updater handoff marker content incorrect'}
Remove-Item $ready -Force
if((Get-Content (Join-Path $root 'Port79WindowsLite.exe') -Raw).Trim() -ne 'new'){throw 'Executable not updated'}
if((Get-Content (Join-Path $root 'site/smart-punch/index.html') -Raw).Trim() -ne 'new site'){throw 'Original site not updated'}
if((Get-Content (Join-Path $root 'local-data/BrowserProfile/keep.dat') -Raw).Trim() -ne 'MY PRIVATE DATA'){throw 'User data was changed'}
if((Get-Content (Join-Path $root 'local-data/updates/installed-shell-sha256.txt') -Raw).Trim() -ne $digest){throw 'Installed SHA version not saved'}
$exeHash=(Get-Content (Join-Path $root 'local-data/updates/installed-shell-exe-sha256.txt') -Raw).Trim()
$actualExeHash=(Get-FileHash -LiteralPath (Join-Path $root 'Port79WindowsLite.exe') -Algorithm SHA256).Hash.ToLowerInvariant()
if($exeHash -ne $actualExeHash){throw 'Installed EXE fingerprint missing or stale'}
$old=(Get-Content (Join-Path $root 'Port79WindowsLite.exe') -Raw)
$rejected=$false
try{
 & ./desktop-lite/app/upgrade-windows.ps1 -Archive $zip -InstallRoot $root -ParentPid 0 -ExpectedDigest ('0'*64) -ReadyFile $ready -TestOnly
}catch{$rejected=$true}
if(!$rejected){throw 'Wrong SHA must be rejected'}
if(Test-Path $ready){throw 'Rejected release must not signal updater ready'}
if((Get-Content (Join-Path $root 'Port79WindowsLite.exe') -Raw) -ne $old){throw 'Wrong SHA changed executable'}
if((Get-Content (Join-Path $root 'local-data/BrowserProfile/keep.dat') -Raw).Trim() -ne 'MY PRIVATE DATA'){throw 'Reject path damaged user data'}
Write-Host 'PASS one-click shell update, SHA-256 verification, rollback, unchanged local-data cache'

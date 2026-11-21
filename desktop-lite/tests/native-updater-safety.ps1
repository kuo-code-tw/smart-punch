$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
# Exercise compiled native helper with mock EXEs, no PowerShell invocation
# inside the production updater and no credentials or private downloads.
$helper=(Resolve-Path 'desktop-lite/updater-out/Port79Updater.exe').Path
$base=Join-Path $env:RUNNER_TEMP 'port79-native-update-safety'
if(Test-Path $base){Remove-Item $base -Recurse -Force}
$root=Join-Path $base 'installed'
$pkg=Join-Path $base 'package/79號碼頭_Windows輕量版'
$updates=Join-Path $root 'local-data/updates'
$private=Join-Path $root 'local-data/BrowserProfile/keep.dat'
New-Item -ItemType Directory -Force $updates,(Split-Path $private),(Join-Path $pkg 'site/smart-punch'),(Join-Path $pkg 'app'),(Join-Path $root 'site/smart-punch') | Out-Null
'MY PRIVATE DATA' | Set-Content -LiteralPath $private
'old executable' | Set-Content (Join-Path $root 'Port79WindowsLite.exe')
'old website' | Set-Content (Join-Path $root 'site/smart-punch/index.html')
'new executable' | Set-Content (Join-Path $pkg 'Port79WindowsLite.exe')
'new website' | Set-Content (Join-Path $pkg 'site/smart-punch/index.html')
'new helper' | Set-Content (Join-Path $pkg 'app/Port79Updater.exe')
$archive=Join-Path $updates 'pending-windows-release.zip'
Compress-Archive -Path $pkg -DestinationPath $archive -Force
$digest=(Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$ready=Join-Path $updates 'runner-ready-0.flag'
function Run-Helper([string]$sha){
 $psi=[Diagnostics.ProcessStartInfo]::new($helper)
 $psi.UseShellExecute=$false
 $psi.CreateNoWindow=$true
 $psi.Arguments='--archive "'+$archive+'" --install-root "'+$root+'" --parent-pid 0 --expected-digest "'+$sha+'" --ready-file "'+$ready+'" --test-only'
 $p=[Diagnostics.Process]::Start($psi)
 if(!$p){throw 'Native helper did not launch'}
 try{if(!$p.WaitForExit(45000)){$p.Kill();throw 'Native helper hung'};return $p.ExitCode}
 finally{$p.Dispose()}
}
try{
 $code=Run-Helper $digest
 if($code -ne 0){throw 'Valid native mock update failed'}
 if(!(Test-Path $ready) -or (Get-Content $ready -Raw).Trim() -ne 'ready:0'){throw 'Native handoff not acknowledged'}
 if((Get-Content (Join-Path $root 'Port79WindowsLite.exe') -Raw).Trim() -ne 'new executable'){throw 'Main EXE not updated'}
 if((Get-Content (Join-Path $root 'site/smart-punch/index.html') -Raw).Trim() -ne 'new website'){throw 'Website not updated'}
 if((Get-Content $private -Raw).Trim() -ne 'MY PRIVATE DATA'){throw 'User data was changed'}
 if((Get-Content (Join-Path $updates 'installed-shell-sha256.txt') -Raw).Trim() -ne $digest){throw 'Missing verified installed digest'}
 if((Get-Content (Join-Path $updates 'installed-shell-exe-sha256.txt') -Raw).Trim() -ne (Get-FileHash (Join-Path $root 'Port79WindowsLite.exe') -Algorithm SHA256).Hash.ToLowerInvariant()){throw 'Wrong installed EXE hash'}
 Remove-Item -LiteralPath $ready -Force
 $failure=Run-Helper ('0'*64)
 if($failure -eq 0){throw 'Bad SHA incorrectly accepted'}
 if(Test-Path $ready){throw 'Unverified archive signaled update ready'}
 if((Get-Content $private -Raw).Trim() -ne 'MY PRIVATE DATA'){throw 'Bad SHA damaged user data'}
 if((Get-Content (Join-Path $root 'Port79WindowsLite.exe') -Raw).Trim() -ne 'new executable'){throw 'Bad SHA replaced good program'}
 $log=Join-Path $root 'local-data/logs/windows-upgrade.txt'
 if(!(Test-Path $log)){throw 'Native updater did not write diagnostic log'}
 if(-not ((Get-Content $log -Raw) -match 'NATIVE_UPDATER_STARTED')){throw 'Native update logs missing startup'}
 Write-Host 'PASS native updater: independent executable, real SHA validation, private cache kept, invalid ZIP rejected, no PowerShell'
}finally{
 if(Test-Path $base){Remove-Item $base -Recurse -Force -ErrorAction SilentlyContinue}
}

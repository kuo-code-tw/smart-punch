$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
# Real GUI restart through the compiled .NET updater, not a .ps1 script.
$root=(Resolve-Path 'desktop-lite/dist/79號碼頭_Windows輕量版').Path
$zip=(Resolve-Path 'desktop-lite/dist/79號碼頭_Windows輕量資料夾版.zip').Path
$updates=Join-Path $root 'local-data/updates'
$log=Join-Path $root 'local-data/logs/windows-upgrade.txt'
New-Item -ItemType Directory -Force $updates | Out-Null
$archive=Join-Path $updates 'pending-windows-release.zip'
Copy-Item -LiteralPath $zip -Destination $archive -Force
$digest=(Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$runner=Join-Path $updates 'native-smoke-runner.exe'
Copy-Item (Join-Path $root 'app/Port79Updater.exe') $runner -Force
$ready=Join-Path $updates 'runner-ready-0.flag'
if(Test-Path $ready){Remove-Item -LiteralPath $ready -Force}
$psi=[Diagnostics.ProcessStartInfo]::new($runner)
$psi.UseShellExecute=$false
$psi.CreateNoWindow=$true
$psi.Arguments='--archive "'+$archive+'" --install-root "'+$root+'" --parent-pid 0 --expected-digest "'+$digest+'" --ready-file "'+$ready+'"'
try{
 $p=[Diagnostics.Process]::Start($psi)
 if(!$p){throw 'Native updater did not launch'}
 try{
  if(!$p.WaitForExit(90000)){$p.Kill();throw 'Native update smoke timed out'}
  if($p.ExitCode -ne 0){throw ('Native update exited with '+$p.ExitCode+'; '+(Get-Content $log -Tail 12 -ErrorAction SilentlyContinue))}
 }finally{$p.Dispose()}
 if(!(Test-Path $ready) -or (Get-Content $ready -Raw).Trim() -ne 'ready:0'){throw 'Native updater did not acknowledge startup'}
 $text=Get-Content $log -Raw
 foreach($key in @('NATIVE_ARCHIVE_SHA256_OK','UPDATER_READY parent=0','FILES_APPLIED','WINDOW_VISIBLE_CONFIRMED','AUTO_RESTART_SUCCESS')){
  if(!$text.Contains($key)){throw ('Missing native update step: '+$key)}
 }
 if((Get-Content (Join-Path $updates 'installed-shell-sha256.txt') -Raw).Trim() -ne $digest){throw 'Native updater did not record installed release SHA'}
 # Verify the restarted native background worker initializes without fresh login.
 $liteLog=Join-Path $root 'local-data/logs/windows-lite.log'
 $backgroundReady=$false
 for($i=0;$i -lt 36;$i++){
  if(Test-Path $liteLog){
   $state=Get-Content $liteLog -Raw -ErrorAction SilentlyContinue
   if($state -match 'background worker ready'){$backgroundReady=$true;break}
   if($state -match 'background sync init:'){throw 'Restarted background worker failed'}
  }
  Start-Sleep -Milliseconds 500
 }
 if(!$backgroundReady){throw 'Restarted app background WebView2 worker did not initialize'}
 Write-Host 'PASS real native updater: SHA-256 verified, safe file install, visible Windows UI auto-restart and background worker'
}finally{
 Get-Process -Name 'Port79WindowsLite' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

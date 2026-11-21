$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
# Exercise actual Windows GUI update and restart without credentials.
$root=(Resolve-Path 'desktop-lite/dist/79號碼頭_Windows輕量版').Path
$archive=(Resolve-Path 'desktop-lite/dist/79號碼頭_Windows輕量資料夾版.zip').Path
$exe=Join-Path $root 'Port79WindowsLite.exe'
$log=Join-Path $root 'local-data/logs/windows-upgrade.txt'
$ready=Join-Path $root 'local-data/updates/runner-ready-0.flag'
if(!(Test-Path $exe) -or !(Test-Path $archive)){throw 'Missing native EXE or release ZIP'}
if(Test-Path $log){Remove-Item -LiteralPath $log -Force}
if(Test-Path $ready){Remove-Item -LiteralPath $ready -Force}
$digest=(Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
try{
  & ./desktop-lite/app/upgrade-windows.ps1 -Archive $archive -InstallRoot $root -ParentPid 0 -ExpectedDigest $digest -ReadyFile $ready
  if(!(Test-Path $log)){throw 'Updater did not create a log'}
  $lines=Get-Content -LiteralPath $log
  if(-not ($lines -match 'UPDATER_READY parent=0')){throw 'Updater did not acknowledge verified handoff'}
  if(-not ($lines -match 'WINDOW_VISIBLE_CONFIRMED')){throw 'Updated app did not prove visible main window'}
  if(-not ($lines -match 'AUTO_RESTART_SUCCESS')){throw 'Updated native program did not restart'}
  $marker=Join-Path $root 'local-data/updates/installed-shell-sha256.txt'
  if(!(Test-Path $marker) -or (Get-Content -LiteralPath $marker -Raw).Trim() -ne $digest){
    throw 'Updater did not record verified release digest'
  }
  # The background worker must actually initialize inside Windows WebView2.
  # A source-only check cannot prove its off-screen browser context survives.
  $nativeLog=Join-Path $root 'local-data/logs/windows-lite.log'
  $backgroundReady=$false
  for($i=0;$i -lt 36;$i++){
    if(Test-Path $nativeLog){
      $text=Get-Content -LiteralPath $nativeLog -Raw -ErrorAction SilentlyContinue
      if($text -match 'background worker ready'){$backgroundReady=$true;break}
      if($text -match 'background sync init:'){
        throw ('Native background worker failed to load: '+($text -split 'background sync init:')[-1].Trim())
      }
    }
    Start-Sleep -Milliseconds 500
  }
  if(!$backgroundReady){throw 'Windows WebView2 background cloud worker did not initialize'}
  Write-Host 'PASS Windows native smoke: SHA-256, visible homepage, automatic restart and persistent background worker'
}finally{
  Get-Process -Name 'Port79WindowsLite' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
# Exercise the ACTUAL attendance/index.html in the native WebView2 virtual
# host. Read-only: no login token, employee identity, or attendance writes.
$root=(Resolve-Path 'desktop-lite/dist/79號碼頭_Windows輕量版').Path
$exe=Join-Path $root 'Port79WindowsLite.exe'
$log=Join-Path $root 'local-data/logs/windows-lite.log'
if(!(Test-Path $exe)){throw 'Windows EXE missing for attendance inline smoke'}
Get-Process -Name 'Port79WindowsLite' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
if(Test-Path $log){Remove-Item -LiteralPath $log -Force}
$p=Start-Process -FilePath $exe -ArgumentList '--port79-verify-attendance-inline' -WorkingDirectory $root -PassThru
if(!$p){throw 'Windows EXE could not launch the attendance iframe test'}
try{
 $passed=$false
 for($i=0;$i -lt 110;$i++){
  Start-Sleep -Milliseconds 500
  if(Test-Path $log){
   $text=Get-Content -LiteralPath $log -Raw -ErrorAction SilentlyContinue
   if($text -match 'ATTENDANCE INLINE CHECK: PASS same-origin real attendance frame handshake'){
    $passed=$true;break
   }
   if($text -match 'ATTENDANCE INLINE CHECK: FAIL'){
    throw ('Real attendance iframe failed native handshake: '+
      ($text -split 'ATTENDANCE INLINE CHECK: FAIL')[-1].Split([Environment]::NewLine)[0])
   }
  }
  $p.Refresh()
  if($p.HasExited){
   $details=if(Test-Path -LiteralPath $log){Get-Content -LiteralPath $log -Tail 12 -ErrorAction SilentlyContinue}
   throw ("EXE exited before proving the real attendance iframe handshake (exit $($p.ExitCode)). " +
     ($details -join [Environment]::NewLine))
  }
 }
 if(!$passed){throw 'Real attendance iframe did not respond in 55 seconds; no production release'}
 Write-Host 'PASS real Windows WebView2: attendance HTML is embedded and sends origin-verified handshake, no form writes'
}finally{
 try{$p.Refresh();if(!$p.HasExited){$p.Kill();$p.WaitForExit(8000)}}catch{}
 $p.Dispose()
 Get-Process -Name 'Port79WindowsLite' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

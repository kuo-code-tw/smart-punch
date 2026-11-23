$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
# Reproduces the operator's error on real Windows: .NET BaseDirectory ends
# with a slash, and an unescaped closing quote can swallow --parent-pid.
# Executes a disposable mock release only; no private or production data.
$source=Get-Content 'desktop-lite/ReleaseUpdater.cs' -Raw -Encoding UTF8
$match=[regex]::Match($source,'(?s)  static string Quote\(string s\)\{.*?\r?\n  \}')
if(!$match.Success){throw 'Missing actual native handoff path quoting implementation'}
$method=$match.Value.Replace('static string Quote(string s)','public static string Quote(string s)')
$probe='using System; using System.IO; public class Port79PathQuoteProbe {'+[Environment]::NewLine+$method+[Environment]::NewLine+'}'
Add-Type -TypeDefinition $probe -Language CSharp
$base=Join-Path $env:RUNNER_TEMP 'port79 native command quote smoke'
if(Test-Path $base){Remove-Item $base -Recurse -Force}
$root=Join-Path $base 'installed program'
$pkg=Join-Path $base 'package/79號碼頭_Windows輕量版'
$updates=Join-Path $root 'local-data/updates'
$private=Join-Path $root 'local-data/BrowserProfile/private-keep.dat'
$log=Join-Path $root 'local-data/logs/windows-upgrade.txt'
New-Item -ItemType Directory -Force $updates,(Split-Path $private),(Join-Path $pkg 'site/smart-punch'),(Join-Path $pkg 'app'),(Join-Path $root 'site/smart-punch') | Out-Null
'USER PRIVATE DATA' | Set-Content $private
'old exe' | Set-Content (Join-Path $root 'Port79WindowsLite.exe')
'old site' | Set-Content (Join-Path $root 'site/smart-punch/index.html')
'new exe' | Set-Content (Join-Path $pkg 'Port79WindowsLite.exe')
'new site' | Set-Content (Join-Path $pkg 'site/smart-punch/index.html')
'new updater' | Set-Content (Join-Path $pkg 'app/Port79Updater.exe')
$zip=Join-Path $updates 'pending-windows-release.zip'
Compress-Archive -Path $pkg -DestinationPath $zip -Force
$digest=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
$ready=Join-Path $updates 'runner-ready-0.flag'
$helper=(Resolve-Path 'desktop-lite/updater-out/Port79Updater.exe').Path
try {
 $trailingRoot=$root+'\'
 $quotedRoot=[Port79PathQuoteProbe]::Quote($trailingRoot)
 if(!$quotedRoot.EndsWith('\\'+'"')){throw 'The closing quote was not escaped for the trailing directory separator'}
 $args='--archive '+[Port79PathQuoteProbe]::Quote($zip)+
  ' --install-root '+$quotedRoot+
  ' --parent-pid 0 --expected-digest '+[Port79PathQuoteProbe]::Quote($digest)+
  ' --ready-file '+[Port79PathQuoteProbe]::Quote($ready)+' --test-only'
 $psi=[Diagnostics.ProcessStartInfo]::new($helper)
 $psi.Arguments=$args
 $psi.UseShellExecute=$false
 $psi.CreateNoWindow=$true
 $psi.WorkingDirectory=$root
 $p=[Diagnostics.Process]::Start($psi)
 if(!$p){throw 'Native helper process did not start'}
 try{
  if(!$p.WaitForExit(45000)){$p.Kill();throw 'Native helper timed out when parsing trailing root path'}
  if($p.ExitCode -ne 0){throw ('Native helper exit '+$p.ExitCode+' when install root ended in backslash')}
 }finally{$p.Dispose()}
 if(!(Test-Path $log)){throw 'Native program never reached its first log line; command-line arguments were corrupted'}
 $text=Get-Content $log -Raw
 foreach($step in @('NATIVE_UPDATER_STARTED','NATIVE_ARCHIVE_SHA256_OK','UPDATER_READY parent=0','FILES_APPLIED')){
  if(!$text.Contains($step)){throw ('Native helper did not reach expected milestone: '+$step)}
 }
 if((Get-Content $private -Raw).Trim() -ne 'USER PRIVATE DATA'){throw 'User local-data changed'}
 if((Get-Content (Join-Path $root 'Port79WindowsLite.exe') -Raw).Trim() -ne 'new exe'){throw 'No verified program files applied'}
 Write-Host 'PASS native Windows argv: trailing-backslash install root, Unicode and spaces, verified update, local-data preserved'
}finally{
 if(Test-Path $base){Remove-Item $base -Recurse -Force -ErrorAction SilentlyContinue}
}

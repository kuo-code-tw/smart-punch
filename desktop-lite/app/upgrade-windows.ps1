param(
 [Parameter(Mandatory=$true)][string]$Archive,
 [Parameter(Mandatory=$true)][string]$InstallRoot,
 [Parameter(Mandatory=$true)][int]$ParentPid,
 [Parameter(Mandatory=$true)][string]$ExpectedDigest,
 [switch]$TestOnly
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
# This script is downloaded WITH the original Windows program. The package was
# SHA256-verified against the pinned official GitHub Release asset by the app.
$root=[System.IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
$data=Join-Path $root 'local-data'
$updates=Join-Path $data 'updates'
$logDir=Join-Path $data 'logs'
New-Item -ItemType Directory -Force $updates,$logDir | Out-Null
$log=Join-Path $logDir 'windows-upgrade.txt'
function Write-Log([string]$message){
 Add-Content -Path $log -Value ((Get-Date -Format o)+' '+$message) -Encoding UTF8
}
$stage=Join-Path $updates 'shell-staging'
$rollback=Join-Path $updates 'shell-rollback'
$touched=New-Object System.Collections.Generic.List[object]
$restartAttempted=$false
$launchedChild=$null
try{
 Write-Log 'Starting verified app update, user data kept separate'
 if($ExpectedDigest -notmatch '^[0-9a-f]{64}$'){throw 'Bad expected digest'}
 if(!(Test-Path $Archive -PathType Leaf)){throw 'Missing downloaded ZIP'}
 $hash=(Get-FileHash -Path $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
 if($hash -ne $ExpectedDigest){throw 'Release SHA-256 validation failed before extraction'}
 if($ParentPid -gt 0){
  $deadline=(Get-Date).AddSeconds(75)
  while((Get-Process -Id $ParentPid -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline){
   Start-Sleep -Milliseconds 400
  }
  if(Get-Process -Id $ParentPid -ErrorAction SilentlyContinue){throw 'Old Windows app still running; restart canceled safely'}
 }
 if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
 if(Test-Path $rollback){Remove-Item $rollback -Recurse -Force}
 New-Item -ItemType Directory -Force $stage,$rollback | Out-Null
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 [System.IO.Compression.ZipFile]::ExtractToDirectory($Archive,$stage)
 $pkg=Join-Path $stage '79號碼頭_Windows輕量版'
 if(!(Test-Path (Join-Path $pkg 'Port79WindowsLite.exe') -PathType Leaf) -or
    !(Test-Path (Join-Path $pkg 'site/smart-punch/index.html') -PathType Leaf)){
  throw 'New Windows version missing original app or homepage'
 }
 $files=Get-ChildItem -LiteralPath $pkg -File -Recurse
 foreach($file in $files){
  $rel=$file.FullName.Substring($pkg.Length).TrimStart('\').Replace('\','/')
  if($rel.StartsWith('local-data/',[StringComparison]::OrdinalIgnoreCase)){throw 'Update includes private database; refusing'}
  # Only app program, public website source, app bridge and readme files.
  $approved=$rel -eq 'Port79WindowsLite.exe' -or
    $rel -eq 'Port79WindowsLite.exe.config' -or
    $rel -eq '使用說明.txt' -or
    $rel.StartsWith('site/smart-punch/',[StringComparison]::Ordinal) -or
    $rel.StartsWith('app/',[StringComparison]::Ordinal) -or
    $rel -match '^[\w.-]+\.(dll|xml|pdb|config)$' -or
    $rel.StartsWith('runtimes/',[StringComparison]::Ordinal)
  if(!$approved){throw ('Unexpected file in Windows update: '+$rel)}
  if($rel.Contains('../') -or $rel.Contains(':') -or $rel.StartsWith('/')){throw 'Unsafe relative path'}
 }
 foreach($file in $files){
  $rel=$file.FullName.Substring($pkg.Length).TrimStart('\')
  $target=Join-Path $root $rel
  $back=Join-Path $rollback $rel
  $before=Test-Path $target -PathType Leaf
  if($before){
   New-Item -ItemType Directory -Force ([IO.Path]::GetDirectoryName($back)) | Out-Null
   Copy-Item -LiteralPath $target -Destination $back -Force
  }
  $touched.Add([PSCustomObject]@{Target=$target;Back=$back;Existed=$before})
  New-Item -ItemType Directory -Force ([IO.Path]::GetDirectoryName($target)) | Out-Null
  # These are program files only; the entire local-data directory is excluded.
  Copy-Item -LiteralPath $file.FullName -Destination $target -Force
 }
 # Do not record a successful release before verifying that the new app
 # actually starts. A stale release marker can strand users on an old EXE.
 $version=Join-Path $updates 'installed-shell-sha256.txt'
 $installedExeHash=Join-Path $updates 'installed-shell-exe-sha256.txt'
 Write-Log ('FILES_APPLIED '+$files.Count+' program files, no private data touched')
 if(!$TestOnly){
  # Launch the new native program automatically; never leave an apparently
  # successful update that requires the operator to find the EXE manually.
  $exe=Join-Path $root 'Port79WindowsLite.exe'
  $restartAttempted=$true
  Write-Log ('RESTART_REQUESTED exe='+$exe)
  $child=Start-Process -FilePath $exe -WorkingDirectory $root -WindowStyle Normal -PassThru -ErrorAction Stop
  if(!$child){throw 'Windows program did not start after update'}
  $launchedChild=$child
  # A process can exist without ever showing its WinForms main window.
  # Do not mark the update complete until a visible, valid native window appears.
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class Port79NativeWindow {
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
 [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr handle,int command);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
}
'@
  $visible=$false
  for($attempt=0;$attempt -lt 40;$attempt++){
   Start-Sleep -Milliseconds 750
   $child.Refresh()
   if($child.HasExited){throw ('Windows program exited before opening its main window, exit code '+$child.ExitCode)}
   $handle=$child.MainWindowHandle
   if($handle -ne [IntPtr]::Zero){
    [void][Port79NativeWindow]::ShowWindowAsync($handle,9)
    [void][Port79NativeWindow]::SetForegroundWindow($handle)
    if([Port79NativeWindow]::IsWindowVisible($handle)){$visible=$true;break}
   }
  }
  if(!$visible){
   Write-Log ('ERROR_NO_VISIBLE_WINDOW pid='+$child.Id+' exe='+$exe)
   throw 'New Windows app process started but its main window did not appear'
  }
  Write-Log ('WINDOW_VISIBLE_CONFIRMED pid='+$child.Id)
  [IO.File]::WriteAllText($installedExeHash,(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant())
  [IO.File]::WriteAllText($version,$ExpectedDigest)
  Write-Log ('AUTO_RESTART_SUCCESS pid='+$child.Id+' exe='+$exe)
 }else{
  # Test-only update proves the file replacement, but does not launch a GUI.
  $testExe=Join-Path $root 'Port79WindowsLite.exe'
  [IO.File]::WriteAllText($installedExeHash,(Get-FileHash -LiteralPath $testExe -Algorithm SHA256).Hash.ToLowerInvariant())
  [IO.File]::WriteAllText($version,$ExpectedDigest)
 }
}catch{
 Write-Log ('ERROR '+[string]$_)
 if($null -ne $launchedChild){
  try{
   $launchedChild.Refresh()
   if(!$launchedChild.HasExited){
    Stop-Process -Id $launchedChild.Id -Force -ErrorAction Stop
    $launchedChild.WaitForExit(10000) | Out-Null
    Write-Log ('STOPPED_FAILED_NEW_PROCESS pid='+$launchedChild.Id)
   }
  }catch{Write-Log ('FAILED_TO_STOP_NEW_PROCESS '+[string]$_)}
 }
 for($i=$touched.Count-1;$i -ge 0;$i--){
  $item=$touched[$i]
  try{
   if($item.Existed -and (Test-Path $item.Back)){Copy-Item -LiteralPath $item.Back -Destination $item.Target -Force}
   elseif(!$item.Existed -and (Test-Path $item.Target)){Remove-Item -LiteralPath $item.Target -Force}
  }catch{Write-Log ('Rollback failed '+$item.Target+' '+$_)}
 }
 if(!$TestOnly -and $restartAttempted){
  # If startup failed, the rollback restores the old executable. Reopen that
  # version so the computer never stays closed after a failed update.
  try{
   $oldExe=Join-Path $root 'Port79WindowsLite.exe'
   if(Test-Path $oldExe -PathType Leaf){
    $rollbackApp=Start-Process -FilePath $oldExe -WorkingDirectory $root -PassThru -ErrorAction Stop
    Write-Log ('ROLLBACK_RESTART_ATTEMPTED pid='+$rollbackApp.Id)
   }
  }catch{Write-Log ('ROLLBACK_RESTART_FAILED '+[string]$_)}
 }
 if($TestOnly){throw}
 exit 1
}finally{
 try{if(Test-Path $stage){Remove-Item $stage -Force -Recurse}}catch{}
}

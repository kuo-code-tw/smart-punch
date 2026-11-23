$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Run only AFTER an authorized publisher signs the built EXEs.
# Never creates self-signed certificates, bypasses SmartScreen, or touches local-data.
$dist = Join-Path $PSScriptRoot '../dist'
$folder = Join-Path $dist '79號碼頭_Windows輕量版'
$archive = Join-Path $dist '79號碼頭_Windows輕量資料夾版.zip'
$names = @('Port79WindowsLite.exe', 'app/Port79Updater.exe')

function Assert-Signed([string]$path) {
  if (!(Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Required Windows executable missing: $path"
  }
  $sig = Get-AuthenticodeSignature -LiteralPath $path
  if ($sig.Status -ne [System.Management.Automation.SignatureStatus]::Valid -or !$sig.SignerCertificate) {
    throw "Publisher signature not trusted for $path : $($sig.Status). Do not publish an unsigned app."
  }
  $eku = $sig.SignerCertificate.EnhancedKeyUsageList | Where-Object { $_.ObjectId.Value -eq '1.3.6.1.5.5.7.3.3' }
  if (!$eku) { throw "Certificate is not valid for code signing: $path" }
  return $sig.SignerCertificate.Subject
}

$publishers = @()
foreach ($name in $names) {
  $publishers += Assert-Signed (Join-Path $folder $name)
}
if (($publishers | Select-Object -Unique).Count -ne 1) {
  throw 'Main Windows EXE and native updater must have the same verified publisher.'
}

# Build script compressed unsigned binaries earlier. Rebuild the ZIP only now,
# after verifying publisher signatures; release job will derive a NEW SHA256.
Compress-Archive -LiteralPath $folder -DestinationPath $archive -CompressionLevel Optimal -Force
if (!(Test-Path -LiteralPath $archive) -or (Get-Item -LiteralPath $archive).Length -gt 30MB) {
  throw 'Signed Windows release ZIP missing or too large.'
}

# Verify the exact bytes users download, not merely the staged build folder.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$probe = Join-Path $env:RUNNER_TEMP ('port79-signed-zip-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $probe -Force | Out-Null
$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $archive).Path)
try {
  foreach ($name in $names) {
    $entryName = '79號碼頭_Windows輕量版/' + $name
    $entry = $zip.GetEntry($entryName)
    if (!$entry) { throw "Missing signed entry: $entryName" }
    $copy = Join-Path $probe ([IO.Path]::GetFileName($name))
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $copy, $true)
    $publisher = Assert-Signed $copy
    if ($publisher -ne $publishers[0]) { throw "Wrong signed publisher inside ZIP: $entryName" }
  }
} finally {
  $zip.Dispose()
  Remove-Item -LiteralPath $probe -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "PASS signed release: verified publisher for main EXE and updater; archive rebuilt without local-data changes"

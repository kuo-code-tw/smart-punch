$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
# Generates a real multi-resolution Windows ICO embedded into the EXE.
# Windows-only build step: no external image server and no private user data.
Add-Type -AssemblyName System.Drawing
$iconPath=Join-Path $PSScriptRoot 'Port79Icon.ico'
$sizes=@(16,24,32,48,64,256)
$images=New-Object System.Collections.Generic.List[byte[]]
foreach($size in $sizes){
 $bitmap=New-Object System.Drawing.Bitmap($size,$size,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
 $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
 $bg=[System.Drawing.Color]::FromArgb(255,13,48,90)
 $wave=[System.Drawing.Color]::FromArgb(255,40,197,201)
 $white=[System.Drawing.Color]::White
 $brushBg=New-Object System.Drawing.SolidBrush($bg)
 $brushWave=New-Object System.Drawing.SolidBrush($wave)
 $brushText=New-Object System.Drawing.SolidBrush($white)
 $font=$null;$stream=$null
 try{
  $graphics.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint=[System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $pad=[Math]::Max(0,[Math]::Round($size*0.025))
  $graphics.FillRectangle($brushBg,$pad,$pad,$size-2*$pad,$size-2*$pad)
  $bar=[Math]::Max(2,[Math]::Round($size*0.09))
  $graphics.FillRectangle($brushWave,[Math]::Round($size*0.12),[Math]::Round($size*0.84),[Math]::Round($size*0.76),$bar)
  $fontSize=[Math]::Max(9,[Math]::Round($size*0.56))
  $font=New-Object System.Drawing.Font('Arial',$fontSize,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
  $box=New-Object System.Drawing.RectangleF(0,[single]($size*0.04),[single]$size,[single]($size*0.77))
  $format=New-Object System.Drawing.StringFormat
  try{
   $format.Alignment=[System.Drawing.StringAlignment]::Center
   $format.LineAlignment=[System.Drawing.StringAlignment]::Center
   $graphics.DrawString('79',$font,$brushText,$box,$format)
  }finally{$format.Dispose()}
  $stream=New-Object System.IO.MemoryStream
  $bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
  $images.Add($stream.ToArray())
 }finally{
  if($null -ne $stream){$stream.Dispose()}
  if($null -ne $font){$font.Dispose()}
  $brushText.Dispose();$brushWave.Dispose();$brushBg.Dispose();$graphics.Dispose();$bitmap.Dispose()
 }
}
$writer=New-Object System.IO.BinaryWriter([System.IO.File]::Open($iconPath,[System.IO.FileMode]::Create))
try{
 $writer.Write([uint16]0)
 $writer.Write([uint16]1)
 $writer.Write([uint16]$images.Count)
 $offset=[uint32](6+16*$images.Count)
 for($i=0;$i -lt $images.Count;$i++){
  $size=$sizes[$i]
  $writer.Write([byte]$(if($size -eq 256){0}else{$size}))
  $writer.Write([byte]$(if($size -eq 256){0}else{$size}))
  $writer.Write([byte]0);$writer.Write([byte]0)
  $writer.Write([uint16]1);$writer.Write([uint16]32)
  $writer.Write([uint32]$images[$i].Length)
  $writer.Write([uint32]$offset)
  $offset+=[uint32]$images[$i].Length
 }
 foreach($image in $images){$writer.Write($image)}
}finally{$writer.Dispose()}
if((Get-Item $iconPath).Length -lt 512){throw 'Windows icon generation failed'}
Write-Host "PASS 79 Port multi-resolution EXE icon: $iconPath"

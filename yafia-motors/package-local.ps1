Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectPath = $PSScriptRoot
$workspacePath = Split-Path -Parent $projectPath
$zipPath = Join-Path $workspacePath 'yafia-motors-local-v4.zip'
$zipStream = [System.IO.File]::Open($zipPath,[System.IO.FileMode]::Create)
$zip = New-Object System.IO.Compression.ZipArchive($zipStream,[System.IO.Compression.ZipArchiveMode]::Create)
try {
 $files = @(Get-Item -LiteralPath (Join-Path $workspacePath 'START-LOCAL.cmd'))
 $files += Get-ChildItem -LiteralPath $projectPath -File | Where-Object { $_.Extension -in '.mjs','.ps1' -or $_.Name -in 'README.md','package.json' }
 $files += Get-ChildItem -LiteralPath (Join-Path $projectPath 'dist') -File -Recurse
 foreach($file in $files){
  $entryName=$file.FullName.Substring($workspacePath.Length+1).Replace('\','/')
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$entryName,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
 }
 Write-Output ('Packaged '+$files.Count+' files')
} finally {$zip.Dispose();$zipStream.Dispose()}
$verify=[System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
 foreach($required in @('START-LOCAL.cmd','yafia-motors/editorial.mjs','yafia-motors/media.mjs','yafia-motors/professional.mjs','yafia-motors/professional-he.mjs','yafia-motors/professional-ar.mjs','yafia-motors/professional-articles.mjs','yafia-motors/seo.mjs','yafia-motors/launch-local.mjs','yafia-motors/dist/assets/professional.css','yafia-motors/dist/he/services/maintenance/index.html','yafia-motors/dist/ar/services/maintenance/index.html')){
  if(-not $verify.GetEntry($required)){throw ('Missing ZIP entry: '+$required)}
 }
} finally {$verify.Dispose()}
# Keep the previously shared local download current too.
Copy-Item -LiteralPath $zipPath -Destination (Join-Path $workspacePath 'yafia-motors-local-v2.zip') -Force
Copy-Item -LiteralPath $zipPath -Destination (Join-Path $workspacePath 'yafia-motors-local-v3.zip') -Force
Get-Item -LiteralPath $zipPath | Select-Object Name,Length

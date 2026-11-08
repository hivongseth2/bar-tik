# Dong goi: chep moi thu can de chay (kem node.exe) vao mot thu muc tam roi nen thanh zip.
# Khong chep UnityProject (source Unity rat nang, chi can khi tu build).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path (Split-Path -Parent $root) 'dong-goi'
$stage = Join-Path $outDir 'TikTokLiveBar'
$zip = Join-Path $outDir ("TikTokLiveBar-" + (Get-Date -Format 'yyyy-MM-dd') + '.zip')
New-Item -ItemType Directory -Force $outDir | Out-Null
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null

Write-Host 'Dang chep chuong trinh...'
foreach ($item in 'TikTokBridge', 'Build', 'DJ_MUSIC', 'DJ_VIDEO', 'LiveAssets', 'Documentation', 'tools', 'start.bat', 'run.bat', 'dong-goi.bat', 'HUONG-DAN.txt', 'README.md', 'LICENSE') {
  $src = Join-Path $root $item
  if (Test-Path $src) { Copy-Item -Recurse -Force $src (Join-Path $stage $item) }
}
if (-not (Test-Path (Join-Path $root 'Build'))) { Write-Host 'Canh bao: chua co thu muc Build (game Unity), goi chi chay duoc Bang dieu khien' }
if (-not (Test-Path (Join-Path $root 'TikTokBridge\node_modules'))) { Write-Host 'Canh bao: chua co TikTokBridge\node_modules, may moi se phai co mang de tu cai' }
# Node.js di kem de may moi khong phai cai
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if ($node) {
  New-Item -ItemType Directory -Force (Join-Path $stage 'runtime') | Out-Null
  Copy-Item $node (Join-Path $stage 'runtime\node.exe')
} else { Write-Host 'Canh bao: khong tim thay node.exe, may moi phai tu cai Node.js' }

Write-Host 'Dang nen file zip (mat 1-2 phut)...'
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path $stage -DestinationPath $zip -CompressionLevel Optimal
Remove-Item -Recurse -Force $stage
$mb = [math]::Round((Get-Item $zip).Length / 1MB)
Write-Host "Xong: $zip ($mb MB)"
Write-Host 'Luu y: TikTokBridge\.env co the chua EULER_API_KEY, dung gui file zip cho nguoi la.'

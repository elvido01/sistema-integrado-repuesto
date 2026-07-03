# ============================================================
# Empaqueta MotoFlow Omni Beta sin tocar el manifest estable.
#   1) Copia public/manifest.beta.json sobre dist/manifest.json.
#   2) Genera un ZIP beta separado.
#
# Uso: npm run package:beta
# ============================================================
$ErrorActionPreference = 'Stop'

$ext  = $PSScriptRoot
$root = Split-Path $ext -Parent

$manifestBeta = Join-Path $ext 'public\manifest.beta.json'
$stage = Join-Path $ext '.tmp-beta-package'
if (!(Test-Path $manifestBeta)) {
    throw "No existe manifest beta: $manifestBeta"
}

Write-Host "==> Compilando la extension beta..." -ForegroundColor Cyan
Push-Location $ext
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build fallo con codigo $LASTEXITCODE" }
} finally {
    Pop-Location
}

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item (Join-Path $ext 'dist\*') $stage -Recurse -Force
Copy-Item $manifestBeta (Join-Path $stage 'manifest.json') -Force

$zipPub  = Join-Path $root 'public\downloads\motoflow-omni-beta-extension.zip'
$zipDist = Join-Path $root 'dist\downloads\motoflow-omni-beta-extension.zip'

New-Item -ItemType Directory -Force -Path (Split-Path $zipPub)  | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $zipDist) | Out-Null
if (Test-Path $zipPub)  { Remove-Item $zipPub  -Force }
if (Test-Path $zipDist) { Remove-Item $zipDist -Force }

Write-Host "==> Empaquetando ZIP beta..." -ForegroundColor Cyan
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipPub
Copy-Item $zipPub $zipDist -Force
Remove-Item $stage -Recurse -Force

$size = [math]::Round((Get-Item $zipPub).Length / 1KB, 1)

Write-Host ""
Write-Host "LISTO ($size KB). ZIP beta actualizado en:" -ForegroundColor Green
Write-Host "  $zipPub"
Write-Host "  $zipDist"

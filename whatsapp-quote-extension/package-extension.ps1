# ============================================================
# Empaqueta la extension de WhatsApp en un solo paso:
#   1) Compila la extension (vite build)
#   2) Genera el ZIP (manifest.json + content.js)
#   3) Lo coloca en public/downloads/ y dist/downloads/ del app
#      (asi actualizar la descarga solo requiere commit + push,
#       sin recompilar todo el app principal)
#
# Uso:  npm run package      (desde whatsapp-quote-extension/)
#  o:   powershell -ExecutionPolicy Bypass -File package-extension.ps1
# ============================================================
$ErrorActionPreference = 'Stop'

$ext  = $PSScriptRoot
$root = Split-Path $ext -Parent

Write-Host "==> Compilando la extension..." -ForegroundColor Cyan
Push-Location $ext
try {
    npm run build
} finally {
    Pop-Location
}

$zipPub  = Join-Path $root 'public\downloads\motoflow-whatsapp-extension.zip'
$zipDist = Join-Path $root 'dist\downloads\motoflow-whatsapp-extension.zip'

New-Item -ItemType Directory -Force -Path (Split-Path $zipPub)  | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $zipDist) | Out-Null
if (Test-Path $zipPub)  { Remove-Item $zipPub  -Force }
if (Test-Path $zipDist) { Remove-Item $zipDist -Force }

Write-Host "==> Empaquetando ZIP..." -ForegroundColor Cyan
Compress-Archive -Path (Join-Path $ext 'dist\*') -DestinationPath $zipPub
Copy-Item $zipPub $zipDist -Force

$size = [math]::Round((Get-Item $zipPub).Length / 1KB, 1)

Write-Host ""
Write-Host "LISTO ($size KB). ZIP actualizado en:" -ForegroundColor Green
Write-Host "  $zipPub"
Write-Host "  $zipDist"
Write-Host ""
Write-Host "Para publicar la version nueva a las empresas, ejecuta en la raiz del repo:" -ForegroundColor Yellow
Write-Host '  git add -f public/downloads/motoflow-whatsapp-extension.zip dist/downloads/motoflow-whatsapp-extension.zip'
Write-Host '  git commit -m "chore(extension): actualizar ZIP de descarga"'
Write-Host '  git push origin feat/mercancias-filtros'

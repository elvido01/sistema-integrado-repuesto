# ============================================================
# Setup automático MotoFlow / Sistema Integrado Repuestos
# ============================================================
# Uso (en una PC nueva):
#   1. Abrir PowerShell COMO ADMINISTRADOR.
#   2. Permitir scripts una sola vez:
#        Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   3. Ejecutar:
#        iwr https://raw.githubusercontent.com/elvido01/sistema-integrado-repuesto/main/scripts/setup-pc.ps1 -OutFile setup.ps1
#        .\setup.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$RepoUrl  = "https://github.com/elvido01/sistema-integrado-repuesto.git"
$RepoName = "sistema-integrado-repuesto"
$BaseDir  = "$env:USERPROFILE"

function Write-Step($msg)  { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "    --  $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "    !!  $msg" -ForegroundColor Red }

function Test-Cmd($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# ------------------------------------------------------------
# 1. Verificar pre-requisitos (Git + Node)
# ------------------------------------------------------------
Write-Step "Verificando herramientas instaladas"

$missing = @()
if (-not (Test-Cmd git))  { $missing += "Git"  }
if (-not (Test-Cmd node)) { $missing += "Node" }
if (-not (Test-Cmd npm))  { $missing += "npm"  }

if ($missing.Count -gt 0) {
    Write-Err ("Faltan: " + ($missing -join ", "))
    Write-Host ""
    Write-Host "Intentando instalar con winget..." -ForegroundColor Yellow
    if (-not (Test-Cmd winget)) {
        Write-Err "winget no esta disponible. Instala manualmente:"
        Write-Host "  Git    -> https://git-scm.com/download/win"
        Write-Host "  Node   -> https://nodejs.org (LTS)"
        exit 1
    }
    if ($missing -contains "Git")  { winget install --id Git.Git           -e --accept-source-agreements --accept-package-agreements }
    if ($missing -contains "Node") { winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements }
    Write-Warn "Cierra y vuelve a abrir PowerShell para que tome PATH actualizado, luego corre el script de nuevo."
    exit 0
}
Write-Ok ("Git  : " + (git --version))
Write-Ok ("Node : " + (node --version))
Write-Ok ("npm  : " + (npm --version))

# ------------------------------------------------------------
# 2. Configurar identidad de Git (si no esta)
# ------------------------------------------------------------
Write-Step "Configurando identidad de Git"
$currentName  = git config --global user.name
$currentEmail = git config --global user.email
if (-not $currentName)  { git config --global user.name  "MotoFlow Dev" }
if (-not $currentEmail) { git config --global user.email "elvidocaminero@gmail.com" }
Write-Ok ("Nombre: " + (git config --global user.name))
Write-Ok ("Email : " + (git config --global user.email))

# ------------------------------------------------------------
# 3. Clonar o actualizar el repo
# ------------------------------------------------------------
Write-Step "Clonando / actualizando repositorio"
$RepoPath = Join-Path $BaseDir $RepoName

if (Test-Path (Join-Path $RepoPath ".git")) {
    Write-Ok "Repositorio ya existe. Haciendo git pull..."
    Push-Location $RepoPath
    git pull
    Pop-Location
} else {
    Write-Ok ("Clonando en " + $RepoPath)
    git clone $RepoUrl $RepoPath
}

# ------------------------------------------------------------
# 4. Instalar dependencias
# ------------------------------------------------------------
Write-Step "Instalando dependencias npm (puede demorar 3-5 min)"
Push-Location $RepoPath
npm install
Pop-Location
Write-Ok "Dependencias instaladas."

# ------------------------------------------------------------
# 5. Verificar archivo .env
# ------------------------------------------------------------
Write-Step "Verificando archivo .env"
$envPath = Join-Path $RepoPath ".env"
if (Test-Path $envPath) {
    Write-Ok ".env encontrado."
} else {
    Write-Warn ".env NO existe en " + $envPath
    Write-Host ""
    Write-Host "    Copia el .env desde tu PC principal a esa ruta antes de ejecutar el sistema."
    Write-Host "    Debe contener:"
    Write-Host "      VITE_SUPABASE_URL=..."
    Write-Host "      VITE_SUPABASE_ANON_KEY=..."
    Write-Host ""
}

# ------------------------------------------------------------
# 6. Resumen
# ------------------------------------------------------------
Write-Step "Listo"
Write-Host ""
Write-Host "Proyecto en: $RepoPath" -ForegroundColor Green
Write-Host ""
Write-Host "Comandos utiles:" -ForegroundColor Cyan
Write-Host "  cd $RepoPath"
Write-Host "  git pull           # bajar lo ultimo antes de empezar"
Write-Host "  npm run dev        # levantar servidor local en http://localhost:5173"
Write-Host "  npm run build      # generar dist/ para subir al hosting"
Write-Host "  git push           # subir tus cambios al terminar"
Write-Host ""

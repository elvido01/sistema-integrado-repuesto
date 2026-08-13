# =====================================================================
# ARRANCAR EL EQUIPO IA — un solo archivo, una sola vez
# ---------------------------------------------------------------------
# Jarvis y el Comercial-Creativo aparecen "disponibles" en la pantalla
# del Equipo IA porque eso lo dice la base. Pero disponible no es lo
# mismo que trabajando: hace falta un proceso escuchando la cola. Esto
# lo levanta.
#
# >>> POR QUÉ EN LA PC Y NO EN EL VPS <<<
# El Comercial-Creativo corre con la SUSCRIPCIÓN de Claude, y una
# suscripción se usa desde una máquina con sesión iniciada. Por eso ese
# agente está marcado 'maquina_propia'. Jarvis podría vivir en el
# servidor —usa la API de OpenAI— pero se queda al lado para tener los
# dos en el mismo sitio.
#
# >>> LAS CLAVES SE PREGUNTAN UNA VEZ <<<
# Se guardan en scripts/migracion-siif/.env, que ya está en .gitignore y
# que el worker carga solo al arrancar. La segunda vez que corras esto
# no te pregunta nada.
#
# Se escriben a ciegas: no se ven al teclear y no quedan en el historial
# de PowerShell.
# =====================================================================

$ErrorActionPreference = 'Stop'
$raiz    = Split-Path -Parent $PSScriptRoot
$archivo = Join-Path $raiz 'scripts\migracion-siif\.env'

function Escribir($texto, $color) { Write-Host $texto -ForegroundColor $color }

Escribir "`n  EQUIPO IA — arranque`n" 'Cyan'

# ── 1 · LAS CLAVES ───────────────────────────────────────────────────
if (-not (Test-Path $archivo)) {
  New-Item -ItemType File -Path $archivo -Force | Out-Null
}
$contenido = Get-Content $archivo -Raw
if ($null -eq $contenido) { $contenido = '' }

function PedirClave($nombre, $explicacion, $obligatoria) {
  # Ya está guardada: ni se pregunta ni se muestra.
  if ($script:contenido -match "(?m)^$nombre=.+") {
    Escribir "  ok    $nombre  (ya guardada)" 'DarkGray'
    return $true
  }

  Escribir "`n  Falta $nombre" 'Yellow'
  Escribir "  $explicacion" 'Gray'
  if (-not $obligatoria) { Escribir "  (Enter para saltar)" 'DarkGray' }

  $segura = Read-Host "  Pegala aqui (no se vera)" -AsSecureString
  $bstr   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
  $valor  = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  $valor = $valor.Trim()

  if ([string]::IsNullOrWhiteSpace($valor)) {
    if ($obligatoria) { Escribir "  Sin esa clave no arranca nada. Cancelado.`n" 'Red'; exit 1 }
    Escribir "  saltada" 'DarkGray'
    return $false
  }

  # Si el archivo no termina en salto de linea, la variable nueva se
  # pegaria a la anterior y ninguna de las dos serviria.
  $sep = ''
  if ($script:contenido.Length -gt 0 -and -not $script:contenido.EndsWith("`n")) { $sep = "`n" }
  # Sin BOM: Node lee este archivo y un BOM a media altura lo rompe.
  [IO.File]::AppendAllText($archivo, "$sep$nombre=$valor`n", (New-Object Text.UTF8Encoding $false))
  $script:contenido = Get-Content $archivo -Raw

  Escribir "  guardada" 'Green'
  return $true
}

$hayDb     = PedirClave 'HERMES_DB_PASSWORD' 'La del usuario hermes_readonly. Esta dentro de MOTOFLOW_DB_URL en el /data/.env del VPS.' $true
$hayOpenAi = PedirClave 'OPENAI_API_KEY'     'Solo la usa Jarvis (GPT-4o mini). Sin ella arranca solo el Comercial.' $false

# ── 2 · LA SESIÓN DE CLAUDE DEL AGENTE ───────────────────────────────
# El Comercial no usa API: usa la suscripcion, y para eso necesita su
# propia sesion, aparte de la de VS Code.
Escribir "`n  Cuenta de Claude del agente..." 'Cyan'
Push-Location $raiz
$estado = & node scripts\equipo-login.mjs --ver 2>&1 | Out-String

if ($estado -match 'no tiene sesion propia') {
  Escribir "  El agente no tiene sesion. Abriendo el login..." 'Yellow'
  Escribir "  OJO: entra con la cuenta DEL AGENTE, no con la de VS Code.`n" 'Yellow'
  & node scripts\equipo-login.mjs
  $estado = & node scripts\equipo-login.mjs --ver 2>&1 | Out-String
}

$comercialListo = -not ($estado -match 'no tiene sesion propia')
if ($comercialListo) { Escribir "  ok    sesion propia lista" 'Green' }
else                 { Escribir "  El Comercial-Creativo no puede arrancar sin sesion." 'Red' }
Pop-Location

# ── 3 · ARRANCAR ─────────────────────────────────────────────────────
# Cada worker en su ventana. -NoExit para que quede abierta: si la
# cierras, ese agente deja de contestar.
function Arrancar($titulo, $script) {
  Start-Process powershell -ArgumentList @(
    '-NoExit','-Command',
    "`$Host.UI.RawUI.WindowTitle='$titulo'; Set-Location '$raiz'; npm run $script"
  )
  Escribir "  arrancando  $titulo" 'Green'
}

Escribir "`n  Ventanas:" 'Cyan'
if ($hayOpenAi)      { Arrancar 'EQUIPO · Jarvis'    'equipo:jarvis' }
else                 { Escribir "  saltado     Jarvis (sin OPENAI_API_KEY)" 'DarkGray' }
if ($comercialListo) { Arrancar 'EQUIPO · Comercial' 'equipo:comercial' }
else                 { Escribir "  saltado     Comercial (sin sesion de Claude)" 'DarkGray' }

Escribir @"

  Se abrieron ventanas aparte. Dejalas abiertas: mientras esten
  corriendo, los agentes contestan; al cerrarlas, dejan de hacerlo.

  Para comprobarlo, preguntale a Hermes de nuevo, o mira la pantalla
  del Equipo IA: 'Nunca ha arrancado un worker' tiene que cambiar.

"@ 'Cyan'

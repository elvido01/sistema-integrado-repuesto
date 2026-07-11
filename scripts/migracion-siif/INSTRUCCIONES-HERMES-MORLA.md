# Misión: respaldo diario automático del SiiF de REPUESTOS MORLA

Eres un agente trabajando en la **PC vieja de Repuestos Morla** (Windows, con el
sistema SiiF y MySQL). Tu misión es dejar configurado un **respaldo diario
automático** de TODAS las bases de datos MySQL hacia este disco externo
(WD Elements), en el mismo formato que usa la empresa hermana:

```
<DISCO>:\COPIAS\YYYY-MM-DD\<base>.<YYYY-MM-DD>.SQL     (un mysqldump por base)
```

El script ya está hecho: **`respaldo-diario-siif.bat`** (está en la raíz de este
mismo disco). Solo hay que configurarlo, probarlo y programarlo.

## Reglas de seguridad (obligatorias)
- **Solo lectura sobre MySQL**: mysqldump no modifica nada. NO ejecutes UPDATE,
  DELETE, DROP ni cambies configuración de MySQL o del SiiF.
- **No borres ni muevas nada** de este disco externo (tiene respaldos históricos:
  `COPIAS\2020-12-28`, `siif_repuestos_morla.2024-09-17.SQL`, etc.).
- No instales ni actualices MySQL. Usa el que ya está.
- Si algo no cuadra (clave desconocida, MySQL no arranca), PREGUNTA al operador
  en vez de adivinar con acciones destructivas.

## Pasos

### 1. Letra del disco externo
Identifica qué letra tiene ESTE disco (etiqueta del volumen: `Elements`) en esta
PC. Puede no ser E:. En PowerShell:
```powershell
Get-Volume | Where-Object FileSystemLabel -eq 'Elements'
```
Anota la letra → la usarás como `DEST` (ej. `E:\COPIAS`).

### 2. Encontrar MySQL
Busca `mysqldump.exe` en las rutas típicas:
```powershell
Get-ChildItem "C:\xampp\mysql\bin\mysqldump.exe","C:\wamp*\bin\mysql\*\bin\mysqldump.exe","C:\Program Files*\MySQL\*\bin\mysqldump.exe" -ErrorAction SilentlyContinue
```
Si no aparece, busca dónde está instalado el SiiF (accesos directos del
escritorio, `C:\SiiF*`, `C:\AppServ`, servicios de Windows con
`Get-Service *mysql*`) — el MySQL vive junto al SiiF.
Dato: la base principal de esta PC se llama probablemente `siif_repuestos_morla`
(así se llamaba en el respaldo de 2024 que hay en este disco).

### 3. Credenciales de MySQL
Prueba primero `root` sin clave:
```
<ruta>\mysql.exe -u root -N -e "SHOW DATABASES"
```
Si pide clave, búscala en los archivos de configuración del SiiF (archivos
`.ini`, `.php` o `conexion*` dentro de la carpeta del SiiF — busca cadenas
`password` o `pwd`). Si no aparece, pregúntale al operador.

### 4. Configurar el script
1. Crea la carpeta `C:\respaldo\`.
2. Copia `respaldo-diario-siif.bat` desde este disco a `C:\respaldo\`.
3. Edita en el .bat las 4 variables del principio:
   - `MYSQL_BIN` = carpeta bin encontrada en el paso 2
   - `MYSQL_USER` / `MYSQL_PASS` = credenciales del paso 3
   - `DEST` = `<letra del paso 1>:\COPIAS`

### 5. Probar
Ejecuta `C:\respaldo\respaldo-diario-siif.bat` y verifica:
- Se creó `<DISCO>:\COPIAS\<fecha de hoy>\`.
- Hay un `.SQL` por cada base (mínimo debe estar la de Morla, ej.
  `siif_repuestos_morla.<fecha>.SQL`).
- Cada archivo pesa más de 0 bytes y empieza con `-- MySQL dump`.
- El de Morla debería pesar en el orden de 20+ MB (el de 2024 pesaba 24 MB).

### 6. Programarlo diario
En cmd **como Administrador** (ajusta la hora a cuando la PC esté encendida,
idealmente al final de la jornada):
```
schtasks /create /tn "Respaldo SiiF diario" /tr "C:\respaldo\respaldo-diario-siif.bat" /sc daily /st 19:30 /f
```
Si la PC no siempre está encendida a esa hora, crea además una al iniciar sesión:
```
schtasks /create /tn "Respaldo SiiF al encender" /tr "C:\respaldo\respaldo-diario-siif.bat" /sc onlogon /f
```
Verifica: `schtasks /query /tn "Respaldo SiiF diario"`.

### 7. Reporte final
Deja al operador un resumen con:
- Letra del disco y ruta destino usada.
- Ruta de MySQL encontrada y bases respaldadas (nombres y tamaños de los .SQL).
- Nombre de la(s) tarea(s) programada(s) y hora.
- Cualquier base que haya fallado o pendiente (ej. clave que faltó).

> Nota final: el respaldo corre aunque el operador olvide todo — pero el disco
> tiene que estar conectado. Si el disco no está, el .bat avisa y no daña nada.

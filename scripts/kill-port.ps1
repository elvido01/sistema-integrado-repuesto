param([int]$Port = 5173)
$cons = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($cons) {
  $pids = $cons | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -ne 0 }
  foreach ($p in $pids) { try { Stop-Process -Id $p -Force } catch {} }
}

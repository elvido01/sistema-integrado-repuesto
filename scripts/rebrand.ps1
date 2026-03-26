$srcDir = "c:\Users\pc\Desktop\SISTEMA INTEGRADO REP. MORLA\src"

# Replace in pages
Get-ChildItem -Path $srcDir -Recurse -Include "*.jsx","*.tsx","*.js","*.ts" | ForEach-Object {
    $content = [System.IO.File]::ReadAllText($_.FullName)
    $original = $content

    # Replace all Repuestos Morla variations in Helmet titles and string literals
    $content = $content -replace "Repuestos Morla", "MotoFlow"
    $content = $content -replace "REPUESTOS MORLA", "MotoFlow"
    $content = $content -replace "Sistema Integrado de Información Financiera", "Sistema inteligente de gestión empresarial"
    $content = $content -replace "Sistema Integrado de Información", "Sistema inteligente de gestión"
    $content = $content -replace "Sistema de Gestión Morla", "MotoFlow"
    $content = $content -replace "Sistema Integrado", "MotoFlow"
    $content = $content -replace "repuestosmorla\.com", "motoflow.app"
    $content = $content -replace "soporte@repuestosmorla\.com", "soporte@motoflow.app"

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($_.FullName, $content)
        Write-Host "Updated: $($_.FullName)"
    }
}

Write-Host "`nDone!"

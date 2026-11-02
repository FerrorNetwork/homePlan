$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Не найден Node.js. Установите Node.js 20 или новее: https://nodejs.org/'
}
if (-not (Test-Path '.env') -and (Test-Path '.env.example')) { Copy-Item '.env.example' '.env' }
Write-Host 'ДомПроект: http://localhost:4173'
node .\server.mjs

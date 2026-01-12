# Script PowerShell per avviare il backend
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   AVVIO BACKEND SYSTEM" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location backend

Write-Host "[1/3] Controllo dipendenze..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "Installazione dipendenze..." -ForegroundColor Yellow
    npm install
}

Write-Host ""
Write-Host "[2/3] Compilazione TypeScript..." -ForegroundColor Yellow
npm run build

Write-Host ""
Write-Host "[3/3] Avvio server..." -ForegroundColor Yellow
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "   SERVER BACKEND IN ESECUZIONE" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "   API: http://localhost:3000" -ForegroundColor White
Write-Host "   Health: http://localhost:3000/health" -ForegroundColor White
Write-Host ""
Write-Host "   Premi Ctrl+C per fermare il server" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

node dist/index.js

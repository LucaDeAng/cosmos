@echo off
echo ============================================================
echo    AVVIO BACKEND SYSTEM
echo ============================================================
echo.

cd backend

echo [1/3] Controllo dipendenze...
if not exist "node_modules\" (
    echo Installazione dipendenze...
    call npm install
)

echo.
echo [2/3] Compilazione TypeScript...
call npm run build

echo.
echo [3/3] Avvio server...
echo.
echo ============================================================
echo    SERVER BACKEND IN ESECUZIONE
echo ============================================================
echo.
echo    API: http://localhost:3000
echo    Health: http://localhost:3000/health
echo.
echo    Premi Ctrl+C per fermare il server
echo ============================================================
echo.

node dist/index.js

pause

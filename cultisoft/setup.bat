@echo off
echo.
echo ================================================
echo  CultiSoft - Setup local
echo ================================================
echo.

echo [1/3] Instalando dependencias...
call npm install
if %ERRORLEVEL% neq 0 goto :error

echo.
echo [2/3] Creando base de datos SQLite...
call npm run db:init
if %ERRORLEVEL% neq 0 goto :error

echo.
echo [3/3] Cargando datos reales desde CSVs...
call npm run db:seed
if %ERRORLEVEL% neq 0 goto :error

echo.
echo ================================================
echo  Setup completo
echo ================================================
echo  Inicia el servidor con:    npm run dev
echo  Luego abre:               http://localhost:3030
echo  Login:                    admin@cultimed.cl / admin123
echo ================================================
goto :end

:error
echo.
echo ERROR: Setup interrumpido. Revisa el mensaje arriba.
exit /b 1

:end

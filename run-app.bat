@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%resources\server"
set "FRONTEND_DIR=%ROOT%resources\server\frontend"

echo =========================================
echo   Starting OptiRoute Pro Application
echo =========================================
echo.

if not exist "%BACKEND_DIR%\node_modules" (
  echo Installing backend dependencies...
  pushd "%BACKEND_DIR%"
  call npm install
  popd
)

if not exist "%FRONTEND_DIR%\node_modules" (
  echo Installing frontend dependencies ^(legacy peer deps^)...
  pushd "%FRONTEND_DIR%"
  call npm install --legacy-peer-deps
  popd
)

netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul
if errorlevel 1 (
  echo Launching backend on http://localhost:3000 ...
  start "OptiRoute Backend" /D "%BACKEND_DIR%" cmd /k npm run dev
) else (
  echo Backend already running on port 3000. Skipping backend launch.
)

netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul
if errorlevel 1 (
  echo Launching frontend on http://localhost:5173/manager/ ...
  start "OptiRoute Frontend" /D "%FRONTEND_DIR%" cmd /k npm run dev
) else (
  echo Frontend already running on port 5173. Skipping frontend launch.
)

echo Opening dashboard in your browser...
start "" "http://localhost:5173/manager/"

echo.
echo App launch commands started in separate windows.
echo Close this window or press any key.
pause >nul

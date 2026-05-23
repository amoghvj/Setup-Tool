@echo off
setlocal

:: =========================================
::   OptiRoute Runtime-Dev Staging Launcher
:: =========================================
::
:: Convenience wrapper for stage.js.
::
:: Usage:
::   stage.bat                     Full staging (includes frontend build)
::   stage.bat --skip-frontend-build   Skip rebuilding frontend

set "SCRIPT_DIR=%~dp0"

node "%SCRIPT_DIR%stage.js" %*

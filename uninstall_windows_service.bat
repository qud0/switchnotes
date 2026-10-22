@echo off
chcp 65001 >nul
echo ======================================================================
echo    SwitchBook - Удаление Windows-службы
echo ======================================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Этот скрипт необходимо запускать от имени Администратора!
    pause
    exit /b 1
)

set SCRIPT_DIR=%~dp0
set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

where nssm >nul 2>&1
if %errorlevel% neq 0 (
    if not exist "%SCRIPT_DIR%\nssm.exe" (
        echo [ОШИБКА] nssm.exe не найден.
        pause
        exit /b 1
    )
    set NSSM_CMD="%SCRIPT_DIR%\nssm.exe"
) else (
    set NSSM_CMD=nssm
)

echo Остановка и удаление службы SwitchBook...
%NSSM_CMD% stop SwitchBook
%NSSM_CMD% remove SwitchBook confirm

echo.
echo [OK] Служба SwitchBook удалена из системы.
pause

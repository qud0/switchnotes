@echo off
chcp 65001 >nul
echo ======================================================================
echo    SwitchBook - Установка Windows-службы через NSSM
echo ======================================================================
echo.

:: Проверка прав администратора
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Этот скрипт необходимо запускать от имени Администратора!
    echo Кликните правой кнопкой мыши по файлу и выберите "Запуск от имени администратора".
    echo.
    pause
    exit /b 1
)

set SCRIPT_DIR=%~dp0
set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

:: Поиск node.exe
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не найден в переменной PATH.
    echo Пожалуйста, установите Node.js LTS с https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%I in ('where node') do (
    set NODE_EXE=%%I
    goto :FoundNode
)

:FoundNode
echo [OK] Найден Node.js: %NODE_EXE%
echo [OK] Директория проекта: %SCRIPT_DIR%
echo.

:: Проверка наличия NSSM
where nssm >nul 2>&1
if %errorlevel% neq 0 (
    if not exist "%SCRIPT_DIR%\nssm.exe" (
        echo [ИНФОРМАЦИЯ] Утилита nssm.exe не найдена в PATH или в папке проекта.
        echo Скачайте nssm.exe с сайта https://nssm.cc/download (nssm-2.24)
        echo и положите nssm.exe рядом с этим скриптом в: %SCRIPT_DIR%
        echo.
        pause
        exit /b 1
    )
    set NSSM_CMD="%SCRIPT_DIR%\nssm.exe"
) else (
    set NSSM_CMD=nssm
)

echo Регистрация службы SwitchBook...
%NSSM_CMD% install SwitchBook "%NODE_EXE%" "%SCRIPT_DIR%\server\index.js"
%NSSM_CMD% set SwitchBook AppDirectory "%SCRIPT_DIR%"
%NSSM_CMD% set SwitchBook Description "SwitchBook Network Management Platform"
%NSSM_CMD% set SwitchBook Start SERVICE_AUTO_START
%NSSM_CMD% set SwitchBook AppEnvironmentExtra NODE_ENV=production PORT=3050
%NSSM_CMD% set SwitchBook AppStdout "%SCRIPT_DIR%\data\switchbook_service.log"
%NSSM_CMD% set SwitchBook AppStderr "%SCRIPT_DIR%\data\switchbook_service.log"

echo Запуск службы...
%NSSM_CMD% start SwitchBook

echo.
echo ======================================================================
echo [УСПЕХ] Служба SwitchBook зарегистрирована и запущена!
echo Адрес в локальной сети: http://localhost:3050
echo Логи: %SCRIPT_DIR%\data\switchbook_service.log
echo ======================================================================
echo.
pause

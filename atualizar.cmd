@echo off
setlocal EnableExtensions
rem ==========================================================================
rem  Atualiza o Historico de precos com um duplo clique.
rem  1) confere o Docker  2) faz backup do banco  3) baixa a versao nova
rem  4) reconstroi e reinicia  5) confirma que a aplicacao respondeu
rem  Seus dados ficam no volume do Docker e nao sao apagados.
rem ==========================================================================
cd /d "%~dp0"
title Atualizar Historico de precos

set "APP_PORT=3000"
if exist ".env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
    if /i "%%a"=="APP_PORT" set "APP_PORT=%%b"
  )
)

echo.
echo [1/5] Conferindo o Docker...
docker info >nul 2>&1
if errorlevel 1 goto :sem_docker

echo [2/5] Fazendo backup do banco antes de atualizar...
docker compose exec -T backup true >nul 2>&1
if errorlevel 1 (
  echo       O sistema estava parado. Iniciando para poder fazer o backup...
  docker compose up -d
  timeout /t 20 /nobreak >nul
)
docker compose exec -T backup sh -c "pg_dump --format=custom --file=/backups/antes-de-atualizar-$(date +%%Y%%m%%d-%%H%%M%%S).dump"
if errorlevel 1 goto :falha_backup
echo       Backup salvo na pasta backups.

echo [3/5] Baixando a versao nova...
for /f %%h in ('git rev-parse HEAD') do set "ANTES=%%h"
git pull --ff-only
if errorlevel 1 goto :falha_git
for /f %%h in ('git rev-parse HEAD') do set "DEPOIS=%%h"

if "%ANTES%"=="%DEPOIS%" (
  echo [4/5] Ja estava na versao mais recente. Garantindo que esta tudo rodando...
  docker compose up -d
) else (
  echo [4/5] Reconstruindo e reiniciando. Isso leva alguns minutos...
  docker compose up -d --build
)
if errorlevel 1 goto :falha_docker

echo [5/5] Aguardando a aplicacao responder...
powershell -NoProfile -Command "$u='http://localhost:%APP_PORT%/api/health'; for($i=0;$i -lt 90;$i++){ try { $r=Invoke-RestMethod -Uri $u -TimeoutSec 3; if($r.status -eq 'ok'){ Write-Host ('      Aplicacao no ar. Versao ' + $r.version); exit 0 } } catch {}; Start-Sleep -Seconds 2 }; exit 1"
if errorlevel 1 goto :falha_saude

if not "%ANTES%"=="%DEPOIS%" (
  git diff --quiet %ANTES% %DEPOIS% -- extension
  if errorlevel 1 (
    echo.
    echo ATENCAO: a extensao do navegador mudou nesta versao.
    echo Abra chrome://extensions e clique em recarregar no cartao "Historico de precos".
  )
)

echo.
echo Pronto. Abrindo a aplicacao...
start "" "http://localhost:%APP_PORT%"
echo.
pause
exit /b 0

:sem_docker
echo.
echo O Docker Desktop nao esta aberto. Abra o Docker Desktop, espere ele iniciar e rode este arquivo de novo.
echo Nada foi alterado.
pause
exit /b 1

:falha_backup
echo.
echo Nao foi possivel fazer o backup. Por seguranca, a atualizacao foi cancelada e nada foi alterado.
echo Mande um print desta janela para investigar.
pause
exit /b 1

:falha_git
echo.
echo Nao foi possivel baixar a versao nova (git pull). Seus dados nao foram alterados
echo e o sistema continua na versao anterior. Mande um print desta janela.
pause
exit /b 1

:falha_docker
echo.
echo O Docker nao conseguiu iniciar a versao nova. Seus dados continuam no volume do Docker.
echo Mande um print desta janela, ou o resultado de: docker compose logs web
pause
exit /b 1

:falha_saude
echo.
echo A aplicacao nao respondeu em 3 minutos. Rode "docker compose ps" e "docker compose logs web"
echo e mande um print. Seus dados continuam guardados.
pause
exit /b 1

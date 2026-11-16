@echo off
setlocal
cd /d "%~dp0"
title Winner Cakes - chave do ImgBB
echo ============================================================
echo  Winner Cakes - gravar a chave do ImgBB
echo ============================================================
echo.
echo Copie a chave em https://api.imgbb.com
echo Para COLAR nesta janela: clique com o botao DIREITO do mouse
echo ^(Ctrl+C nao cola, ele cancela^).
echo.
set "KEY="
set /p "KEY=Cole a chave e aperte Enter: "
if "%KEY%"=="" (
  echo.
  echo [ERRO] Nada foi colado. Abra este arquivo de novo.
  goto :fim
)
echo.
echo Chave recebida: %KEY%
<nul set /p "=%KEY%" > "%TEMP%\winner_imgbb.txt"
call firebase functions:secrets:set IMGBB_API_KEY --project winner-cakes --data-file "%TEMP%\winner_imgbb.txt" --force
set "RC=%errorlevel%"
del "%TEMP%\winner_imgbb.txt" >nul 2>&1
if not "%RC%"=="0" (
  echo.
  echo [ERRO] O Firebase recusou. Copie o texto desta janela e mande para o Claude.
  goto :fim
)
echo.
echo Chave gravada. Agora abra o PUBLICAR-API.bat para publicar a API.

:fim
echo.
pause

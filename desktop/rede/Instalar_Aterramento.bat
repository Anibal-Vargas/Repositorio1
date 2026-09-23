@echo off
REM ==========================================================================
REM  Instala o aplicativo de relatorios de aterramento na maquina do usuario.
REM
REM  Este arquivo deve ficar na PASTA DE REDE, junto com o versao.json e o
REM  RelatoriosAterramento_<versao>.exe. O usuario abre a pasta de rede e da
REM  um duplo clique aqui - uma unica vez.
REM
REM  O que ele faz:
REM    1. copia o executavel mais recente para a pasta local do usuario
REM       (%LOCALAPPDATA%\NordConsult\Aterramento);
REM    2. anota o caminho desta pasta de rede, para o app se auto-atualizar;
REM    3. cria o atalho "Relatorios de Aterramento" na Area de Trabalho.
REM
REM  Depois disso o usuario so usa o atalho: as versoes novas sao baixadas
REM  sozinhas quando o app abre.
REM ==========================================================================
setlocal enabledelayedexpansion

set "ORIGEM=%~dp0"
set "DESTINO=%LOCALAPPDATA%\NordConsult\Aterramento"

echo.
echo  Instalando a partir de: %ORIGEM%
echo  Para:                   %DESTINO%
echo.

REM --- Localiza o executavel mais recente na pasta de rede ------------------
set "EXE="
for /f "delims=" %%f in ('dir /b /o-d "%ORIGEM%RelatoriosAterramento_*.exe" 2^>nul') do (
  if not defined EXE set "EXE=%%f"
)
if not defined EXE (
  echo  ERRO: nenhum arquivo RelatoriosAterramento_*.exe foi encontrado nesta
  echo  pasta. Avise o responsavel pela publicacao da versao.
  echo.
  pause
  exit /b 1
)
echo  Versao encontrada: %EXE%

REM --- Copia para a pasta local --------------------------------------------
if not exist "%DESTINO%" mkdir "%DESTINO%"
copy /y "%ORIGEM%%EXE%" "%DESTINO%\RelatoriosAterramento.exe" >nul
if errorlevel 1 (
  echo.
  echo  ERRO: nao foi possivel copiar o executavel. Verifique se o aplicativo
  echo  esta aberto e feche-o antes de instalar.
  echo.
  pause
  exit /b 1
)

REM --- Anota a pasta de rede (usada pela auto-atualizacao) ------------------
> "%DESTINO%\atualizacao.txt" echo %ORIGEM%

REM --- Atalho na Area de Trabalho ------------------------------------------
set "VBS=%TEMP%\atalho_aterramento.vbs"
> "%VBS%" echo Set s = CreateObject("WScript.Shell")
>> "%VBS%" echo Set a = s.CreateShortcut(s.SpecialFolders("Desktop") ^& "\Relatorios de Aterramento.lnk")
>> "%VBS%" echo a.TargetPath = "%DESTINO%\RelatoriosAterramento.exe"
>> "%VBS%" echo a.WorkingDirectory = "%DESTINO%"
>> "%VBS%" echo a.Description = "Gerador de documentos de medicoes de continuidade de aterramento"
>> "%VBS%" echo a.Save
cscript //nologo "%VBS%" >nul
del "%VBS%" >nul 2>&1

echo.
echo ==========================================================================
echo  PRONTO! O atalho "Relatorios de Aterramento" foi criado na sua Area de
echo  Trabalho. Use sempre esse atalho.
echo.
echo  A partir de agora o aplicativo se atualiza sozinho: sempre que uma
echo  versao nova for publicada nesta pasta de rede, ele a instala ao abrir.
echo ==========================================================================
echo.
pause

@echo off
REM ==========================================================================
REM  Publica uma versao nova na pasta de rede.
REM
REM  Como usar (uma vez a cada versao, por quem administra o servidor):
REM    1. abra a Release mais recente no GitHub (Code -^> Releases) e baixe os
REM       DOIS anexos para uma pasta qualquer:
REM          RelatoriosAterramento_<versao>.exe
REM          versao.json
REM    2. coloque este publicar.bat na mesma pasta dos dois arquivos baixados;
REM    3. de um duplo clique neste arquivo. Ele publica na pasta padrao:
REM
REM       V:\Nord Consult\Engenharia\Documentos tecnicos\IA\Softwares e
REM       aplicativos\Medicao continuidade de aterramento\Desktop
REM
REM       Para publicar em outra pasta, rode pelo Prompt de Comando com o
REM       caminho ENTRE ASPAS:
REM
REM          publicar.bat "D:\outra pasta\Desktop"
REM
REM  A ordem da copia importa: o .exe vai PRIMEIRO e o versao.json por ultimo,
REM  para que nenhum usuario veja um versao.json apontando para um arquivo que
REM  ainda nao terminou de copiar.
REM ==========================================================================
setlocal

set "REDE=%~1"

if "%REDE%"=="" (
  REM Sem argumento: usa a pasta padrao da Nord no V:.
  REM
  REM O caminho tem acentos ("Documentos tecnicos", "Medicao") e arquivos .bat
  REM sao lidos pelo cmd no code page do console - um acento digitado aqui
  REM viraria lixo. Por isso cada letra acentuada e escrita como "?", que o
  REM cmd trata como coringa de um caractere ao localizar a pasta.
  for /d %%a in ("V:\Nord Consult\Engenharia\Documentos t?cnicos") do (
    for /d %%b in ("%%a\IA\Softwares e aplicativos\Medi??o continuidade de aterramento") do (
      if exist "%%b\Desktop" set "REDE=%%b\Desktop"
    )
  )
)

if "%REDE%"=="" (
  echo.
  echo  ERRO: a pasta padrao no V: nao foi encontrada. O drive V: esta
  echo  mapeado nesta maquina?
  echo.
  echo  Voce tambem pode informar a pasta manualmente, ENTRE ASPAS:
  echo     publicar.bat "V:\Nord Consult\...\Desktop"
  echo.
  pause
  exit /b 1
)
if "%REDE:~-1%"=="\" set "REDE=%REDE:~0,-1%"

set "AQUI=%~dp0"

if not exist "%AQUI%versao.json" (
  echo  ERRO: versao.json nao encontrado em %AQUI%
  echo  Baixe os dois anexos da Release e coloque-os junto deste arquivo.
  pause
  exit /b 1
)

set "EXE="
for /f "delims=" %%f in ('dir /b /o-d "%AQUI%RelatoriosAterramento_*.exe" 2^>nul') do (
  if not defined EXE set "EXE=%%f"
)
if not defined EXE (
  echo  ERRO: nenhum RelatoriosAterramento_*.exe encontrado em %AQUI%
  pause
  exit /b 1
)

if not exist "%REDE%" mkdir "%REDE%"
if errorlevel 1 (
  echo  ERRO: nao foi possivel acessar ou criar %REDE%
  pause
  exit /b 1
)

echo.
echo  Publicando %EXE% em %REDE% ...

copy /y "%AQUI%%EXE%" "%REDE%\%EXE%" >nul
if errorlevel 1 (
  echo  ERRO ao copiar o executavel. Nada foi publicado.
  pause
  exit /b 1
)

REM O instalador so e copiado se ainda nao existir ou se for diferente.
if exist "%AQUI%Instalar_Aterramento.bat" (
  copy /y "%AQUI%Instalar_Aterramento.bat" "%REDE%\Instalar_Aterramento.bat" >nul
)

REM Por ultimo: e o versao.json que "liga" a nova versao para os usuarios.
copy /y "%AQUI%versao.json" "%REDE%\versao.json" >nul
if errorlevel 1 (
  echo  ERRO ao copiar o versao.json. O executavel foi copiado, mas a versao
  echo  NAO foi ativada - repita a publicacao.
  pause
  exit /b 1
)

echo.
echo ==========================================================================
echo  PUBLICADO. Cada usuario recebe a versao nova automaticamente na proxima
echo  vez que abrir o aplicativo.
echo.
echo  Versoes antigas continuam na pasta e podem ser apagadas depois de alguns
echo  dias - nao apague a que esta no versao.json.
echo ==========================================================================
echo.
pause

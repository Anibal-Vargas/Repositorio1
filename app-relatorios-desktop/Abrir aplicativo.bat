@echo off
REM ============================================================================
REM  Abre o aplicativo no Chrome em modo aplicativo (sem barra de endereco).
REM  Basta manter este .bat na mesma pasta do index.html.
REM ============================================================================
setlocal
set PASTA=%~dp0
set ALVO=file:///%PASTA:\=/%index.html

set CHROME="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="%LocalAppData%\Google\Chrome\Application\chrome.exe"

if not exist %CHROME% (
  echo.
  echo  Nao encontrei o Google Chrome nos locais padrao.
  echo  Abra o arquivo index.html manualmente pelo Chrome.
  echo.
  pause
  exit /b 1
)

start "" %CHROME% --app="%ALVO%" --window-size=1100,860
endlocal

@echo off
REM ==========================================================================
REM  Gera o executavel (.exe) do aplicativo no Windows.
REM  Rode este arquivo (duplo clique) dentro da pasta "desktop".
REM  Requer Python instalado (com "Add python.exe to PATH" marcado).
REM ==========================================================================

echo Instalando dependencias...
pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo ERRO: falha ao instalar as dependencias do requirements.txt.
  echo Verifique sua conexao com a internet e se o Python foi instalado
  echo com a opcao "Add python.exe to PATH" marcada.
  pause
  exit /b 1
)

pip install pyinstaller
if errorlevel 1 (
  echo.
  echo ERRO: falha ao instalar o PyInstaller.
  pause
  exit /b 1
)

echo.
echo Removendo build anterior (se existir)...
if exist dist rmdir /s /q dist
if exist build rmdir /s /q build

echo.
echo Gerando o executavel...
pyinstaller --noconfirm --onefile --windowed --name "RelatoriosAterramento" ^
  --add-data "modelos;modelos" ^
  --add-data "aterramento/logo-nord.png;aterramento" ^
  --hidden-import PIL._tkinter_finder ^
  --hidden-import win32com.client ^
  --hidden-import pythoncom ^
  --hidden-import win32timezone ^
  iniciar_app.py

echo.
if exist "dist\RelatoriosAterramento.exe" (
  echo ==========================================================================
  echo  PRONTO! O executavel foi criado em:
  echo    %cd%\dist\RelatoriosAterramento.exe
  echo.
  echo  Para converter os documentos em PDF sem depender do Word/Excel,
  echo  instale o LibreOffice - gratuito. Com Word/Excel instalados, o PDF
  echo  sai por eles; para isso, rode antes: pip install pywin32
  echo ==========================================================================
) else (
  echo ==========================================================================
  echo  ATENCAO: o arquivo dist\RelatoriosAterramento.exe NAO foi encontrado
  echo  apos a geracao.
  echo.
  echo  Causa mais comum: o Windows Defender (ou outro antivirus) detectou o
  echo  .exe recem-criado como suspeito e o APAGOU sozinho automaticamente
  echo  (falso positivo comum em executaveis gerados pelo PyInstaller).
  echo.
  echo  Como resolver:
  echo   1. Abra o Windows Security ^(Seguranca do Windows^)
  echo      -^> "Protecao contra virus e ameacas"
  echo      -^> "Historico de protecao" e veja se algo foi removido/colocado
  echo         em quarentena agora ha pouco.
  echo   2. Se encontrar, clique em "Permitir no dispositivo" ou restaure o
  echo      arquivo, e adicione a pasta "dist" desta pasta como excecao em
  echo      "Gerenciar configuracoes" -^> "Adicionar ou remover exclusoes".
  echo   3. Rode este construir_exe.bat novamente.
  echo.
  echo  Se nao for o antivirus, role a tela para cima e procure por uma
  echo  linha com a palavra "ERROR" no texto do PyInstaller - copie e envie
  echo  essa mensagem para eu ajudar.
  echo ==========================================================================
)
pause

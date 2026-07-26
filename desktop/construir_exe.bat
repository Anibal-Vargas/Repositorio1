@echo off
REM ==========================================================================
REM  Gera o executavel (.exe) do aplicativo no Windows.
REM  Rode este arquivo (duplo clique) dentro da pasta "desktop".
REM  Requer Python instalado (com "Add python.exe to PATH" marcado).
REM ==========================================================================

echo Instalando dependencias...
pip install -r requirements.txt
pip install pyinstaller

echo.
echo Gerando o executavel...
pyinstaller --noconfirm --onefile --windowed --name "RelatoriosAterramento" ^
  --add-data "modelos;modelos" ^
  --add-data "aterramento/logo-nord.png;aterramento" ^
  --hidden-import PIL._tkinter_finder ^
  iniciar_app.py

echo.
echo ==========================================================================
echo  Pronto! O executavel esta em:  dist\RelatoriosAterramento.exe
echo  (Para converter os documentos em PDF sem depender do Word/Excel,
echo   instale o LibreOffice - gratuito. Com Word/Excel instalados, o PDF
echo   sai por eles; para isso, rode antes: pip install pywin32)
echo ==========================================================================
pause

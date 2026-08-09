"""Embute uma planilha .xlsx no aplicativo (gera modelo/modelo-base64.js).

Uso:  python ferramentas/embutir_modelo.py "Relatorio_Paineis_modelo.xlsx"
"""
import base64, sys, pathlib

if len(sys.argv) < 2:
    sys.exit('Informe o arquivo .xlsx do modelo.')

origem = pathlib.Path(sys.argv[1])
destino = pathlib.Path(__file__).resolve().parent.parent / 'modelo' / 'modelo-base64.js'
dados = origem.read_bytes()
destino.parent.mkdir(exist_ok=True)
destino.write_text(
    '// Planilha modelo NORD CONSULT embutida em base64.\n'
    f'// Origem: {origem.name} ({len(dados):,} bytes)\n'
    '// Regerar com: python ferramentas/embutir_modelo.py <arquivo.xlsx>\n'
    'window.MODELO_XLSX_B64 = "' + base64.b64encode(dados).decode() + '";\n',
    encoding='utf-8')
print(f'Modelo embutido: {origem.name} -> {destino}')

// camera.js — captura de foto pela câmera e compressão antes de salvar.
// A câmera é acionada por <input type="file" capture> (funciona offline e
// abre o app de câmera nativo do Android). A foto é redimensionada para no
// máximo 1920px no maior lado e recomprimida como JPEG qualidade 0.8.

const LADO_MAXIMO = 1920;
const QUALIDADE_JPEG = 0.8;

/**
 * Comprime um File/Blob de imagem. Retorna um Blob JPEG.
 * Usa createImageBitmap com correção de orientação EXIF (Chrome/Android).
 */
export async function comprimirFoto(arquivo) {
  let imagem;
  try {
    imagem = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    imagem = await carregarViaImg(arquivo);
  }

  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
  const largura = Math.round(imagem.width * escala);
  const altura = Math.round(imagem.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  canvas.getContext('2d').drawImage(imagem, 0, 0, largura, altura);
  if (imagem.close) imagem.close();

  const blob = await new Promise((resolver) =>
    canvas.toBlob(resolver, 'image/jpeg', QUALIDADE_JPEG)
  );
  if (!blob) throw new Error('Falha ao comprimir a foto.');
  return blob;
}

function carregarViaImg(arquivo) {
  return new Promise((resolver, rejeitar) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolver(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rejeitar(new Error('Imagem inválida.')); };
    img.src = url;
  });
}

/**
 * Abre a câmera e devolve o Blob JPEG já comprimido (ou null se cancelado).
 * IMPORTANTE: chamar de forma síncrona dentro de um handler de clique,
 * senão o navegador bloqueia a abertura da câmera.
 */
export function capturarFoto() {
  return new Promise((resolver, rejeitar) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.style.display = 'none';
    document.body.append(input);

    const limpar = () => input.remove();

    input.addEventListener('change', async () => {
      const arquivo = input.files && input.files[0];
      limpar();
      if (!arquivo) return resolver(null);
      try {
        resolver(await comprimirFoto(arquivo));
      } catch (erro) {
        rejeitar(erro);
      }
    });

    // 'cancel' é disparado pelo Chrome quando o usuário fecha a câmera sem foto.
    input.addEventListener('cancel', () => { limpar(); resolver(null); });

    input.click();
  });
}

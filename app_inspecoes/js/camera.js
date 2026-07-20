// camera.js — captura de foto pela câmera nativa, preservando a resolução.
// A câmera é acionada por <input type="file" capture> (funciona offline e
// abre o app de câmera nativo do Android). A foto é gravada na resolução
// original da câmera do aparelho: NÃO há redimensionamento. Fotos JPEG (o
// caso normal no Android) são guardadas byte a byte, exatamente como a
// câmera as produziu. Só formatos não-JPEG (ex.: HEIC/PNG) são convertidos
// para JPEG — na resolução cheia — para garantir que abram no relatório.

const QUALIDADE_JPEG = 0.95;

/**
 * Prepara um File/Blob de imagem para gravação, mantendo a resolução da
 * câmera. Devolve o próprio arquivo quando já é JPEG; caso contrário,
 * converte para JPEG em resolução cheia (sem reduzir o tamanho).
 */
export async function prepararFoto(arquivo) {
  // JPEG da câmera: mantém os bytes originais (resolução e qualidade máximas,
  // orientação EXIF preservada — o navegador orienta a <img> automaticamente).
  if (arquivo && arquivo.type === 'image/jpeg') return arquivo;

  // Outros formatos: converte para JPEG mantendo a resolução original.
  let imagem;
  try {
    imagem = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    imagem = await carregarViaImg(arquivo);
  }

  const canvas = document.createElement('canvas');
  canvas.width = imagem.width;
  canvas.height = imagem.height;
  canvas.getContext('2d').drawImage(imagem, 0, 0);
  if (imagem.close) imagem.close();

  const blob = await new Promise((resolver) =>
    canvas.toBlob(resolver, 'image/jpeg', QUALIDADE_JPEG)
  );
  if (!blob) throw new Error('Falha ao processar a foto.');
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
        resolver(await prepararFoto(arquivo));
      } catch (erro) {
        rejeitar(erro);
      }
    });

    // 'cancel' é disparado pelo Chrome quando o usuário fecha a câmera sem foto.
    input.addEventListener('cancel', () => { limpar(); resolver(null); });

    input.click();
  });
}

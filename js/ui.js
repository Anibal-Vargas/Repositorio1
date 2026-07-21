// Helpers de interface: criação de elementos, cabeçalho, toast e utilidades.

export function el(tag, atributos = {}, ...filhos) {
  const elemento = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave.startsWith('on') && typeof valor === 'function') {
      elemento.addEventListener(chave.slice(2), valor);
    } else if (chave === 'class') {
      elemento.className = valor;
    } else if (valor === true) {
      elemento.setAttribute(chave, '');
    } else {
      elemento.setAttribute(chave, valor);
    }
  }
  for (const filho of filhos.flat()) {
    if (filho === null || filho === undefined) continue;
    elemento.append(filho.nodeType ? filho : document.createTextNode(filho));
  }
  return elemento;
}

// Cabeçalho fixo. `voltar` é a rota de destino do botão "←" (ex.: '#/home').
export function cabecalho(titulo, { voltar = null, subtitulo = null } = {}) {
  return el(
    'header',
    { class: 'cabecalho' },
    voltar
      ? el('a', { class: 'btn-voltar', href: voltar, 'aria-label': 'Voltar' }, '←')
      : null,
    el('h1', {}, titulo, subtitulo ? el('span', { class: 'subtitulo' }, subtitulo) : null)
  );
}

let temporizadorToast = null;

export function toast(mensagem) {
  const caixa = document.getElementById('toast');
  if (!caixa) return;
  caixa.textContent = mensagem;
  caixa.classList.add('visivel');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => caixa.classList.remove('visivel'), 2200);
}

export function formatarDataHora(valor) {
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function debounce(funcao, espera = 500) {
  let temporizador = null;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => funcao(...args), espera);
  };
}

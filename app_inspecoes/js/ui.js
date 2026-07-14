// ui.js — utilitários de interface (criação de elementos, cabeçalho, toast).

/**
 * Cria um elemento: el('button', {class: 'btn', onclick: fn}, 'Texto', outroEl)
 */
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

/** Cabeçalho fixo com botão voltar opcional. */
export function cabecalho(titulo, voltarHash = null, subtitulo = null) {
  const h1 = el('h1', {}, titulo);
  if (subtitulo) h1.append(el('span', { class: 'subtitulo' }, subtitulo));
  return el('header', { class: 'cabecalho' },
    voltarHash
      ? el('button', {
          class: 'btn-voltar',
          'aria-label': 'Voltar',
          onclick: () => { location.hash = voltarHash; },
        }, '←')
      : null,
    h1,
  );
}

let temporizadorToast = null;

/** Mensagem breve não bloqueante no rodapé. */
export function toast(mensagem, duracaoMs = 2200) {
  const caixa = document.getElementById('toast');
  caixa.textContent = mensagem;
  caixa.classList.add('visivel');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => caixa.classList.remove('visivel'), duracaoMs);
}

/** Formata timestamp como "14/07/2026 09:32". */
export function formatarDataHora(timestamp) {
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Debounce simples para autosave de campos de texto. */
export function debounce(fn, esperaMs = 400) {
  let temporizador = null;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => fn(...args), esperaMs);
  };
}

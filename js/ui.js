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

// Item de lista com ações de renomear/excluir inline (cliente, setor, máquina).
// - `href`/`onSelecionar`: navegação ao tocar no cartão.
// - `valorEditavel`: texto que aparece no campo ao renomear.
// - `aoRenomear(novoValor)`: salva o novo nome; pode devolver o título a exibir.
// - `aoExcluir()`: se fornecido, habilita o botão Excluir (com confirmação).
export function cartaoEditavel({
  href,
  onSelecionar,
  titulo,
  detalhe,
  selo,
  valorEditavel,
  aoRenomear,
  aoExcluir,
  confirmacaoExcluir,
}) {
  const tituloEl = el('div', { class: 'titulo' }, titulo);
  const cartao = el(
    href ? 'a' : 'button',
    { class: 'cartao', href, onclick: onSelecionar },
    el('div', { class: 'principal' }, tituloEl, detalhe ? el('div', { class: 'detalhe' }, detalhe) : null),
    selo || null,
    el('span', { class: 'seta' }, '›')
  );

  const input = el('input', { type: 'text', value: valorEditavel ?? titulo });
  const editor = el('div', { class: 'editor-inline', hidden: true });

  const abrir = () => {
    editor.hidden = false;
    input.value = valorEditavel ?? titulo;
    input.focus();
  };
  const fechar = () => {
    editor.hidden = true;
  };

  const btnEditar = el(
    'button',
    {
      class: 'btn-editar',
      type: 'button',
      title: 'Editar',
      'aria-label': 'Editar',
      onclick: () => (editor.hidden ? abrir() : fechar()),
    },
    '✎'
  );

  const container = el(
    'div',
    { class: 'item-editavel' },
    el('div', { class: 'linha-cartao' }, cartao, btnEditar),
    editor
  );

  const filhos = [
    input,
    el(
      'button',
      {
        class: 'btn btn-secundario',
        type: 'button',
        onclick: async () => {
          const novo = input.value.trim();
          if (!novo) {
            toast('Informe um nome.');
            input.focus();
            return;
          }
          const novoTitulo = await aoRenomear(novo);
          tituloEl.textContent = novoTitulo ?? novo;
          fechar();
          toast('Nome alterado.');
        },
      },
      'Salvar'
    ),
  ];
  if (aoExcluir) {
    filhos.push(
      el(
        'button',
        {
          class: 'btn btn-perigo',
          type: 'button',
          onclick: async () => {
            if (!confirm(confirmacaoExcluir || 'Excluir este item? Esta ação não pode ser desfeita.')) return;
            await aoExcluir();
            container.remove();
            toast('Excluído.');
          },
        },
        'Excluir'
      )
    );
  }
  filhos.push(el('button', { class: 'btn btn-discreto', type: 'button', onclick: fechar }, 'Cancelar'));
  editor.append(...filhos);

  return container;
}

// Botão de ditado por voz (🎤) para um campo de texto. Usa o reconhecimento
// de fala do navegador (pt-BR), que precisa de internet — offline ou sem
// suporte, avisa e o usuário digita normalmente. O texto reconhecido é
// acrescentado ao campo e dispara o evento "input" (aciona o autosave).
export function botaoDitado(campo) {
  const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
  const botao = el(
    'button',
    { class: 'btn-ditado', type: 'button', title: 'Ditar por voz', 'aria-label': 'Ditar por voz' },
    '🎤'
  );
  let reconhecedor = null;

  botao.addEventListener('click', () => {
    if (reconhecedor) {
      reconhecedor.stop();
      return;
    }
    if (!Reconhecimento) {
      toast('Ditado por voz indisponível neste navegador — digite o texto.');
      return;
    }
    if (navigator.onLine === false) {
      toast('Ditado indisponível sem internet — digite o texto.');
      return;
    }
    reconhecedor = new Reconhecimento();
    reconhecedor.lang = 'pt-BR';
    reconhecedor.interimResults = false;
    reconhecedor.maxAlternatives = 1;
    reconhecedor.onresult = (evento) => {
      const texto = evento.results[0][0].transcript.trim();
      if (!texto) return;
      campo.value = campo.value.trim() ? `${campo.value.trim()} ${texto}` : texto;
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    };
    reconhecedor.onerror = (evento) => {
      if (evento.error === 'not-allowed' || evento.error === 'service-not-allowed') {
        toast('Permita o acesso ao microfone para ditar.');
      } else if (evento.error === 'no-speech') {
        toast('Não entendi — tente de novo.');
      } else if (evento.error === 'network') {
        toast('Ditado indisponível sem internet — digite o texto.');
      } else if (evento.error !== 'aborted') {
        toast('Erro no ditado — digite o texto.');
      }
    };
    reconhecedor.onend = () => {
      reconhecedor = null;
      botao.classList.remove('gravando');
    };
    try {
      reconhecedor.start();
      botao.classList.add('gravando');
      toast('Fale agora…');
    } catch {
      reconhecedor = null;
      toast('Erro ao iniciar o ditado.');
    }
  });

  return botao;
}

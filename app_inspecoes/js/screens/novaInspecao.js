// Nova inspeção — tela única: inspetor (lista suspensa), cliente e tipo.
// O inspetor escolhido fica salvo e vem pré-selecionado na próxima vez.

import {
  listarClientes, criarCliente, criarInspecao, obterInspetor, salvarInspetor,
} from '../db.js';
import { el, cabecalho, toast } from '../ui.js';
import { tipoTemChecklist } from '../checklists.js';

const INSPETORES = [
  'Adauto Muller',
  'Anibal Vargas',
  'Hugo Araújo',
  'Leonardo Oliveira',
  'Thiago Lazzarin',
];

const OUTRO = '__outro__';
const NOVO_CLIENTE = '__novo__';

// Tipos com checklist ativam sozinhos quando js/checklists.js for preenchido.
const TIPOS = [
  { codigo: 'geral', rotulo: 'Geral', icone: '🏭', ativo: true },
  { codigo: 'subestacoes', rotulo: 'Subestações', icone: '⚡', ativo: tipoTemChecklist('subestacoes') },
  { codigo: 'paineis', rotulo: 'Painéis', icone: '🎛️', ativo: tipoTemChecklist('paineis') },
  { codigo: 'documental', rotulo: 'Documental', icone: '📄', ativo: tipoTemChecklist('documental') },
];

export async function telaNovaInspecao() {
  const [clientes, inspetorSalvo] = await Promise.all([listarClientes(), obterInspetor()]);
  const nomeSalvo = inspetorSalvo ? inspetorSalvo.nome : '';
  const salvoNaLista = INSPETORES.includes(nomeSalvo);

  // ---- Inspetor (lista suspensa + opção de digitar) ----
  const seletorInspetor = el('select', { id: 'inspetor' },
    el('option', { value: '', disabled: true, selected: !nomeSalvo }, 'Selecione o inspetor…'),
    INSPETORES.map((nome) =>
      el('option', { value: nome, selected: nome === nomeSalvo }, nome)),
    el('option', { value: OUTRO, selected: !!nomeSalvo && !salvoNaLista }, 'Outro nome…'),
  );
  const campoInspetorOutro = el('input', {
    type: 'text', id: 'inspetor-outro', placeholder: 'Digite o nome do inspetor',
    style: nomeSalvo && !salvoNaLista ? '' : 'display:none',
  });
  if (nomeSalvo && !salvoNaLista) campoInspetorOutro.value = nomeSalvo;
  seletorInspetor.addEventListener('change', () => {
    const outro = seletorInspetor.value === OUTRO;
    campoInspetorOutro.style.display = outro ? '' : 'none';
    if (outro) campoInspetorOutro.focus();
  });

  // ---- Cliente (lista suspensa + cadastro de novo) ----
  const semClientes = clientes.length === 0;
  const seletorCliente = el('select', { id: 'cliente' },
    semClientes
      ? null
      : el('option', { value: '', disabled: true, selected: true }, 'Selecione o cliente…'),
    clientes.map((cliente) => el('option', { value: String(cliente.id) }, cliente.nome)),
    el('option', { value: NOVO_CLIENTE, selected: semClientes }, '➕ Cadastrar novo cliente…'),
  );
  const campoClienteNovo = el('input', {
    type: 'text', id: 'cliente-novo', placeholder: 'Nome do novo cliente',
    style: semClientes ? '' : 'display:none',
  });
  seletorCliente.addEventListener('change', () => {
    const novo = seletorCliente.value === NOVO_CLIENTE;
    campoClienteNovo.style.display = novo ? '' : 'none';
    if (novo) campoClienteNovo.focus();
  });

  // ---- Início da inspeção (toque no tipo) ----
  async function iniciar(tipo) {
    let nome = seletorInspetor.value;
    if (!nome) { toast('Selecione o inspetor.'); seletorInspetor.focus(); return; }
    if (nome === OUTRO) {
      nome = campoInspetorOutro.value.trim();
      if (!nome) { toast('Digite o nome do inspetor.'); campoInspetorOutro.focus(); return; }
    }

    let clienteId = seletorCliente.value;
    if (!clienteId) { toast('Selecione o cliente.'); seletorCliente.focus(); return; }
    if (clienteId === NOVO_CLIENTE) {
      const nomeCliente = campoClienteNovo.value.trim();
      if (!nomeCliente) { toast('Digite o nome do cliente.'); campoClienteNovo.focus(); return; }
      const cliente = await criarCliente(nomeCliente);
      clienteId = cliente.id;
    } else {
      clienteId = Number(clienteId);
    }

    // Guarda o inspetor para vir pré-selecionado na próxima inspeção.
    const empresa = INSPETORES.includes(nome)
      ? 'Nord Consult'
      : (inspetorSalvo ? inspetorSalvo.empresa : '') || '';
    await salvarInspetor({ nome, empresa, criadoEm: Date.now() });

    const id = await criarInspecao(clienteId, tipo, nome);
    toast('Inspeção criada. Tudo é salvo automaticamente.');
    location.hash = `#/inspecao/${id}`;
  }

  return [
    cabecalho('Nova inspeção', '#/home'),
    el('main', { class: 'conteudo' },
      el('h2', {}, 'Inspetor'),
      el('div', {},
        el('label', { for: 'inspetor' }, 'Quem está inspecionando?'),
        seletorInspetor,
      ),
      campoInspetorOutro,

      el('h2', {}, 'Cliente'),
      el('div', {},
        el('label', { for: 'cliente' }, 'Para qual cliente?'),
        seletorCliente,
      ),
      campoClienteNovo,

      el('h2', {}, 'Tipo de inspeção'),
      el('div', { class: 'lista' },
        TIPOS.map((tipo) => el('button', {
          class: 'cartao',
          disabled: !tipo.ativo,
          onclick: () => iniciar(tipo.codigo),
        },
          el('span', { 'aria-hidden': 'true', style: 'font-size:1.4rem' }, tipo.icone),
          el('span', { class: 'principal' },
            el('span', { class: 'titulo' }, tipo.rotulo),
            tipo.ativo
              ? el('span', { class: 'detalhe' }, 'Toque para iniciar')
              : el('span', { class: 'detalhe' }, 'Aguardando checklist'),
          ),
          tipo.ativo ? el('span', { class: 'seta', 'aria-hidden': 'true' }, '›') : null,
        )),
      ),
    ),
  ];
}

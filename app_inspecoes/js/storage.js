// storage.js — persistência do IndexedDB e estimativa de espaço usado.

import { obterConfig, definirConfig } from './db.js';

/**
 * Pede ao navegador para NÃO apagar os dados do app sob pressão de disco.
 * Chamado uma única vez, no primeiro uso (após identificar o inspetor).
 * Retorna true se o armazenamento ficou persistente.
 */
export async function solicitarPersistencia() {
  if (!navigator.storage || !navigator.storage.persist) return false;
  const jaPedido = await obterConfig('persistenciaSolicitada');
  let persistente = await navigator.storage.persisted();
  if (!persistente && !jaPedido) {
    persistente = await navigator.storage.persist();
    await definirConfig('persistenciaSolicitada', true);
  }
  await definirConfig('persistente', persistente);
  return persistente;
}

export function estaPersistente() {
  return navigator.storage && navigator.storage.persisted
    ? navigator.storage.persisted()
    : Promise.resolve(false);
}

function formatarBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** Texto tipo "128,4 MB usados de 24 GB disponíveis". */
export async function textoEspacoUsado() {
  if (!navigator.storage || !navigator.storage.estimate) return '';
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return `${formatarBytes(usage)} usados de ${formatarBytes(quota)} disponíveis`;
  } catch {
    return '';
  }
}

// Persistência do armazenamento e espaço usado.

// Pede ao navegador para não apagar os dados automaticamente.
export async function garantirPersistencia() {
  if (!navigator.storage?.persist) return false;
  try {
    const jaPersistente = await navigator.storage.persisted();
    if (jaPersistente) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

// Retorna { usado, total, persistente } com valores em bytes (ou null se indisponível).
export async function infoArmazenamento() {
  let usado = null;
  let total = null;
  let persistente = null;
  try {
    if (navigator.storage?.estimate) {
      const estimativa = await navigator.storage.estimate();
      usado = estimativa.usage ?? null;
      total = estimativa.quota ?? null;
    }
    if (navigator.storage?.persisted) {
      persistente = await navigator.storage.persisted();
    }
  } catch {
    /* indisponível neste navegador */
  }
  return { usado, total, persistente };
}

export function formatarBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ['KB', 'MB', 'GB'];
  let valor = bytes;
  let i = -1;
  do {
    valor /= 1024;
    i += 1;
  } while (valor >= 1024 && i < unidades.length - 1);
  return `${valor.toFixed(valor >= 10 ? 0 : 1)} ${unidades[i]}`;
}

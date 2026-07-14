// audio.js — gravação de áudio opcional por NC, via MediaRecorder.

function melhorMime() {
  const candidatos = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];
  for (const mime of candidatos) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

export function gravacaoSuportada() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

/**
 * Gravador de um trecho de áudio.
 * Uso: const g = new GravadorAudio(); await g.iniciar(); ... const {blob, mime} = await g.parar();
 */
export class GravadorAudio {
  constructor() {
    this.gravador = null;
    this.fluxo = null;
    this.pedacos = [];
    this.mime = melhorMime();
  }

  get gravando() {
    return !!this.gravador && this.gravador.state === 'recording';
  }

  async iniciar() {
    this.fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.pedacos = [];
    this.gravador = new MediaRecorder(
      this.fluxo,
      this.mime ? { mimeType: this.mime } : undefined
    );
    this.gravador.addEventListener('dataavailable', (evento) => {
      if (evento.data && evento.data.size > 0) this.pedacos.push(evento.data);
    });
    this.gravador.start();
  }

  /** Encerra a gravação e libera o microfone. Retorna {blob, mime}. */
  parar() {
    return new Promise((resolver) => {
      const finalizar = () => {
        const mime = this.gravador.mimeType || this.mime || 'audio/webm';
        const blob = new Blob(this.pedacos, { type: mime });
        this.fluxo.getTracks().forEach((trilha) => trilha.stop());
        this.gravador = null;
        this.fluxo = null;
        resolver({ blob, mime });
      };
      if (!this.gravando) return finalizar();
      this.gravador.addEventListener('stop', finalizar, { once: true });
      this.gravador.stop();
    });
  }

  /** Cancela sem salvar (ex.: usuário saiu da tela). */
  cancelar() {
    if (this.gravador && this.gravador.state !== 'inactive') this.gravador.stop();
    if (this.fluxo) this.fluxo.getTracks().forEach((trilha) => trilha.stop());
    this.gravador = null;
    this.fluxo = null;
    this.pedacos = [];
  }
}

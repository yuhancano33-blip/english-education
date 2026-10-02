import workletUrl from './pcm-capture.worklet.js?worker&url'

const TARGET_RATE = 16000
const CHUNK_MS = 30

/**
 * Captura del micrófono (SPEC-002 §3): getUserMedia con cancelación de eco y
 * supresión de ruido + AudioWorklet que entrega PCM 16 kHz en fragmentos.
 *
 * El AudioContext se crea en el constructor para poder hacerlo dentro del
 * gesto del usuario (clic), antes de cualquier `await`.
 */
export class Microphone {
  readonly context = new AudioContext()
  readonly analyser: AnalyserNode
  stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null

  constructor() {
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 512
  }

  async start(onChunk: (pcm: ArrayBuffer) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    await this.context.audioWorklet.addModule(workletUrl)

    const source = this.context.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(this.context, 'pcm-capture', {
      processorOptions: { targetRate: TARGET_RATE, chunkMs: CHUNK_MS },
    })
    this.node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => onChunk(event.data)

    source.connect(this.analyser)
    source.connect(this.node)
    // El worklet no produce sonido; se conecta al destino para que el grafo lo procese
    this.node.connect(this.context.destination)
    await this.context.resume()
  }

  /** Silenciar: deja de enviar audio sin cerrar la conexión. */
  setEnabled(enabled: boolean) {
    this.node?.port.postMessage({ type: 'enabled', value: enabled })
    this.stream?.getAudioTracks().forEach((track) => (track.enabled = enabled))
  }

  async stop() {
    this.node?.port.close()
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    if (this.context.state !== 'closed') await this.context.close()
  }
}

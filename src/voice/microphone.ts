import workletUrl from './pcm-capture.worklet.js?worker&url'

const TARGET_RATE = 16000
const CHUNK_MS = 30

/**
 * Captura del micrófono (SPEC-002 §3): getUserMedia con cancelación de eco y
 * supresión de ruido + AudioWorklet que entrega PCM 16 kHz en fragmentos.
 *
 * Usa el AudioContext compartido de la sesión, para que el mismo audio pueda
 * mezclarse con la voz del agente en la grabación.
 */
export class Microphone {
  readonly analyser: AnalyserNode
  stream: MediaStream | null = null
  /** Nodo de entrada, para conectarlo también a la grabación */
  source: MediaStreamAudioSourceNode | null = null
  private node: AudioWorkletNode | null = null

  constructor(private readonly context: AudioContext) {
    this.analyser = context.createAnalyser()
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

    this.source = this.context.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(this.context, 'pcm-capture', {
      processorOptions: { targetRate: TARGET_RATE, chunkMs: CHUNK_MS },
    })
    this.node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => onChunk(event.data)

    this.source.connect(this.analyser)
    this.source.connect(this.node)
    // El worklet no produce sonido; un nodo silenciado lo mantiene en el grafo
    // sin devolver la voz del usuario por los altavoces
    const sink = this.context.createGain()
    sink.gain.value = 0
    this.node.connect(sink).connect(this.context.destination)
  }

  /** Silenciar: deja de enviar audio sin cerrar la conexión. */
  setEnabled(enabled: boolean) {
    this.node?.port.postMessage({ type: 'enabled', value: enabled })
    this.stream?.getAudioTracks().forEach((track) => (track.enabled = enabled))
  }

  stop() {
    this.node?.port.close()
    this.node?.disconnect()
    this.source?.disconnect()
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.source = null
  }
}

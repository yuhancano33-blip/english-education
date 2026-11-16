/** Tipo de archivo que se sube (sin parámetros de códec, SPEC-005). */
export type RecordingMime = 'audio/webm' | 'audio/mp4'

export interface Recording {
  blob: Blob
  mime: RecordingMime
}

/** Calidad suficiente para voz: ~1,7 MB por sesión de 7 min (SPEC-002 §5). */
const BITS_PER_SECOND = 32_000

/**
 * Graba la sesión completa (SPEC-002 §5): mezcla el micrófono y la voz del
 * agente en un MediaStreamAudioDestinationNode y la graba con MediaRecorder.
 * webm/opus en Chrome, Edge y Firefox; mp4 en Safari.
 */
export class SessionRecorder {
  private readonly destination: MediaStreamAudioDestinationNode
  private readonly recorder: MediaRecorder
  private readonly chunks: Blob[] = []
  readonly mime: RecordingMime

  constructor(context: AudioContext, inputs: AudioNode[]) {
    this.destination = context.createMediaStreamDestination()
    for (const input of inputs) input.connect(this.destination)

    const candidates: [string, RecordingMime][] = [
      ['audio/webm;codecs=opus', 'audio/webm'],
      ['audio/webm', 'audio/webm'],
      ['audio/mp4', 'audio/mp4'],
    ]
    const supported = candidates.find(([type]) => MediaRecorder.isTypeSupported(type))
    if (!supported) throw new Error('El navegador no puede grabar audio')

    this.mime = supported[1]
    this.recorder = new MediaRecorder(this.destination.stream, {
      mimeType: supported[0],
      audioBitsPerSecond: BITS_PER_SECOND,
    })
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data)
    }
  }

  start() {
    // Fragmentos cada segundo: si algo falla al final, no se pierde todo
    this.recorder.start(1000)
  }

  /** Detiene la grabación y devuelve el archivo (null si no hay audio). */
  stop(): Promise<Recording | null> {
    return new Promise((resolve) => {
      const finish = () => {
        this.destination.disconnect()
        const blob = new Blob(this.chunks, { type: this.mime })
        resolve(blob.size > 0 ? { blob, mime: this.mime } : null)
      }
      if (this.recorder.state === 'inactive') return finish()
      this.recorder.onstop = finish
      this.recorder.stop()
    })
  }
}

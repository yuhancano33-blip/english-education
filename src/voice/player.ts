import { base64ToFloat32 } from './pcm'

const OUTPUT_RATE = 24000

/**
 * Reproducción del audio del agente (SPEC-002 §3): cola de fragmentos PCM de
 * 24 kHz programados uno tras otro con Web Audio. `flush()` la vacía al
 * instante cuando el usuario interrumpe.
 *
 * Se crea dentro del gesto del usuario para que el navegador permita el audio.
 */
export class PcmPlayer {
  readonly context = new AudioContext({ sampleRate: OUTPUT_RATE })
  readonly analyser: AnalyserNode
  private readonly output: GainNode
  private readonly sources = new Set<AudioBufferSourceNode>()
  private nextStart = 0

  constructor() {
    this.output = this.context.createGain()
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 512
    this.output.connect(this.analyser)
    this.analyser.connect(this.context.destination)
  }

  resume() {
    return this.context.resume()
  }

  enqueue(base64Pcm: string) {
    const samples = base64ToFloat32(base64Pcm)
    if (samples.length === 0) return

    const buffer = this.context.createBuffer(1, samples.length, OUTPUT_RATE)
    buffer.copyToChannel(samples, 0)
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.output)

    // Pequeño margen al empezar un turno para evitar cortes
    const startAt = Math.max(this.nextStart, this.context.currentTime + 0.05)
    source.start(startAt)
    this.nextStart = startAt + buffer.duration

    this.sources.add(source)
    source.onended = () => this.sources.delete(source)
  }

  /** Vacía la cola: el usuario habló encima del agente (barge-in). */
  flush() {
    for (const source of this.sources) {
      try {
        source.stop()
      } catch {
        // ya detenido
      }
    }
    this.sources.clear()
    this.nextStart = 0
  }

  /** Aviso sonoro breve (SPEC-002 §4, minuto 6:00). */
  beep(frequency = 880, durationMs = 180) {
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    const now = this.context.currentTime
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)
    oscillator.connect(gain).connect(this.context.destination)
    oscillator.start(now)
    oscillator.stop(now + durationMs / 1000 + 0.05)
  }

  async close() {
    this.flush()
    if (this.context.state !== 'closed') await this.context.close()
  }
}

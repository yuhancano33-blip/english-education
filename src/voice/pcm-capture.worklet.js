// AudioWorklet de captura (SPEC-002 §3): convierte la entrada del micrófono a
// PCM de 16 bits, mono, a 16 kHz, y la envía en fragmentos de ~30 ms.
// Es JavaScript porque los AudioWorklet se cargan como módulos independientes.

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const { targetRate = 16000, chunkMs = 30 } = options.processorOptions ?? {}
    // `sampleRate` es global en el ámbito del worklet (frecuencia del AudioContext)
    this.ratio = sampleRate / targetRate
    this.chunkSize = Math.round((targetRate * chunkMs) / 1000)
    this.chunk = new Int16Array(this.chunkSize)
    this.filled = 0
    // Posición fraccionaria de lectura; -1 apunta a la última muestra del bloque anterior
    this.pos = 0
    this.last = 0
    this.enabled = true

    this.port.onmessage = (event) => {
      if (event.data?.type === 'enabled') {
        this.enabled = Boolean(event.data.value)
        this.filled = 0
      }
    }
  }

  process(inputs) {
    const channel = inputs[0]?.[0]
    if (!channel || channel.length === 0) return true

    const n = channel.length
    if (this.enabled) {
      // Remuestreo por interpolación lineal
      let pos = this.pos
      while (pos <= n - 1) {
        const i0 = Math.floor(pos)
        const frac = pos - i0
        const s0 = i0 < 0 ? this.last : channel[i0]
        const s1 = i0 + 1 < n ? channel[i0 + 1] : s0
        const sample = Math.max(-1, Math.min(1, s0 + (s1 - s0) * frac))
        this.chunk[this.filled++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff

        if (this.filled === this.chunkSize) {
          this.port.postMessage(this.chunk.buffer, [this.chunk.buffer])
          this.chunk = new Int16Array(this.chunkSize)
          this.filled = 0
        }
        pos += this.ratio
      }
      this.pos = pos - n
    }
    this.last = channel[n - 1]
    return true
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor)

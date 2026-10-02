/** PCM 16 bits → base64, para enviar a Gemini Live. */
export function pcmToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

/** base64 con PCM 16 bits little-endian → muestras Float32 en [-1, 1]. */
export function base64ToFloat32(data: string): Float32Array<ArrayBuffer> {
  const binary = atob(data)
  const view = new DataView(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) view.setUint8(i, binary.charCodeAt(i))
  const samples = new Float32Array(Math.floor(binary.length / 2))
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 0x8000
  }
  return samples
}

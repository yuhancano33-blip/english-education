import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { Recording } from './recorder'

const UPLOAD_ATTEMPTS = 3

interface UploadTarget {
  bucket: string
  path: string
  token: string
}

/**
 * Sube la grabación a Storage con una URL firmada del backend (SPEC-002 §5).
 * Reintenta hasta 3 veces; devuelve la ruta o null si no se pudo.
 */
export async function uploadRecording(sessionId: string, recording: Recording): Promise<string | null> {
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
    try {
      const target = await api<UploadTarget>(`/api/chat/sessions/${sessionId}/audio-upload-url`, {
        method: 'POST',
        body: JSON.stringify({ mime: recording.mime }),
      })
      const { error } = await supabase.storage
        .from(target.bucket)
        .uploadToSignedUrl(target.path, target.token, recording.blob, {
          contentType: recording.mime,
          upsert: true,
        })
      if (error) throw error
      return target.path
    } catch {
      if (attempt < UPLOAD_ATTEMPTS) await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
  return null
}

export interface TurnToSave {
  turn_index: number
  sender: 'user' | 'assistant'
  content: string
}

/**
 * Envía al backend los turnos nuevos o modificados de la transcripción.
 * Las llamadas se encadenan para no solaparse; un turno reenviado se actualiza
 * (upsert por turn_index), así que repetir es seguro.
 */
export class TranscriptSync {
  private readonly sent = new Map<number, string>()
  private chain: Promise<void> = Promise.resolve()

  constructor(private readonly sessionId: string) {}

  sync(turns: TurnToSave[]): Promise<void> {
    this.chain = this.chain.then(() => this.send(turns)).catch(() => {})
    return this.chain
  }

  private async send(turns: TurnToSave[]) {
    const pending = turns
      .map((t) => ({ ...t, content: t.content.trim() }))
      .filter((t) => t.content && this.sent.get(t.turn_index) !== t.content)
    if (pending.length === 0) return

    for (let i = 0; i < pending.length; i += 50) {
      const batch = pending.slice(i, i + 50)
      await api(`/api/chat/sessions/${this.sessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ turns: batch }),
      })
      for (const t of batch) this.sent.set(t.turn_index, t.content)
    }
  }
}

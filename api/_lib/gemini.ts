import { GoogleGenAI, Modality, type LiveConnectConfig } from '@google/genai'
import { systemInstructionFor, type SessionMode } from './instructions.js'

/** Ventana para abrir la conexión con el token (SPEC-002 §2). */
const CONNECT_WINDOW_MS = 60_000
/** Expiración del token: cubre una sesión de 7 min con margen. */
const TOKEN_TTL_MS = 10 * 60_000

export function liveModel(): string {
  return process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live'
}

export interface EphemeralToken {
  token: string
  expiresAt: string
  model: string
}

/**
 * Crea un token efímero de un solo uso con modelo, voz, modalidad,
 * transcripciones e instrucciones bloqueados (SPEC-002 §2, SPEC-006 §6).
 * La API key nunca sale del backend.
 */
export async function createLiveToken(mode: SessionMode): Promise<EphemeralToken> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Falta GEMINI_API_KEY')

  const model = liveModel()
  const voice = process.env.GEMINI_VOICE
  const config: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    systemInstruction: systemInstructionFor(mode),
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    ...(voice
      ? { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } }
      : {}),
  }

  const now = Date.now()
  const expiresAt = new Date(now + TOKEN_TTL_MS).toISOString()
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } })
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: expiresAt,
      newSessionExpireTime: new Date(now + CONNECT_WINDOW_MS).toISOString(),
      liveConnectConstraints: { model, config },
      // Lista vacía: se bloquean todos los campos definidos arriba
      lockAdditionalFields: [],
      httpOptions: { apiVersion: 'v1alpha' },
    },
  })
  if (!token.name) throw new Error('Gemini no devolvió el token')
  return { token: token.name, expiresAt, model }
}

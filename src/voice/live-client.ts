import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai'

export interface LiveHandlers {
  onAudio: (base64Pcm: string) => void
  onInterrupted: () => void
  onInputTranscript: (text: string) => void
  onOutputTranscript: (text: string) => void
  onTurnComplete: () => void
  onClose: (event: CloseEvent) => void
  onError: (message: string) => void
}

/**
 * Conexión directa navegador → Gemini Live con el token efímero (SPEC-001 §2).
 * La configuración real (modelo, voz, instrucciones) está bloqueada en el token.
 */
export class LiveClient {
  private constructor(private readonly session: Session) {}

  static async connect(token: string, model: string, handlers: LiveHandlers): Promise<LiveClient> {
    const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } })
    const session = await ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onmessage: (message) => dispatch(message, handlers),
        onerror: (event) => handlers.onError(event.message || 'Error de conexión'),
        onclose: (event) => handlers.onClose(event),
      },
    })
    return new LiveClient(session)
  }

  sendAudio(base64Pcm: string) {
    this.session.sendRealtimeInput({
      audio: { data: base64Pcm, mimeType: 'audio/pcm;rate=16000' },
    })
  }

  /** Avisa de que el micrófono se silenció, para que el VAD cierre el turno. */
  sendAudioEnd() {
    this.session.sendRealtimeInput({ audioStreamEnd: true })
  }

  /** Mensaje de texto de la aplicación (p. ej. la despedida del minuto 6:45). */
  sendText(text: string) {
    this.session.sendClientContent({
      turns: [{ role: 'user', parts: [{ text }] }],
      turnComplete: true,
    })
  }

  close() {
    this.session.close()
  }
}

function dispatch(message: LiveServerMessage, handlers: LiveHandlers) {
  const content = message.serverContent
  if (!content) return

  if (content.interrupted) handlers.onInterrupted()

  for (const part of content.modelTurn?.parts ?? []) {
    const data = part.inlineData?.data
    if (data && part.inlineData?.mimeType?.startsWith('audio/')) handlers.onAudio(data)
  }

  if (content.inputTranscription?.text) handlers.onInputTranscript(content.inputTranscription.text)
  if (content.outputTranscription?.text) handlers.onOutputTranscript(content.outputTranscription.text)
  if (content.turnComplete) handlers.onTurnComplete()
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/** Cliente con service role. Solo backend: salta RLS (SPEC-006 §2). */
export function supabaseAdmin(): SupabaseClient {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithConnectRetry },
  })
  return client
}

const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 300

/**
 * Errores en los que la petición nunca llegó a Supabase (DNS o conexión TCP):
 * repetirla es seguro aunque sea un POST, porque el servidor no la recibió.
 * Errores a mitad de petición (p. ej. ECONNRESET) no se reintentan.
 */
const PRE_SEND_ERRORS = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
])

function isPreSendError(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string; errors?: { code?: string }[] } })?.cause
  if (!cause) return false
  if (cause.code && PRE_SEND_ERRORS.has(cause.code)) return true
  // AggregateError cuando fallan todas las IPs del host
  return !!cause.errors?.length && cause.errors.every((e) => !!e.code && PRE_SEND_ERRORS.has(e.code))
}

async function fetchWithConnectRetry(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(input, init)
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !isPreSendError(err) || init?.signal?.aborted) throw err
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'supabase_connect_retry',
          attempt,
          code: (err as { cause?: { code?: string } }).cause?.code,
        }),
      )
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt))
    }
  }
}

import { supabase } from './supabase'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /** Campos extra del error, p. ej. `resetsAt` en el 429 de sesiones */
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

/** Llama al backend con el JWT de Supabase y normaliza los errores (SPEC-005 §2). */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body) headers.set('Content-Type', 'application/json')

  let response: Response
  try {
    response = await fetch(path, { ...init, headers })
  } catch {
    throw new ApiError(0, 'network_error', 'No se pudo conectar con el servidor. Revisa tu conexión.')
  }

  // Si la respuesta no es JSON, la API no está detrás de esta URL (p. ej. un
  // servidor de desarrollo sin el plugin de dev/api-dev-server.ts, que sirve
  // api/*.ts como código fuente con 200). Nunca se trata como respuesta válida
  // ni como estado pending.
  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false
  if (!isJson) {
    throw new ApiError(
      response.status,
      'api_unavailable',
      import.meta.env.DEV
        ? 'La API (/api) no está disponible. Detén el servidor y vuelve a arrancarlo con `npm run dev`; revisa la terminal por si hay errores.'
        : 'El servidor devolvió una respuesta inesperada. Inténtalo de nuevo más tarde.',
    )
  }

  const body = await response.json().catch(() => null)
  if (!response.ok || body === null) {
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'unknown_error',
      body?.error?.message ?? 'Error inesperado',
      body?.error ?? {},
    )
  }
  return body as T
}

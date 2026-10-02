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

  const response = await fetch(path, { ...init, headers })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'unknown_error',
      body?.error?.message ?? 'Error inesperado',
      body?.error ?? {},
    )
  }
  return body as T
}

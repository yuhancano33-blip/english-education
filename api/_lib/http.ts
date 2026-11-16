import { randomUUID } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { z, ZodTypeAny } from 'zod'

/** Error con código HTTP y código de API (SPEC-005 §2). */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /** Campos extra dentro de `error` (p. ej. `resetsAt`) */
    public readonly extra: Record<string, unknown> = {},
    /** Cabeceras de la respuesta (p. ej. `Retry-After`) */
    public readonly headers: Record<string, string> = {},
  ) {
    super(message)
  }
}

export function sendError(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  res.status(status).json({ error: { code, message, ...extra } })
}

// --- Contexto por petición para los logs (SPEC-007 §4) ---

const requestUsers = new WeakMap<VercelRequest, string>()

/** Lo llama la autenticación para que el log de la petición incluya el usuario. */
export function setRequestUser(req: VercelRequest, userId: string) {
  requestUsers.set(req, userId)
}

// --- Origen permitido (SPEC-006 §4) ---

function originAllowed(req: VercelRequest): boolean {
  const origin = req.headers.origin
  if (!origin) return true // peticiones del mismo origen sin cabecera, o servidor a servidor

  let host: string
  try {
    host = new URL(origin).host
  } catch {
    return false
  }
  // El propio dominio (producción o el preview desde el que se sirve la app)
  if (host === req.headers.host) return true

  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return allowed.some((pattern) => {
    if (!pattern.includes('*')) return pattern === origin
    const regex = new RegExp(
      '^' + pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\/]/g, '\\$&')).join('[a-z0-9-]+') + '$',
      'i',
    )
    return regex.test(origin)
  })
}

export type MethodHandler = (req: VercelRequest, res: VercelResponse) => unknown | Promise<unknown>

/**
 * Reparte un método HTTP según `?action=`. La clave '' es la petición sin
 * acción. Una acción desconocida responde 404.
 *
 * Permite agrupar varios endpoints en una sola función serverless (el plan
 * Hobby de Vercel admite como máximo 12 por despliegue).
 */
export function byAction(actions: Record<string, MethodHandler>): MethodHandler {
  return (req, res) => {
    const raw = req.query.action
    const action = typeof raw === 'string' ? raw : ''
    const handler = Object.hasOwn(actions, action) ? actions[action] : undefined
    if (!handler) throw new HttpError(404, 'not_found', 'Acción no encontrada')
    return handler(req, res)
  }
}

/**
 * Enruta por método HTTP, rechaza orígenes no permitidos, convierte los
 * errores al formato común y deja un log estructurado por petición, sin
 * contenido de conversaciones (SPEC-006 §7, SPEC-007 §4).
 */
export function route(methods: Partial<Record<string, MethodHandler>>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    const requestId = randomUUID()
    const startedAt = Date.now()
    res.setHeader('X-Request-Id', requestId)
    let errorMessage: string | undefined

    try {
      if (!originAllowed(req)) {
        throw new HttpError(403, 'origin_not_allowed', 'Origen no permitido')
      }
      const handler = methods[req.method ?? '']
      if (!handler) {
        res.setHeader('Allow', Object.keys(methods).join(', '))
        throw new HttpError(405, 'method_not_allowed', 'Método no permitido')
      }
      await handler(req, res)
    } catch (err) {
      if (err instanceof HttpError) {
        for (const [name, value] of Object.entries(err.headers)) res.setHeader(name, value)
        sendError(res, err.status, err.code, err.message, err.extra)
      } else {
        errorMessage = err instanceof Error ? err.message : String(err)
        sendError(res, 500, 'internal_error', 'Error interno del servidor')
      }
    } finally {
      const status = res.statusCode
      const entry = {
        level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        requestId,
        method: req.method,
        path: req.url?.split('?')[0],
        status,
        durationMs: Date.now() - startedAt,
        userId: requestUsers.get(req),
        ...(errorMessage ? { error: errorMessage } : {}),
      }
      ;(status >= 500 ? console.error : console.log)(JSON.stringify(entry))
    }
  }
}

/** Valida un valor con Zod o lanza 400. */
export function parse<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value)
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; ')
    throw new HttpError(400, 'invalid_request', detail)
  }
  return result.data
}

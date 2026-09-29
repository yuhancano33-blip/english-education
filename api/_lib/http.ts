import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { z, ZodTypeAny } from 'zod'

/** Error con código HTTP y código de API (SPEC-005 §2). */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function sendError(res: VercelResponse, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } })
}

type MethodHandler = (req: VercelRequest, res: VercelResponse) => unknown | Promise<unknown>

/** Enruta por método HTTP y convierte los errores al formato común. */
export function route(methods: Partial<Record<string, MethodHandler>>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    const handler = methods[req.method ?? '']
    if (!handler) {
      res.setHeader('Allow', Object.keys(methods).join(', '))
      return sendError(res, 405, 'method_not_allowed', 'Método no permitido')
    }
    try {
      await handler(req, res)
    } catch (err) {
      if (err instanceof HttpError) {
        return sendError(res, err.status, err.code, err.message)
      }
      // Logs sin contenido de conversaciones ni datos personales (SPEC-006 §7)
      console.error(
        JSON.stringify({
          level: 'error',
          method: req.method,
          path: req.url?.split('?')[0],
          message: err instanceof Error ? err.message : String(err),
        }),
      )
      sendError(res, 500, 'internal_error', 'Error interno del servidor')
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

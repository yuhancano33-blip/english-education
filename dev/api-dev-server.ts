import { readdirSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { loadEnv, type Plugin, type ViteDevServer } from 'vite'

/**
 * SOLO DESARROLLO LOCAL: sirve las Vercel Functions de `api/` dentro del
 * servidor de Vite, para que `npm run dev` funcione sin la CLI de Vercel.
 *
 * - Carga las variables de `.env` (también las de backend, sin prefijo VITE_)
 *   en `process.env` del proceso de Node, nunca en el bundle del navegador.
 * - Replica el enrutado por archivos de Vercel: `api/me.ts` → `/api/me`,
 *   `api/x/index.ts` → `/api/x`, `[id]` → parámetro en `req.query.id`.
 * - Imita lo que usan los handlers de `VercelRequest`/`VercelResponse`:
 *   `req.query`, `req.body` (JSON), `res.status()` y `res.json()`.
 *
 * En Vercel (producción y previews) este archivo no se usa.
 */

interface Route {
  pattern: RegExp
  params: string[]
  file: string
}

const MAX_BODY_BYTES = 1024 * 1024

export function apiDevServer(): Plugin {
  return {
    name: 'api-dev-server',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root
      const env = loadEnv(server.config.mode, root, '')
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value
      }

      const apiDir = path.join(root, 'api')
      let routes = buildRoutes(apiDir)
      server.watcher.on('add', () => (routes = buildRoutes(apiDir)))
      server.watcher.on('unlink', () => (routes = buildRoutes(apiDir)))

      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') return next()

        const match = matchRoute(routes, url.pathname)
        if (!match) return sendJson(res, 404, { error: { code: 'not_found', message: 'Ruta de API no encontrada' } })

        try {
          await invoke(server, match.route.file, req, res, url, match.params)
        } catch (err) {
          server.config.logger.error(`[api] ${url.pathname}: ${err instanceof Error ? err.stack : err}`)
          if (!res.headersSent) {
            sendJson(res, 500, { error: { code: 'internal_error', message: 'Error interno del servidor' } })
          }
        }
      })
    },
  }
}

async function invoke(
  server: ViteDevServer,
  file: string,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  params: Record<string, string>,
) {
  const mod = await server.ssrLoadModule(file)
  const handler = mod.default
  if (typeof handler !== 'function') throw new Error(`${file} no exporta un handler por defecto`)

  const query: Record<string, string | string[]> = {}
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key)
    query[key] = values.length > 1 ? values : values[0]
  }
  Object.assign(query, params)

  const vercelReq = Object.assign(req, { query, body: await readBody(req) })
  const vercelRes = Object.assign(res, {
    status(code: number) {
      res.statusCode = code
      return vercelRes
    },
    json(body: unknown) {
      if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(body))
      return vercelRes
    },
    send(body: unknown) {
      res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
      return vercelRes
    },
  })

  await handler(vercelReq, vercelRes)
}

function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return Promise.resolve(undefined)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Cuerpo de la petición demasiado grande'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve(undefined)
      if (req.headers['content-type']?.includes('application/json')) {
        try {
          return resolve(JSON.parse(raw))
        } catch {
          // Igual que Vercel: JSON inválido llega como texto y Zod lo rechaza
        }
      }
      resolve(raw)
    })
    req.on('error', reject)
  })
}

function buildRoutes(apiDir: string): Route[] {
  const routes: Route[] = []

  const walk = (dir: string, segments: string[]) => {
    for (const name of readdirSync(dir)) {
      // Como en Vercel, lo que empieza por _ o . no es una ruta
      if (name.startsWith('_') || name.startsWith('.')) continue
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) {
        walk(full, [...segments, name])
      } else if (/\.(ts|js|mjs)$/.test(name) && !name.endsWith('.d.ts')) {
        const base = name.replace(/\.(ts|js|mjs)$/, '')
        routes.push(toRoute(base === 'index' ? segments : [...segments, base], full))
      }
    }
  }
  walk(apiDir, [])

  // Las rutas estáticas tienen prioridad sobre las dinámicas
  return routes.sort((a, b) => a.params.length - b.params.length)
}

function toRoute(segments: string[], file: string): Route {
  const params: string[] = []
  const source = segments
    .map((segment) => {
      const dynamic = /^\[(.+)\]$/.exec(segment)
      if (dynamic) {
        params.push(dynamic[1])
        return '([^/]+)'
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  return { pattern: new RegExp(`^/api${source ? '/' + source : ''}/?$`), params, file }
}

function matchRoute(routes: Route[], pathname: string) {
  for (const route of routes) {
    const match = route.pattern.exec(pathname)
    if (match) {
      const params = Object.fromEntries(
        route.params.map((name, i) => [name, decodeURIComponent(match[i + 1])]),
      )
      return { route, params }
    }
  }
  return null
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

import { createHash, timingSafeEqual } from 'node:crypto'

function digest(value: string) {
  return createHash('sha256').update(value).digest()
}

/** Compara un secreto recibido con el esperado en tiempo constante. */
export function secretMatches(received: unknown, expected: string | undefined): boolean {
  if (!expected || typeof received !== 'string') return false
  return timingSafeEqual(digest(received), digest(expected))
}

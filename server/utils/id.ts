import { randomBytes } from 'node:crypto'

// Simple collision-resistant id generator (prefix + timestamp + random), mirrors
// the id style used in the original prototype (e.g. 'bt'+Date.now()+random).
export function genId(prefix = ''): string {
  const rand = randomBytes(5).toString('hex')
  return `${prefix}${Date.now().toString(36)}${rand}`
}

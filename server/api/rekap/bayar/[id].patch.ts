import { eq } from 'drizzle-orm'
import { bayarRows } from '../../../database/schema'

const FIELDS = ['pt', 'groupId', 'nominal', 'tglBayar', 'tglPesan', 'noCtr', 'payIam', 'payEkspds', 'ket']
const DATE_FIELDS = new Set(['tglBayar', 'tglPesan'])

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const patch: Record<string, any> = {}
  for (const f of FIELDS) {
    if (body[f] === undefined) continue
    patch[f] = f === 'nominal' ? (Number(body[f]) || 0) : (body[f] === '' && DATE_FIELDS.has(f) ? null : body[f])
  }
  if (Object.keys(patch).length === 0) throw createError({ statusCode: 400, statusMessage: 'Gak ada field yang diupdate.' })
  await db.update(bayarRows).set(patch).where(eq(bayarRows.id, id))
  return { ok: true }
})

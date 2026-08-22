import { eq } from 'drizzle-orm'
import { depositoRows } from '../../../database/schema'

const FIELDS = ['nama', 'nominal', 'tglMasuk', 'rate', 'jatuhTempo', 'ket']

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const patch: Record<string, any> = {}
  for (const f of FIELDS) {
    if (body[f] === undefined) continue
    patch[f] = f === 'nominal' ? (Number(body[f]) || 0) : (body[f] === '' && (f === 'tglMasuk' || f === 'jatuhTempo') ? null : body[f])
  }
  if (Object.keys(patch).length === 0) throw createError({ statusCode: 400, statusMessage: 'Gak ada field yang diupdate.' })
  await db.update(depositoRows).set(patch).where(eq(depositoRows.id, id))
  return { ok: true }
})

import { eq } from 'drizzle-orm'
import { hutangRows } from '../../../database/schema'

const FIELDS = ['peminjam', 'kreditur', 'nominal', 'rate', 'tglPinjam', 'jatuhTempo', 'ket', 'groupId']
const DATE_FIELDS = new Set(['tglPinjam', 'jatuhTempo'])
const NULLABLE_FIELDS = new Set([...DATE_FIELDS, 'groupId'])

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const patch: Record<string, any> = {}
  for (const f of FIELDS) {
    if (body[f] === undefined) continue
    patch[f] = f === 'nominal' ? (Number(body[f]) || 0) : (body[f] === '' && NULLABLE_FIELDS.has(f) ? null : body[f])
  }
  if (Object.keys(patch).length === 0) throw createError({ statusCode: 400, statusMessage: 'Gak ada field yang diupdate.' })
  await db.update(hutangRows).set(patch).where(eq(hutangRows.id, id))
  return { ok: true }
})

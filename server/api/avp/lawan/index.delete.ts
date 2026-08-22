import { and, eq, or } from 'drizzle-orm'
import { avpLawan } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const rowId = String(q.rowId || '')
  const partnerId = String(q.partnerId || '')
  if (!rowId || !partnerId) throw createError({ statusCode: 400, statusMessage: 'rowId dan partnerId wajib diisi.' })

  // Hapus kedua arah sekaligus — pasangannya disimpan dua baris.
  await db.delete(avpLawan).where(or(
    and(eq(avpLawan.rowId, rowId), eq(avpLawan.partnerId, partnerId)),
    and(eq(avpLawan.rowId, partnerId), eq(avpLawan.partnerId, rowId))
  ))
  return { ok: true }
})

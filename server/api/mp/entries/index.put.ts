import { and, eq } from 'drizzle-orm'
import { mpEntries } from '../../../database/schema'

/**
 * Upsert satu sel grid Rincian MP (satu toko, satu tanggal).
 * Di app lama ini cuma mutasi objek mpRows[].vals[storeId] = {d, k}.
 * Kalau debet & kredit dua-duanya 0, barisnya dihapus supaya tabel tidak
 * penuh sel kosong — sama seperti perilaku migrasi backup.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {}
  const storeId = String(body.storeId || '')
  const tanggal = String(body.tanggal || '')
  const debet = Number(body.debet) || 0
  const kredit = Number(body.kredit) || 0

  if (!storeId) throw createError({ statusCode: 400, statusMessage: 'storeId wajib diisi.' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw createError({ statusCode: 400, statusMessage: 'tanggal harus format YYYY-MM-DD.' })

  await assertNotLocked(tanggal)

  const where = and(eq(mpEntries.storeId, storeId), eq(mpEntries.tanggal, tanggal))
  const [existing] = await db.select().from(mpEntries).where(where).limit(1)

  if (!debet && !kredit) {
    if (existing) await db.delete(mpEntries).where(where)
    return { storeId, tanggal, debet: 0, kredit: 0, deleted: true }
  }

  if (existing) {
    await db.update(mpEntries).set({ debet, kredit }).where(where)
    return { ...existing, debet, kredit }
  }

  const row = { id: genId('mpe'), storeId, tanggal, debet, kredit }
  await db.insert(mpEntries).values(row)
  return row
})

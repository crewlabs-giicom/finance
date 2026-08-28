import { eq } from 'drizzle-orm'
import { mpEntries, mpStores } from '../../../database/schema'

/**
 * Hapus toko MP sekaligus seluruh mutasi harian (mp_entries) yang nempel — mp_entries.store_id
 * gak di-cascade di skema, jadi kalau lewat crud generik (cuma hapus baris mpStores) bakal
 * kena foreign key constraint dan gagal tanpa keterangan yang jelas ke user.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await db.delete(mpEntries).where(eq(mpEntries.storeId, id))
  await db.delete(mpStores).where(eq(mpStores.id, id))
  return { ok: true }
})

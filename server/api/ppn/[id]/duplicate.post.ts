import { eq } from 'drizzle-orm'
import { ppnRows } from '../../../database/schema'
import { ppnUrutanAfter } from '../../../utils/ppnOrder'

/**
 * Duplicate List Pajak / List PM — satu tabel yang sama (lihat tagSync.ts). Baris baru
 * disisipin PERSIS di bawah baris sumber lewat ppnUrutanAfter(), bukan nongol di ujung
 * paling bawah kayak kalau cuma POST /api/ppn biasa (urutan-nya selalu paling besar).
 * Body opsional `{ overrides: {...} }` buat nimpa field tertentu hasil copy — dipakai
 * List PM supaya hasil duplicate-nya gak ikut kebawa tag pajak lain dari baris campuran.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event) || {}
  const [src] = await db.select().from(ppnRows).where(eq(ppnRows.id, id)).limit(1)
  if (!src) throw createError({ statusCode: 404, statusMessage: 'Baris gak ketemu.' })
  await assertNotLocked(src.tanggal)

  const overrides = body.overrides && typeof body.overrides === 'object' ? body.overrides : {}
  const { id: _old, sourceTxnId: _s, urutan: srcUrutan, ...rest } = src
  const newUrutan = await ppnUrutanAfter(srcUrutan ?? 0)
  const newId = genId('ppn')
  await db.insert(ppnRows).values({ ...rest, ...overrides, id: newId, sourceTxnId: null, urutan: newUrutan })
  const [created] = await db.select().from(ppnRows).where(eq(ppnRows.id, newId)).limit(1)
  return created
})

import { eq } from 'drizzle-orm'
import { cekUmpRows } from '../../database/schema'

/** Batalkan satu grup match -- set matchNo=null buat semua baris yang share nomor itu. */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {}
  const matchNo = Number(body.matchNo)
  if (!matchNo || Number.isNaN(matchNo)) throw createError({ statusCode: 400, statusMessage: 'matchNo wajib diisi.' })

  const rows = await db.select().from(cekUmpRows).where(eq(cekUmpRows.matchNo, matchNo))
  if (!rows.length) return { ok: true, count: 0 }
  for (const r of rows) await assertNotLocked(r.tanggal)

  await db.update(cekUmpRows).set({ matchNo: null }).where(eq(cekUmpRows.matchNo, matchNo))
  return { ok: true, count: rows.length }
})

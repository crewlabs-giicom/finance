import { inArray, sql } from 'drizzle-orm'
import { cekUmpRows } from '../../database/schema'

/** Toleransi floating point -- konsisten dengan server/api/avp/lawan/index.post.ts. */
const TOLERANCE = 0.5

/**
 * Tandai satu grup baris sebagai "match": total Debet baris yang dipilih harus
 * sama dengan total Kredit-nya (toleransi floating point), lalu semua baris itu
 * dapat nomor matchNo yang sama -- nomor baru, incremental global (MAX+1, mirror
 * nextPpnUrutan() di server/utils/ppnOrder.ts), jadi gak collision sama grup lain.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event) || {}
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String))] : []
  if (ids.length < 2) throw createError({ statusCode: 400, statusMessage: 'Pilih minimal 2 baris untuk di-match.' })

  const found = await db.select().from(cekUmpRows).where(inArray(cekUmpRows.id, ids))
  if (found.length !== ids.length) throw createError({ statusCode: 404, statusMessage: 'Sebagian baris yang dipilih gak ketemu.' })
  if (found.some(r => r.matchNo !== null)) {
    throw createError({ statusCode: 400, statusMessage: 'Sebagian baris yang dipilih sudah jadi anggota grup match lain. Batalkan dulu grup lamanya.' })
  }

  const totalDebet = found.reduce((a, r) => a + (r.debet || 0), 0)
  const totalKredit = found.reduce((a, r) => a + (r.kredit || 0), 0)
  if (Math.abs(totalDebet - totalKredit) > TOLERANCE) {
    throw createError({
      statusCode: 400,
      statusMessage: `Total Debet (Rp ${totalDebet.toLocaleString('id-ID')}) belum sama dengan total Kredit (Rp ${totalKredit.toLocaleString('id-ID')}).`
    })
  }

  for (const r of found) await assertNotLocked(r.tanggal)

  const [row] = await db.select({ max: sql<number>`coalesce(max(${cekUmpRows.matchNo}), 0)` }).from(cekUmpRows)
  const matchNo = (row?.max || 0) + 1
  await db.update(cekUmpRows).set({ matchNo }).where(inArray(cekUmpRows.id, ids))
  return { ok: true, matchNo, count: ids.length }
})

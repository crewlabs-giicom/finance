import { eq } from 'drizzle-orm'
import { cekUmpRows } from '../../database/schema'
import { crud } from '../../utils/tables'

/** Baris yang udah jadi anggota grup match gak boleh diotak-atik -- harus "Batalkan
 *  Match"-nya dulu (unmatch.post.ts) baru bisa diedit lagi. Pengecualian: field
 *  "keterangan" (catatan bebas, gak mempengaruhi validitas match) tetap boleh diedit
 *  walau baris udah matched -- realistisnya catatan review justru ditulis SETELAH
 *  baris itu di-match. `readBody` di-cache h3 per-request, jadi aman dibaca di sini
 *  lalu di-baca lagi oleh crud.cekUmp.patch tanpa perlu re-parse. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event) || {}
  const bodyKeys = Object.keys(body)
  const onlyKeterangan = bodyKeys.length > 0 && bodyKeys.every(k => k === 'keterangan')

  const [existing] = await db.select().from(cekUmpRows).where(eq(cekUmpRows.id, id)).limit(1)
  if (existing && existing.matchNo !== null && !onlyKeterangan) {
    throw createError({ statusCode: 400, statusMessage: 'Baris ini udah jadi anggota grup match -- gak bisa diubah (kecuali Keterangan). Batalkan match-nya dulu kalau emang perlu.' })
  }
  return crud.cekUmp.patch(event)
})

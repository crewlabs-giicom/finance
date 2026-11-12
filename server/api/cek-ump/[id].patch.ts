import { eq } from 'drizzle-orm'
import { cekUmpRows } from '../../database/schema'
import { crud } from '../../utils/tables'

/** Baris yang udah jadi anggota grup match gak boleh diotak-atik -- harus "Batalkan
 *  Match"-nya dulu (unmatch.post.ts) baru bisa diedit lagi. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const [existing] = await db.select().from(cekUmpRows).where(eq(cekUmpRows.id, id)).limit(1)
  if (existing && existing.matchNo !== null) {
    throw createError({ statusCode: 400, statusMessage: 'Baris ini udah jadi anggota grup match -- gak bisa diubah. Batalkan match-nya dulu kalau emang perlu.' })
  }
  return crud.cekUmp.patch(event)
})

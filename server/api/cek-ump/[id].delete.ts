import { eq } from 'drizzle-orm'
import { cekUmpRows } from '../../database/schema'
import { crud } from '../../utils/tables'

/** Baris yang udah jadi anggota grup match gak boleh dihapus -- harus "Batalkan
 *  Match"-nya dulu (unmatch.post.ts) baru bisa dihapus lagi. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const [existing] = await db.select().from(cekUmpRows).where(eq(cekUmpRows.id, id)).limit(1)
  if (existing && existing.matchNo !== null) {
    throw createError({ statusCode: 400, statusMessage: 'Baris ini udah jadi anggota grup match -- gak bisa dihapus. Batalkan match-nya dulu.' })
  }
  return crud.cekUmp.remove(event)
})

import { eq } from 'drizzle-orm'
import { pmKategoriMaster } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await db.delete(pmKategoriMaster).where(eq(pmKategoriMaster.id, id))
  return { ok: true }
})

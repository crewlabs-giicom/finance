import { eq } from 'drizzle-orm'
import { asetSimpleMaster } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await db.delete(asetSimpleMaster).where(eq(asetSimpleMaster.id, id))
  return { ok: true }
})

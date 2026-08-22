import { eq } from 'drizzle-orm'
import { tagMaster } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await db.delete(tagMaster).where(eq(tagMaster.id, id))
  return { ok: true }
})

import { eq } from 'drizzle-orm'
import { depositoRows } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await db.delete(depositoRows).where(eq(depositoRows.id, id))
  return { ok: true }
})

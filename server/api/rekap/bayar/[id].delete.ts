import { eq } from 'drizzle-orm'
import { bayarRows } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await db.delete(bayarRows).where(eq(bayarRows.id, id))
  return { ok: true }
})

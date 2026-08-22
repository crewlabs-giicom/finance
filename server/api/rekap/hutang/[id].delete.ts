import { eq } from 'drizzle-orm'
import { hutangRows } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await db.delete(hutangRows).where(eq(hutangRows.id, id))
  return { ok: true }
})

import { eq } from 'drizzle-orm'
import { bankGroups } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await db.delete(bankGroups).where(eq(bankGroups.id, id))
  return { ok: true }
})

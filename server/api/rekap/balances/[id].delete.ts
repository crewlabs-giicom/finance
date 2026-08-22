import { eq } from 'drizzle-orm'
import { bankBalances } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await db.delete(bankBalances).where(eq(bankBalances.id, id))
  return { ok: true }
})

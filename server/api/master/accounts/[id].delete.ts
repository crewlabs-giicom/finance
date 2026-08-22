import { eq } from 'drizzle-orm'
import { bankAccounts } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await db.delete(bankAccounts).where(eq(bankAccounts.id, id))
  return { ok: true }
})

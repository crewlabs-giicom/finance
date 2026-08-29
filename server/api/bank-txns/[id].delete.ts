import { eq } from 'drizzle-orm'
import { bankTxns } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const [row] = await db.select().from(bankTxns).where(eq(bankTxns.id, id)).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Transaksi gak ketemu.' })
  await assertNotLocked(row.tanggal)
  await detachDerivedRows(id)
  await db.delete(bankTxns).where(eq(bankTxns.id, id))
  await recomputeAccountSaldo(row.accountId)
  return { ok: true }
})

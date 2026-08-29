import { eq } from 'drizzle-orm'
import { bankTxns } from '../../../database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const [row] = await db.select().from(bankTxns).where(eq(bankTxns.id, id)).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Transaksi gak ketemu.' })
  await assertNotLocked(row.tanggal)

  const newId = genId('bt')
  const { id: _old, ...rest } = row
  const newUrutan = await urutanAfter(rest.accountId, rest.tanggal, rest.urutan ?? 0)
  await db.insert(bankTxns).values({ ...rest, id: newId, urutan: newUrutan })
  await syncTagDerivedRows(newId)
  const saldo = await recomputeAccountSaldo(rest.accountId)
  return { ...rest, id: newId, saldo: saldo ?? rest.saldo }
})

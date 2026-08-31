import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { bankTxns } from '../../database/schema'

/**
 * Rincian Bank cuma pernah nampilin data SATU rekening dalam satu rentang
 * tanggal sekaligus (baris ditampilin nihil kalau belum pilih rekening) —
 * jadi endpoint ini di-scope ke situ, bukan balikin seluruh tabel kayak
 * dulu. Tanpa accountId balikin array kosong (bukan error) biar pemanggil
 * yang belum kirim filter gak nge-crash, tapi juga gak dapet data.
 */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const accountId = q.accountId ? String(q.accountId) : ''
  if (!accountId) return []

  const conditions = [eq(bankTxns.accountId, accountId)]
  if (q.from) conditions.push(gte(bankTxns.tanggal, String(q.from)))
  if (q.to) conditions.push(lte(bankTxns.tanggal, String(q.to)))

  return await db.select().from(bankTxns)
    .where(and(...conditions))
    .orderBy(asc(bankTxns.tanggal), asc(bankTxns.urutan))
})

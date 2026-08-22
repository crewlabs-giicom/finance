import { asc, eq } from 'drizzle-orm'
import { bankAccounts, bankTxns } from '../database/schema'

/**
 * Hitung ulang kolom saldo berjalan satu rekening, diport dari
 * recomputeAccountSaldo() di app HTML lama.
 *
 * Baseline diambil dari bank_accounts.saldo_awal. Kalau masih null, dipakai
 * nilai "Saldo Awal" dari file CSV; kalau itu pun tidak ada, diturunkan dari
 * transaksi tertua yang saldonya sudah terpercaya (misal hasil import BRI).
 */
export async function recomputeAccountSaldo(accountId: string, csvSaldoAwal?: number | null) {
  const [acc] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).limit(1)
  if (!acc) return

  const txns = await db.select().from(bankTxns)
    .where(eq(bankTxns.accountId, accountId))
    .orderBy(asc(bankTxns.tanggal), asc(bankTxns.id))

  let baseline = acc.saldoAwal
  if (baseline === null || baseline === undefined) {
    if (csvSaldoAwal !== null && csvSaldoAwal !== undefined) {
      baseline = csvSaldoAwal
    } else if (txns.length && typeof txns[0]!.saldo === 'number' && txns[0]!.saldo !== 0) {
      baseline = txns[0]!.saldo - ((txns[0]!.kredit || 0) - (txns[0]!.debet || 0))
    } else {
      baseline = 0
    }
    await db.update(bankAccounts).set({ saldoAwal: baseline }).where(eq(bankAccounts.id, accountId))
  }

  let cum = baseline
  for (const t of txns) {
    cum += (t.kredit || 0) - (t.debet || 0)
    if (t.saldo !== cum) {
      await db.update(bankTxns).set({ saldo: cum }).where(eq(bankTxns.id, t.id))
    }
  }
  return cum
}

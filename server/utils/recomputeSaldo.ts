import { and, asc, desc, eq, gte, lt } from 'drizzle-orm'
import { bankAccounts, bankTxns } from '../database/schema'

/**
 * Hitung ulang kolom saldo berjalan satu rekening, diport dari
 * recomputeAccountSaldo() di app HTML lama.
 *
 * Baseline diambil dari bank_accounts.saldo_awal. Kalau masih null, dipakai
 * nilai "Saldo Awal" dari file CSV; kalau itu pun tidak ada, diturunkan dari
 * transaksi tertua yang saldonya sudah terpercaya (misal hasil import BRI).
 *
 * Kalau `fromTanggal` dikasih, recompute di-scope: cari transaksi terakhir
 * SEBELUM tanggal itu sebagai anchor (saldo-nya dipakai sebagai baseline),
 * lalu cuma baca+tulis ulang transaksi mulai dari tanggal itu ke depan —
 * saldo sebelum titik itu gak pernah berubah jadi gak perlu diitung ulang.
 * Kalau gak ada anchor (titik perubahan ada di transaksi paling awal
 * rekening), fallback ke recompute penuh dari awal seperti biasa.
 */
export async function recomputeAccountSaldo(accountId: string, csvSaldoAwal?: number | null, fromTanggal?: string) {
  const [acc] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).limit(1)
  if (!acc) return

  let baseline = acc.saldoAwal
  let scoped = false

  if (fromTanggal && baseline !== null && baseline !== undefined) {
    const [anchor] = await db.select().from(bankTxns)
      .where(and(eq(bankTxns.accountId, accountId), lt(bankTxns.tanggal, fromTanggal)))
      .orderBy(desc(bankTxns.tanggal), desc(bankTxns.urutan))
      .limit(1)
    if (anchor && typeof anchor.saldo === 'number') {
      baseline = anchor.saldo
      scoped = true
    }
  }

  const txns = await db.select().from(bankTxns)
    .where(scoped
      ? and(eq(bankTxns.accountId, accountId), gte(bankTxns.tanggal, fromTanggal!))
      : eq(bankTxns.accountId, accountId))
    .orderBy(asc(bankTxns.tanggal), asc(bankTxns.urutan))

  if (!scoped) {
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
  }

  let cum = baseline as number
  const changes: { id: string, saldo: number }[] = []
  for (const t of txns) {
    cum += (t.kredit || 0) - (t.debet || 0)
    if (t.saldo !== cum) changes.push({ id: t.id, saldo: cum })
  }

  if (changes.length) {
    db.transaction((tx) => {
      for (const c of changes) {
        tx.update(bankTxns).set({ saldo: c.saldo }).where(eq(bankTxns.id, c.id)).run()
      }
    })
  }

  return cum
}

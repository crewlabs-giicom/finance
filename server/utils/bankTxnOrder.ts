import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { bankTxns } from '../database/schema'

/** Urutan buat baris BARU (manual add / import CSV) — selalu paling besar
 *  se-tabel, jadi nongol di paling bawah grup tanggalnya (perilaku sekarang). */
export async function nextUrutan(): Promise<number> {
  const [row] = await db.select({ max: sql<number>`coalesce(max(${bankTxns.urutan}), 0)` }).from(bankTxns)
  return (row?.max || 0) + 1
}

/** Urutan buat hasil Duplicate — disisipin PERSIS di bawah baris sumber:
 *  cari baris berikutnya (tanggal sama, urutan lebih besar dari sumber),
 *  ambil titik tengah; kalau sumbernya udah paling akhir di tanggal itu, +1 aja. */
export async function urutanAfter(accountId: string, tanggal: string, sourceUrutan: number): Promise<number> {
  const [next] = await db.select().from(bankTxns)
    .where(and(eq(bankTxns.accountId, accountId), eq(bankTxns.tanggal, tanggal), gt(bankTxns.urutan, sourceUrutan)))
    .orderBy(asc(bankTxns.urutan))
    .limit(1)
  return next?.urutan != null ? (sourceUrutan + next.urutan) / 2 : sourceUrutan + 1
}
